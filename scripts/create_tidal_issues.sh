#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  Create GitHub Issues — Tidal Cycles-Inspired Script API
#
#  Prerequisites:
#    1. Install GitHub CLI: https://cli.github.com
#    2. Authenticate: gh auth login
#    3. Run from repo root: bash scripts/create_tidal_issues.sh
#
#  Each issue targets extending the ScriptRunner sandbox API
#  (src/audio/scriptRunner.js) with functions inspired by
#  Tidal Cycles' pattern language.
# ════════════════════════════════════════════════════════════════

set -euo pipefail

REPO="kylecombs/ORA-FM"
LABEL="enhancement"

# Ensure label exists (ignore errors if it already does)
gh label create "$LABEL" --repo "$REPO" --color "a2eeef" --description "New feature or request" 2>/dev/null || true
gh label create "tidal-api" --repo "$REPO" --color "7057ff" --description "Tidal Cycles-inspired script API" 2>/dev/null || true

echo "Creating Tidal Cycles-inspired API issues..."
echo ""

# ─── 1. Mini-notation Pattern Parser ───────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: mini() — Tidal mini-notation pattern parser" \
  --body "$(cat <<'EOF'
## Summary

Add a `mini(notation)` function to the Script module sandbox that parses Tidal Cycles mini-notation strings into cycling patterns. This is the single most impactful Tidal feature — it turns verbose array definitions into compact, readable one-liners.

## API

```js
// Basic sequence — plays C4, D4, E4 in equal time divisions
mini("60 62 64")

// Grouping with brackets — subdivide a step
mini("60 [62 63] 64 67")

// Rest with ~
mini("60 ~ 64 ~")

// Repetition with *
mini("60*3 64")          // 60 60 60 64

// Output to specific port
mini("60 62 64", { output: 1 })

// With explicit cycle duration (seconds)
mini("60 62 64 67", { duration: 2.0 })
```

## Notation Subset to Support

| Syntax | Meaning | Example |
|--------|---------|---------|
| `a b c` | Sequence | `"60 62 64"` |
| `[a b]` | Subdivide step | `"60 [62 63] 64"` |
| `~` | Rest / silence | `"60 ~ 64 ~"` |
| `a*n` | Repeat n times | `"60*3"` → `60 60 60` |
| `a/n` | Slow by factor n | `"60/2"` → plays every 2 cycles |
| `<a b c>` | Alternate per cycle | `"60 <62 64>"` → `60 62`, `60 64`, ... |
| `a?` | Random drop (50%) | `"60 62? 64"` |

## Implementation Notes

- Parser should return an array of `{ value, duration }` objects that feed into the existing `out()` + `setTimeout` scheduling loop
- Rests (`~`) should call `out()` with a special sentinel or skip the output
- Cycle duration defaults to 1 second (matching Tidal's 1 cps default); overridable via options
- Nested brackets allow recursive subdivision (keep depth reasonable, e.g. max 4)

## Reference

- Current pattern API: `src/audio/scriptRunner.js:75-100`
- Tidal mini-notation spec: https://tidalcycles.org/docs/reference/mini_notation
EOF
)"
echo "✓ Created: mini() — mini-notation parser"

# ─── 2. Euclidean Rhythm Generator ────────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: euclidean() — Euclidean rhythm generator" \
  --body "$(cat <<'EOF'
## Summary

Add a `euclidean(pulses, steps, value, options?)` function that generates rhythmic patterns using the Bjorklund/Euclidean algorithm. This distributes `pulses` onsets as evenly as possible across `steps` slots — a technique that naturally produces many world music rhythms (Cuban tresillo, West African bell patterns, etc.).

## API

```js
// 3 pulses in 8 steps → tresillo [x . . x . . x .]
euclidean(3, 8, 60)

// 5 in 8 → cinquillo [x . x x . x x .]
euclidean(5, 8, 60)

// With rotation (shift the pattern start)
euclidean(3, 8, 60, { rotation: 1 })

// With explicit duration per step
euclidean(3, 8, 60, { stepDuration: 0.125 })

// Output to specific port
euclidean(3, 8, 60, { output: 2 })

// Rest value (what to output on empty steps)
euclidean(3, 8, 60, { rest: 0 })
```

