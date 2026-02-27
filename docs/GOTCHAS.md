# ORA-FM Gotchas

A running log of non-obvious issues encountered while building with SuperSonic / scsynth-WASM. Each entry explains the symptom, root cause, and fix so we don't hit the same wall twice.

---

## 1. Group 1 Does Not Exist by Default

**Symptom:** `/s_new` fails silently — no sound, and the debug console shows `Group 1 not found`.

**Root cause:** In desktop SuperCollider (sclang), the language layer automatically creates a "default group" (Group 1) inside the root node (Node 0) at boot. SuperSonic is just the scsynth engine — there is no sclang, so Group 1 is never created automatically. Any `/s_new` call targeting group 1 (the 4th argument) will fail because the group doesn't exist.

**Fix:** Explicitly create Group 1 immediately after `init()` + `resume()`:

```javascript
await sonic.init();
await sonic.resume();
sonic.send('/g_new', 1, 0, 0); // group 1, add-to-head of root node 0
```

Every page or component that boots its own SuperSonic instance needs this. We hit this twice — once in `engine.js` and again in the test lab's standalone boot sequence.

**Reference:** `src/audio/engine.js:479-481`, commit `546371b`, fix `f85f07a`

---

## 2. Silent Audio — AudioContext Suspended by Default

**Symptom:** SuperSonic initializes successfully, SynthDefs load, `/s_new` returns no errors, but there is zero audio output.

**Root cause:** All modern browsers suspend the `AudioContext` on creation due to autoplay policy. `sonic.init()` creates the AudioContext and loads the WASM engine, but it does **not** resume the context. The AudioWorklet's `process()` method never fires while the context is in the `"suspended"` state.

**Fix:** Call `sonic.resume()` after `sonic.init()`, and ensure this happens within a user gesture context (click handler, etc.):

```javascript
startButton.addEventListener('click', async () => {
  await sonic.init();
  await sonic.resume(); // Must be inside a user gesture
});
```

If `resume()` is called outside a user gesture, the browser may silently ignore it.

**Reference:** commit `c89d52b`

---

## 3. CORS Errors When Loading SuperSonic from CDN

**Symptom:** Console errors like `Cross-Origin Request Blocked` or `SharedArrayBuffer is not defined` when loading SuperSonic WASM/workers from unpkg or another CDN.

**Root cause:** SuperSonic's SAB (SharedArrayBuffer) communication mode requires two HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

When these headers are set, the browser enforces strict cross-origin isolation — all subresources must either be same-origin or explicitly opt in via `Cross-Origin-Resource-Policy: cross-origin`. CDN resources typically don't set this header.

**Fix:** Serve SuperSonic assets locally from the same origin. We copied `supersonic-scsynth-core`, `-synthdefs`, and `-samples` into `public/supersonic/` so Vite serves them directly:

```javascript
// vite.config.js — custom plugin to set required headers
{
  name: 'cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use((_, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
}
```

For production, your hosting platform must also set these headers. Without them, SharedArrayBuffer is unavailable and SuperSonic falls back to the slower postMessage mode (or fails entirely depending on the build).

**Reference:** `vite.config.js`, commit `1f47dba`

---

## 4. SynthDef Load Failures Are Silent (No Exception)

**Symptom:** You call `loadSynthDef('my-synth')` and it appears to succeed, but `/s_new` with that name produces no sound.

**Root cause:** If a SynthDef references an unsupported UGen (e.g., `MouseX`, `DiskIn`), the load fails but SuperSonic sends a `/fail` OSC message rather than throwing a JavaScript exception. Unless you're listening for `/fail` messages or watching the debug output, you won't notice.

**Fix:** Always check the debug console output when a new SynthDef doesn't produce sound. The error message will be specific: `"UGen 'MouseX' not installed."`. For programmatic detection, listen for the `/fail` message:

```javascript
sonic.on('message', (msg) => {
  if (msg[0] === '/fail') {
    console.error('SuperSonic failure:', msg);
  }
});
```

