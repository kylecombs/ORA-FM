// ════════════════════════════════════════════════════════════
//  pink_noise.scd
//
//  Pink (1/f) noise generator with modulatable amplitude.
//  Energy decreases at 3 dB/octave — more natural-sounding
//  than white noise, often used for ambient washes and as
//  a warm modulation source.
//
//  Build:  npm run build:synthdefs -- pink_noise.scd
//
//  Parameters:
//    amp         base output amplitude               (kr, default 0.5)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\pink_noise, {
    var amp = \amp.kr(0.5);

    var ampMod = \amp_mod.ar(0);

    var finalAmp = (amp + ampMod).max(0);

    var sig = PinkNoise.ar * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote pink_noise.scsyndef to: " ++ outDir).postln;
)
