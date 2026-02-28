import { useState, useMemo } from 'react';
import SearchField from '../../molecules/SearchField';
import Label from '../../atoms/Label';
import Icon from '../../atoms/Icon';
import './ModulePanel.css';

const DEFAULT_CATEGORIES = {
  Oscillators: ['Sine', 'Saw', 'Square', 'Triangle', 'Noise', 'Pulse'],
  Filters: ['LPF', 'HPF', 'BPF', 'Resonant'],
  Effects: ['Reverb', 'Delay', 'Distortion', 'Chorus'],
  Modulators: ['LFO', 'Envelope', 'Sequencer', 'Random'],
  Utilities: ['Mixer', 'Gain', 'Pan', 'Scope', 'Output'],
};

export default function ModulePanel({
  categories = DEFAULT_CATEGORIES,
  onSelectModule,
  onClose,
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const filtered = useMemo(() => {
    if (!search) return categories;
    const q = search.toLowerCase();
    const result = {};
    for (const [cat, items] of Object.entries(categories)) {
      const matches = items.filter((i) => i.toLowerCase().includes(q));
      if (matches.length) result[cat] = matches;
    }
    return result;
  }, [categories, search]);

  const toggle = (cat) =>
    setCollapsed((p) => ({ ...p, [cat]: !p[cat] }));

  return (
    <div className="ora-module-panel">
      <div className="ora-module-panel__header">
        <Label variant="gold" size="sm">Modules</Label>
        {onClose && (
          <button className="ora-module-panel__close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className="ora-module-panel__search">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search modules…"
        />
      </div>

      <div className="ora-module-panel__list">
        {Object.entries(filtered).map(([cat, items]) => (
          <div key={cat} className="ora-module-panel__category">
            <button
              className="ora-module-panel__cat-header"
              onClick={() => toggle(cat)}
            >
              <Icon
                name={collapsed[cat] ? 'chevronRight' : 'chevronDown'}
                size={12}
                color="var(--ora-dim)"
              />
              <Label variant="dim" size="xs">{cat}</Label>
              <span className="ora-module-panel__count">{items.length}</span>
            </button>

            {!collapsed[cat] && (
              <div className="ora-module-panel__items">
                {items.map((item) => (
                  <button
                    key={item}
                    className="ora-module-panel__item"
                    onClick={() => onSelectModule?.(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {Object.keys(filtered).length === 0 && (
          <Label variant="dim" size="xs">No modules found</Label>
        )}
      </div>
    </div>
  );
}