**Reference:** `docs/SUPERSONIC_TECHNICAL_REFERENCE.md` — Behavioral Differences section

---

## 5. Node IDs Must Be Managed Manually

**Symptom:** Creating a second synth with the same node ID silently replaces the first, or `/n_free` frees the wrong synth.

**Root cause:** In desktop SuperCollider, sclang's `Server` class maintains a node ID allocator that auto-increments. SuperSonic has no such layer — you're talking raw OSC, so you must manage node IDs yourself.

**Fix:** Use a simple counter:

```javascript
let nextNodeId = 1000;
function newNodeId() { return nextNodeId++; }

sonic.send('/s_new', 'beep', newNodeId(), 0, 1);
```

Start at 1000+ to avoid colliding with group IDs (we use 1, 2, etc. for groups). If you need to free or control a specific synth later, store its ID when you create it.

**Reference:** `src/audio/engine.js:114`

---

## 6. "/n_set Node not found" After Synth Finishes Playing

**Symptom:** Playing a synth in the Synth Explorer works (you hear sound), but the console shows errors like:

```
[← OSC] /fail "/n_set", "Node 2019 not found"
FAILURE IN SERVER /n_set Node 2019 not found
```

**Root cause:** Sonic Pi SynthDefs use `doneAction: 2`, which tells scsynth to automatically free the synth node when its envelope completes. If the envelope duration (attack + sustain + release) is shorter than the `setTimeout` delay used to send `/n_set gate 0`, the node has already been freed by the time the release message arrives. scsynth responds with a `/fail` because the node no longer exists.

**Fix:** Track active nodes using `/n_end` messages from scsynth, and skip sending `/n_set` to nodes that have already freed themselves:

```javascript
const activeNodesRef = useRef(new Set());

sonic.on('message', (msg) => {
  if (msg[0] === '/n_go') activeNodesRef.current.add(msg[1]);
  if (msg[0] === '/n_end') activeNodesRef.current.delete(msg[1]);
});

// In the release timeout:
setTimeout(() => {
  if (!activeNodesRef.current.has(id)) return; // already freed
  sonic.send('/n_set', id, 'gate', 0);
}, durationMs);
```

**Reference:** `src/TestPage.jsx:71` (activeNodesRef), `src/TestPage.jsx:208-215` (guarded release)

---

## 7. Audio-Rate Modulation Requires Correct Node Ordering

**Symptom:** Connecting one Sine Osc to another's frequency input for FM synthesis produces no modulation effect, or produces clicks/glitches.

**Root cause:** In scsynth, nodes within a group execute in order from head to tail. For FM synthesis to work, the modulator must write its output to an audio bus **before** the carrier reads from it in the same audio cycle. If the carrier executes first, it reads stale or zero-filled buffer data.

When using `addAction=0` (addToHead) with `/s_new`, each new synth is inserted at the head of the group. If you create the modulator first, then the carrier, the carrier ends up at the head and executes first — the wrong order.

**Fix:** Create synths in reverse dependency order: carriers first, then modulators. This way modulators end up at the head and execute before their carriers.

```javascript
// Sort sources: carriers first (toward tail), modulators last (toward head)
const sources = [...sourceCarriers, ...sourceModulators];

for (const id of sources) {
  engine.play(id, synthDef, params);  // uses addToHead
}
// Result: modulators at head, carriers at tail → correct execution order
```

Additionally, use `/n_mapa` (not `/n_map`) to map parameters to audio buses:

```javascript
// Map synth param to read from audio bus (audio-rate)
sonic.send('/n_mapa', nodeId, 'freq_mod', audioBusIndex);

// vs. control bus mapping (control-rate)
sonic.send('/n_map', nodeId, 'freq', controlBusIndex);
```

**Reference:** `src/GridView.jsx:640-660` (source ordering), `src/audio/gridEngine.js:207-212` (`mapParamToAudioBus`), `synthdefs/src/sine.scd` (audio-rate mod inputs)

