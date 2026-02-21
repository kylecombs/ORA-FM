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

## SuperSonic-Specific Notes

- SuperSonic is **not** SuperCollider — there is no sclang, no default group, no node ID allocator. You are sending raw OSC messages.
- Group 1 must be explicitly created after `init()` + `resume()`.
- All SuperSonic assets (WASM, workers, synthdefs, samples) are served locally from `public/supersonic/` to avoid CORS issues.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers are required for SharedArrayBuffer support — configured in `vite.config.js`.
- See `docs/GOTCHAS.md` for the full list of known issues.
