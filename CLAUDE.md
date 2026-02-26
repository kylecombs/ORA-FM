# ORA-FM — Claude Instructions

## Project Overview

ORA-FM is a browser-based ambient music application built with Vite + React. It uses **SuperSonic** (SuperCollider's scsynth compiled to WASM) for audio synthesis via AudioWorklet.

## Tech Stack

- **Frontend:** React (Vite)
- **Audio engine:** SuperSonic (scsynth-WASM) — see `docs/SUPERSONIC_TECHNICAL_REFERENCE.md`
- **Synth definitions:** Pre-compiled `.scsyndef` files in `public/supersonic/synthdefs/`
- **Audio engine wrapper:** `src/audio/engine.js`

## Key Documentation

- `docs/SUPERSONIC_TECHNICAL_REFERENCE.md` — Architecture, supported/unsupported UGens and OSC commands
- `docs/SUPERSONIC_FOR_ARTISTS.md` — Practical guide for building instruments
- `docs/GOTCHAS.md` — Running log of non-obvious issues and their fixes

## Gotchas Documentation Requirement

**When you encounter a non-obvious bug, surprising behavior, or platform-specific issue during development, document it in `docs/GOTCHAS.md`.**

Each entry must include:
1. **Symptom** — What the developer observes (error message, silent failure, unexpected behavior)
2. **Root cause** — Why it happens (the underlying technical reason)
3. **Fix** — The concrete solution with code if applicable
4. **Reference** — Link to relevant file paths, line numbers, or commits

This applies to issues like:
- SuperSonic/scsynth behaving differently than desktop SuperCollider
- Browser API restrictions (AudioContext, CORS, SharedArrayBuffer)
- Silent failures where no error is thrown
- Ordering or timing dependencies that aren't documented upstream
- Any issue that took more than a few minutes to diagnose

Number entries sequentially, following the existing format in the file.

## SynthDef Compilation

There are **two ways** to produce `.scsyndef` binaries for this project:

### 1. SuperCollider (sclang) — for the developer

The developer writes `.scd` source files in `synthdefs/src/` and compiles them locally where SuperCollider is installed:

```bash
npm run build:synthdefs -- print.scd
```

This runs `sclang` via `synthdefs/build.sh`. Use this workflow when writing new synthdefs in SuperCollider's language. The compiled `.scsyndef` files go into `public/supersonic/synthdefs/`.

### 2. Manual binary encoding (JavaScript) — for Claude

When Claude needs to create a synthdef, it **must not** assume `sclang` is available. Instead, generate the `.scsyndef` binary directly in a Node.js script by encoding the SCgf v2 format byte-by-byte.

**Reference implementation:** `scripts/generate-scope-synthdef.cjs`

**SCgf v2 binary format:**

```
Header:
  "SCgf"            4 bytes ASCII magic
  int32 BE          version (2)
  int16 BE          number of synthdefs

Per synthdef:
  pstring           name (1 byte length + ASCII bytes)
  int32 BE          number of constants (K)
  float32 BE × K    constant values
  int32 BE          number of parameters (P)
  float32 BE × P    parameter default values
  int32 BE          number of parameter names (N)
  per name:
    pstring         parameter name
    int32 BE        parameter index
  int32 BE          number of UGens (U)
  per UGen:
    pstring         class name (e.g. "SinOsc", "BufWr", "Control")
    int8            calculation rate (0=scalar, 1=control, 2=audio)
    int32 BE        number of inputs (I)
    int32 BE        number of outputs (O)
    int16 BE        special index (usually 0)
    per input:
      int32 BE      source UGen index (-1 = constant)
      int32 BE      source output index (or constant index if src = -1)
    per output:
      int8          calculation rate
  int16 BE          number of variants (usually 0)
```

**Key rules for encoding UGens:**

- **`Control`**: 0 inputs, N outputs (one per parameter), rate = 1 (control). Always UGen 0.
- **Input wiring**: Each UGen input is a `(srcUGen, srcOutput)` pair. Use `(-1, constIdx)` for constants.
- **UGen argument order**: The internal arg order in the binary may differ from the SC language API. Check SC source for `multiNew` call order. For example, `BufWr.ar(inputArray, bufnum, phase, loop)` encodes as inputs: `bufnum, phase, loop, ...inputArray`.
- **`In.ar(bus, numChannels)`**: `numChannels` is NOT an input — it determines the output count.
- All integers are signed big-endian. Floats are IEEE 754 big-endian.

**Process:**

1. Write the generator script in `scripts/` as a `.cjs` file (project uses `"type": "module"`)
2. Include the equivalent SC source code in a comment at the top
3. Run with `node scripts/<name>.cjs`
4. Output the `.scsyndef` file to `public/supersonic/synthdefs/`
5. Verify with `od -A x -t x1z` that the header starts with `53 43 67 66` (SCgf)

## Frequency Parameter Module Requirements

**Every module that has a `freq` parameter must include the following UI features:**

1. **LFO / Audio rate toggle** — stored as `node.freqMode` (`'audio'` or `'lfo'`). Default is `'audio'`.
   - **Audio mode:** 20 Hz – 20,000 Hz (for pitched tones)
   - **LFO mode:** 0.01 Hz – 20 Hz (for modulation / slow movement)
   - Switching modes clamps or resets the current frequency to the new range.

2. **Custom range override** — Users can set `node.freqRangeMin` and `node.freqRangeMax` in the details panel to narrow or widen the slider range within the selected mode.

3. **Editable value field** — The parameter value display on the canvas is clickable. Users can click to type an exact numeric value (Enter to confirm, Escape to cancel, blur to confirm).

4. **Details panel** — Any module with a `freq` param gets a details panel (shown when clicking the module) with:
   - Rate toggle (Audio / LFO)
   - Min/Max range inputs with Reset button
   - Quantize-to-note checkbox
   - Current value display (with period shown in LFO mode)

**When creating a new module with a frequency parameter:**
- Add `freq` to the `params` object in `NODE_SCHEMA` with `min: 0.1, max: 20000`
- The `hasFreqParam()` helper auto-detects modules with `freq` in their params
- Initialize `node.freqMode = 'audio'` in `addNode()` (already handled by the generic check)
- The details panel and dynamic slider range are applied automatically
- Use the range constants from `FREQ_RANGES` (`audio` / `lfo`)
- See `getFreqRange(node)` for resolving the effective min/max/step

**Reference implementation:** `src/GridView.jsx` — search for `FREQ_RANGES`, `handleFreqModeChange`, `hasFreqParam`

## SuperSonic-Specific Notes

- SuperSonic is **not** SuperCollider — there is no sclang, no default group, no node ID allocator. You are sending raw OSC messages.
- Group 1 must be explicitly created after `init()` + `resume()`.
- All SuperSonic assets (WASM, workers, synthdefs, samples) are served locally from `public/supersonic/` to avoid CORS issues.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers are required for SharedArrayBuffer support — configured in `vite.config.js`.
- See `docs/GOTCHAS.md` for the full list of known issues.
