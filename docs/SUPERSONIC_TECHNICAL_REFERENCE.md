# SuperSonic vs SuperCollider: Technical Reference

*For intermediate-to-advanced SuperCollider users*

---

## What is SuperSonic?

SuperSonic is SuperCollider's `scsynth` audio synthesis server compiled to WebAssembly and running inside a browser's `AudioWorklet`. It was created by Sam Aaron (of Sonic Pi), with the WASM compilation work done by Hanns Holger Rutz. It wraps the same C++ DSP codebase that powers native scsynth, but operates under the constraints of a browser sandbox.

If you already know SuperCollider, the mental model is: **SuperSonic gives you scsynth, but replaces sclang with JavaScript.** There is no language interpreter, no class library, no pattern system. You talk directly to the server via OSC messages from JS, the same way Sonic Pi, Overtone, or any other scsynth client works over UDP — except the transport is a SharedArrayBuffer ring buffer instead of a network socket.

---

## Architecture: What Changed and Why

### Native SuperCollider Stack

```
sclang (language, patterns, routines, class library)
  │ OSC over UDP/TCP
  ▼
scsynth / supernova (synthesis server, multi-threaded)
  │ PortAudio / JACK / CoreAudio
  ▼
Hardware audio output
```

### SuperSonic Stack

```
JavaScript (your app code — scheduling, control logic, UI)
  │ OSC via postMessage or SharedArrayBuffer ring buffer
  ▼
AudioWorklet thread
  │ function calls into WASM
  ▼
scsynth-nrt.wasm (synthesis engine, single-threaded)
  │ 128-sample blocks written to AudioWorklet output
  ▼
Web Audio API → hardware audio output
```

### The scsynth-nrt Adaptation

SuperSonic uses `scsynth-nrt` (the non-realtime renderer) repurposed for real-time use. In native SuperCollider, `scsynth-nrt` processes an entire score to a file. In SuperSonic, it has been modified to process exactly one audio block (128 samples by default) per call from the AudioWorklet's `process()` method. The AudioWorklet calls into the WASM binary at audio rate, feeding it queued OSC messages and pulling back rendered audio samples.

This is not a port of the real-time `scsynth` server because the real-time server's architecture depends on OS threading primitives, network sockets, and dynamic memory allocation — none of which are available inside an AudioWorklet.

---

## Communication Layer

### Native: UDP/TCP Sockets

In desktop SC, sclang sends OSC packets to scsynth over UDP (default port 57110) or TCP. Messages are timestamped with NTP for sample-accurate scheduling.

### SuperSonic: Ring Buffers

SuperSonic supports two communication modes:

**postMessage mode** (default):
- OSC messages are serialized and sent via the `postMessage` API from the main thread to the AudioWorklet
- Works everywhere, including CDN-hosted pages with no special server headers
- Higher latency due to message copying and event loop scheduling

**SharedArrayBuffer (SAB) mode**:
- OSC messages are written into a lock-free ring buffer backed by `SharedArrayBuffer`
- The AudioWorklet reads from the ring buffer on each `process()` call
- Lower latency, but requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers
- Architecture: Main thread → `IN_BUFFER` (SharedArrayBuffer) → AudioWorklet reads → scsynth WASM processes → replies written to `OUT_BUFFER` → Main thread reads

Both modes preserve OSC message structure. An NTP-based pre-scheduler worker (`osc_out_prescheduler_worker.js`) handles timestamp-based scheduling for sample-accurate timing.

### Worker Architecture

| Worker | Role |
|--------|------|
| `scsynth_audio_worklet.js` | AudioWorklet processor — drives WASM at audio rate |
| `osc_out_prescheduler_worker.js` | NTP-aligned OSC message pre-scheduling |
| `osc_in_worker.js` | Monitors incoming OSC replies from scsynth |
| `osc_out_log_sab_worker.js` | OSC message logging (debug) |
| `debug_worker.js` | Debug message forwarding |

---

## Threading Model

