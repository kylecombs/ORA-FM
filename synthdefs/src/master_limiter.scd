// ════════════════════════════════════════════════════════════
//  master_limiter.scd
//
//  Safety limiter that clips the master output to prevent
//  speaker/hearing damage. Runs on bus 0 (hardware output)
//  and should be the last synth in the processing chain.
//
//  Build:  npm run build:synthdefs -- master_limiter.scd
//
//  Parameters:
//    limit     clipping threshold (default 1.0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\master_limiter, {
    var limit = \limit.kr(1);
    var sig = In.ar(0, 2);  // Read from hardware bus

    // Hard clip to limit
    var safe = sig.clip(-1 * limit, limit);

    // Replace the bus contents with the clipped signal
    ReplaceOut.ar(0, safe);
}).writeDefFile(outDir);

("Wrote master_limiter.scsyndef to: " ++ outDir).postln;
)