## Behavior

- On "hit" steps: calls `out(value)`
- On "rest" steps: calls `out(rest)` (default `0`) or skips
- Pattern loops indefinitely
- Default step duration: `1.0 / steps` seconds (so one full cycle = 1 second)

## Algorithm

Bjorklund's algorithm (same as Bresenham's line algorithm applied to rhythms):
1. Distribute `pulses` ones and `steps - pulses` zeros
2. Recursively interleave groups until homogeneous
3. Apply optional rotation offset

## Classic Rhythms

| Pulses | Steps | Name |
|--------|-------|------|
| 2 | 3 | Swing / shuffle |
| 3 | 8 | Cuban tresillo |
| 5 | 8 | Cuban cinquillo |
| 7 | 12 | West African bell |
| 5 | 16 | Bossa nova |

## Reference

- Existing pattern scheduling: `src/audio/scriptRunner.js:75-100`
- Paper: Toussaint, "The Euclidean Algorithm Generates Traditional Musical Rhythms"
EOF
)"
echo "✓ Created: euclidean() — Euclidean rhythms"

# ─── 3. stack() — Layer Patterns ──────────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: stack() — layer multiple patterns simultaneously" \
  --body "$(cat <<'EOF'
## Summary

Add a `stack(...patterns)` function that runs multiple pattern definitions in parallel, each outputting to a different output port. This enables polyphonic patterns from a single script node — chords, counterpoint, or independent parameter streams (e.g., pitch on out_0, velocity on out_1, filter cutoff on out_2).

## API

```js
// Stack two patterns on separate outputs
setOutputs(3)
stack(
  { values: [60, 64, 67], durations: [0.5, 0.5, 1.0], output: 0 },
  { values: [48, 48, 43], durations: [1.0, 0.5, 0.5], output: 1 },
  { values: [0.2, 0.8, 0.5], durations: [0.25], output: 2 }
)

// Shorthand: auto-assign outputs 0, 1, 2...
stack(
  [60, 64, 67],          // output 0
  [0.2, 0.8, 0.5, 0.3]  // output 1
)
```

## Behavior

- Each sub-pattern cycles independently at its own rate
- All sub-patterns start simultaneously
- If arrays are passed without options, auto-assigns to sequential output ports with default 0.5s duration
- If objects are passed, respects `output`, `durations`, and `values` fields
- Calls `setOutputs()` automatically if needed to accommodate all output ports

## Use Cases

- **Chords**: Stack root, third, fifth on outputs 0/1/2, each connected to separate oscillators
- **Multi-parameter control**: Pitch on out_0, filter on out_1, amp on out_2 — all from one script
- **Polyrhythm**: Stack [60 62 64] at 3/cycle with [48 50] at 2/cycle

## Reference

- Tidal `stack`: https://tidalcycles.org/docs/reference/pattern_structure#stack
- Current API: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: stack() — layer patterns"

# ─── 4. cat() / fastcat() — Concatenate Patterns ──────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: cat() / fastcat() — concatenate patterns sequentially" \
  --body "$(cat <<'EOF'
## Summary

Add `cat(...patterns)` and `fastcat(...patterns)` for sequencing multiple patterns one after another.

- **`cat`**: Each sub-pattern gets one full cycle. Total length = N cycles.
- **`fastcat`**: All sub-patterns are squeezed into a single cycle (each gets `1/N` of the cycle).

## API

```js
// cat: each pattern plays for 1 full cycle, then the next
// Cycle 1: ascending, Cycle 2: descending, repeat
cat(
  [60, 62, 64, 67],    // ascending
  [67, 64, 62, 60]     // descending
)

// fastcat: both squeezed into 1 cycle
// All 8 notes fit in 1 second
fastcat(
  [60, 62, 64, 67],
  [67, 64, 62, 60]
)

// With durations
cat(
  { values: [60, 64], durations: [0.3, 0.7] },
  { values: [67, 72], durations: [0.5, 0.5] }
)
```

## Behavior

