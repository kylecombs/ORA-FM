// ════════════════════════════════════════════════════════════
//  multiply.scd
//
//  Signal multiplier / amplifier for scaling audio signals.
//  Use this to boost oscillator output for FM synthesis depth,
//  or to attenuate signals.
//
//  Build:  npm run build:synthdefs -- multiply.scd
//
//  Parameters:
//    gain      multiplication factor               (kr, default 1)
//    in_bus    audio bus to read input from        (kr, default 0)
//    out_bus   audio bus to write output to        (kr, default 0)
//
//  Usage for FM synthesis:
//    Sine Osc (amp=1) → Multiply (gain=500) → Carrier freq input
//    This gives ±500 Hz modulation depth.
//
//  Note: No clipping applied - use for internal routing/modulation.
//  The final output to hardware should go through a limiter if needed.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\multiply, {
    var gain = \gain.kr(1);
    var sig = In.ar(\in_bus.kr(0), 2);  // Stereo input

    var out = sig * gain;

    Out.ar(\out_bus.kr(0), out);
}).writeDefFile(outDir);

("Wrote multiply.scsyndef to: " ++ outDir).postln;
)
