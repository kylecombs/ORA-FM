// ════════════════════════════════════════════════════════════
//  sine.scd
//
//  Audio-rate sine oscillator with modulatable frequency,
//  amplitude, and phase inputs.
//
//  All three signal inputs default to fixed values but accept
//  audio-rate modulation — connect an LFO or envelope to the
//  corresponding bus for FM, AM, or phase-modulation effects.
//
//  Build:  npm run build:synthdefs -- sine.scd
//
//  Parameters:
//    freq      oscillator frequency in Hz          (ar, default 440)
//    amp       output amplitude                    (ar, default 0.5)
//    phase     phase offset in radians             (ar, default 0)
//    pan       stereo position -1..+1              (kr, default 0)
//    out_bus   audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\sine, {
    var freq  = \freq.ar(440);
    var amp   = \amp.ar(0.5);
    var phase = \phase.ar(0);

    var sig = SinOsc.ar(freq, phase) * amp;

    Out.ar(\out_bus.kr(0), Pan2.ar(sig, \pan.kr(0)));
}).writeDefFile(outDir);

("Wrote sine.scsyndef to: " ++ outDir).postln;
)
