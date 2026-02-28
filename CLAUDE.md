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

## Storybook & Atomic Design System

The project uses **Storybook 8** with a component library organized by atomic design:

```
src/components/
├── foundations/          # Color palette & typography stories
├── atoms/               # Button, Toggle, Input, Label, Badge, Knob, Icon
├── molecules/           # ParameterControl, SearchField, ToolbarAction, StatusIndicator
├── organisms/           # Toolbar, ModulePanel, ConsolePanel
├── templates/           # GridLayout, AmbientLayout
├── pages/               # Full page-level stories
├── tokens.css           # Design tokens (CSS custom properties)
└── index.js             # Barrel export
```

**When you create or modify any UI component at the atom, molecule, or organism level, you must also create or update its Storybook story.**

Each component directory must contain:
1. `ComponentName.jsx` — The React component
2. `ComponentName.css` — Styles using `--ora-*` design tokens
3. `ComponentName.stories.jsx` — Storybook stories
4. `index.js` — Barrel export (`export { default } from './ComponentName'`)

Story file requirements:
- Default export with `title` matching the atomic level: `'Atoms/ComponentName'`, `'Molecules/ComponentName'`, or `'Organisms/ComponentName'`
- Export the component as `component` for automatic controls
- Include `argTypes` for all meaningful props
- Provide at least one interactive story per major variant or state
- Add a composite story (e.g. `AllVariants`) showing all variants side-by-side when the component has multiple visual states
- Use design tokens (`var(--ora-*)`) for all colors, spacing, and typography — never hardcode raw values in components

Run Storybook with `npm run storybook`. Build with `npm run build-storybook`.

## SuperSonic-Specific Notes

- SuperSonic is **not** SuperCollider — there is no sclang, no default group, no node ID allocator. You are sending raw OSC messages.
- Group 1 must be explicitly created after `init()` + `resume()`.
- All SuperSonic assets (WASM, workers, synthdefs, samples) are served locally from `public/supersonic/` to avoid CORS issues.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers are required for SharedArrayBuffer support — configured in `vite.config.js`.
- See `docs/GOTCHAS.md` for the full list of known issues.
