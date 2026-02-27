import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oraTheme } from '../constants';
import { NODE_SCHEMA } from '../nodeSchema';
import { NOTE_NAMES, quantizeFreq, freqToNoteName } from '../utils';

export default function ModuleDetailsPanel({
  selectedNodeId,
  nodes,
  setNodes,
  setSelectedNodeId,
  runningScripts,
  runningEnvelopes,
  scriptLogs,
  setScriptLogs,
  midiDevices,
  handleCodeChange,
  handleRunScript,
  handleStopScript,
  handleQuantizeToggle,
  handlePrintPrefix,
  handlePrintColor,
}) {
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
                    placeholder="// setOutputs(n) — declare n output ports&#10;// out(value) or out(index, value)"
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
                  {(selNode.numOutputs ?? 1) > 1 ? (
                    Array.from({ length: selNode.numOutputs }, (_, i) => (
                      <div key={i} className="script-output-live-row">
                        <span className="script-output-live-label">out {i}</span>
                        <span className={`script-output-live-val${runningScripts.has(selNode.id) ? ' active' : ''}`}>
                          {(selNode.params[`out_${i}`] ?? 0).toFixed(2)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <span className="script-output-live-label">out</span>
                      <span className={`script-output-live-val${runningScripts.has(selNode.id) ? ' active' : ''}`}>
                        {(selNode.params.out_0 ?? selNode.params.value ?? 0).toFixed(2)}
                      </span>
                    </>
                  )}
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
          ) : selNode.type === 'sine_osc' ? (
            <div className="details-body">
              <div className="sine-osc-options">
                <label className="sine-osc-quantize">
                  <input
                    type="checkbox"
                    checked={selNode.quantize || false}
                    onChange={(e) =>
                      handleQuantizeToggle(selNode.id, e.target.checked)
                    }
                  />
                  <span className="sine-osc-quantize-label">
                    Quantize frequency to nearest note
                  </span>
                </label>
                {selNode.quantize && (
                  <div className="sine-osc-quantize-info">
                    {freqToNoteName(selNode.params.freq ?? 440)}
                    {' · '}
                    {quantizeFreq(selNode.params.freq ?? 440).toFixed(2)} Hz
                  </div>
                )}
              </div>
            </div>
          ) : selNode.type === 'print' ? (
            <div className="details-body">
              <div className="print-options">
                <div className="print-option">
                  <label className="print-label">Prefix</label>
                  <input
                    type="text"
                    className="print-prefix-input"
                    value={selNode.printPrefix ?? 'print'}
                    onChange={(e) =>
                      handlePrintPrefix(selNode.id, e.target.value)
                    }
                    placeholder="prefix"
                  />
                </div>
                <div className="print-option">
                  <label className="print-label">Color</label>
                  <input
                    type="color"
                    className="print-color-input"
                    value={selNode.printColor || '#e07050'}
                    onChange={(e) =>
                      handlePrintColor(selNode.id, e.target.value)
                    }
                  />
                  <span
                    className="print-color-preview"
                    style={{ color: selNode.printColor || '#e07050' }}
                  >
                    {selNode.printPrefix ?? 'print'}
                  </span>
                </div>
                <div className="print-hint">
                  Connect a signal to this module's input to log its values to the console.
                </div>
              </div>
            </div>
          ) : selNode.type === 'scope' ? (
            <div className="details-body">
              <div className="scope-details-options">
                <div className="print-hint">
                  Connect a signal source to visualize the waveform.
                  Displays values at ~30 Hz — ideal for envelopes, LFOs, and amplitude changes.
                </div>
              </div>
            </div>
          ) : selNode.type === 'midi_in' ? (
            <div className="details-body">
              <div className="midi-details">
                {/* Mode selector: CC or Note */}
                <div className="midi-option">
                  <span className="midi-label">Mode</span>
                  <div className="midi-mode-toggle-group">
                    <button
                      className={`midi-mode-choice${(selNode.midiMode || 'cc') === 'cc' ? ' active' : ''}`}
                      onClick={() => setNodes((prev) => ({
                        ...prev,
                        [selNode.id]: { ...prev[selNode.id], midiMode: 'cc' },
                      }))}
                    >
                      CC
                    </button>
                    <button
                      className={`midi-mode-choice${(selNode.midiMode || 'cc') === 'note' ? ' active' : ''}`}
                      onClick={() => setNodes((prev) => ({
                        ...prev,
                        [selNode.id]: { ...prev[selNode.id], midiMode: 'note' },
                      }))}
                    >
                      Note
                    </button>
                  </div>
                </div>

                {/* CC Number (only in CC mode) */}
                {(selNode.midiMode || 'cc') === 'cc' && (
                  <div className="midi-option">
                    <span className="midi-label">CC #</span>
                    <input
                      type="number"
                      className="midi-cc-input"
                      min={0}
                      max={127}
                      value={selNode.midiCcNumber ?? 1}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(127, parseInt(e.target.value) || 0));
                        setNodes((prev) => ({
                          ...prev,
                          [selNode.id]: { ...prev[selNode.id], midiCcNumber: v },
                        }));
                      }}
                    />
                  </div>
                )}

                {/* Channel selector */}
                <div className="midi-option">
                  <span className="midi-label">Channel</span>
                  <select
                    className="midi-channel-select"
                    value={selNode.midiChannel ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setNodes((prev) => ({
                        ...prev,
                        [selNode.id]: { ...prev[selNode.id], midiChannel: v },
                      }));
                    }}
                  >
                    <option value={0}>Omni (all)</option>
                    {Array.from({ length: 16 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Channel {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Device selector */}
                <div className="midi-option">
                  <span className="midi-label">Device</span>
                  <select
                    className="midi-device-select"
                    value={selNode.midiDeviceId || ''}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setNodes((prev) => ({
                        ...prev,
                        [selNode.id]: { ...prev[selNode.id], midiDeviceId: v },
                      }));
                    }}
                  >
                    <option value="">Any device</option>
                    {midiDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current value display */}
                <div className="midi-value-display">
                  <span className="midi-value-label">Output</span>
                  <span className="midi-value-num">
                    {(selNode.params.value ?? 0).toFixed(0)}
                  </span>
                  {selNode.midiMode === 'note' && selNode.midiLastNote != null && (
                    <span className="midi-note-info">
                      {NOTE_NAMES[((selNode.midiLastNote % 12) + 12) % 12]}
                      {Math.floor(selNode.midiLastNote / 12) - 1}
                      {selNode.midiGate ? ' ON' : ' OFF'}
                    </span>
                  )}
                </div>

                <div className="midi-hint">
                  {(selNode.midiMode || 'cc') === 'cc'
                    ? `Outputs CC ${selNode.midiCcNumber ?? 1} values (0\u2013127). Connect the output to modulate any parameter.`
                    : 'Outputs the MIDI note number (0\u2013127) on note-on events. Connect the output to control pitch or other parameters.'}
                </div>

                {midiDevices.length === 0 && (
                  <div className="midi-no-devices">
                    No MIDI devices detected. Connect a MIDI controller and refresh.
                  </div>
                )}
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
}
