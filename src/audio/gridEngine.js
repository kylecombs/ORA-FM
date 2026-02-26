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
import { buildSamplePlayerDef } from './buildSamplePlayerDef';

const SOURCE_DEFS = [
  'sine',
  'saw_osc',
  'pulse_osc',
  'tri_osc',
  'blip_osc',
  'formant_osc',
  'dust',
  'crackle',
  'lfnoise0',
  'lfnoise1',
  'lfnoise2',
  'white_noise',
  'pink_noise',
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
  'sonic-pi-fx_bpf',
  'sonic-pi-fx_rlpf',
  'sonic-pi-fx_rhpf',
  'sonic-pi-fx_rbpf',
  'sonic-pi-fx_nlpf',
  'sonic-pi-fx_nhpf',
  'sonic-pi-fx_nbpf',
  'sonic-pi-fx_nrlpf',
  'sonic-pi-fx_nrhpf',
  'sonic-pi-fx_nrbpf',
  'moog',
  'moogff',
  'sonic-pi-fx_distortion',
  'sonic-pi-fx_flanger',
  'multiply',
  'print',
];

const SYSTEM_DEFS = [
  'master_limiter',
];

export class GridEngine {
  constructor() {
    this.sonic = null;
    this._nextId = 3000;
    this._active = new Map(); // graphNodeId → scsynth nodeId
    this._idToGraph = new Map(); // scsynth nodeId → graphNodeId (reverse lookup)
    this.booted = false;
    this.onStatus = null;
    this.onPrint = null; // callback for print module messages: (graphId, value) => void
    this.onScope = null; // callback for scope module samples: (graphId, value) => void

    // Control bus allocator (buses 0–4095 available, separate from audio buses)
    this._nextControlBus = 0;
    this._controlBuses = new Map(); // allocationKey → busIndex

    // Buffer allocator for sample players
    this._nextBuffer = 100; // Start high to avoid conflicts
    this._buffers = new Map(); // graphNodeId → bufNum
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

    // Listen for /c_set replies (control bus value responses)
    this.sonic.on('message', (msg) => {
      // /c_set format: ['/c_set', busIndex, value]
      if (msg[0] === '/c_set') {
        const busIndex = msg[1];
        const value = msg[2];
        // Look up which print module owns this control bus
        if (this.onPrint) {
          const graphId = this._printBusToGraph.get(busIndex);
          if (graphId != null) {
            this.onPrint(graphId, value);
          }
        }
        // Look up which scope module owns this control bus
        if (this.onScope) {
          const graphId = this._scopeBusToGraph.get(busIndex);
          if (graphId != null) {
            this.onScope(graphId, value);
          }
        }
      }
    });

    // Map of control bus index → graph node ID for print modules
    this._printBusToGraph = new Map();
    this._printPollingInterval = null;

    // Scope module state (separate from print for higher polling rate)
    this._scopeBusToGraph = new Map();
    this._scopePollingInterval = null;

    await this.sonic.init();
    await this.sonic.resume();

    // Group 1: source synths (processed first)
    this.sonic.send('/g_new', 1, 0, 0);
    // Group 2: FX synths (processed after sources)
    this.sonic.send('/g_new', 2, 3, 1);
    // Group 3: master output (processed last, for safety limiting)
    this.sonic.send('/g_new', 3, 3, 2);

    const allDefs = [...SOURCE_DEFS, ...FX_DEFS, ...SYSTEM_DEFS];
    for (const def of allDefs) {
      this.onStatus?.(`Loading ${def.replace('sonic-pi-', '')}…`);
      await this.sonic.loadSynthDef(def);
    }

    // Load the runtime-built sample_player SynthDef via /d_recv
    this.onStatus?.('Loading sample_player…');
    const samplePlayerDef = buildSamplePlayerDef();
    this.sonic.send('/d_recv', samplePlayerDef);

    // Start the master limiter (always running, clips bus 0 output)
    this.sonic.send('/s_new', 'master_limiter', 2999, 0, 3);

    this.booted = true;
    this.onStatus?.('Ready · add modules and connect to Output');
  }

