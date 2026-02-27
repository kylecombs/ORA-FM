#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  Generate lfo.scsyndef
//
//  LFO with selectable waveform (sine / tri / saw / pulse),
//  frequency, amplitude and phase modulation inputs.
//
//  Equivalent SuperCollider source:
//
//    SynthDef(\lfo, {
//        var freq     = \freq.kr(1);
//        var amp      = Lag.kr(\amp.kr(0.5), 0.005);
//        var waveform = \waveform.kr(0);
//        var width    = \width.kr(0.5);
//
//        var freqMod  = \freq_mod.ar(0);
//        var ampMod   = \amp_mod.ar(0);
//        var phaseMod = \phase_mod.ar(0);
//
//        var finalFreq = (freq + freqMod).max(0.01);
//        var finalAmp  = (amp + ampMod).max(0);
//
//        var sine  = SinOsc.ar(finalFreq, phaseMod);
//        var tri   = LFTri.ar(finalFreq);
//        var saw   = LFSaw.ar(finalFreq);
//        var pulse = (LFPulse.ar(finalFreq, 0, width) * 2) - 1;
//
//        var sig = Select.ar(waveform, [sine, tri, saw, pulse]) * finalAmp;
//
//        var stereo = Pan2.ar(sig, \pan.kr(0));
//        var safe = Select.ar(\out_bus.kr(0) <= 0,
//                             [stereo, stereo.clip(-1, 1)]);
//        Out.ar(\out_bus.kr(0), safe);
//    });
//
//  Usage:  node scripts/generate-lfo-synthdef.cjs
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function buildLfoSynthDef() {
  const parts = [];

  // ── Binary writers (all big-endian per SCgf spec) ──────
  function writeInt32(val) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(val, 0);
    parts.push(buf);
  }
  function writeInt16(val) {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(val, 0);
    parts.push(buf);
  }
  function writeFloat32(val) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(val, 0);
    parts.push(buf);
  }
  function writeInt8(val) {
    parts.push(Buffer.from([val & 0xff]));
  }
  function writePString(str) {
    const bytes = Buffer.from(str, 'ascii');
    writeInt8(bytes.length);
    parts.push(bytes);
  }

  // Helper: write a UGen with its inputs and outputs
  function writeUGen(name, rate, numInputs, numOutputs, specialIndex, inputs, outputRates) {
    writePString(name);
    writeInt8(rate);
    writeInt32(numInputs);
    writeInt32(numOutputs);
    writeInt16(specialIndex);
    for (const [srcUGen, srcOutput] of inputs) {
      writeInt32(srcUGen);
      writeInt32(srcOutput);
    }
    for (const r of outputRates) {
      writeInt8(r);
    }
  }

  // Rate constants
  const IR = 0, KR = 1, AR = 2;

  // ══════════════════════════════════════════════════════════
  //  SCgf File Header
  // ══════════════════════════════════════════════════════════
  parts.push(Buffer.from('SCgf', 'ascii'));
  writeInt32(2);   // version 2
  writeInt16(1);   // 1 synthdef

  // ══════════════════════════════════════════════════════════
  //  SynthDef: lfo
  // ══════════════════════════════════════════════════════════
  writePString('lfo');

  // ── Constants ──────────────────────────────────────────
  //   [0] = 0.0    (iphase defaults, freq clamp lower bound, amp clamp)
  //   [1] = 0.005  (Lag time for amp smoothing)
  //   [2] = 0.01   (minimum freq after modulation)
  //   [3] = 1.0    (Pan2 level, bipolar offset, Clip hi)
  //   [4] = 2.0    (LFPulse bipolar scale)
  //   [5] = -1.0   (Clip lo)
  writeInt32(6);          // 6 constants
  writeFloat32(0.0);      // [0]
  writeFloat32(0.005);    // [1]
  writeFloat32(0.01);     // [2]
  writeFloat32(1.0);      // [3]
  writeFloat32(2.0);      // [4]
  writeFloat32(-1.0);     // [5]

  // ── Parameters ─────────────────────────────────────────
  //   Control-rate (0–5):  freq, amp, waveform, width, pan, out_bus
  //   Audio-rate   (6–8):  freq_mod, amp_mod, phase_mod
  writeInt32(9);          // 9 parameters total
  writeFloat32(1.0);      // 0: freq      default = 1 Hz
  writeFloat32(0.5);      // 1: amp       default = 0.5
  writeFloat32(0.0);      // 2: waveform  default = 0 (sine)
  writeFloat32(0.5);      // 3: width     default = 0.5
  writeFloat32(0.0);      // 4: pan       default = 0
  writeFloat32(0.0);      // 5: out_bus   default = 0
  writeFloat32(0.0);      // 6: freq_mod  default = 0
  writeFloat32(0.0);      // 7: amp_mod   default = 0
  writeFloat32(0.0);      // 8: phase_mod default = 0

  // ── Parameter Names ────────────────────────────────────
  writeInt32(9);
  writePString('freq');      writeInt32(0);
  writePString('amp');       writeInt32(1);
  writePString('waveform');  writeInt32(2);
  writePString('width');     writeInt32(3);
  writePString('pan');       writeInt32(4);
  writePString('out_bus');   writeInt32(5);
  writePString('freq_mod');  writeInt32(6);
  writePString('amp_mod');   writeInt32(7);
  writePString('phase_mod'); writeInt32(8);

  // ── UGens ──────────────────────────────────────────────
  //
  //  UGen graph (22 UGens):
  //
  //   0  Control.kr        → 6 kr outputs (freq, amp, waveform, width, pan, out_bus)
  //   1  AudioControl       → 3 ar outputs (freq_mod, amp_mod, phase_mod)
  //   2  Lag.kr(amp, 0.005) → 1 kr output
  //   3  BinaryOpUGen(+)    freq + freq_mod            → ar
  //   4  BinaryOpUGen(max)  clamp freq ≥ 0.01          → ar
  //   5  BinaryOpUGen(+)    lagged_amp + amp_mod       → ar
  //   6  BinaryOpUGen(max)  clamp amp ≥ 0              → ar
  //   7  SinOsc.ar          (finalFreq, phase_mod)     → ar
  //   8  LFTri.ar           (finalFreq, iphase=0)      → ar
  //   9  LFSaw.ar           (finalFreq, iphase=0)      → ar
  //  10  LFPulse.ar         (finalFreq, iphase=0, width) → ar
  //  11  BinaryOpUGen(*)    LFPulse * 2                → ar
  //  12  BinaryOpUGen(-)    (LFPulse*2) - 1            → ar  (bipolar)
  //  13  Select.ar          (waveform, [sine,tri,saw,pulse]) → ar
  //  14  BinaryOpUGen(*)    selected * finalAmp        → ar
  //  15  Pan2.ar            (sig, pan, level=1)        → ar, ar
  //  16  BinaryOpUGen(<=)   out_bus <= 0               → kr
  //  17  Clip.ar            (left, -1, 1)              → ar
  //  18  Clip.ar            (right, -1, 1)             → ar
  //  19  Select.ar          (cmp, [left, clipped_left])   → ar
  //  20  Select.ar          (cmp, [right, clipped_right]) → ar
  //  21  Out.ar             (out_bus, safe_L, safe_R)

  writeInt32(22);  // 22 UGens

  // ── UGen 0: Control.kr ─────────────────────────────────
  //   6 outputs: freq(0), amp(1), waveform(2), width(3), pan(4), out_bus(5)
  writeUGen('Control', KR, 0, 6, 0, [], [KR, KR, KR, KR, KR, KR]);

  // ── UGen 1: AudioControl ──────────────────────────────
  //   3 outputs: freq_mod(0), amp_mod(1), phase_mod(2)
  //   special index = 6 (starting param index for audio-rate controls)
  writeUGen('AudioControl', AR, 0, 3, 6, [], [AR, AR, AR]);

  // ── UGen 2: Lag.kr(amp, 0.005) ────────────────────────
  writeUGen('Lag', KR, 2, 1, 0,
    [[0, 1], [-1, 1]],   // amp = UGen0:1, lagTime = const[1]=0.005
    [KR]);

  // ── UGen 3: BinaryOpUGen(+) freq + freq_mod ──────────
  writeUGen('BinaryOpUGen', AR, 2, 1, 0,
    [[0, 0], [1, 0]],    // freq = UGen0:0, freq_mod = UGen1:0
    [AR]);

  // ── UGen 4: BinaryOpUGen(max) clamp freq ≥ 0.01 ──────
  writeUGen('BinaryOpUGen', AR, 2, 1, 13,
    [[3, 0], [-1, 2]],   // UGen3:0, const[2]=0.01
    [AR]);

  // ── UGen 5: BinaryOpUGen(+) lagged_amp + amp_mod ─────
  writeUGen('BinaryOpUGen', AR, 2, 1, 0,
    [[2, 0], [1, 1]],    // Lag=UGen2:0, amp_mod=UGen1:1
    [AR]);

  // ── UGen 6: BinaryOpUGen(max) clamp amp ≥ 0 ──────────
  writeUGen('BinaryOpUGen', AR, 2, 1, 13,
    [[5, 0], [-1, 0]],   // UGen5:0, const[0]=0.0
    [AR]);

  // ── UGen 7: SinOsc.ar(finalFreq, phase_mod) ──────────
  writeUGen('SinOsc', AR, 2, 1, 0,
    [[4, 0], [1, 2]],    // finalFreq=UGen4:0, phase_mod=UGen1:2
    [AR]);

  // ── UGen 8: LFTri.ar(finalFreq, iphase=0) ────────────
  writeUGen('LFTri', AR, 2, 1, 0,
    [[4, 0], [-1, 0]],   // finalFreq=UGen4:0, iphase=const[0]=0.0
    [AR]);

  // ── UGen 9: LFSaw.ar(finalFreq, iphase=0) ────────────
  writeUGen('LFSaw', AR, 2, 1, 0,
    [[4, 0], [-1, 0]],   // finalFreq=UGen4:0, iphase=const[0]=0.0
    [AR]);

  // ── UGen 10: LFPulse.ar(finalFreq, iphase=0, width) ──
  writeUGen('LFPulse', AR, 3, 1, 0,
    [[4, 0], [-1, 0], [0, 3]],  // finalFreq=UGen4:0, iphase=const[0]=0, width=UGen0:3
    [AR]);

  // ── UGen 11: BinaryOpUGen(*) LFPulse * 2 ─────────────
  writeUGen('BinaryOpUGen', AR, 2, 1, 2,
    [[10, 0], [-1, 4]],  // LFPulse=UGen10:0, const[4]=2.0
    [AR]);

  // ── UGen 12: BinaryOpUGen(-) (LFPulse*2) - 1 ─────────
  writeUGen('BinaryOpUGen', AR, 2, 1, 1,
    [[11, 0], [-1, 3]],  // UGen11:0, const[3]=1.0
    [AR]);

  // ── UGen 13: Select.ar(waveform, [sine, tri, saw, pulse]) ─
  writeUGen('Select', AR, 5, 1, 0,
    [[0, 2], [7, 0], [8, 0], [9, 0], [12, 0]],
    // waveform=UGen0:2, sine=UGen7:0, tri=UGen8:0, saw=UGen9:0, pulse=UGen12:0
    [AR]);

  // ── UGen 14: BinaryOpUGen(*) sig * finalAmp ───────────
  writeUGen('BinaryOpUGen', AR, 2, 1, 2,
    [[13, 0], [6, 0]],   // Select=UGen13:0, finalAmp=UGen6:0
    [AR]);

  // ── UGen 15: Pan2.ar(sig, pan, level=1) ───────────────
  writeUGen('Pan2', AR, 3, 2, 0,
    [[14, 0], [0, 4], [-1, 3]],  // sig=UGen14:0, pan=UGen0:4, level=const[3]=1.0
    [AR, AR]);

  // ── UGen 16: BinaryOpUGen(<=) out_bus <= 0 ────────────
  writeUGen('BinaryOpUGen', KR, 2, 1, 10,
    [[0, 5], [-1, 0]],   // out_bus=UGen0:5, const[0]=0.0
    [KR]);

  // ── UGen 17: Clip.ar(left, -1, 1) ─────────────────────
  writeUGen('Clip', AR, 3, 1, 0,
    [[15, 0], [-1, 5], [-1, 3]],  // left=UGen15:0, lo=const[5]=-1, hi=const[3]=1
    [AR]);

  // ── UGen 18: Clip.ar(right, -1, 1) ────────────────────
  writeUGen('Clip', AR, 3, 1, 0,
    [[15, 1], [-1, 5], [-1, 3]],  // right=UGen15:1, lo=const[5]=-1, hi=const[3]=1
    [AR]);

  // ── UGen 19: Select.ar(cmp, [left, clipped_left]) ─────
  writeUGen('Select', AR, 3, 1, 0,
    [[16, 0], [15, 0], [17, 0]],  // cmp=UGen16:0, unclipped=UGen15:0, clipped=UGen17:0
    [AR]);

  // ── UGen 20: Select.ar(cmp, [right, clipped_right]) ───
  writeUGen('Select', AR, 3, 1, 0,
    [[16, 0], [15, 1], [18, 0]],  // cmp=UGen16:0, unclipped=UGen15:1, clipped=UGen18:0
    [AR]);

  // ── UGen 21: Out.ar(out_bus, safe_L, safe_R) ──────────
  writeUGen('Out', AR, 3, 0, 0,
    [[0, 5], [19, 0], [20, 0]],  // out_bus=UGen0:5, L=UGen19:0, R=UGen20:0
    []);

  // ── Variants ───────────────────────────────────────────
  writeInt16(0);  // 0 variants

  return Buffer.concat(parts);
}

// ── Write the file ───────────────────────────────────────
const data = buildLfoSynthDef();
const outPath = path.join(__dirname, '..', 'public', 'supersonic', 'synthdefs', 'lfo.scsyndef');
fs.writeFileSync(outPath, data);
console.log(`Wrote lfo.scsyndef (${data.length} bytes) → ${outPath}`);
