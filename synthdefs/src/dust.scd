// ════════════════════════════════════════════════════════════
//  dust.scd
//
//  Random impulse generator with modulatable density and
//  amplitude. Produces sparse clicks at random intervals —
//  beautiful for granular textures and ambient soundscapes.
//
//  Build:  npm run build:synthdefs -- dust.scd
//
//  Parameters:
//    density     average impulses per second          (kr, default 1)
//    amp         base output amplitude               (kr, default 0.5)
//    density_mod audio-rate density modulation        (ar, default 0)
//    amp_mod     audio-rate amplitude modulation     (ar, default 0)
//    pan         stereo position -1..+1              (kr, default 0)
//    out_bus     audio bus index to write output     (kr, default 0)
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\dust, {
    var density = \density.kr(1);
    var amp     = \amp.kr(0.5);

    var densityMod = \density_mod.ar(0);
    var ampMod     = \amp_mod.ar(0);

    var finalDensity = (density + densityMod).max(0);
    var finalAmp     = (amp + ampMod).max(0);

    var sig = Dust.ar(finalDensity) * finalAmp;

    var stereo = Pan2.ar(sig, \pan.kr(0));
    var safe = Select.ar(\out_bus.kr(0) <= 0, [stereo, stereo.clip(-1, 1)]);
    Out.ar(\out_bus.kr(0), safe);
}).writeDefFile(outDir);

("Wrote dust.scsyndef to: " ++ outDir).postln;
)
