import ToolbarAction from '../../molecules/ToolbarAction';
import StatusIndicator from '../../molecules/StatusIndicator';
import './Toolbar.css';

export default function Toolbar({
  engineStatus = 'idle',
  panelOpen = false,
  consoleOpen = false,
  recording = false,
  recordingTime = 0,
  onBoot,
  onTogglePanel,
  onToggleConsole,
  onSave,
  onLoad,
  onToggleRecording,
}) {
  const booted = engineStatus === 'ready';
  const booting = engineStatus === 'booting';

  const recLabel = recording
    ? `Stop ${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, '0')}`
    : 'Rec';

  return (
    <div className="ora-toolbar">
      <div className="ora-toolbar__left">
        <ToolbarAction
          icon="play"
          label={booting ? 'Booting…' : booted ? 'Engine Ready' : 'Boot Engine'}
          variant="primary"
          onClick={onBoot}
          disabled={booting || booted}
        />
        <StatusIndicator status={engineStatus} />
      </div>

      <div className="ora-toolbar__divider" />

      <div className="ora-toolbar__center">
        <ToolbarAction
          icon={panelOpen ? 'minus' : 'plus'}
          label={panelOpen ? 'Hide Modules' : 'Add Module'}
          active={panelOpen}
          onClick={onTogglePanel}
          disabled={!booted}
        />
        <ToolbarAction
          icon="wave"
          label={consoleOpen ? 'Hide Console' : 'Console'}
          active={consoleOpen}
          onClick={onToggleConsole}
          disabled={!booted}
        />
      </div>

      <div className="ora-toolbar__divider" />

      <div className="ora-toolbar__right">
        <ToolbarAction icon="save" label="Save" onClick={onSave} disabled={!booted} />
        <ToolbarAction icon="load" label="Load" onClick={onLoad} disabled={!booted} />

        <div className="ora-toolbar__divider" />

        <ToolbarAction
          icon="record"
          label={recLabel}
          variant={recording ? 'danger' : 'default'}
          onClick={onToggleRecording}
          disabled={!booted}
        />
      </div>
    </div>
  );
}
