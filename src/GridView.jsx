import { useState, useRef, useCallback, useEffect } from 'react';
import { NODE_SCHEMA } from './gridview/nodeSchema';
import { SCOPE_BUFFER_SIZE } from './gridview/constants';
import { quantizeFreq, getPortPos, getParamPortPos, computeLiveNodes, cablePath, getNodeWidth } from './gridview/utils';
import { useAudioEngine } from './gridview/hooks/useAudioEngine';
import { useAudioRouting } from './gridview/hooks/useAudioRouting';
import { useMidi } from './gridview/hooks/useMidi';
import { useNodeDrag } from './gridview/hooks/useNodeDrag';
import { useRecording } from './gridview/hooks/useRecording';
import { usePatchIO } from './gridview/hooks/usePatchIO';
import { usePulser } from './gridview/hooks/usePulser';
import { useSequencer } from './gridview/hooks/useSequencer';
import { useSamplePlayer } from './gridview/hooks/useSamplePlayer';
import { useDaphne } from './gridview/hooks/useDaphne';
import Toolbar from './gridview/components/Toolbar';
import InstrumentPanel from './gridview/components/InstrumentPanel';
import ModuleDetailsPanel from './gridview/components/ModuleDetailsPanel';
import PrintConsole from './gridview/components/PrintConsole';
import DaphnePanel from './gridview/components/DaphnePanel';
import NodeRenderer from './gridview/components/NodeRenderer';
import './GridView.css';

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function GridView() {
  const canvasRef = useRef(null);
  const connId = useRef(1);

  const [nodes, setNodes] = useState({});
  const [connections, setConnections] = useState([]);

  // Connection state
  const [connecting, setConnecting] = useState(null); // { fromNodeId, fromPortIndex }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Module details panel state
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Script runtime state
  const [runningScripts, setRunningScripts] = useState(new Set());
  const [scriptLogs, setScriptLogs] = useState({}); // nodeId → string[]

  // Envelope runtime state
  const [runningEnvelopes, setRunningEnvelopes] = useState(new Set());

  // Pulser runtime state
  const [runningPulsers, setRunningPulsers] = useState(new Set());

  // Sequencer runtime state
  const [runningSequencers, setRunningSequencers] = useState(new Set());

  // Instrument panel state
  const [panelOpen, setPanelOpen] = useState(false);

  // Print console state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [printLogs, setPrintLogs] = useState([]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const printConsoleRef = useRef(null);

  // MIDI state
  const midiListenersRef = useRef(new Map());
  const [midiDevices, setMidiDevices] = useState([]);
  const [midiActivity, setMidiActivity] = useState({});

  // Scope state
  const scopeBuffersRef = useRef(new Map());

  // Auto-scroll print console when new logs arrive
  useEffect(() => {
    if (printConsoleRef.current && consoleOpen) {
      printConsoleRef.current.scrollTop = printConsoleRef.current.scrollHeight;
    }
  }, [printLogs, consoleOpen]);

  // ── Pulser hook ──────────────────────────────────────────
  const { pulserRunnerRef } = usePulser({
    nodes,
    connections,
    setNodes,
    runningPulsers,
    setRunningPulsers,
  });

  // ── Sequencer hook ─────────────────────────────────────
  const { sequencerRunnerRef } = useSequencer({
    nodes,
    connections,
    setNodes,
    runningSequencers,
    setRunningSequencers,
  });

  // ── Audio engine hook ──────────────────────────────────
  const {
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
  } = useAudioEngine({
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
  });

  // ── Audio routing hook ─────────────────────────────────
  const { modAmpScaleRef } = useAudioRouting({
    nodes,
    connections,
    engineRef,
    scopeBuffersRef,
  });

  // ── MIDI hook ──────────────────────────────────────────
  useMidi({
    nodes,
    setNodes,
    setMidiActivity,
    midiListenersRef,
  });

  // ── Node drag hook ─────────────────────────────────────
  const { dragId, startDrag, onCanvasMouseMove, onCanvasMouseUp } = useNodeDrag({
    canvasRef,
    setNodes,
    setSelectedNodeId,
    connecting,
    setMousePos,
  });

  // ── Recording hook ─────────────────────────────────────
  const { recording, recordingTime, handleToggleRecording } = useRecording({
    engineRef,
    setStatus,
  });

  // ── Sample player hook ────────────────────────────────
  const {
    sampleData,
    samplePlayheads,
    sampleFileInputRef,
    sampleLoadTargetRef,
    handleSampleFileSelect,
    handleLoadBuiltinSample,
    handleSampleRegionChange,
    handleSampleTrigger,
    handleSampleLoopToggle,
    cleanupSamplePlayer,
  } = useSamplePlayer({
    engineRef,
    setNodes,
    setStatus,
  });

  // ── Patch I/O hook ─────────────────────────────────────
  const { fileInputRef, handleSavePatch, handleLoadPatch, handleFileSelect, applyPatchData } = usePatchIO({
    nodes,
    connections,
    nextId,
    connId,
    engineRef,
    scriptRunnerRef,
    envelopeRunnerRef,
    pulserRunnerRef,
    sequencerRunnerRef,
    midiListenersRef,
    scopeBuffersRef,
    setNodes,
    setConnections,
    setRunningScripts,
    setRunningEnvelopes,
    setRunningPulsers,
    setRunningSequencers,
    setPrintLogs,
    setSelectedNodeId,
    setMidiActivity,
    setStatus,
    handleLoadBuiltinSample,
  });

  // ── Daphne AI assistant hook ──────────────────────────
  const daphne = useDaphne({ applyPatchData });

  // ── Param change ──────────────────────────────────────
  const handleParamChange = useCallback((nodeId, param, value) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      const sent = (param === 'freq' && node?.quantize) ? quantizeFreq(value) : value;
      const actualSent = (param === 'amp' && modAmpScaleRef.current[nodeId])
        ? sent * modAmpScaleRef.current[nodeId]
        : sent;
      engineRef.current?.setParam(nodeId, param, actualSent);
      return {
        ...prev,
        [nodeId]: {
          ...node,
          params: { ...node.params, [param]: value },
        },
      };
    });
  }, []);

  // ── Script code change ────────────────────────────────
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

  // ── Quantize toggle ───────────────────────────────────
  const handleQuantizeToggle = useCallback((nodeId, enabled) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      const updated = { ...node, quantize: enabled };
      if (node.params.freq != null) {
        const sent = enabled ? quantizeFreq(node.params.freq) : node.params.freq;
        engineRef.current?.setParam(nodeId, 'freq', sent);
      }
      return { ...prev, [nodeId]: updated };
    });
  }, []);

  // ── Print module handlers ─────────────────────────────
  const handlePrintPrefix = useCallback((nodeId, prefix) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], printPrefix: prefix },
    }));
  }, []);

  const handlePrintColor = useCallback((nodeId, color) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], printColor: color },
    }));
  }, []);

  const clearPrintLogs = useCallback(() => {
    setPrintLogs([]);
  }, []);

  // ── Envelope handlers ─────────────────────────────────
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

  // ── Bang handler ──────────────────────────────────────
  const bangTimeouts = useRef({});
  const handleBang = useCallback((nodeId) => {
    if (bangTimeouts.current[nodeId]) {
      clearTimeout(bangTimeouts.current[nodeId]);
      setNodes((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 0 } },
      }));
    }
    Promise.resolve().then(() => {
      setNodes((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 1 } },
      }));
      bangTimeouts.current[nodeId] = setTimeout(() => {
        setNodes((prev) => ({
          ...prev,
          [nodeId]: { ...prev[nodeId], params: { ...prev[nodeId].params, value: 0 } },
        }));
        delete bangTimeouts.current[nodeId];
      }, 80);
    });
  }, []);

  // ── Bang resize ───────────────────────────────────────
  const bangResizing = useRef(null);
  const handleBangResizeStart = useCallback((e, nodeId, currentSize) => {
    e.stopPropagation();
    e.preventDefault();
    bangResizing.current = { nodeId, startY: e.clientY, startSize: currentSize };

    const onMove = (me) => {
      const info = bangResizing.current;
      if (!info) return;
      const delta = me.clientY - info.startY;
      const newSize = Math.max(36, Math.min(200, info.startSize + delta));
      setNodes((prev) => ({
        ...prev,
        [info.nodeId]: { ...prev[info.nodeId], bangSize: newSize },
      }));
    };
    const onUp = () => {
      bangResizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Script module resize ──────────────────────────────
  const scriptResizing = useRef(null);
  const handleScriptResizeStart = useCallback((e, nodeId, currentWidth) => {
    e.stopPropagation();
    e.preventDefault();
    scriptResizing.current = { nodeId, startX: e.clientX, startWidth: currentWidth };

    const onMove = (me) => {
      const info = scriptResizing.current;
      if (!info) return;
      const delta = me.clientX - info.startX;
      const newWidth = Math.max(140, Math.min(400, info.startWidth + delta));
      setNodes((prev) => ({
        ...prev,
        [info.nodeId]: { ...prev[info.nodeId], scriptWidth: newWidth },
      }));
    };
    const onUp = () => {
      scriptResizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── External trigger detection (rising-edge on modulated trig param) ──
  const prevTrigVals = useRef({});

  useEffect(() => {
    const prev = prevTrigVals.current;

    for (const conn of connections) {
      if (conn.toParam !== 'trig') continue;

      const targetNode = nodes[conn.toNodeId];
      if (!targetNode || (targetNode.type !== 'envelope' && targetNode.type !== 'sample_player')) continue;

      const sourceNode = nodes[conn.fromNodeId];
      if (!sourceNode) continue;

      const srcSchema = NODE_SCHEMA[sourceNode.type];
      if (srcSchema?.category !== 'control' && srcSchema?.category !== 'script') continue;

      const value = srcSchema?.category === 'script'
        ? (sourceNode.params[`out_${conn.fromPortIndex}`] ?? sourceNode.params.value ?? 0)
        : (sourceNode.params.value ?? 0);
      const prevValue = prev[conn.toNodeId] ?? 0;

      if (value >= 0.5 && prevValue < 0.5) {
        if (targetNode.type === 'envelope') {
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
        } else if (targetNode.type === 'sample_player') {
          // Trigger sample playback
          handleSampleTrigger(conn.toNodeId);
        }
      }

      prev[conn.toNodeId] = value;
    }
  }, [nodes, connections, handleSampleTrigger]);

  // ── Param port click (modulation connect/disconnect) ──
  const handleParamPortClick = useCallback(
    (e, nodeId, paramKey) => {
      e.stopPropagation();

      if (connecting) {
        if (connecting.fromNodeId === nodeId) {
          setConnecting(null);
          return;
        }

        const sourceNode = nodes[connecting.fromNodeId];
        const targetNode = nodes[nodeId];
        const sourceSchema = NODE_SCHEMA[sourceNode?.type];
        const targetSchema = NODE_SCHEMA[targetNode?.type];
        const sourceIsAudio = sourceSchema?.outputs?.length > 0 &&
                              sourceSchema?.category !== 'control' &&
                              sourceSchema?.category !== 'script';
        const targetHasModInput = targetSchema?.modInputs?.includes(paramKey);
        const isAudioRate = sourceIsAudio && targetHasModInput;

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
              isAudioRate,
            },
          ];
        });
        setConnecting(null);
      } else {
        setConnections((prev) =>
          prev.filter(
            (c) => !(c.toNodeId === nodeId && c.toParam === paramKey)
          )
        );
      }
    },
    [connecting, nodes]
  );

  // ── Port click (connect/disconnect) ───────────────────
  const handlePortClick = useCallback(
    (e, nodeId, portType, portIndex) => {
      e.stopPropagation();

      if (connecting) {
        if (portType === 'input') {
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
        if (portType === 'output') {
          setConnecting({ fromNodeId: nodeId, fromPortIndex: portIndex });
          const node = nodes[nodeId];
          if (node) {
            const pos = getPortPos(node, 'output', portIndex);
            setMousePos(pos);
          }
        } else if (portType === 'input') {
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

  // ── Render cables ─────────────────────────────────────
  const renderCables = () => {
    const paths = [];

    for (const conn of connections) {
      const fromNode = nodes[conn.fromNodeId];
      const toNode = nodes[conn.toNodeId];
      if (!fromNode || !toNode) continue;

      const from = getPortPos(fromNode, 'output', conn.fromPortIndex);
      const toSchema = NODE_SCHEMA[toNode.type];
      const to = conn.toParam
        ? getParamPortPos(toNode, toSchema, conn.toParam)
        : getPortPos(toNode, 'input', conn.toPortIndex);

      const accent = NODE_SCHEMA[fromNode.type]?.accent || '#7a7570';
      const isMod = !!conn.toParam;
      const isAudioRateMod = conn.isAudioRate && isMod;

      paths.push(
        <path
          key={conn.id}
          d={cablePath(from.x, from.y, to.x, to.y)}
          stroke={accent}
          strokeWidth={isAudioRateMod ? 2 : isMod ? 1.5 : 2.5}
          fill="none"
          opacity={isAudioRateMod ? 0.65 : isMod ? 0.6 : 0.7}
          strokeDasharray={isMod && !isAudioRateMod ? '4 3' : undefined}
          className={`sense-cable${isAudioRateMod ? ' audio-rate-mod' : ''}`}
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

  // ── Compute live nodes for rendering ──────────────────
  const liveNodes = computeLiveNodes(nodes, connections);

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
        <Toolbar
          booted={booted}
          booting={booting}
          panelOpen={panelOpen}
          consoleOpen={consoleOpen}
          daphneOpen={daphne.daphneOpen}
          recording={recording}
          recordingTime={recordingTime}
          fileInputRef={fileInputRef}
          handleBoot={handleBoot}
          setPanelOpen={setPanelOpen}
          setConsoleOpen={setConsoleOpen}
          setDaphneOpen={daphne.setDaphneOpen}
          handleSavePatch={handleSavePatch}
          handleLoadPatch={handleLoadPatch}
          handleFileSelect={handleFileSelect}
          handleToggleRecording={handleToggleRecording}
        />

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
          {Object.values(nodes).map((node) => (
            <NodeRenderer
              key={node.id}
              node={node}
              nodes={nodes}
              connections={connections}
              connecting={connecting}
              selectedNodeId={selectedNodeId}
              runningScripts={runningScripts}
              runningEnvelopes={runningEnvelopes}
              runningPulsers={runningPulsers}
              runningSequencers={runningSequencers}
              midiActivity={midiActivity}
              midiListenersRef={midiListenersRef}
              scopeBuffersRef={scopeBuffersRef}
              scopeBufferSize={SCOPE_BUFFER_SIZE}
              isLive={liveNodes.has(node.id)}
              startDrag={startDrag}
              handlePortClick={handlePortClick}
              handleParamPortClick={handleParamPortClick}
              handleParamChange={handleParamChange}
              handleBang={handleBang}
              handleBangResizeStart={handleBangResizeStart}
              handleScriptResizeStart={handleScriptResizeStart}
              handleBreakpointsChange={handleBreakpointsChange}
              handleEnvelopeTrigger={handleEnvelopeTrigger}
              handleEnvelopeStop={handleEnvelopeStop}
              handleEnvelopeDuration={handleEnvelopeDuration}
              handleEnvelopeLoop={handleEnvelopeLoop}
              getEnvelopeProgress={getEnvelopeProgress}
              removeNode={removeNode}
              setSelectedNodeId={setSelectedNodeId}
              sampleData={sampleData}
              samplePlayheads={samplePlayheads}
              sampleFileInputRef={sampleFileInputRef}
              sampleLoadTargetRef={sampleLoadTargetRef}
              handleSampleRegionChange={handleSampleRegionChange}
              handleSampleTrigger={handleSampleTrigger}
              handleSampleLoopToggle={handleSampleLoopToggle}
            />
          ))}

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
        <InstrumentPanel
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          onAddModule={addNode}
        />

        {/* Module Details Panel */}
        <ModuleDetailsPanel
          selectedNodeId={selectedNodeId}
          nodes={nodes}
          setNodes={setNodes}
          setSelectedNodeId={setSelectedNodeId}
          runningScripts={runningScripts}
          runningEnvelopes={runningEnvelopes}
          scriptLogs={scriptLogs}
          setScriptLogs={setScriptLogs}
          midiDevices={midiDevices}
          handleCodeChange={handleCodeChange}
          handleRunScript={handleRunScript}
          handleStopScript={handleStopScript}
          handleQuantizeToggle={handleQuantizeToggle}
          handlePrintPrefix={handlePrintPrefix}
          handlePrintColor={handlePrintColor}
          sampleData={sampleData}
          sampleFileInputRef={sampleFileInputRef}
          sampleLoadTargetRef={sampleLoadTargetRef}
          handleLoadBuiltinSample={handleLoadBuiltinSample}
        />

        {/* Daphne AI Panel */}
        <DaphnePanel
          isOpen={daphne.daphneOpen}
          onClose={() => daphne.setDaphneOpen(false)}
          messages={daphne.messages}
          input={daphne.input}
          setInput={daphne.setInput}
          loading={daphne.loading}
          error={daphne.error}
          messagesEndRef={daphne.messagesEndRef}
          inputRef={daphne.inputRef}
          sendMessage={daphne.sendMessage}
          handleKeyDown={daphne.handleKeyDown}
          handleLoadPatch={daphne.handleLoadPatch}
          clearChat={daphne.clearChat}
        />

        {/* Print Console Panel */}
        <PrintConsole
          consoleOpen={consoleOpen}
          setConsoleOpen={setConsoleOpen}
          printLogs={printLogs}
          clearPrintLogs={clearPrintLogs}
          printConsoleRef={printConsoleRef}
        />

        {/* Hidden file input for sample loading */}
        <input
          ref={sampleFileInputRef}
          type="file"
          accept="audio/*,.flac,.wav,.ogg,.mp3,.aif,.aiff"
          style={{ display: 'none' }}
          onChange={handleSampleFileSelect}
        />

        {/* Status bar */}
        <div className="sense-status">
          <div className={`status-indicator${booted ? ' on' : ''}`} />
          <span>{status}</span>
        </div>

        {/* Footer */}
        <div className="sense-footer">
          <a href="/ambient">Ambient</a>
          {' · '}
          <a href="/test">Test Lab</a>
          {' · '}
          Grid View — modular signal routing
        </div>
      </main>
    </>
  );
}
