import './Badge.css';

export default function Badge({ children, color = 'gold', pulse = false }) {
  return (
    <span className={`ora-badge ora-badge--${color}${pulse ? ' ora-badge--pulse' : ''}`}>
      {children}
    </span>
  );
}
