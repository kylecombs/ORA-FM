// ════════════════════════════════════════════════════════════
//  resonz.scd
//
//  Resonant Bandpass Filter FX. Reads stereo audio from
//  in_bus, applies a resonant bandpass filter (Resonz) with
//  normalised amplitude, and writes to out_bus. Supports
//  audio-rate modulation of the center frequency and bandwidth
//  ratio, plus dry/wet mixing.
//
//  Resonz is identical to BPF in parameter signature but its
//  peak amplitude is normalised — useful for creating tuned
//  resonance from noise or broadband signals.
//
//  Build:  npm run build:synthdefs -- resonz.scd
//
//  Parameters:
//    in_bus      audio bus to read input from              (kr, default 0)
//    out_bus     audio bus to write output to              (kr, default 0)
//    cutoff      center frequency in Hz                    (kr, default 1000)
//    bw          bandwidth ratio (bandwidth / centerFreq)  (kr, default 0.5)
//    cutoff_mod  audio-rate center freq modulation in Hz   (ar, default 0)
//    bw_mod      audio-rate bandwidth ratio modulation     (ar, default 0)
//    mix         dry/wet blend 0=dry, 1=wet                (kr, default 1)
//
//  Audio-rate modulation:
//    Route audio signals to cutoff_mod or bw_mod using /n_mapa.
//    Modulation values are ADDED to the base parameter values.
//    Lower bw values = sharper resonance peak (higher Q).
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\resonz, {
    // Base parameters (control-rate, set via sliders or /n_set)
    var cutoff = \cutoff.kr(1000);
    var bw     = \bw.kr(0.5);
    var mix    = \mix.kr(1);

    // Audio-rate modulation inputs (mapped via /n_mapa from audio buses)
    var cutoffMod = \cutoff_mod.ar(0);
    var bwMod     = \bw_mod.ar(0);

    // Combine base + modulation; clamp to safe ranges
    var finalCutoff = (cutoff + cutoffMod).clip(20, 20000);
    var finalBw     = (bw + bwMod).max(0.01);

    var dry = In.ar(\in_bus.kr(0), 2);
    var wet = Resonz.ar(dry, finalCutoff, finalBw);

    var out = XFade2.ar(dry, wet, mix * 2 - 1);

    var safe = Select.ar(\out_bus.kr(0) <= 0, [out, out.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote resonz.scsyndef to: " ++ outDir).postln;
)
