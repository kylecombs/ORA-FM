import { useState } from 'react';
import AmbientLayout from '../templates/AmbientLayout';
import Label from '../atoms/Label';
import Toggle from '../atoms/Toggle';
import Button from '../atoms/Button';
import Badge from '../atoms/Badge';

export default {
  title: 'Pages/Ambient',
  parameters: { layout: 'fullscreen' },
};

const Orb = ({ playing }) => (
  <div style={{
    width: 180,
    height: 180,
    borderRadius: '50%',
    border: `2px solid ${playing ? 'var(--ora-gold)' : 'var(--ora-border)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: playing
      ? 'radial-gradient(circle, var(--ora-glow) 0%, transparent 70%)'
      : 'transparent',
    transition: 'all 0.4s ease',
  }}>
    <span style={{ fontSize: 'var(--ora-text-xs)', color: playing ? 'var(--ora-gold)' : 'var(--ora-dim)' }}>
      {playing ? 'Playing' : 'Tap to start'}
    </span>
  </div>
);

const Visualizer = () => (
  <div style={{
    display: 'flex',
    gap: 4,
    alignItems: 'flex-end',
    height: 64,
    justifyContent: 'center',
  }}>
    {Array.from({ length: 16 }, (_, i) => {
      const h = 8 + Math.sin(i * 0.5) * 30 + Math.random() * 20;
      return (
        <div
          key={i}
          style={{
            width: 10,
            height: h,
            background: `linear-gradient(to top, var(--ora-gold), var(--ora-mist))`,
            borderRadius: 2,
            opacity: 0.4 + (h / 60) * 0.6,
          }}
        />
      );
    })}
  </div>
);

export const Default = () => {
  const [playing, setPlaying] = useState(false);
  const [layers, setLayers] = useState({
    pad: true,
    texture: false,
    melody: true,
    binaural: false,
    noise: false,
  });

  return (
    <AmbientLayout
      header={
        <div style={{ textAlign: 'center' }}>
          <Label variant="heading" size="lg" as="h1">ORA-FM</Label>
          <div style={{ marginTop: 4 }}>
            <Label variant="dim" size="xs">ambient · generative · focus</Label>
          </div>
        </div>
      }
      orb={
        <div onClick={() => setPlaying((p) => !p)}>
          <Orb playing={playing} />
        </div>
      }
      controls={
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ora-space-sm)',
          alignItems: 'flex-start',
        }}>
          {Object.entries(layers).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ora-space-sm)' }}>
              <Toggle
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                checked={val}
                onChange={(v) => setLayers((p) => ({ ...p, [key]: v }))}
                disabled={!playing}
              />
              {val && playing && <Badge color="sage">On</Badge>}
            </div>
          ))}
          <div style={{ marginTop: 'var(--ora-space-sm)', display: 'flex', gap: 'var(--ora-space-sm)' }}>
            <Label variant="dim" size="xs">Root:</Label>
            <Badge color="gold">C3</Badge>
          </div>
        </div>
      }
      visualizer={playing ? <Visualizer /> : null}
      footer={<Label variant="dim" size="xs">25:00 session</Label>}
    />
  );
};

export const Playing = () => (
  <AmbientLayout
    header={
      <div style={{ textAlign: 'center' }}>
        <Label variant="heading" size="lg" as="h1">ORA-FM</Label>
        <Label variant="dim" size="xs">ambient · generative · focus</Label>
      </div>
    }
    orb={<Orb playing />}
    controls={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ora-space-sm)', alignItems: 'flex-start' }}>
        <Toggle label="Pad" checked />
        <Toggle label="Texture" checked />
        <Toggle label="Melody" checked={false} />
      </div>
    }
    visualizer={<Visualizer />}
    footer={<Label variant="dim" size="xs">18:42 remaining</Label>}
  />
);
