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

SuperSonic uses `scsynth-nrt` (the non-realtime renderer) repurposed for real-time use. The key line in `audio_processor.cpp`:

```cpp
options.mRealTime = false; // NRT mode - externally driven, no audio driver
```

In native SuperCollider, `scsynth-nrt` processes an entire score to a file offline. In SuperSonic, it has been modified to process exactly one audio block (128 samples by default) per call from the AudioWorklet's `process()` method. The AudioWorklet calls `process_audio(current_time, ...)` into the WASM binary at audio rate, feeding it queued OSC messages and pulling back rendered audio samples.

Why NRT mode instead of the real-time server?

- **No native audio driver**: scsynth cannot open PortAudio/JACK/CoreAudio inside WASM. NRT mode relinquishes control of the audio clock to the external caller (the AudioWorklet).
- **No `main()` entry point**: WASM modules in AudioWorklets cannot have a `main()`. NRT mode allows initialization via `init_memory(sample_rate)` and frame-by-frame stepping via `process_audio()`.
- **No thread spawning**: Real-time scsynth spawns its own audio threads. NRT mode avoids this entirely — critical since WASM/AudioWorklet cannot spawn threads.
- **No dynamic memory in audio path**: Real-time scsynth uses RT-safe allocators. NRT mode allows the WASM heap to be pre-allocated statically.

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
- Lock acquisition uses a two-phase mechanism: a brief CAS (Compare-And-Swap) spin to avoid kernel round-trips in uncontended cases, then `Atomics.wait()` for guaranteed acquisition when contended
- Main thread restriction: browsers prohibit `Atomics.wait()` on the main thread, so the main thread uses an optimistic single CAS attempt; if it fails, it routes through the prescheduler worker (tracked by `ringBufferDirectWriteFails` metric — not an error)
- Lower latency, but requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers
- Architecture: Main thread → `IN_BUFFER` (SharedArrayBuffer) → AudioWorklet reads → scsynth WASM processes → replies written to `OUT_BUFFER` → Main thread reads
- Hybrid deployment is possible: SAB for local core assets, CDN for samples/synthdefs

Both modes preserve OSC message structure. An NTP-based pre-scheduler worker (`osc_out_prescheduler_worker.js`) handles timestamp-based scheduling for sample-accurate timing.

### OSC Message Format in Ring Buffer

Messages are 16-byte aligned with validation headers:

```
struct alignas(4) Message {
    uint32_t magic;      // 0xDEADBEEF validation
    uint32_t length;     // Total message size including header
    uint32_t sequence;   // Sequence number for ordering
    uint32_t _padding;   // 16-byte alignment
    // ... OSC payload follows
};
```

The AudioWorklet reads a maximum of 32 OSC messages per audio frame. It validates magic numbers, detects sequence gaps (wraparound-safe), and drops corrupted messages. Padding markers (`0xBADDCAFE`) handle ring buffer wrap-around mid-message.

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

Native scsynth dynamically allocates memory for SynthDefs, nodes, buffers, and UGen state. SuperSonic enforces **zero runtime allocation** — no `malloc()` in the audio callback path. The WASM heap is pre-allocated at boot, and `getInfo().totalMemory` reports the total (typically 32–64MB).

### Shared Memory Layout (from `shared_memory.h`)

| Region | Size | Purpose |
|--------|------|---------|
| IN Ring Buffer | 768 KB | JS → scsynth OSC messages (sized for SynthDef blobs) |
| OUT Ring Buffer | 128 KB | scsynth → JS OSC replies |
| DEBUG Buffer | 64 KB | Diagnostic messages |
| Control Region | 48 bytes | Atomic pointers: `in_head`, `in_tail`, `out_head`, `out_tail`, `in_write_lock`, sequence counters, status flags |
| Metrics Region | 184 bytes | 46 performance counters (4 bytes each) |
| NTP Start Time | 8 bytes | NTP timestamp when AudioContext booted |
| Drift Offset | 4 bytes | Clock drift correction (atomic int32, milliseconds) |
| Node Tree Mirror | ~57 KB | Live synth hierarchy for `getTree()` |
| Audio Capture | ~375 KB | Test audio capture (48 kHz, stereo, 1 second) |