### Native scsynth
- Multi-threaded: audio thread, NRT thread, disk I/O thread, network listener thread
- `supernova` adds parallel DSP processing across CPU cores
- Dynamic memory allocation with real-time-safe allocators

### SuperSonic
- **Single-threaded DSP**: the AudioWorklet runs on one thread; there is no parallel UGen processing
- **No `malloc` in the audio thread**: the WASM heap is pre-allocated at initialization; all buffers, node pools, and UGen memory come from this fixed heap
- **No disk I/O thread**: file operations are impossible inside AudioWorklet; samples must be pre-loaded
- **No network thread**: no UDP/TCP; communication is via ring buffer or postMessage

The practical impact: CPU-heavy patches that would run fine with supernova's parallel groups will bottleneck on a single AudioWorklet thread. Profile with the browser's Performance tab — if `process()` takes longer than the block duration (~2.9ms at 44100Hz/128 samples), you'll get dropouts.

---

## Memory Model

Native scsynth dynamically allocates memory for SynthDefs, nodes, buffers, and UGen state. SuperSonic pre-allocates a fixed WASM heap at boot. The `getInfo()` method reports `totalMemory` — typically 32–64MB. All server state must fit within this heap.

If you allocate many large buffers or run hundreds of simultaneous nodes, you can exhaust the heap. There is no dynamic growth; the allocation is fixed at initialization.

---

## OSC Command Compatibility

### Fully Supported

All core server commands work identically:

**Synth lifecycle**: `/s_new`, `/s_get`, `/s_getn`, `/s_noid`

**Node control**: `/n_free`, `/n_run`, `/n_set`, `/n_setn`, `/n_fill`, `/n_map`, `/n_mapn`, `/n_mapa`, `/n_mapan`, `/n_before`, `/n_after`, `/n_query`, `/n_trace`, `/n_order`

**Groups**: `/g_new`, `/p_new`, `/g_head`, `/g_tail`, `/g_freeAll`, `/g_deepFree`, `/g_dumpTree`, `/g_queryTree`

**Buffers**: `/b_alloc`, `/b_free`, `/b_zero`, `/b_set`, `/b_setn`, `/b_fill`, `/b_gen`, `/b_query`, `/b_get`, `/b_getn`

**Control buses**: `/c_set`, `/c_setn`, `/c_fill`, `/c_get`, `/c_getn`

**SynthDefs**: `/d_recv`, `/d_free`

**Server**: `/notify`, `/status`, `/dumpOSC`, `/sync`, `/version`

### Unsupported Commands (and workarounds)

| Command | Why | Workaround |
|---------|-----|-----------|
| `/d_load`, `/d_loadDir` | No filesystem | Use `loadSynthDef()` (fetches over HTTP, sends via `/d_recv`) |
| `/b_read`, `/b_readChannel` | No filesystem | Use `loadSample()` or `/b_allocFile` |
| `/b_allocRead`, `/b_allocReadChannel` | No filesystem | Use `loadSample()` or `/b_allocFile` |
| `/b_write`, `/b_close` | No filesystem | Not available; use `b_get`/`b_getn` to read data back to JS |
| `/b_setSampleRate` | Web Audio resamples automatically | Not needed |
| `/clearSched` | Internal scheduling differs | Use `cancelAll()` |
| `/quit` | Lifecycle managed by JS | Use `destroy()` |

### SuperSonic Extensions

| Command | Description |
|---------|-------------|
| `/b_allocFile` | Load audio from inline binary data (FLAC, WAV, OGG, MP3). SuperSonic-only — does not exist in native scsynth. |

---

## UGen Compatibility

### What Works

The vast majority of scsynth's UGen library is compiled into the WASM binary:

