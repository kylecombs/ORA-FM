import './Input.css';

export default function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  size = 'md',
  disabled = false,
  ...rest
}) {
  return (
    <input
      className={`ora-input ora-input--${size}`}
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
    />
  );
}
