import { useRef, useEffect, useState } from 'react';
import ScopeCanvas from './ScopeCanvas';
import { SCOPE_BUFFER_SIZE } from '../../../gridview/constants';

export default {
  title: 'Organisms/ScopeCanvas',
  component: ScopeCanvas,
  parameters: { layout: 'centered' },
  argTypes: {
    accentColor: { control: 'color' },
  },
  decorators: [
    (Story) => (
      <div style={{
        background: 'var(--ora-deep)',
        border: '1px solid var(--ora-border)',
        borderRadius: 'var(--ora-radius-md)',
        overflow: 'hidden',
      }}>
        <Story />
      </div>
    ),
  ],
};

// ── Signal generators ──

function generateSignal(type, bufSize, freq = 2, amp = 0.8) {
  const buf = new Float32Array(bufSize);
  for (let i = 0; i < bufSize; i++) {
    const t = i / bufSize;
    switch (type) {
      case 'sine':
        buf[i] = Math.sin(t * Math.PI * 2 * freq) * amp;
        break;
      case 'saw':
        buf[i] = ((t * freq) % 1) * 2 * amp - amp;
        break;
      case 'square':
        buf[i] = (Math.sin(t * Math.PI * 2 * freq) > 0 ? 1 : -1) * amp;
        break;
      case 'triangle': {
        const phase = (t * freq) % 1;
        buf[i] = (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) * amp;
        break;
      }
      case 'noise':
        buf[i] = (Math.random() * 2 - 1) * amp;
        break;
      case 'fm': {
        const mod = Math.sin(t * Math.PI * 2 * freq * 7) * 3;
        buf[i] = Math.sin(t * Math.PI * 2 * freq + mod) * amp;
        break;
      }
      default:
        buf[i] = 0;
    }
  }
  return buf;
}

// Wrapper that provides a live-updating buffersRef to ScopeCanvas
function LiveScope({ signalType = 'sine', freq = 2, amp = 0.8, accentColor = '#6ab0b0', animate = true }) {
  const buffersRef = useRef(new Map());
  const nodeId = 'demo-scope';
  const frameRef = useRef(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    if (!animate) {
      // Static signal
      buffersRef.current.set(nodeId, generateSignal(signalType, SCOPE_BUFFER_SIZE, freq, amp));
      return;
    }

    // Animated: slowly drift the phase to create a living waveform
    const tick = () => {
      phaseRef.current += 0.002;
      const buf = new Float32Array(SCOPE_BUFFER_SIZE);
      for (let i = 0; i < SCOPE_BUFFER_SIZE; i++) {
        const t = i / SCOPE_BUFFER_SIZE + phaseRef.current;
        switch (signalType) {
          case 'sine':
            buf[i] = Math.sin(t * Math.PI * 2 * freq) * amp;
            break;
          case 'saw':
            buf[i] = ((t * freq) % 1) * 2 * amp - amp;
            break;
          case 'square':
            buf[i] = (Math.sin(t * Math.PI * 2 * freq) > 0 ? 1 : -1) * amp;
            break;
          case 'triangle': {
            const phase = (t * freq) % 1;
            buf[i] = (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) * amp;
            break;
          }
          case 'noise':
            buf[i] = (Math.random() * 2 - 1) * amp;
            break;
          case 'fm': {
            const mod = Math.sin(t * Math.PI * 2 * freq * 7) * (2 + Math.sin(phaseRef.current * 0.3));
            buf[i] = Math.sin(t * Math.PI * 2 * freq + mod) * amp;
            break;
          }
          default:
            buf[i] = 0;
        }
      }
      buffersRef.current.set(nodeId, buf);
      frameRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [signalType, freq, amp, animate]);

  return (
    <ScopeCanvas
      buffersRef={buffersRef}
      nodeId={nodeId}
      bufferSize={SCOPE_BUFFER_SIZE}
      accentColor={accentColor}
    />
  );
}

// ── Stories ──

export const Sine = () => <LiveScope signalType="sine" freq={3} accentColor="#6ab0b0" />;

export const Sawtooth = () => <LiveScope signalType="saw" freq={2} accentColor="#b89a6a" />;

export const Square = () => <LiveScope signalType="square" freq={2} accentColor="#c08880" />;

export const Triangle = () => <LiveScope signalType="triangle" freq={3} accentColor="#7aab88" />;

export const Noise = () => <LiveScope signalType="noise" accentColor="#8ab0c8" />;

export const FM = () => <LiveScope signalType="fm" freq={2} accentColor="#b89a6a" />;
FM.parameters = {
  docs: { description: { story: 'FM synthesis waveform with evolving modulation index.' } },
};

export const NoSignal = () => {
  const buffersRef = useRef(new Map());
  return (
    <ScopeCanvas
      buffersRef={buffersRef}
      nodeId="empty"
      bufferSize={SCOPE_BUFFER_SIZE}
      accentColor="#6ab0b0"
    />
  );
};
NoSignal.parameters = {
  docs: { description: { story: 'Empty scope with graticule, no signal connected.' } },
};

export const AllWaveforms = () => {
  const waveforms = [
    { type: 'sine', label: 'Sine', color: '#6ab0b0' },
    { type: 'saw', label: 'Sawtooth', color: '#b89a6a' },
    { type: 'square', label: 'Square', color: '#c08880' },
    { type: 'triangle', label: 'Triangle', color: '#7aab88' },
    { type: 'noise', label: 'Noise', color: '#8ab0c8' },
    { type: 'fm', label: 'FM', color: '#b89a6a' },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 'var(--ora-space-md)',
    }}>
      {waveforms.map(({ type, label, color }) => (
        <div key={type}>
          <div style={{
            fontSize: 'var(--ora-text-xs)',
            color,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 'var(--ora-space-xs)',
          }}>
            {label}
          </div>
          <div style={{
            border: '1px solid var(--ora-border)',
            borderRadius: 'var(--ora-radius-md)',
            overflow: 'hidden',
          }}>
            <LiveScope signalType={type} freq={3} accentColor={color} />
          </div>
        </div>
      ))}
    </div>
  );
};
AllWaveforms.decorators = [];
AllWaveforms.parameters = { layout: 'padded' };
