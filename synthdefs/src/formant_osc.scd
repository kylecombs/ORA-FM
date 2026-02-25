// ════════════════════════════════════════════════════════════
//  formant_osc.scd
//
//  Vocal formant oscillator with modulatable fundamental
//  frequency, formant frequency, and bandwidth. Generates
//  vowel-like tones — great for vocal drones and eerie pads.
//
//  Build:  npm run build:synthdefs -- formant_osc.scd
//
//  Parameters:
//    freq        fundamental frequency in Hz         (kr, default 440)
//    amp         base output amplitude               (kr, default 0.5)
//    formfreq    formant center frequency in Hz      (kr, default 1760)
//    bwfreq      bandwidth frequency in Hz           (kr, default 880)
//    freq_mod    audio-rate frequency modulation     (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    formfreq_mod audio-rate formant modulation      (ar, default 0)
//    bwfreq_mod  audio-rate bandwidth modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\formant_osc, {
    var freq     = \freq.kr(440);
    var amp      = \amp.kr(0.5);
    var formfreq = \formfreq.kr(1760);
    var bwfreq   = \bwfreq.kr(880);

    var freqMod     = \freq_mod.ar(0);
    var ampMod      = \amp_mod.ar(0);
    var formfreqMod = \formfreq_mod.ar(0);
    var bwfreqMod   = \bwfreq_mod.ar(0);

    var finalFreq     = freq + freqMod;
    var finalAmp      = (amp + ampMod).max(0);
    var finalFormfreq = formfreq + formfreqMod;
    var finalBwfreq   = bwfreq + bwfreqMod;

    var sig = Formant.ar(finalFreq, finalFormfreq, finalBwfreq) * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote formant_osc.scsyndef to: " ++ outDir).postln;
)
