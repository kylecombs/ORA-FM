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

      <footer>
        Powered by{' '}
        <a
          href="https://sonic-pi.net/supersonic/demo.html"
          target="_blank"
          rel="noreferrer"
        >
          SuperSonic
        </a>{' '}
        — scsynth WebAssembly by Sam Aaron
        <br />
        1/f noise control · pentatonic minor · Bernardi silence rebound · 0.1 Hz phrase cycle
      </footer>
    </>
  );
}