- **Oscillators**: `SinOsc`, `Saw`, `Pulse`, `LFSaw`, `LFPulse`, `LFTri`, `LFNoise0/1/2`, `Blip`, `Formant`, `VOsc`, `VOsc3`, etc.
- **Filters**: `LPF`, `HPF`, `BPF`, `BRF`, `RLPF`, `RHPF`, `Moog`, `MoogFF`, `Resonz`, `Ringz`, `Median`, `Lag`, `Slew`, `OnePole`, `TwoPole`, `Decay`, `Decay2`, `LeakDC`, etc.
- **Envelopes**: `EnvGen`, `Linen`, `Line`, `XLine`
- **Delays**: `DelayN`, `DelayL`, `DelayC`, `CombN`, `CombL`, `CombC`, `AllpassN`, `AllpassL`, `AllpassC`, `BufDelayN`, `BufDelayL`, `BufDelayC`, `BufCombN`, `BufCombL`, `BufCombC`, `BufAllpassN`, `BufAllpassL`, `BufAllpassC`
- **Reverbs**: `FreeVerb`, `FreeVerb2`, `GVerb`
- **Spectral (FFT)**: `FFT`, `IFFT`, `PV_MagAbove`, `PV_MagBelow`, `PV_BrickWall`, `PV_MagFreeze`, `PV_BinScramble`, `PV_RandComb`, `PV_Diffuser`, `PV_MagSmear`, `PV_MagShift`, etc.
- **Noise**: `WhiteNoise`, `PinkNoise`, `BrownNoise`, `GrayNoise`, `ClipNoise`, `Dust`, `Dust2`, `Crackle`, `LFClipNoise`, `LFDClipNoise`, `LFDNoise0/1/3`, `Hasher`
- **Triggers**: `Trig`, `Trig1`, `TDelay`, `Latch`, `Gate`, `Schmidt`, `PulseCount`, `PulseDivider`, `SetResetFF`, `ToggleFF`, `TWindex`, `Timer`, `Sweep`, `SendTrig`, `SendReply`, `Poll`
- **Buffer**: `PlayBuf`, `RecordBuf`, `BufRd`, `BufWr`, `Phasor`, `BufFrames`, `BufDur`, `BufSampleRate`, `BufChannels`, `BufRateScale`
- **Demand**: `Demand`, `Duty`, `TDuty`, `Dseq`, `Dseries`, `Dgeom`, `Dwhite`, `Diwhite`, `Dbrown`, `Dibrown`, `Drand`, `Dxrand`, `Dshuf`, `Dwrand`, `Dswitch1`, `Donce`, `Dpoll`, `Dstutter`, `DemandEnvGen`
- **Math/Utils**: `BinaryOpUGen`, `UnaryOpUGen`, `MulAdd`, `Sum3`, `Sum4`, `Select`, `LinLin`, `LinExp`, `Clip`, `Fold`, `Wrap`, `InRange`, `InRect`, `A2K`, `K2A`, `T2K`, `T2A`, `DC`, `Silent`
- **I/O**: `In`, `Out`, `ReplaceOut`, `OffsetOut`, `XOut`, `InFeedback`, `LocalIn`, `LocalOut`, `SharedIn`, `SharedOut`
- **Pan**: `Pan2`, `Pan4`, `PanAz`, `Balance2`, `Rotate2`, `LinPan2`, `XFade2`, `BiPanB2`, `DecodeB2`, `PanB`, `PanB2`, `Splay`

### Unsupported UGens

| UGen Category | Examples | Reason |
|---------------|----------|--------|
| **Mouse/Keyboard** | `MouseX`, `MouseY`, `MouseButton`, `KeyState` | No DOM access from AudioWorklet |
| **Disk I/O** | `DiskIn`, `DiskOut`, `VDiskIn` | No filesystem access |
| **Ableton Link** | `LinkTempo`, `LinkPhase`, `LinkJump` | No network sockets |
| **Bela hardware** | `AnalogIn`, `AnalogOut`, `DigitalIn`, `DigitalOut`, `DigitalIO`, `MultiplexAnalogIn`, `BelaScopeOut` | No hardware GPIO |
| **ML/Analysis** | `BeatTrack`, `BeatTrack2`, `KeyTrack`, `Loudness`, `MFCC`, `Onsets`, `SpecFlatness`, `SpecPcile`, `SpecCentroid` | Not compiled into WASM binary |

