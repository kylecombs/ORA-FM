// ════════════════════════════════════════════════════════════
//  AMBIENT MEDITATION — SuperSonic WebAssembly Edition
//
//  Architecture: scsynth runs in the browser via WebAssembly.
//  JavaScript acts as the "language layer" — computing all 1/f
//  control values, Brownian pitch walks, and scheduling logic,
//  then driving scsynth via OSC messages.
//
//  Layers:
//    · Pad      — sonic-pi-dark_ambience, 3-voice JI chord
//    · Texture  — sonic-pi-hollow, 1/f amp + pan drift
//    · Melody   — sonic-pi-blade, Brownian pentatonic walk
//    · Binaural — sonic-pi-beep, 6 Hz theta on 250 Hz carrier
//    · Noise    — sonic-pi-bnoise, pink-noise floor
//    · Silence  — Bernardi parasympathetic rebound pauses
//
//  Science applied:
//    · 1/f control signal (Voss & Clarke 1978)
//    · ~10 s inter-onset times (Bernardi 2009)
//    · Brownian pitch walk (short-range 1/f correlation)
//    · Strategic silences every 30–90 s (Bernardi 2006)
//    · 25-min session arc: tempo/timbre/density deceleration
//    · Just-intonation voicing (root + P5 + octave)
//    · Minor pentatonic — no semitone tension (Costa 2024)
// ════════════════════════════════════════════════════════════

import { SuperSonic } from 'supersonic-scsynth';

// ── Constants ──────────────────────────────────────────────
const SESSION_MS = 25 * 60 * 1000; // 25 minutes
const PENTA = [0, 3, 5, 7, 10]; // minor pentatonic semitone offsets

// ── Utility ────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rrand = (lo, hi) => lo + Math.random() * (hi - lo);
const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

