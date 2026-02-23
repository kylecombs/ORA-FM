// ════════════════════════════════════════════════════════════
//  print.scd
//
//  Debug module that reads an audio signal and writes its value
//  to a control bus for polling from JavaScript.
//  This is a tap/monitor - it reads but does not output.
//
//  Build:  npm run build:synthdefs -- print.scd
//
//  Parameters:
//    in_bus      audio bus to read from              (kr, default 0)
//    out_c_bus   control bus to write value to       (kr, default 0)
//
//  The JavaScript side polls the control bus to read the value.
// ════════════════════════════════════════════════════════════
(
var outDir = ~outDir ?? (thisProcess.platform.recordingsDir +/+ "ora-fm-synthdefs");
outDir.mkdir;

SynthDef(\print, {
    var sig = In.ar(\in_bus.kr(0), 2);  // Stereo input
    var outCBus = \out_c_bus.kr(0);

    // Sample the signal at control rate and write to control bus
    var value = A2K.kr(sig[0]);  // Convert audio to control rate

    Out.kr(outCBus, value);

    // No audio output - this is a monitor/tap only
}).writeDefFile(outDir);

("Wrote print.scsyndef to: " ++ outDir).postln;
)
