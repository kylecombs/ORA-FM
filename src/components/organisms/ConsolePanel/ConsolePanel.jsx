import { useRef, useEffect } from 'react';
import Label from '../../atoms/Label';
import Icon from '../../atoms/Icon';
import './ConsolePanel.css';

export default function ConsolePanel({ lines = [], onClose, onClear }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="ora-console">
      <div className="ora-console__header">
        <Label variant="dim" size="xs">&gt; Console</Label>
        <div className="ora-console__actions">
          {onClear && (
            <button className="ora-console__action" onClick={onClear} title="Clear">
              <Icon name="minus" size={12} />
            </button>
          )}
          {onClose && (
            <button className="ora-console__action" onClick={onClose} title="Close">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="ora-console__output" ref={scrollRef}>
        {lines.length === 0 && (
          <span className="ora-console__empty">No output</span>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={`ora-console__line ora-console__line--${line.type || 'info'}`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