- `cat` preserves each sub-pattern's natural timing, playing them back-to-back
- `fastcat` compresses all sub-patterns proportionally to fit a single cycle
- Both loop indefinitely after exhausting all sub-patterns
- Cycle duration defaults to 1 second (configurable)

## Use Cases

- **A/B sections**: Alternate between two melodic phrases
- **Build-ups**: Concatenate increasingly dense patterns
- **Variation**: Create longer, non-repetitive sequences by chaining short motifs

## Reference

- Tidal `cat`/`fastcat`: https://tidalcycles.org/docs/reference/pattern_structure#cat
- Current `pattern()`: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: cat() / fastcat() — concatenate patterns"

# ─── 5. fast() / slow() — Time Stretch ────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: fast() / slow() — time-stretch patterns" \
  --body "$(cat <<'EOF'
## Summary

Add `fast(factor, values, durations?)` and `slow(factor, values, durations?)` to speed up or slow down pattern playback by a factor. These are fundamental Tidal transformations that allow rhythmic variation without redefining the pattern.

## API

```js
// Double speed
fast(2, [60, 62, 64, 67])

// Half speed
slow(2, [60, 62, 64, 67])

// With custom durations (durations are also scaled)
fast(1.5, [60, 62, 64], [0.25, 0.25, 0.5])

// Equivalent: slow(0.5, ...) === fast(2, ...)
```

## Behavior

- `fast(n, ...)` divides all durations by `n` (pattern completes `n` times faster)
- `slow(n, ...)` multiplies all durations by `n` (pattern takes `n` times longer)
- `slow` is sugar for `fast(1/n, ...)`
- Factor must be > 0; values ≤ 0 are clamped to a small positive number
- Default duration per step: `1.0 / values.length` seconds (before scaling)

## Use Cases

- **Rhythmic variation**: `fast(2, ...)` for double-time fills
- **Tempo-relative patterns**: Define pattern once, adjust speed globally
- **Acceleration**: Chain `fast` calls in a `routine` to create accelerando effects

## Reference

- Tidal `fast`/`slow`: https://tidalcycles.org/docs/reference/time#fast
- Current pattern scheduling: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: fast() / slow() — time stretch"

# ─── 6. every() — Periodic Transformation ─────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: every() — apply transformation every N cycles" \
  --body "$(cat <<'EOF'
## Summary

Add `every(n, transform, values, durations?)` to apply a transformation function every Nth cycle of a pattern while leaving other cycles unchanged. This is one of Tidal's most powerful composition tools — it creates evolving patterns from simple definitions.

## API

```js
// Reverse the pattern every 3rd cycle
every(3, rev, [60, 62, 64, 67])

// Double speed every 4th cycle
every(4, p => fast(2, p), [60, 62, 64, 67])

// Shift up an octave every 2nd cycle
every(2, p => p.map(n => n + 12), [60, 62, 64, 67])

// With durations
every(3, rev, [60, 62, 64, 67], [0.25, 0.25, 0.25, 0.25])
```

## Behavior

- Internally tracks a cycle counter (increments each time the base pattern completes)
- On every Nth cycle, applies `transform(values, durations)` and plays the transformed version
- On all other cycles, plays the original pattern unchanged
- `transform` receives the values array (and optionally durations) and must return the same shape
- Built-in transforms like `rev` should be provided alongside this feature

## Built-in Transforms to Include

| Transform | Description |
|-----------|-------------|
| `rev` | Reverse array order |
| `palindrome` | Play forward then backward |
| `shift(n)` | Rotate array by n positions |

## Reference

- Tidal `every`: https://tidalcycles.org/docs/reference/conditions#every
- Current `pattern()` loop: `src/audio/scriptRunner.js:86-100`
EOF
)"
echo "✓ Created: every() — periodic transformation"

# ─── 7. rev() — Reverse Pattern ───────────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: rev() — reverse pattern playback" \
  --body "$(cat <<'EOF'
## Summary

Add `rev(values, durations?)` to play a pattern in reverse order. Simple but essential — it's used standalone and as a transform argument to `every()`.

## API

```js
// Play descending instead of ascending
rev([60, 62, 64, 67])           // plays: 67, 64, 62, 60

// With durations (also reversed)
rev([60, 62, 64, 67], [0.1, 0.2, 0.3, 0.4])
// plays: 67@0.4, 64@0.3, 62@0.2, 60@0.1

// As a transform with every()
every(2, rev, [60, 62, 64, 67])
```

