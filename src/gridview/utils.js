import { NODE_SCHEMA } from './nodeSchema';
import { NODE_W, HEADER_H, PORT_SECTION_Y, PORT_SPACING, PARAM_START_Y, PARAM_ROW_H } from './constants';

// ── Frequency quantisation (12-TET, A4 = 440 Hz) ─────────
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function quantizeFreq(hz) {
  if (hz <= 0) return hz;
  const semitone = 12 * Math.log2(hz / 440);
  return 440 * Math.pow(2, Math.round(semitone) / 12);
}

export function freqToNoteName(hz) {
  if (hz <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

// ── Node geometry helpers ─────────────────────────────────
export function getNodeWidth(node) {
  if (node.type === 'bang') return (node.bangSize || 60) + 16;
  if (node.scriptWidth != null) return node.scriptWidth;
  return NODE_SCHEMA[node.type]?.width || NODE_W;
}

// Script modules can dynamically set their number of outputs via setOutputs(n).
// This helper returns the effective outputs array for rendering and port positioning.
export function getNodeOutputs(node) {
  const schema = NODE_SCHEMA[node.type];
  if (!schema) return [];
  if (schema.category === 'script' && node.numOutputs > 1) {
    return Array.from({ length: node.numOutputs }, (_, i) => `out ${i}`);
  }
  return schema.outputs;
}

export function getPortPos(node, portType, portIndex) {
  if (node.type === 'bang') {
    const size = node.bangSize || 60;
    const centerY = node.y + HEADER_H + 4 + size / 2;
    if (portType === 'output') {
      return { x: node.x + size + 16, y: centerY };
    }
    return { x: node.x, y: centerY };
  }
  const y = node.y + PORT_SECTION_Y + 11 + portIndex * PORT_SPACING;
  if (portType === 'output') {
    return { x: node.x + getNodeWidth(node), y };
  }
  return { x: node.x, y };
}

// ── Parameter modulation port positions ──────────────────
export function getParamPortPos(node, schema, paramKey) {
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
export function computeLiveNodes(nodes, connections) {
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
export function cablePath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ── Pan value for AudioOut port ───────────────────────────
export function panForPort(portIndex) {
  // 0 = L → pan -0.8,  1 = R → pan 0.8
  return portIndex === 0 ? -0.8 : 0.8;
}
