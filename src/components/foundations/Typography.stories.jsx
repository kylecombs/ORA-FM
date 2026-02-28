export default {
  title: 'Foundations/Typography',
  parameters: { layout: 'padded' },
};

const SCALE = [
  { token: '--ora-text-2xl', size: '1.5rem',  name: '2xl' },
  { token: '--ora-text-xl',  size: '1.25rem', name: 'xl' },
  { token: '--ora-text-lg',  size: '1rem',    name: 'lg' },
  { token: '--ora-text-md',  size: '0.85rem', name: 'md' },
  { token: '--ora-text-sm',  size: '0.75rem', name: 'sm' },
  { token: '--ora-text-xs',  size: '0.65rem', name: 'xs' },
];

const SectionTitle = ({ children }) => (
  <h2 style={{
    fontFamily: 'var(--ora-font-serif)',
    fontStyle: 'italic',
    color: 'var(--ora-gold)',
    fontSize: 'var(--ora-text-2xl)',
    marginBottom: '0.5rem',
  }}>
    {children}
  </h2>
);

const Subtitle = ({ children }) => (
  <p style={{
    color: 'var(--ora-dim)',
    fontSize: 'var(--ora-text-sm)',
    marginBottom: '1.5rem',
  }}>
    {children}
  </p>
);

export const Families = () => (
  <div style={{ maxWidth: 600 }}>
    <SectionTitle>Type Families</SectionTitle>
    <Subtitle>
      ORA-FM uses two typefaces: DM Mono for the interface and DM Serif Display for headings.
    </Subtitle>

    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
    }}>
      {/* DM Mono */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--ora-gold)', fontSize: 'var(--ora-text-sm)' }}>DM Mono</span>
          <code style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>--ora-font-mono</code>
        </div>
        <div style={{
          fontFamily: 'var(--ora-font-mono)',
          color: 'var(--ora-ink)',
          fontSize: '2rem',
          lineHeight: 1.3,
          marginBottom: '0.75rem',
        }}>
          Aa Bb Cc 0123
        </div>
        <div style={{
          fontFamily: 'var(--ora-font-mono)',
          color: 'var(--ora-ink)',
          fontSize: 'var(--ora-text-sm)',
          lineHeight: 1.6,
          marginBottom: '0.5rem',
        }}>
          ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
          abcdefghijklmnopqrstuvwxyz<br />
          0123456789 !@#$%^&amp;*()-=+[]
        </div>
        <div style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', fontStyle: 'italic' }}>
          Used for: UI labels, parameters, console output, buttons, badges
        </div>
      </div>

      {/* DM Serif Display */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <span style={{ color: 'var(--ora-gold)', fontSize: 'var(--ora-text-sm)' }}>DM Serif Display</span>
          <code style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>--ora-font-serif</code>
        </div>
        <div style={{
          fontFamily: 'var(--ora-font-serif)',
          fontStyle: 'italic',
          color: 'var(--ora-gold)',
          fontSize: '2.5rem',
          lineHeight: 1.2,
          marginBottom: '0.75rem',
        }}>
          ORA-FM
        </div>
        <div style={{
          fontFamily: 'var(--ora-font-serif)',
          fontStyle: 'italic',
          color: 'var(--ora-ink)',
          fontSize: 'var(--ora-text-lg)',
          lineHeight: 1.6,
          marginBottom: '0.5rem',
        }}>
          ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
          abcdefghijklmnopqrstuvwxyz<br />
          0123456789
        </div>
        <div style={{
          color: 'var(--ora-dim)',
          fontSize: 'var(--ora-text-xs)',
          fontFamily: 'var(--ora-font-mono)',
          fontStyle: 'italic',
        }}>
          Used for: Masthead, section headings, decorative titles
        </div>
      </div>
    </div>
  </div>
);

export const Scale = () => (
  <div style={{ maxWidth: 600 }}>
    <SectionTitle>Type Scale</SectionTitle>
    <Subtitle>
      Six sizes from xs (0.65rem) to 2xl (1.5rem). All available as CSS custom properties.
    </Subtitle>

    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      {SCALE.map(({ token, size, name }) => (
        <div
          key={name}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '1rem',
            padding: '0.6rem 0',
            borderBottom: '1px solid var(--ora-border)',
          }}
        >
          <code style={{
            color: 'var(--ora-dim)',
            fontSize: 'var(--ora-text-xs)',
            width: 90,
            flexShrink: 0,
            textAlign: 'right',
          }}>
            {name} — {size}
          </code>
          <span style={{
            fontFamily: 'var(--ora-font-mono)',
            fontSize: `var(${token})`,
            color: 'var(--ora-ink)',
          }}>
            The quick brown fox jumps over the lazy dog
          </span>
        </div>
      ))}
    </div>

    <div style={{ marginTop: '1.5rem' }}>
      <h3 style={{
        fontFamily: 'var(--ora-font-serif)',
        fontStyle: 'italic',
        color: 'var(--ora-gold)',
        fontSize: 'var(--ora-text-lg)',
        marginBottom: '0.75rem',
      }}>
        Serif Scale
      </h3>
      {SCALE.slice(0, 4).map(({ token, size, name }) => (
        <div
          key={name}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '1rem',
            padding: '0.6rem 0',
            borderBottom: '1px solid var(--ora-border)',
          }}
        >
          <code style={{
            color: 'var(--ora-dim)',
            fontSize: 'var(--ora-text-xs)',
            width: 90,
            flexShrink: 0,
            textAlign: 'right',
          }}>
            {name} — {size}
          </code>
          <span style={{
            fontFamily: 'var(--ora-font-serif)',
            fontStyle: 'italic',
            fontSize: `var(${token})`,
            color: 'var(--ora-gold)',
          }}>
            Ambient generative focus
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const Weights = () => (
  <div style={{ maxWidth: 600 }}>
    <SectionTitle>Weights &amp; Styles</SectionTitle>
    <Subtitle>
      DM Mono ships in regular weight. DM Serif Display is used exclusively in italic.
    </Subtitle>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <span style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>DM Mono regular</span>
        <span style={{
          fontFamily: 'var(--ora-font-mono)',
          fontSize: 'var(--ora-text-lg)',
          color: 'var(--ora-ink)',
        }}>
          freq: 440 Hz &nbsp; amp: 0.50 &nbsp; pan: 0.00
        </span>
      </div>

      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <span style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>DM Mono uppercase (labels)</span>
        <span style={{
          fontFamily: 'var(--ora-font-mono)',
          fontSize: 'var(--ora-text-xs)',
          color: 'var(--ora-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.25em',
        }}>
          ambient &middot; generative &middot; focus
        </span>
      </div>

      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <span style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)' }}>DM Serif Display italic</span>
        <span style={{
          fontFamily: 'var(--ora-font-serif)',
          fontStyle: 'italic',
          fontSize: 'var(--ora-text-2xl)',
          color: 'var(--ora-gold)',
        }}>
          ORA-FM
        </span>
      </div>
    </div>
  </div>
);

