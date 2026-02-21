import { useState, useRef, useCallback, useEffect } from 'react';
import { SuperSonic } from 'supersonic-scsynth';
import './App.css';

const SYNTH_DEFS = [
  'sonic-pi-beep',
  'sonic-pi-saw',
  'sonic-pi-pretty_bell',
  'sonic-pi-pluck',
  'sonic-pi-dark_ambience',
  'sonic-pi-hollow',
  'sonic-pi-blade',
  'sonic-pi-bnoise',
];

// All playable instrument synthdefs, grouped by category
const ALL_SYNTHS = {
  'Tonal': [
    'sonic-pi-beep', 'sonic-pi-saw', 'sonic-pi-square', 'sonic-pi-tri',
    'sonic-pi-pulse', 'sonic-pi-subpulse', 'sonic-pi-supersaw',
    'sonic-pi-dsaw', 'sonic-pi-dpulse', 'sonic-pi-dtri',
  ],
  'Modulated': [
    'sonic-pi-mod_saw', 'sonic-pi-mod_sine', 'sonic-pi-mod_tri',
    'sonic-pi-mod_pulse', 'sonic-pi-mod_dsaw', 'sonic-pi-mod_fm',
  ],
  'Synths': [
    'sonic-pi-prophet', 'sonic-pi-tb303', 'sonic-pi-tech_saws',
    'sonic-pi-zawa', 'sonic-pi-hoover', 'sonic-pi-growl',
    'sonic-pi-rodeo', 'sonic-pi-fm', 'sonic-pi-rhodey',
  ],
  'Bells & Keys': [
    'sonic-pi-pretty_bell', 'sonic-pi-dull_bell', 'sonic-pi-kalimba',
    'sonic-pi-piano', 'sonic-pi-pluck', 'sonic-pi-organ_tonewheel',
  ],
  'Pads & Ambient': [
    'sonic-pi-dark_ambience', 'sonic-pi-hollow', 'sonic-pi-blade',
  ],
  'Bass': [
    'sonic-pi-bass_foundation', 'sonic-pi-bass_highend',
    'sonic-pi-chipbass',
  ],
  'Chip': [
    'sonic-pi-chiplead', 'sonic-pi-chipnoise', 'sonic-pi-gabberkick',
  ],
  'Noise': [
    'sonic-pi-noise', 'sonic-pi-bnoise', 'sonic-pi-cnoise',
    'sonic-pi-gnoise', 'sonic-pi-pnoise',
  ],
  '808 Drums': [
    'sonic-pi-sc808_bassdrum', 'sonic-pi-sc808_snare',
    'sonic-pi-sc808_clap', 'sonic-pi-sc808_closed_hihat',
    'sonic-pi-sc808_open_hihat', 'sonic-pi-sc808_cymbal',
    'sonic-pi-sc808_cowbell', 'sonic-pi-sc808_claves',
    'sonic-pi-sc808_rimshot', 'sonic-pi-sc808_maracas',
    'sonic-pi-sc808_tomhi', 'sonic-pi-sc808_tommid',
    'sonic-pi-sc808_tomlo', 'sonic-pi-sc808_congahi',
    'sonic-pi-sc808_congamid', 'sonic-pi-sc808_congalo',
  ],
};

const MIDI_NOTES = [
  { label: 'C2', value: 36 }, { label: 'C3', value: 48 },
  { label: 'C4 (middle)', value: 60 }, { label: 'E4', value: 64 },
  { label: 'G4', value: 67 }, { label: 'A4 (440Hz)', value: 69 },
  { label: 'C5', value: 72 }, { label: 'C6', value: 84 },
];

