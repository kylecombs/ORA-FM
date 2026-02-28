import { useState } from 'react';
import GridLayout from '../templates/GridLayout';
import Toolbar from '../organisms/Toolbar';
import ModulePanel from '../organisms/ModulePanel';
import ConsolePanel from '../organisms/ConsolePanel';
import ParameterControl from '../molecules/ParameterControl';
import Label from '../atoms/Label';
import Badge from '../atoms/Badge';

export default {
  title: 'Pages/GridView',
  parameters: { layout: 'fullscreen' },
};

const MockCanvas = ({ nodes }) => (
  <div style={{
    height: '100%',
    position: 'relative',
    background: 'var(--ora-deep)',
  }}>
    {nodes.map((node, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: node.x,
          top: node.y,
          width: 186,
          background: 'var(--ora-surface)',
          border: `1px solid ${node.color || 'var(--ora-border)'}`,
          borderRadius: 'var(--ora-radius-md)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '6px 10px',
          background: 'var(--ora-lift)',
          borderBottom: '1px solid var(--ora-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Label variant="default" size="xs">{node.name}</Label>
          <Badge color={node.badgeColor || 'dim'}>{node.type}</Badge>
        </div>
        <div style={{ padding: '8px 10px' }}>
          {node.params?.map((p) => (
            <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--ora-dim)', padding: '2px 0' }}>
              <span>{p.label}</span>
              <span style={{ color: 'var(--ora-ink)' }}>{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    ))}
    {/* Connection line */}
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <path
        d="M 246 95 C 300 95, 300 185, 350 185"
        stroke="var(--ora-gold)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.5"
      />
    </svg>
  </div>
);

const MockDetails = ({ node }) => (
  <div style={{ padding: 'var(--ora-space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--ora-space-md)' }}>
    <Label variant="gold" size="sm">{node.name}</Label>
    <Label variant="dim" size="xs">{node.description}</Label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ora-space-sm)' }}>
      {node.params?.map((p) => (
        <ParameterControl
          key={p.label}
          label={p.label}
          value={p.numValue}
          min={p.min}
          max={p.max}
          step={p.step}
          color={p.color}
        />
      ))}
    </div>
  </div>
);

export const FullSession = () => {
  const [sidebar, setSidebar] = useState(true);
  const [details, setDetails] = useState(true);
  const [console_, setConsole] = useState(true);
  const [rec, setRec] = useState(false);

  const nodes = [
    {
      name: 'Sine Osc',
      type: 'osc',
      x: 60,
      y: 60,
      color: 'var(--ora-mist)',
      badgeColor: 'mist',
      params: [
        { label: 'freq', value: '440 Hz' },
        { label: 'amp', value: '0.50' },
      ],
    },
    {
      name: 'LPF',
      type: 'filter',
      x: 350,
      y: 150,
      color: 'var(--ora-rose)',
      badgeColor: 'rose',
      params: [
        { label: 'cutoff', value: '800 Hz' },
        { label: 'res', value: '0.30' },
      ],
    },
    {
      name: 'Reverb',
      type: 'fx',
      x: 350,
      y: 310,
      color: 'var(--ora-sage)',
      badgeColor: 'sage',
      params: [
        { label: 'room', value: '0.75' },
        { label: 'damp', value: '0.50' },
      ],
    },
  ];

  const selectedNode = {
    name: 'Sine Osc',
    description: 'Pure sine wave oscillator',
    params: [
      { label: 'Freq', numValue: 440, min: 20, max: 2000, step: 1, color: 'var(--ora-mist)' },
      { label: 'Amp', numValue: 0.5, min: 0, max: 1, step: 0.01, color: 'var(--ora-gold)' },
      { label: 'Phase', numValue: 0, min: 0, max: 6.28, step: 0.01, color: 'var(--ora-sage)' },
    ],
  };

  return (
    <GridLayout
      sidebarOpen={sidebar}
      detailsOpen={details}
      consoleOpen={console_}
      toolbar={
        <Toolbar
          engineStatus="ready"
          panelOpen={sidebar}
          consoleOpen={console_}
          recording={rec}
          recordingTime={rec ? 42 : 0}
          onBoot={() => {}}
          onTogglePanel={() => setSidebar((p) => !p)}
          onToggleConsole={() => setConsole((p) => !p)}
          onSave={() => alert('Save')}
          onLoad={() => alert('Load')}
          onToggleRecording={() => setRec((p) => !p)}
        />
      }
      sidebar={
        <ModulePanel
          onSelectModule={(m) => console.log(m)}
          onClose={() => setSidebar(false)}
        />
      }
      canvas={<MockCanvas nodes={nodes} />}
      details={<MockDetails node={selectedNode} />}
      console={
        <ConsolePanel
          lines={[
            { type: 'info', text: 'Engine booted — scsynth WASM v0.50.0' },
            { type: 'info', text: 'Group 1 created' },
            { type: 'info', text: 'SynthDef "sine_osc" loaded' },
            { type: 'debug', text: 'Bus 16 → sine_osc output' },
            { type: 'info', text: 'Node 1001: sine_osc (freq=440, amp=0.5)' },
            { type: 'info', text: 'Node 1002: lpf (cutoff=800)' },
            { type: 'info', text: 'Patched: bus 16 → lpf.in' },
          ]}
          onClose={() => setConsole(false)}
          onClear={() => {}}
        />
      }
    />
  );
};
