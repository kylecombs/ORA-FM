// ════════════════════════════════════════════════════════════
//  breakpoint-env.scd
//
//  Triggerable 16-breakpoint envelope SynthDef for ORA-FM.
//  Outputs to a control bus for modulating other synth params.
//
//  All levels, times, and curve values are named controls that
//  can be set at runtime via /n_set OSC messages. Unused
//  segments should have t=0 (zero duration, instantly skipped).
//
//  Build (headless):   ./synthdefs/build.sh
//  Build (IDE):        thisProcess.interpreter.executeFile("<path>/breakpoint-env.scd");
//
//  Parameters:
//    l0..l15   breakpoint levels (typically 0.0 – 1.0)
//    t0..t14   segment durations in seconds (0 = skip)
//    c0..c14   curve per segment (0=linear, +N/-N = exponential)
//    t_trig    trigger input (bang restarts envelope from l0)
//    out       control bus index to write output
//    gate      hold gate (1=run, 0=release — not currently used)
// ════════════════════════════════════════════════════════════
(
// ~outDir is injected by build.sh; fall back to recordings dir for IDE use
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\breakpoint_env, {
    // 16 breakpoint levels
    var l0  = \l0.kr(0),    l1  = \l1.kr(1),
        l2  = \l2.kr(0.6),  l3  = \l3.kr(0),
        l4  = \l4.kr(0),    l5  = \l5.kr(0),
        l6  = \l6.kr(0),    l7  = \l7.kr(0),
        l8  = \l8.kr(0),    l9  = \l9.kr(0),
        l10 = \l10.kr(0),   l11 = \l11.kr(0),
        l12 = \l12.kr(0),   l13 = \l13.kr(0),
        l14 = \l14.kr(0),   l15 = \l15.kr(0);

    // 15 segment durations
    var t0  = \t0.kr(0.15),  t1  = \t1.kr(0.25),
        t2  = \t2.kr(0.6),   t3  = \t3.kr(0),
        t4  = \t4.kr(0),     t5  = \t5.kr(0),
        t6  = \t6.kr(0),     t7  = \t7.kr(0),
        t8  = \t8.kr(0),     t9  = \t9.kr(0),
        t10 = \t10.kr(0),    t11 = \t11.kr(0),
        t12 = \t12.kr(0),    t13 = \t13.kr(0),
        t14 = \t14.kr(0);

    // 15 curve values (0 = linear)
    var c0  = \c0.kr(0),  c1  = \c1.kr(0),
        c2  = \c2.kr(0),  c3  = \c3.kr(0),
        c4  = \c4.kr(0),  c5  = \c5.kr(0),
        c6  = \c6.kr(0),  c7  = \c7.kr(0),
        c8  = \c8.kr(0),  c9  = \c9.kr(0),
        c10 = \c10.kr(0), c11 = \c11.kr(0),
        c12 = \c12.kr(0), c13 = \c13.kr(0),
        c14 = \c14.kr(0);

    var levels = [l0,l1,l2,l3,l4,l5,l6,l7,l8,l9,l10,l11,l12,l13,l14,l15];
    var times  = [t0,t1,t2,t3,t4,t5,t6,t7,t8,t9,t10,t11,t12,t13,t14];
    var curves = [c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14];

    var env = EnvGen.kr(
        Env.new(levels, times, curves),
        \t_trig.tr(0),
        doneAction: 0
    );

    Out.kr(\out.kr(0), env);
}).writeDefFile(outDir);

("Wrote breakpoint_env.scsyndef to: " ++ outDir).postln;
)
