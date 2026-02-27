import { useState, useMemo, useCallback } from 'react';
import { NODE_SCHEMA, MODULE_CATEGORIES } from '../nodeSchema';

export default function InstrumentPanel({ panelOpen, setPanelOpen, onAddModule }) {
  const [panelSearch, setPanelSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = useCallback((sectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const filteredCategories = useMemo(() => {
    const q = panelSearch.toLowerCase().trim();
    if (!q) return MODULE_CATEGORIES;
    return MODULE_CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter((type) => {
        const schema = NODE_SCHEMA[type];
        return (
          schema.label.toLowerCase().includes(q) ||
          schema.desc.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
        );
      }),
    })).filter((cat) => cat.types.length > 0);
  }, [panelSearch]);

  return (
    <div className={`instrument-panel${panelOpen ? ' open' : ''}`}>
      <div className="panel-header">
        <span className="panel-title">Modules</span>
        <button
          className="panel-close"
          onClick={() => setPanelOpen(false)}
        >
          &times;
        </button>
      </div>

      <div className="panel-search">
        <input
          type="text"
          placeholder="Search modules…"
          value={panelSearch}
          onChange={(e) => setPanelSearch(e.target.value)}
          className="panel-search-input"
        />
        {panelSearch && (
          <button
            className="panel-search-clear"
            onClick={() => setPanelSearch('')}
          >
            &times;
          </button>
        )}
      </div>

      <div className="panel-sections">
        {filteredCategories.map((cat) => (
          <div key={cat.id} className="panel-section">
            <button
              className={`panel-section-header${collapsedSections[cat.id] ? ' collapsed' : ''}`}
              onClick={() => toggleSection(cat.id)}
            >
              <span className="section-chevron">
                {collapsedSections[cat.id] ? '›' : '‹'}
              </span>
              <span className="section-label">{cat.label}</span>
              <span className="section-desc">{cat.desc}</span>
              <span className="section-count">{cat.types.length}</span>
            </button>

            {!collapsedSections[cat.id] && (
              <div className="panel-section-items">
                {cat.types.map((type) => {
                  const schema = NODE_SCHEMA[type];
                  return (
                    <button
                      key={type}
                      className="panel-module-item"
                      style={{ '--item-accent': schema.accent }}
                      onClick={() => onAddModule(type)}
                    >
                      <span
                        className="module-item-dot"
                      />
                      <span className="module-item-info">
                        <span className="module-item-label">{schema.label}</span>
                        <span className="module-item-desc">{schema.desc}</span>
                      </span>
                      <span className="module-item-add">+</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="panel-empty">No modules match "{panelSearch}"</div>
        )}
      </div>
    </div>
  );
}
