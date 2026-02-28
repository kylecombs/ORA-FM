import { NODE_SCHEMA } from '../nodeSchema';
import { HEADER_H, PORT_SECTION_Y, PORT_SPACING, PARAM_START_Y, PARAM_ROW_H } from '../constants';
import { getNodeWidth, getNodeOutputs, freqToNoteName } from '../utils';
import ScopeCanvas from '../ScopeCanvas';
import BreakpointEditor from '../../BreakpointEditor';
import WaveformDisplay from './WaveformDisplay';

export default function NodeRenderer({
  node,
  nodes,
  connections,
  connecting,
  selectedNodeId,
  runningScripts,
  runningEnvelopes,
  runningPulsers,
  runningSequencers,
  midiActivity,
  midiListenersRef,
  scopeBuffersRef,
  scopeBufferSize,
  isLive,
  startDrag,
  handlePortClick,
  handleParamPortClick,
  handleParamChange,
  handleBang,
  handleBangResizeStart,
  handleScriptResizeStart,
  handleBreakpointsChange,
  handleEnvelopeTrigger,
  handleEnvelopeStop,
  handleEnvelopeDuration,
  handleEnvelopeLoop,
  getEnvelopeProgress,
  removeNode,
  setSelectedNodeId,
  // Sample player props
  sampleData,
  samplePlayheads,
  sampleFileInputRef,
  sampleLoadTargetRef,
  handleSampleRegionChange,
  handleSampleTrigger,
  handleSampleLoopToggle,
}) {
  const schema = NODE_SCHEMA[node.type];
  if (!schema) return null;

  const isAudioOut = node.type === 'audioOut';
  const isFx = schema.category === 'fx';
  const isControl = schema.category === 'control';
  const isScript = schema.category === 'script';
  const isEnvelope = node.type === 'envelope';
  const isBang = node.type === 'bang';
  const isMidiIn = node.type === 'midi_in';
  const isSampler = node.type === 'sample_player';
  const nodeWidth = getNodeWidth(node);

  // Check if this module has any modulation output connections
  const hasModOutput = connections.some(
    (c) => c.fromNodeId === node.id && c.toParam
  );

  // Build set of modulated params on this node
  const modulatedParams = {};
  const audioRateModulatedParams = new Set();
  for (const conn of connections) {
    if (conn.toNodeId !== node.id || !conn.toParam) continue;
    const src = nodes[conn.fromNodeId];
    const srcSchema = NODE_SCHEMA[src?.type];
    const srcCat = srcSchema?.category;

    if (conn.isAudioRate) {
      modulatedParams[conn.toParam] = 'audio';
      audioRateModulatedParams.add(conn.toParam);
    } else if (src && (srcCat === 'control' || srcCat === 'script')) {
      const srcValue = srcCat === 'script'
        ? (src.params[`out_${conn.fromPortIndex}`] ?? src.params.value ?? 0)
        : (src.params.value ?? 0);
      modulatedParams[conn.toParam] = srcValue;
    }
  }

  return (
    <div
      key={node.id}
      data-node-id={node.id}
      className={`sense-node${isLive ? ' live' : ''}${isAudioOut ? ' audio-out' : ''}${isFx ? ' fx' : ''}${isControl && !isEnvelope && !isBang && !isMidiIn ? ' control' : ''}${isScript ? ' script' : ''}${isEnvelope ? ' envelope' : ''}${isBang ? ' bang' : ''}${isMidiIn ? ' midi-in' : ''}${isSampler ? ' sampler' : ''}${node.type === 'scope' ? ' scope scope-classic' : ''}${hasModOutput ? ' live' : ''}${selectedNodeId === node.id ? ' selected' : ''}${runningScripts.has(node.id) || runningEnvelopes.has(node.id) || runningPulsers.has(node.id) || runningSequencers.has(node.id) ? ' running' : ''}${isMidiIn && midiListenersRef.current.has(node.id) ? ' listening' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: isBang ? (node.bangSize || 60) + 16 : nodeWidth,
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
      {getNodeOutputs(node).map((name, i) => (
        <div
          key={`out-${i}`}
          className="node-port output"
          style={{ top: isBang
            ? HEADER_H + 4 + (node.bangSize || 60) / 2 - 4
            : PORT_SECTION_Y + 11 + i * PORT_SPACING - 6 }}
          onClick={(e) => handlePortClick(e, node.id, 'output', i)}
          title={name}
        >
          <span className="port-label port-label-out">{name}</span>
        </div>
      ))}

      {/* Envelope trigger input port */}
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

      {/* Sequencer trigger input port */}
      {node.type === 'sequencer' && (
        <div
          className={`node-port mod-input trig-port${connecting ? ' connectable' : ''}${'trig' in modulatedParams ? ' modulated' : ''}`}
          style={{ top: HEADER_H + 10 - 4 }}
          onClick={(e) => handleParamPortClick(e, node.id, 'trig')}
          title="clock/trigger input"
        >
          <span className="port-label port-label-in">clk</span>
        </div>
      )}

      {/* Sample player trigger input port */}
      {isSampler && (
        <div
          className={`node-port mod-input trig-port${connecting ? ' connectable' : ''}${'trig' in modulatedParams ? ' modulated' : ''}`}
          style={{ top: HEADER_H + 40 + 80 / 2 - 4 }}
          onClick={(e) => handleParamPortClick(e, node.id, 'trig')}
          title="trigger input"
        >
          <span className="port-label port-label-in">trig</span>
        </div>
      )}

      {/* Parameter modulation input ports */}
      {!isControl && !isScript && !isAudioOut && Object.keys(schema.params).map((key, i) => {
        const isModulated = key in modulatedParams;
        const isAudioRateMod = audioRateModulatedParams.has(key);
        const showPort = connecting || isModulated;
        if (!showPort) return null;

        return (
          <div
            key={`mod-${key}`}
            className={`node-port mod-input${connecting ? ' connectable' : ''}${isModulated ? ' modulated' : ''}${isAudioRateMod ? ' audio-rate' : ''}`}
            style={{ top: PARAM_START_Y + i * PARAM_ROW_H + PARAM_ROW_H / 2 - 4 }}
            onClick={(e) => handleParamPortClick(e, node.id, key)}
            title={isAudioRateMod ? `audio mod: ${schema.params[key].label}` : `mod: ${schema.params[key].label}`}
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

      {/* Bang button */}
      {isBang && (() => {
        const size = node.bangSize || 60;
        const fired = (node.params.value ?? 0) >= 0.5;
        return (
          <div className="bang-body" style={{ padding: '4px 0' }}>
            <div
              className={`bang-circle${fired ? ' fired' : ''}`}
              style={{ width: size, height: size }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleBang(node.id);
              }}
            />
            <div
              className="bang-resize-handle"
              onMouseDown={(e) => handleBangResizeStart(e, node.id, size)}
              title="Drag to resize"
            />
          </div>
        );
      })()}

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

      {/* Sequencer step indicator */}
      {node.type === 'sequencer' && (
        <div className="seq-steps" style={{ display: 'flex', gap: 3, padding: '4px 8px 2px' }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const active = i < (node.params.length ?? 5);
            const current = i === (node.seqCurrentStep ?? 0);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 2,
                  background: !active
                    ? 'rgba(122,117,112,0.1)'
                    : current
                      ? schema.accent
                      : 'rgba(122,117,112,0.25)',
                  transition: 'background 0.08s',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Scope (oscilloscope) display */}
      {node.type === 'scope' && (
        <ScopeCanvas
          buffersRef={scopeBuffersRef}
          nodeId={node.id}
          bufferSize={scopeBufferSize}
          accentColor={schema.accent}
        />
      )}

      {/* MIDI input display */}
      {isMidiIn && (
        <div
          className="midi-in-body"
          onClick={() => setSelectedNodeId(node.id)}
          title="Click to configure MIDI input"
        >
          <div className="midi-in-mode-badge">
            {node.midiMode === 'note' ? 'NOTE' : `CC ${node.midiCcNumber}`}
          </div>
          <div className="midi-in-value">
            {(node.params.value ?? 0).toFixed(0)}
          </div>
          <div className="midi-in-channel">
            {node.midiChannel === 0 ? 'omni' : `ch ${node.midiChannel}`}
          </div>
          {(Date.now() - (midiActivity[node.id] || 0)) < 300 && (
            <div className="midi-in-activity" />
          )}
        </div>
      )}

      {/* Sample player body */}
      {isSampler && (() => {
        const sd = sampleData?.[node.id];
        const startP = node.params.start_pos ?? 0;
        const endP = node.params.end_pos ?? 1;
        const loopOn = (node.params.loop ?? 1) > 0.5;

        // Pass playhead timing state directly — WaveformDisplay runs
        // its own requestAnimationFrame loop to animate smoothly.
        const ph = samplePlayheads?.[node.id];
        const playheadState = (ph && sd) ? ph : null;

        return (
          <div className="sampler-body">
            <WaveformDisplay
              audioData={sd?.audioData ?? null}
              startPos={startP}
              endPos={endP}
              onRegionChange={(s, e) => handleSampleRegionChange?.(node.id, s, e)}
              accentColor={schema.accent}
              width={(schema.width || 280) - 22}
              height={80}
              playheadState={playheadState}
              sampleName={sd?.name ?? null}
            />
            <div className="sampler-controls">
              <button
                className="sampler-trig-btn"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSampleTrigger?.(node.id);
                }}
                title="Trigger playback"
              >
                &#9654;
              </button>
              <button
                className={`sampler-loop-btn${loopOn ? ' active' : ''}`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSampleLoopToggle?.(node.id);
                }}
                title={loopOn ? 'Loop: ON' : 'Loop: OFF'}
              >
                loop
              </button>
              <button
                className="sampler-load-btn"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (sampleLoadTargetRef) sampleLoadTargetRef.current = node.id;
                  sampleFileInputRef?.current?.click();
                }}
                title="Load audio file"
              >
                load
              </button>
              {sd && (
                <span className="sampler-info">
                  {sd.channels === 2 ? 'st' : 'mo'} · {sd.duration.toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Parameters (skip hidden params, skip for envelope) */}
      {!isEnvelope && !isBang && Object.keys(schema.params).length > 0 && (
        <div className="node-params">
          {Object.entries(schema.params).map(([key, def]) => {
            if (def.hidden) return null;
            const isModulated = key in modulatedParams;
            const isAudioRateMod = audioRateModulatedParams.has(key);
            const displayVal = isAudioRateMod
              ? (node.params[key] ?? def.val)
              : isModulated
                ? modulatedParams[key]
                : (node.params[key] ?? def.val);
            const sliderVal = isAudioRateMod
              ? (node.params[key] ?? def.val)
              : isModulated
                ? modulatedParams[key]
                : (node.params[key] ?? def.val);

            if (def.type === 'button') {
              const isOn = (node.params[key] ?? def.val) >= 0.5;
              return (
                <div className={`node-param${isModulated ? ' modulated' : ''}${isAudioRateMod ? ' audio-rate-mod' : ''}`} key={key}>
                  <span className="param-label">{def.label}</span>
                  <button
                    className={`param-toggle-btn${isOn ? ' active' : ''}`}
                    disabled={isModulated && !isAudioRateMod}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      handleParamChange(node.id, key, isOn ? 0 : 1);
                    }}
                  >
                    {isOn ? 'on' : 'off'}
                  </button>
                </div>
              );
            }

            return (
              <div className={`node-param${isModulated ? ' modulated' : ''}${isAudioRateMod ? ' audio-rate-mod' : ''}`} key={key}>
                <span className="param-label">{def.label}</span>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={sliderVal}
                  disabled={isModulated && !isAudioRateMod}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleParamChange(node.id, key, v);
                  }}
                />
                <span className="param-val">
                  {isAudioRateMod
                    ? (key === 'freq' ? 'FM' : key === 'amp' ? 'AM' : 'PM')
                    : key === 'waveform'
                      ? ['sin', 'tri', 'saw', 'pls'][Math.round(displayVal)] ?? displayVal
                      : key === 'freq' && node.quantize
                        ? freqToNoteName(displayVal)
                        : displayVal >= 100
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

      {/* Script resize handle */}
      {isScript && (
        <div
          className="script-resize-handle"
          onMouseDown={(e) => handleScriptResizeStart(e, node.id, getNodeWidth(node))}
          title="Drag to resize"
        />
      )}

      {/* Live indicator */}
      {(isLive || hasModOutput || runningScripts.has(node.id) || runningEnvelopes.has(node.id) || runningPulsers.has(node.id) || runningSequencers.has(node.id)) && <div className="node-live-dot" />}
    </div>
  );
}