**Status flags** (bitfield): `STATUS_BUFFER_FULL` (bit 0), `STATUS_OVERRUN` (bit 1), `STATUS_WASM_ERROR` (bit 2), `STATUS_FRAGMENTED_MSG` (bit 3).

### Scheduler Pool

The AudioWorklet-side scheduler uses a fixed pool for sample-accurate bundle dispatch:
- **512 slots** of **1024 bytes** each (both configurable)
- Pool-based storage — never reallocated at runtime
- Index queue stores slot indices, not bundle copies
- If the pool is full, backpressure keeps messages in the ring buffer until a slot frees

### scsynth Configuration Defaults

| Option | Default | Description |
|--------|---------|-------------|
| `numBuffers` | 1024 | Audio buffer slots |
| `maxNodes` | 1024 | Maximum synth/group nodes |
| `maxGraphDefs` | 1024 | Maximum SynthDef definitions |
| `numAudioBusChannels` | 128 | Audio bus count |
| `numOutputBusChannels` | 2 | Output channels |
| `numControlBusChannels` | 4096 | Control bus count |
| `realTimeMemorySize` | 8192 | RT memory pool (KB) |

If you exhaust the heap (many large buffers, hundreds of nodes), there is no dynamic growth.

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

## NTP Time Synchronization

SuperSonic preserves scsynth's NTP-based sample-accurate scheduling. All OSC timestamps use NTP format (seconds since 1900-01-01):

```
ntpTime = (performance.timeOrigin + performance.now()) / 1000 + NTP_EPOCH_OFFSET
```

where `NTP_EPOCH_OFFSET = 2208988800`.

**Clock translation** at AudioContext boot:

```
ntpStartTime = currentNTP - audioContext.currentTime
currentNTP = audioContextTime + ntpStartTime + driftOffset
```

**Drift correction**: Hardware crystal clocks diverge at ~100 ppm (~0.1ms/second). Every 1000ms, the main thread compares expected vs actual AudioContext time, computes drift, and broadcasts a correction to the AudioWorklet via SAB or postMessage. The AudioWorklet applies this offset when converting OSC timestamps to sample positions.

**Timetag semantics**: Timetag `0` or `1` = execute immediately. All other values = NTP timestamp for sample-accurate scheduling.

**Pre-scheduler**: The `osc_out_prescheduler_worker.js` parks far-future bundles (>500ms ahead, configurable via `bypassLookaheadMs`) and dispatches them ~500ms before execution time, preventing the AudioWorklet's scheduler pool from filling with distant events.

---

## JavaScript API Reference

### Lifecycle

| Method | Returns | Description |
|--------|---------|-------------|
| `init()` | `Promise<void>` | Initialize engine (must be called from user gesture) |
| `resume()` | `Promise<boolean>` | Resume AudioContext |
| `suspend()` | `Promise<void>` | Pause AudioContext |
| `shutdown()` | `Promise<void>` | Halt engine, preserve listeners, allow reinit |
| `destroy()` | `Promise<void>` | Permanently destroy instance |
| `recover()` | `Promise<boolean>` | Smart recovery (tries resume, falls back to reload) |
| `reload()` | `Promise<boolean>` | Full reload, emits `setup` event |
| `reset()` | `Promise<void>` | Complete teardown and reinitialize |

### Messaging

| Method | Description |
|--------|-------------|
| `send(address, ...args)` | Send OSC message |
| `sendOSC(oscData, options?)` | Send pre-encoded OSC bytes |
| `sync(syncId?)` | Wait for server to process all queued commands |
| `purge()` | Flush pending OSC from both schedulers |
| `cancelAll()` | Cancel all prescheduler events |
| `cancelTag(runTag)` | Cancel events by tag |
| `cancelSession(sessionId)` | Cancel events by session |

### Asset Loading

| Method | Returns | Description |
|--------|---------|-------------|
| `loadSynthDef(source)` | `Promise<{name, size}>` | Load synthdef (name, path, ArrayBuffer, or Blob) |
| `loadSynthDefs(names)` | `Promise<Record<string, {success, error?}>>` | Load multiple in parallel |
| `loadSample(bufnum, source, startFrame?, numFrames?)` | `Promise<{bufnum, numFrames, numChannels, sampleRate}>` | Load sample into buffer |

