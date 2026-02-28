import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AmbientEngine } from './audio/engine';
import './App.css';

export default function App() {
  const engineRef = useRef(null);

  // ── State ──────────────────────────────────────────────
  const [orbState, setOrbState] = useState('idle'); // idle | loading | playing
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState(
    'Use headphones for binaural effect · tap orb to begin'
  );
  const [statusActive, setStatusActive] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [layers, setLayers] = useState({
    pad: false,
    texture: false,
    melody: false,
    binaural: false,
    noise: false,
    silence: false,
  });
  const [arcPercent, setArcPercent] = useState(0);
  const [arcElapsed, setArcElapsed] = useState('0:00');
  const [arcActive, setArcActive] = useState(false);
  const [barHeights, setBarHeights] = useState(
    () => Array.from({ length: 16 }, () => 10 + Math.random() * 30)
  );
  const [waveActive, setWaveActive] = useState(false);
  const [root, setRoot] = useState(57);
  const [beat, setBeat] = useState(6);
  const [beatLabel, setBeatLabel] = useState('6 Hz theta');
  const [debugInfo, setDebugInfo] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const debugTimerRef = useRef(null);

  // Refs for current values (needed by engine callbacks)
  const rootRef = useRef(root);
  const beatRef = useRef(beat);
  rootRef.current = root;
  beatRef.current = beat;

  const getRoot = useCallback(() => rootRef.current, []);
  const getBeat = useCallback(() => beatRef.current, []);

  // ── Engine setup ───────────────────────────────────────
  useEffect(() => {
    const engine = new AmbientEngine();
    engineRef.current = engine;

    engine.onStatusChange = (msg, active, error) => {
      setStatusText(msg);
      setStatusActive(active);
      setStatusError(!!error);
    };
    engine.onOrbStateChange = (state) => setOrbState(state);
    engine.onLayerChange = (layer, on) => {
      setLayers((prev) => ({ ...prev, [layer]: on }));
    };
    engine.onArcUpdate = (percent, elapsed) => {
      setArcPercent(percent);
      setArcElapsed(elapsed);
    };
    engine.onWaveUpdate = (heights) => setBarHeights(heights);
    engine.onDebugUpdate = (info) => setDebugInfo(info);
    engine.onRunningChange = (isRunning) => {
      setRunning(isRunning);
      if (isRunning) {
        setWaveActive(true);
        setArcActive(true);
      }
    };

    return () => {
      if (engine.running) engine.stopAll();
    };
  }, []);

  // ── Debug polling ──────────────────────────────────────
  useEffect(() => {
    if (debugOpen) {
      const poll = () => {
        const engine = engineRef.current;
        if (engine) setDebugInfo(engine.getDiagnostics());
      };
      poll();
      debugTimerRef.current = setInterval(poll, 1000);
    } else {
      clearInterval(debugTimerRef.current);
    }
    return () => clearInterval(debugTimerRef.current);
  }, [debugOpen]);

  const handleRefreshDebug = useCallback(() => {
    const engine = engineRef.current;
    if (engine) setDebugInfo(engine.getDiagnostics());
  }, []);

  // ── Handlers ───────────────────────────────────────────
  const handleOrbClick = useCallback(() => {
    if (orbState === 'loading') return;
    const engine = engineRef.current;

    if (running) {
      engine.stopAll();
      setOrbState('idle');
      setStatusText('Fading out…');
      setStatusActive(false);
      setWaveActive(false);
      setArcActive(false);
      setArcPercent(0);
      setArcElapsed('0:00');
      setLayers({
        pad: false,
        texture: false,
        melody: false,
        binaural: false,
        noise: false,
        silence: false,
      });
      setTimeout(() => {
        setStatusText('Use headphones for binaural effect · tap orb to begin');
      }, 1500);
    } else {
      engine.bootAndStart(getRoot, getBeat);
    }
  }, [orbState, running, getRoot, getBeat]);

  const handleLayerToggle = useCallback(
    (layer) => {
      const engine = engineRef.current;
      if (!engine || !running) return;
      const isOn = layers[layer];

      switch (layer) {
        case 'pad':
          engine.togglePad(isOn, rootRef.current);
          break;
        case 'texture':
          engine.toggleTexture(isOn, rootRef.current);
          break;
        case 'melody':
          engine.toggleMelody(isOn, getRoot);
          break;
        case 'binaural':
          engine.toggleBinaural(isOn, beatRef.current);
          break;
        case 'noise':
          engine.toggleNoise(isOn);
          break;
      }
    },
    [running, layers, getRoot]
  );

  const handleRootChange = useCallback(
    (e) => {
      const newRoot = parseInt(e.target.value);
      setRoot(newRoot);
      if (running && engineRef.current) {
        engineRef.current.changeRoot(newRoot);
      }
    },
    [running]
  );

  const handleBeatChange = useCallback(
    (e) => {
      const newBeat = parseFloat(e.target.value);
      setBeat(newBeat);
      setBeatLabel(`${newBeat} Hz theta`);
      if (running && engineRef.current) {
        engineRef.current.updateBinaural(newBeat);
      }
    },
    [running]
  );

  // ── Derived classes ────────────────────────────────────
  const orbClass = useMemo(() => {
    let cls = 'orb-ring';
    if (orbState === 'playing') cls += ' playing';
    if (orbState === 'loading') cls += ' loading';
    return cls;
  }, [orbState]);

  const orbLabel = orbState === 'playing' ? 'Pause' : orbState === 'loading' ? '···' : 'Begin';
  const orbSub =
    orbState === 'playing' ? 'tap to stop' : orbState === 'loading' ? 'loading' : 'tap to start';

  const statusDotClass = useMemo(() => {
    let cls = 'status-dot';
    if (statusActive) cls += ' on';
    else if (statusError) cls += ' err';
    return cls;
  }, [statusActive, statusError]);

  // ── Render ─────────────────────────────────────────────
  return (
    <>
      <main>
        {/* Masthead */}
        <div className="masthead">
          <h1>Ambient</h1>
          <p>SuperSonic · psychoacoustic design · v2</p>
        </div>

        {/* Orb (main start/stop control) */}
        <div
          className={orbClass}
          onClick={handleOrbClick}
          title="Click to start / stop"
        >
          <div className="orb-outer">
            <div className="orb-inner">
              <span className="orb-label">{orbLabel}</span>
              <span className="orb-sub">{orbSub}</span>
            </div>
          </div>
        </div>

        {/* 1/f Waveform visualizer */}
        <div
          className={`wave-display${waveActive ? ' active' : ''}`}
          aria-hidden="true"
        >
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        {/* Main panel */}
        <div className="panel">
          {/* Layers */}
          <div className="panel-section">
            <div className="section-label">Layers</div>
            <div className="layers">
              <button
                className={`layer${layers.pad ? ' on' : ''}`}
                disabled={!running}
                onClick={() => handleLayerToggle('pad')}
              >
                <span>Pad</span>
                <span className="layer-name">dark ambience</span>
              </button>
              <button
                className={`layer${layers.texture ? ' on' : ''}`}
                disabled={!running}
                onClick={() => handleLayerToggle('texture')}
              >
                <span>Texture</span>
                <span className="layer-name">hollow</span>
              </button>
              <button
                className={`layer${layers.melody ? ' on' : ''}`}
                disabled={!running}
                onClick={() => handleLayerToggle('melody')}
              >
                <span>Melody</span>
                <span className="layer-name">blade · browian</span>
              </button>
              <button
                className={`layer${layers.binaural ? ' on' : ''}`}
                disabled={!running}
                onClick={() => handleLayerToggle('binaural')}
              >
                <span>Binaural</span>
                <span className="layer-name">{beatLabel}</span>
              </button>
              <button
                className={`layer${layers.noise ? ' on' : ''}`}
                disabled={!running}
                onClick={() => handleLayerToggle('noise')}
              >
                <span>Noise</span>
                <span className="layer-name">brown · 1/f²</span>
              </button>
              <button
                className={`layer${layers.silence ? ' on' : ''}`}
                disabled={!running}
                style={{ cursor: 'default' }}
              >
                <span>Silence</span>
                <span className="layer-name">rebound pause</span>
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="panel-section">
            <div className="section-label">Parameters</div>
            <div className="selectors">
              <div className="selector-group">
                <label>Root</label>
                <select value={root} onChange={handleRootChange}>
                  <option value="57">A3 · 220 Hz</option>
                  <option value="48">C3 · 131 Hz</option>
                  <option value="53">F3 · 175 Hz</option>
                  <option value="62">D4 · 294 Hz</option>
                </select>
              </div>
              <div className="selector-group">
                <label>Beat · Hz</label>
                <select value={beat} onChange={handleBeatChange}>
                  <option value="6">6 Hz · deep θ</option>
                  <option value="10">10 Hz · α calm</option>
                  <option value="4">4 Hz · δ sleep</option>
                </select>
              </div>
            </div>
          </div>

          {/* Session arc */}
          <div className="panel-section">
            <div className="section-label">Session Arc · 25 min</div>
            <div className="arc-row">
              <span className="arc-time">{arcElapsed}</span>
              <div className="arc-track">
                <div
                  className={`arc-fill${arcActive ? ' active' : ''}`}
                  style={{ width: `${arcPercent}%` }}
                />
              </div>
              <span className="arc-time" style={{ textAlign: 'right' }}>
                25:00
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="status-bar">
            <div className={statusDotClass} />
            <span className="status-text">{statusText}</span>
          </div>
        </div>
      </main>

      {/* Debug panel */}
      <div className="debug-toggle" onClick={() => setDebugOpen((v) => !v)}>
        {debugOpen ? '▾ Hide Debug' : '▸ Show Debug'}
      </div>
      {debugOpen && (
        <div className="debug-panel">
          <div className="debug-header">
            <span className="section-label" style={{ marginBottom: 0 }}>
              Audio Diagnostics
            </span>
            <button className="debug-refresh" onClick={handleRefreshDebug}>
              Refresh
            </button>
          </div>
          {debugInfo ? (
            <div className="debug-grid">
              <div className="debug-section">
                <div className="debug-section-title">AudioContext</div>
                {debugInfo.audioContext ? (
                  <>
                    <div className="debug-row">
                      <span>State</span>
                      <span
                        className={
                          debugInfo.audioContext.state === 'running'
                            ? 'debug-val-ok'
                            : 'debug-val-warn'
                        }
                      >
                        {debugInfo.audioContext.state}
                      </span>
                    </div>
                    <div className="debug-row">
                      <span>Sample Rate</span>
                      <span>{debugInfo.audioContext.sampleRate} Hz</span>
                    </div>
                    <div className="debug-row">
                      <span>Base Latency</span>
                      <span>
                        {debugInfo.audioContext.baseLatency != null
                          ? `${(debugInfo.audioContext.baseLatency * 1000).toFixed(1)} ms`
                          : 'n/a'}
                      </span>
                    </div>
                    <div className="debug-row">
                      <span>Output Latency</span>
                      <span>
                        {debugInfo.audioContext.outputLatency != null
                          ? `${(debugInfo.audioContext.outputLatency * 1000).toFixed(1)} ms`
                          : 'n/a'}
                      </span>
                    </div>
                    <div className="debug-row">
                      <span>Current Time</span>
                      <span>{debugInfo.audioContext.currentTime?.toFixed(2)}s</span>
                    </div>
                    <div className="debug-row">
                      <span>Dest Channels</span>
                      <span>
                        {debugInfo.audioContext.destination.channelCount} / max{' '}
                        {debugInfo.audioContext.destination.maxChannelCount}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="debug-row">
                    <span>Not initialized</span>
                  </div>
                )}
              </div>

              {debugInfo.info && (
                <div className="debug-section">
                  <div className="debug-section-title">Engine Info</div>
                  <div className="debug-row">
                    <span>WASM Memory</span>
                    <span>{(debugInfo.info.totalMemory / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="debug-row">
                    <span>Boot Time</span>
                    <span>
                      {debugInfo.info.bootTimeMs != null
                        ? `${debugInfo.info.bootTimeMs.toFixed(0)} ms`
                        : 'n/a'}
                    </span>
                  </div>
                  {debugInfo.info.capabilities && (
                    <>
                      <div className="debug-row">
                        <span>AudioWorklet</span>
                        <span
                          className={
                            debugInfo.info.capabilities.audioWorklet
                              ? 'debug-val-ok'
                              : 'debug-val-err'
                          }
                        >
                          {debugInfo.info.capabilities.audioWorklet ? 'yes' : 'NO'}
                        </span>
                      </div>
                      <div className="debug-row">
                        <span>SharedArrayBuffer</span>
                        <span
                          className={
                            debugInfo.info.capabilities.sharedArrayBuffer
                              ? 'debug-val-ok'
                              : 'debug-val-err'
                          }
                        >
                          {debugInfo.info.capabilities.sharedArrayBuffer ? 'yes' : 'NO'}
                        </span>
                      </div>
                      <div className="debug-row">
                        <span>Cross-Origin Isolated</span>
                        <span
                          className={
                            debugInfo.info.capabilities.crossOriginIsolated
                              ? 'debug-val-ok'
                              : 'debug-val-warn'
                          }
                        >
                          {debugInfo.info.capabilities.crossOriginIsolated ? 'yes' : 'no'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {debugInfo.metrics && (
                <div className="debug-section">
                  <div className="debug-section-title">Metrics</div>
                  <div className="debug-row">
                    <span>Process Count</span>
                    <span>{debugInfo.metrics.scsynthProcessCount}</span>
                  </div>
                  <div className="debug-row">
                    <span>OSC Msgs Sent</span>
                    <span>{debugInfo.metrics.oscOutMessagesSent}</span>
                  </div>
                  <div className="debug-row">
                    <span>Msgs Processed</span>
                    <span>{debugInfo.metrics.scsynthMessagesProcessed}</span>
                  </div>
                  <div className="debug-row">
                    <span>Msgs Dropped</span>
                    <span
                      className={
                        debugInfo.metrics.scsynthMessagesDropped > 0
                          ? 'debug-val-err'
                          : 'debug-val-ok'
                      }
                    >
                      {debugInfo.metrics.scsynthMessagesDropped}
                    </span>
                  </div>
                  <div className="debug-row">
                    <span>WASM Errors</span>
                    <span
                      className={
                        debugInfo.metrics.scsynthWasmErrors > 0
                          ? 'debug-val-err'
                          : 'debug-val-ok'
                      }
                    >
                      {debugInfo.metrics.scsynthWasmErrors}
                    </span>
                  </div>
                  <div className="debug-row">
                    <span>Loaded SynthDefs</span>
                    <span>{debugInfo.metrics.loadedSynthDefs}</span>
                  </div>
                </div>
              )}

              <div className="debug-section">
                <div className="debug-section-title">Active Nodes</div>
                {debugInfo.activeNodes?.length > 0 ? (
                  debugInfo.activeNodes.map((n) => (
                    <div className="debug-row" key={n}>
                      <span>{n}</span>
                    </div>
                  ))
                ) : (
                  <div className="debug-row">
                    <span>none</span>
                  </div>
                )}
                {debugInfo.nodeTree && (
                  <div className="debug-row">
                    <span>scsynth node count</span>
                    <span>{debugInfo.nodeTree.nodeCount}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="debug-row">
              <span>Engine not initialized — click the orb to boot</span>
            </div>
          )}
        </div>
      )}

      <footer>
        <a href="/">Grid View</a>
        {' · '}
        <a href="/test">Test Lab</a>
        <br />
        Powered by{' '}
        <a
          href="https://sonic-pi.net/supersonic/demo.html"
          target="_blank"
          rel="noreferrer"
        >
          SuperSonic
        </a>{' '}
        — scsynth WebAssembly by Sam Aaron
      </footer>
    </>
  );
}
