import { useState, useRef, useEffect } from 'react';
import WaveformDisplay from './WaveformDisplay';

export default {
  title: 'Organisms/WaveformDisplay',
  component: WaveformDisplay,
  parameters: { layout: 'centered' },
  argTypes: {
    accentColor: { control: 'color' },
    width: { control: { type: 'range', min: 200, max: 500, step: 10 } },
    height: { control: { type: 'range', min: 60, max: 160, step: 10 } },
    sampleName: { control: 'text' },
  },
};

// ── Audio data generators ──

function generateSine(samples, freq = 4, amp = 0.8) {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = Math.sin((i / samples) * Math.PI * 2 * freq) * amp;
  }
  return data;
}

function generateNoise(samples, amp = 0.6) {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * amp;
  }
  return data;
}

function generateDrum(samples) {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const env = Math.exp(-t * 8);
    const freq = 80 + 200 * Math.exp(-t * 12);
    data[i] = Math.sin(t * freq * Math.PI * 2) * env;
  }
  return data;
}

function generatePad(samples) {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const env = Math.sin(t * Math.PI);
    data[i] = (
      Math.sin(t * 2 * Math.PI * 3) * 0.5 +
      Math.sin(t * 2 * Math.PI * 5) * 0.3 +
      Math.sin(t * 2 * Math.PI * 7) * 0.15
    ) * env * 0.7;
  }
  return data;
}

const SINE_DATA = generateSine(44100);
const NOISE_DATA = generateNoise(44100);
const DRUM_DATA = generateDrum(22050);
const PAD_DATA = generatePad(88200);

// ── Stories ──

export const WithSample = () => {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);

  return (
    <WaveformDisplay
      audioData={SINE_DATA}
      startPos={start}
      endPos={end}
      onRegionChange={(s, e) => { setStart(s); setEnd(e); }}
      accentColor="#c89a60"
      sampleName="sine_440hz.wav"
    />
  );
};

export const DrumHit = () => {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0.6);

  return (
    <WaveformDisplay
      audioData={DRUM_DATA}
      startPos={start}
      endPos={end}
      onRegionChange={(s, e) => { setStart(s); setEnd(e); }}
      accentColor="#c08880"
      sampleName="kick_808.wav"
      width={300}
      height={90}
    />
  );
};

export const NoiseSample = () => {
  const [start, setStart] = useState(0.2);
  const [end, setEnd] = useState(0.8);

  return (
    <WaveformDisplay
      audioData={NOISE_DATA}
      startPos={start}
      endPos={end}
      onRegionChange={(s, e) => { setStart(s); setEnd(e); }}
      accentColor="#8ab0c8"
      sampleName="whitenoise_burst.wav"
    />
  );
};

export const PadSound = () => {
  const [start, setStart] = useState(0.1);
  const [end, setEnd] = useState(0.9);

  return (
    <WaveformDisplay
      audioData={PAD_DATA}
      startPos={start}
      endPos={end}
      onRegionChange={(s, e) => { setStart(s); setEnd(e); }}
      accentColor="#7aab88"
      sampleName="ambient_pad_C3.wav"
      width={400}
      height={100}
    />
  );
};

export const Empty = () => (
  <WaveformDisplay
    audioData={null}
    sampleName={null}
    accentColor="#c89a60"
  />
);
Empty.parameters = {
  docs: { description: { story: 'Empty state shown when no sample is loaded.' } },
};

export const WithPlayhead = () => {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [playhead, setPlayhead] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    const startTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startTime) % 2000;
      setPlayhead(start + (elapsed / 2000) * (end - start));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [start, end]);

  return (
    <WaveformDisplay
      audioData={SINE_DATA}
      startPos={start}
      endPos={end}
      onRegionChange={(s, e) => { setStart(s); setEnd(e); }}
      playheadPos={playhead}
      accentColor="#b89a6a"
      sampleName="playing: sine_440hz.wav"
    />
  );
};
WithPlayhead.parameters = {
  docs: { description: { story: 'Animated playhead sweeping through the selected region.' } },
};

export const AllWaveforms = () => {
  const [regions, setRegions] = useState({
    sine: [0, 1],
    drum: [0, 0.6],
    noise: [0.2, 0.8],
    pad: [0.1, 0.9],
  });

  const update = (key) => (s, e) => setRegions((p) => ({ ...p, [key]: [s, e] }));

  const samples = [
    { key: 'sine', data: SINE_DATA, color: '#b89a6a', name: 'sine_440hz.wav' },
    { key: 'drum', data: DRUM_DATA, color: '#c08880', name: 'kick_808.wav' },
    { key: 'noise', data: NOISE_DATA, color: '#8ab0c8', name: 'whitenoise_burst.wav' },
    { key: 'pad', data: PAD_DATA, color: '#7aab88', name: 'ambient_pad_C3.wav' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ora-space-md)' }}>
      {samples.map(({ key, data, color, name }) => (
        <div key={key}>
          <div style={{
            fontSize: 'var(--ora-text-xs)',
            color,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 'var(--ora-space-xs)',
          }}>
            {key}
          </div>
          <WaveformDisplay
            audioData={data}
            startPos={regions[key][0]}
            endPos={regions[key][1]}
            onRegionChange={update(key)}
            accentColor={color}
            sampleName={name}
            width={350}
            height={70}
          />
        </div>
      ))}
    </div>
  );
};
