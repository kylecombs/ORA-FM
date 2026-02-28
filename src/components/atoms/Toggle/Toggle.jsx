import './Toggle.css';

export default function Toggle({ checked = false, onChange, label, disabled = false }) {
  return (
    <label className={`ora-toggle${disabled ? ' ora-toggle--disabled' : ''}`}>
      <button
        role="switch"
        aria-checked={checked}
        className={`ora-toggle__track${checked ? ' ora-toggle__track--on' : ''}`}
        onClick={() => !disabled && onChange?.(!checked)}
        disabled={disabled}
      >
        <span className="ora-toggle__thumb" />
      </button>
      {label && <span className="ora-toggle__label">{label}</span>}
    </label>
  );
}
