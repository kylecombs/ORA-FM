// ════════════════════════════════════════════════════════════
//  lfo.scd
//
//  Low-frequency oscillator with selectable waveform.
//  Four waveform shapes — sine, triangle, saw, pulse — are
//  generated simultaneously and Select.ar picks one based on
//  the `waveform` parameter.  All LF variants use audio-rate
//  UGens so the output can drive audio-rate modulation buses.
//
//  Build:  npm run build:synthdefs -- lfo.scd
//
//  Parameters:
//    freq        LFO rate in Hz                      (kr, default 1)
//    amp         output amplitude                    (kr, default 0.5)
//    waveform    shape selector 0–3                  (kr, default 0)
//                  0 = sine   (SinOsc)
//                  1 = tri    (LFTri)
//                  2 = saw    (LFSaw)
//                  3 = pulse  (LFPulse, bipolar)
//    width       pulse width (only for waveform 3)   (kr, default 0.5)
//    freq_mod    audio-rate frequency modulation      (ar, default 0)
//    amp_mod     audio-rate amplitude modulation      (ar, default 0)
//    phase_mod   audio-rate phase modulation           (ar, default 0)
//                  (affects sine waveform only — LF UGens have
//                   initial-phase-only iphase inputs)
//    pan         stereo position -1..+1               (kr, default 0)
//    out_bus     audio bus index to write output       (kr, default 0)
//
//  Audio-rate modulation:
//    Route any audio signal to freq_mod, amp_mod, or phase_mod
//    using /n_mapa to map the parameter to an audio bus.
//    The modulation signal is ADDED to the base parameter value.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\lfo, {
    // Base parameters (control-rate)
    var freq     = \freq.kr(1);
    var amp      = Lag.kr(\amp.kr(0.5), 0.005);
    var waveform = \waveform.kr(0);
    var width    = \width.kr(0.5);

    // Audio-rate modulation inputs
    var freqMod  = \freq_mod.ar(0);
    var ampMod   = \amp_mod.ar(0);
    var phaseMod = \phase_mod.ar(0);

    // Combine base + modulation
    var finalFreq = (freq + freqMod).max(0.01);
    var finalAmp  = (amp + ampMod).max(0);

    // Generate all four waveforms
    var sine  = SinOsc.ar(finalFreq, phaseMod);
    var tri   = LFTri.ar(finalFreq);
    var saw   = LFSaw.ar(finalFreq);
    var pulse = (LFPulse.ar(finalFreq, 0, width) * 2) - 1; // bipolar

    // Select active waveform and scale by amplitude
    var sig = Select.ar(waveform, [sine, tri, saw, pulse]) * finalAmp;

    // Stereo output with safety clipping on bus 0
    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote lfo.scsyndef to: " ++ outDir).postln;
)
