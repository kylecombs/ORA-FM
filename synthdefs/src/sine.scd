// ════════════════════════════════════════════════════════════
//  sine.scd
//
//  Sine oscillator with control-rate base frequency and an
//  audio-rate FM input for frequency modulation.  The actual
//  oscillator frequency is (freq + fm) — connect another
//  oscillator's output to the `fm` parameter for FM synthesis.
//
//  Build:  npm run build:synthdefs -- sine.scd
//          (or: node synthdefs/build-sine.cjs)
//
//  Parameters:
//    freq      base oscillator frequency in Hz     (kr, default 440)
//    fm        FM modulation input, additive Hz    (ar, default 0)
//    amp       output amplitude                    (ar, default 0.5)
//    phase     phase offset in radians             (ar, default 0)
//    pan       stereo position -1..+1              (kr, default 0)
//    out_bus   audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\sine, {
    var freq  = \freq.kr(440);
    var fm    = \fm.ar(0);
    var amp   = \amp.ar(0.5);
    var phase = \phase.ar(0);

    var sig = SinOsc.ar(freq + fm, phase) * amp;

    Out.ar(\out_bus.kr(0), Pan2.ar(sig, \pan.kr(0)));
}).writeDefFile(outDir);

("Wrote sine.scsyndef to: " ++ outDir).postln;
)
