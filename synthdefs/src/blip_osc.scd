// ════════════════════════════════════════════════════════════
//  blip_osc.scd
//
//  Band-limited impulse oscillator with modulatable frequency,
//  amplitude, and number of harmonics. Produces harmonically
//  rich tones — sounds like a bright, additive-synthesis stack.
//
//  Build:  npm run build:synthdefs -- blip_osc.scd
//
//  Parameters:
//    freq        base frequency in Hz                (kr, default 440)
//    amp         base output amplitude               (kr, default 0.5)
//    numharm     number of harmonics                 (kr, default 20)
//    freq_mod    audio-rate frequency modulation     (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    numharm_mod audio-rate harmonics modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\blip_osc, {
    var freq    = \freq.kr(440);
    var amp     = \amp.kr(0.5);
    var numharm = \numharm.kr(20);

    var freqMod    = \freq_mod.ar(0);
    var ampMod     = \amp_mod.ar(0);
    var numharmMod = \numharm_mod.ar(0);

    var finalFreq    = freq + freqMod;
    var finalAmp     = (amp + ampMod).max(0);
    var finalNumharm = (numharm + numharmMod).clip(1, 200);

    var sig = Blip.ar(finalFreq, finalNumharm) * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote blip_osc.scsyndef to: " ++ outDir).postln;
)
