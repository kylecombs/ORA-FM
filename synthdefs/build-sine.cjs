#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
//  build-sine.js
//
//  Generates sine.scsyndef without requiring sclang.
//  Produces the exact binary that sclang would create for:
//
//  SynthDef(\sine, {
//      var freq  = \freq.kr(440);
//      var fm    = \fm.ar(0);
//      var amp   = \amp.ar(0.5);
//      var phase = \phase.ar(0);
//      var sig = SinOsc.ar(freq + fm, phase) * amp;
//      Out.ar(\out_bus.kr(0), Pan2.ar(sig, \pan.kr(0)));
//  })
//
//  SCgf version 2 binary format.
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ── Binary writer helper ─────────────────────────────────
class SynthDefWriter {
  constructor() {
    this.chunks = [];
  }

  int8(v)   { const b = Buffer.alloc(1); b.writeInt8(v, 0); this.chunks.push(b); }
  int16(v)  { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); this.chunks.push(b); }
  int32(v)  { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); this.chunks.push(b); }
  float32(v){ const b = Buffer.alloc(4); b.writeFloatBE(v, 0); this.chunks.push(b); }
  raw(buf)  { this.chunks.push(Buffer.from(buf)); }

  // Pascal string: 1-byte length prefix + ASCII chars
  pstring(s) {
    this.int8(s.length);
    this.raw(Buffer.from(s, 'ascii'));
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

// ── UGen rates ───────────────────────────────────────────
const SCALAR = 0;
const CONTROL = 1;
const AUDIO = 2;

// ── Build the sine SynthDef ──────────────────────────────
function buildSineSynthDef() {
  const w = new SynthDefWriter();

  // ── File header ──
  w.raw('SCgf');         // magic
  w.int32(2);            // version
  w.int16(1);            // number of synth definitions

  // ── SynthDef name ──
  w.pstring('sine');

  // ── Constants ──
  // 0: 1.0 (Pan2 level)
  w.int32(1);            // numConstants
  w.float32(1.0);        // constant[0] = 1.0

  // ── Parameters ──
  // Order: kr params first (freq, out_bus, pan), then ar params (fm, amp, phase)
  // Indices: freq=0, out_bus=1, pan=2, fm=3, amp=4, phase=5
  w.int32(6);            // numParams
  w.float32(440.0);      // param 0: freq default
  w.float32(0.0);        // param 1: out_bus default
  w.float32(0.0);        // param 2: pan default
  w.float32(0.0);        // param 3: fm default
  w.float32(0.5);        // param 4: amp default
  w.float32(0.0);        // param 5: phase default

  // ── Parameter names ──
  w.int32(6);            // numParamNames
  w.pstring('freq');     w.int32(0);
  w.pstring('out_bus');  w.int32(1);
  w.pstring('pan');      w.int32(2);
  w.pstring('fm');       w.int32(3);
  w.pstring('amp');      w.int32(4);
  w.pstring('phase');    w.int32(5);

  // ── UGen graph ──
  // UGen 0: Control.kr → outputs: freq(0), out_bus(1), pan(2)
  // UGen 1: AudioControl.ar → outputs: fm(0), amp(1), phase(2)
  // UGen 2: K2A.ar(freq) → output: freq at audio rate
  // UGen 3: BinaryOpUGen.ar(+) freq_ar + fm → output: freq+fm
  // UGen 4: SinOsc.ar(freq+fm, phase) → output: sine signal
  // UGen 5: BinaryOpUGen.ar(*) sig * amp → output: scaled signal
  // UGen 6: Pan2.ar(sig, pan, 1.0) → outputs: left, right
  // UGen 7: Out.ar(out_bus, left, right)

  w.int32(8);            // numUGens

  // ── UGen 0: Control ──
  w.pstring('Control');
  w.int8(CONTROL);       // rate
  w.int32(0);            // numInputs
  w.int32(3);            // numOutputs (freq, out_bus, pan)
  w.int16(0);            // special index
  // no inputs
  w.int8(CONTROL);       // output 0 rate (freq)
  w.int8(CONTROL);       // output 1 rate (out_bus)
  w.int8(CONTROL);       // output 2 rate (pan)

  // ── UGen 1: AudioControl ──
  w.pstring('AudioControl');
  w.int8(AUDIO);         // rate
  w.int32(0);            // numInputs
  w.int32(3);            // numOutputs (fm, amp, phase)
  w.int16(0);            // special index
  // no inputs
  w.int8(AUDIO);         // output 0 rate (fm)
  w.int8(AUDIO);         // output 1 rate (amp)
  w.int8(AUDIO);         // output 2 rate (phase)

  // ── UGen 2: K2A (convert freq from kr to ar) ──
  w.pstring('K2A');
  w.int8(AUDIO);         // rate
  w.int32(1);            // numInputs
  w.int32(1);            // numOutputs
  w.int16(0);            // special index
  w.int32(0); w.int32(0); // input: UGen 0 output 0 (freq from Control)
  w.int8(AUDIO);         // output 0 rate

  // ── UGen 3: BinaryOpUGen (addition: freq_ar + fm) ──
  w.pstring('BinaryOpUGen');
  w.int8(AUDIO);         // rate
  w.int32(2);            // numInputs
  w.int32(1);            // numOutputs
  w.int16(0);            // special index = 0 (addition)
  w.int32(2); w.int32(0); // input 0: UGen 2 output 0 (freq_ar from K2A)
  w.int32(1); w.int32(0); // input 1: UGen 1 output 0 (fm from AudioControl)
  w.int8(AUDIO);         // output 0 rate

  // ── UGen 4: SinOsc ──
  w.pstring('SinOsc');
  w.int8(AUDIO);         // rate
  w.int32(2);            // numInputs
  w.int32(1);            // numOutputs
  w.int16(0);            // special index
  w.int32(3); w.int32(0); // input 0: UGen 3 output 0 (freq + fm)
  w.int32(1); w.int32(2); // input 1: UGen 1 output 2 (phase from AudioControl)
  w.int8(AUDIO);         // output 0 rate

  // ── UGen 5: BinaryOpUGen (multiplication: sig * amp) ──
  w.pstring('BinaryOpUGen');
  w.int8(AUDIO);         // rate
  w.int32(2);            // numInputs
  w.int32(1);            // numOutputs
  w.int16(2);            // special index = 2 (multiplication)
  w.int32(4); w.int32(0); // input 0: UGen 4 output 0 (SinOsc signal)
  w.int32(1); w.int32(1); // input 1: UGen 1 output 1 (amp from AudioControl)
  w.int8(AUDIO);         // output 0 rate

  // ── UGen 6: Pan2 ──
  w.pstring('Pan2');
  w.int8(AUDIO);         // rate
  w.int32(3);            // numInputs
  w.int32(2);            // numOutputs
  w.int16(0);            // special index
  w.int32(5); w.int32(0); // input 0: UGen 5 output 0 (scaled signal)
  w.int32(0); w.int32(2); // input 1: UGen 0 output 2 (pan from Control)
  w.int32(-1); w.int32(0);// input 2: constant[0] = 1.0 (level)
  w.int8(AUDIO);         // output 0 rate (left)
  w.int8(AUDIO);         // output 1 rate (right)

  // ── UGen 7: Out ──
  w.pstring('Out');
  w.int8(AUDIO);         // rate
  w.int32(3);            // numInputs (bus + 2 channels)
  w.int32(0);            // numOutputs
  w.int16(0);            // special index
  w.int32(0); w.int32(1); // input 0: UGen 0 output 1 (out_bus from Control)
  w.int32(6); w.int32(0); // input 1: UGen 6 output 0 (left from Pan2)
  w.int32(6); w.int32(1); // input 2: UGen 6 output 1 (right from Pan2)
  // no output rates

  // ── Variants ──
  w.int16(0);            // numVariants

  return w.toBuffer();
}

// ── Main ─────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '..', 'public', 'supersonic', 'synthdefs');
const outFile = path.join(outDir, 'sine.scsyndef');

const buf = buildSineSynthDef();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, buf);

console.log(`Wrote sine.scsyndef (${buf.length} bytes) to ${outFile}`);

// Verify header
const check = fs.readFileSync(outFile);
console.log(`Verify: magic=${check.slice(0,4).toString()}, version=${check.readInt32BE(4)}, numDefs=${check.readInt16BE(8)}`);