---

## 8. Audio-Rate Modulation Produces Inaudible Results (Imperceptible FM/AM/PM)

**Symptom:** Connecting one Sine Osc to modulate another's frequency (or amp / phase) produces no perceptible change in the carrier's sound. The output sounds like a plain unmodulated sine tone, even though the routing is correct and the modulator is playing.

**Root cause:** Two compounding issues:

1. **Amp range too small:** The modulator's `amp` parameter is capped at `[0, 1]` by the UI slider. In the SynthDef, the modulation signal is `SinOsc.ar(freq) * amp`, so maximum output oscillates between −1 and +1. When this signal reaches the carrier's `freq_mod` input, it adds at most ±1 Hz to the carrier frequency — completely imperceptible.

2. **Pan2 stereo attenuation:** The modulator's output goes through `Pan2.ar(sig, pan)`. With the default `pan=0` (center), each stereo channel receives only ~70.7% of the original amplitude (`cos(π/4) ≈ 0.707`). Since `/n_mapa` maps to a single audio bus index (the left channel), the effective modulation amplitude is further reduced to ~±0.7 Hz.

Combined, the maximum frequency deviation with default parameters is ≈±0.35 Hz (amp=0.5, Pan2 center). For comparison, audible FM synthesis typically requires ±100–1000 Hz deviation.

**Fix:** Two changes in the routing sync (`GridView.jsx`):

1. **Amp scaling:** When a source node is used as an audio-rate modulator, its `amp` parameter is multiplied by a per-target-parameter scale factor before being sent to scsynth. The UI slider stays in `[0, 1]` but the synth receives the scaled value:

```javascript
const MOD_DEPTH_SCALES = {
  freq:  400,    // amp 0.5 → ±200 Hz frequency deviation
  amp:   1,      // amp 0.5 → ±0.5 amplitude modulation
  phase: 6.283,  // amp 0.5 → ±π radians phase modulation
};
```

2. **Hard-left pan:** Modulators are panned to `pan=-1`, which puts the full signal into the left audio channel (the one `/n_mapa` reads). This eliminates the ~30% Pan2 equal-power attenuation.

The same scaling is applied in `handleParamChange` (via `modAmpScaleRef`) so that slider changes are consistent with the routing sync.

**Reference:** `src/GridView.jsx` — `MOD_DEPTH_SCALES` constant, routing sync steps 3 and 7, `handleParamChange`

---

## 9. Clicking/Popping When Dragging Envelope Breakpoints Connected to Amp

**Symptom:** With an envelope module connected to a synth's `amp` input via control-rate modulation, dragging breakpoints in the envelope editor produces intermittent clicking or popping sounds.

**Root cause:** Dragging a breakpoint updates the `nodes` React state (via `handleBreakpointsChange`), which triggers the audio routing sync `useEffect`. The sync loop unconditionally calls `/n_set` on each synth's `amp` parameter (line ~1219), but in scsynth, calling `/n_set` on a parameter that is currently **mapped to a control bus** (via `/n_map`) **breaks the mapping**. The synth's amp momentarily snaps from the envelope's current value to the raw UI slider value, then a few lines later the modulation section re-maps it via `/n_map`. This brief discontinuity (envelope value → slider value → envelope value) happens within a single audio block and produces an audible click.

**Fix:** Pre-compute which `nodeId:param` pairs are control-bus-mapped before the play/update loop, and skip `/n_set` for those params. The control bus value is already being written by the modulation section, so the `/n_set` was redundant (and harmful). When a mod cable is disconnected, the existing unmap logic (step 10) correctly restores the base value.

