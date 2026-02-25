#!/usr/bin/env node
/**
 * generate-osc-synthdefs.cjs
 *
 * Generates .scsyndef binary files for all custom oscillator/generator modules:
 *
 *   Basic waveforms:  saw_osc, pulse_osc, tri_osc
 *   Harmonic:         blip_osc, formant_osc
 *   Noise:            white_noise, pink_noise, crackle, dust
 *   LF Random:        lfnoise0, lfnoise1, lfnoise2
 *
 * Each module follows the same pattern:
 *   - Control-rate base parameters + pan + out_bus
 *   - Audio-rate modulation inputs (added to base values)
 *   - Safety clipping on bus 0 output
 *
 * Used when sclang is not available in the build environment.
 * SuperCollider SynthDef v2 file format:
 *   https://doc.sccode.org/Reference/Synth-Definition-File-Format.html
 *
 * Usage:
 *   node synthdefs/generate-osc-synthdefs.cjs
 */

'use strict';
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'supersonic', 'synthdefs');

// ── Binary helpers ────────────────────────────────────────────────────────────

class BufWriter {
  constructor(size) {
    this.buf = Buffer.alloc(size);
    this.pos = 0;
  }
  pstring(s) {
    this.buf[this.pos++] = s.length;
    this.buf.write(s, this.pos, 'ascii');
    this.pos += s.length;
    return this;
  }
  int32(v) { this.buf.writeInt32BE(v, this.pos); this.pos += 4; return this; }
  int16(v) { this.buf.writeInt16BE(v, this.pos); this.pos += 2; return this; }
  int8(v) { this.buf[this.pos++] = v & 0xff; return this; }
  float32(v) { this.buf.writeFloatBE(v, this.pos); this.pos += 4; return this; }
  result() {
    if (this.pos !== this.buf.length)
      throw new Error(`BufWriter: wrote ${this.pos}, expected ${this.buf.length}`);
    return this.buf;
  }
}

// ── SynthDef model ────────────────────────────────────────────────────────────

class SynthDef {
  constructor(name) {
    this.name = name;
    this.constants = [];
    this._constMap = new Map();
    this.params = [];
    this.ugens = [];
  }

  const(val) {
    const key = String(parseFloat(val.toFixed(8)));
    if (!this._constMap.has(key)) {
      this._constMap.set(key, this.constants.length);
      this.constants.push(val);
    }
    return { sdi: -1, oi: this._constMap.get(key) };
  }

  addParam(name, defaultVal) {
    const idx = this.params.length;
    this.params.push({ name, defaultVal });
    return idx;
  }

  addUGen(className, calcRate, inputs, numOutputs, specialIndex = 0) {
    const idx = this.ugens.length;
    this.ugens.push({
      className,
      calcRate,
      inputs: inputs || [],
      outputs: Array(numOutputs).fill(calcRate),
      specialIndex
    });
    return idx;
  }

  ref(ugenIdx, outputIdx = 0) {
    return { sdi: ugenIdx, oi: outputIdx };
  }

  byteSize() {
    let s = 4 + 4 + 2;
    s += 1 + this.name.length;
    s += 4 + this.constants.length * 4;
    s += 4 + this.params.length * 4;
    s += 4;
    for (const p of this.params) s += 1 + p.name.length + 4;
    s += 4;
    for (const u of this.ugens) {
      s += 1 + u.className.length;
      s += 1;
      s += 4;
      s += 4;
      s += 2;
      s += u.inputs.length * 8;
      s += u.outputs.length;
    }
    s += 2;
    return s;
  }

  toBuffer() {
    const w = new BufWriter(this.byteSize());

    w.buf.write('SCgf', 0, 'ascii'); w.pos = 4;
    w.int32(2);
    w.int16(1);

    w.pstring(this.name);

    w.int32(this.constants.length);
    for (const c of this.constants) w.float32(c);

    w.int32(this.params.length);
    for (const p of this.params) w.float32(p.defaultVal);

    w.int32(this.params.length);
    for (let i = 0; i < this.params.length; i++) {
      w.pstring(this.params[i].name);
      w.int32(i);
    }

    w.int32(this.ugens.length);
    for (const u of this.ugens) {
      w.pstring(u.className);
      w.int8(u.calcRate);
      w.int32(u.inputs.length);
      w.int32(u.outputs.length);
      w.int16(u.specialIndex);
      for (const inp of u.inputs) {
        w.int32(inp.sdi);
        w.int32(inp.oi);
      }
      for (const rate of u.outputs) w.int8(rate);
    }

    w.int16(0);

    return w.result();
  }
}

// ── UGen rate constants ───────────────────────────────────────────────────────
const SCALAR = 0, CONTROL = 1, AUDIO = 2;

// BinaryOpUGen special index constants
const B_ADD = 0, B_MUL = 2, B_LTE = 10, B_MAX = 13;

