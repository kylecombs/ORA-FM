import { useState, useRef, useCallback, useEffect } from 'react';
import BreakpointEditor from './BreakpointEditor';

export default {
  title: 'Organisms/BreakpointEditor',
  component: BreakpointEditor,
  parameters: { layout: 'centered' },
  argTypes: {
    accentColor: { control: 'color' },
  },
  decorators: [
    (Story) => (
      <div style={{
        width: 400,
        background: 'var(--ora-surface)',
        border: '1px solid var(--ora-border)',
        borderRadius: 'var(--ora-radius-md)',
        padding: 'var(--ora-space-sm)',
      }}>
        <Story />
      </div>
    ),
  ],
};

// ── Helpers ──

const PRESETS = {
  adsr: {
    breakpoints: [
      { time: 0, value: 0 },
      { time: 0.1, value: 1 },
      { time: 0.3, value: 0.6 },
      { time: 1, value: 0 },
    ],
    curves: [2, -2, -4],
  },
  ramp: {
    breakpoints: [
      { time: 0, value: 0 },
      { time: 1, value: 1 },
    ],
    curves: [0],
  },
  decay: {
    breakpoints: [
      { time: 0, value: 1 },
      { time: 1, value: 0 },
    ],
    curves: [-4],
  },
  triangle: {
    breakpoints: [
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 1, value: 0 },
    ],
    curves: [0, 0],
  },
  complex: {
    breakpoints: [
      { time: 0, value: 0 },
      { time: 0.05, value: 1 },
      { time: 0.15, value: 0.5 },
      { time: 0.4, value: 0.7 },
      { time: 0.7, value: 0.2 },
      { time: 1, value: 0 },
    ],
    curves: [3, -2, 0, -1, -4],
  },
};

const InteractiveEditor = ({ preset = 'adsr', accentColor = '#c8b060', showPlayback = false }) => {
  const [breakpoints, setBreakpoints] = useState(PRESETS[preset].breakpoints);
  const [curves, setCurves] = useState(PRESETS[preset].curves);
  const progressRef = useRef(null);
  const animRef = useRef(null);

  const handleChange = useCallback((newBps, newCurves) => {
    setBreakpoints(newBps);
    setCurves(newCurves);
  }, []);

  // Simulate playback cursor
  useEffect(() => {
    if (!showPlayback) return;
    const start = performance.now();
    const duration = 3000;

    const tick = () => {
      const elapsed = (performance.now() - start) % duration;
      const position = elapsed / duration;
      // Simple linear interp for demo
      let value = 0;
      for (let i = 0; i < breakpoints.length - 1; i++) {
        if (position >= breakpoints[i].time && position <= breakpoints[i + 1].time) {
          const t = (position - breakpoints[i].time) / (breakpoints[i + 1].time - breakpoints[i].time);
          value = breakpoints[i].value + (breakpoints[i + 1].value - breakpoints[i].value) * t;
          break;
        }
      }
      progressRef.current = { position, value };
      animRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [showPlayback, breakpoints]);

  const getPlaybackProgress = useCallback(() => {
    return showPlayback ? progressRef.current : null;
  }, [showPlayback]);

  return (
    <div>
      <BreakpointEditor
        breakpoints={breakpoints}
        curves={curves}
        onChange={handleChange}
        accentColor={accentColor}
        getPlaybackProgress={getPlaybackProgress}
        nodeId="demo"
      />
      <div style={{
        marginTop: 'var(--ora-space-xs)',
        fontSize: 'var(--ora-text-xs)',
        color: 'var(--ora-dim)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{breakpoints.length} breakpoints</span>
        <span>click to add, double-click to remove, drag curves</span>
      </div>
    </div>
  );
};

// ── Stories ──

export const ADSR = () => <InteractiveEditor preset="adsr" />;

export const Decay = () => <InteractiveEditor preset="decay" accentColor="#c08880" />;

export const Triangle = () => <InteractiveEditor preset="triangle" accentColor="#8ab0c8" />;

export const Ramp = () => <InteractiveEditor preset="ramp" accentColor="#7aab88" />;

export const Complex = () => <InteractiveEditor preset="complex" accentColor="#b89a6a" />;

export const WithPlayback = () => <InteractiveEditor preset="adsr" showPlayback />;
WithPlayback.parameters = {
  docs: { description: { story: 'Shows animated playback cursor cycling through the envelope.' } },
};

export const AllPresets = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ora-space-lg)' }}>
    {Object.entries(PRESETS).map(([name, { breakpoints, curves }]) => {
      const colors = {
        adsr: '#c8b060',
        ramp: '#7aab88',
        decay: '#c08880',
        triangle: '#8ab0c8',
        complex: '#b89a6a',
      };
      return (
        <div key={name}>
          <div style={{
            fontSize: 'var(--ora-text-xs)',
            color: colors[name],
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 'var(--ora-space-xs)',
          }}>
            {name}
          </div>
          <InteractiveEditor preset={name} accentColor={colors[name]} />
        </div>
      );
    })}
  </div>
);
AllPresets.decorators = [
  (Story) => (
    <div style={{
      width: 400,
      background: 'var(--ora-surface)',
      border: '1px solid var(--ora-border)',
      borderRadius: 'var(--ora-radius-md)',
      padding: 'var(--ora-space-md)',
    }}>
      <Story />
    </div>
  ),
];
// Override the parent decorator for this story
AllPresets.parameters = { layout: 'centered' };
