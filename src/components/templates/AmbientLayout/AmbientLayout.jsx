import './AmbientLayout.css';

export default function AmbientLayout({ header, orb, controls, visualizer, footer }) {
  return (
    <div className="ora-ambient-layout">
      {header && <div className="ora-ambient-layout__header">{header}</div>}
      {orb && <div className="ora-ambient-layout__orb">{orb}</div>}
      {controls && <div className="ora-ambient-layout__controls">{controls}</div>}
      {visualizer && <div className="ora-ambient-layout__visualizer">{visualizer}</div>}
      {footer && <div className="ora-ambient-layout__footer">{footer}</div>}
    </div>
  );
}