// Box-Muller Gaussian random
function gaussRand(mean, std) {
  const u = Math.max(1e-10, Math.random());
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ══════════════════════════════════════════════════════════
//  1/f NOISE ENGINE
//  Sums N noise sources at geometrically spaced update rates.
//  Rate doubling at each octave → power spectrum ∝ 1/f (β≈1).
//  This is Voss & Clarke's dice algorithm, implemented in JS.
// ══════════════════════════════════════════════════════════
class OneFNoise {
  constructor(rates = [0.01, 0.02, 0.04, 0.08, 0.16]) {
    this.sources = rates.map((rate) => ({
      rate,
      cur: rrand(-1, 1),
      target: rrand(-1, 1),
      lastMs: performance.now(),
    }));
  }

  // Advance internal state; returns raw sum in ~(-N/2 … N/2)
  _advance() {
    const now = performance.now();
    this.sources.forEach((s) => {
      const period = 1000 / s.rate;
      if (now - s.lastMs >= period) {
        s.cur = s.target;
        s.target = rrand(-1, 1);
        s.lastMs = now;
      } else {
        // Smooth interpolation — avoids stepped modulation
        const t = (now - s.lastMs) / period;
        s.cur += (s.target - s.cur) * Math.min(t * 0.08, 0.08);
      }
    });
    return this.sources.reduce((acc, s) => acc + s.cur, 0);
  }

  // Scaled output in [lo, hi]
  get(lo, hi) {
    const raw = this._advance(); // roughly (-N/2)…(N/2)
    const norm = raw / this.sources.length; // normalise → (-0.5)…(0.5)
    return lo + (norm + 0.5) * (hi - lo);
  }
}

// ══════════════════════════════════════════════════════════
//  BROWNIAN PITCH WALK
//  Short-range 1/f correlation: each step limited to ±maxStep.
//  Produces naturally "wandering" melodic contours.
// ══════════════════════════════════════════════════════════
class BrownWalk {
  constructor(min, max, maxStep) {
    this.val = Math.floor((min + max) / 2);
    this.min = min;
    this.max = max;
    this.maxStep = maxStep;
  }
  next() {
    this.val += Math.round(rrand(-this.maxStep, this.maxStep));
    this.val = clamp(this.val, this.min, this.max);
    return this.val;
  }
}

// ══════════════════════════════════════════════════════════
//  AUDIO ENGINE CLASS
//  Encapsulates all audio state and provides methods for
//  React to call. Communicates state changes via callbacks.
// ══════════════════════════════════════════════════════════
export class AmbientEngine {
  constructor() {
    this.sonic = null;
    this.nodeId = 1000;
    this.running = false;
    this.sessionStart = null;
    this.nodes = new Map(); // label → scsynth nodeId
    this.timers = new Set(); // all active timer IDs
    this.melodyActive = false;

    // Callbacks (set by React)
    this.onStatusChange = null;
    this.onOrbStateChange = null;
    this.onLayerChange = null;
    this.onArcUpdate = null;
    this.onWaveUpdate = null;
    this.onRunningChange = null;

    // 1/f generators for visualiser bars
    this._vizNoises = Array.from(
      { length: 16 },
      (_, i) => new OneFNoise([0.04 + i * 0.02, 0.08 + i * 0.03, 0.18 + i * 0.04])
    );
  }

  // ── OSC shorthand ──────────────────────────────────────
  _osc(...args) {
    if (this.sonic && this.running) this.sonic.send(...args);
  }

  _sNew(synthName, label, ...params) {
    const id = this.nodeId++;
    if (label) this.nodes.set(label, id);
    this.sonic.send('/s_new', synthName, id, 0, 1, ...params);
    return id;
  }

  _nSet(label, ...params) {
    const id = this.nodes.get(label);
    if (id != null) this.sonic.send('/n_set', id, ...params);
  }

  _nFree(label) {
    const id = this.nodes.get(label);
    if (id != null) {
      try {
        this.sonic.send('/n_set', id, 'amp', 0.001);
      } catch {}
      setTimeout(() => {
        try {
          this.sonic.send('/n_free', id);
        } catch {}
      }, 500);
      this.nodes.delete(label);
    }
  }

  // ── Timer helpers ──────────────────────────────────────
  _after(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  _every(ms, fn) {
    const id = setInterval(fn, ms);
    this.timers.add(id);
    return id;
  }

  // ══════════════════════════════════════════════════════
  //  LAYER: PAD
  // ══════════════════════════════════════════════════════
  startPad(root) {
    [
      { semis: 0, amp: 0.3, pan: -0.15, cut: 72, atk: 5 },
      { semis: 7, amp: 0.22, pan: 0.15, cut: 68, atk: 7 },
      { semis: 12, amp: 0.15, pan: 0.0, cut: 64, atk: 9 },
    ].forEach((v, i) => {
      this._sNew(
        'sonic-pi-dark_ambience',
        `pad${i}`,
        'note', root + v.semis,
        'amp', v.amp,
        'pan', v.pan,
        'attack', v.atk,
        'sustain', 9999,
        'release', 10,
        'cutoff', v.cut,
        'room', 0.9,
        'reverb_damp', 0.5,
        'res', 0.05
      );
    });
    this.onLayerChange?.('pad', true);
  }

  // ══════════════════════════════════════════════════════
  //  LAYER: TEXTURE
  // ══════════════════════════════════════════════════════
  startTexture(root) {
    this._sNew(
      'sonic-pi-hollow',
      'texture',
      'note', root + 12,
      'amp', 0.12,
      'pan', 0,
      'attack', 5,
      'sustain', 9999,
      'release', 8,
      'cutoff', 80,
      'res', 0.1
    );
    this.onLayerChange?.('texture', true);
  }

  // ══════════════════════════════════════════════════════
  //  LAYER: BINAURAL BEATS
  // ══════════════════════════════════════════════════════
  startBinaural(beat) {
    const leftN = hzToMidi(250);
    const rightN = hzToMidi(250 + beat);

    this._sNew(
      'sonic-pi-beep',
      'binL',
      'note', leftN, 'amp', 0.04, 'pan', -1.0,
      'attack', 3, 'sustain', 9999, 'release', 5
    );
    this._sNew(
      'sonic-pi-beep',
      'binR',
      'note', rightN, 'amp', 0.04, 'pan', 1.0,
      'attack', 3, 'sustain', 9999, 'release', 5
    );
    this.onLayerChange?.('binaural', true);
  }

  updateBinaural(beat) {
    const rightN = hzToMidi(250 + beat);
    this._nSet('binR', 'note', rightN);
  }

  // ══════════════════════════════════════════════════════
  //  LAYER: NOISE
  // ══════════════════════════════════════════════════════
  startNoise() {
    this._sNew(
      'sonic-pi-bnoise',
      'noise',
      'amp', 0.04,
      'pan', 0,
      'attack', 4,
      'sustain', 9999,
      'release', 6,
      'cutoff', 95,
      'res', 0.05
    );
    this.onLayerChange?.('noise', true);
  }

  // ══════════════════════════════════════════════════════
  //  LAYER: MELODY
  // ══════════════════════════════════════════════════════
  scheduleMelody(getRoot) {
    const walk = new BrownWalk(0, 4, 2);
    this.melodyActive = true;

    const fireNote = () => {
      if (!this.running || !this.melodyActive) return;

      const degree = walk.next();
      const semitone = PENTA[degree];
      const octave = Math.random() < 0.65 ? 0 : Math.random() < 0.8 ? 12 : 24;
      const note = getRoot() + semitone + octave;
      const sustain = rrand(4, 9);
      const amp = rrand(0.07, 0.15);
      const pan = clamp(gaussRand(0, 0.3), -0.8, 0.8);

      this.sonic.send(
        '/s_new',
        'sonic-pi-blade',
        this.nodeId++,
        0,
        1,
        'note', note,
        'amp', amp,
        'pan', pan,
        'attack', 1.5,
        'sustain', sustain,
        'release', sustain * 0.9,
        'cutoff', clamp(65 + Math.random() * 20, 50, 90),
        'res', 0.08,
        'vibrato_rate', 2 + Math.random() * 4,
        'vibrato_depth', 0.04 + Math.random() * 0.08
      );

      const nextMs = clamp(gaussRand(10, 3), 6, 20) * 1000;
      this._after(nextMs, fireNote);
    };

    this._after(3000, fireNote);
    this.onLayerChange?.('melody', true);
  }

  stopMelody() {
    this.melodyActive = false;
    this.onLayerChange?.('melody', false);
  }

  // ══════════════════════════════════════════════════════
  //  1/f MODULATION LOOP
  // ══════════════════════════════════════════════════════
  start1fModulation() {
    const filtNoise = new OneFNoise([0.02, 0.04, 0.08, 0.16, 0.32]);
    const ampNoise = new OneFNoise([0.01, 0.03, 0.06, 0.12]);
    const panNoise = new OneFNoise([0.05, 0.1, 0.2]);

    this._every(200, () => {
      if (!this.running) return;

      // Pad filter: 1/f sweep over all three voices
      const baseCut = filtNoise.get(50, 85);
      [0, 1, 2].forEach((i) => {
        const id = this.nodes.get(`pad${i}`);
        if (id) this.sonic.send('/n_set', id, 'cutoff', baseCut - i * 4);
      });

      // Texture: 1/f amp swell + stereo pan drift
      const texAmp = ampNoise.get(0.06, 0.18);
      const texPan = panNoise.get(-0.55, 0.55);
      const texId = this.nodes.get('texture');
      if (texId) this.sonic.send('/n_set', texId, 'amp', texAmp, 'pan', texPan);

      // Visualiser bars
      const barHeights = this._vizNoises.map((vn) => vn.get(4, 88));
      this.onWaveUpdate?.(barHeights);
    });
  }

  // ══════════════════════════════════════════════════════
  //  STRATEGIC SILENCE ROUTINE (Bernardi 2006)
  // ══════════════════════════════════════════════════════
  startSilenceRoutine() {
    const BASE_AMPS = [0.3, 0.22, 0.15];

    const doSilence = () => {
      if (!this.running) return;
      this.onLayerChange?.('silence', true);

      // Fade to near-silence
      [0, 1, 2].forEach((i) => {
        const id = this.nodes.get(`pad${i}`);
        if (id) this.sonic.send('/n_set', id, 'amp', 0.003);
      });
      const texId = this.nodes.get('texture');
      if (texId) this.sonic.send('/n_set', texId, 'amp', 0.003);

      // Hold silence for 2–5 s
      this._after(rrand(2000, 5000), () => {
        if (!this.running) return;
        this.onLayerChange?.('silence', false);
        // Restore
        BASE_AMPS.forEach((a, i) => {
          const id = this.nodes.get(`pad${i}`);
          if (id) this.sonic.send('/n_set', id, 'amp', a);
        });
        if (texId) this.sonic.send('/n_set', texId, 'amp', 0.12);

        // Next silence: 30–90 s later
        this._after(rrand(30000, 90000), doSilence);
      });
    };

    this._after(45000, doSilence);
  }

  // ══════════════════════════════════════════════════════
  //  SESSION ARC (25-minute gradual evolution)
  // ══════════════════════════════════════════════════════
  startSessionArc() {
    this.sessionStart = Date.now();

    this._every(5000, () => {
      if (!this.running) return;

      const ms = Date.now() - this.sessionStart;
      const t = Math.min(ms / SESSION_MS, 1.0);

      // Progress display
      const sec = Math.floor(ms / 1000);
      const elapsed = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      this.onArcUpdate?.(t * 100, elapsed);

      // Filter darkening
      const arcOffset = t * -25;
      const baseCuts = [72, 68, 64];
      baseCuts.forEach((base, i) => {
        const id = this.nodes.get(`pad${i}`);
        if (id) this.sonic.send('/n_set', id, 'cutoff', clamp(base + arcOffset, 38, 90));
      });

      // Texture amp reduction
      const texId = this.nodes.get('texture');
      if (texId) this.sonic.send('/n_set', texId, 'amp', 0.12 * (1 - t * 0.45));
    });
  }

  // ══════════════════════════════════════════════════════
  //  STOP ALL
  // ══════════════════════════════════════════════════════
  stopAll() {
    this.running = false;
    this.melodyActive = false;

    // Cancel all timers
    this.timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    this.timers.clear();

    // Fade out each node's amp to 0, then free it
    this.nodes.forEach((id) => {
      try {
        this.sonic.send('/n_set', id, 'amp', 0.001);
      } catch {}
      this._after(800, () => {
        try {
          this.sonic.send('/n_free', id);
        } catch {}
      });
    });
    this.nodes.clear();

    this.onRunningChange?.(false);
  }

  // ══════════════════════════════════════════════════════
  //  BOOT SEQUENCE
  // ══════════════════════════════════════════════════════
  async bootAndStart(getRoot, getBeat) {
    this.onStatusChange?.('Booting SuperSonic WebAssembly…', false);
    this.onOrbStateChange?.('loading');

    try {
      this.sonic = new SuperSonic({
        wasmBaseURL: '/supersonic/wasm/',
        workerBaseURL: '/supersonic/workers/',
        sampleBaseURL: '/supersonic/samples/',
        synthdefBaseURL: '/supersonic/synthdefs/',
      });
      await this.sonic.init();
      await this.sonic.resume();

      const defs = [
        'sonic-pi-dark_ambience',
        'sonic-pi-hollow',
        'sonic-pi-blade',
        'sonic-pi-beep',
        'sonic-pi-bnoise',
      ];
      for (const def of defs) {
        this.onStatusChange?.(`Loading · ${def.replace('sonic-pi-', '')}…`, false);
        await this.sonic.loadSynthDef(def);
      }

      // ── All ready — begin playback ──────────────────────
      this.running = true;
      this.onRunningChange?.(true);
      this.onStatusChange?.('Playing · 25 min arc · use headphones for binaural', true);
      this.onOrbStateChange?.('playing');

      const root = getRoot();
      const beat = getBeat();

      // Staggered layer entry — prevents percussive mass onset
      this.startPad(root);
      this.start1fModulation();
      this._after(5000, () => this.startNoise());
      this._after(8000, () => this.startTexture(root));
      this._after(12000, () => this.scheduleMelody(getRoot));
      this._after(15000, () => this.startBinaural(beat));
      this._after(40000, () => this.startSilenceRoutine());
      this.startSessionArc();
    } catch (err) {
      console.error(err);
      this.onStatusChange?.(`Error: ${err.message}`, false, true);
      this.onOrbStateChange?.('idle');
    }
  }

  // ══════════════════════════════════════════════════════
  //  LAYER TOGGLE HELPERS
  // ══════════════════════════════════════════════════════
  togglePad(isOn, root) {
    if (!this.running) return;
    if (isOn) {
      ['pad0', 'pad1', 'pad2'].forEach((l) => this._nFree(l));
      this.onLayerChange?.('pad', false);
    } else {
      this.startPad(root);
    }
  }

  toggleTexture(isOn, root) {
    if (!this.running) return;
    if (isOn) {
      this._nFree('texture');
      this.onLayerChange?.('texture', false);
    } else {
      this.startTexture(root);
    }
  }

  toggleBinaural(isOn, beat) {
    if (!this.running) return;
    if (isOn) {
      this._nFree('binL');
      this._nFree('binR');
      this.onLayerChange?.('binaural', false);
    } else {
      this.startBinaural(beat);
    }
  }

  toggleNoise(isOn) {
    if (!this.running) return;
    if (isOn) {
      this._nFree('noise');
      this.onLayerChange?.('noise', false);
    } else {
      this.startNoise();
    }
  }

  toggleMelody(isOn, getRoot) {
    if (!this.running) return;
    if (isOn) {
      this.stopMelody();
    } else {
      this.scheduleMelody(getRoot);
    }
  }

  changeRoot(root) {
    if (!this.running) return;
    ['pad0', 'pad1', 'pad2'].forEach((l) => this._nFree(l));
    this._nFree('texture');
    this._after(600, () => {
      this.startPad(root);
      this._after(2000, () => this.startTexture(root));
    });
  }
}
