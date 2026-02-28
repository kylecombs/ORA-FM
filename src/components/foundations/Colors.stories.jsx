export default {
  title: 'Foundations/Colors',
  parameters: { layout: 'padded' },
};

const PALETTE = [
  {
    group: 'Foreground',
    colors: [
      { name: 'ink',  token: '--ora-ink',  hex: '#d4cfc8', desc: 'Primary text' },
      { name: 'dim',  token: '--ora-dim',  hex: '#7a7570', desc: 'Secondary text, muted labels' },
    ],
  },
  {
    group: 'Backgrounds',
    colors: [
      { name: 'deep',    token: '--ora-deep',    hex: '#0c0b0a', desc: 'Page background' },
      { name: 'surface', token: '--ora-surface',  hex: '#111010', desc: 'Panel background' },
      { name: 'lift',    token: '--ora-lift',     hex: '#1a1917', desc: 'Raised elements, cards' },
      { name: 'border',  token: '--ora-border',   hex: '#252320', desc: 'Borders, dividers' },
    ],
  },
  {
    group: 'Accents',
    colors: [
      { name: 'gold', token: '--ora-gold', hex: '#b89a6a', desc: 'Primary accent, active states' },
      { name: 'mist', token: '--ora-mist', hex: '#8ab0c8', desc: 'Info, audio-rate, cool accent' },
      { name: 'rose', token: '--ora-rose', hex: '#c08880', desc: 'Error, recording, warm accent' },
      { name: 'sage', token: '--ora-sage', hex: '#7aab88', desc: 'Success, connected, nature' },
    ],
  },
  {
    group: 'Special',
    colors: [
      { name: 'glow', token: '--ora-glow', hex: 'rgba(184,154,106,0.12)', desc: 'Highlight overlay, hover glow' },
    ],
  },
];

const Swatch = ({ name, token, hex, desc }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 6,
        background: `var(${token})`,
        border: '1px solid var(--ora-border)',
        flexShrink: 0,
      }}
    />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: 'var(--ora-ink)', fontSize: 'var(--ora-text-md)', fontWeight: 500 }}>
        {name}
      </span>
      <code style={{ color: 'var(--ora-gold)', fontSize: 'var(--ora-text-xs)' }}>
        {token}
      </code>
      <span style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>
        {hex}
      </span>
      <span style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', fontStyle: 'italic' }}>
        {desc}
      </span>
    </div>
  </div>
);

const GroupHeader = ({ children }) => (
  <h3 style={{
    fontFamily: 'var(--ora-font-serif)',
    fontStyle: 'italic',
    color: 'var(--ora-gold)',
    fontSize: 'var(--ora-text-lg)',
    marginBottom: '0.25rem',
    marginTop: '1.5rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--ora-border)',
  }}>
    {children}
  </h3>
);

export const Palette = () => (
  <div style={{ maxWidth: 520 }}>
    <h2 style={{
      fontFamily: 'var(--ora-font-serif)',
      fontStyle: 'italic',
      color: 'var(--ora-gold)',
      fontSize: 'var(--ora-text-2xl)',
      marginBottom: '0.5rem',
    }}>
      Color Palette
    </h2>
    <p style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-sm)', marginBottom: '1rem' }}>
      ORA-FM uses a warm dark palette inspired by analog studio equipment.
      All colors are available as CSS custom properties.
    </p>

    {PALETTE.map(({ group, colors }) => (
      <div key={group}>
        <GroupHeader>{group}</GroupHeader>
        {colors.map((c) => (
          <Swatch key={c.name} {...c} />
        ))}
      </div>
    ))}
  </div>
);

export const SwatchGrid = () => (
  <div>
    <h2 style={{
      fontFamily: 'var(--ora-font-serif)',
      fontStyle: 'italic',
      color: 'var(--ora-gold)',
      fontSize: 'var(--ora-text-2xl)',
      marginBottom: '1rem',
    }}>
      At a Glance
    </h2>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
      gap: '0.75rem',
    }}>
      {PALETTE.flatMap(({ colors }) => colors).map(({ name, token, hex }) => (
        <div key={name} style={{ textAlign: 'center' }}>
          <div style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 8,
            background: `var(${token})`,
            border: '1px solid var(--ora-border)',
            marginBottom: '0.35rem',
          }} />
          <div style={{ fontSize: 'var(--ora-text-sm)', color: 'var(--ora-ink)' }}>{name}</div>
          <div style={{ fontSize: 'var(--ora-text-xs)', color: 'var(--ora-dim)' }}>{hex}</div>
        </div>
      ))}
    </div>
  </div>
);

