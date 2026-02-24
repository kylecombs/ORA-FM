// ════════════════════════════════════════════════════════════
//  moogff.scd
//
//  MoogFF Ladder Filter FX. Reads stereo audio from in_bus,
//  applies a MoogFF 4-pole low-pass ladder filter with gain
//  compensation, and writes to out_bus. Supports audio-rate
//  modulation of cutoff and resonance, plus dry/wet mixing.
//
//  Build:  npm run build:synthdefs -- moogff.scd
//
//  Parameters:
//    in_bus      audio bus to read input from              (kr, default 0)
//    out_bus     audio bus to write output to              (kr, default 0)
//    cutoff      filter cutoff frequency in Hz             (kr, default 1000)
//    res         resonance 0=off, 4=self-oscillation       (kr, default 2)
//    gain        input gain before filtering               (kr, default 1)
//    cutoff_mod  audio-rate cutoff modulation in Hz        (ar, default 0)
//    res_mod     audio-rate resonance modulation           (ar, default 0)
//    mix         dry/wet blend 0=dry, 1=wet                (kr, default 1)
//
//  Audio-rate modulation:
//    Route audio signals to cutoff_mod or res_mod using /n_mapa.
//    Modulation values are ADDED to the base parameter values.
//    res range 0-4: res >= ~3.5 causes self-oscillation.
//    gain > 1 adds harmonic saturation before filtering.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\moogff, {
    // Base parameters (control-rate, set via sliders or /n_set)
    var cutoff = \cutoff.kr(1000);
    var res    = \res.kr(2);
    var gain   = \gain.kr(1);
    var mix    = \mix.kr(1);

    // Audio-rate modulation inputs (mapped via /n_mapa from audio buses)
    var cutoffMod = \cutoff_mod.ar(0);
    var resMod    = \res_mod.ar(0);

    // Combine base + modulation; clamp to safe ranges
    var finalCutoff = (cutoff + cutoffMod).clip(20, 20000);
    var finalRes    = (res + resMod).clip(0, 4);

    var dry = In.ar(\in_bus.kr(0), 2);
    var wet = MoogFF.ar(dry * gain, finalCutoff, finalRes);

    var out = XFade2.ar(dry, wet, mix * 2 - 1);

    var safe = Select.ar(\out_bus.kr(0) <= 0, [out, out.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote moogff.scsyndef to: " ++ outDir).postln;
)