**Workarounds for mouse/keyboard UGens**: Push JS event data to control buses via `/c_set`, then read them in synths with `In.kr(busNum)`.

---

## What sclang Features Don't Exist (and What Replaces Them)

This is the critical conceptual shift. SuperSonic gives you the DSP engine but none of the language layer. Everything that sclang provides must be reimplemented in JavaScript:

| sclang Feature | SuperSonic Equivalent |
|----------------|----------------------|
| `SynthDef(\name, { ... }).add` | Pre-compile to `.scsyndef`, load with `loadSynthDef()` |
| `Synth(\name, [\freq, 440])` | `sonic.send('/s_new', 'name', id, 0, 1, 'freq', 440)` |
| `synth.set(\freq, 880)` | `sonic.send('/n_set', id, 'freq', 880)` |
| `synth.free` | `sonic.send('/n_free', id)` |
| `Group.new` | `sonic.send('/g_new', id, 0, 0)` |
| `Buffer.alloc(s, 1024)` | `sonic.send('/b_alloc', bufNum, 1024, 1)` |
| `Buffer.read(s, path)` | `await sonic.loadSample('name')` |
| `Pbind`, `Pseq`, `Prand`, etc. | JS scheduling: `setTimeout`, `setInterval`, custom sequencers |
| `Routine { ... }` | `async function` or generator with `setTimeout` |
| `Task { ... }` | `setInterval` with state management |
| `TempoClock` | JS `performance.now()` with manual beat tracking |
| `Bus.control(s, 1)` | `sonic.send('/c_set', busIndex, value)` — you manage bus indices yourself |
| `Bus.audio(s, 2)` | Audio bus indices managed manually |
| `NodeProxy`, `Ndef` | Manual node/group lifecycle management |
| `ServerTree`, `ServerBoot` | `sonic.on('ready', callback)` |
| `OSCFunc`, `OSCdef` | `sonic.on('message', callback)` — filter by message address |
| `s.scope`, `s.meter` | Web Audio `AnalyserNode` or custom visualization |

---

## SynthDef Workflow

You cannot compile SynthDefs in the browser. The workflow is:

### 1. Compile on Desktop SuperCollider

```supercollider
// In SuperCollider IDE
SynthDef(\myPad, { |out=0, note=60, amp=0.3, gate=1,
                    attack=2, release=5, cutoff=80, res=0.1, pan=0|
    var freq = note.midicps;
    var sig = LFSaw.ar([freq, freq * 1.002]) + Pulse.ar(freq * 0.5, 0.3, 0.5);
    sig = RLPF.ar(sig, cutoff.midicps, res);
    sig = sig * EnvGen.kr(Env.asr(attack, 1, release), gate, doneAction: 2);
    Out.ar(out, Pan2.ar(sig.sum, pan, amp));
}).writeDefFile("/path/to/project/public/supersonic/synthdefs/");
```

### 2. Deploy to Static Assets

Place the resulting `.scsyndef` file in your web-accessible synth definitions directory.

### 3. Load at Runtime

```javascript
await sonic.loadSynthDef('myPad');  // HTTP fetch + /d_recv
await sonic.sync();
sonic.send('/s_new', 'myPad', 1000, 0, 1, 'note', 60, 'amp', 0.3);
```

### Alternative: Runtime Binary via `/d_recv`

If you can produce valid `.scsyndef` binary data in JavaScript (e.g., via the experimental `synthdefjs` library), you can send it directly:

```javascript
sonic.send('/d_recv', synthdefBytes);
```

---

## Connecting Synths: Buses, Groups, and Signal Flow

The full scsynth signal routing model works:

### Audio Bus Routing

```javascript
// Source synth outputs to audio bus 20
sonic.send('/s_new', 'mySynth', 100, 0, 1, 'out', 20, 'note', 60);

// FX synth reads from bus 20, outputs to bus 0 (hardware out)
sonic.send('/s_new', 'sonic-pi-fx_reverb', 101, 3, 100,
    'in_bus', 20, 'out_bus', 0, 'room', 0.8);
// addAction 3 = addAfter, so FX processes after source
```

