# SuperSonic in React Native: Feasibility Study

*February 2026*

---

## Executive Summary

Running SuperSonic (scsynth compiled to WASM in an AudioWorklet) directly in React Native is **not feasible** with the current ecosystem. SuperSonic requires three tightly coupled Web APIs — WebAssembly, AudioWorklet, and SharedArrayBuffer — none of which exist natively in React Native's JavaScript runtime.

Two practical paths forward exist: a **WebView shim** for rapid prototyping, and a **native scsynth C++ Turbo Module** for production-quality audio.

---

## Why SuperSonic Can't Run Directly

SuperSonic's architecture depends on a specific browser stack:

```
JavaScript (main thread)
  │ OSC via SharedArrayBuffer ring buffer
  ▼
AudioWorklet thread
  │ calls into WASM at audio rate
  ▼
scsynth-WASM (synthesis)
  │ writes PCM frames
  ▼
Web Audio API → speakers
```

React Native breaks this at every layer:

### 1. No WebAssembly Runtime

React Native uses Hermes or JavaScriptCore, neither of which ships WASM support on-device. Apple prohibits JIT compilation in third-party apps, which most WASM runtimes require.

Community workarounds exist but none solve the audio problem:

| Solution | Approach | Audio-Rate DSP? |
|---|---|---|
| **Polygen** (Callstack) | AOT: compiles WASM → C at build time | No — runs on JS thread, iOS only |
| **react-native-webassembly** | Wasm3 interpreter via C++ TurboModule | No — too slow for real-time DSP |
| **react-native-wasm** | WebView polyfill | No — WebView sandbox |

### 2. No AudioWorklet

React Native has no built-in Web Audio API. The **react-native-audio-api** library (Software Mansion) provides a Web Audio API-compatible interface with a `WorkletSourceNode` that runs JS on the audio thread. However, it does **not** implement the standard `AudioWorklet` API (`audioContext.audioWorklet.addModule()`, `AudioWorkletProcessor`, `registerProcessor()`), and its worklet callbacks cannot load or execute WASM binaries.

### 3. No SharedArrayBuffer

SharedArrayBuffer is a browser feature backed by `crossOriginIsolated` context. It does not exist in React Native's JS engines. SuperSonic uses it as the lock-free transport between the main thread and the AudioWorklet.

---

## Path A: WebView Shim (Fastest Prototype)

Bundle SuperSonic's existing HTML/JS/WASM assets and load them inside a `react-native-webview`. The WebView provides a real browser environment with WebAssembly, AudioWorklet, and Web Audio API.

### Architecture

```
React Native (UI)
  │ postMessage / onMessage (JSON strings)
  ▼
WebView (Chromium / WKWebView)
  │ SuperSonic runs normally
  ▼
scsynth-WASM → Web Audio → speakers
```

### What Works

- SuperSonic runs unmodified inside the WebView
- All existing SynthDefs and OSC messaging work as-is
- SuperSonic's `postMessage` fallback mode handles the lack of SharedArrayBuffer

### Limitations

| Issue | Detail |
|---|---|
| **SharedArrayBuffer unavailable** | Android WebView lacks site isolation; iOS WKWebView has a known WebKit bug (#237144). SuperSonic falls back to `postMessage` mode with higher latency. |
| **Communication overhead** | Native ↔ WebView bridge uses string serialization via `postMessage`/`onMessage`, too slow for high-frequency audio control. |
| **Background audio** | WebView audio may stop when the app backgrounds or the screen locks — a problem for an ambient music app. |
| **Resource overhead** | Running a full browser engine solely for audio synthesis. |

### When to Use This Path

- Validating the concept quickly
- Internal demos or proof-of-concept builds
- Scenarios where latency and background playback are acceptable trade-offs

---

## Path B: Native scsynth via C++ Turbo Module (Production Quality)

Compile scsynth as a native C++ library for iOS and Android. Expose it to React Native via a C++ Turbo Native Module using JSI. This bypasses WASM entirely and gives full native performance.

### Architecture

```
React Native (UI + JS)
  │ JSI calls (synchronous, no bridge serialization)
  ▼
C++ Turbo Native Module
  │ OSC messages → libscsynth
  ▼
scsynth (native C++, multi-threaded DSP)
  │ Core Audio (iOS) / Oboe (Android)
  ▼
Hardware audio output
```

### What You Get

- **Native performance** — no interpretation or AOT overhead
- **Multi-threaded DSP** — unlike SuperSonic's single-threaded WASM
- **Low-latency audio** — direct Core Audio / Oboe integration
- **Full UGen library** — same synthesis capabilities as desktop SuperCollider
- **Standard OSC protocol** — well-tested in the SC ecosystem

### Prior Art

| Project | Platform | Status |
|---|---|---|
| **iSuperColliderKit** | iOS | Dormant (last commit Mar 2023). Compiled scsynth as `libscsynth` static library for iOS. Published academic paper. |
| **SuperCollider-Android** | Android | Abandoned (~11 years). Compiled scsynth via Android NDK with JNI wrapper. |

### Engineering Challenges

1. **Cross-compilation** — scsynth depends on libsndfile, fftw, boost, and others. All need cross-compiling for iOS (ARM64) and Android (ARM64/ARM32/x86_64) via the respective SDKs/NDK.
2. **Audio driver integration** — scsynth uses PortAudio/JACK/CoreAudio. Mobile requires configuring it for Core Audio (iOS) and Oboe/AAudio (Android).
3. **Maintenance burden** — keeping a custom mobile build current with upstream SuperCollider releases.
4. **Licensing** — scsynth is GPL-3. App Store distribution may require careful licensing review depending on ORA-FM's license.

### When to Use This Path

- Production mobile app with professional audio quality
- Low-latency requirements
- Need for background audio playback
- Long-term investment in mobile audio

---

## Other Approaches Considered (Not Recommended)

### Polygen AOT + Native Audio Callback

Use Polygen to AOT-compile scsynth-WASM to C, then drive the compiled code from a native audio callback. Too speculative — Polygen is new, iOS-only, and untested with modules as large as scsynth.

### Rebuild Synthesis with react-native-audio-api

Abandon scsynth and rewrite all synthesis using `react-native-audio-api`'s built-in nodes. Loses SuperCollider's UGen library, SynthDef system, and the sonic capabilities that make scsynth valuable. Would mean rewriting ORA-FM's entire audio layer from scratch.

---

## Recommendation

**Start with Path A (WebView shim)** to validate the user experience and audio design on mobile. If the prototype confirms demand, invest in **Path B (native scsynth)** for a production release. The two paths are not mutually exclusive — the React Native UI layer and the OSC message protocol remain the same in both cases; only the audio backend changes.
