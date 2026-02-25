#!/usr/bin/env node
/**
 * generate-osc-synthdefs.cjs
 *
 * Generates .scsyndef binary files for 3 basic waveform oscillators:
 * saw_osc, pulse_osc, tri_osc
 *
 * Each oscillator follows the same pattern as sine.scd:
 *   - Control-rate base parameters (freq, amp, [width], pan, out_bus)
 *   - Audio-rate modulation inputs (freq_mod, amp_mod, [width_mod])
 *   - Modulation is added to base values
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
    this.params = [];      // { name, defaultVal }
    this.ugens = [];       // { className, calcRate, inputs, outputs, specialIndex }
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
    let s = 4 + 4 + 2;          // magic + version + numDefs
    s += 1 + this.name.length;   // synthdef name (pstring)
    s += 4 + this.constants.length * 4;  // constants
    s += 4 + this.params.length * 4;     // param defaults
    s += 4;                              // numParamNames
    for (const p of this.params) s += 1 + p.name.length + 4;
    s += 4;                              // numUGens
    for (const u of this.ugens) {
      s += 1 + u.className.length;
      s += 1;                         // calcRate
      s += 4;                         // numInputs
      s += 4;                         // numOutputs
      s += 2;                         // specialIndex
      s += u.inputs.length * 8;       // inputs (2x int32 each)
      s += u.outputs.length;          // output calc rates
    }
    s += 2;                            // numVariants
    return s;
  }

  toBuffer() {
    const w = new BufWriter(this.byteSize());

    w.buf.write('SCgf', 0, 'ascii'); w.pos = 4;
    w.int32(2);         // version
    w.int16(1);         // 1 def per file

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

    w.int16(0);  // variants

    return w.result();
  }
}

// ── UGen rate constants ───────────────────────────────────────────────────────
const SCALAR = 0, CONTROL = 1, AUDIO = 2;

// BinaryOpUGen special index constants
const B_ADD = 0, B_MUL = 2, B_LTE = 10, B_MAX = 13;

// ── Oscillator SynthDef builder ───────────────────────────────────────────────
//
// All source oscillators follow this pattern:
//
// Parameters (kr):
//   freq      - base frequency Hz (default 440)
//   amp       - base amplitude 0..1 (default 0.5)
//   [width]   - pulse width 0..1 (Pulse only, default 0.5)
//   pan       - stereo position -1..+1 (default 0)
//   out_bus   - audio bus index (default 0)
//
// Parameters (ar):
//   freq_mod  - audio-rate frequency modulation
//   amp_mod   - audio-rate amplitude modulation
//   [width_mod] - audio-rate pulse width modulation (Pulse only)
//
// Signal flow:
//   finalFreq  = freq + freq_mod
//   finalAmp   = max(amp + amp_mod, 0)
//   [finalWidth = clip(width + width_mod, 0, 1)]
//   sig        = OscUGen.ar(finalFreq, ...) * finalAmp
//   stereo     = Pan2.ar(sig, pan, 1)
//   safe       = Select.ar(out_bus <= 0, [stereo, clip(stereo)])
//   Out.ar(out_bus, safe)

function buildOscSynthDef(config) {
  const { name, oscUGen, hasWidth } = config;

  const sd = new SynthDef(name);

  // ── Constants ───────────────────────────────────────────────────────────────
  const C0  = sd.const(0);
  const C1  = sd.const(1);
  const Cn1 = sd.const(-1);

  // ── kr parameters ───────────────────────────────────────────────────────────
  const PI_FREQ    = sd.addParam('freq', 440);
  const PI_AMP     = sd.addParam('amp', 0.5);
  let PI_WIDTH = -1;
  if (hasWidth) {
    PI_WIDTH = sd.addParam('width', 0.5);
  }
  const PI_PAN     = sd.addParam('pan', 0);
  const PI_OUT_BUS = sd.addParam('out_bus', 0);

  // ── ar parameters ───────────────────────────────────────────────────────────
  const firstArParam = sd.params.length;
  const PI_FREQ_MOD = sd.addParam('freq_mod', 0);
  const PI_AMP_MOD  = sd.addParam('amp_mod', 0);
  let PI_WIDTH_MOD = -1;
  if (hasWidth) {
    PI_WIDTH_MOD = sd.addParam('width_mod', 0);
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
  function arRef(paramIdx) { return sd.ref(arUgens[paramIdx - krCount], 0); }

  // ── finalFreq = freq + freq_mod ─────────────────────────────────────────────
  const addFreq = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_FREQ), arRef(PI_FREQ_MOD)], 1, B_ADD);

  // ── finalAmp = max(amp + amp_mod, 0) ────────────────────────────────────────
  const addAmp = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_AMP), arRef(PI_AMP_MOD)], 1, B_ADD);
  const finalAmp = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(addAmp, 0), C0], 1, B_MAX);

  // ── finalWidth = clip(width + width_mod, 0, 1) (Pulse only) ────────────────
  let finalWidthRef = null;
  if (hasWidth) {
    const addWidth = sd.addUGen('BinaryOpUGen', AUDIO,
      [krRef(PI_WIDTH), arRef(PI_WIDTH_MOD)], 1, B_ADD);
    const clipWidth = sd.addUGen('Clip', AUDIO,
      [sd.ref(addWidth, 0), C0, C1], 1);
    finalWidthRef = sd.ref(clipWidth, 0);
  }

  // ── Oscillator UGen ─────────────────────────────────────────────────────────
  const oscInputs = [sd.ref(addFreq, 0)];
  if (hasWidth) {
    oscInputs.push(finalWidthRef);
  }
  const osc = sd.addUGen(oscUGen, AUDIO, oscInputs, 1);

  // ── sig = osc * finalAmp ────────────────────────────────────────────────────
  const sig = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(osc, 0), sd.ref(finalAmp, 0)], 1, B_MUL);

  // ── Pan2.ar(sig, pan, 1) → [L, R] ──────────────────────────────────────────
  const pan2 = sd.addUGen('Pan2', AUDIO,
    [sd.ref(sig, 0), krRef(PI_PAN), C1], 2);

  // ── Safety clip for bus 0 ───────────────────────────────────────────────────
  const clipL = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 1), Cn1, C1], 1);

  // ── out_bus <= 0 (condition for Select) ─────────────────────────────────────
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

// ── Define all 3 oscillators ─────────────────────────────────────────────────

const OSCILLATORS = [
  {
    name: 'saw_osc',
    oscUGen: 'Saw',
    hasWidth: false,
  },
  {
    name: 'pulse_osc',
    oscUGen: 'Pulse',
    hasWidth: true,
  },
  {
    name: 'tri_osc',
    oscUGen: 'LFTri',
    hasWidth: false,
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