  // Start a source synth (group 1)
  play(graphId, synthDef, params) {
    if (!this.booted || !synthDef) return;
    if (this._active.has(graphId)) return; // already playing

    const id = this._nextId++;
    this._active.set(graphId, id);
    this._idToGraph.set(id, graphId);

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
    this._idToGraph.set(id, graphId);

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
    const idToGraph = this._idToGraph;
    setTimeout(() => {
      try { sonic.send('/n_free', capturedId); } catch { /* ignore */ }
      idToGraph.delete(capturedId);
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

  // ── Audio bus mapping (for audio-rate modulation) ──────────

  // Map a synth parameter to read from an AUDIO bus (/n_mapa)
  // Used for audio-rate modulation (e.g. FM synthesis)
  mapParamToAudioBus(graphId, param, audioBusIndex) {
    const id = this._active.get(graphId);
    if (id != null) {
      try { this.sonic.send('/n_mapa', id, param, audioBusIndex); } catch { /* ignore */ }
    }
  }

  // Unmap a parameter from its audio bus and restore a fixed value
  unmapParamFromAudioBus(graphId, param, value) {
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

  // ── Print module methods ────────────────────────────────

  // Allocate a control bus for a print module and start polling
  startPrintModule(graphId) {
    // Allocate a control bus (use high indices to avoid conflicts)
    const busIndex = 1000 + graphId;
    this._printBusToGraph.set(busIndex, graphId);

    // Start polling if not already running
    if (!this._printPollingInterval) {
      this._printPollingInterval = setInterval(() => {
        for (const bus of this._printBusToGraph.keys()) {
          if (this.booted) {
            try {
              this.sonic.send('/c_get', bus);
            } catch { /* ignore */ }
          }
        }
      }, 100); // Poll at 10 Hz
    }

    return busIndex;
  }

  // Stop polling for a print module
  stopPrintModule(graphId) {
    // Find and remove the bus mapping
    for (const [bus, id] of this._printBusToGraph.entries()) {
      if (id === graphId) {
        this._printBusToGraph.delete(bus);
        break;
      }
    }

    // Stop polling if no more print modules
    if (this._printBusToGraph.size === 0 && this._printPollingInterval) {
      clearInterval(this._printPollingInterval);
      this._printPollingInterval = null;
    }
  }

  // Get the control bus index for a print module
  getPrintBus(graphId) {
    for (const [bus, id] of this._printBusToGraph.entries()) {
      if (id === graphId) return bus;
    }
    return null;
  }

  // ── Scope module methods ─────────────────────────────

  // Allocate a control bus for a scope module and start fast polling
  startScope(graphId) {
    const busIndex = 2000 + graphId;
    this._scopeBusToGraph.set(busIndex, graphId);

    if (!this._scopePollingInterval) {
      this._scopePollingInterval = setInterval(() => {
        for (const bus of this._scopeBusToGraph.keys()) {
          if (this.booted) {
            try {
              this.sonic.send('/c_get', bus);
            } catch { /* ignore */ }
          }
        }
      }, 33); // Poll at ~30 Hz for smoother waveform display
    }

    return busIndex;
  }

  // Stop polling for a scope module
  stopScope(graphId) {
    for (const [bus, id] of this._scopeBusToGraph.entries()) {
      if (id === graphId) {
        this._scopeBusToGraph.delete(bus);
        break;
      }
    }

    if (this._scopeBusToGraph.size === 0 && this._scopePollingInterval) {
      clearInterval(this._scopePollingInterval);
      this._scopePollingInterval = null;
    }
  }

  // Get the control bus index for a scope module
  getScopeBus(graphId) {
    for (const [bus, id] of this._scopeBusToGraph.entries()) {
      if (id === graphId) return bus;
    }
    return null;
  }

  // ── Buffer management (for sample player) ─────────────

  // Allocate a buffer slot for a graph node
  allocBuffer(graphId) {
    if (this._buffers.has(graphId)) return this._buffers.get(graphId);
    const buf = this._nextBuffer++;
    this._buffers.set(graphId, buf);
    return buf;
  }

  // Get the buffer number for a graph node (or null)
  getBuffer(graphId) {
    return this._buffers.get(graphId) ?? null;
  }

  // Load audio data into a buffer via /b_allocFile (SuperSonic extension)
  // audioData should be a Uint8Array of the raw audio file bytes (FLAC, WAV, OGG, MP3)
  loadSampleBuffer(graphId, audioData) {
    if (!this.booted) return null;
    const bufNum = this.allocBuffer(graphId);
    try {
      this.sonic.send('/b_allocFile', bufNum, audioData);
    } catch (e) {
      console.error('[GridEngine] Failed to load sample buffer:', e);
    }
    return bufNum;
  }

  // Load a built-in sample by name (fetches from /supersonic/samples/)
  async loadBuiltinSample(graphId, sampleName) {
    if (!this.booted) return null;
    const bufNum = this.allocBuffer(graphId);
    try {
      // Fetch the sample file and send as raw bytes
      const resp = await fetch(`/supersonic/samples/${sampleName}.flac`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = new Uint8Array(await resp.arrayBuffer());
      this.sonic.send('/b_allocFile', bufNum, data);
    } catch (e) {
      console.error(`[GridEngine] Failed to load sample "${sampleName}":`, e);
    }
    return bufNum;
  }

  // Free a buffer
  freeBuffer(graphId) {
    const buf = this._buffers.get(graphId);
    if (buf != null) {
      try { this.sonic.send('/b_free', buf); } catch { /* ignore */ }
      this._buffers.delete(graphId);
    }
  }

  // Send a trigger to a running synth's t_trig parameter
  triggerSample(graphId) {
    const id = this._active.get(graphId);
    if (id != null) {
      try { this.sonic.send('/n_set', id, 't_trig', 1); } catch { /* ignore */ }
    }
  }
}
