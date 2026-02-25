// ════════════════════════════════════════════════════════════
//  comb.scd
//
//  Comb Filter FX. Reads stereo audio from in_bus, applies a
//  cubic-interpolating comb delay filter (CombC), and writes
//  to out_bus. Supports audio-rate modulation of the delay
//  time and decay time, plus dry/wet mixing.
//
//  A comb filter creates pitched resonance by feeding the
//  signal back through a short delay line. Useful for metallic
//  timbres, Karplus-Strong-style plucks, and pitched echoes.
//
//  Build:  npm run build:synthdefs -- comb.scd
//
//  Parameters:
//    in_bus          audio bus to read input from                (kr, default 0)
//    out_bus         audio bus to write output to                (kr, default 0)
//    delaytime       delay time in seconds (sets pitch)          (kr, default 0.2)
//    decaytime       60 dB decay time in seconds                 (kr, default 1.0)
//    delaytime_mod   audio-rate delay time modulation (seconds)  (ar, default 0)
//    decaytime_mod   audio-rate decay time modulation (seconds)  (ar, default 0)
//    mix             dry/wet blend 0=dry, 1=wet                  (kr, default 0.5)
//
//  Audio-rate modulation:
//    Route audio signals to delaytime_mod or decaytime_mod using /n_mapa.
//    Modulation values are ADDED to the base parameter values.
//    Negative decaytime inverts the feedback polarity.
//
//  Notes:
//    Maximum delay time is fixed at 1 second (buffer allocated at init).
//    Delay times above 1 s are clamped. For longer delays, use Echo.
//    Pitch of the comb resonance ≈ 1/delaytime Hz.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\comb, {
    // Base parameters (control-rate, set via sliders or /n_set)
    var delaytime = \delaytime.kr(0.2);
    var decaytime = \decaytime.kr(1.0);
    var mix       = \mix.kr(0.5);

    // Audio-rate modulation inputs (mapped via /n_mapa from audio buses)
    var delaytimeMod = \delaytime_mod.ar(0);
    var decaytimeMod = \decaytime_mod.ar(0);

    // Combine base + modulation; clamp to safe ranges
    // Max delay is 1.0 s (buffer size set below). Min avoids zero/negative.
    var finalDelay = (delaytime + delaytimeMod).clip(0.0001, 1.0);
    var finalDecay = (decaytime + decaytimeMod).clip(0.01, 20);

    var dry = In.ar(\in_bus.kr(0), 2);
    // CombC.ar(in, maxdelaytime, delaytime, decaytime)
    // maxdelaytime=1.0 allocates a 1-second delay buffer
    var wet = CombC.ar(dry, 1.0, finalDelay, finalDecay);

    var out = XFade2.ar(dry, wet, mix * 2 - 1);

    var safe = Select.ar(\out_bus.kr(0) <= 0, [out, out.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote comb.scsyndef to: " ++ outDir).postln;
)