// ── General oscillator SynthDef builder ───────────────────────────────────────
//
// Config format:
//   name     — synthdef name (e.g. 'saw_osc')
//   oscUGen  — UGen class name (e.g. 'Saw', 'Blip', 'WhiteNoise')
//   params   — array of parameter descriptors:
//     { name, default, kind, modName?, clamp? }
//
//     kind:
//       'osc' — fed to the oscillator UGen as an input (in declaration order)
//       'amp' — multiplied with the oscillator output (exactly one)
//
//     modName: name of the audio-rate modulation parameter (omit if not modulatable)
//     clamp:   [min, max] → Clip, or [min] → max(val, min)
//              'amp' kind auto-clamps to >= 0 if no clamp specified
//
// All synthdefs automatically get pan (kr) and out_bus (kr),
// plus the standard safety-clip/Select/Out tail.

function buildOscSynthDef(config) {
  const { name, oscUGen, params: paramDefs } = config;
  const sd = new SynthDef(name);

  // ── Constants ───────────────────────────────────────────────────────────────
  const C0  = sd.const(0);
  const C1  = sd.const(1);
  const Cn1 = sd.const(-1);

  // ── Register kr signal params ───────────────────────────────────────────────
  for (const p of paramDefs) {
    sd.addParam(p.name, p.default);
  }
  // pan and out_bus are always last among kr params
  const PI_PAN     = sd.params.length;  sd.addParam('pan', 0);
  const PI_OUT_BUS = sd.params.length;  sd.addParam('out_bus', 0);

  const firstArParam = sd.params.length;

  // ── Register ar modulation params ───────────────────────────────────────────
  for (const p of paramDefs) {
    if (p.modName) {
      sd.addParam(p.modName, 0);
    }
  }

  // ── Control UGens (one per kr param) ────────────────────────────────────────
  const krCount = firstArParam;
  const krUgens = [];
  for (let i = 0; i < krCount; i++) {
    krUgens.push(sd.addUGen('Control', CONTROL, [], 1, i));
  }

  // ── AudioControl UGens (one per ar param) ───────────────────────────────────
  const arCount = sd.params.length - krCount;
  const arUgens = [];
  for (let i = 0; i < arCount; i++) {
    arUgens.push(sd.addUGen('AudioControl', AUDIO, [], 1, krCount + i));
  }

  function krRef(paramIdx) { return sd.ref(krUgens[paramIdx], 0); }
  function arRef(arIdx) { return sd.ref(arUgens[arIdx], 0); }

  // ── Combine base + mod for each signal param ───────────────────────────────
  const combinedRefs = [];
  let arIdx = 0;
  for (let i = 0; i < paramDefs.length; i++) {
    const p = paramDefs[i];
    if (p.modName) {
      // base + mod (audio rate)
      const add = sd.addUGen('BinaryOpUGen', AUDIO,
        [krRef(i), arRef(arIdx)], 1, B_ADD);
      arIdx++;
      let ref = sd.ref(add, 0);

      // Apply clamping
      if (p.clamp && p.clamp.length === 2) {
        // Clip to [min, max]
        const cMin = sd.const(p.clamp[0]);
        const cMax = sd.const(p.clamp[1]);
        const clip = sd.addUGen('Clip', AUDIO, [ref, cMin, cMax], 1);
        ref = sd.ref(clip, 0);
      } else if (p.clamp && p.clamp.length === 1) {
        // max(val, min)
        const cMin = sd.const(p.clamp[0]);
        const mx = sd.addUGen('BinaryOpUGen', AUDIO, [ref, cMin], 1, B_MAX);
        ref = sd.ref(mx, 0);
      } else if (p.kind === 'amp') {
        // amp always >= 0
        const mx = sd.addUGen('BinaryOpUGen', AUDIO, [ref, C0], 1, B_MAX);
        ref = sd.ref(mx, 0);
      }

      combinedRefs.push(ref);
    } else {
      // No modulation — use kr value directly
      combinedRefs.push(krRef(i));
    }
  }

  // ── Build oscillator inputs (collect 'osc' kind params in order) ────────────
  const oscInputs = [];
  let ampRef = null;
  for (let i = 0; i < paramDefs.length; i++) {
    if (paramDefs[i].kind === 'osc') {
      oscInputs.push(combinedRefs[i]);
    } else if (paramDefs[i].kind === 'amp') {
      ampRef = combinedRefs[i];
    }
  }

  // ── Create oscillator UGen ──────────────────────────────────────────────────
  const osc = sd.addUGen(oscUGen, AUDIO, oscInputs, 1);

  // ── sig = osc * finalAmp ────────────────────────────────────────────────────
  let sigRef;
  if (ampRef) {
    const sig = sd.addUGen('BinaryOpUGen', AUDIO,
      [sd.ref(osc, 0), ampRef], 1, B_MUL);
    sigRef = sd.ref(sig, 0);
  } else {
    sigRef = sd.ref(osc, 0);
  }

  // ── Pan2.ar(sig, pan, 1) → [L, R] ──────────────────────────────────────────
  const pan2 = sd.addUGen('Pan2', AUDIO,
    [sigRef, krRef(PI_PAN), C1], 2);

  // ── Safety clip for bus 0 ───────────────────────────────────────────────────
  const clipL = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 1), Cn1, C1], 1);

  // ── out_bus <= 0 ────────────────────────────────────────────────────────────
  const lte = sd.addUGen('BinaryOpUGen', CONTROL,
    [krRef(PI_OUT_BUS), C0], 1, B_LTE);

  // ── Select.ar(cond, [unclipped, clipped]) ───────────────────────────────────
  const selL = sd.addUGen('Select', AUDIO,
    [sd.ref(lte, 0), sd.ref(pan2, 0), sd.ref(clipL, 0)], 1);
  const selR = sd.addUGen('Select', AUDIO,
    [sd.ref(lte, 0), sd.ref(pan2, 1), sd.ref(clipR, 0)], 1);

  // ── Out.ar(out_bus, L, R) ───────────────────────────────────────────────────
  sd.addUGen('Out', AUDIO,
    [krRef(PI_OUT_BUS), sd.ref(selL, 0), sd.ref(selR, 0)], 0);

  return sd.toBuffer();
}

