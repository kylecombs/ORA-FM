import Knob from '../../atoms/Knob';
import Label from '../../atoms/Label';
import './ParameterControl.css';

export default function ParameterControl({
  label,
  value = 0,
  min = 0,
  max = 1,
  step = 0.01,
  color = 'var(--ora-gold)',
  onChange,
  disabled = false,
  showValue = true,
}) {
  const display =
    max - min > 100
      ? Math.round(value)
      : value.toFixed(step < 0.1 ? 2 : 1);

  return (
    <div className={`ora-param${disabled ? ' ora-param--disabled' : ''}`}>
      <Knob
        value={value}
        min={min}
        max={max}
        step={step}
        color={color}
        onChange={onChange}
        disabled={disabled}
        size={32}
      />
      <div className="ora-param__info">
        <Label variant="default" size="xs">{label}</Label>
        {showValue && (
          <Label variant="dim" size="xs">{display}</Label>
        )}
      </div>
    </div>
  );
}