```javascript
// Pre-compute control-rate modulated params
const controlMappedParams = new Set();
for (const conn of connections) {
  if (!conn.toParam || conn.isAudioRate) continue;
  const sourceSchema = NODE_SCHEMA[nodes[conn.fromNodeId]?.type];
  if (sourceSchema?.category === 'control' || sourceSchema?.category === 'script') {
    controlMappedParams.add(`${conn.toNodeId}:${conn.toParam}`);
  }
}

// In the update loop, guard /n_set:
if (!controlMappedParams.has(`${id}:amp`)) {
  engine.setParam(id, 'amp', ampToSend);
}
```

As defense-in-depth, a 5 ms `Lag.kr` was also added to the sine oscillator's `amp` parameter in `synthdefs/src/sine.scd` (requires synthdef rebuild via `npm run build:synthdefs`).

**Reference:** `src/GridView.jsx` — routing sync steps 4b, 7, and 8; `synthdefs/src/sine.scd:36`

---

## 10. Scope Jitter When Polling Faster Than the Buffer Fill Time

**Symptom:** The oscilloscope waveform jitters wildly and shows double/ghost traces in CRT mode, even for a pure steady-state sine wave that should display as a stable curve.

**Root cause:** The scope synthdef (`ora_scope`) uses `BufWr` + `Phasor` to continuously write audio into a circular buffer of 1024 frames. At 44 100 Hz, the Phasor takes ~23.2 ms to overwrite the entire buffer. If the UI polls (`/b_getn`) faster than that (e.g., every 16 ms / 60 Hz), each read captures a buffer that is only partially overwritten — the first N samples are from the current pass and the remaining samples are stale from the previous pass. This "seam" causes:

1. **Trigger instability** — the zero-crossing search finds different positions each frame.
2. **Auto-scale bounce** — `yMin`/`yMax` shift because the stale and fresh segments have different envelopes.
3. **Persistence ghost traces** — the CRT phosphor trail shows the waveform at its old shifted position alongside the current one.

**Fix:** Set the polling interval to at least the buffer fill time. For a 1024-frame buffer at 44 100 Hz, 33 ms (≈30 Hz) guarantees the Phasor has fully overwritten the buffer between reads:

```javascript
// gridEngine.js — scope polling interval
this._scopePollingInterval = setInterval(() => {
  // ...
}, 33); // ~30 Hz — must be >= 1024/44100 ≈ 23 ms
```

If you increase `SCOPE_BUF_FRAMES`, increase the polling interval proportionally.

## 11. Scope Display Freezes When Input Cable Is Disconnected

**Symptom:** Disconnecting a cable from the scope's input leaves the waveform frozen on screen indefinitely instead of clearing. In CRT mode, the persistence trail never decays; in modern mode, the stale waveform line stays visible.

**Root cause:** When the cable is removed, `rebuildGraph` correctly stops the scope synth and polling (via `stopScope`), but it did not clear the buffer data in `scopeBuffersRef`. The `ScopeCanvas` render loop checked `hasSignal = buf && buf.length >= SCOPE_DISPLAY_SAMPLES`, and since the stale `Float32Array` was still in the map, `hasSignal` remained true. The renderer kept building line geometry from the old data and drawing it every frame — in classic mode, the persistence FBO never decayed because fresh waveform was re-drawn on each frame.

**Fix:** Clear `scopeBuffersRef.current.delete(nid)` in Step 5 of `rebuildGraph` (when the scope drops out of the `live` set) alongside the `stopScope()` call. Also clear in Step 6 (when FX routing changes force a scope restart) so the display resets during the restart window. Reset Y-axis smoothing state (`smoothYMin`, `smoothYMax`, `lastTrigIdx`) when `hasSignal` becomes false, so reconnection starts with fresh auto-scale bounds.

**Reference:** `src/GridView.jsx` — Steps 5 and 6 of `rebuildGraph`, plus the `ScopeCanvas` draw loop's `!hasSignal` reset block.

**Reference:** `src/audio/gridEngine.js:388-395`, `scripts/generate-scope-synthdef.cjs`

---

*Add new gotchas below this line. Include: symptom, root cause, fix, and a reference to relevant code or commits.*