export const UIPatterns = () => (
  <div style={{ maxWidth: 600 }}>
    <SectionTitle>UI Typography Patterns</SectionTitle>
    <Subtitle>
      Common text treatments used across the application.
    </Subtitle>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Masthead */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', marginBottom: '0.75rem' }}>
          Masthead
        </div>
        <h1 style={{
          fontFamily: 'var(--ora-font-serif)',
          fontStyle: 'italic',
          fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          color: 'var(--ora-gold)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
          marginBottom: '0.4rem',
        }}>
          ORA-FM
        </h1>
        <p style={{
          fontFamily: 'var(--ora-font-mono)',
          fontSize: 'var(--ora-text-xs)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--ora-dim)',
        }}>
          ambient &middot; generative &middot; focus
        </p>
      </div>

      {/* Module node */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
      }}>
        <div style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', marginBottom: '0.75rem' }}>
          Module Node
        </div>
        <div style={{
          background: 'var(--ora-lift)',
          borderRadius: 6,
          border: '1px solid var(--ora-mist)',
          width: 186,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '6px 10px',
            borderBottom: '1px solid var(--ora-border)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 'var(--ora-text-sm)', color: 'var(--ora-ink)' }}>Sine Osc</span>
            <span style={{
              fontSize: 'var(--ora-text-xs)',
              color: 'var(--ora-mist)',
              background: 'rgba(138,176,200,0.12)',
              padding: '1px 6px',
              borderRadius: 'var(--ora-radius-full)',
            }}>osc</span>
          </div>
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--ora-text-xs)' }}>
              <span style={{ color: 'var(--ora-dim)' }}>freq</span>
              <span style={{ color: 'var(--ora-ink)' }}>440 Hz</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--ora-text-xs)' }}>
              <span style={{ color: 'var(--ora-dim)' }}>amp</span>
              <span style={{ color: 'var(--ora-ink)' }}>0.50</span>
            </div>
          </div>
        </div>
      </div>

      {/* Console output */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
      }}>
        <div style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', marginBottom: '0.75rem' }}>
          Console Output
        </div>
        <div style={{
          background: 'var(--ora-deep)',
          borderRadius: 4,
          padding: '0.75rem',
          fontFamily: 'var(--ora-font-mono)',
          fontSize: 'var(--ora-text-xs)',
          lineHeight: 1.7,
        }}>
          <div style={{ color: 'var(--ora-ink)' }}>Engine booted &mdash; scsynth WASM v0.50.0</div>
          <div style={{ color: 'var(--ora-ink)' }}>SynthDef "sine_osc" loaded</div>
          <div style={{ color: 'var(--ora-dim)' }}>Bus 16 allocated for node 1001</div>
          <div style={{ color: 'var(--ora-gold)' }}>Parameter "freq" clamped to [20, 20000]</div>
          <div style={{ color: 'var(--ora-rose)' }}>Node 1003 failed: unknown synthdef</div>
        </div>
      </div>

      {/* Toolbar buttons */}
      <div style={{
        background: 'var(--ora-surface)',
        borderRadius: 8,
        border: '1px solid var(--ora-border)',
        padding: '1.5rem',
      }}>
        <div style={{ color: 'var(--ora-dim)', fontSize: 'var(--ora-text-xs)', marginBottom: '0.75rem' }}>
          Toolbar Text Styles
        </div>
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          fontFamily: 'var(--ora-font-mono)',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: 'var(--ora-text-xs)',
            color: 'var(--ora-deep)',
            background: 'var(--ora-gold)',
            padding: '4px 10px',
            borderRadius: 3,
          }}>
            Boot Engine
          </span>
          <span style={{
            fontSize: 'var(--ora-text-xs)',
            color: 'var(--ora-gold)',
            border: '1px solid var(--ora-gold)',
            background: 'var(--ora-glow)',
            padding: '4px 10px',
            borderRadius: 3,
          }}>
            + Add Module
          </span>
          <span style={{
            fontSize: 'var(--ora-text-xs)',
            color: 'var(--ora-ink)',
            border: '1px solid var(--ora-border)',
            background: 'var(--ora-lift)',
            padding: '4px 10px',
            borderRadius: 3,
          }}>
            Save
          </span>
          <span style={{
            fontSize: 'var(--ora-text-xs)',
            color: 'var(--ora-dim)',
            padding: '4px 10px',
          }}>
            &gt; Console
          </span>
        </div>
      </div>
    </div>
  </div>
);
