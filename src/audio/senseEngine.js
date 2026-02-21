// ════════════════════════════════════════════════════════════
//  SENSE EFFECTS ENGINE
//
//  Minimal modular-synthesis audio engine for the Sense Effects
//  node graph. Each graph node maps to a scsynth synth instance.
//  Nodes that are connected (reachable) to AudioOut play;
//  disconnected nodes are silent.
//
//  Uses SuperSonic (scsynth WebAssembly) for all audio.
// ════════════════════════════════════════════════════════════

import { SuperSonic } from 'supersonic-scsynth';

const ALL_DEFS = [
  'sonic-pi-beep',
  'sonic-pi-saw',
  'sonic-pi-pretty_bell',
  'sonic-pi-pluck',
  'sonic-pi-dark_ambience',
  'sonic-pi-hollow',
  'sonic-pi-blade',
  'sonic-pi-bnoise',
];

export class SenseEngine {
  constructor() {
    this.sonic = null;
    this._nextId = 3000;
    this._active = new Map(); // graphNodeId → scsynth nodeId
    this.booted = false;
    this.onStatus = null;
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

    this.sonic.on('error', (e) => console.error('[SenseEngine error]', e));
    this.sonic.on('audiocontext:statechange', (e) =>
      console.log('[SenseEngine ctx]', e.state)
    );

    await this.sonic.init();
    await this.sonic.resume();

    // Create default group
    this.sonic.send('/g_new', 1, 0, 0);

    for (const def of ALL_DEFS) {
      this.onStatus?.(`Loading ${def.replace('sonic-pi-', '')}…`);
      await this.sonic.loadSynthDef(def);
    }

    this.booted = true;
    this.onStatus?.('Ready · add modules and connect to Output');
  }

  // Start a synth for a graph node
  play(graphId, synthDef, params) {
    if (!this.booted || !synthDef) return;
    if (this._active.has(graphId)) return; // already playing

    const id = this._nextId++;
    this._active.set(graphId, id);

    const flat = [];
    for (const [k, v] of Object.entries(params)) {
      flat.push(k, v);
    }

    this.sonic.send('/s_new', synthDef, id, 0, 1, ...flat);
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

  isPlaying(graphId) {
    return this._active.has(graphId);
  }

  stopAll() {
    for (const graphId of [...this._active.keys()]) {
      this.stop(graphId);
    }
  }
}
