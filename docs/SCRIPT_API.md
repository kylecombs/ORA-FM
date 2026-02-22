# Script Module API

The Script module lets you write JavaScript that generates control values over time. Scripts run in a sandboxed environment — only the functions listed here are available. Connect a Script module's output to any parameter on a synth or effect to modulate it in real time.

## Quick Start

```javascript
// Set a fixed value
out(60)

// Cycle through notes every half-second
pattern([60, 64, 67, 72], 0.5)

// Rhythmic pattern with per-step durations
pattern([60, 64, 67], [0.5, 0.25, 1.0])

// Generator-based sequence
routine(function*() {
  while (true) {
    out(60); yield 0.5
    out(64); yield 0.25
    out(67); yield 1.0
  }
})
```

Click **Run** to start the script. Click **Stop** to halt it. Output appears in the console panel below the editor.

---

## API Reference

### `out(value)`

Set the script's output value. This is the number that flows through any connected modulation cable.

```javascript
out(72)         // MIDI note
out(0.5)        // normalized control value
out(440)        // frequency in Hz — depends on what you connect to
```

Call `out` as many times as you like. Only the most recent value is active at any moment.

---

### `pattern(values, durations)`

Cycle through an array of values on a repeating loop.

| Parameter | Type | Description |
|-----------|------|-------------|
| `values` | `number[]` | Array of output values to cycle through |
| `durations` | `number` or `number[]` | Step duration(s) in seconds. A single number applies to every step. An array gives each step its own duration and cycles independently. Default: `0.5` |

```javascript
// Even rhythm — every value held for 0.3s
pattern([60, 64, 67, 72], 0.3)

// Swing feel — alternating long/short
pattern([60, 64, 67, 72], [0.4, 0.2])

// Fully specified per-step timing
pattern([60, 64, 67], [0.5, 0.25, 1.0])

// Values and durations cycle independently
// 4 notes × 2 durations = 4-step loop with alternating timing
pattern([48, 55, 60, 64], [0.6, 0.2])
```

The first value is emitted immediately. The duration array wraps around if shorter than the values array (and vice versa).

---

### `routine(generatorFn)`

Run a generator function as a coroutine. `yield` a number to wait that many seconds before the generator resumes. Call `out()` inside the generator to set output values.

```javascript
routine(function*() {
  while (true) {
    out(60); yield 0.5
    out(64); yield 0.5
    out(67); yield 1.0
  }
})
```

Routines are the most flexible timing primitive — use them when `pattern` isn't enough.

#### Random walk

```javascript
routine(function*() {
  let note = 60
  while (true) {
    note += random(-2, 2)
    note = Math.max(36, Math.min(96, note))
    out(note)
    yield 0.15
  }
})
```

#### Accelerating sequence

```javascript
routine(function*() {
  let dt = 1.0
  let note = 48
  while (dt > 0.05) {
    out(note)
    note += 7
    if (note > 96) note = 48
    yield dt
    dt *= 0.95
  }
})
```

#### One-shot (non-looping)

If the generator returns (no `while (true)`), the routine simply ends.

```javascript
routine(function*() {
  out(60); yield 0.5
  out(72); yield 0.5
  out(84)
  // done — output stays at 84
})
```

---

### `lfo(rate, min, max)`

Output a continuous sine-wave oscillation. Updates at ~30 fps.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `rate` | `number` | `1` | Frequency in Hz |
| `min` | `number` | `0` | Minimum output value |
| `max` | `number` | `127` | Maximum output value |

```javascript
// Slow filter sweep between 40 and 100
lfo(0.1, 40, 100)

// Fast vibrato ±2 around middle C
lfo(5, 58, 62)

// Full-range 1Hz wobble
lfo(1, 0, 127)
```

---

### `ramp(from, to, duration)`

Linear interpolation from one value to another over a fixed duration. Updates at ~30 fps. Output holds at the final value when complete.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `from` | `number` | — | Starting value |
| `to` | `number` | — | Ending value |
| `duration` | `number` | `1` | Duration in seconds |

```javascript
// Fade in over 3 seconds
ramp(0, 1, 3)

// Pitch drop
ramp(80, 40, 2)
```

---

### `random(min, max)`

Return a random floating-point number in the range `[min, max)`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `min` | `number` | `0` | Lower bound (inclusive) |
| `max` | `number` | `1` | Upper bound (exclusive) |

```javascript
out(random(40, 80))   // random float between 40 and 80
```

---

### `randomInt(min, max)`

Return a random integer in the range `[min, max]` (inclusive on both ends).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `min` | `number` | `0` | Lower bound (inclusive) |
| `max` | `number` | `1` | Upper bound (inclusive) |

```javascript
out(randomInt(48, 72))  // random MIDI note in two-octave range
```

---

### `log(...args)`

Print to the console panel in the Script details view. Useful for debugging.

```javascript
log('current note:', note)
log('random value:', random(0, 100))
```

---

### `Math`

The standard JavaScript `Math` object is available.

```javascript
out(Math.sin(Date.now() / 1000) * 50 + 60)
out(Math.floor(random(0, 12)) + 48)
```

---

## Combining Functions

You can call multiple API functions in a single script. Each one runs concurrently.

```javascript
// LFO modulating output while pattern sets base values
// (the last out() call wins at any given moment)

// In practice, pick ONE output strategy per script.
// Use multiple Script modules for independent streams.
```

A more useful combination — logging alongside a pattern:

```javascript
log('Starting arpeggio')
pattern([60, 64, 67, 72], [0.3, 0.3, 0.3, 0.6])
```

---

## Notes

- **Minimum step time:** Durations below 10ms are clamped to 10ms to prevent runaway loops.
- **Output is a single number.** Each Script module has one output port. Use multiple Script modules for independent control streams.
- **Scripts are sandboxed.** `window`, `document`, `fetch`, and other browser APIs are not available.
- **Stopping a script** clears all its timers immediately. The last emitted value remains on the output until the script is re-run or the module is removed.
- **Console** keeps the last 100 lines. Click "clear" to reset.
