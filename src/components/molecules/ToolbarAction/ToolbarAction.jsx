import Button from '../../atoms/Button';
import Icon from '../../atoms/Icon';
import './ToolbarAction.css';

export default function ToolbarAction({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  variant = 'default',
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      active={active}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {icon && <Icon name={icon} size={14} />}
      <span className="ora-toolbar-action__label">{label}</span>
    </Button>
  );
}
