#!/usr/bin/env node
/**
 * generate-filter-synthdefs.js
 *
 * Generates .scsyndef binary files for filter and delay synths:
 * lpf, hpf, bpf, brf, rlpf, rhpf, moog, moogff, resonz, comb
 *
 * Used when sclang is not available in the build environment.
 * SuperCollider SynthDef v2 file format:
 *   https://doc.sccode.org/Reference/Synth-Definition-File-Format.html
 *
 * Usage:
 *   node synthdefs/generate-filter-synthdefs.js
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

  // Add or reuse a constant; returns { sdi: -1, oi: constIdx }
  const(val) {
    const key = String(parseFloat(val.toFixed(8)));
    if (!this._constMap.has(key)) {
      this._constMap.set(key, this.constants.length);
      this.constants.push(val);
    }
    return { sdi: -1, oi: this._constMap.get(key) };
  }

  // Add parameter; returns its index
  addParam(name, defaultVal) {
    const idx = this.params.length;
    this.params.push({ name, defaultVal });
    return idx;
  }

  // Add a UGen; returns its index
  // inputs: array of { sdi, oi }
  // numOutputs: number
  // calcRate: 0=scalar,1=control,2=audio
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

  // Reference to ugen output
  ref(ugenIdx, outputIdx = 0) {
    return { sdi: ugenIdx, oi: outputIdx };
  }

  // ── Size calculation ──────────────────────────────────────────────────────
  byteSize() {
    let s = 4 + 4 + 2;          // magic + version + numDefs
    s += 1 + this.name.length;   // synthdef name (pstring)
    s += 4 + this.constants.length * 4;  // constants
    s += 4 + this.params.length * 4;     // param defaults
    s += 4;                              // numParamNames
    for (const p of this.params) s += 1 + p.name.length + 4;
    s += 4;                              // numUGens
    for (const u of this.ugens) {
      s += 1 + u.className.length;   // class name pstring
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

  // ── Serialize to binary ────────────────────────────────────────────────────
  toBuffer() {
    const w = new BufWriter(this.byteSize());

    // Header
    w.buf.write('SCgf', 0, 'ascii'); w.pos = 4;
    w.int32(2);         // version
    w.int16(1);         // 1 def per file

    // Name
    w.pstring(this.name);

    // Constants
    w.int32(this.constants.length);
    for (const c of this.constants) w.float32(c);

    // Param defaults
    w.int32(this.params.length);
    for (const p of this.params) w.float32(p.defaultVal);

    // Param names
    w.int32(this.params.length);
    for (let i = 0; i < this.params.length; i++) {
      w.pstring(this.params[i].name);
      w.int32(i);
    }

    // UGens
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

    // Variants
    w.int16(0);

    return w.result();
  }
}

// ── UGen rate constants ───────────────────────────────────────────────────────
const SCALAR = 0, CONTROL = 1, AUDIO = 2;

// BinaryOpUGen special index constants
const B_ADD = 0, B_SUB = 1, B_MUL = 2, B_LTE = 10, B_MAX = 13;

// ── Filter SynthDef builder ───────────────────────────────────────────────────
//
// All filter FX follow this pattern:
//
// Parameters (all kr unless noted):
//   in_bus   - input audio bus
//   out_bus  - output audio bus
//   cutoff   - cutoff frequency Hz
//   [res]    - resonance / Q (filter-dependent)
//   [bw]     - bandwidth in octaves (BPF/BRF)
//   [gain]   - input gain (MoogFF only)
//   mix      - dry/wet 0..1
//   cutoff_mod (ar) - audio-rate cutoff modulation
//   [res_mod] (ar) - audio-rate resonance modulation
//   [bw_mod]  (ar) - audio-rate bandwidth modulation
//
// Signal flow:
//   In.ar(in_bus, 2) → [dry_L, dry_R]
//   finalCutoff = clip(cutoff_kr + cutoff_mod_ar, 20, 20000)
//   finalRes/Bw = clip(res_kr + res_mod_ar, ...)
//   wet_L = FilterUGen.ar(dry_L, finalCutoff, [finalRes/Bw])
//   wet_R = FilterUGen.ar(dry_R, finalCutoff, [finalRes/Bw])
//   pan = mix * 2 - 1
//   out_L = XFade2.ar(dry_L, wet_L, pan)
//   out_R = XFade2.ar(dry_R, wet_R, pan)
//   safe = Select(out_bus <= 0, [out, clip(out, -1, 1)])
//   Out.ar(out_bus, safe_L, safe_R)
//
// Note on Control UGens in scsyndef format:
//   - Each kr param gets its own Control UGen with special=paramIndex
//   - Each ar param gets its own AudioControl UGen with special=paramIndex
//   - UGen output is referenced by that UGen's index, output 0

function buildFilterSynthDef(opts) {
  const {
    name,
    filterUGen,           // e.g. 'LPF', 'RLPF', 'MoogFF'
    cutoffDefault,
    hasRes,               // true if filter takes res param
    resDefault,
    resMin, resMax,
    hasBw,                // true if filter takes bw param
    bwDefault,
    hasGain,              // true if filter takes gain param (MoogFF)
    gainDefault,
  } = opts;

  const sd = new SynthDef(name);

  // ── Register constants up front ──────────────────────────────────────────
  const C0  = sd.const(0);
  const C1  = sd.const(1);
  const Cn1 = sd.const(-1);
  const C2  = sd.const(2);
  const C20 = sd.const(20);
  const C20k = sd.const(20000);
  // res/bw clamping constants (only allocated if used)
  let resCmin, resCmax, bwCmin;

  // ── Add parameters ────────────────────────────────────────────────────────
  const PI_IN_BUS  = sd.addParam('in_bus',  0);
  const PI_OUT_BUS = sd.addParam('out_bus', 0);
  const PI_CUTOFF  = sd.addParam('cutoff',  cutoffDefault);
  if (hasRes) {
    sd.addParam('res', resDefault);
    resCmin = sd.const(resMin);
    resCmax = sd.const(resMax);
  }
  if (hasBw) {
    sd.addParam('bw', bwDefault);
    bwCmin = sd.const(0.01);
  }
  if (hasGain) {
    sd.addParam('gain', gainDefault);
  }
  const PI_MIX = sd.params.length; // will be added next
  sd.addParam('mix', 1);

  // Audio-rate params
  const PI_CUTOFF_MOD = sd.params.length;
  sd.addParam('cutoff_mod', 0);
  let PI_RES_MOD = -1, PI_BW_MOD = -1;
  if (hasRes) {
    PI_RES_MOD = sd.params.length;
    sd.addParam('res_mod', 0);
  }
  if (hasBw) {
    PI_BW_MOD = sd.params.length;
    sd.addParam('bw_mod', 0);
  }

  // ── Add UGens ─────────────────────────────────────────────────────────────
  //
  // Control UGens: one per kr param, special = param index
  //
  const krParamCount = PI_CUTOFF_MOD; // all params before audio-rate ones

  // Create individual Control UGens for each kr param
  const ctrlUgens = [];
  for (let i = 0; i < krParamCount; i++) {
    ctrlUgens.push(sd.addUGen('Control', CONTROL, [], 1, i));
  }

  // Create individual AudioControl UGens for each ar param
  const arParamCount = sd.params.length - krParamCount;
  const arCtrlUgens = [];
  for (let i = 0; i < arParamCount; i++) {
    arCtrlUgens.push(sd.addUGen('AudioControl', AUDIO, [], 1, krParamCount + i));
  }

  // Shorthand to reference a kr Control UGen
  function krRef(paramIdx) {
    return sd.ref(ctrlUgens[paramIdx], 0);
  }
  // Shorthand to reference an ar AudioControl UGen
  function arRef(paramIdx) {
    const arIdx = paramIdx - krParamCount;
    return sd.ref(arCtrlUgens[arIdx], 0);
  }

  // ── In.ar(in_bus, 2) → stereo ────────────────────────────────────────────
  const inUgen = sd.addUGen('In', AUDIO, [krRef(PI_IN_BUS)], 2);
  const dryL = sd.ref(inUgen, 0);
  const dryR = sd.ref(inUgen, 1);

  // ── Compute finalCutoff = clip(cutoff + cutoff_mod, 20, 20000) ────────────
  const addCutoff = sd.addUGen('BinaryOpUGen', AUDIO, [
    krRef(PI_CUTOFF), arRef(PI_CUTOFF_MOD)
  ], 1, B_ADD);
  const finalCutoff = sd.addUGen('Clip', AUDIO, [
    sd.ref(addCutoff, 0), C20, C20k
  ], 1);

  // ── Compute finalRes / finalBw (if applicable) ────────────────────────────
  let finalResRef = null, finalBwRef = null;

  const PI_RES = 3; // param index of 'res' (after in_bus, out_bus, cutoff)
  const PI_BW_DIRECT = hasRes ? 4 : 3; // bw param index depends on res

  if (hasRes) {
    const addRes = sd.addUGen('BinaryOpUGen', AUDIO, [
      krRef(PI_RES), arRef(PI_RES_MOD)
    ], 1, B_ADD);
    const clampedRes = sd.addUGen('Clip', AUDIO, [
      sd.ref(addRes, 0), resCmin, resCmax
    ], 1);
    finalResRef = sd.ref(clampedRes, 0);
  }

  if (hasBw) {
    const PI_BW = hasRes ? 4 : 3;
    const addBw = sd.addUGen('BinaryOpUGen', AUDIO, [
      krRef(PI_BW), arRef(PI_BW_MOD)
    ], 1, B_ADD);
    const clampedBw = sd.addUGen('BinaryOpUGen', AUDIO, [
      sd.ref(addBw, 0), bwCmin
    ], 1, B_MAX);
    finalBwRef = sd.ref(clampedBw, 0);
  }

  // ── Apply gain before filter (MoogFF only) ────────────────────────────────
  let filterInputL = dryL, filterInputR = dryR;
  if (hasGain) {
    const PI_GAIN = hasRes ? 4 : 3; // gain comes after cutoff in MoogFF
    const gainL = sd.addUGen('BinaryOpUGen', AUDIO, [dryL, krRef(PI_GAIN)], 1, B_MUL);
    const gainR = sd.addUGen('BinaryOpUGen', AUDIO, [dryR, krRef(PI_GAIN)], 1, B_MUL);
    filterInputL = sd.ref(gainL, 0);
    filterInputR = sd.ref(gainR, 0);
  }

  // ── Filter UGen (stereo: apply to L and R) ────────────────────────────────
  function makeFilterInputs(inputRef) {
    const inputs = [inputRef, sd.ref(finalCutoff, 0)];
    if (hasRes) inputs.push(finalResRef);
    if (hasBw)  inputs.push(finalBwRef);
    return inputs;
  }

  const wetL = sd.addUGen(filterUGen, AUDIO, makeFilterInputs(filterInputL), 1);
  const wetR = sd.addUGen(filterUGen, AUDIO, makeFilterInputs(filterInputR), 1);

  // ── XFade2 for dry/wet mix ────────────────────────────────────────────────
  // pan = mix * 2 - 1  (control rate)
  const mixRef = krRef(PI_MIX);
  const mixTimes2 = sd.addUGen('BinaryOpUGen', CONTROL, [mixRef, C2], 1, B_MUL);
  const pan = sd.addUGen('BinaryOpUGen', CONTROL, [sd.ref(mixTimes2, 0), C1], 1, B_SUB);
  const panRef = sd.ref(pan, 0);

  const outL = sd.addUGen('XFade2', AUDIO, [dryL, sd.ref(wetL, 0), panRef, C1], 1);
  const outR = sd.addUGen('XFade2', AUDIO, [dryR, sd.ref(wetR, 0), panRef, C1], 1);

  // ── Safety clip for bus 0 ─────────────────────────────────────────────────
  // Clip L and R to -1..1
  const clipL = sd.addUGen('Clip', AUDIO, [sd.ref(outL, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO, [sd.ref(outR, 0), Cn1, C1], 1);

  // out_bus <= 0  (BinaryOpUGen with special 10 = <=)
  const outBusRef = krRef(PI_OUT_BUS);
  const lteZero = sd.addUGen('BinaryOpUGen', CONTROL, [outBusRef, C0], 1, B_LTE);
  const lteRef = sd.ref(lteZero, 0);

  // Select.ar(out_bus<=0, original, clipped)
  const selL = sd.addUGen('Select', AUDIO, [lteRef, sd.ref(outL, 0), sd.ref(clipL, 0)], 1);
  const selR = sd.addUGen('Select', AUDIO, [lteRef, sd.ref(outR, 0), sd.ref(clipR, 0)], 1);

  // Out.ar(out_bus, L, R)
  sd.addUGen('Out', AUDIO, [outBusRef, sd.ref(selL, 0), sd.ref(selR, 0)], 0);

  return sd.toBuffer();
}

// ── Define all 8 filters ──────────────────────────────────────────────────────

const FILTERS = [
  {
    name: 'lpf',
    filterUGen: 'LPF',
    cutoffDefault: 1000,
    hasRes: false, hasBw: false, hasGain: false,
  },
  {
    name: 'hpf',
    filterUGen: 'HPF',
    cutoffDefault: 500,
    hasRes: false, hasBw: false, hasGain: false,
  },
  {
    name: 'bpf',
    filterUGen: 'BPF',
    cutoffDefault: 1000,
    hasRes: false,
    hasBw: true, bwDefault: 1,
    hasGain: false,
  },
  {
    name: 'brf',
    filterUGen: 'BRF',
    cutoffDefault: 1000,
    hasRes: false,
    hasBw: true, bwDefault: 1,
    hasGain: false,
  },
  {
    name: 'rlpf',
    filterUGen: 'RLPF',
    cutoffDefault: 1000,
    hasRes: true, resDefault: 0.5, resMin: 0.001, resMax: 1,
    hasBw: false, hasGain: false,
  },
  {
    name: 'rhpf',
    filterUGen: 'RHPF',
    cutoffDefault: 500,
    hasRes: true, resDefault: 0.5, resMin: 0.001, resMax: 1,
    hasBw: false, hasGain: false,
  },
  {
    name: 'moog',
    filterUGen: 'MoogFF',
    cutoffDefault: 1000,
    hasRes: true, resDefault: 1, resMin: 0, resMax: 4,
    hasBw: false, hasGain: false,
  },
  {
    name: 'moogff',
    filterUGen: 'MoogFF',
    cutoffDefault: 1000,
    hasRes: true, resDefault: 2, resMin: 0, resMax: 4,
    hasBw: false,
    hasGain: true, gainDefault: 1,
  },
  {
    name: 'resonz',
    filterUGen: 'Resonz',
    cutoffDefault: 1000,
    hasRes: false,
    hasBw: true, bwDefault: 0.5,
    hasGain: false,
  },
];

// ── Comb Filter SynthDef builder ─────────────────────────────────────────────
//
// CombC delay filter — different parameter structure from frequency filters.
//
// Parameters (all kr unless noted):
//   in_bus        - input audio bus
//   out_bus       - output audio bus
//   delaytime     - delay time in seconds (sets comb pitch ≈ 1/delaytime Hz)
//   decaytime     - 60 dB decay time in seconds
//   mix           - dry/wet 0..1
//   delaytime_mod (ar) - audio-rate delay modulation
//   decaytime_mod (ar) - audio-rate decay modulation
//
// Signal flow:
//   In.ar(in_bus, 2) → [dry_L, dry_R]
//   finalDelay = clip(delaytime + delaytime_mod, 0.0001, 1.0)
//   finalDecay = clip(decaytime + decaytime_mod, 0.01, 20)
//   wet = CombC.ar(dry, 1.0, finalDelay, finalDecay)
//   pan = mix * 2 - 1
//   out = XFade2.ar(dry, wet, pan)
//   safe = Select(out_bus <= 0, [out, clip(out)])
//   Out.ar(out_bus, safe)

function buildCombSynthDef() {
  const sd = new SynthDef('comb');

  // ── Constants ──────────────────────────────────────────────────────────────
  const C0     = sd.const(0);
  const C1     = sd.const(1);
  const Cn1    = sd.const(-1);
  const C2     = sd.const(2);
  const C0001  = sd.const(0.0001);  // min delay time
  const C1_0   = C1;                // max delay time (reuse constant 1.0)
  const C001   = sd.const(0.01);    // min decay time
  const C20    = sd.const(20);      // max decay time

  // ── Parameters ─────────────────────────────────────────────────────────────
  const PI_IN_BUS    = sd.addParam('in_bus',    0);
  const PI_OUT_BUS   = sd.addParam('out_bus',   0);
  const PI_DELAYTIME = sd.addParam('delaytime', 0.2);
  const PI_DECAYTIME = sd.addParam('decaytime', 1.0);
  const PI_MIX       = sd.addParam('mix',       0.5);

  // Audio-rate params
  const PI_DELAYTIME_MOD = sd.params.length;
  sd.addParam('delaytime_mod', 0);
  const PI_DECAYTIME_MOD = sd.params.length;
  sd.addParam('decaytime_mod', 0);

  // ── UGens ──────────────────────────────────────────────────────────────────
  const krParamCount = PI_DELAYTIME_MOD; // 5 kr params before ar ones

  // Individual Control UGens for each kr param
  const ctrlUgens = [];
  for (let i = 0; i < krParamCount; i++) {
    ctrlUgens.push(sd.addUGen('Control', CONTROL, [], 1, i));
  }

  // Individual AudioControl UGens for each ar param
  const arParamCount = sd.params.length - krParamCount;
  const arCtrlUgens = [];
  for (let i = 0; i < arParamCount; i++) {
    arCtrlUgens.push(sd.addUGen('AudioControl', AUDIO, [], 1, krParamCount + i));
  }

  function krRef(paramIdx) { return sd.ref(ctrlUgens[paramIdx], 0); }
  function arRef(paramIdx) {
    return sd.ref(arCtrlUgens[paramIdx - krParamCount], 0);
  }

  // ── In.ar(in_bus, 2) → stereo ──────────────────────────────────────────────
  const inUgen = sd.addUGen('In', AUDIO, [krRef(PI_IN_BUS)], 2);
  const dryL = sd.ref(inUgen, 0);
  const dryR = sd.ref(inUgen, 1);

  // ── finalDelay = clip(delaytime + delaytime_mod, 0.0001, 1.0) ─────────────
  const addDelay = sd.addUGen('BinaryOpUGen', AUDIO, [
    krRef(PI_DELAYTIME), arRef(PI_DELAYTIME_MOD)
  ], 1, B_ADD);
  const finalDelay = sd.addUGen('Clip', AUDIO, [
    sd.ref(addDelay, 0), C0001, C1_0
  ], 1);

  // ── finalDecay = clip(decaytime + decaytime_mod, 0.01, 20) ────────────────
  const addDecay = sd.addUGen('BinaryOpUGen', AUDIO, [
    krRef(PI_DECAYTIME), arRef(PI_DECAYTIME_MOD)
  ], 1, B_ADD);
  const finalDecay = sd.addUGen('Clip', AUDIO, [
    sd.ref(addDecay, 0), C001, C20
  ], 1);

  // ── CombC.ar(in, maxdelaytime=1.0, delaytime, decaytime) ──────────────────
  const wetL = sd.addUGen('CombC', AUDIO, [
    dryL, C1_0, sd.ref(finalDelay, 0), sd.ref(finalDecay, 0)
  ], 1);
  const wetR = sd.addUGen('CombC', AUDIO, [
    dryR, C1_0, sd.ref(finalDelay, 0), sd.ref(finalDecay, 0)
  ], 1);

  // ── XFade2 for dry/wet mix ────────────────────────────────────────────────
  const mixRef = krRef(PI_MIX);
  const mixTimes2 = sd.addUGen('BinaryOpUGen', CONTROL, [mixRef, C2], 1, B_MUL);
  const pan = sd.addUGen('BinaryOpUGen', CONTROL, [sd.ref(mixTimes2, 0), C1], 1, B_SUB);
  const panRef = sd.ref(pan, 0);

  const outL = sd.addUGen('XFade2', AUDIO, [dryL, sd.ref(wetL, 0), panRef, C1], 1);
  const outR = sd.addUGen('XFade2', AUDIO, [dryR, sd.ref(wetR, 0), panRef, C1], 1);

  // ── Safety clip for bus 0 ─────────────────────────────────────────────────
  const clipL = sd.addUGen('Clip', AUDIO, [sd.ref(outL, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO, [sd.ref(outR, 0), Cn1, C1], 1);

  const outBusRef = krRef(PI_OUT_BUS);
  const lteZero = sd.addUGen('BinaryOpUGen', CONTROL, [outBusRef, C0], 1, B_LTE);
  const lteRef = sd.ref(lteZero, 0);

  const selL = sd.addUGen('Select', AUDIO, [lteRef, sd.ref(outL, 0), sd.ref(clipL, 0)], 1);
  const selR = sd.addUGen('Select', AUDIO, [lteRef, sd.ref(outR, 0), sd.ref(clipR, 0)], 1);

  sd.addUGen('Out', AUDIO, [outBusRef, sd.ref(selL, 0), sd.ref(selR, 0)], 0);

  return sd.toBuffer();
}

// ── Generate and write all synthdefs ─────────────────────────────────────────

let ok = 0, fail = 0;

for (const spec of FILTERS) {
  try {
    const buf = buildFilterSynthDef(spec);
    const outPath = path.join(OUT_DIR, `${spec.name}.scsyndef`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${spec.name}.scsyndef … ok (${buf.length} bytes)`);
    ok++;
  } catch (e) {
    console.error(`  ${spec.name}.scsyndef … FAILED: ${e.message}`);
    fail++;
  }
}

// Generate comb filter (separate builder)
try {
  const buf = buildCombSynthDef();
  const outPath = path.join(OUT_DIR, 'comb.scsyndef');
  fs.writeFileSync(outPath, buf);
  console.log(`  comb.scsyndef … ok (${buf.length} bytes)`);
  ok++;
} catch (e) {
  console.error(`  comb.scsyndef … FAILED: ${e.message}`);
  fail++;
}

console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
if (fail > 0) process.exit(1);
