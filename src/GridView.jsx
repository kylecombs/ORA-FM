import { useState, useRef, useCallback, useEffect } from 'react';
import { GridEngine } from './audio/gridEngine';
import './GridView.css';

// ── Node type definitions ─────────────────────────────────
const NODE_SCHEMA = {
  sine: {
    label: 'Sine',
    desc: 'pure tone',
    accent: '#b89a6a',
    synthDef: 'sonic-pi-beep',
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
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
    inputs: ['in'],
    outputs: ['out'],
    params: {
      note:    { label: 'note', min: 24, max: 96, step: 1,    val: 60 },
      amp:     { label: 'amp',  min: 0,  max: 1,  step: 0.01, val: 0.5 },
      sustain: { label: 'sus',  min: 0.1,max: 9999,step: 1,   val: 9999 },
      release: { label: 'rel',  min: 0,  max: 5,  step: 0.1,  val: 1 },
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

// ── Layout constants ──────────────────────────────────────
const NODE_W = 186;
const HEADER_H = 32;
const PORT_SECTION_Y = HEADER_H + 2;
const PORT_SPACING = 22;

function getPortPos(node, portType, portIndex) {
  const y = node.y + PORT_SECTION_Y + 11 + portIndex * PORT_SPACING;
  if (portType === 'output') {
    return { x: node.x + NODE_W, y };
  }
  return { x: node.x, y };
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
    // Find all nodes whose output connects to this node's input
    connections
      .filter((c) => c.toNodeId === cur)
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

  // ── Engine setup ──────────────────────────────────────
  useEffect(() => {
    engineRef.current = new GridEngine();
    engineRef.current.onStatus = (msg) => setStatus(msg);
    return () => engineRef.current?.stopAll();
  }, []);

  // ── Sync audio with live node set ─────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.booted) return;

    const live = computeLiveNodes(nodes, connections);

    // Find AudioOut node for pan routing
    const outNode = Object.values(nodes).find((n) => n.type === 'audioOut');

    // Start nodes that should be playing
    for (const id of live) {
      const node = nodes[id];
      if (!node) continue;
      const schema = NODE_SCHEMA[node.type];
      if (!schema?.synthDef) continue;

      // Determine pan from connection to AudioOut
      let pan = 0;
      if (outNode) {
        const toL = connections.some(
          (c) => c.toNodeId === outNode.id && c.toPortIndex === 0 && c.fromNodeId === id
        );
        const toR = connections.some(
          (c) => c.toNodeId === outNode.id && c.toPortIndex === 1 && c.fromNodeId === id
        );
        if (toL && !toR) pan = -0.8;
        else if (toR && !toL) pan = 0.8;
        else pan = 0;
      }

      if (!engine.isPlaying(id)) {
        engine.play(id, schema.synthDef, { ...node.params, pan });
      } else {
        engine.setParam(id, 'pan', pan);
      }
    }

    // Stop nodes that should not be playing
    for (const id of Object.keys(nodes)) {
      const nid = parseInt(id);
      if (!live.has(nid) && engine.isPlaying(nid)) {
        engine.stop(nid);
      }
    }
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
  const addNode = useCallback(
    (type) => {
      const id = nextId.current++;
      const schema = NODE_SCHEMA[type];
      const params = {};
      for (const [k, def] of Object.entries(schema.params)) {
        params[k] = def.val;
      }
      const count = Object.keys(nodes).length;
      const col = (count - 1) % 3; // -1 because AudioOut is already there
      const row = Math.floor((count - 1) / 3);
      setNodes((prev) => ({
        ...prev,
        [id]: {
          id,
          type,
          x: 40 + col * 210,
          y: 40 + row * 220,
          params,
        },
      }));
    },
    [nodes]
  );

  // ── Remove node ───────────────────────────────────────
  const removeNode = useCallback(
    (id) => {
      engineRef.current?.stop(id);
      setNodes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConnections((prev) =>
        prev.filter((c) => c.fromNodeId !== id && c.toNodeId !== id)
      );
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

  // ── Node dragging ─────────────────────────────────────
  const startDrag = useCallback((e, nodeId) => {
    if (e.target.closest('.node-port') || e.target.closest('button') || e.target.closest('input')) return;
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
    if (dragId != null) setDragId(null);
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

  // ── Render helpers ────────────────────────────────────
  const renderCables = () => {
    const paths = [];

    // Existing connections
    for (const conn of connections) {
      const fromNode = nodes[conn.fromNodeId];
      const toNode = nodes[conn.toNodeId];
      if (!fromNode || !toNode) continue;

      const from = getPortPos(fromNode, 'output', conn.fromPortIndex);
      const to = getPortPos(toNode, 'input', conn.toPortIndex);
      const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';

      paths.push(
        <path
          key={conn.id}
          d={cablePath(from.x, from.y, to.x, to.y)}
          stroke={accent}
          strokeWidth={2.5}
          fill="none"
          opacity={0.7}
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

    return (
      <div
        key={node.id}
        data-node-id={node.id}
        className={`sense-node${isLive ? ' live' : ''}${isAudioOut ? ' audio-out' : ''}`}
        style={{
          left: node.x,
          top: node.y,
          '--accent': schema.accent,
        }}
        onMouseDown={(e) => startDrag(e, node.id)}
      >
        {/* Input ports */}
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

        {/* Port row */}
        <div className="node-port-row">
          {schema.inputs.length > 0 && (
            <span className="port-side left">
              {schema.inputs.map((name) => (
                <span key={name} className="port-name">{name}</span>
              ))}
            </span>
          )}
          {schema.outputs.length > 0 && (
            <span className="port-side right">
              {schema.outputs.map((name) => (
                <span key={name} className="port-name">{name}</span>
              ))}
            </span>
          )}
        </div>

        {/* Parameters */}
        {Object.keys(schema.params).length > 0 && (
          <div className="node-params">
            {Object.entries(schema.params).map(([key, def]) => (
              <div className="node-param" key={key}>
                <span className="param-label">{def.label}</span>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={node.params[key] ?? def.val}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleParamChange(node.id, key, v);
                  }}
                />
                <span className="param-val">
                  {(node.params[key] ?? def.val) >= 100
                    ? Math.round(node.params[key] ?? def.val)
                    : (node.params[key] ?? def.val).toFixed(
                        def.step < 0.1 ? 2 : def.step < 1 ? 1 : 0
                      )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Live indicator */}
        {isLive && <div className="node-live-dot" />}
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

          {Object.entries(NODE_SCHEMA)
            .filter(([type]) => type !== 'audioOut')
            .map(([type, schema]) => (
              <button
                key={type}
                className="toolbar-btn add-btn"
                style={{ '--btn-accent': schema.accent }}
                onClick={() => addNode(type)}
                disabled={!booted}
              >
                <span className="add-plus">+</span> {schema.label}
              </button>
            ))}
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
              Add modules from the toolbar, then drag cables from output ports to the Output node
            </div>
          )}
        </div>

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
