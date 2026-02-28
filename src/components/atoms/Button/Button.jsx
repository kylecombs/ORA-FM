import './Button.css';

const VARIANTS = ['default', 'primary', 'danger', 'ghost'];

export default function Button({
  children,
  variant = 'default',
  size = 'md',
  disabled = false,
  active = false,
  onClick,
  title,
  ...rest
}) {
  const cls = [
    'ora-btn',
    `ora-btn--${variant}`,
    `ora-btn--${size}`,
    active && 'ora-btn--active',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={cls}
      disabled={disabled}
      onClick={onClick}
      title={title}
      {...rest}
    >
      {children}
    </button>
  );
}

Button.VARIANTS = VARIANTS;
