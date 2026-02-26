#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  Generate ora_scope.scsyndef
//
//  Creates a binary SuperCollider synthdef that writes audio
//  from an input bus into a circular buffer using BufWr + Phasor.
//  This replaces the control-bus-polling approach (1 sample/poll)
//  with full sample-rate buffer capture (~1024 samples/read).
//
//  Equivalent SuperCollider source:
//    SynthDef(\ora_scope, {
//        var sig = In.ar(\in_bus.kr(0), 1);
//        var phasor = Phasor.ar(0, 1, 0, BufFrames.kr(\bufnum.kr(0)));
//        BufWr.ar(sig, \bufnum.kr(0), phasor);
//    });
//
//  Usage:  node scripts/generate-scope-synthdef.js
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

function buildScopeSynthDef() {
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
  //  SynthDef: ora_scope
  // ══════════════════════════════════════════════════════
  writePString('ora_scope');

  // ── Constants ──
  writeInt32(2);          // 2 constants
  writeFloat32(0.0);      // [0] = 0.0
  writeFloat32(1.0);      // [1] = 1.0

  // ── Parameters ──
  writeInt32(2);          // 2 parameters
  writeFloat32(0.0);      // in_bus  default = 0
  writeFloat32(0.0);      // bufnum default = 0

  // ── Parameter Names ──
  writeInt32(2);          // 2 names
  writePString('in_bus');
  writeInt32(0);          // maps to param index 0
  writePString('bufnum');
  writeInt32(1);          // maps to param index 1

  // ── UGens ──
  writeInt32(5);          // 5 UGens total

  // UGen 0: Control.kr → 2 outputs (in_bus, bufnum)
  writePString('Control');
  writeInt8(1);           // rate: control
  writeInt32(0);          // 0 inputs
  writeInt32(2);          // 2 outputs
  writeInt16(0);          // special index
  writeInt8(1);           // output 0 rate: control (in_bus)
  writeInt8(1);           // output 1 rate: control (bufnum)

  // UGen 1: In.ar(in_bus) → 1 audio output
  writePString('In');
  writeInt8(2);           // rate: audio
  writeInt32(1);          // 1 input
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  writeInt32(0);          // input 0 src: UGen 0
  writeInt32(0);          // input 0 idx: output 0 (in_bus param)
  writeInt8(2);           // output 0 rate: audio

  // UGen 2: BufFrames.kr(bufnum) → 1 control output
  writePString('BufFrames');
  writeInt8(1);           // rate: control
  writeInt32(1);          // 1 input
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  writeInt32(0);          // input 0 src: UGen 0
  writeInt32(1);          // input 0 idx: output 1 (bufnum param)
  writeInt8(1);           // output 0 rate: control

  // UGen 3: Phasor.ar(trig=0, rate=1, start=0, end=BufFrames, resetPos=0)
  writePString('Phasor');
  writeInt8(2);           // rate: audio
  writeInt32(5);          // 5 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  //   trig = constant 0.0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  //   rate = constant 1.0
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 1.0)
  //   start = constant 0.0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  //   end = BufFrames output
  writeInt32(2);          // src: UGen 2
  writeInt32(0);          // output 0
  //   resetPos = constant 0.0
  writeInt32(-1);         // src: constant
  writeInt32(0);          // constant index 0 (= 0.0)
  writeInt8(2);           // output 0 rate: audio

  // UGen 4: BufWr.ar(sig, bufnum, phasor, loop=1)
  // Internal arg order: bufnum, phase, loop, ...inputArray
  writePString('BufWr');
  writeInt8(2);           // rate: audio
  writeInt32(4);          // 4 inputs
  writeInt32(1);          // 1 output
  writeInt16(0);          // special index
  //   bufnum
  writeInt32(0);          // src: UGen 0
  writeInt32(1);          // output 1 (bufnum param)
  //   phase (from Phasor)
  writeInt32(3);          // src: UGen 3
  writeInt32(0);          // output 0
  //   loop = constant 1.0
  writeInt32(-1);         // src: constant
  writeInt32(1);          // constant index 1 (= 1.0)
  //   inputArray[0] (audio signal from In.ar)
  writeInt32(1);          // src: UGen 1
  writeInt32(0);          // output 0
  writeInt8(2);           // output 0 rate: audio

  // ── Variants ──
  writeInt16(0);          // 0 variants

  return Buffer.concat(parts);
}

// ── Write the file ──
const data = buildScopeSynthDef();
const outPath = path.join(__dirname, '..', 'public', 'supersonic', 'synthdefs', 'ora_scope.scsyndef');
fs.writeFileSync(outPath, data);
console.log(`Wrote ora_scope.scsyndef (${data.length} bytes) → ${outPath}`);
