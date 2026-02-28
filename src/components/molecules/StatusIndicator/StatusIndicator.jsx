import Badge from '../../atoms/Badge';
import Label from '../../atoms/Label';
import './StatusIndicator.css';

const STATUS_MAP = {
  idle:       { color: 'dim',  text: 'Idle' },
  booting:    { color: 'gold', text: 'Booting…', pulse: true },
  ready:      { color: 'sage', text: 'Ready' },
  recording:  { color: 'rose', text: 'Recording', pulse: true },
  error:      { color: 'rose', text: 'Error' },
  connected:  { color: 'mist', text: 'Connected' },
};

export default function StatusIndicator({ status = 'idle', label, customText }) {
  const config = STATUS_MAP[status] || STATUS_MAP.idle;

  return (
    <div className="ora-status">
      {label && <Label variant="dim" size="xs">{label}</Label>}
      <Badge color={config.color} pulse={config.pulse}>
        {customText || config.text}
      </Badge>
    </div>
  );
}

StatusIndicator.STATUSES = Object.keys(STATUS_MAP);
