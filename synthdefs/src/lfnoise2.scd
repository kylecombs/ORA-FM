// ════════════════════════════════════════════════════════════
//  lfnoise2.scd
//
//  Quadratically interpolated random value generator. Produces
//  smooth, organic random curves at the specified rate. The
//  smoothest of the LFNoise family — ideal as a modulation
//  source for slow, natural-sounding drift in pitch or timbre.
//
//  Build:  npm run build:synthdefs -- lfnoise2.scd
//
//  Parameters:
//    freq        rate of random value generation Hz   (kr, default 4)
//    amp         base output amplitude               (kr, default 0.5)
//    freq_mod    audio-rate frequency modulation     (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\lfnoise2, {
    var freq = \freq.kr(4);
    var amp  = \amp.kr(0.5);

    var freqMod = \freq_mod.ar(0);
    var ampMod  = \amp_mod.ar(0);

    var finalFreq = (freq + freqMod).max(0.01);
    var finalAmp  = (amp + ampMod).max(0);

    var sig = LFNoise2.ar(finalFreq) * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote lfnoise2.scsyndef to: " ++ outDir).postln;
)