// ── Define all oscillators ───────────────────────────────────────────────────

const OSCILLATORS = [
  // === Basic waveforms ===
  {
    name: 'saw_osc',
    oscUGen: 'Saw',
    params: [
      { name: 'freq', default: 440, kind: 'osc', modName: 'freq_mod' },
      { name: 'amp',  default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'pulse_osc',
    oscUGen: 'Pulse',
    params: [
      { name: 'freq',  default: 440, kind: 'osc', modName: 'freq_mod' },
      { name: 'amp',   default: 0.5, kind: 'amp', modName: 'amp_mod' },
      { name: 'width', default: 0.5, kind: 'osc', modName: 'width_mod', clamp: [0, 1] },
    ],
  },
  {
    name: 'tri_osc',
    oscUGen: 'LFTri',
    params: [
      { name: 'freq', default: 440, kind: 'osc', modName: 'freq_mod' },
      { name: 'amp',  default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  // === Harmonic oscillators ===
  {
    name: 'blip_osc',
    oscUGen: 'Blip',
    params: [
      { name: 'freq',    default: 440, kind: 'osc', modName: 'freq_mod' },
      { name: 'amp',     default: 0.5, kind: 'amp', modName: 'amp_mod' },
      { name: 'numharm', default: 20,  kind: 'osc', modName: 'numharm_mod', clamp: [1, 200] },
    ],
  },
  {
    name: 'formant_osc',
    oscUGen: 'Formant',
    params: [
      { name: 'freq',     default: 440,  kind: 'osc', modName: 'freq_mod' },
      { name: 'amp',      default: 0.5,  kind: 'amp', modName: 'amp_mod' },
      { name: 'formfreq', default: 1760, kind: 'osc', modName: 'formfreq_mod' },
      { name: 'bwfreq',   default: 880,  kind: 'osc', modName: 'bwfreq_mod' },
    ],
  },
  // === Noise generators ===
  {
    name: 'dust',
    oscUGen: 'Dust',
    params: [
      { name: 'density', default: 1,   kind: 'osc', modName: 'density_mod', clamp: [0] },
      { name: 'amp',     default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'crackle',
    oscUGen: 'Crackle',
    params: [
      { name: 'chaos', default: 1.5, kind: 'osc', modName: 'chaos_mod', clamp: [1, 2] },
      { name: 'amp',   default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'white_noise',
    oscUGen: 'WhiteNoise',
    params: [
      { name: 'amp', default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'pink_noise',
    oscUGen: 'PinkNoise',
    params: [
      { name: 'amp', default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  // === LF random (modulation sources) ===
  {
    name: 'lfnoise0',
    oscUGen: 'LFNoise0',
    params: [
      { name: 'freq', default: 4,   kind: 'osc', modName: 'freq_mod', clamp: [0.01] },
      { name: 'amp',  default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'lfnoise1',
    oscUGen: 'LFNoise1',
    params: [
      { name: 'freq', default: 4,   kind: 'osc', modName: 'freq_mod', clamp: [0.01] },
      { name: 'amp',  default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
  {
    name: 'lfnoise2',
    oscUGen: 'LFNoise2',
    params: [
      { name: 'freq', default: 4,   kind: 'osc', modName: 'freq_mod', clamp: [0.01] },
      { name: 'amp',  default: 0.5, kind: 'amp', modName: 'amp_mod' },
    ],
  },
];

// ── Generate and write all synthdefs ─────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

let ok = 0, fail = 0;

for (const spec of OSCILLATORS) {
  try {
    const buf = buildOscSynthDef(spec);
    const outPath = path.join(OUT_DIR, `${spec.name}.scsyndef`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${spec.name}.scsyndef … ok (${buf.length} bytes)`);
    ok++;
  } catch (e) {
    console.error(`  ${spec.name}.scsyndef … FAILED: ${e.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
if (fail > 0) process.exit(1);
