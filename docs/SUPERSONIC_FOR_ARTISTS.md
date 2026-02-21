# SuperSonic: A Synth Engine in Your Browser

*For electronic musicians, sound designers, and modular synth thinkers*

---

## The Short Version

SuperSonic is a professional-grade synthesizer engine that runs entirely inside your web browser. It contains the same audio DSP core used in [Sonic Pi](https://sonic-pi.net) and [SuperCollider](https://supercollider.github.io/) — tools used by artists like Aphex Twin for live performance. Instead of installing software or buying hardware, you load a web page, and 30 years of synthesis research runs on your machine.

Think of it like this: **SuperSonic is the rack. JavaScript is your sequencer and patch cables.**

---

## How to Think About It (The Modular Analogy)

If you come from a modular synthesis background — hardware or software like VCV Rack, Max/MSP, Reaktor, or even a Eurorack system — here's the mapping:

| Modular Concept | SuperSonic Equivalent |
|-----------------|----------------------|
| **Module** (oscillator, filter, envelope, VCA) | **UGen** — a unit generator. SinOsc, RLPF, EnvGen, etc. |
| **Patch** (a set of connected modules) | **SynthDef** — a pre-wired voice design saved as a binary file |
| **Voice** (one instance of a patch playing) | **Node** — a running instance of a SynthDef on the server |
| **CV cable** | **Control bus** — a shared signal path between voices |
| **Audio cable** | **Audio bus** — routes audio between voices |
| **Mixer channel / bus** | **Group** — a container that controls processing order |
| **Sequencer / MIDI** | **JavaScript** — your code decides when and what to play |
| **Rack / case** | **scsynth** — the engine that runs all your voices |

---

## What's Inside the Rack

SuperSonic ships with **128 pre-built voice designs** (SynthDefs) from Sonic Pi. These are complete, playable instruments — not raw oscillators. Think of them like preset patches on a synth module that you can trigger and modulate from your code.

### Instruments

| Name | Character | Think of it like... |
|------|-----------|---------------------|
| `beep` | Pure sine tone | Test oscillator, sub bass, binaural carriers |
| `saw` | Classic sawtooth | Moog-style raw waveform, great for filtering |
| `square` | Square wave | Hollow, woody, 8-bit foundation |
| `tri` | Triangle wave | Soft, flute-like, gentle |
| `pulse` | Variable pulse width | PWM pads, thin to thick sweeps |
| `supersaw` | Stacked detuned saws | Trance / EDM supersaw lead |
| `prophet` | Analog poly synth | Prophet-5 style — lush pads and leads |
| `tb303` | Acid bass synth | Roland TB-303 emulation with resonant filter |
| `tech_saws` | Multi-saw | Modern techno bass / lead |
| `hoover` | Hoover / mentasm | 90s rave stab |
| `blade` | Vibrato synth | Blade Runner-style lead with vibrato control |
| `dark_ambience` | Dark pad | Wide, evolving ambient texture |
| `hollow` | Breathy pad | Airy, spectral, overtone-rich |
| `fm` | FM synthesis | DX7-style frequency modulation |
| `rhodey` | Electric piano | Rhodes-like FM keys |
| `piano` | Acoustic piano model | Sampled piano sound |
| `kalimba` | Thumb piano | Short, bright, metallic pluck |
| `pluck` | Karplus-Strong | Physical modeled plucked string |
| `pretty_bell` | Bell tone | Clean, resonant bell |
| `dull_bell` | Muted bell | Darker, shorter bell |
| `organ_tonewheel` | Organ | Hammond-style tonewheel organ |
| `growl` | Aggressive synth | Distorted, growling bass/lead |
| `zawa` | Evolving pad | Slow filter sweep pad |
| `chipbass` / `chiplead` | 8-bit | NES/Game Boy style chiptune |

### Noise Sources

| Name | Spectrum | Use |
|------|----------|-----|
| `noise` | White (flat spectrum) | Snare body, hi-hat texture, noise sweeps |
| `bnoise` | Brown (1/f^2, heavy low end) | Ocean, wind, warm ambient floor |
| `pnoise` | Pink (1/f, balanced) | Natural masking, reference noise |
| `cnoise` | Clip noise (harsh) | Glitch, digital texture |
| `gnoise` | Gray noise (perceptually flat) | Psychoacoustic masking |

### 808 Drum Machine

A complete TR-808 emulation — 16 individual drum voices:

`bassdrum` · `snare` · `clap` · `closed_hihat` · `open_hihat` · `cymbal` · `cowbell` · `claves` · `rimshot` · `maracas` · `tomhi` · `tommid` · `tomlo` · `congahi` · `congamid` · `congalo`

### Detuned & Modulated Variants

For thicker sounds, there are detuned (`dsaw`, `dpulse`, `dtri`) and modulated (`mod_saw`, `mod_sine`, `mod_tri`, `mod_pulse`, `mod_dsaw`, `mod_fm`) versions of the basic waveforms. The detuned variants run multiple slightly-detuned oscillators for chorus-like width. The modulated variants add ring modulation for harmonic complexity.

### Effects (FX Chains)

Over 60 effect processors that can be chained after any voice:

**Filters**: `fx_lpf`, `fx_hpf`, `fx_bpf`, `fx_rhpf`, `fx_rlpf`, `fx_band_eq`, `fx_eq`
**Dynamics**: `fx_compressor`, `fx_normaliser`, `fx_level`
**Distortion**: `fx_distortion`, `fx_bitcrusher`, `fx_krush`
**Time**: `fx_echo`, `fx_reverb`, `fx_gverb`
**Modulation**: `fx_flanger`, `fx_tremolo`, `fx_wobble`, `fx_whammy`
**Pitch**: `fx_pitch_shift`, `fx_octaver`, `fx_autotuner`
**Spectral**: `fx_vowel`, `fx_ixi_techno`
**Spatial**: `fx_pan`, `fx_panslicer`

---

## Playing a Sound: The Basics

Every sound in SuperSonic follows a simple lifecycle:

### 1. Trigger a voice

```javascript
// Play a prophet synth at middle C, moderate volume
sonic.send('/s_new', 'sonic-pi-prophet', 1000, 0, 1,
  'note', 60,      // MIDI note number (60 = middle C)
  'amp', 0.4,      // volume (0.0 to 1.0)
  'attack', 0.1,   // fade-in time in seconds
  'sustain', 2,    // hold time in seconds
  'release', 1,    // fade-out time in seconds
  'cutoff', 80     // filter brightness (MIDI-scale, higher = brighter)
);
```

### 2. Tweak it while it plays

```javascript
// Sweep the filter down in real-time
sonic.send('/n_set', 1000, 'cutoff', 50);
// Pan it left
sonic.send('/n_set', 1000, 'pan', -0.7);
```

### 3. Release it

```javascript
// Trigger the release envelope (fade out naturally)
sonic.send('/n_set', 1000, 'gate', 0);
```

That's it. The pattern is always: **trigger**, **modulate**, **release**.

---

## The Universal Parameters

Most voices respond to the same core parameters. If you've used any synthesizer, these will be familiar:

| Parameter | Range | What it does |
|-----------|-------|--------------|
| `note` | 0–127 | MIDI note number. 60 = middle C. Each +1 = one semitone up |
| `amp` | 0.0–1.0 | Volume. 0 = silent, 1 = full |
| `pan` | -1 to 1 | Stereo position. -1 = hard left, 0 = center, 1 = hard right |
| `attack` | seconds | Time to fade in from silence to full volume |
| `sustain` | seconds | Time to hold at full volume after attack |
| `release` | seconds | Time to fade out after sustain ends (or after `gate` goes to 0) |
| `gate` | 0 or 1 | 1 = note on, 0 = trigger release. Set to 0 to stop a held note |
| `cutoff` | 0–130 | Low-pass filter cutoff (MIDI-scale). Higher = brighter |
| `res` | 0.0–1.0 | Filter resonance. Higher = more emphasis at cutoff frequency |

Some voices have extra parameters:

| Parameter | Found on | What it does |
|-----------|----------|--------------|
| `vibrato_rate` | `blade` | Speed of pitch vibrato (Hz) |
| `vibrato_depth` | `blade` | Amount of pitch vibrato |
| `room` | `dark_ambience` | Reverb room size (0.0–1.0) |
| `reverb_damp` | `dark_ambience` | Reverb high-frequency damping |
| `detune` | `dsaw`, `dpulse`, `dtri` | Detuning amount between oscillators |
| `mod_phase` | `mod_*` variants | Phase offset of modulator |
| `mod_range` | `mod_*` variants | Depth of ring modulation |
| `mod_pulse_width` | `mod_pulse` | Pulse width of modulator |
| `pulse_width` | `pulse`, `subpulse` | Pulse width (0.0–1.0) |

---

## Connecting Voices Together (Patching)

This is where the modular analogy is most direct. You can route audio and control signals between voices just like patching cables in a modular system.

### Audio Routing: The Signal Path

By default, every voice outputs to bus 0 (your speakers). But you can route a voice's output to a different bus, then feed that into an effect:

```javascript
// Source: prophet synth → outputs to audio bus 20 (not speakers)
sonic.send('/s_new', 'sonic-pi-prophet', 100, 0, 1,
  'out_bus', 20, 'note', 60, 'amp', 0.4, 'sustain', 9999);

// Effect: reverb reads from bus 20, outputs to bus 0 (speakers)
sonic.send('/s_new', 'sonic-pi-fx_reverb', 101, 3, 100,
  'in_bus', 20, 'out_bus', 0, 'room', 0.9, 'damp', 0.5);
```

This is exactly like patching: synth output → reverb input → speakers.

### Control Routing: CV-Style Modulation

You can use **control buses** like CV in a modular system. One voice (or your JavaScript code) writes a value to a bus, and another voice reads it as a parameter:

```javascript
// Write a changing value to control bus 10 from JavaScript
// (Like turning a knob slowly over time)
let cutoff = 80;
setInterval(() => {
  cutoff = 40 + Math.sin(Date.now() / 2000) * 40;  // sweep 0–80
  sonic.send('/c_set', 10, cutoff);
}, 50);

// Map the prophet's cutoff parameter to read from bus 10
sonic.send('/n_map', 100, 'cutoff', 10);
// Now the filter sweeps automatically — cutoff follows bus 10
```

Or you could have a **synth** write the LFO instead of JavaScript, for audio-rate modulation:

```javascript
// A dedicated LFO synth that writes to control bus 10
// (You'd need a SynthDef built for this purpose)
sonic.send('/s_new', 'my-lfo', 200, 0, 1, 'out_bus', 10, 'freq', 0.3);

// Map the prophet's cutoff to bus 10
sonic.send('/n_map', 100, 'cutoff', 10);
```

### Processing Order: Why It Matters

Just like in a modular rack, **signal flow order matters**. If a reverb tries to process audio before the synth has generated it, you get silence.

SuperSonic processes voices in order within **groups**. Think of groups like mixer channels with insert slots:

```javascript
// Group 1: sound sources (processed first)
sonic.send('/g_new', 1, 0, 0);

// Group 2: effects (processed after sources)
sonic.send('/g_new', 2, 3, 1);  // "add group 2 after group 1"

// Sources go in group 1
sonic.send('/s_new', 'sonic-pi-prophet', 100, 0, 1, 'out_bus', 20);

// Effects go in group 2
sonic.send('/s_new', 'sonic-pi-fx_reverb', 200, 0, 2, 'in_bus', 20);
```

---

## Samples and Buffers

SuperSonic can play back audio samples, not just synthesized sound.

### Loading Samples

```javascript
// Load a sample from the server's sample library
await sonic.loadSample('my-sample');
```

### Allocating Empty Buffers

Buffers are blocks of memory that hold audio data. They're used for delay lines, wavetables, granular synthesis, recording, and sample playback:

```javascript
// Allocate an empty buffer: 44100 frames (1 second at 44.1kHz), mono
sonic.send('/b_alloc', 0, 44100, 1);

// Fill it with a waveform for wavetable synthesis
sonic.send('/b_gen', 0, 'sine1', 7, 1, 0.5, 0.25, 0.125);
// Generates harmonics: fundamental + half-amplitude 2nd + quarter 3rd + eighth 4th
```

---

## Scheduling: JavaScript is Your Sequencer

SuperSonic doesn't have a built-in sequencer, arpeggiator, or pattern engine. **Your JavaScript code is the sequencer.** This is actually a strength — you can build exactly the timing behavior you want using standard programming:

### Simple Arpeggiator

```javascript
const notes = [60, 64, 67, 72];  // C major arpeggio
let step = 0;

setInterval(() => {
  const id = nextId++;
  sonic.send('/s_new', 'sonic-pi-pluck', id, 0, 1,
    'note', notes[step % notes.length], 'amp', 0.5);
  step++;
}, 200);  // 200ms per step = 300 BPM sixteenths
```

### Probability-Based Sequencing

```javascript
// Trigger a random note from a scale with 60% probability each beat
setInterval(() => {
  if (Math.random() < 0.6) {
    const scale = [60, 63, 65, 67, 70];  // C minor pentatonic
    const note = scale[Math.floor(Math.random() * scale.length)];
    sonic.send('/s_new', 'sonic-pi-kalimba', nextId++, 0, 1,
      'note', note, 'amp', 0.3 + Math.random() * 0.3);
  }
}, 500);
```

### Euclidean Rhythm

```javascript
// Generate Euclidean rhythm: 5 hits distributed across 8 steps
function euclidean(hits, steps) {
  // Bjorklund's algorithm
  const pattern = Array(steps).fill(0);
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += hits;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[i] = 1;
    }
  }
  return pattern;
}

const pattern = euclidean(5, 8);  // [1, 0, 1, 1, 0, 1, 0, 1]
let beat = 0;

setInterval(() => {
  if (pattern[beat % pattern.length]) {
    sonic.send('/s_new', 'sonic-pi-sc808_closed_hihat', nextId++, 0, 1,
      'amp', 0.4);
  }
  beat++;
}, 150);
```

---

## What You Can't Do (and Why)

| Limitation | Why | What to do instead |
|-----------|-----|-------------------|
| **Design new voices in the browser** | Voice designs (SynthDefs) must be pre-compiled from SuperCollider code on a desktop computer | Use the 128 built-in voices, or install SuperCollider to design custom ones |
| **Stream audio from disk** | No file system access in browsers | Pre-load samples into memory with `loadSample()` |
| **Record to a file** | No file system access | Use the browser's MediaRecorder API on the audio output |
| **Use MIDI hardware directly** | SuperSonic doesn't handle MIDI | Use the Web MIDI API in JavaScript and convert to OSC messages |
| **Parallel DSP processing** | Browser audio runs on a single thread | Keep voice count reasonable; profile if you hear glitches |
| **Sub-millisecond latency** | Browser audio has inherent latency (~5-20ms) | Acceptable for most music; not ideal for live performance response |

---

## The Big Picture

SuperSonic gives you a **world-class synthesizer engine** — the same one that powers SuperCollider, a tool used in academic computer music research, live coding performances, and sound installations for over 25 years — running in a browser tab with zero installation.

You don't need to learn a programming language designed for computer music. You use JavaScript — the most widely known programming language in the world — to sequence, modulate, and control the synth engine. If you've ever:

- Sequenced MIDI notes in a DAW
- Patched modules in VCV Rack or a hardware Eurorack system
- Written Max/MSP patches
- Programmed drums on a step sequencer

...then you already understand the concepts. The difference is that your "DAW" is a web page, your "MIDI" is OSC messages, and your "patch cables" are bus routing commands. The audio engine underneath is the same caliber as what runs on stage.