export const ContrastPairs = () => {
  const pairs = [
    { bg: '--ora-deep', fg: '--ora-ink', label: 'ink on deep' },
    { bg: '--ora-deep', fg: '--ora-dim', label: 'dim on deep' },
    { bg: '--ora-deep', fg: '--ora-gold', label: 'gold on deep' },
    { bg: '--ora-deep', fg: '--ora-mist', label: 'mist on deep' },
    { bg: '--ora-deep', fg: '--ora-rose', label: 'rose on deep' },
    { bg: '--ora-deep', fg: '--ora-sage', label: 'sage on deep' },
    { bg: '--ora-surface', fg: '--ora-ink', label: 'ink on surface' },
    { bg: '--ora-surface', fg: '--ora-gold', label: 'gold on surface' },
    { bg: '--ora-lift', fg: '--ora-ink', label: 'ink on lift' },
    { bg: '--ora-lift', fg: '--ora-dim', label: 'dim on lift' },
    { bg: '--ora-gold', fg: '--ora-deep', label: 'deep on gold' },
  ];

  return (
    <div>
      <h2 style={{
        fontFamily: 'var(--ora-font-serif)',
        fontStyle: 'italic',
        color: 'var(--ora-gold)',
        fontSize: 'var(--ora-text-2xl)',
        marginBottom: '0.5rem',
      }}>
        Contrast Pairs
      </h2>
      <p style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-sm)', marginBottom: '1rem' }}>
        Common foreground / background combinations used throughout the UI.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 400 }}>
        {pairs.map(({ bg, fg, label }) => (
          <div
            key={label}
            style={{
              background: `var(${bg})`,
              color: `var(${fg})`,
              padding: '0.6rem 1rem',
              borderRadius: 6,
              border: '1px solid var(--ora-border)',
              fontSize: 'var(--ora-text-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{label}</span>
            <code style={{ fontSize: 'var(--ora-text-xs)', opacity: 0.6 }}>
              {fg.replace('--ora-', '')} / {bg.replace('--ora-', '')}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AccentUsage = () => {
  const usages = [
    { token: '--ora-gold', name: 'Gold', uses: ['Primary accent', 'Active states', 'Selected items', 'Headings', 'Knob arcs'] },
    { token: '--ora-mist', name: 'Mist', uses: ['Audio-rate signals', 'Frequency parameters', 'Info badges', 'Oscillator nodes'] },
    { token: '--ora-rose', name: 'Rose', uses: ['Errors & warnings', 'Recording indicator', 'Danger buttons', 'Filter nodes'] },
    { token: '--ora-sage', name: 'Sage', uses: ['Success states', 'Connected status', 'Output nodes', 'Envelope params'] },
  ];

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{
        fontFamily: 'var(--ora-font-serif)',
        fontStyle: 'italic',
        color: 'var(--ora-gold)',
        fontSize: 'var(--ora-text-2xl)',
        marginBottom: '1rem',
      }}>
        Accent Usage Guide
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {usages.map(({ token, name, uses }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              padding: '0.75rem',
              background: 'var(--ora-surface)',
              borderRadius: 6,
              border: '1px solid var(--ora-border)',
            }}
          >
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: `var(${token})`,
              flexShrink: 0,
            }} />
            <div>
              <div style={{ color: `var(${token})`, fontSize: 'var(--ora-text-md)', marginBottom: 4 }}>
                {name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {uses.map((u) => (
                  <span
                    key={u}
                    style={{
                      fontSize: 'var(--ora-text-xs)',
                      color: 'var(--ora-dim)',
                      background: 'var(--ora-lift)',
                      padding: '2px 8px',
                      borderRadius: 'var(--ora-radius-full)',
                    }}
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
