import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GridEngine } from './audio/gridEngine';
import { ScriptRunner } from './audio/scriptRunner';
import { EnvelopeRunner } from './audio/envelopeRunner';
import BreakpointEditor from './BreakpointEditor';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import './GridView.css';

// ── CodeMirror theme matching the app's dark palette ─────
const oraTheme = createTheme({
  theme: 'dark',
  settings: {
    background: '#0c0b0a',
    foreground: '#d4cfc8',
    caret: '#c8b060',
    selection: 'rgba(200, 176, 96, 0.15)',
    selectionMatch: 'rgba(200, 176, 96, 0.08)',
    lineHighlight: 'rgba(184, 154, 106, 0.04)',
    gutterBackground: '#0c0b0a',
    gutterForeground: '#3a3835',
    gutterBorder: '#252320',
  },
  styles: [
    { tag: t.comment,        color: '#4a4740' },
    { tag: t.lineComment,    color: '#4a4740' },
    { tag: t.blockComment,   color: '#4a4740' },
    { tag: t.keyword,        color: '#c8b060' },
    { tag: t.controlKeyword, color: '#c8b060' },
    { tag: t.operator,       color: '#7a7570' },
    { tag: t.number,         color: '#8ab0c8' },
    { tag: t.string,         color: '#7aab88' },
    { tag: t.variableName,   color: '#d4cfc8' },
    { tag: t.function(t.variableName), color: '#c08880' },
    { tag: t.definition(t.variableName), color: '#d4cfc8' },
    { tag: t.propertyName,   color: '#c08880' },
    { tag: t.bool,           color: '#8ab0c8' },
    { tag: t.null,           color: '#8ab0c8' },
    { tag: t.punctuation,    color: '#5a5550' },
    { tag: t.brace,          color: '#5a5550' },
    { tag: t.paren,          color: '#5a5550' },
  ],
});

// ── Node type definitions ─────────────────────────────────
const NODE_SCHEMA = {
  sine: {
    label: 'Sine',
    desc: 'pure tone',
    accent: '#b89a6a',
    synthDef: 'sonic-pi-beep',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.4 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.1,  val: 0.1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,   step: 0.1,  val: 1 },
    },
  },
  saw: {
    label: 'Saw',
    desc: 'sawtooth',
    accent: '#b89a6a',
    synthDef: 'sonic-pi-saw',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.25 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.1,  val: 0.1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,   step: 0.1,  val: 1 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 80 },
    },
  },
  bell: {
    label: 'Bell',
    desc: 'pretty bell',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-pretty_bell',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,  step: 1,    val: 72 },
      amp:     { label: 'amp',  min: 0,  max: 1,   step: 0.01, val: 0.5 },
      attack:  { label: 'atk',  min: 0,  max: 2,   step: 0.01, val: 0.01 },
      sustain: { label: 'sus',  min: 0,  max: 9999,step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 10,  step: 0.1,  val: 2 },
    },
  },
  blade: {
    label: 'Blade',
    desc: 'vibrato synth',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-blade',
    inputs: [],
    outputs: ['out'],
    params: {
      note:           { label: 'note',  min: 24, max: 96,  step: 1,    val: 64 },
      amp:            { label: 'amp',   min: 0,  max: 1,   step: 0.01, val: 0.2 },
      attack:         { label: 'atk',   min: 0,  max: 5,   step: 0.1,  val: 1 },
      sustain:        { label: 'sus',   min: 0.1,max: 9999,step: 1,    val: 9999 },
      release:        { label: 'rel',   min: 0,  max: 10,  step: 0.1,  val: 2 },
      cutoff:         { label: 'cut',   min: 30, max: 130, step: 1,    val: 80 },
      vibrato_rate:   { label: 'vib',   min: 0,  max: 20,  step: 0.5,  val: 3 },
      vibrato_depth:  { label: 'depth', min: 0,  max: 1,   step: 0.01, val: 0.06 },
    },
  },
  pad: {
    label: 'Pad',
    desc: 'dark ambience',
    accent: '#7aab88',
    synthDef: 'sonic-pi-dark_ambience',
    inputs: [],
    outputs: ['out'],
    params: {
      note:        { label: 'note', min: 24, max: 96,   step: 1,    val: 57 },
      amp:         { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.3 },
      attack:      { label: 'atk',  min: 0,  max: 10,   step: 0.5,  val: 3 },
      sustain:     { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release:     { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:      { label: 'cut',  min: 30, max: 130,  step: 1,    val: 72 },
      res:         { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.05 },
      room:        { label: 'room', min: 0,  max: 1,    step: 0.01, val: 0.9 },
      reverb_damp: { label: 'damp', min: 0,  max: 1,    step: 0.01, val: 0.5 },
    },
  },
  hollow: {
    label: 'Hollow',
    desc: 'resonant texture',
    accent: '#7aab88',
    synthDef: 'sonic-pi-hollow',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96,   step: 1,    val: 69 },
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.15 },
      attack:  { label: 'atk',  min: 0,  max: 10,   step: 0.5,  val: 2 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 80 },
      res:     { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.1 },
    },
  },
  noise: {
    label: 'Noise',
    desc: 'brown 1/f²',
    accent: '#c08880',
    synthDef: 'sonic-pi-bnoise',
    inputs: [],
    outputs: ['out'],
    params: {
      amp:     { label: 'amp',  min: 0,  max: 1,    step: 0.01, val: 0.08 },
      attack:  { label: 'atk',  min: 0,  max: 5,    step: 0.5,  val: 1 },
      sustain: { label: 'sus',  min: 0.1,max: 9999, step: 1,    val: 9999 },
      release: { label: 'rel',  min: 0,  max: 20,   step: 0.5,  val: 5 },
      cutoff:  { label: 'cut',  min: 30, max: 130,  step: 1,    val: 95 },
      res:     { label: 'res',  min: 0,  max: 1,    step: 0.01, val: 0.05 },
    },
  },
  pluck: {
    label: 'Pluck',
    desc: 'string',
    accent: '#8ab0c8',
    synthDef: 'sonic-pi-pluck',
    inputs: [],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96, step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,  step: 0.01, val: 0.5 },
      sustain: { label: 'sus',  min: 0.1,max: 9999,step: 1,   val: 9999 },
      release: { label: 'rel',  min: 0,  max: 5,  step: 0.1,  val: 1 },
    },
  },
  // ── FX modules ─────────────────────────────────────────
  fx_reverb: {
    label: 'Reverb',
    desc: 'room reverb',
    accent: '#9b7abf',
    synthDef: 'sonic-pi-fx_reverb',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      mix:  { label: 'mix',  min: 0, max: 1, step: 0.01, val: 0.4 },
      room: { label: 'room', min: 0, max: 1, step: 0.01, val: 0.6 },
      damp: { label: 'damp', min: 0, max: 1, step: 0.01, val: 0.5 },
    },
  },
  fx_echo: {
    label: 'Echo',
    desc: 'delay + feedback',
    accent: '#9b7abf',
    synthDef: 'sonic-pi-fx_echo',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      mix:   { label: 'mix',   min: 0,    max: 1, step: 0.01, val: 1 },
      phase: { label: 'time',  min: 0.01, max: 2, step: 0.01, val: 0.25 },
      decay: { label: 'decay', min: 0,    max: 8, step: 0.1,  val: 2 },
    },
  },
  fx_lpf: {
    label: 'LPF',
    desc: 'low-pass filter',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_lpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 80 },
    },
  },
  fx_hpf: {
    label: 'HPF',
    desc: 'high-pass filter',
    accent: '#bf9b7a',
    synthDef: 'sonic-pi-fx_hpf',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      cutoff: { label: 'cut', min: 0, max: 130, step: 1, val: 30 },
    },
  },
  fx_distortion: {
    label: 'Distort',
    desc: 'distortion',
    accent: '#bf7a7a',
    synthDef: 'sonic-pi-fx_distortion',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      distort: { label: 'dist', min: 0, max: 1,  step: 0.01, val: 0.5 },
      mix:     { label: 'mix',  min: 0, max: 1,  step: 0.01, val: 1 },
    },
  },
  fx_flanger: {
    label: 'Flanger',
    desc: 'flanger',
    accent: '#7abfbf',
    synthDef: 'sonic-pi-fx_flanger',
    category: 'fx',
    inputs: ['in'],
    outputs: ['out'],
    params: {
      phase:    { label: 'phase', min: 0,    max: 10, step: 0.1,  val: 4 },
      depth:    { label: 'depth', min: 0,    max: 5,  step: 0.1,  val: 5 },
      feedback: { label: 'fb',    min: 0,    max: 1,  step: 0.01, val: 0 },
      mix:      { label: 'mix',   min: 0,    max: 1,  step: 0.01, val: 1 },
    },
  },
  // ── Script modules ───────────────────────────────────────
  script: {
    label: 'Script',
    desc: 'code & patterns',
    accent: '#c8b060',
    synthDef: null,
    category: 'script',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 127, step: 0.01, val: 0 },
    },
  },
  // ── Control modules ──────────────────────────────────────
  constant: {
    label: 'Constant',
    desc: 'fixed value',
    accent: '#d4a06a',
    synthDef: null,
    category: 'control',
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'val', min: 0, max: 127, step: 0.01, val: 60 },
    },
  },
  envelope: {
    label: 'Envelope',
    desc: 'breakpoint editor',
    accent: '#c8b060',
    synthDef: null,
    category: 'control',
    width: 280,
    inputs: [],
    outputs: ['out'],
    params: {
      value: { label: 'out', min: 0, max: 1, step: 0.001, val: 0, hidden: true },
      trig:  { label: 'trig', min: 0, max: 1, step: 1, val: 0, hidden: true },
    },
  },
  audioOut: {
    label: 'Output',
    desc: 'audio destination',
    accent: '#7a7570',
    synthDef: null,
    inputs: ['L', 'R'],
    outputs: [],
    params: {},
  },
};

