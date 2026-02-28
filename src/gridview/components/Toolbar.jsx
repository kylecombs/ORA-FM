export default function Toolbar({
  booted,
  booting,
  panelOpen,
  consoleOpen,
  daphneOpen,
  recording,
  recordingTime,
  fileInputRef,
  handleBoot,
  setPanelOpen,
  setConsoleOpen,
  setDaphneOpen,
  handleSavePatch,
  handleLoadPatch,
  handleFileSelect,
  handleToggleRecording,
}) {
  return (
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

      <button
        className={`toolbar-btn console-toggle${consoleOpen ? ' active' : ''}`}
        onClick={() => setConsoleOpen((p) => !p)}
        disabled={!booted}
      >
        {consoleOpen ? '— Hide Console' : '> Console'}
      </button>

      <div className="toolbar-divider" />

      <button
        className="toolbar-btn save-btn"
        onClick={handleSavePatch}
        disabled={!booted}
        title="Save patch to JSON file"
      >
        Save
      </button>

      <button
        className="toolbar-btn load-btn"
        onClick={handleLoadPatch}
        disabled={!booted}
        title="Load patch from JSON file"
      >
        Load
      </button>

      <div className="toolbar-divider" />

      <button
        className={`toolbar-btn rec-btn${recording ? ' recording' : ''}`}
        onClick={handleToggleRecording}
        disabled={!booted}
        title={recording ? 'Stop recording and save' : 'Record audio output'}
      >
        {recording
          ? `Stop ${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, '0')}`
          : 'Rec'}
      </button>

      <div className="toolbar-divider" />

      <button
        className={`toolbar-btn ai-toggle${daphneOpen ? ' active' : ''}`}
        onClick={() => setDaphneOpen((p) => !p)}
        title="Ask Daphne — questions &amp; patch generation"
      >
        {daphneOpen ? '— Hide Daphne' : '~ Ask Daphne'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
}
