// ════════════════════════════════════════════════════════════
//  hpf.scd
//
//  High-Pass Filter FX. Reads stereo audio from in_bus,
//  applies a second-order high-pass filter (HPF), and writes
//  to out_bus. Supports audio-rate modulation of the cutoff
//  frequency and dry/wet mixing.
//
//  Build:  npm run build:synthdefs -- hpf.scd
//
//  Parameters:
//    in_bus      audio bus to read input from        (kr, default 0)
//    out_bus     audio bus to write output to        (kr, default 0)
//    cutoff      filter cutoff frequency in Hz       (kr, default 500)
//    cutoff_mod  audio-rate cutoff modulation in Hz  (ar, default 0)
//    mix         dry/wet blend 0=dry, 1=wet          (kr, default 1)
//
//  Audio-rate modulation:
//    Route any audio signal to cutoff_mod using /n_mapa.
//    The modulation value is ADDED to the base cutoff parameter.
//    Example: cutoff=500, cutoff_mod from ±100 Hz LFO →
//             cutoff sweeps 400-600 Hz.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\hpf, {
    // Base parameters (control-rate, set via sliders or /n_set)
    var cutoff = \cutoff.kr(500);
    var mix    = \mix.kr(1);

    // Audio-rate modulation input (mapped via /n_mapa from audio buses)
    var cutoffMod = \cutoff_mod.ar(0);

    // Combine base + modulation; clamp cutoff to safe range
    var finalCutoff = (cutoff + cutoffMod).clip(20, 20000);

    var dry = In.ar(\in_bus.kr(0), 2);
    var wet = HPF.ar(dry, finalCutoff);

    var out = XFade2.ar(dry, wet, mix * 2 - 1);

    var safe = Select.ar(\out_bus.kr(0) <= 0, [out, out.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote hpf.scsyndef to: " ++ outDir).postln;
)