## Behavior

- Reverses both the values and durations arrays
- Starts a cycling pattern with the reversed arrays (delegates to `pattern()` internally)
- When used as a transform function (e.g., in `every()`), returns the reversed arrays without starting a new timer

## Dual Role

`rev` should work in two modes:
1. **Standalone**: `rev([60, 62, 64])` — starts a reversed cycling pattern
2. **As transform**: `every(2, rev, [60, 62, 64])` — returns reversed array for `every()` to schedule

This can be achieved by detecting whether it's called with the scheduling context or just as a pure function.

## Reference

- Tidal `rev`: https://tidalcycles.org/docs/reference/time#rev
- Current `pattern()`: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: rev() — reverse pattern"

# ─── 8. degrade() / degradeBy() — Random Dropout ─────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: degrade() / degradeBy() — random event dropout" \
  --body "$(cat <<'EOF'
## Summary

Add `degrade(values, durations?)` and `degradeBy(probability, values, durations?)` to randomly skip events in a pattern. This introduces controlled randomness — the pattern structure is preserved but individual events may be silenced, creating organic, breathing rhythms.

## API

```js
// 50% chance each event is dropped (degrade default)
degrade([60, 62, 64, 67])

// 30% dropout probability
degradeBy(0.3, [60, 62, 64, 67])

// 80% dropout — very sparse
degradeBy(0.8, [60, 62, 64, 67], [0.25, 0.25, 0.25, 0.25])
```

## Behavior

- On each step, generates `Math.random()`. If below `probability`, the event is skipped (output not called or outputs rest value)
- The *timing* is preserved — a skipped event still consumes its duration before advancing
- `degrade()` is sugar for `degradeBy(0.5, ...)`
- Re-rolls randomness each cycle so the dropout pattern varies over time
- Rest behavior: when an event is dropped, either skip the `out()` call entirely or output `0` (configurable)

## Use Cases

- **Organic variation**: Patterns that never repeat exactly the same way
- **Build-up/breakdown**: Gradually increase dropout to thin out a pattern
- **Generative ambient**: High dropout on dense patterns creates sparse, evolving textures

## Reference

- Tidal `degrade`/`degradeBy`: https://tidalcycles.org/docs/reference/randomness#degradeby
- Current `random()`: `src/audio/scriptRunner.js:173-177`
EOF
)"
echo "✓ Created: degrade() / degradeBy() — random dropout"

# ─── 9. choose() / wchoose() — Weighted Random Selection ─────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: choose() / wchoose() — weighted random selection" \
  --body "$(cat <<'EOF'
## Summary

Add `choose(...values)` and `wchoose(values, weights)` for random value selection. Unlike `random()` which returns a continuous float, these select from a discrete set of values — perfect for choosing notes from a scale, picking rhythmic durations, or selecting between parameter presets.

## API

```js
// Equal probability selection, emitted repeatedly at given rate
choose([60, 62, 64, 67, 72], { rate: 0.25 })

// Weighted selection — root note 50%, fifth 30%, octave 20%
wchoose([60, 67, 72], [0.5, 0.3, 0.2], { rate: 0.5 })

// One-shot (no cycling, just returns a value for use in routine)
routine(function*() {
  while (true) {
    const note = choose([60, 62, 64, 67, 72])
    out(note)
    yield 0.25
  }
})
```

## Behavior

**As a cycling pattern** (with `rate` option):
- Emits a randomly chosen value every `rate` seconds
- New random selection each step

**As a pure function** (inside `routine`):
- Returns a single randomly selected value
- Detection: if called without options object, returns a value; with `rate`, starts a cycling emitter

**`wchoose`**:
- `weights` array must be same length as `values`
- Weights are normalized (don't need to sum to 1)
- Selection uses inverse CDF method: `cumSum(weights)`, pick where `Math.random()` lands

## Reference

- Tidal `choose`/`wchoose`: https://tidalcycles.org/docs/reference/randomness#choose
- Current `random()`: `src/audio/scriptRunner.js:173-181`
EOF
)"
echo "✓ Created: choose() / wchoose() — weighted random"

