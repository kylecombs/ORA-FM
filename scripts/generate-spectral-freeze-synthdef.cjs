#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  Generate spectral_freeze.scsyndef
//
//  A spectral freeze effect for ambient music. Captures a
//  snapshot of the frequency spectrum via FFT/PV_MagFreeze
//  and holds it indefinitely. Includes dry/wet crossfade
//  and amplitude control.
//
//  Equivalent SuperCollider source:
//    SynthDef(\spectral_freeze, { |out=0, in_bus=0, freeze=0, mix=1, amp=1|
//        var sig = In.ar(in_bus, 1);
//        var chain = FFT(LocalBuf(2048), sig);
//        var frozen = PV_MagFreeze(chain, freeze);
//        var wet = IFFT(frozen);
//        var pan = mix.madd(2, -1);  // 0..1 → -1..1
//        var output = XFade2.ar(sig, wet, pan, amp);
//        Out.ar(out, output ! 2);    // stereo (duplicated mono)
//    });
//
//  Parameters:
//    out    (kr, default 0)  — output audio bus
//    in_bus (kr, default 0)  — input audio bus
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
  //   [1] = 1.0    MaxLocalBufs count, LocalBuf numChannels, FFT active
  //   [2] = 2048.0 LocalBuf numFrames (FFT size)
  //   [3] = 0.5    FFT hop
  //   [4] = 2.0    MulAdd mul (mix scaling)
  //   [5] = -1.0   MulAdd add (mix offset)
  writeInt32(6);          // 6 constants
  writeFloat32(0.0);      // [0]
  writeFloat32(1.0);      // [1]
  writeFloat32(2048.0);   // [2]
  writeFloat32(0.5);      // [3]
  writeFloat32(2.0);      // [4]
  writeFloat32(-1.0);     // [5]

  // ── Parameters ──
  writeInt32(5);          // 5 parameters
  writeFloat32(0.0);      // out     default = 0
  writeFloat32(0.0);      // in_bus  default = 0
  writeFloat32(0.0);      // freeze  default = 0
  writeFloat32(1.0);      // mix     default = 1
  writeFloat32(1.0);      // amp     default = 1

  // ── Parameter Names ──
  writeInt32(5);
  writePString('out');
  writeInt32(0);
  writePString('in_bus');
  writeInt32(1);
  writePString('freeze');
  writeInt32(2);
  writePString('mix');
  writeInt32(3);
  writePString('amp');
  writeInt32(4);

  // ── UGens (10 total) ──
  //
  //   0  Control.kr       → 5 outputs (out, in_bus, freeze, mix, amp)
  //   1  In.ar            → 1 audio output (reads in_bus)
  //   2  MaxLocalBufs     → 1 scalar output (reserves 1 local buffer)
  //   3  LocalBuf         → 1 scalar output (2048-frame FFT buffer)
  //   4  FFT              → 1 control output (forward transform)
  //   5  PV_MagFreeze     → 1 control output (freeze magnitude spectrum)
  //   6  IFFT             → 1 audio output (inverse transform)
  //   7  MulAdd.kr        → 1 control output (mix → XFade2 pan: 0..1 → -1..1)
  //   8  XFade2.ar        → 1 audio output (dry/wet crossfade)
  //   9  Out.ar           → 0 outputs (writes stereo to bus)
  //
  writeInt32(10);

  // ── UGen 0: Control.kr ──
  // 0 inputs, 5 outputs (one per parameter)
  writePString('Control');
  writeInt8(1);           // rate: control
  writeInt32(0);          // 0 inputs
  writeInt32(5);          // 5 outputs
  writeInt16(0);          // special index
  writeInt8(1);           // output 0 rate: control (out)
  writeInt8(1);           // output 1 rate: control (in_bus)
  writeInt8(1);           // output 2 rate: control (freeze)
  writeInt8(1);           // output 3 rate: control (mix)
  writeInt8(1);           // output 4 rate: control (amp)

  // ── UGen 1: In.ar(in_bus) ──
  // Reads 1 channel of audio from in_bus
  writePString('In');
  writeInt8(2);           // rate: audio
  writeInt32(1);          // 1 input
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: bus = Control output 1 (in_bus)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(1);          // output index 1 (in_bus)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 2: MaxLocalBufs(1) ──
  // Must appear before LocalBuf; reserves local buffer slots
  writePString('MaxLocalBufs');
  writeInt8(0);           // rate: scalar
  writeInt32(1);          // 1 input
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: count = constant 1.0
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 1.0)
  // outputs
  writeInt8(0);           // output 0 rate: scalar

  // ── UGen 3: LocalBuf(numChannels=1, numFrames=2048) ──
  // Allocates a local buffer for FFT chain storage
  writePString('LocalBuf');
  writeInt8(0);           // rate: scalar
  writeInt32(3);          // 3 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: numChannels = constant 1.0
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 1.0)
  // input 1: numFrames = constant 2048.0
  writeInt32(-1);         // src: constant
  writeInt32(2);          // constant index 2 (= 2048.0)
  // input 2: MaxLocalBufs reference
  writeInt32(2);          // src: UGen 2 (MaxLocalBufs)
  writeInt32(0);          // output 0
  // outputs
  writeInt8(0);           // output 0 rate: scalar

  // ── UGen 4: FFT(buffer, in, hop=0.5, wintype=0, active=1, winsize=0) ──
  writePString('FFT');
  writeInt8(1);           // rate: control
  writeInt32(6);          // 6 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: buffer = LocalBuf output
  writeInt32(3);          // src: UGen 3 (LocalBuf)
  writeInt32(0);          // output 0
  // input 1: in = In.ar output
  writeInt32(1);          // src: UGen 1 (In)
  writeInt32(0);          // output 0
  // input 2: hop = 0.5
  writeInt32(-1);         // src: constant
  writeInt32(3);          // constant index 3 (= 0.5)
  // input 3: wintype = 0 (Hann)
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // input 4: active = 1
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 1.0)
  // input 5: winsize = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 5: PV_MagFreeze(chain, freeze) ──
  // When freeze > 0, holds the current magnitude spectrum
  writePString('PV_MagFreeze');
  writeInt8(1);           // rate: control
  writeInt32(2);          // 2 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: chain = FFT output
  writeInt32(4);          // src: UGen 4 (FFT)
  writeInt32(0);          // output 0
  // input 1: freeze = Control output 2
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(2);          // output index 2 (freeze)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 6: IFFT(chain, wintype=0, winsize=0) ──
  // Converts frozen spectrum back to audio
  writePString('IFFT');
  writeInt8(2);           // rate: audio
  writeInt32(3);          // 3 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: chain = PV_MagFreeze output
  writeInt32(5);          // src: UGen 5 (PV_MagFreeze)
  writeInt32(0);          // output 0
  // input 1: wintype = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // input 2: winsize = 0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 7: MulAdd.kr(mix, 2.0, -1.0) ──
  // Maps mix (0..1) to XFade2 pan range (-1..1)
  writePString('MulAdd');
  writeInt8(1);           // rate: control (follows input rate)
  writeInt32(3);          // 3 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  // input 0: in = Control output 3 (mix)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(3);          // output index 3 (mix)
  // input 1: mul = 2.0
  writeInt32(-1);         // src: constant
  writeInt32(4);          // constant index 4 (= 2.0)
  // input 2: add = -1.0
  writeInt32(-1);         // src: constant
  writeInt32(5);          // constant index 5 (= -1.0)
  // outputs
  writeInt8(1);           // output 0 rate: control

  // ── UGen 8: XFade2.ar(dry, wet, pan, level) ──
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
  writeInt32(6);          // src: UGen 6 (IFFT)
  writeInt32(0);          // output 0
  // input 2: pan = MulAdd output (mix mapped to -1..1)
  writeInt32(7);          // src: UGen 7 (MulAdd)
  writeInt32(0);          // output 0
  // input 3: level = Control output 4 (amp)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(4);          // output index 4 (amp)
  // outputs
  writeInt8(2);           // output 0 rate: audio

  // ── UGen 9: Out.ar(bus, signal, signal) ──
  // Writes stereo output (duplicated mono)
  writePString('Out');
  writeInt8(2);           // rate: audio
  writeInt32(3);          // 3 inputs (bus + 2 channels)
  writeInt32(0);          // 0 outputs
  writeInt16(0);          // special index
  // input 0: bus = Control output 0 (out)
  writeInt32(0);          // src: UGen 0 (Control)
  writeInt32(0);          // output index 0 (out)
  // input 1: channel 0 = XFade2 output
  writeInt32(8);          // src: UGen 8 (XFade2)
  writeInt32(0);          // output 0
  // input 2: channel 1 = XFade2 output (same signal, stereo dup)
  writeInt32(8);          // src: UGen 8 (XFade2)
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
