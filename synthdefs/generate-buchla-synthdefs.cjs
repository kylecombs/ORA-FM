#!/usr/bin/env node
/**
 * generate-buchla-synthdefs.cjs
 *
 * Generates .scsyndef binary files for Buchla Music Easel-inspired modules:
 *
 *   buchla_osc   — Complex oscillator with continuous waveshaping (sine → saw → square)
 *   lowpass_gate  — Combined VCA + lowpass filter with vactrol-like behavior
 *
 * Used when sclang is not available in the build environment.
 * SuperCollider SynthDef v2 file format:
 *   https://doc.sccode.org/Reference/Synth-Definition-File-Format.html
 *
 * Equivalent SuperCollider source:
 *
 *   // ── buchla_osc ──
 *   SynthDef(\buchla_osc, {
 *     var freq = \freq.kr(440) + \freq_mod.ar(0);
 *     var amp = max(\amp.kr(0.5) + \amp_mod.ar(0), 0);
 *     var timbre = (\timbre.kr(0) + \timbre_mod.ar(0)).clip(0, 1);
 *     var pan = \pan.kr(0);
 *     var out_bus = \out_bus.kr(0);
 *
 *     var sine = SinOsc.ar(freq);
 *     var saw = LFSaw.ar(freq);
 *     var pulse = LFPulse.ar(freq, 0, 0.5) * 2 - 1; // bipolar
 *
 *     // 3-way crossfade: sine → saw → square
 *     var seg1 = (timbre * 4 - 1).clip(-1, 1);
 *     var seg2 = (timbre * 4 - 3).clip(-1, 1);
 *     var mix1 = XFade2.ar(sine, saw, seg1, 1);
 *     var sig = XFade2.ar(mix1, pulse, seg2, 1) * amp;
 *
 *     var panned = Pan2.ar(sig, pan, 1);
 *     var safe = Select.ar(out_bus <= 0, [panned, panned.clip(-1, 1)]);
 *     Out.ar(out_bus, safe);
 *   }).writeDefFile;
 *
 *   // ── lowpass_gate ──
 *   SynthDef(\lowpass_gate, {
 *     var in_bus = \in_bus.kr(0);
 *     var out_bus = \out_bus.kr(0);
 *     var level = (\level.kr(0.5) + \level_mod.ar(0)).clip(0, 1);
 *     var gate = (\gate.kr(1) + \gate_mod.ar(0)).clip(0, 1);
 *     var mode = \mode.kr(0.5); // 0=LP, 0.5=combo, 1=VCA
 *     var res = \res.kr(0.5);
 *     var mix = \mix.kr(1);
 *
 *     // Combine level and gate: effective = level * gate
 *     var effective = level * gate;
 *
 *     // Vactrol-like lag on effective level for organic response
 *     var smoothLevel = Lag.kr(effective, 0.01);
 *
 *     // Map level to cutoff: exponential 20 Hz → 20 kHz
 *     var cutoff = (smoothLevel * 20000).max(20).min(20000);
 *
 *     var sig = In.ar(in_bus, 2);
 *     var dry = sig;
 *
 *     // LP filter path
 *     var filteredL = RLPF.ar(sig[0], cutoff, 1 - res * 0.99);
 *     var filteredR = RLPF.ar(sig[1], cutoff, 1 - res * 0.99);
 *
 *     // VCA path (amplitude only)
 *     var vcaL = sig[0] * smoothLevel;
 *     var vcaR = sig[1] * smoothLevel;
 *
 *     // Combo path (filter + amplitude)
 *     var comboL = filteredL * smoothLevel;
 *     var comboR = filteredR * smoothLevel;
 *
 *     // 3-way mode crossfade: LP → combo → VCA
 *     var seg1 = (mode * 4 - 1).clip(-1, 1);
 *     var seg2 = (mode * 4 - 3).clip(-1, 1);
 *     var mix1L = XFade2.ar(filteredL, comboL, seg1, 1);
 *     var outL = XFade2.ar(mix1L, vcaL, seg2, 1);
 *     var mix1R = XFade2.ar(filteredR, comboR, seg1, 1);
 *     var outR = XFade2.ar(mix1R, vcaR, seg2, 1);
 *
 *     // Dry/wet mix
 *     var mixPan = mix * 2 - 1;
 *     outL = XFade2.ar(dry[0], outL, mixPan, 1);
 *     outR = XFade2.ar(dry[1], outR, mixPan, 1);
 *
 *     // Safety clip
 *     var safe = Select.ar(out_bus <= 0, [[outL, outR], [outL.clip(-1,1), outR.clip(-1,1)]]);
 *     Out.ar(out_bus, safe);
 *   }).writeDefFile;
 *
 * Usage:
 *   node synthdefs/generate-buchla-synthdefs.cjs
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

// BinaryOpUGen special indices
const B_ADD = 0, B_SUB = 1, B_MUL = 2, B_LTE = 10, B_MAX = 13, B_MIN = 12;

// UnaryOpUGen special indices
// (not used here but kept for reference)

// ══════════════════════════════════════════════════════════════════════════════
//  BUCHLA_OSC — Complex oscillator with continuous waveshaping
// ══════════════════════════════════════════════════════════════════════════════
//
// Morphs continuously between sine → sawtooth → square using the timbre param.
// timbre 0.0 = pure sine
// timbre 0.5 = pure sawtooth
// timbre 1.0 = pure square (pulse with width 0.5)
//
// Inspired by the Buchla Music Easel's Principal Oscillator.

function buildBuchlaOsc() {
  const sd = new SynthDef('buchla_osc');

  // Constants
  const C0   = sd.const(0);
  const C1   = sd.const(1);
  const Cn1  = sd.const(-1);
  const C05  = sd.const(0.5);
  const C2   = sd.const(2);
  const C4   = sd.const(4);
  const C3   = sd.const(3);

  // ── kr parameters ──
  const PI_FREQ    = sd.addParam('freq', 440);
  const PI_AMP     = sd.addParam('amp', 0.5);
  const PI_TIMBRE  = sd.addParam('timbre', 0);
  const PI_PAN     = sd.addParam('pan', 0);
  const PI_OUT_BUS = sd.addParam('out_bus', 0);

  // ── ar modulation parameters ──
  const krCount = sd.params.length;
  const PI_FREQ_MOD   = sd.addParam('freq_mod', 0);
  const PI_AMP_MOD    = sd.addParam('amp_mod', 0);
  const PI_TIMBRE_MOD = sd.addParam('timbre_mod', 0);

  // ── Control UGens (one per kr param) ──
  const krUgens = [];
  for (let i = 0; i < krCount; i++) {
    krUgens.push(sd.addUGen('Control', CONTROL, [], 1, i));
  }

  // ── AudioControl UGens (one per ar param) ──
  const arCount = sd.params.length - krCount;
  const arUgens = [];
  for (let i = 0; i < arCount; i++) {
    arUgens.push(sd.addUGen('AudioControl', AUDIO, [], 1, krCount + i));
  }

  function krRef(paramIdx) { return sd.ref(krUgens[paramIdx], 0); }
  function arRef(arIdx) { return sd.ref(arUgens[arIdx], 0); }

  // ── freq = freq_kr + freq_mod_ar ──
  const addFreq = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_FREQ), arRef(0)], 1, B_ADD);
  const freqRef = sd.ref(addFreq, 0);

  // ── amp = max(amp_kr + amp_mod_ar, 0) ──
  const addAmp = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_AMP), arRef(1)], 1, B_ADD);
  const clampAmp = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(addAmp, 0), C0], 1, B_MAX);
  const ampRef = sd.ref(clampAmp, 0);

  // ── timbre = clip(timbre_kr + timbre_mod_ar, 0, 1) ──
  const addTimbre = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_TIMBRE), arRef(2)], 1, B_ADD);
  const clipTimbre = sd.addUGen('Clip', AUDIO,
    [sd.ref(addTimbre, 0), C0, C1], 1);
  const timbreRef = sd.ref(clipTimbre, 0);

  // ── Generate three waveforms at the same frequency ──

  // SinOsc.ar(freq)
  const sine = sd.addUGen('SinOsc', AUDIO, [freqRef, C0], 1);

  // LFSaw.ar(freq) — range -1..+1
  const saw = sd.addUGen('LFSaw', AUDIO, [freqRef, C0], 1);

  // LFPulse.ar(freq, 0, 0.5) — outputs 0..1, need to make bipolar
  const pulse_raw = sd.addUGen('LFPulse', AUDIO, [freqRef, C0, C05], 1);
  // bipolar: pulse_raw * 2 - 1
  const pulse_x2 = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(pulse_raw, 0), C2], 1, B_MUL);
  const pulse = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(pulse_x2, 0), C1], 1, B_SUB);

  // ── 3-way crossfade using XFade2 ──
  // seg1_pan = clip(timbre * 4 - 1, -1, 1)
  const timbre_x4 = sd.addUGen('BinaryOpUGen', AUDIO,
    [timbreRef, C4], 1, B_MUL);
  const seg1_raw = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(timbre_x4, 0), C1], 1, B_SUB);
  const seg1_pan = sd.addUGen('Clip', AUDIO,
    [sd.ref(seg1_raw, 0), Cn1, C1], 1);

  // seg2_pan = clip(timbre * 4 - 3, -1, 1)
  const seg2_raw = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(timbre_x4, 0), C3], 1, B_SUB);
  const seg2_pan = sd.addUGen('Clip', AUDIO,
    [sd.ref(seg2_raw, 0), Cn1, C1], 1);

  // mix1 = XFade2.ar(sine, saw, seg1_pan, 1)
  const mix1 = sd.addUGen('XFade2', AUDIO,
    [sd.ref(sine, 0), sd.ref(saw, 0), sd.ref(seg1_pan, 0), C1], 1);

  // morphed = XFade2.ar(mix1, pulse, seg2_pan, 1)
  const morphed = sd.addUGen('XFade2', AUDIO,
    [sd.ref(mix1, 0), sd.ref(pulse, 0), sd.ref(seg2_pan, 0), C1], 1);

  // ── sig = morphed * amp ──
  const sig = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(morphed, 0), ampRef], 1, B_MUL);

  // ── Pan2.ar(sig, pan, 1) ──
  const pan2 = sd.addUGen('Pan2', AUDIO,
    [sd.ref(sig, 0), krRef(PI_PAN), C1], 2);

  // ── Safety clip for bus 0 ──
  const clipL = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO,
    [sd.ref(pan2, 1), Cn1, C1], 1);

  const lte = sd.addUGen('BinaryOpUGen', CONTROL,
    [krRef(PI_OUT_BUS), C0], 1, B_LTE);

  const selL = sd.addUGen('Select', AUDIO,
    [sd.ref(lte, 0), sd.ref(pan2, 0), sd.ref(clipL, 0)], 1);
  const selR = sd.addUGen('Select', AUDIO,
    [sd.ref(lte, 0), sd.ref(pan2, 1), sd.ref(clipR, 0)], 1);

  sd.addUGen('Out', AUDIO,
    [krRef(PI_OUT_BUS), sd.ref(selL, 0), sd.ref(selR, 0)], 0);

  return sd.toBuffer();
}


// ══════════════════════════════════════════════════════════════════════════════
//  LOWPASS_GATE — Combined VCA + lowpass filter (Buchla 292-inspired)
// ══════════════════════════════════════════════════════════════════════════════
//
// The lowpass gate is Buchla's signature circuit: a vactrol-based module that
// simultaneously controls both amplitude and filter cutoff with a single CV.
//
// mode parameter selects behavior:
//   0.0 = LP filter only (signal passes through filter, no amplitude change)
//   0.5 = Combo (VCF + VCA together — classic Buchla "bongo" sound)
//   1.0 = VCA only (pure amplitude gating, no filtering)
//
// level parameter controls the gate opening (maps to both cutoff and amplitude).
// Lag on the level provides the organic vactrol-like response.

function buildLowpassGate() {
  const sd = new SynthDef('lowpass_gate');

  // Constants
  const C0    = sd.const(0);
  const C1    = sd.const(1);
  const Cn1   = sd.const(-1);
  const C2    = sd.const(2);
  const C3    = sd.const(3);
  const C4    = sd.const(4);
  const C20   = sd.const(20);
  const C20k  = sd.const(20000);
  const C099  = sd.const(0.99);
  const C001  = sd.const(0.001);
  const C0_01 = sd.const(0.01);

  // ── kr parameters ──
  const PI_IN_BUS  = sd.addParam('in_bus', 0);
  const PI_OUT_BUS = sd.addParam('out_bus', 0);
  const PI_LEVEL   = sd.addParam('level', 0.5);
  const PI_GATE    = sd.addParam('gate', 1);
  const PI_MODE    = sd.addParam('mode', 0.5);
  const PI_RES     = sd.addParam('res', 0.5);
  const PI_MIX     = sd.addParam('mix', 1);

  // ── ar modulation parameters ──
  const krCount = sd.params.length;
  const PI_LEVEL_MOD = sd.addParam('level_mod', 0);
  const PI_GATE_MOD  = sd.addParam('gate_mod', 0);

  // ── Control UGens ──
  const ctrlUgens = [];
  for (let i = 0; i < krCount; i++) {
    ctrlUgens.push(sd.addUGen('Control', CONTROL, [], 1, i));
  }

  // ── AudioControl UGens ──
  const arCount = sd.params.length - krCount;
  const arCtrlUgens = [];
  for (let i = 0; i < arCount; i++) {
    arCtrlUgens.push(sd.addUGen('AudioControl', AUDIO, [], 1, krCount + i));
  }

  function krRef(paramIdx) { return sd.ref(ctrlUgens[paramIdx], 0); }
  function arRef(paramIdx) {
    return sd.ref(arCtrlUgens[paramIdx - krCount], 0);
  }

  // ── level = clip(level_kr + level_mod_ar, 0, 1) ──
  const addLevel = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_LEVEL), arRef(PI_LEVEL_MOD)], 1, B_ADD);
  const clipLevel = sd.addUGen('Clip', AUDIO,
    [sd.ref(addLevel, 0), C0, C1], 1);
  const levelRef = sd.ref(clipLevel, 0);

  // ── gate = clip(gate_kr + gate_mod_ar, 0, 1) ──
  const addGate = sd.addUGen('BinaryOpUGen', AUDIO,
    [krRef(PI_GATE), arRef(PI_GATE_MOD)], 1, B_ADD);
  const clipGate = sd.addUGen('Clip', AUDIO,
    [sd.ref(addGate, 0), C0, C1], 1);

  // ── effective = level * gate ──
  const effective = sd.addUGen('BinaryOpUGen', AUDIO,
    [levelRef, sd.ref(clipGate, 0)], 1, B_MUL);
  const effectiveRef = sd.ref(effective, 0);

  // ── Vactrol lag: Lag.ar(effective, 0.01) for organic response ──
  // Lag.ar(in, lagTime) — inputs: [in, lagTime]
  const lagLevel = sd.addUGen('Lag', AUDIO,
    [effectiveRef, C0_01], 1);
  const smoothRef = sd.ref(lagLevel, 0);

  // ── Cutoff = level * 20000, clamped to [20, 20000] ──
  const cutoffRaw = sd.addUGen('BinaryOpUGen', AUDIO,
    [smoothRef, C20k], 1, B_MUL);
  const cutoffClip = sd.addUGen('Clip', AUDIO,
    [sd.ref(cutoffRaw, 0), C20, C20k], 1);
  const cutoffRef = sd.ref(cutoffClip, 0);

  // ── Resonance: rq = 1 - res * 0.99, clamped to min 0.001 ──
  const resScaled = sd.addUGen('BinaryOpUGen', CONTROL,
    [krRef(PI_RES), C099], 1, B_MUL);
  const rq = sd.addUGen('BinaryOpUGen', CONTROL,
    [C1, sd.ref(resScaled, 0)], 1, B_SUB);
  const rqClamped = sd.addUGen('BinaryOpUGen', CONTROL,
    [sd.ref(rq, 0), C001], 1, B_MAX);
  const rqRef = sd.ref(rqClamped, 0);

  // ── In.ar(in_bus, 2) ──
  const inUgen = sd.addUGen('In', AUDIO, [krRef(PI_IN_BUS)], 2);
  const dryL = sd.ref(inUgen, 0);
  const dryR = sd.ref(inUgen, 1);

  // ── LP filter path: RLPF.ar(sig, cutoff, rq) ──
  const filtL = sd.addUGen('RLPF', AUDIO, [dryL, cutoffRef, rqRef], 1);
  const filtR = sd.addUGen('RLPF', AUDIO, [dryR, cutoffRef, rqRef], 1);

  // ── VCA path: sig * smoothLevel ──
  const vcaL = sd.addUGen('BinaryOpUGen', AUDIO,
    [dryL, smoothRef], 1, B_MUL);
  const vcaR = sd.addUGen('BinaryOpUGen', AUDIO,
    [dryR, smoothRef], 1, B_MUL);

  // ── Combo path: filtered * smoothLevel ──
  const comboL = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(filtL, 0), smoothRef], 1, B_MUL);
  const comboR = sd.addUGen('BinaryOpUGen', AUDIO,
    [sd.ref(filtR, 0), smoothRef], 1, B_MUL);

  // ── 3-way mode crossfade: LP(0) → combo(0.5) → VCA(1) ──
  const modeRef = krRef(PI_MODE);

  // seg1_pan = clip(mode * 4 - 1, -1, 1)
  const mode_x4 = sd.addUGen('BinaryOpUGen', CONTROL,
    [modeRef, C4], 1, B_MUL);
  const seg1_raw = sd.addUGen('BinaryOpUGen', CONTROL,
    [sd.ref(mode_x4, 0), C1], 1, B_SUB);
  const seg1_pan = sd.addUGen('Clip', CONTROL,
    [sd.ref(seg1_raw, 0), Cn1, C1], 1);

  // seg2_pan = clip(mode * 4 - 3, -1, 1)
  const seg2_raw = sd.addUGen('BinaryOpUGen', CONTROL,
    [sd.ref(mode_x4, 0), C3], 1, B_SUB);
  const seg2_pan = sd.addUGen('Clip', CONTROL,
    [sd.ref(seg2_raw, 0), Cn1, C1], 1);

  // L channel: XFade2(filtered, combo, seg1) → XFade2(result, vca, seg2)
  const mix1L = sd.addUGen('XFade2', AUDIO,
    [sd.ref(filtL, 0), sd.ref(comboL, 0), sd.ref(seg1_pan, 0), C1], 1);
  const outL_wet = sd.addUGen('XFade2', AUDIO,
    [sd.ref(mix1L, 0), sd.ref(vcaL, 0), sd.ref(seg2_pan, 0), C1], 1);

  // R channel: same crossfade
  const mix1R = sd.addUGen('XFade2', AUDIO,
    [sd.ref(filtR, 0), sd.ref(comboR, 0), sd.ref(seg1_pan, 0), C1], 1);
  const outR_wet = sd.addUGen('XFade2', AUDIO,
    [sd.ref(mix1R, 0), sd.ref(vcaR, 0), sd.ref(seg2_pan, 0), C1], 1);

  // ── Dry/wet mix ──
  const mixRef = krRef(PI_MIX);
  const mixTimes2 = sd.addUGen('BinaryOpUGen', CONTROL,
    [mixRef, C2], 1, B_MUL);
  const mixPan = sd.addUGen('BinaryOpUGen', CONTROL,
    [sd.ref(mixTimes2, 0), C1], 1, B_SUB);
  const mixPanRef = sd.ref(mixPan, 0);

  const outL = sd.addUGen('XFade2', AUDIO,
    [dryL, sd.ref(outL_wet, 0), mixPanRef, C1], 1);
  const outR = sd.addUGen('XFade2', AUDIO,
    [dryR, sd.ref(outR_wet, 0), mixPanRef, C1], 1);

  // ── Safety clip for bus 0 ──
  const clipL = sd.addUGen('Clip', AUDIO,
    [sd.ref(outL, 0), Cn1, C1], 1);
  const clipR = sd.addUGen('Clip', AUDIO,
    [sd.ref(outR, 0), Cn1, C1], 1);

  const outBusRef = krRef(PI_OUT_BUS);
  const lteZero = sd.addUGen('BinaryOpUGen', CONTROL,
    [outBusRef, C0], 1, B_LTE);
  const lteRef = sd.ref(lteZero, 0);

  const selL = sd.addUGen('Select', AUDIO,
    [lteRef, sd.ref(outL, 0), sd.ref(clipL, 0)], 1);
  const selR = sd.addUGen('Select', AUDIO,
    [lteRef, sd.ref(outR, 0), sd.ref(clipR, 0)], 1);

  sd.addUGen('Out', AUDIO,
    [outBusRef, sd.ref(selL, 0), sd.ref(selR, 0)], 0);

  return sd.toBuffer();
}


// ── Generate and write all synthdefs ─────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

let ok = 0, fail = 0;

const DEFS = [
  { name: 'buchla_osc', fn: buildBuchlaOsc },
  { name: 'lowpass_gate', fn: buildLowpassGate },
];

for (const def of DEFS) {
  try {
    const buf = def.fn();
    const outPath = path.join(OUT_DIR, `${def.name}.scsyndef`);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${def.name}.scsyndef … ok (${buf.length} bytes)`);
    ok++;
  } catch (e) {
    console.error(`  ${def.name}.scsyndef … FAILED: ${e.message}`);
    console.error(e.stack);
    fail++;
  }
}

console.log(`\nDone: ${ok} succeeded, ${fail} failed.`);
if (fail > 0) process.exit(1);