# ─── 10. scale() — Musical Scale Mapper ───────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: scale() — map pattern values to musical scales" \
  --body "$(cat <<'EOF'
## Summary

Add a `scale(name, pattern, rootNote?)` function that maps integer scale degrees (0, 1, 2, 3...) to MIDI note numbers in a given musical scale. This removes the need to manually calculate MIDI values and makes patterns musically meaningful.

## API

```js
// Scale degrees 0-7 mapped to C minor pentatonic (root = 60)
scale("minorPentatonic", [0, 1, 2, 3, 4, 5, 6, 7])
// → outputs: 60, 63, 65, 67, 70, 72, 75, 77

// With custom root note (A3 = 57)
scale("major", [0, 2, 4, 5, 7], 57)

// Negative degrees go below root
scale("minor", [-1, 0, 1, 2], 60)
// → outputs: 58, 60, 62, 63

// Combined with pattern()
pattern(scale("dorian", [0, 1, 2, 3, 4, 5, 6, 7], 48), [0.25])
```

## Scales to Include

| Name | Intervals (semitones) |
|------|----------------------|
| `major` | 0, 2, 4, 5, 7, 9, 11 |
| `minor` | 0, 2, 3, 5, 7, 8, 10 |
| `dorian` | 0, 2, 3, 5, 7, 9, 10 |
| `phrygian` | 0, 1, 3, 5, 7, 8, 10 |
| `lydian` | 0, 2, 4, 6, 7, 9, 11 |
| `mixolydian` | 0, 2, 4, 5, 7, 9, 10 |
| `minorPentatonic` | 0, 3, 5, 7, 10 |
| `majorPentatonic` | 0, 2, 4, 7, 9 |
| `blues` | 0, 3, 5, 6, 7, 10 |
| `chromatic` | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| `wholeTone` | 0, 2, 4, 6, 8, 10 |
| `harmonicMinor` | 0, 2, 3, 5, 7, 8, 11 |

## Behavior

- `scale()` is a **pure function** that returns a MIDI note array (not a pattern)
- Degrees wrap across octaves: degree 7 in a 7-note scale = root + 12
- Negative degrees descend below root
- Root defaults to 60 (C4)
- Can be composed with `pattern()`, `mini()`, `euclidean()`, etc.

## Reference

- Tidal `scale`: https://tidalcycles.org/docs/reference/harmony_melody#scale
- App already uses pentatonic in `AmbientEngine`: `src/audio/engine.js` (Brownian melody walk)
EOF
)"
echo "✓ Created: scale() — musical scale mapper"

# ─── 11. chord() — Chord Generator ────────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: chord() — chord note array generator" \
  --body "$(cat <<'EOF'
## Summary

Add a `chord(name, rootNote?)` function that returns an array of MIDI notes forming a chord. Used with `stack()` to play chords or with `pattern()` to arpeggiate them.

## API

```js
// C major chord → [60, 64, 67]
chord("major", 60)

// A minor 7th → [57, 60, 64, 67]
chord("minor7", 57)

// Use with stack for simultaneous notes
setOutputs(3)
const c = chord("major", 60)
stack(
  pattern([c[0]], [1.0]),
  pattern([c[1]], [1.0]),
  pattern([c[2]], [1.0])
)

// Arpeggiate a chord
pattern(chord("major7", 48), [0.125])
```

## Chords to Include

| Name | Intervals |
|------|-----------|
| `major` | 0, 4, 7 |
| `minor` | 0, 3, 7 |
| `dim` | 0, 3, 6 |
| `aug` | 0, 4, 8 |
| `sus2` | 0, 2, 7 |
| `sus4` | 0, 5, 7 |
| `major7` | 0, 4, 7, 11 |
| `minor7` | 0, 3, 7, 10 |
| `dom7` | 0, 4, 7, 10 |
| `dim7` | 0, 3, 6, 9 |
| `add9` | 0, 4, 7, 14 |
| `minor9` | 0, 3, 7, 10, 14 |

## Behavior