export default function TestPage() {
  const sonicRef = useRef(null);
  const nodeIdRef = useRef(2000);
  const activeNodesRef = useRef(new Set());
  const [booted, setBooted] = useState(false);
  const [booting, setBooting] = useState(false);
  const [log, setLog] = useState([]);
  const [diag, setDiag] = useState(null);
  const diagTimer = useRef(null);
  const loadedDefsRef = useRef(new Set(SYNTH_DEFS));

  // Explorer state
  const [selectedSynth, setSelectedSynth] = useState('sonic-pi-prophet');
  const [explorerNote, setExplorerNote] = useState(60);
  const [explorerDuration, setExplorerDuration] = useState(3);
  const [explorerLoading, setExplorerLoading] = useState(false);

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLog((prev) => [...prev.slice(-50), `[${ts}] ${msg}`]);
  }, []);

  // Poll diagnostics
  useEffect(() => {
    if (booted) {
      const poll = () => {
        const s = sonicRef.current;
        if (!s) return;
        const ctx = s.audioContext;
        let metrics = null;
        try { metrics = s.getMetrics(); } catch {}
        let tree = null;
        try { tree = s.getTree(); } catch {}
        let info = null;
        try { info = s.getInfo(); } catch {}
        setDiag({
          ctxState: ctx?.state,
          ctxSampleRate: ctx?.sampleRate,
          ctxTime: ctx?.currentTime?.toFixed(2),
          ctxBaseLatency: ctx?.baseLatency,
          ctxOutputLatency: ctx?.outputLatency,
          destChannels: ctx?.destination?.channelCount,
          destMax: ctx?.destination?.maxChannelCount,
          mode: s.mode,
          processCount: metrics?.scsynthProcessCount,
          msgsSent: metrics?.oscOutMessagesSent,
          msgsProcessed: metrics?.scsynthMessagesProcessed,
          msgsDropped: metrics?.scsynthMessagesDropped,
          wasmErrors: metrics?.scsynthWasmErrors,
          loadedDefs: metrics?.loadedSynthDefs,
          nodeCount: tree?.nodeCount,
          bootTime: info?.bootTimeMs,
          sab: info?.capabilities?.sharedArrayBuffer,
          coi: info?.capabilities?.crossOriginIsolated,
          version: info?.version,
        });
      };
      poll();
      diagTimer.current = setInterval(poll, 500);
    }
    return () => clearInterval(diagTimer.current);
  }, [booted]);

  const boot = useCallback(async () => {
    setBooting(true);
    addLog('Creating SuperSonic instance...');

    try {
      const sonic = new SuperSonic({
        wasmBaseURL: '/supersonic/wasm/',
        workerBaseURL: '/supersonic/workers/',
        sampleBaseURL: '/supersonic/samples/',
        synthdefBaseURL: '/supersonic/synthdefs/',
        debug: true,
        debugScsynth: true,
        debugOscIn: true,
        debugOscOut: true,
      });

      sonic.on('error', (e) => addLog(`ERROR: ${e.message}`));
      sonic.on('audiocontext:statechange', (e) => addLog(`AudioContext → ${e.state}`));
      sonic.on('ready', ({ capabilities }) => {
        addLog(`Ready! SAB=${capabilities.sharedArrayBuffer} COI=${capabilities.crossOriginIsolated}`);
      });
      sonic.on('message', (msg) => {
        if (msg[0] === '/n_go') {
          activeNodesRef.current.add(msg[1]);
          addLog(`Node started: ${msg[1]}`);
        }
        if (msg[0] === '/n_end') {
          activeNodesRef.current.delete(msg[1]);
          addLog(`Node ended: ${msg[1]}`);
        }
        if (msg[0] === '/fail') addLog(`FAIL: ${msg.slice(1).join(' ')}`);
      });

      addLog('Calling init()...');
      await sonic.init();
      addLog(`init() done. AudioContext state: ${sonic.audioContext?.state}`);

      addLog('Calling resume()...');
      const resumed = await sonic.resume();
      addLog(`resume() returned ${resumed}. AudioContext state: ${sonic.audioContext?.state}`);

      // Create default group 1 — scsynth doesn't create it automatically
      // All /s_new calls target group 1 (the 4th arg), so it must exist
      sonic.send('/g_new', 1, 0, 0);
      addLog('Created Group 1');

      // Load synthdefs
      for (const def of SYNTH_DEFS) {
        addLog(`Loading ${def}...`);
        try {
          const result = await sonic.loadSynthDef(def);
          addLog(`  ✓ ${result.name} (${result.size} bytes)`);
        } catch (e) {
          addLog(`  ✗ FAILED: ${e.message}`);
        }
      }

      await sonic.sync();
      addLog('sync() complete — all defs loaded');

      sonicRef.current = sonic;
      setBooted(true);

      // Log full info
      const info = sonic.getInfo();
      addLog(`Engine: ${info.version}, ${info.sampleRate}Hz, ${(info.totalMemory/1024/1024).toFixed(1)}MB WASM`);
    } catch (e) {
      addLog(`BOOT FAILED: ${e.message}`);
      console.error(e);
    }
    setBooting(false);
  }, [addLog]);

  const playNote = useCallback((synthName, params, durationMs = 3000) => {
    const sonic = sonicRef.current;
    if (!sonic) return;

    const id = nodeIdRef.current++;
    addLog(`▶ ${synthName} node=${id}`);
    try {
      sonic.send('/s_new', synthName, id, 0, 1, ...params);

      // Schedule release — skip if node already freed itself (doneAction:2)
      setTimeout(() => {
        if (!activeNodesRef.current.has(id)) return;
        try {
          sonic.send('/n_set', id, 'gate', 0);
          addLog(`◼ Released node ${id}`);
        } catch {
          try { sonic.send('/n_free', id); } catch {}
        }
      }, durationMs);
    } catch (e) {
      addLog(`SEND ERROR: ${e.message}`);
    }
  }, [addLog]);

  const freeAll = useCallback(() => {
    const sonic = sonicRef.current;
    if (!sonic) return;
    sonic.send('/g_freeAll', 1);
    addLog('Freed all nodes in group 1');
  }, [addLog]);

  // Test functions
  const testBeep = () =>
    playNote('sonic-pi-beep', ['note', 60, 'amp', 0.5, 'attack', 0.01, 'sustain', 1, 'release', 1]);

  const testSaw = () =>
    playNote('sonic-pi-saw', ['note', 60, 'amp', 0.3, 'attack', 0.1, 'sustain', 1, 'release', 1]);

  const testBell = () =>
    playNote('sonic-pi-pretty_bell', ['note', 72, 'amp', 0.5, 'attack', 0.01, 'sustain', 1, 'release', 2]);

  const testPluck = () =>
    playNote('sonic-pi-pluck', ['note', 60, 'amp', 0.8, 'attack', 0, 'sustain', 0, 'release', 1]);

  const testPad = () =>
    playNote('sonic-pi-dark_ambience', [
      'note', 57, 'amp', 0.3, 'attack', 2, 'sustain', 4, 'release', 3,
      'cutoff', 72, 'room', 0.9, 'reverb_damp', 0.5, 'res', 0.05,
    ], 8000);

  const testHollow = () =>
    playNote('sonic-pi-hollow', [
      'note', 69, 'amp', 0.2, 'attack', 2, 'sustain', 3, 'release', 3,
      'cutoff', 80, 'res', 0.1,
    ], 7000);

  const testBlade = () =>
    playNote('sonic-pi-blade', [
      'note', 64, 'amp', 0.2, 'attack', 1, 'sustain', 2, 'release', 2,
      'cutoff', 80, 'vibrato_rate', 3, 'vibrato_depth', 0.06,
    ], 5000);

  const testNoise = () =>
    playNote('sonic-pi-bnoise', [
      'amp', 0.1, 'attack', 1, 'sustain', 3, 'release', 2,
      'cutoff', 95, 'res', 0.05,
    ], 5000);

  const testMelodySequence = () => {
    const sonic = sonicRef.current;
    if (!sonic) return;
    addLog('▶ Playing melody sequence (C minor pentatonic)');
    const notes = [60, 63, 65, 67, 70, 72, 70, 67, 65, 63];
    notes.forEach((note, i) => {
      setTimeout(() => {
        const id = nodeIdRef.current++;
        sonic.send('/s_new', 'sonic-pi-beep', id, 0, 1,
          'note', note, 'amp', 0.3, 'attack', 0.05, 'sustain', 0.3, 'release', 0.3);
        addLog(`  ♪ note=${note} id=${id}`);
      }, i * 400);
    });
  };

  const testPadChord = () => {
    const sonic = sonicRef.current;
    if (!sonic) return;
    addLog('▶ Playing pad chord (Am: A3 + E4 + A4)');
    const voices = [
      { note: 57, amp: 0.3, pan: -0.15 },
      { note: 64, amp: 0.22, pan: 0.15 },
      { note: 69, amp: 0.15, pan: 0.0 },
    ];
    voices.forEach((v) => {
      const id = nodeIdRef.current++;
      sonic.send('/s_new', 'sonic-pi-dark_ambience', id, 0, 1,
        'note', v.note, 'amp', v.amp, 'pan', v.pan,
        'attack', 3, 'sustain', 9999, 'release', 5,
        'cutoff', 72, 'room', 0.9, 'reverb_damp', 0.5, 'res', 0.05);
      addLog(`  pad voice note=${v.note} id=${id}`);
    });
    addLog('  (use Free All to stop)');
  };

  const playExplorer = useCallback(async () => {
    const sonic = sonicRef.current;
    if (!sonic) return;

    // Load synthdef on demand if not already loaded
    if (!loadedDefsRef.current.has(selectedSynth)) {
      setExplorerLoading(true);
      addLog(`Loading ${selectedSynth}...`);
      try {
        const result = await sonic.loadSynthDef(selectedSynth);
        addLog(`  loaded ${result.name} (${result.size} bytes)`);
        loadedDefsRef.current.add(selectedSynth);
        await sonic.sync();
      } catch (e) {
        addLog(`  FAILED to load: ${e.message}`);
        setExplorerLoading(false);
        return;
      }
      setExplorerLoading(false);
    }

    // Noise synths don't use note parameter
    const isNoise = selectedSynth.includes('noise') || selectedSynth.includes('bnoise');
    // Drums are short percussive hits
    const isDrum = selectedSynth.includes('sc808_');
    // Pads/ambient benefit from longer envelope
    const isPad = selectedSynth.includes('ambience') || selectedSynth.includes('hollow')
      || selectedSynth.includes('blade') || selectedSynth.includes('zawa');

    const durationMs = isDrum ? 1500 : explorerDuration * 1000;
    const attack = isDrum ? 0 : isPad ? 1.5 : 0.05;
    const sustain = isDrum ? 0 : isPad ? explorerDuration * 0.5 : explorerDuration * 0.6;
    const release = isDrum ? 0.5 : isPad ? 2 : explorerDuration * 0.3;

    const params = [
      'amp', 0.4,
      'attack', attack,
      'sustain', sustain,
      'release', release,
    ];
    if (!isNoise) params.push('note', explorerNote);
    if (isPad) params.push('cutoff', 75, 'res', 0.1);

    playNote(selectedSynth, params, durationMs);
  }, [selectedSynth, explorerNote, explorerDuration, addLog, playNote]);

  return (
    <>
      <main>
        <div className="masthead">
          <h1>Test Lab</h1>
          <p>SuperSonic · synth isolation tests</p>
        </div>

        {/* Boot */}
        <div className="panel">
          <div className="panel-section">
            <div className="section-label">Engine</div>
            <div className="layers" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                className={`layer${booted ? ' on' : ''}`}
                onClick={boot}
                disabled={booting || booted}
              >
                <span>{booting ? 'Booting...' : booted ? 'Booted' : 'Boot Engine'}</span>
                <span className="layer-name">
                  {booted ? 'ready' : 'init + load defs'}
                </span>
              </button>
              <button className="layer" onClick={freeAll} disabled={!booted}>
                <span>Free All</span>
                <span className="layer-name">stop all sound</span>
              </button>
            </div>
          </div>

          {/* Individual synth tests */}
          <div className="panel-section">
            <div className="section-label">Single Synth Tests</div>
            <div className="layers" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <button className="layer" onClick={testBeep} disabled={!booted}>
                <span>Beep</span>
                <span className="layer-name">C4 sine</span>
              </button>
              <button className="layer" onClick={testSaw} disabled={!booted}>
                <span>Saw</span>
                <span className="layer-name">C4 saw</span>
              </button>
              <button className="layer" onClick={testBell} disabled={!booted}>
                <span>Bell</span>
                <span className="layer-name">C5 bell</span>
              </button>
              <button className="layer" onClick={testPluck} disabled={!booted}>
                <span>Pluck</span>
                <span className="layer-name">C4 pluck</span>
              </button>
            </div>
          </div>

          {/* Ambient synth tests */}
          <div className="panel-section">
            <div className="section-label">Ambient Synth Tests</div>
            <div className="layers" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <button className="layer" onClick={testPad} disabled={!booted}>
                <span>Pad</span>
                <span className="layer-name">dark_ambience</span>
              </button>
              <button className="layer" onClick={testHollow} disabled={!booted}>
                <span>Hollow</span>
                <span className="layer-name">texture</span>
              </button>
              <button className="layer" onClick={testBlade} disabled={!booted}>
                <span>Blade</span>
                <span className="layer-name">melody</span>
              </button>
              <button className="layer" onClick={testNoise} disabled={!booted}>
                <span>Noise</span>
                <span className="layer-name">bnoise</span>
              </button>
            </div>
          </div>

          {/* Synth Explorer */}
          <div className="panel-section">
            <div className="section-label">Synth Explorer</div>
            <div className="explorer">
              <div className="explorer-row">
                <div className="selector-group" style={{ flex: 1 }}>
                  <label>SynthDef</label>
                  <select
                    value={selectedSynth}
                    onChange={(e) => setSelectedSynth(e.target.value)}
                    disabled={!booted}
                  >
                    {Object.entries(ALL_SYNTHS).map(([group, synths]) => (
                      <optgroup key={group} label={group}>
                        {synths.map((s) => (
                          <option key={s} value={s}>
                            {s.replace('sonic-pi-', '')}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <div className="explorer-row">
                <div className="selector-group">
                  <label>Note</label>
                  <select
                    value={explorerNote}
                    onChange={(e) => setExplorerNote(Number(e.target.value))}
                    disabled={!booted}
                  >
                    {MIDI_NOTES.map((n) => (
                      <option key={n.value} value={n.value}>{n.label}</option>
                    ))}
                  </select>
                </div>
                <div className="selector-group">
                  <label>Duration</label>
                  <select
                    value={explorerDuration}
                    onChange={(e) => setExplorerDuration(Number(e.target.value))}
                    disabled={!booted}
                  >
                    <option value={1}>1s</option>
                    <option value={2}>2s</option>
                    <option value={3}>3s</option>
                    <option value={5}>5s</option>
                    <option value={8}>8s</option>
                  </select>
                </div>
              </div>
              <button
                className="explorer-play"
                onClick={playExplorer}
                disabled={!booted || explorerLoading}
              >
                {explorerLoading ? 'Loading...' : 'Play'}
              </button>
            </div>
          </div>

          {/* Combo tests */}
          <div className="panel-section">
            <div className="section-label">Combo Tests</div>
            <div className="layers" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="layer" onClick={testMelodySequence} disabled={!booted}>
                <span>Melody Sequence</span>
                <span className="layer-name">10 beep notes · C min penta</span>
              </button>
              <button className="layer" onClick={testPadChord} disabled={!booted}>
                <span>Pad Chord</span>
                <span className="layer-name">3-voice dark_ambience</span>
              </button>
            </div>
          </div>

          {/* Diagnostics */}
          {diag && (
            <div className="panel-section">
              <div className="section-label">Live Diagnostics</div>
              <div className="debug-grid">
                <div className="debug-section">
                  <div className="debug-section-title">AudioContext</div>
                  <div className="debug-row">
                    <span>State</span>
                    <span className={diag.ctxState === 'running' ? 'debug-val-ok' : 'debug-val-warn'}>
                      {diag.ctxState}
                    </span>
                  </div>
                  <div className="debug-row"><span>Mode</span><span>{diag.mode}</span></div>
                  <div className="debug-row"><span>Sample Rate</span><span>{diag.ctxSampleRate} Hz</span></div>
                  <div className="debug-row"><span>Current Time</span><span>{diag.ctxTime}s</span></div>
                  <div className="debug-row">
                    <span>Base Latency</span>
                    <span>{diag.ctxBaseLatency != null ? `${(diag.ctxBaseLatency * 1000).toFixed(1)} ms` : 'n/a'}</span>
                  </div>
                  <div className="debug-row">
                    <span>Output Latency</span>
                    <span>{diag.ctxOutputLatency != null ? `${(diag.ctxOutputLatency * 1000).toFixed(1)} ms` : 'n/a'}</span>
                  </div>
                  <div className="debug-row">
                    <span>Dest Channels</span>
                    <span>{diag.destChannels} / max {diag.destMax}</span>
                  </div>
                  <div className="debug-row">
                    <span>SharedArrayBuffer</span>
                    <span className={diag.sab ? 'debug-val-ok' : 'debug-val-warn'}>{diag.sab ? 'yes' : 'no'}</span>
                  </div>
                  <div className="debug-row">
                    <span>Cross-Origin Isolated</span>
                    <span className={diag.coi ? 'debug-val-ok' : 'debug-val-warn'}>{diag.coi ? 'yes' : 'no'}</span>
                  </div>
                </div>
                <div className="debug-section">
                  <div className="debug-section-title">Metrics</div>
                  <div className="debug-row"><span>Process Count</span><span>{diag.processCount}</span></div>
                  <div className="debug-row"><span>OSC Sent</span><span>{diag.msgsSent}</span></div>
                  <div className="debug-row"><span>Processed</span><span>{diag.msgsProcessed}</span></div>
                  <div className="debug-row">
                    <span>Dropped</span>
                    <span className={diag.msgsDropped > 0 ? 'debug-val-err' : 'debug-val-ok'}>{diag.msgsDropped}</span>
                  </div>
                  <div className="debug-row">
                    <span>WASM Errors</span>
                    <span className={diag.wasmErrors > 0 ? 'debug-val-err' : 'debug-val-ok'}>{diag.wasmErrors}</span>
                  </div>
                  <div className="debug-row"><span>Loaded SynthDefs</span><span>{diag.loadedDefs}</span></div>
                  <div className="debug-row"><span>Node Count</span><span>{diag.nodeCount}</span></div>
                  <div className="debug-row"><span>Boot Time</span><span>{diag.bootTime?.toFixed(0)} ms</span></div>
                  <div className="debug-row"><span>scsynth Version</span><span>{diag.version}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Log */}
          <div className="panel-section">
            <div className="section-label">Log</div>
            <div className="test-log">
              {log.map((line, i) => (
                <div key={i} className="test-log-line">{line}</div>
              ))}
              {log.length === 0 && <div className="test-log-line">Click "Boot Engine" to start</div>}
            </div>
          </div>
        </div>
      </main>

      <footer>
        <a href="/">← Back to Ambient</a>
        {' · '}
        Test Lab — isolated synth debugging
      </footer>
    </>
  );
}
