#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  Generate ora_attenuator.scsyndef
//
//  A stereo attenuator module with Lag.kr for click-free
//  parameter changes. Reads stereo audio from in_bus,
//  multiplies by a lagged level parameter (0–1), and writes
//  to out_bus.
//
//  Equivalent SuperCollider source:
//    SynthDef(\ora_attenuator, {
//        var level = Lag.kr(\level.kr(1), 0.005);
//        var sig = In.ar(\in_bus.kr(0), 2);
//        Out.ar(\out_bus.kr(0), sig * level);
//    });
//
//  Usage:  node scripts/generate-attenuator-synthdef.cjs
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function buildAttenuatorSynthDef() {
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
  //  SynthDef: ora_attenuator
  // ══════════════════════════════════════════════════════
  writePString('ora_attenuator');

  // ── Constants ──
  writeInt32(1);           // 1 constant
  writeFloat32(0.005);     // [0] = 0.005 (lag time)

  // ── Parameters ──
  writeInt32(3);           // 3 parameters
  writeFloat32(0.0);       // in_bus  default = 0
  writeFloat32(0.0);       // out_bus default = 0
  writeFloat32(1.0);       // level   default = 1

  // ── Parameter Names ──
  writeInt32(3);           // 3 names
  writePString('in_bus');
  writeInt32(0);           // maps to param index 0
  writePString('out_bus');
  writeInt32(1);           // maps to param index 1
  writePString('level');
  writeInt32(2);           // maps to param index 2

  // ── UGens ──
  writeInt32(6);           // 6 UGens total

  // UGen 0: Control.kr → 3 outputs (in_bus, out_bus, level)
  writePString('Control');
  writeInt8(1);            // rate: control
  writeInt32(0);           // 0 inputs
  writeInt32(3);           // 3 outputs
  writeInt16(0);           // special index
  writeInt8(1);            // output 0 rate: control (in_bus)
  writeInt8(1);            // output 1 rate: control (out_bus)
  writeInt8(1);            // output 2 rate: control (level)

  // UGen 1: Lag.kr(level, 0.005) → 1 output
  writePString('Lag');
  writeInt8(1);            // rate: control
  writeInt32(2);           // 2 inputs
  writeInt32(1);           // 1 output
  writeInt16(0);           // special index
  // input 0: level from Control
  writeInt32(0);           // src: UGen 0
  writeInt32(2);           // output 2 (level)
  // input 1: lagTime = 0.005
  writeInt32(-1);          // src: constant
  writeInt32(0);           // constant index 0 (= 0.005)
  writeInt8(1);            // output 0 rate: control

  // UGen 2: In.ar(in_bus) → 2 outputs (stereo)
  writePString('In');
  writeInt8(2);            // rate: audio
  writeInt32(1);           // 1 input
  writeInt32(2);           // 2 outputs (stereo)
  writeInt16(0);           // special index
  // input 0: in_bus from Control
  writeInt32(0);           // src: UGen 0
  writeInt32(0);           // output 0 (in_bus)
  writeInt8(2);            // output 0 rate: audio
  writeInt8(2);            // output 1 rate: audio

  // UGen 3: BinaryOpUGen.ar(L * lagged_level) → 1 output
  writePString('BinaryOpUGen');
  writeInt8(2);            // rate: audio
  writeInt32(2);           // 2 inputs
  writeInt32(1);           // 1 output
  writeInt16(2);           // special index 2 = multiply
  // input 0: L channel from In
  writeInt32(2);           // src: UGen 2
  writeInt32(0);           // output 0 (L)
  // input 1: lagged level from Lag
  writeInt32(1);           // src: UGen 1
  writeInt32(0);           // output 0
  writeInt8(2);            // output 0 rate: audio

  // UGen 4: BinaryOpUGen.ar(R * lagged_level) → 1 output
  writePString('BinaryOpUGen');
  writeInt8(2);            // rate: audio
  writeInt32(2);           // 2 inputs
  writeInt32(1);           // 1 output
  writeInt16(2);           // special index 2 = multiply
  // input 0: R channel from In
  writeInt32(2);           // src: UGen 2
  writeInt32(1);           // output 1 (R)
  // input 1: lagged level from Lag
  writeInt32(1);           // src: UGen 1
  writeInt32(0);           // output 0
  writeInt8(2);            // output 0 rate: audio

  // UGen 5: Out.ar(out_bus, L_processed, R_processed) → 0 outputs
  writePString('Out');
  writeInt8(2);            // rate: audio
  writeInt32(3);           // 3 inputs (bus + 2 channels)
  writeInt32(0);           // 0 outputs
  writeInt16(0);           // special index
  // input 0: out_bus from Control
  writeInt32(0);           // src: UGen 0
  writeInt32(1);           // output 1 (out_bus)
  // input 1: processed L channel
  writeInt32(3);           // src: UGen 3
  writeInt32(0);           // output 0
  // input 2: processed R channel
  writeInt32(4);           // src: UGen 4
  writeInt32(0);           // output 0

  // ── Variants ──
  writeInt16(0);           // 0 variants

  return Buffer.concat(parts);
}

// ── Write the file ──
const data = buildAttenuatorSynthDef();
const outPath = path.join(__dirname, '..', 'public', 'supersonic', 'synthdefs', 'ora_attenuator.scsyndef');
fs.writeFileSync(outPath, data);
console.log(`Wrote ora_attenuator.scsyndef (${data.length} bytes) → ${outPath}`);