- Pure function — returns a MIDI note number array
- Root defaults to 60 (C4)
- Can be composed with any pattern function
- Inversions: optional `inversion` parameter to rotate chord voicings

## Reference

- Tidal `chord`: https://tidalcycles.org/docs/reference/harmony_melody#chord
- AmbientEngine already uses just-intonation triads: `src/audio/engine.js`
EOF
)"
echo "✓ Created: chord() — chord generator"

# ─── 12. arp() — Arpeggiator ──────────────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: arp() — arpeggiator with multiple modes" \
  --body "$(cat <<'EOF'
## Summary

Add an `arp(notes, mode, rate?)` function that arpeggiates an array of notes (typically from `chord()`) in various traversal orders. This bridges the gap between chordal harmony and melodic sequencing.

## API

```js
// Arpeggiate C major chord upward at 8th note rate
arp(chord("major", 60), "up", 0.125)

// Down pattern
arp([60, 64, 67, 72], "down", 0.2)

// Up-down (ping-pong)
arp(chord("minor7", 48), "updown", 0.1)

// Random note from chord
arp(chord("major7", 60), "random", 0.125)
```

## Modes

| Mode | Traversal Order |
|------|----------------|
| `up` | Low to high, repeat |
| `down` | High to low, repeat |
| `updown` | Low→high→low (ping-pong, no repeated endpoints) |
| `downup` | High→low→high |
| `random` | Random selection each step |
| `order` | Original array order (same as `pattern()`) |
| `converge` | Outside-in: lowest, highest, 2nd lowest, 2nd highest... |
| `diverge` | Inside-out: middle outward |

## Behavior

- Starts cycling pattern using the computed traversal order
- `rate` is seconds per step (default: 0.125 = eighth note at 120 BPM)
- Delegates to `pattern()` internally after computing the note order
- Works with any array of numbers, not just chord output

## Reference

- Tidal `arp`/`arpeggiate`: https://tidalcycles.org/docs/reference/harmony_melody#arp
- Current `pattern()`: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: arp() — arpeggiator"

# ─── 13. perlin() — Smooth Noise Modulation ───────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: perlin() — smooth Perlin noise modulation source" \
  --body "$(cat <<'EOF'
## Summary

Add a `perlin(rate?, min?, max?)` function that outputs smooth, organic Perlin noise values. Unlike `lfo()` (periodic sine wave) or `random()` (discontinuous jumps), Perlin noise produces smooth, naturalistic modulation — ideal for ambient drift effects on filter cutoff, pan, pitch vibrato, and amplitude.

## API

```js
// Default: slow drift between 0–1
perlin()

// Custom range and rate
perlin(0.5, 200, 2000)    // 0.5 Hz drift, range 200–2000 (filter cutoff)

// Very slow drift for ambient pad modulation
perlin(0.05, 0.3, 0.8)    // subtle amplitude swell over ~20 seconds

// Output to specific port
perlin(0.2, 60, 72, { output: 1 })  // pitch drift ±6 semitones
```

## Behavior

- Outputs at ~30fps (same as `lfo()`)
- Uses 1D Perlin noise (or simplex noise) seeded with `performance.now() * rate`
- Smooth, continuous values — no sudden jumps
- Range maps noise output (typically -1 to 1) → `[min, max]`
- Each script node gets an independent noise seed for decorrelated outputs

## Why Not Just Use `lfo()`?

| | `lfo()` | `perlin()` |
|---|---------|-----------|
| Shape | Periodic sine | Aperiodic, organic |
| Repetition | Exact repeat every cycle | Never repeats |
| Character | Mechanical | Natural/organic |
| Use case | Tremolo, vibrato | Drift, wander, ambiance |

## Implementation Notes

- Implement Ken Perlin's improved noise (2002) or simplex noise — both are <50 LOC
- The AmbientEngine already has a 1/f noise generator (`OneFNoise` class in `src/audio/engine.js:14-52`) that could be adapted or referenced
- Alternatively, use the existing `OneFNoise` class as the noise source

## Reference

- Tidal `perlin`: https://tidalcycles.org/docs/reference/randomness#perlin
- Existing 1/f noise: `src/audio/engine.js:14-52` (OneFNoise class)
- Current `lfo()`: `src/audio/scriptRunner.js:134-150`
EOF
)"
echo "✓ Created: perlin() — smooth noise"

