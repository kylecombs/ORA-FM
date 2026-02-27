// ════════════════════════════════════════════════════════════
//  sample_player.scd
//
//  Buffer-based sample player with modulatable playback rate,
//  region selection (start/end position), loop toggle, and
//  trigger input. Supports both mono and stereo samples.
//
//  NOTE: This SynthDef is built at runtime in JavaScript
//  (src/audio/buildSamplePlayerDef.js) because sclang is not
//  available in the deployment environment. This file documents
//  the equivalent SuperCollider source code.
//
//  Build (if sclang available):
//    npm run build:synthdefs -- sample_player.scd
//
//  Parameters:
//    buf         buffer number to play from            (kr, default 0)
//    rate        playback speed (neg = reverse)        (kr, default 1)
//    start_pos   region start, 0-1 normalised          (kr, default 0)
//    end_pos     region end, 0-1 normalised            (kr, default 1)
//    loop        loop toggle (0=one-shot, 1=loop)      (kr, default 1)
//    amp         output amplitude                      (kr, default 0.5)
//    pan         stereo position -1..+1                (kr, default 0)
//    out_bus     audio bus index to write output        (kr, default 0)
//    t_trig      trigger input (resets playhead)        (tr, default 0)
//    rate_mod    audio-rate rate modulation             (ar, default 0)
//    amp_mod     audio-rate amplitude modulation        (ar, default 0)
//
//  Audio-rate modulation:
//    Route any audio signal to rate_mod or amp_mod using /n_mapa.
//    The modulation signal is ADDED to the base parameter value.
//    For rate_mod: values add to rate (e.g. +/-0.5 for vibrato)
//    For amp_mod: values add to amp (use for tremolo/AM)
//
//  Stereo handling:
//    BufRd reads 2 channels. Mono buffers return the same
//    channel twice (so both L and R are identical). Stereo
//    buffers return distinct L/R channels. Balance2 handles
//    panning.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\sample_player, {
    // ── Control-rate parameters ──
    var buf      = \buf.kr(0);
    var rate     = \rate.kr(1);
    var startPos = \start_pos.kr(0);
    var endPos   = \end_pos.kr(1);
    var loop     = \loop.kr(1);
    var amp      = Lag.kr(\amp.kr(0.5), 0.005);
    var pan      = \pan.kr(0);
    var outBus   = \out_bus.kr(0);

    // ── Trigger parameter ──
    var trig = \t_trig.tr(0);

    // ── Audio-rate modulation inputs ──
    var rateMod = \rate_mod.ar(0);
    var ampMod  = \amp_mod.ar(0);

    // ── Processing ──
    var frames    = BufFrames.kr(buf);
    var rateScale = BufRateScale.kr(buf);
    var finalRate = (rate + rateMod) * rateScale;

    var lo = startPos * frames;
    var hi = endPos * frames;

    // Phasor continuously ramps between lo and hi, resets on trigger
    var phasor = Phasor.ar(trig, finalRate, lo, hi, lo);

    // Read 2 channels (mono buffers repeat channel, stereo reads both)
    var sig = BufRd.ar(2, buf, phasor, loop, 2);

    // Apply amplitude with modulation
    var finalAmp = (amp + ampMod).max(0);
    sig = sig * finalAmp;

    // Stereo panning
    var stereo = Balance2.ar(sig[0], sig[1], pan);

    Out.ar(outBus, stereo);
}).writeDefFile(outDir);

("Wrote sample_player.scsyndef to: " ++ outDir).postln;
)
