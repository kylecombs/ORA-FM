// ════════════════════════════════════════════════════════════
//  saw_osc.scd
//
//  Audio-rate sawtooth oscillator with modulatable frequency
//  and amplitude inputs. Supports both control-rate parameter
//  changes and audio-rate modulation via dedicated inputs.
//
//  Build:  npm run build:synthdefs -- saw_osc.scd
//
//  Parameters:
//    freq        base oscillator frequency in Hz     (kr, default 440)
//    amp         base output amplitude               (kr, default 0.5)
//    freq_mod    audio-rate frequency modulation     (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
//
//  Audio-rate modulation:
//    Route any audio signal to freq_mod or amp_mod using /n_mapa
//    to map the parameter to an audio bus.
//    The modulation signal is ADDED to the base parameter value.
//    For FM: freq_mod values are in Hz (e.g. ±100 for vibrato)
//    For AM: amp_mod values are added to amp (keep amp low, e.g. 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\saw_osc, {
    // Base parameters (control-rate, set via sliders or /n_set)
    var freq = \freq.kr(440);
    var amp  = \amp.kr(0.5);

    // Audio-rate modulation inputs (mapped via /n_mapa from audio buses)
    var freqMod = \freq_mod.ar(0);
    var ampMod  = \amp_mod.ar(0);

    // Combine base + modulation
    var finalFreq = freq + freqMod;
    var finalAmp  = (amp + ampMod).max(0);  // Clamp to avoid negative amplitude

    var sig = Saw.ar(finalFreq) * finalAmp;

    // For internal modulation buses, output the full signal (high amp = high mod depth).
    // For audio output (bus 0), clip to safe levels to prevent speaker damage.
    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);

    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote saw_osc.scsyndef to: " ++ outDir).postln;
)
