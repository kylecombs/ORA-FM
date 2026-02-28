import AmbientLayout from './AmbientLayout';
import Label from '../../atoms/Label';
import Toggle from '../../atoms/Toggle';
import Button from '../../atoms/Button';
import { useState } from 'react';

export default {
  title: 'Templates/AmbientLayout',
  component: AmbientLayout,
  parameters: { layout: 'fullscreen' },
};

const OrbPlaceholder = () => (
  <div style={{
    width: 160,
    height: 160,
    borderRadius: '50%',
    border: '2px solid var(--ora-gold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--ora-dim)',
    fontSize: 'var(--ora-text-xs)',
    background: 'radial-gradient(circle, var(--ora-glow), transparent)',
  }}>
    Orb
  </div>
);

const VisualizerPlaceholder = () => (
  <div style={{
    display: 'flex',
    gap: 3,
    alignItems: 'flex-end',
    height: 60,
    justifyContent: 'center',
  }}>
    {Array.from({ length: 16 }, (_, i) => (
      <div
        key={i}
        style={{
          width: 8,
          height: 10 + Math.random() * 40,
          background: 'var(--ora-gold)',
          borderRadius: 2,
          opacity: 0.5 + Math.random() * 0.5,
        }}
      />
    ))}
  </div>
);

export const Default = () => {
  const [layers, setLayers] = useState({ pad: true, texture: false, melody: true });
  return (
    <AmbientLayout
      header={
        <div>
          <Label variant="heading" size="lg" as="h1">ORA-FM</Label>
          <Label variant="dim" size="xs">ambient · generative · focus</Label>
        </div>
      }
      orb={<OrbPlaceholder />}
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
          {Object.entries(layers).map(([k, v]) => (
            <Toggle
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              checked={v}
              onChange={(val) => setLayers((p) => ({ ...p, [k]: val }))}
            />
          ))}
          <Button variant="ghost" size="sm">Settings</Button>
        </div>
      }
      visualizer={<VisualizerPlaceholder />}
      footer={<span>25:00 session</span>}
    />
  );
};

export const Minimal = () => (
  <AmbientLayout
    header={
      <Label variant="heading" size="lg" as="h1">ORA-FM</Label>
    }
    orb={<OrbPlaceholder />}
  />
);
