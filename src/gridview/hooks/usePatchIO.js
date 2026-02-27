import { useRef, useCallback } from 'react';
import { NODE_SCHEMA } from '../nodeSchema';

export function usePatchIO({
  nodes,
  connections,
  nextId,
  connId,
  engineRef,
  scriptRunnerRef,
  envelopeRunnerRef,
  midiListenersRef,
  scopeBuffersRef,
  setNodes,
  setConnections,
  setRunningScripts,
  setRunningEnvelopes,
  setPrintLogs,
  setSelectedNodeId,
  setMidiActivity,
  setStatus,
  handleLoadBuiltinSample,
}) {
  const fileInputRef = useRef(null);

  // ── Save patch to JSON file ─────────────────────────────
  const handleSavePatch = useCallback(() => {
    const patch = {
      name: 'Untitled Patch',
      version: 1,
      createdAt: new Date().toISOString(),
      nextId: nextId.current,
      connId: connId.current,
      nodes: Object.values(nodes).map((node) => {
        const entry = {
          id: node.id,
          type: node.type,
          x: Math.round(node.x),
          y: Math.round(node.y),
          params: { ...node.params },
        };
        if (node.code != null) entry.code = node.code;
        if (node.numOutputs != null && node.numOutputs > 1) entry.numOutputs = node.numOutputs;
        if (node.scriptWidth != null) entry.scriptWidth = node.scriptWidth;
        if (node.quantize) entry.quantize = true;
        if (node.breakpoints) entry.breakpoints = node.breakpoints;
        if (node.curves) entry.curves = node.curves;
        if (node.duration != null) entry.duration = node.duration;
        if (node.loop) entry.loop = true;
        if (node.printPrefix != null) entry.printPrefix = node.printPrefix;
        if (node.printColor != null) entry.printColor = node.printColor;
        if (node.bangSize != null) entry.bangSize = node.bangSize;
        if (node.midiMode != null) entry.midiMode = node.midiMode;
        if (node.midiChannel != null) entry.midiChannel = node.midiChannel;
        if (node.midiCcNumber != null) entry.midiCcNumber = node.midiCcNumber;
        if (node.midiDeviceId != null) entry.midiDeviceId = node.midiDeviceId;
        if (node.sampleName != null) entry.sampleName = node.sampleName;
        return entry;
      }),
      connections: connections.map((c) => {
        const entry = {
          id: c.id,
          from: c.fromNodeId,
          fromPort: c.fromPortIndex,
          to: c.toNodeId,
          toPort: c.toPortIndex,
        };
        if (c.toParam) entry.toParam = c.toParam;
        if (c.isAudioRate) entry.isAudioRate = true;
        return entry;
      }),
    };

    const json = JSON.stringify(patch, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patch.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Patch saved');
  }, [nodes, connections]);

  // ── Load patch from JSON file ───────────────────────────
  const handleLoadPatch = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const patch = JSON.parse(ev.target.result);

        // Validate basic structure
        if (!patch.nodes || !patch.connections) {
          setStatus('Error: Invalid patch file — missing nodes or connections');
          return;
        }

        // Stop all running audio, scripts, envelopes
        const engine = engineRef.current;
        if (engine) {
          for (const id of Object.keys(nodes)) {
            engine.stop(Number(id));
          }
        }
        scriptRunnerRef.current?.stopAll?.();
        envelopeRunnerRef.current?.stopAll?.();
        // Stop all MIDI listeners
        for (const listener of midiListenersRef.current.values()) {
          listener.stop();
        }
        midiListenersRef.current.clear();
        setRunningScripts(new Set());
        setRunningEnvelopes(new Set());
        setPrintLogs([]);
        setSelectedNodeId(null);
        setMidiActivity({});
        scopeBuffersRef.current.clear();

        // Restore nodes
        const restoredNodes = {};
        for (const n of patch.nodes) {
          if (!NODE_SCHEMA[n.type]) {
            setStatus(`Warning: Unknown node type "${n.type}" — skipped`);
            continue;
          }
          restoredNodes[n.id] = {
            id: n.id,
            type: n.type,
            x: n.x ?? 0,
            y: n.y ?? 0,
            params: { ...n.params },
          };
          if (n.code != null) restoredNodes[n.id].code = n.code;
          if (n.numOutputs != null) restoredNodes[n.id].numOutputs = n.numOutputs;
          if (n.scriptWidth != null) restoredNodes[n.id].scriptWidth = n.scriptWidth;
          if (n.quantize) restoredNodes[n.id].quantize = true;
          if (n.breakpoints) restoredNodes[n.id].breakpoints = n.breakpoints;
          if (n.curves) restoredNodes[n.id].curves = n.curves;
          if (n.duration != null) restoredNodes[n.id].duration = n.duration;
          if (n.loop) restoredNodes[n.id].loop = true;
          if (n.printPrefix != null) restoredNodes[n.id].printPrefix = n.printPrefix;
          if (n.printColor != null) restoredNodes[n.id].printColor = n.printColor;
          if (n.bangSize != null) restoredNodes[n.id].bangSize = n.bangSize;
          if (n.midiMode != null) restoredNodes[n.id].midiMode = n.midiMode;
          if (n.midiChannel != null) restoredNodes[n.id].midiChannel = n.midiChannel;
          if (n.midiCcNumber != null) restoredNodes[n.id].midiCcNumber = n.midiCcNumber;
          if (n.midiDeviceId != null) restoredNodes[n.id].midiDeviceId = n.midiDeviceId;
          if (n.sampleName != null) restoredNodes[n.id].sampleName = n.sampleName;
        }

        // Restore connections
        const restoredConns = patch.connections.map((c) => ({
          id: c.id,
          fromNodeId: c.from,
          fromPortIndex: c.fromPort,
          toNodeId: c.to,
          toPortIndex: c.toPort,
          toParam: c.toParam || null,
          isAudioRate: c.isAudioRate || false,
        }));

        // Restore ID counters
        if (patch.nextId) nextId.current = patch.nextId;
        if (patch.connId) connId.current = patch.connId;

        setNodes(restoredNodes);
        setConnections(restoredConns);
        setStatus(`Loaded: ${patch.name || 'patch'}`);

        // Re-load samples for sample_player nodes (built-in samples only)
        if (handleLoadBuiltinSample) {
          for (const n of Object.values(restoredNodes)) {
            if (n.type === 'sample_player' && n.sampleName) {
              handleLoadBuiltinSample(n.id, n.sampleName);
            }
          }
        }
      } catch (err) {
        setStatus(`Error loading patch: ${err.message}`);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be loaded again
    e.target.value = '';
  }, [nodes]);

  return { fileInputRef, handleSavePatch, handleLoadPatch, handleFileSelect };
}