### Control Bus Modulation

```javascript
// LFO synth writes to control bus 10
sonic.send('/s_new', 'lfoWriter', 200, 0, 1, 'out_bus', 10, 'freq', 0.2);

// Map a synth's cutoff parameter to read from bus 10
sonic.send('/n_map', 100, 'cutoff', 10);

// Or set control buses directly from JS
sonic.send('/c_set', 10, 72);  // set bus 10 to value 72
```

### Group Ordering for Effect Chains

```javascript
// Create groups: sources (group 1), then effects (group 2)
sonic.send('/g_new', 1, 0, 0);   // group 1 at head of root
sonic.send('/g_new', 2, 3, 1);   // group 2 after group 1

// All sources go in group 1, all effects in group 2
// scsynth processes group 1 first, then group 2
sonic.send('/s_new', 'source', 100, 0, 1);  // add to head of group 1
sonic.send('/s_new', 'effect', 200, 0, 2);  // add to head of group 2
```

---

## Buffer Operations

```javascript
// Allocate empty buffer: 44100 frames, 1 channel
sonic.send('/b_alloc', 0, 44100, 1);

// Generate a sine wavetable in buffer 0
sonic.send('/b_gen', 0, 'sine1', 7, 1, 0.5, 0.25);  // 7 = normalize + wavetable + clear

// Load an audio sample (SuperSonic high-level API)
await sonic.loadSample('my-sample');  // fetches from sampleBaseURL

// Load inline audio data (SuperSonic extension)
// Useful when you have audio data as an ArrayBuffer
sonic.send('/b_allocFile', bufNum, audioData);

// Query buffer info
sonic.send('/b_query', 0);
// Reply arrives via sonic.on('message', ...) as /b_info
```

---

## Performance Considerations

1. **Single DSP thread**: All UGen processing happens on one AudioWorklet thread. No supernova-style parallelism. Monitor `process()` duration.

2. **Block size**: Default 128 samples. At 44100 Hz, that's ~2.9ms per block. Your entire synth graph must compute within this window.

3. **Memory ceiling**: Fixed WASM heap. Allocating many large buffers or running hundreds of nodes can exhaust memory. Check `getInfo().totalMemory`.

4. **Latency**: SAB mode gives lower latency than postMessage mode. For tightest timing, enable SAB with appropriate CORS headers.

5. **Sample rate**: Determined by the browser's `AudioContext`, typically 44100 or 48000 Hz. You don't control it — it matches the user's audio hardware.

6. **No `/b_write`**: You cannot render audio to disk. For offline rendering, consider native scsynth-nrt.

---

## Quick Comparison Table

| Feature | Native scsynth | SuperSonic |
|---------|---------------|------------|
| DSP engine | Same C++ code | Same C++ code (WASM-compiled) |
| Threading | Multi-threaded | Single AudioWorklet thread |
| Communication | OSC over UDP/TCP | OSC over SharedArrayBuffer or postMessage |
| Language layer | sclang | JavaScript (you build your own) |
| SynthDef compilation | sclang at runtime | Pre-compiled `.scsyndef` files |
| Memory | Dynamic allocation | Fixed WASM heap |
| Audio I/O | PortAudio / JACK / CoreAudio | Web Audio API |
| File I/O | Full filesystem access | HTTP fetch only |
| Latency | ~1-5ms (driver-dependent) | ~5-20ms (browser-dependent) |
| Platform | macOS, Linux, Windows | Any modern browser |
| Installation | Requires install | Zero install (CDN or npm) |
| Parallel DSP | supernova | Not available |
| Pattern library | Pbind, Pseq, Prand, etc. | Build in JS |
| Sample loading | `Buffer.read` (filesystem) | `loadSample()` (HTTP fetch) |
| GUI | Qt-based IDE | Browser DOM / Canvas / WebGL |