// ── Module categories for the instrument panel ───────────
const MODULE_CATEGORIES = [
  {
    id: 'oscillators',
    label: 'Oscillators',
    desc: 'basic waveforms',
    types: ['sine', 'saw'],
  },
  {
    id: 'instruments',
    label: 'Instruments',
    desc: 'melodic voices',
    types: ['bell', 'blade', 'pluck'],
  },
  {
    id: 'textures',
    label: 'Textures',
    desc: 'pads & noise',
    types: ['pad', 'hollow', 'noise'],
  },
  {
    id: 'filters',
    label: 'Filters',
    desc: 'frequency shaping',
    types: ['fx_lpf', 'fx_hpf'],
  },
  {
    id: 'fx',
    label: 'Effects',
    desc: 'time & space',
    types: ['fx_reverb', 'fx_echo', 'fx_distortion', 'fx_flanger'],
  },
  {
    id: 'scripting',
    label: 'Scripting',
    desc: 'code & patterns',
    types: ['script'],
  },
  {
    id: 'control',
    label: 'Control',
    desc: 'modulation sources',
    types: ['constant', 'envelope'],
  },
];

// ── Layout constants ──────────────────────────────────────
const NODE_W = 186;
const HEADER_H = 32;
const PORT_SECTION_Y = HEADER_H + 2;
const PORT_SPACING = 22;

function getNodeWidth(node) {
  return NODE_SCHEMA[node.type]?.width || NODE_W;
}

function getPortPos(node, portType, portIndex) {
  const y = node.y + PORT_SECTION_Y + 11 + portIndex * PORT_SPACING;
  if (portType === 'output') {
    return { x: node.x + getNodeWidth(node), y };
  }
  return { x: node.x, y };
}

// ── Parameter modulation port positions ──────────────────
// Params render after the header: 33px header + 6px padding + 18px per row
const PARAM_START_Y = HEADER_H + 1 + 6; // header + border + top padding
const PARAM_ROW_H = 18;

function getParamPortPos(node, schema, paramKey) {
  // Envelope trigger port: vertically centered on the canvas area
  if (node.type === 'envelope' && paramKey === 'trig') {
    return { x: node.x, y: node.y + HEADER_H + 60 };
  }
  const paramKeys = Object.keys(schema.params);
  const idx = paramKeys.indexOf(paramKey);
  if (idx === -1) return { x: node.x, y: node.y };
  return {
    x: node.x,
    y: node.y + PARAM_START_Y + idx * PARAM_ROW_H + PARAM_ROW_H / 2,
  };
}