### Monitoring

| Method | Returns | Description |
|--------|---------|-------------|
| `getMetrics()` | `SuperSonicMetrics` | Full metrics (70+ properties) |
| `getMetricsArray()` | `Uint32Array` | Zero-allocation raw metrics |
| `getTree()` | `Tree` | Hierarchical node tree |
| `getInfo()` | `SuperSonicInfo` | Engine config, capabilities, version |
| `getSnapshot()` | `Snapshot` | Combined metrics + tree |

### Events

| Event | Fires when... |
|-------|---------------|
| `setup` | Engine needs initialization (reload, first boot) |
| `ready` | Engine booted and ready (includes `capabilities`, `bootStats`) |
| `message` | OSC reply from scsynth (`/n_go`, `/n_end`, `/fail`, `/tr`, etc.) |
| `error` | Engine or communication error |
| `loading:start` / `loading:complete` | Asset fetch begins/completes |
| `audiocontext:statechange` | AudioContext state changed |
| `audiocontext:suspended` / `audiocontext:resumed` | Suspend/resume lifecycle |
| `shutdown` / `destroy` | Engine lifecycle events |

### Static Utilities

```javascript
SuperSonic.osc.encodeMessage(address, args?)   // Encode OSC message
SuperSonic.osc.encodeBundle(timeTag, packets)  // Encode OSC bundle
SuperSonic.osc.decode(data)                    // Decode OSC bytes
SuperSonic.osc.ntpNow()                        // Current NTP time
SuperSonic.osc.NTP_EPOCH_OFFSET                // 2208988800
SuperSonic.getMetricsSchema()                   // Schema with byte offsets
```

---

## SIMD Optimization

The WASM binary uses SIMD instructions when available for audio buffer operations:

```cpp
#ifdef __wasm_simd128__
v128_t vec = wasm_v128_load(src + i * 4);
wasm_v128_store(dst + i * 4, vec);
#endif
```

Falls back to `memcpy` when SIMD is not supported. Most modern browsers (Chrome 91+, Firefox 89+, Safari 16.4+) support WASM SIMD.

---

## Licensing

| Package | License |
|---------|---------|
| `supersonic-scsynth` (Client API) | MIT |
| `supersonic-scsynth-core` (WASM engine) | GPL-3.0-or-later |
| `supersonic-scsynth-synthdefs` (SynthDefs) | MIT |
| `supersonic-scsynth-samples` (Samples) | CC0 |

The WASM core carries GPL because it derives from SuperCollider's GPL-licensed C++ source. The JavaScript API wrapper is MIT.

---

## Performance Considerations

1. **Single DSP thread**: All UGen processing happens on one AudioWorklet thread. No supernova-style parallelism. Profile with the browser's Performance tab.

2. **Block budget**: Default 128 samples. At 44100 Hz, that's ~2.9ms per block. Your entire synth graph must compute within this window or you get dropouts. The `getMetrics()` method reports `scsynthProcessCount` and `scsynthMessagesDropped` for monitoring.

3. **Message throughput**: Maximum 32 OSC messages processed per audio frame. Bursts beyond this queue in the ring buffer.

4. **Memory ceiling**: Fixed WASM heap (check `getInfo().totalMemory`). 1024 buffer slots, 1024 max nodes, 1024 max SynthDefs by default — all configurable via `scsynthOptions`.

5. **Latency**: SAB mode gives lower latency than postMessage mode. For tightest timing, enable SAB with COOP/COEP headers.

6. **Sample rate**: Determined by the browser's `AudioContext`, typically 44100 or 48000 Hz. You don't control it — it matches the user's audio hardware. The rate is passed to scsynth via `init_memory(sample_rate)`.

7. **Late bundle detection**: Bundles processed after their scheduled NTP time are logged as "late" and tracked in metrics (capped at 10 seconds to prevent overflow). Rate-limited logging: first occurrence + every 100th.

8. **No `/b_write`**: You cannot render audio to disk. For offline rendering, use native scsynth-nrt.

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
