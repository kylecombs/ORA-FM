// ════════════════════════════════════════════════════════════
//  buildSamplePlayerDef.js
//
//  Generates the binary SynthDef (SCgf v2) for sample_player
//  at runtime, since we can't compile .scd without sclang.
//
//  The SynthDef is sent via /d_recv to the SuperSonic engine.
//
//  Equivalent SuperCollider source:
//
//    SynthDef(\sample_player, {
//        var buf = \buf.kr(0);
//        var rate = \rate.kr(1);
//        var startPos = \start_pos.kr(0);
//        var endPos = \end_pos.kr(1);
//        var loop = \loop.kr(1);
//        var amp = Lag.kr(\amp.kr(0.5), 0.005);
//        var pan = \pan.kr(0);
//        var outBus = \out_bus.kr(0);
//        var trig = \t_trig.tr(0);
//        var rateMod = \rate_mod.ar(0);
//        var ampMod = \amp_mod.ar(0);
//
//        var frames = BufFrames.kr(buf);
//        var rateScale = BufRateScale.kr(buf);
//        var finalRate = (rate + rateMod) * rateScale;
//        var lo = startPos * frames;
//        var hi = endPos * frames;
//        var phasor = Phasor.ar(trig, finalRate, lo, hi, lo);
//        var sig = BufRd.ar(2, buf, phasor, loop, 2);
//        var finalAmp = (amp + ampMod).max(0);
//        sig = sig * finalAmp;
//        var stereo = Balance2.ar(sig[0], sig[1], pan);
//        Out.ar(outBus, stereo);
//    });
// ════════════════════════════════════════════════════════════

// ── SCgf v2 binary format helpers ─────────────────────────

const RATE_SCALAR = 0;
const RATE_CONTROL = 1;
const RATE_AUDIO = 2;

class SynthDefWriter {
  constructor() {
    this.chunks = [];
  }

  writeInt8(v) {
    const buf = new ArrayBuffer(1);
    new DataView(buf).setInt8(0, v);
    this.chunks.push(new Uint8Array(buf));
  }

