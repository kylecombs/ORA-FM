import { useCallback, useRef } from 'react';
import './Knob.css';

const ARC_START = 0.75 * Math.PI;
const ARC_END = 2.25 * Math.PI;
const ARC_RANGE = ARC_END - ARC_START;

export default function Knob({
  value = 0,
  min = 0,
  max = 1,
  step = 0.01,
  size = 36,
  color = 'var(--ora-gold)',
  onChange,
  disabled = false,
}) {
  const dragRef = useRef(null);
  const r = size / 2;
  const stroke = 3;
  const trackR = r - stroke - 2;

  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = ARC_START + norm * ARC_RANGE;

  const arcPath = (startAngle, endAngle) => {
    const x1 = r + trackR * Math.cos(startAngle);
    const y1 = r + trackR * Math.sin(startAngle);
    const x2 = r + trackR * Math.cos(endAngle);
    const y2 = r + trackR * Math.sin(endAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${trackR} ${trackR} 0 ${large} 1 ${x2} ${y2}`;
  };

  const handlePointerDown = useCallback(
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const startY = e.clientY;
      const startVal = value;

      const onMove = (me) => {
        const dy = startY - me.clientY;
        const delta = (dy / 120) * (max - min);
        let next = startVal + delta;
        next = Math.round(next / step) * step;
        next = Math.max(min, Math.min(max, next));
        onChange?.(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [value, min, max, step, onChange, disabled],
  );

  return (
    <svg
      className={`ora-knob${disabled ? ' ora-knob--disabled' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerDown={handlePointerDown}
      style={{ cursor: disabled ? 'not-allowed' : 'ns-resize' }}
    >
      {/* Track */}
      <path
        d={arcPath(ARC_START, ARC_END)}
        fill="none"
        stroke="var(--ora-border)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Value arc */}
      {norm > 0.005 && (
        <path
          d={arcPath(ARC_START, angle)}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      )}
      {/* Indicator dot */}
      <circle
        cx={r + trackR * Math.cos(angle)}
        cy={r + trackR * Math.sin(angle)}
        r={stroke}
        fill={color}
      />
    </svg>
  );
}
