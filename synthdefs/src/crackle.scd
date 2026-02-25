// ════════════════════════════════════════════════════════════
//  crackle.scd
//
//  Chaotic noise generator with modulatable chaos parameter
//  and amplitude. Produces organic crackling textures that
//  range from silence (chaos=1) to full chaos (chaos=2).
//
//  Build:  npm run build:synthdefs -- crackle.scd
//
//  Parameters:
//    chaos       chaos parameter 1.0..2.0            (kr, default 1.5)
//    amp         base output amplitude               (kr, default 0.5)
//    chaos_mod   audio-rate chaos modulation          (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\crackle, {
    var chaos = \chaos.kr(1.5);
    var amp   = \amp.kr(0.5);

    var chaosMod = \chaos_mod.ar(0);
    var ampMod   = \amp_mod.ar(0);

    var finalChaos = (chaos + chaosMod).clip(1, 2);
    var finalAmp   = (amp + ampMod).max(0);

    var sig = Crackle.ar(finalChaos) * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote crackle.scsyndef to: " ++ outDir).postln;
)
