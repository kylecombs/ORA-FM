import { useState, useRef, useCallback, useEffect } from 'react';
import { GridEngine } from '../../audio/gridEngine';
import { ScriptRunner } from '../../audio/scriptRunner';
import { EnvelopeRunner } from '../../audio/envelopeRunner';
import { initMidi, getInputDevices, onDeviceChange } from '../../audio/midiListener';
import { NODE_SCHEMA } from '../nodeSchema';

export function useAudioEngine({
  nodesRef,
  setNodes,
  setConnections,
  scopeBuffersRef,
  setPrintLogs,
  setRunningScripts,
  setRunningEnvelopes,
  setRunningPulsers,
  setRunningSequencers,
  setScriptLogs,
  setMidiDevices,
  midiListenersRef,
  pulserRunnerRef,
  sequencerRunnerRef,
}) {
  const engineRef = useRef(null);
  const scriptRunnerRef = useRef(null);
  const envelopeRunnerRef = useRef(null);

  const [status, setStatus] = useState('Boot the engine to begin');
  const [booted, setBooted] = useState(false);
  const [booting, setBooting] = useState(false);

  // ── Engine setup ──────────────────────────────────────
  useEffect(() => {
    engineRef.current = new GridEngine();
    engineRef.current.onStatus = (msg) => setStatus(msg);

    // Handle print module messages
    engineRef.current.onPrint = (nodeId, value) => {
      const node = nodesRef.current[nodeId];
      if (!node || node.type !== 'print') return;

      const prefix = node.printPrefix ?? 'print';
      const color = node.printColor || '#e07050';

      setPrintLogs((prev) => {
        const entry = {
          id: Date.now() + Math.random(),
          nodeId,
          prefix,
          color,
          value: typeof value === 'number' ? value.toFixed(4) : String(value),
          time: new Date().toLocaleTimeString(),
        };
        // Keep last 200 entries
        return [...prev, entry].slice(-200);
      });
    };

    // Handle scope module waveform snapshots (full buffer from /b_getn)
    engineRef.current.onScope = (nodeId, samples) => {
      scopeBuffersRef.current.set(nodeId, samples);
    };

    scriptRunnerRef.current = new ScriptRunner({
      onOutput: (nodeId, outputIndex, value) => {
        setNodes((prev) => {
          const node = prev[nodeId];
          if (!node) return prev;
          const paramKey = `out_${outputIndex}`;
          return {
            ...prev,
            [nodeId]: {
              ...node,
              params: {
                ...node.params,
                [paramKey]: value,
                // Keep 'value' in sync with output 0 for backward compat
                ...(outputIndex === 0 ? { value } : {}),
              },
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
      onSetOutputs: (nodeId, count) => {
        setNodes((prev) => {
          const node = prev[nodeId];
          if (!node) return prev;
          return {
            ...prev,
            [nodeId]: { ...node, numOutputs: count },
          };
        });
        // Remove connections from ports that no longer exist
        setConnections((prev) =>
          prev.filter((c) => !(c.fromNodeId === nodeId && c.fromPortIndex >= count))
        );
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

    // Initialize MIDI access
    initMidi().then((ok) => {
      if (ok) setMidiDevices(getInputDevices());
    });
    const unsubDevices = onDeviceChange((devices) => setMidiDevices(devices));

    return () => {
      engineRef.current?.stopAll();
      scriptRunnerRef.current?.stopAll();
      envelopeRunnerRef.current?.stopAll();
      // Stop all MIDI listeners
      for (const listener of midiListenersRef.current.values()) {
        listener.stop();
      }
      midiListenersRef.current.clear();
      unsubDevices();
    };
  }, []);

  // ── Boot engine ───────────────────────────────────────
  const nextId = useRef(1);

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
      node.code = '// setOutputs(n)          — declare n output ports\n// out(value)             — send to output 0\n// out(index, value)      — send to output <index>\n';
      node.numOutputs = 1;
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
    if (type === 'bang') {
      node.bangSize = 60;
    }
    if (type === 'midi_in') {
      node.midiMode = 'cc';       // 'cc' or 'note'
      node.midiChannel = 0;       // 0 = omni, 1-16 = specific
      node.midiCcNumber = 1;      // CC number (0-127)
      node.midiDeviceId = null;   // null = any device
      node.midiLastNote = null;   // last received note number
      node.midiGate = 0;          // note on/off state
    }
    if (type === 'print') {
      node.printPrefix = 'print';
      node.printColor = '#e07050';
    }
    if (type === 'sequencer') {
      node.seqCurrentStep = 0;
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
      engineRef.current?.stopScope(id);
      scriptRunnerRef.current?.stop(id);
      envelopeRunnerRef.current?.stop(id);
      pulserRunnerRef?.current?.stop(id);
      sequencerRunnerRef?.current?.stop(id);
      scopeBuffersRef.current.delete(id);
      // Stop MIDI listener if this was a midi_in node
      const midiListener = midiListenersRef.current.get(id);
      if (midiListener) {
        midiListener.stop();
        midiListenersRef.current.delete(id);
      }
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
      setRunningPulsers((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRunningSequencers((prev) => {
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
    },
    []
  );

  return {
    engineRef,
    scriptRunnerRef,
    envelopeRunnerRef,
    nextId,
    status,
    booted,
    booting,
    handleBoot,
    addNode,
    removeNode,
    setStatus,
  };
}
