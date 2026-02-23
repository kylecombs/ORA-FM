// ════════════════════════════════════════════════════════════
//  GRID VIEW ENGINE
//
//  Minimal modular-synthesis audio engine for the Grid View
//  synth/effect graph. Each grid module maps to a scsynth
//  synth instance. Modules connected (reachable) to AudioOut
//  play; disconnected modules are silent.
//
//  Source synths live in Group 1 (processed first).
//  FX synths live in Group 2 (processed after sources).
//  Audio buses 16+ are used for routing between nodes.
//
//  Uses SuperSonic (scsynth WebAssembly) for all audio.
// ════════════════════════════════════════════════════════════

import { SuperSonic } from 'supersonic-scsynth';

const SOURCE_DEFS = [
  'sine',
  'sonic-pi-beep',
  'sonic-pi-saw',
  'sonic-pi-pretty_bell',
  'sonic-pi-pluck',
  'sonic-pi-dark_ambience',
  'sonic-pi-hollow',
  'sonic-pi-blade',
  'sonic-pi-bnoise',
];

const FX_DEFS = [
  'sonic-pi-fx_reverb',
  'sonic-pi-fx_echo',
  'sonic-pi-fx_lpf',
  'sonic-pi-fx_hpf',
  'sonic-pi-fx_distortion',
  'sonic-pi-fx_flanger',
];

export class GridEngine {
  constructor() {
    this.sonic = null;
    this._nextId = 3000;
    this._active = new Map(); // graphNodeId → scsynth nodeId
    this.booted = false;
    this.onStatus = null;

    // Control bus allocator (buses 0–4095 available, separate from audio buses)
    this._nextControlBus = 0;
    this._controlBuses = new Map(); // allocationKey → busIndex
  }

  async boot() {
    this.onStatus?.('Booting SuperSonic WebAssembly…');

    this.sonic = new SuperSonic({
      wasmBaseURL: '/supersonic/wasm/',
      workerBaseURL: '/supersonic/workers/',
      sampleBaseURL: '/supersonic/samples/',
      synthdefBaseURL: '/supersonic/synthdefs/',
      debug: true,
      debugScsynth: true,
      debugOscIn: true,
      debugOscOut: true,
    });

    this.sonic.on('error', (e) => console.error('[GridEngine error]', e));
    this.sonic.on('audiocontext:statechange', (e) =>
      console.log('[GridEngine ctx]', e.state)
    );

    await this.sonic.init();
    await this.sonic.resume();

    // Group 1: source synths (processed first)
    this.sonic.send('/g_new', 1, 0, 0);
    // Group 2: FX synths (processed after sources)
    this.sonic.send('/g_new', 2, 3, 1);

    const allDefs = [...SOURCE_DEFS, ...FX_DEFS];
    for (const def of allDefs) {
      this.onStatus?.(`Loading ${def.replace('sonic-pi-', '')}…`);
      await this.sonic.loadSynthDef(def);
    }

    this.booted = true;
    this.onStatus?.('Ready · add modules and connect to Output');
  }

  // Start a source synth (group 1)
  play(graphId, synthDef, params) {
    if (!this.booted || !synthDef) return;
    if (this._active.has(graphId)) return; // already playing

    const id = this._nextId++;
    this._active.set(graphId, id);

    const flat = [];
    for (const [k, v] of Object.entries(params)) {
      flat.push(k, v);
    }

    // addAction 0 = addToHead, target = group 1
    this.sonic.send('/s_new', synthDef, id, 0, 1, ...flat);
  }

  // Start an FX synth (group 2, added to tail for correct chain ordering)
  playFx(graphId, synthDef, params) {
    if (!this.booted || !synthDef) return;
    if (this._active.has(graphId)) return;

    const id = this._nextId++;
    this._active.set(graphId, id);

    const flat = [];
    for (const [k, v] of Object.entries(params)) {
      flat.push(k, v);
    }

    // addAction 1 = addToTail of group 2
    this.sonic.send('/s_new', synthDef, id, 1, 2, ...flat);
  }

  // Reorder FX nodes in group 2 to match the desired chain order.
  // fxGraphIds should be in processing order (closest to source first).
  reorderFx(fxGraphIds) {
    if (fxGraphIds.length < 2) return;

    for (let i = 1; i < fxGraphIds.length; i++) {
      const thisId = this._active.get(fxGraphIds[i]);
      const prevId = this._active.get(fxGraphIds[i - 1]);
      if (thisId != null && prevId != null) {
        this.sonic.send('/n_after', thisId, prevId);
      }
    }
  }

  // Stop a graph node's synth
  stop(graphId) {
    const id = this._active.get(graphId);
    if (id == null) return;

    try {
      this.sonic.send('/n_set', id, 'amp', 0.001);
    } catch { /* ignore */ }

    const capturedId = id;
    const sonic = this.sonic;
    setTimeout(() => {
      try { sonic.send('/n_free', capturedId); } catch { /* ignore */ }
    }, 400);

    this._active.delete(graphId);
  }

  // Update a single parameter on a running synth
  setParam(graphId, param, value) {
    const id = this._active.get(graphId);
    if (id != null) {
      try { this.sonic.send('/n_set', id, param, value); } catch { /* ignore */ }
    }
  }

  // ── Control bus methods ──────────────────────────────────

  // Allocate a control bus for a given key (idempotent — returns same bus if key exists)
  allocControlBus(key) {
    if (this._controlBuses.has(key)) return this._controlBuses.get(key);
    const bus = this._nextControlBus++;
    this._controlBuses.set(key, bus);
    return bus;
  }

  // Free a control bus allocation
  freeControlBus(key) {
    this._controlBuses.delete(key);
  }

  // Set the value of a control bus (/c_set)
  setControlBus(busIndex, value) {
    if (!this.booted) return;
    try { this.sonic.send('/c_set', busIndex, value); } catch { /* ignore */ }
  }

  // Map a synth parameter to read from a control bus (/n_map)
  mapParam(graphId, param, busIndex) {
    const id = this._active.get(graphId);
    if (id != null) {
      try { this.sonic.send('/n_map', id, param, busIndex); } catch { /* ignore */ }
    }
  }

  // Unmap a parameter from its control bus and restore a fixed value
  unmapParam(graphId, param, value) {
    const id = this._active.get(graphId);
    if (id != null) {
      try {
        this.sonic.send('/n_map', id, param, -1);  // -1 = unmap
        this.sonic.send('/n_set', id, param, value);
      } catch { /* ignore */ }
    }
  }

  // Map a synth parameter to read from an audio bus (/n_mapa)
  // Used for audio-rate modulation (e.g. FM synthesis)
  mapAudioParam(graphId, param, audioBusIndex) {
    const id = this._active.get(graphId);
    if (id != null) {
      try { this.sonic.send('/n_mapa', id, param, audioBusIndex); } catch { /* ignore */ }
    }
  }

  // Unmap an audio-rate parameter and restore a fixed value
  unmapAudioParam(graphId, param, value) {
    const id = this._active.get(graphId);
    if (id != null) {
      try {
        this.sonic.send('/n_mapa', id, param, -1);  // -1 = unmap
        this.sonic.send('/n_set', id, param, value);
      } catch { /* ignore */ }
    }
  }

  isPlaying(graphId) {
    return this._active.has(graphId);
  }

  stopAll() {
    for (const graphId of [...this._active.keys()]) {
      this.stop(graphId);
    }
  }
}