  writeInt16(v) {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, v, false); // big-endian
    this.chunks.push(new Uint8Array(buf));
  }

  writeInt32(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, v, false);
    this.chunks.push(new Uint8Array(buf));
  }

  writeFloat32(v) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v, false);
    this.chunks.push(new Uint8Array(buf));
  }

  writePstring(s) {
    const bytes = new TextEncoder().encode(s);
    this.writeInt8(bytes.length);
    this.chunks.push(bytes);
  }

  writeBytes(bytes) {
    this.chunks.push(new Uint8Array(bytes));
  }

  toUint8Array() {
    let totalLen = 0;
    for (const c of this.chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of this.chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
}

// ── Build the sample_player SynthDef ──────────────────────

export function buildSamplePlayerDef() {
  const w = new SynthDefWriter();

  // ── File header ──
  w.writeBytes([0x53, 0x43, 0x67, 0x66]); // "SCgf"
  w.writeInt32(2);  // version 2
  w.writeInt16(1);  // 1 synthdef

  // ── SynthDef name ──
  w.writePstring('sample_player');

  // ── Constants ──
  const constants = [0.0, 1.0, 0.005, 2.0];
  w.writeInt32(constants.length);
  for (const c of constants) w.writeFloat32(c);

  // ── Parameters ──
  //  0: buf        = 0
  //  1: rate       = 1
  //  2: start_pos  = 0
  //  3: end_pos    = 1
  //  4: loop       = 1
  //  5: amp        = 0.5
  //  6: pan        = 0
  //  7: out_bus    = 0
  //  8: t_trig     = 0  (trigger control)
  //  9: rate_mod   = 0  (audio control)
  // 10: amp_mod    = 0  (audio control)
  const paramDefaults = [0, 1, 0, 1, 1, 0.5, 0, 0, 0, 0, 0];
  w.writeInt32(paramDefaults.length);
  for (const p of paramDefaults) w.writeFloat32(p);

  // ── Parameter names ──
  const paramNames = [
    ['buf', 0], ['rate', 1], ['start_pos', 2], ['end_pos', 3],
    ['loop', 4], ['amp', 5], ['pan', 6], ['out_bus', 7],
    ['t_trig', 8], ['rate_mod', 9], ['amp_mod', 10],
  ];
  w.writeInt32(paramNames.length);
  for (const [name, idx] of paramNames) {
    w.writePstring(name);
    w.writeInt32(idx);
  }

  // ── UGens ──
  // Helper: input from another UGen
  const ugen = (idx, outIdx = 0) => [idx, outIdx];
  // Helper: input from constants table
  const konst = (idx) => [-1, idx];

  const ugens = [
    // UGen 0: Control.kr — 8 control-rate parameter outputs
    {
      name: 'Control', rate: RATE_CONTROL,
      inputs: [],
      outputs: Array(8).fill(RATE_CONTROL),
      special: 0,
    },

    // UGen 1: TrigControl.kr — 1 trigger parameter output
    {
      name: 'TrigControl', rate: RATE_CONTROL,
      inputs: [],
      outputs: [RATE_CONTROL],
      special: 8,
    },

    // UGen 2: AudioControl.ar — 2 audio-rate parameter outputs
    {
      name: 'AudioControl', rate: RATE_AUDIO,
      inputs: [],
      outputs: [RATE_AUDIO, RATE_AUDIO],
      special: 9,
    },

    // UGen 3: Lag.kr(amp, 0.005) — smooth amp changes
    {
      name: 'Lag', rate: RATE_CONTROL,
      inputs: [ugen(0, 5), konst(2)], // Control[5]=amp, const[2]=0.005
      outputs: [RATE_CONTROL],
      special: 0,
    },

    // UGen 4: BufFrames.kr(buf)
    {
      name: 'BufFrames', rate: RATE_CONTROL,
      inputs: [ugen(0, 0)], // Control[0]=buf
      outputs: [RATE_CONTROL],
      special: 0,
    },

    // UGen 5: BufRateScale.kr(buf)
    {
      name: 'BufRateScale', rate: RATE_CONTROL,
      inputs: [ugen(0, 0)], // Control[0]=buf
      outputs: [RATE_CONTROL],
      special: 0,
    },

    // UGen 6: BinaryOpUGen.ar(+) — rate + rate_mod
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(0, 1), ugen(2, 0)], // Control[1]=rate, AudioControl[0]=rate_mod
      outputs: [RATE_AUDIO],
      special: 0, // + operator
    },

    // UGen 7: BinaryOpUGen.ar(*) — (rate + rate_mod) * rateScale
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(6, 0), ugen(5, 0)], // ugen6=rate+mod, BufRateScale[0]
      outputs: [RATE_AUDIO],
      special: 2, // * operator
    },

    // UGen 8: BinaryOpUGen.kr(*) — start_pos * numFrames
    {
      name: 'BinaryOpUGen', rate: RATE_CONTROL,
      inputs: [ugen(0, 2), ugen(4, 0)], // Control[2]=start_pos, BufFrames[0]
      outputs: [RATE_CONTROL],
      special: 2, // * operator
    },

    // UGen 9: BinaryOpUGen.kr(*) — end_pos * numFrames
    {
      name: 'BinaryOpUGen', rate: RATE_CONTROL,
      inputs: [ugen(0, 3), ugen(4, 0)], // Control[3]=end_pos, BufFrames[0]
      outputs: [RATE_CONTROL],
      special: 2, // * operator
    },

    // UGen 10: Phasor.ar(trig, rate, start, end, resetPos)
    {
      name: 'Phasor', rate: RATE_AUDIO,
      inputs: [ugen(1, 0), ugen(7, 0), ugen(8, 0), ugen(9, 0), ugen(8, 0)],
      // TrigControl[0]=t_trig, finalRate, lo, hi, lo(resetPos)
      outputs: [RATE_AUDIO],
      special: 0,
    },

    // UGen 11: BufRd.ar(2ch) — bufnum, phase, loop, interpolation
    {
      name: 'BufRd', rate: RATE_AUDIO,
      inputs: [ugen(0, 0), ugen(10, 0), ugen(0, 4), konst(3)],
      // Control[0]=buf, Phasor[0], Control[4]=loop, const[3]=2(linear interp)
      outputs: [RATE_AUDIO, RATE_AUDIO], // stereo (L, R)
      special: 0,
    },

    // UGen 12: BinaryOpUGen.ar(+) — amp + amp_mod
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(3, 0), ugen(2, 1)], // Lag[0]=amp, AudioControl[1]=amp_mod
      outputs: [RATE_AUDIO],
      special: 0, // +
    },

    // UGen 13: BinaryOpUGen.ar(max) — max(amp + amp_mod, 0)
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(12, 0), konst(0)], // ugen12, const[0]=0
      outputs: [RATE_AUDIO],
      special: 12, // max
    },

    // UGen 14: BinaryOpUGen.ar(*) — left * finalAmp
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(11, 0), ugen(13, 0)], // BufRd[0]=left, finalAmp
      outputs: [RATE_AUDIO],
      special: 2, // *
    },

    // UGen 15: BinaryOpUGen.ar(*) — right * finalAmp
    {
      name: 'BinaryOpUGen', rate: RATE_AUDIO,
      inputs: [ugen(11, 1), ugen(13, 0)], // BufRd[1]=right, finalAmp
      outputs: [RATE_AUDIO],
      special: 2, // *
    },

    // UGen 16: Balance2.ar(left, right, pos, level)
    {
      name: 'Balance2', rate: RATE_AUDIO,
      inputs: [ugen(14, 0), ugen(15, 0), ugen(0, 6), konst(1)],
      // leftScaled, rightScaled, Control[6]=pan, const[1]=1.0
      outputs: [RATE_AUDIO, RATE_AUDIO], // stereo output
      special: 0,
    },

    // UGen 17: Out.ar(bus, left, right)
    {
      name: 'Out', rate: RATE_AUDIO,
      inputs: [ugen(0, 7), ugen(16, 0), ugen(16, 1)],
      // Control[7]=out_bus, Balance2[0]=L, Balance2[1]=R
      outputs: [],
      special: 0,
    },
  ];

  w.writeInt32(ugens.length);
  for (const u of ugens) {
    w.writePstring(u.name);
    w.writeInt8(u.rate);
    w.writeInt32(u.inputs.length);
    w.writeInt32(u.outputs.length);
    w.writeInt16(u.special);
    for (const [ugenIdx, outIdx] of u.inputs) {
      w.writeInt32(ugenIdx);
      w.writeInt32(outIdx);
    }
    for (const outRate of u.outputs) {
      w.writeInt8(outRate);
    }
  }

  // ── Variants ──
  w.writeInt16(0); // no variants

  return w.toUint8Array();
}