# ─── 14. shuffle() / scramble() — Randomize Pattern Order ────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: shuffle() / scramble() — randomize pattern order" \
  --body "$(cat <<'EOF'
## Summary

Add `shuffle(values, durations?)` and `scramble(values, durations?)` for randomized pattern playback.

- **`shuffle`**: Randomly reorder the pattern once per cycle (Fisher-Yates shuffle). Same set of values, different order each time through.
- **`scramble`**: Randomly pick from the values for each step (with replacement). May repeat values, may skip others.

## API

```js
// Shuffle: all 4 notes play each cycle, in random order
shuffle([60, 62, 64, 67])
// Cycle 1: 64, 60, 67, 62
// Cycle 2: 67, 62, 60, 64  (different order)

// Scramble: random pick per step (may repeat)
scramble([60, 62, 64, 67])
// Step 1: 64, Step 2: 64, Step 3: 60, Step 4: 67

// With durations
shuffle([60, 62, 64, 67], [0.25, 0.25, 0.25, 0.25])
```

## Behavior

**`shuffle`**:
- At the start of each cycle, performs a Fisher-Yates shuffle on the values array
- All values play exactly once per cycle
- Durations shuffle in parallel with values (same permutation)

**`scramble`**:
- Each step independently picks a random value from the array
- No guarantee all values play; some may repeat
- Durations are consumed in order (not randomized)

## Use Cases

- **Generative melody**: Shuffle a scale for never-repeating melodic lines
- **Textural variation**: Scramble filter cutoff values for organic movement
- **Controlled chaos**: Shuffle preserves note content while varying order

## Reference

- Tidal `shuffle`/`scramble`: https://tidalcycles.org/docs/reference/randomness#shuffle
- Current `pattern()`: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: shuffle() / scramble() — randomize order"

# ─── 15. struct() — Apply Rhythmic Structure ──────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: struct() — apply boolean rhythmic structure to values" \
  --body "$(cat <<'EOF'
## Summary

Add `struct(booleanPattern, values, durations?)` that applies a rhythmic on/off mask to a value pattern. Steps where the boolean is `true` (or `1`) play the next value; steps where it's `false` (or `0`) are silent. This decouples *rhythm* from *pitch*, allowing them to be composed independently.

## API

```js
// Apply tresillo rhythm to ascending scale
struct([1,0,0,1,0,0,1,0], [60, 62, 64])
// Outputs: 60, -, -, 62, -, -, 64, -

// Binary pattern (same thing)
struct([1,0,1,1,0,1,0,1], [60, 64, 67, 72])

// Combine with euclidean for the boolean mask
struct(euclideanBool(3, 8), [60, 64, 67])

// With durations per step
struct([1,0,1,0,1,0,0,1], [60, 62, 64, 67], [0.125])
```

## Behavior

- Boolean pattern and value pattern cycle independently
- On `true`/`1` steps: output the next value from the values array and advance
- On `false`/`0` steps: output rest (0 or silence) and advance time only
- Value index advances only on `true` steps, wrapping as needed
- Duration per step: `cycleDuration / booleanPattern.length`

## Helper: `euclideanBool(pulses, steps, rotation?)`

Returns a boolean array generated by the Euclidean algorithm (same as `euclidean()` but returns `[true, false, false, true, ...]` instead of starting a pattern). Useful as the first argument to `struct()`.

## Use Cases

- **Rhythmic templates**: Define a rhythm once, apply to any melody
- **Drum machine patterns**: Boolean grids map naturally to hit/rest
- **Polyrhythmic layering**: Apply different boolean grids to different voices

## Reference

- Tidal `struct`: https://tidalcycles.org/docs/reference/conditions#struct
- Current pattern loop: `src/audio/scriptRunner.js:75-100`
EOF
)"
echo "✓ Created: struct() — rhythmic structure"

# ─── 16. Global Tempo Clock (cps / bpm) ──────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: cps() / bpm() — global tempo clock for cycle-based timing" \
  --body "$(cat <<'EOF'
## Summary

