#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  Generate spectral_freeze.scsyndef
//
//  A spectral freeze effect for ambient music. Captures a
//  snapshot of the frequency spectrum via FFT/PV_MagFreeze
//  and holds it indefinitely. Includes dry/wet crossfade
//  and amplitude control.
//
//  Uses a pre-allocated buffer (passed via bufnum parameter)
//  instead of LocalBuf for FFT storage. The buffer must be
//  allocated by the engine before creating this synth.
//
//  Equivalent SuperCollider source:
//    SynthDef(\spectral_freeze, { |in_bus=0, out_bus=0, bufnum=0, freeze=0, mix=1, amp=1|
//        var sig = In.ar(in_bus, 1);
//        var chain = FFT(bufnum, sig);
//        var frozen = PV_MagFreeze(chain, freeze);
//        var wet = IFFT(frozen);
//        var pan = mix.madd(2, -1);  // 0..1 → -1..1
//        var output = XFade2.ar(sig, wet, pan, amp);
//        Out.ar(out_bus, output ! 2);    // stereo (duplicated mono)
//    });
//
//  Parameters:
//    in_bus  (kr, default 0)  — input audio bus
//    out_bus (kr, default 0)  — output audio bus
//    bufnum (kr, default 0)  — pre-allocated FFT buffer number
//    freeze (kr, default 0)  — freeze gate: 0 = pass-through, >0 = freeze
//    mix    (kr, default 1)  — dry/wet crossfade: 0 = dry, 1 = frozen
//    amp    (kr, default 1)  — output amplitude
//
//  Usage:  node scripts/generate-spectral-freeze-synthdef.cjs
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function buildSpectralFreezeSynthDef() {
  const parts = [];

  // ── Binary writers (all big-endian per SCgf spec) ──
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

  // ══════════════════════════════════════════════════════
  //  SCgf File Header
  // ══════════════════════════════════════════════════════
  parts.push(Buffer.from('SCgf', 'ascii')); // magic
  writeInt32(2);  // version 2
  writeInt16(1);  // 1 synthdef in this file

  // ══════════════════════════════════════════════════════
  //  SynthDef: spectral_freeze
  // ══════════════════════════════════════════════════════
  writePString('spectral_freeze');

  // ── Constants ──
  //   [0] = 0.0    defaults, FFT wintype/winsize
  //   [1] = 0.5    FFT hop
  //   [2] = 1.0    FFT active
  //   [3] = 2.0    MulAdd mul (mix scaling)
  //   [4] = -1.0   MulAdd add (mix offset)
  writeInt32(5);          // 5 constants
  writeFloat32(0.0);      // [0]
  writeFloat32(0.5);      // [1]
  writeFloat32(1.0);      // [2]
  writeFloat32(2.0);      // [3]
  writeFloat32(-1.0);     // [4]

  // ── Parameters ──
  writeInt32(6);          // 6 parameters
  writeFloat32(0.0);      // in_bus  default = 0
  writeFloat32(0.0);      // out_bus default = 0
  writeFloat32(0.0);      // bufnum default = 0
  writeFloat32(0.0);      // freeze  default = 0
  writeFloat32(1.0);      // mix     default = 1
  writeFloat32(1.0);      // amp     default = 1

  // ── Parameter Names ──
  writeInt32(6);
  writePString('in_bus');
  writeInt32(0);
  writePString('out_bus');
  writeInt32(1);
  writePString('bufnum');
  writeInt32(2);
  writePString('freeze');
  writeInt32(3);
  writePString('mix');
  writeInt32(4);
  writePString('amp');
  writeInt32(5);

  // ── UGens (8 total) ──
  //
  //   0  Control.kr       → 6 outputs (in_bus, out_bus, bufnum, freeze, mix, amp)
  //   1  In.ar            → 1 audio output (reads in_bus)
  //   2  FFT              → 1 control output (forward transform)
  //   3  PV_MagFreeze     → 1 control output (freeze magnitude spectrum)
  //   4  IFFT             → 1 audio output (inverse transform)
  //   5  MulAdd.kr        → 1 control output (mix → XFade2 pan: 0..1 → -1..1)
  //   6  XFade2.ar        → 1 audio output (dry/wet crossfade)
  //   7  Out.ar           → 0 outputs (writes stereo to bus)
  //
  writeInt32(8);

  // ── UGen 0: Control.kr ──
  // 0 inputs, 6 outputs (one per parameter)
  writePString('Control');
  writeInt8(1);           // rate: control
  writeInt32(0);          // 0 inputs
  writeInt32(6);          // 6 outputs
  writeInt16(0);          // special index
  writeInt8(1);           // output 0 rate: control (in_bus)
  writeInt8(1);           // output 1 rate: control (out_bus)
  writeInt8(1);           // output 2 rate: control (bufnum)
  writeInt8(1);           // output 3 rate: control (freeze)
  writeInt8(1);           // output 4 rate: control (mix)
  writeInt8(1);           // output 5 rate: control (amp)

  // ── UGen 1: In.ar(in_bus) ──
  // Reads 1 channel of audio from in_bus
  writePString('In');
  writeInt8(2);           // rate: audio
  writeInt32(1);          // 1 input
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: bus = Control output 0 (in_bus)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(0);          // output index 0 (in_bus)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 2: FFT(bufnum, in, hop=0.5, wintype=0, active=1, winsize=0) ──
  // Uses pre-allocated buffer from bufnum parameter
  writePString('FFT');
  writeInt8(1);           // rate: control
  writeInt32(6);          // 6 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: buffer = Control output 2 (bufnum)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(2);          // output index 2 (bufnum)
  // input 1: in = In.ar output
  writeInt32(1);          // src: UGen 1 (In)
  writeInt32(0);          // output 0
  // input 2: hop = 0.5
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 0.5)
  // input 3: wintype = 0 (Hann)
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // input 4: active = 1
  writeInt32(-1);         // src: constant
  writeInt32(2);          // constant index 2 (= 1.0)
  // input 5: winsize = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 3: PV_MagFreeze(chain, freeze) ──
  // When freeze > 0, holds the current magnitude spectrum
  writePString('PV_MagFreeze');
  writeInt8(1);           // rate: control
  writeInt32(2);          // 2 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: chain = FFT output
  writeInt32(2);          // src: UGen 2 (FFT)
  writeInt32(0);          // output 0
  // input 1: freeze = Control output 3
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(3);          // output index 3 (freeze)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 4: IFFT(chain, wintype=0, winsize=0) ──
  // Converts frozen spectrum back to audio
  writePString('IFFT');
  writeInt8(2);           // rate: audio
  writeInt32(3);          // 3 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: chain = PV_MagFreeze output
  writeInt32(3);          // src: UGen 3 (PV_MagFreeze)
  writeInt32(0);          // output 0
  // input 1: wintype = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // input 2: winsize = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 5: MulAdd.kr(mix, 2.0, -1.0) ──
  // Maps mix (0..1) to XFade2 pan range (-1..1)
  writePString('MulAdd');
  writeInt8(1);           // rate: control (follows input rate)
  writeInt32(3);          // 3 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: in = Control output 4 (mix)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(4);          // output index 4 (mix)
  // input 1: mul = 2.0
  writeInt32(-1);         // src: constant
  writeInt32(3);          // constant index 3 (= 2.0)
  // input 2: add = -1.0
  writeInt32(-1);         // src: constant
  writeInt32(4);          // constant index 4 (= -1.0)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 6: XFade2.ar(dry, wet, pan, level) ──
  // Equal-power crossfade between dry input and frozen output
  writePString('XFade2');
  writeInt8(2);           // rate: audio
  writeInt32(4);          // 4 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: inA = In.ar output (dry signal)
  writeInt32(1);          // src: UGen 1 (In)
  writeInt32(0);          // output 0
  // input 1: inB = IFFT output (wet/frozen signal)
  writeInt32(4);          // src: UGen 4 (IFFT)
  writeInt32(0);          // output 0
  // input 2: pan = MulAdd output (mix mapped to -1..1)
  writeInt32(5);          // src: UGen 5 (MulAdd)
  writeInt32(0);          // output 0
  // input 3: level = Control output 5 (amp)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(5);          // output index 5 (amp)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 7: Out.ar(bus, signal, signal) ──
  // Writes stereo output (duplicated mono)
  writePString('Out');
  writeInt8(2);           // rate: audio
  writeInt32(3);          // 3 inputs (bus + 2 channels)
  writeInt32(0);          // 0 outputs
  writeInt16(0);          // special index
  // input 0: bus = Control output 1 (out_bus)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(1);          // output index 1 (out_bus)
  // input 1: channel 0 = XFade2 output
  writeInt32(6);          // src: UGen 6 (XFade2)
  writeInt32(0);          // output 0
  // input 2: channel 1 = XFade2 output (same signal, stereo dup)
  writeInt32(6);          // src: UGen 6 (XFade2)
  writeInt32(0);          // output 0

  // ── Variants ──
  writeInt16(0);          // 0 variants

  return Buffer.concat(parts);
}

// ── Write the file ──
const data = buildSpectralFreezeSynthDef();
const outPath = path.join(__dirname, '..', 'public', 'supersonic', 'synthdefs', 'spectral_freeze.scsyndef');
fs.writeFileSync(outPath, data);
console.log(`Wrote spectral_freeze.scsyndef (${data.length} bytes) → ${outPath}`);
