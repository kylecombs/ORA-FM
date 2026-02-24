// ════════════════════════════════════════════════════════════
//  sine.scd
//
//  Audio-rate sine oscillator with modulatable frequency,
//  amplitude, and phase inputs. Supports both control-rate
//  parameter changes and audio-rate modulation via dedicated
//  modulation inputs.
//
//  Build:  npm run build:synthdefs -- sine.scd
//
//  Parameters:
//    freq        base oscillator frequency in Hz     (kr, default 440)
//    amp         base output amplitude               (kr, default 0.5)
//    phase       base phase offset in radians        (kr, default 0)
//    freq_mod    audio-rate frequency modulation     (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    phase_mod   audio-rate phase modulation         (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
//
//  Audio-rate modulation:
//    Route any audio signal to freq_mod, amp_mod, or phase_mod
//    using /n_mapa to map the parameter to an audio bus.
//    The modulation signal is ADDED to the base parameter value.
//    For FM: freq_mod values are in Hz (e.g. ±100 for vibrato)
//    For AM: amp_mod values are added to amp (keep amp low, e.g. 0)
//    For PM: phase_mod values are in radians
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\sine, {
    // Base parameters (control-rate, set via sliders or /n_set)
    // Lag amp (5 ms) to prevent clicks from abrupt control-rate changes
    var freq  = \freq.kr(440);
    var amp   = Lag.kr(\amp.kr(0.5), 0.005);
    var phase = \phase.kr(0);

    // Audio-rate modulation inputs (mapped via /n_mapa from audio buses)
    var freqMod  = \freq_mod.ar(0);
    var ampMod   = \amp_mod.ar(0);
    var phaseMod = \phase_mod.ar(0);

    // Combine base + modulation
    var finalFreq  = freq + freqMod;
    var finalAmp   = (amp + ampMod).max(0);  // Clamp to avoid negative amplitude
    var finalPhase = phase + phaseMod;

    var sig = SinOsc.ar(finalFreq, finalPhase) * finalAmp;

    // For internal modulation buses, output the full signal (high amp = high mod depth).
    // For audio output (bus 0), clip to safe levels to prevent speaker damage.
    // We clip the final stereo signal rather than the mono sig, so panning is preserved.
    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);

    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote sine.scsyndef to: " ++ outDir).postln;
)