Add `cps(cyclesPerSecond)` and `bpm(beatsPerMinute)` functions to set a global tempo that all pattern functions reference. Currently, durations in `pattern()` are specified in absolute seconds. A global clock would allow patterns to be defined in **beats** or **cycles** and automatically adjust when tempo changes — the foundation of Tidal's timing model.

## API

```js
// Set tempo to 120 BPM (2 beats per second)
bpm(120)

// Or equivalently, 0.5 cycles per second
cps(0.5)

// Patterns now use beat-relative durations
pattern([60, 62, 64, 67], [1, 1, 2, 2])  // 1 beat, 1 beat, 2 beats, 2 beats

// Change tempo mid-performance
routine(function*() {
  bpm(120)
  yield 8  // wait 8 beats
  bpm(140) // accelerate
})
```

## Behavior

- `cps(n)` sets cycles per second (Tidal's native unit). 1 cps = 1 cycle/second.
- `bpm(n)` is sugar: `cps(n / 60 / beatsPerCycle)` where `beatsPerCycle` defaults to 4
- All `pattern()`, `mini()`, `euclidean()`, etc. interpret durations relative to the clock
- Default: 1 cps (equivalent to 120 BPM with 2 beats/cycle, or 240 BPM with 4 beats/cycle)
- Tempo changes take effect at the next cycle boundary (not mid-pattern) to avoid timing glitches

## Architecture Considerations

- The clock should be **per-script-node** (each script can have its own tempo) or **global** (shared across all scripts). Recommend per-node as default with an option for global sync.
- Uses `performance.now()` for timing (same as current `pattern()` implementation)
- Future enhancement: could sync to SuperSonic's NTP clock for sample-accurate timing

## Impact on Existing API

- `pattern(values, durations)` durations currently in seconds → would become beats if clock is set
- Need a migration strategy: if no `cps()`/`bpm()` is called, durations remain in seconds (backward compatible)

## Reference

- Tidal `cps`/`setcps`: https://tidalcycles.org/docs/reference/tempo
- Current timing: `src/audio/scriptRunner.js` uses `setTimeout` with ms values
- GridView beat parameter: `src/App.jsx` already has a `getBeat` callback
EOF
)"
echo "✓ Created: cps() / bpm() — global tempo clock"

# ─── 17. jux() — Stereo Juxtaposition ─────────────────────────
gh issue create --repo "$REPO" \
  --label "$LABEL" --label "tidal-api" \
  --title "Script API: jux() — stereo juxtaposition of transformed patterns" \
  --body "$(cat <<'EOF'
## Summary

Add `jux(transform, values, durations?)` that plays the original pattern on one output and a transformed version on another output simultaneously. In Tidal, this pans original left and transformed right — in ORA-FM, it outputs to two separate output ports that can be routed to different synths or panned independently.

## API

```js
// Original on output 0, reversed on output 1
setOutputs(2)
jux(rev, [60, 62, 64, 67])

// Original on output 0, double-speed on output 1
jux(p => fast(2, p), [60, 62, 64, 67])

// Original on output 0, degraded on output 1
jux(p => degradeBy(0.5, p), [60, 62, 64, 67], [0.25])
```

## Behavior

- Automatically calls `setOutputs(2)` (or extends existing output count)
- Runs original pattern → `out(0, value)`
- Simultaneously runs `transform(values, durations)` → `out(1, value)`
- Both patterns cycle independently at their own rates
- The user connects output 0 to one synth (or pan left) and output 1 to another (or pan right)

## Use Cases

- **Stereo width**: Original left, reversed right creates beautiful stereo counterpoint
- **Call & response**: Original melody + variation in parallel
- **Textural density**: Layer a sparse version with a dense version

## Reference

- Tidal `jux`: https://tidalcycles.org/docs/reference/alteration#jux
- Current multi-output: `src/audio/scriptRunner.js:44-48` (setOutputs), `src/audio/scriptRunner.js:50-64` (out with index)
EOF
)"
echo "✓ Created: jux() — stereo juxtaposition"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  All 14 issues created successfully!"
echo "  Labels: 'enhancement', 'tidal-api'"
echo "════════════════════════════════════════════════════════"