// ── Compute which nodes are "live" (reachable from AudioOut) ──
function computeLiveNodes(nodes, connections) {
  const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');
  if (!outNode) return new Set();

  const live = new Set();
  const queue = [outNode.id];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (live.has(cur)) continue;
    live.add(cur);
    // Find all nodes whose output connects to this node's audio input
    // (skip modulation connections — they don't carry audio)
    connections
      .filter((c) => c.toNodeId === cur && !c.toParam)
      .forEach((c) => queue.push(c.fromNodeId));
  }

  live.delete(outNode.id); // AudioOut itself doesn't play audio
  return live;
}

// ── Cable SVG path (cubic Bézier) ─────────────────────────
function cablePath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ── Pan value for AudioOut port ───────────────────────────
function panForPort(portIndex) {
  // 0 = L → pan -0.8,  1 = R → pan 0.8
  return portIndex === 0 ? -0.8 : 0.8;
}

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function GridView() {
  const engineRef = useRef(null);
  const canvasRef = useRef(null);
  const nextId = useRef(1);
  const connId = useRef(1);

  const [nodes, setNodes] = useState({});
  const [connections, setConnections] = useState([]);
  const [status, setStatus] = useState('Boot the engine to begin');
  const [booted, setBooted] = useState(false);
  const [booting, setBooting] = useState(false);

  // Drag state
  const [dragId, setDragId] = useState(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Connection state
  const [connecting, setConnecting] = useState(null); // { fromNodeId, fromPortIndex }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Module details panel state
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const didDragRef = useRef(false);

  // Script runtime state
  const scriptRunnerRef = useRef(null);
  const [runningScripts, setRunningScripts] = useState(new Set());
  const [scriptLogs, setScriptLogs] = useState({}); // nodeId → string[]

  // Envelope runtime state
  const envelopeRunnerRef = useRef(null);
  const [runningEnvelopes, setRunningEnvelopes] = useState(new Set());

  // Instrument panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});

  // ── Engine setup ──────────────────────────────────────
  useEffect(() => {
    engineRef.current = new GridEngine();
    engineRef.current.onStatus = (msg) => setStatus(msg);

    scriptRunnerRef.current = new ScriptRunner({
      onOutput: (nodeId, value) => {
        setNodes((prev) => {
          const node = prev[nodeId];
          if (!node) return prev;
          return {
            ...prev,
            [nodeId]: {
              ...node,
              params: { ...node.params, value },
            },
          };
        });
      },
      onLog: (nodeId, ...args) => {
        const line = args.map((a) =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ');
        setScriptLogs((prev) => {
          const existing = prev[nodeId] || [];
          // Keep last 100 lines
          const next = [...existing, line].slice(-100);
          return { ...prev, [nodeId]: next };
        });
      },
    });

    envelopeRunnerRef.current = new EnvelopeRunner((nodeId, value) => {
      setNodes((prev) => {
        const node = prev[nodeId];
        if (!node) return prev;
        return {
          ...prev,
          [nodeId]: {
            ...node,
            params: { ...node.params, value },
          },
        };
      });
    });

    return () => {
      engineRef.current?.stopAll();
      scriptRunnerRef.current?.stopAll();
      envelopeRunnerRef.current?.stopAll();
    };
  }, []);

  // ── Sync audio with live node set & bus routing ──────
  const prevRoutingRef = useRef({}); // nodeId → { inBus, outBus }
  const prevModRef = useRef({});     // `${nodeId}:${param}` → { busIndex }

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.booted) return;

    const live = computeLiveNodes(nodes, connections);
    const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');
    if (!outNode) return;

    // ── 1. Assign audio buses to each connection ──
    // Connections to AudioOut use bus 0 (hardware out).
    // All other connections get a private bus (16+).
    // Skip modulation connections (toParam) — they don't route audio.
    const connBus = {};
    let nextBus = 16;
    for (const conn of connections) {
      if (conn.toParam) continue;
      const fromLive = live.has(conn.fromNodeId);
      const toLive = live.has(conn.toNodeId) || conn.toNodeId === outNode.id;
      if (!fromLive || !toLive) continue;

      if (conn.toNodeId === outNode.id) {
        connBus[conn.id] = 0;
      } else {
        connBus[conn.id] = nextBus;
        nextBus += 2; // stereo pair
      }
    }

    // ── 2. Compute per-node routing ──
    const nodeRouting = {}; // nodeId → { outBus, inBus, isFx }
    for (const id of live) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      const isFx = schema.category === 'fx';

      // Outgoing audio connection from this node's output
      const outConn = connections.find(
        (c) => c.fromNodeId === id && !c.toParam && (live.has(c.toNodeId) || c.toNodeId === outNode.id)
      );
      const outBus = outConn ? (connBus[outConn.id] ?? 0) : 0;

      // Incoming audio connection to this node's input (only for FX)
      let inBus;
      if (isFx) {
        const inConn = connections.find(
          (c) => c.toNodeId === id && !c.toParam && live.has(c.fromNodeId)
        );
        inBus = inConn ? (connBus[inConn.id] ?? 0) : 0;
      }

      nodeRouting[id] = { outBus, inBus, isFx };
    }

    // ── 3. Compute pan for source nodes ──
    // Trace each source's chain to AudioOut to find which port it reaches.
    for (const id of live) {
      const routing = nodeRouting[id];
      if (routing.isFx) continue;

      let current = id;
      let audioOutPort = null;
      const visited = new Set();
      while (current != null && !visited.has(current)) {
        visited.add(current);
        const conn = connections.find(
          (c) => c.fromNodeId === current && !c.toParam && (live.has(c.toNodeId) || c.toNodeId === outNode.id)
        );
        if (!conn) break;
        if (conn.toNodeId === outNode.id) {
          audioOutPort = conn.toPortIndex;
          break;
        }
        current = conn.toNodeId;
      }

      if (audioOutPort === 0) routing.pan = -0.8;
      else if (audioOutPort === 1) routing.pan = 0.8;
      else routing.pan = 0;
    }

    // ── 4. Build topological play order (sources first, then FX in chain order) ──
    const sources = [];
    const fxSet = new Set();
    for (const id of live) {
      if (nodeRouting[id].isFx) {
        fxSet.add(id);
      } else {
        sources.push(id);
      }
    }

    // Topological sort of FX: repeatedly pick FX whose upstream is already placed
    const fxOrder = [];
    const remaining = new Set(fxSet);
    const placed = new Set(sources);
    placed.add(outNode.id);
    let safety = remaining.size + 1;
    while (remaining.size > 0 && safety-- > 0) {
      for (const id of remaining) {
        const inConn = connections.find((c) => c.toNodeId === id && !c.toParam);
        if (!inConn || placed.has(inConn.fromNodeId)) {
          fxOrder.push(id);
          remaining.delete(id);
          placed.add(id);
        }
      }
    }

    // ── 5. Stop nodes that should not be playing ──
    for (const id of Object.keys(nodes)) {
      const nid = parseInt(id);
      if (!live.has(nid) && engine.isPlaying(nid)) {
        engine.stop(nid);
      }
    }

    // ── 6. Stop FX whose routing changed (need restart for correct ordering) ──
    const prevRouting = prevRoutingRef.current;
    for (const id of fxOrder) {
      if (engine.isPlaying(id)) {
        const prev = prevRouting[id];
        const cur = nodeRouting[id];
        if (!prev || prev.inBus !== cur.inBus || prev.outBus !== cur.outBus) {
          engine.stop(id);
        }
      }
    }

    // ── 7. Play / update source nodes ──
    for (const id of sources) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];
      const pan = routing.pan ?? 0;

      if (!engine.isPlaying(id)) {
        engine.play(id, schema.synthDef, {
          ...node.params,
          pan,
          out_bus: routing.outBus,
        });
      } else {
        engine.setParam(id, 'pan', pan);
        engine.setParam(id, 'out_bus', routing.outBus);
      }
    }

    // ── 8. Play / update FX nodes (in chain order) ──
    for (const id of fxOrder) {
      const node = nodes[id];
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      const routing = nodeRouting[id];

      if (!engine.isPlaying(id)) {
        engine.playFx(id, schema.synthDef, {
          ...node.params,
          in_bus: routing.inBus,
          out_bus: routing.outBus,
        });
      } else {
        // Update FX params (bus routing unchanged, just tweak params)
        for (const [k, v] of Object.entries(node.params)) {
          engine.setParam(id, k, v);
        }
      }
    }

    // ── 9. Reorder FX in scsynth node tree ──
    if (fxOrder.length > 1) {
      engine.reorderFx(fxOrder);
    }

    // ── 10. Apply modulation via control buses ──
    // Each modulation connection gets a dedicated scsynth control bus.
    // The source value is written with /c_set, and the target param is
    // mapped to read from that bus with /n_map — all at the engine level.
    const prevMod = prevModRef.current;
    const currentMod = {};

    for (const conn of connections) {
      if (!conn.toParam) continue;
      const sourceNode = nodes[conn.fromNodeId];
      const targetNode = nodes[conn.toNodeId];
      if (!sourceNode || !targetNode) continue;

      const sourceSchema = NODE_SCHEMA[sourceNode.type];
      if (sourceSchema?.category !== 'control' && sourceSchema?.category !== 'script') continue;

      const modKey = `${conn.toNodeId}:${conn.toParam}`;
      const value = sourceNode.params.value ?? 0;

      // Allocate a control bus (stable — same key returns same bus)
      const busIndex = engine.allocControlBus(modKey);

      // Write the current value to the control bus
      engine.setControlBus(busIndex, value);

      // Map the target synth's param to read from this bus
      if (engine.isPlaying(conn.toNodeId)) {
        engine.mapParam(conn.toNodeId, conn.toParam, busIndex);
      }

      currentMod[modKey] = { busIndex };
    }

    // Unmap params that are no longer modulated
    for (const [modKey, info] of Object.entries(prevMod)) {
      if (!(modKey in currentMod)) {
        const sepIdx = modKey.indexOf(':');
        const nodeId = parseInt(modKey.slice(0, sepIdx));
        const param = modKey.slice(sepIdx + 1);
        const targetNode = nodes[nodeId];
        const baseValue = targetNode?.params[param] ?? 0;

        engine.unmapParam(nodeId, param, baseValue);
        engine.freeControlBus(modKey);
      }
    }

    prevModRef.current = currentMod;

    // Save routing state for next sync
    prevRoutingRef.current = nodeRouting;
  }, [nodes, connections]);

  // ── Boot engine ───────────────────────────────────────
  const handleBoot = useCallback(async () => {
    setBooting(true);
    try {
      await engineRef.current.boot();
      setBooted(true);

      // Create default AudioOut node
      const outId = nextId.current++;
      setNodes({
        [outId]: {
          id: outId,
          type: 'audioOut',
          x: 520,
          y: 180,
          params: {},
        },
      });
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
    setBooting(false);
  }, []);

  // ── Add node ──────────────────────────────────────────
  const addNode = useCallback((type) => {
    const id = nextId.current++;
    const schema = NODE_SCHEMA[type];
    const params = {};
    for (const [k, def] of Object.entries(schema.params)) {
      params[k] = def.val;
    }
    const node = {
      id,
      type,
      x: 0,
      y: 0,
      params,
    };
    if (schema.category === 'script') {
      node.code = '// Write your script here\n// Output values with: out(value)\n';
    }
    if (type === 'envelope') {
      node.breakpoints = [
        { time: 0, value: 0 },
        { time: 0.15, value: 1 },
        { time: 0.4, value: 0.6 },
        { time: 1, value: 0 },
      ];
      node.curves = [0, 0, -2];
      node.duration = 2;
      node.loop = false;
    }
    setNodes((prev) => {
      const count = Object.keys(prev).length;
      const col = Math.max(0, count - 1) % 3;
      const row = Math.floor(Math.max(0, count - 1) / 3);
      node.x = 40 + col * 210;
      node.y = 40 + row * 220;
      return { ...prev, [id]: node };
    });
  }, []);

  // ── Remove node ───────────────────────────────────────
  const removeNode = useCallback(
    (id) => {
      engineRef.current?.stop(id);
      scriptRunnerRef.current?.stop(id);
      envelopeRunnerRef.current?.stop(id);
      setRunningScripts((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRunningEnvelopes((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConnections((prev) =>
        prev.filter((c) => c.fromNodeId !== id && c.toNodeId !== id)
      );
      setSelectedNodeId((prev) => (prev === id ? null : prev));
    },
    []
  );

  // ── Param change ──────────────────────────────────────
  const handleParamChange = useCallback((nodeId, param, value) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        params: { ...prev[nodeId].params, [param]: value },
      },
    }));
    engineRef.current?.setParam(nodeId, param, value);
  }, []);

  // ── Script code change ──────────────────────────────────
  const handleCodeChange = useCallback((nodeId, code) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], code },
    }));
  }, []);

  // ── Script run/stop ───────────────────────────────────
  const handleRunScript = useCallback((nodeId, code) => {
    const runner = scriptRunnerRef.current;
    if (!runner) return;
    // Clear previous logs for this node
    setScriptLogs((prev) => ({ ...prev, [nodeId]: [] }));
    runner.run(nodeId, code);
    setRunningScripts((prev) => new Set(prev).add(nodeId));
  }, []);

  const handleStopScript = useCallback((nodeId) => {
    const runner = scriptRunnerRef.current;
    if (!runner) return;
    runner.stop(nodeId);
    setRunningScripts((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  // ── Envelope handlers ──────────────────────────────────
  const handleBreakpointsChange = useCallback((nodeId, breakpoints, curves) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], breakpoints, curves },
    }));
  }, []);

  const handleEnvelopeDuration = useCallback((nodeId, duration) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], duration },
    }));
  }, []);

  const handleEnvelopeLoop = useCallback((nodeId, loop) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], loop },
    }));
  }, []);

  const handleEnvelopeTrigger = useCallback((nodeId) => {
    const runner = envelopeRunnerRef.current;
    if (!runner) return;

    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) return prev;
      runner.trigger(
        nodeId,
        node.breakpoints,
        node.curves,
        node.duration,
        node.loop
      );
      return prev;
    });
    setRunningEnvelopes((prev) => new Set(prev).add(nodeId));

    // Poll for completion to clear the running state
    const checkDone = setInterval(() => {
      if (!envelopeRunnerRef.current?.isRunning(nodeId)) {
        clearInterval(checkDone);
        setRunningEnvelopes((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    }, 100);
  }, []);

  const handleEnvelopeStop = useCallback((nodeId) => {
    envelopeRunnerRef.current?.stop(nodeId);
    setRunningEnvelopes((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const getEnvelopeProgress = useCallback((nodeId) => {
    return envelopeRunnerRef.current?.getProgress(nodeId) || null;
  }, []);

  // ── External trigger detection (rising-edge on modulated trig param) ──
  const prevTrigVals = useRef({}); // nodeId → previous trigger source value

  useEffect(() => {
    const prev = prevTrigVals.current;

    for (const conn of connections) {
      if (conn.toParam !== 'trig') continue;

      const targetNode = nodes[conn.toNodeId];
      if (!targetNode || targetNode.type !== 'envelope') continue;

      const sourceNode = nodes[conn.fromNodeId];
      if (!sourceNode) continue;

      const srcSchema = NODE_SCHEMA[sourceNode.type];
      if (srcSchema?.category !== 'control' && srcSchema?.category !== 'script') continue;

      const value = sourceNode.params.value ?? 0;
      const prevValue = prev[conn.toNodeId] ?? 0;

      // Rising edge: crossed above 0.5
      if (value >= 0.5 && prevValue < 0.5) {
        const runner = envelopeRunnerRef.current;
        if (runner) {
          const envId = conn.toNodeId;
          runner.trigger(
            envId,
            targetNode.breakpoints,
            targetNode.curves,
            targetNode.duration,
            targetNode.loop
          );
          setRunningEnvelopes((s) => new Set(s).add(envId));

          // Poll for completion to clear running state
          const check = setInterval(() => {
            if (!envelopeRunnerRef.current?.isRunning(envId)) {
              clearInterval(check);
              setRunningEnvelopes((s) => {
                const next = new Set(s);
                next.delete(envId);
                return next;
              });
            }
          }, 100);
        }
      }

      prev[conn.toNodeId] = value;
    }
  }, [nodes, connections]);

  // ── Param port click (modulation connect/disconnect) ──
  const handleParamPortClick = useCallback(
    (e, nodeId, paramKey) => {
      e.stopPropagation();

      if (connecting) {
        // Completing a modulation connection
        if (connecting.fromNodeId === nodeId) {
          setConnecting(null);
          return;
        }

        // Remove any existing modulation to this param, then add new one
        setConnections((prev) => {
          const filtered = prev.filter(
            (c) => !(c.toNodeId === nodeId && c.toParam === paramKey)
          );
          return [
            ...filtered,
            {
              id: connId.current++,
              fromNodeId: connecting.fromNodeId,
              fromPortIndex: connecting.fromPortIndex,
              toNodeId: nodeId,
              toParam: paramKey,
              toPortIndex: -1,
            },
          ];
        });
        setConnecting(null);
      } else {
        // Clicking a modulated param port disconnects it
        setConnections((prev) =>
          prev.filter(
            (c) => !(c.toNodeId === nodeId && c.toParam === paramKey)
          )
        );
      }
    },
    [connecting]
  );

  // ── Node dragging ─────────────────────────────────────
  const startDrag = useCallback((e, nodeId) => {
    if (e.target.closest('.node-port') || e.target.closest('button') || e.target.closest('input') || e.target.closest('.script-code-preview') || e.target.closest('.bp-editor-wrap')) return;
    didDragRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!node) return;
    const nodeRect = node.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - nodeRect.left + (nodeRect.left - rect.left) - (parseFloat(node.style.left) || 0) + (parseFloat(node.style.left) || 0),
      y: e.clientY - nodeRect.top + (nodeRect.top - rect.top) - (parseFloat(node.style.top) || 0) + (parseFloat(node.style.top) || 0),
    };
    // Simpler: offset = mouse position in canvas - node position
    const canvasX = e.clientX - rect.left + canvas.scrollLeft;
    const canvasY = e.clientY - rect.top + canvas.scrollTop;
    setNodes((prev) => {
      const n = prev[nodeId];
      dragOffset.current = { x: canvasX - n.x, y: canvasY - n.y };
      return prev;
    });
    setDragId(nodeId);
  }, []);

  const onCanvasMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left + canvas.scrollLeft;
      const cy = e.clientY - rect.top + canvas.scrollTop;

      if (dragId != null) {
        didDragRef.current = true;
        const x = Math.max(0, cx - dragOffset.current.x);
        const y = Math.max(0, cy - dragOffset.current.y);
        setNodes((prev) => ({
          ...prev,
          [dragId]: { ...prev[dragId], x, y },
        }));
      }

      if (connecting) {
        setMousePos({ x: cx, y: cy });
      }
    },
    [dragId, connecting]
  );

  const onCanvasMouseUp = useCallback(() => {
    if (dragId != null) {
      if (!didDragRef.current) {
        // Click without drag — select the node
        setSelectedNodeId(dragId);
      }
      setDragId(null);
    }
  }, [dragId]);

  // ── Port click (connect/disconnect) ───────────────────
  const handlePortClick = useCallback(
    (e, nodeId, portType, portIndex) => {
      e.stopPropagation();

      if (connecting) {
        // Completing a connection
        if (portType === 'input') {
          // Validate: no duplicate, no self-connect
          const from = connecting;
          if (from.fromNodeId === nodeId) {
            setConnecting(null);
            return;
          }
          const exists = connections.some(
            (c) =>
              c.fromNodeId === from.fromNodeId &&
              c.fromPortIndex === from.fromPortIndex &&
              c.toNodeId === nodeId &&
              c.toPortIndex === portIndex
          );
          if (!exists) {
            // Remove any existing connection to this input port
            setConnections((prev) => {
              const filtered = prev.filter(
                (c) => !(c.toNodeId === nodeId && c.toPortIndex === portIndex)
              );
              return [
                ...filtered,
                {
                  id: connId.current++,
                  fromNodeId: from.fromNodeId,
                  fromPortIndex: from.fromPortIndex,
                  toNodeId: nodeId,
                  toPortIndex: portIndex,
                },
              ];
            });
          }
        }
        setConnecting(null);
      } else {
        // Starting a connection
        if (portType === 'output') {
          setConnecting({ fromNodeId: nodeId, fromPortIndex: portIndex });
          // Set initial mouse position to port position
          const node = nodes[nodeId];
          if (node) {
            const pos = getPortPos(node, 'output', portIndex);
            setMousePos(pos);
          }
        } else if (portType === 'input') {
          // Clicking an input removes its connection
          setConnections((prev) =>
            prev.filter(
              (c) => !(c.toNodeId === nodeId && c.toPortIndex === portIndex)
            )
          );
        }
      }
    },
    [connecting, connections, nodes]
  );

  // Cancel connection on canvas click
  const handleCanvasClick = useCallback(
    (e) => {
      if (connecting && e.target === canvasRef.current) {
        setConnecting(null);
      }
    },
    [connecting]
  );

  // ── Panel helpers ────────────────────────────────────
  const toggleSection = useCallback((sectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const filteredCategories = useMemo(() => {
    const q = panelSearch.toLowerCase().trim();
    if (!q) return MODULE_CATEGORIES;
    return MODULE_CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter((type) => {
        const schema = NODE_SCHEMA[type];
        return (
          schema.label.toLowerCase().includes(q) ||
          schema.desc.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        );
      }),
    })).filter((cat) => cat.types.length > 0);
  }, [panelSearch]);

  const handlePanelAdd = useCallback(
    (type) => {
      addNode(type);
    },
    [addNode]
  );

  // ── Render helpers ────────────────────────────────────
  const renderCables = () => {
    const paths = [];

    // Existing connections (audio + modulation)
    for (const conn of connections) {
      const fromNode = nodes[conn.fromNodeId];
      const toNode = nodes[conn.toNodeId];
      if (!fromNode || !toNode) continue;

      const from = getPortPos(fromNode, 'output', conn.fromPortIndex);
      const toSchema = NODE_SCHEMA[toNode.type];

      // Modulation cables target a param port; audio cables target an input port
      const to = conn.toParam
        ? getParamPortPos(toNode, toSchema, conn.toParam)
        : getPortPos(toNode, 'input', conn.toPortIndex);

      const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';
      const isMod = !!conn.toParam;

      paths.push(
        <path
          key={conn.id}
          d={cablePath(from.x, from.y, to.x, to.y)}
          stroke={accent}
          strokeWidth={isMod ? 1.5 : 2.5}
          fill="none"
          opacity={isMod ? 0.6 : 0.7}
          strokeDasharray={isMod ? '4 3' : undefined}
          className="sense-cable"
        />
      );
    }

    // Preview cable while connecting
    if (connecting) {
      const fromNode = nodes[connecting.fromNodeId];
      if (fromNode) {
        const from = getPortPos(fromNode, 'output', connecting.fromPortIndex);
        const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';
        paths.push(
          <path
            key="preview"
            d={cablePath(from.x, from.y, mousePos.x, mousePos.y)}
            stroke={accent}
            strokeWidth={2}
            fill="none"
            opacity={0.4}
            strokeDasharray="6 4"
          />
        );
      }
    }

    return paths;
  };

  const renderNode = (node) => {
    const schema = NODE_SCHEMA[node.type];
    if (!schema) return null;

    const live = computeLiveNodes(nodes, connections);
    const isLive = live.has(node.id);
    const isAudioOut = node.type === 'audioOut';
    const isFx = schema.category === 'fx';
    const isControl = schema.category === 'control';
    const isScript = schema.category === 'script';
    const isEnvelope = node.type === 'envelope';
    const nodeWidth = schema.width || NODE_W;

    // Check if this control/script module has any modulation connections
    const hasModOutput = (isControl || isScript) && connections.some(
      (c) => c.fromNodeId === node.id && c.toParam
    );

    // Build set of modulated params on this node
    const modulatedParams = {};
    for (const conn of connections) {
      if (conn.toNodeId !== node.id || !conn.toParam) continue;
      const src = nodes[conn.fromNodeId];
      const srcCat = NODE_SCHEMA[src?.type]?.category;
      if (src && (srcCat === 'control' || srcCat === 'script')) {
        modulatedParams[conn.toParam] = src.params.value ?? 0;
      }
    }

    return (
      <div
        key={node.id}
        data-node-id={node.id}
        className={`sense-node${isLive ? ' live' : ''}${isAudioOut ? ' audio-out' : ''}${isFx ? ' fx' : ''}${isControl && !isEnvelope ? ' control' : ''}${isScript ? ' script' : ''}${isEnvelope ? ' envelope' : ''}${hasModOutput ? ' live' : ''}${selectedNodeId === node.id ? ' selected' : ''}${runningScripts.has(node.id) || runningEnvelopes.has(node.id) ? ' running' : ''}`}
        style={{
          left: node.x,
          top: node.y,
          width: nodeWidth,
          '--accent': schema.accent,
        }}
        onMouseDown={(e) => startDrag(e, node.id)}
      >
        {/* Audio input ports */}
        {schema.inputs.map((name, i) => (
          <div
            key={`in-${i}`}
            className={`node-port input${connecting ? ' connectable' : ''}`}
            style={{ top: PORT_SECTION_Y + 11 + i * PORT_SPACING - 6 }}
            onClick={(e) => handlePortClick(e, node.id, 'input', i)}
            title={name}
          >
            <span className="port-label port-label-in">{name}</span>
          </div>
        ))}

        {/* Output ports */}
        {schema.outputs.map((name, i) => (
          <div
            key={`out-${i}`}
            className="node-port output"
            style={{ top: PORT_SECTION_Y + 11 + i * PORT_SPACING - 6 }}
            onClick={(e) => handlePortClick(e, node.id, 'output', i)}
            title={name}
          >
            <span className="port-label port-label-out">{name}</span>
          </div>
        ))}

        {/* Envelope trigger input port (always visible on left edge, centered on canvas) */}
        {isEnvelope && (
          <div
            className={`node-port mod-input trig-port${connecting ? ' connectable' : ''}${'trig' in modulatedParams ? ' modulated' : ''}`}
            style={{ top: HEADER_H + 60 - 4 }}
            onClick={(e) => handleParamPortClick(e, node.id, 'trig')}
            title="trigger input"
          >
            <span className="port-label port-label-in">trig</span>
          </div>
        )}

        {/* Parameter modulation input ports (left edge, aligned with each param row) */}
        {!isControl && !isScript && !isAudioOut && Object.keys(schema.params).map((key, i) => {
          const isModulated = key in modulatedParams;
          const showPort = connecting || isModulated;
          if (!showPort) return null;

          return (
            <div
              key={`mod-${key}`}
              className={`node-port mod-input${connecting ? ' connectable' : ''}${isModulated ? ' modulated' : ''}`}
              style={{ top: PARAM_START_Y + i * PARAM_ROW_H + PARAM_ROW_H / 2 - 4 }}
              onClick={(e) => handleParamPortClick(e, node.id, key)}
              title={`mod: ${schema.params[key].label}`}
            />
          );
        })}

        {/* Header */}
        <div className="node-header">
          <span className="node-type-label">{schema.label}</span>
          <span className="node-desc">{schema.desc}</span>
          {!isAudioOut && (
            <button
              className="node-remove"
              onClick={() => removeNode(node.id)}
              title="Remove"
            >
              &times;
            </button>
          )}
        </div>

        {/* Envelope editor */}
        {isEnvelope && (
          <div className="envelope-body">
            <BreakpointEditor
              breakpoints={node.breakpoints || []}
              curves={node.curves || []}
              onChange={(bps, crvs) => handleBreakpointsChange(node.id, bps, crvs)}
              accentColor={schema.accent}
              getPlaybackProgress={getEnvelopeProgress}
              nodeId={node.id}
            />
            <div className="envelope-controls">
              {runningEnvelopes.has(node.id) ? (
                <button
                  className="env-btn env-btn-stop"
                  onClick={() => handleEnvelopeStop(node.id)}
                >
                  Stop
                </button>
              ) : (
                <button
                  className="env-btn env-btn-trig"
                  onClick={() => handleEnvelopeTrigger(node.id)}
                >
                  Trig
                </button>
              )}
              <label className="env-dur">
                <span className="env-dur-label">dur</span>
                <input
                  type="number"
                  min="0.1"
                  max="60"
                  step="0.1"
                  value={node.duration ?? 2}
                  onChange={(e) =>
                    handleEnvelopeDuration(node.id, parseFloat(e.target.value) || 2)
                  }
                />
                <span className="env-dur-unit">s</span>
              </label>
              <label className="env-loop">
                <input
                  type="checkbox"
                  checked={node.loop || false}
                  onChange={(e) => handleEnvelopeLoop(node.id, e.target.checked)}
                />
                <span className="env-loop-label">loop</span>
              </label>
              <span className="env-out-val">
                {(node.params.value ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Parameters (skip hidden params, skip for envelope) */}
        {!isEnvelope && Object.keys(schema.params).length > 0 && (
          <div className="node-params">
            {Object.entries(schema.params).map(([key, def]) => {
              if (def.hidden) return null;
              const isModulated = key in modulatedParams;
              const displayVal = isModulated ? modulatedParams[key] : (node.params[key] ?? def.val);

              return (
                <div className={`node-param${isModulated ? ' modulated' : ''}`} key={key}>
                  <span className="param-label">{def.label}</span>
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={isModulated ? modulatedParams[key] : (node.params[key] ?? def.val)}
                    disabled={isModulated}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      handleParamChange(node.id, key, v);
                    }}
                  />
                  <span className="param-val">
                    {displayVal >= 100
                      ? Math.round(displayVal)
                      : displayVal.toFixed(
                          def.step < 0.1 ? 2 : def.step < 1 ? 1 : 0
                        )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Script code preview */}
        {isScript && (
          <div
            className="script-code-preview"
            onClick={() => setSelectedNodeId(node.id)}
            title="Click to edit script"
          >
            <code>{(node.code || '').split('\n').slice(0, 3).join('\n') || 'Click to edit…'}</code>
          </div>
        )}

        {/* Live indicator */}
        {(isLive || hasModOutput || runningScripts.has(node.id) || runningEnvelopes.has(node.id)) && <div className="node-live-dot" />}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────
  return (
    <>
      <main className="sense-main">
        {/* Header */}
        <div className="sense-header">
          <h1>Grid View</h1>
          <p>synths &amp; effects · modular signal routing</p>
        </div>

        {/* Toolbar */}
        <div className="sense-toolbar">
          <button
            className={`toolbar-btn boot${booted ? ' booted' : ''}`}
            onClick={handleBoot}
            disabled={booting || booted}
          >
            {booting ? 'Booting…' : booted ? 'Engine Ready' : 'Boot Engine'}
          </button>

          <div className="toolbar-divider" />

          <button
            className={`toolbar-btn panel-toggle${panelOpen ? ' active' : ''}`}
            onClick={() => setPanelOpen((p) => !p)}
            disabled={!booted}
          >
            {panelOpen ? '— Hide Modules' : '+ Add Module'}
          </button>
        </div>

        {/* Canvas */}
        <div
          className={`sense-canvas${connecting ? ' connecting' : ''}`}
          ref={canvasRef}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onClick={handleCanvasClick}
        >
          <svg className="sense-cables" width="2000" height="2000">
            {renderCables()}
          </svg>
          {Object.values(nodes).map((node) => renderNode(node))}

          {Object.keys(nodes).length === 0 && (
            <div className="canvas-empty">
              Boot the engine to begin
            </div>
          )}
          {booted && Object.keys(nodes).length === 1 && (
            <div className="canvas-hint">
              Click "+ Add Module" to open the module panel, then drag cables between ports
            </div>
          )}
        </div>

        {/* Instrument Panel */}
        <div className={`instrument-panel${panelOpen ? ' open' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">Modules</span>
            <button
              className="panel-close"
              onClick={() => setPanelOpen(false)}
            >
              &times;
            </button>
          </div>

          <div className="panel-search">
            <input
              type="text"
              placeholder="Search modules…"
              value={panelSearch}
              onChange={(e) => setPanelSearch(e.target.value)}
              className="panel-search-input"
            />
            {panelSearch && (
              <button
                className="panel-search-clear"
                onClick={() => setPanelSearch('')}
              >
                &times;
              </button>
            )}
          </div>

          <div className="panel-sections">
            {filteredCategories.map((cat) => (
              <div key={cat.id} className="panel-section">
                <button
                  className={`panel-section-header${collapsedSections[cat.id] ? ' collapsed' : ''}`}
                  onClick={() => toggleSection(cat.id)}
                >
                  <span className="section-chevron">
                    {collapsedSections[cat.id] ? '›' : '‹'}
                  </span>
                  <span className="section-label">{cat.label}</span>
                  <span className="section-desc">{cat.desc}</span>
                  <span className="section-count">{cat.types.length}</span>
                </button>

                {!collapsedSections[cat.id] && (
                  <div className="panel-section-items">
                    {cat.types.map((type) => {
                      const schema = NODE_SCHEMA[type];
                      return (
                        <button
                          key={type}
                          className="panel-module-item"
                          style={{ '--item-accent': schema.accent }}
                          onClick={() => handlePanelAdd(type)}
                        >
                          <span
                            className="module-item-dot"
                          />
                          <span className="module-item-info">
                            <span className="module-item-label">{schema.label}</span>
                            <span className="module-item-desc">{schema.desc}</span>
                          </span>
                          <span className="module-item-add">+</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="panel-empty">No modules match "{panelSearch}"</div>
            )}
          </div>
        </div>

        {/* Module Details Panel */}
        {(() => {
          const selNode = selectedNodeId != null ? nodes[selectedNodeId] : null;
          const selSchema = selNode ? NODE_SCHEMA[selNode.type] : null;
          const isOpen = selNode != null;

          return (
            <div className={`module-details-panel${isOpen ? ' open' : ''}`}>
              {selNode && selSchema && (
                <>
                  <div className="details-header">
                    <div className="details-title-row">
                      <span
                        className="details-accent-dot"
                        style={{ background: selSchema.accent }}
                      />
                      <span className="details-title">{selSchema.label}</span>
                      <span className="details-desc">{selSchema.desc}</span>
                    </div>
                    <button
                      className="details-close"
                      onClick={() => setSelectedNodeId(null)}
                    >
                      &times;
                    </button>
                  </div>

                  {selNode.type === 'envelope' ? (
                    <div className="details-body">
                      <div className="details-placeholder">
                        Edit the envelope directly on the canvas.
                        <br /><br />
                        Click to add breakpoints, drag to move them.
                        Double-click a point to remove it.
                        Drag a curve segment up/down to adjust curvature.
                      </div>
                    </div>
                  ) : selSchema.category === 'script' ? (
                    <div className="details-body">
                      <div className="script-editor-section">
                        <div className="script-editor-header">
                          <span className="script-editor-label">Code</span>
                          <span className="script-editor-hint">
                            Write routines &amp; patterns
                          </span>
                        </div>
                        <div className="script-editor-wrap">
                          <CodeMirror
                            value={selNode.code || ''}
                            onChange={(val) => handleCodeChange(selNode.id, val)}
                            theme={oraTheme}
                            extensions={[javascript()]}
                            basicSetup={{
                              lineNumbers: true,
                              highlightActiveLineGutter: true,
                              highlightActiveLine: true,
                              foldGutter: false,
                              dropCursor: true,
                              allowMultipleSelections: false,
                              bracketMatching: true,
                              closeBrackets: true,
                              autocompletion: true,
                              indentOnInput: true,
                              tabSize: 2,
                            }}
                            className="script-editor-cm"
                            placeholder="// Write your script here&#10;// Output values with: out(value)"
                          />
                        </div>
                      </div>

                      {/* Run / Stop controls */}
                      <div className="script-controls">
                        {runningScripts.has(selNode.id) ? (
                          <button
                            className="script-btn script-btn-stop"
                            onClick={() => handleStopScript(selNode.id)}
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            className="script-btn script-btn-run"
                            onClick={() =>
                              handleRunScript(selNode.id, selNode.code || '')
                            }
                          >
                            Run
                          </button>
                        )}
                        <div className="script-output-live">
                          <span className="script-output-live-label">out</span>
                          <span className={`script-output-live-val${runningScripts.has(selNode.id) ? ' active' : ''}`}>
                            {(selNode.params.value ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Console log */}
                      <div className="script-console">
                        <div className="script-console-header">
                          <span className="script-console-label">Console</span>
                          <button
                            className="script-console-clear"
                            onClick={() =>
                              setScriptLogs((prev) => ({
                                ...prev,
                                [selNode.id]: [],
                              }))
                            }
                          >
                            clear
                          </button>
                        </div>
                        <div className="script-console-output">
                          {(scriptLogs[selNode.id] || []).map((line, i) => (
                            <div key={i} className="script-console-line">
                              {line}
                            </div>
                          ))}
                          {(scriptLogs[selNode.id] || []).length === 0 && (
                            <div className="script-console-empty">
                              output will appear here
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="details-body">
                      <div className="details-placeholder">
                        Select a Script module to edit code,
                        or use the node controls directly on the canvas.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Status bar */}
        <div className="sense-status">
          <div className={`status-indicator${booted ? ' on' : ''}`} />
          <span>{status}</span>
        </div>

        {/* Footer */}
        <div className="sense-footer">
          <a href="/">← Ambient</a>
          {' · '}
          <a href="/test">Test Lab</a>
          {' · '}
          Grid View — modular signal routing
        </div>
      </main>
    </>
  );
}
