import { useState } from 'react';
import ParameterControl from './ParameterControl';

export default {
  title: 'Molecules/ParameterControl',
  component: ParameterControl,
  argTypes: {
    label: { control: 'text' },
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    disabled: { control: 'boolean' },
  },
};

const Interactive = (args) => {
  const [val, setVal] = useState(args.value ?? 0.5);
  return <ParameterControl {...args} value={val} onChange={setVal} />;
};

export const Frequency = Interactive.bind({});
Frequency.args = { label: 'Freq', value: 440, min: 20, max: 2000, step: 1, color: 'var(--ora-mist)' };

export const Amplitude = Interactive.bind({});
Amplitude.args = { label: 'Amp', value: 0.5, min: 0, max: 1, step: 0.01 };

export const FilterCutoff = Interactive.bind({});
FilterCutoff.args = { label: 'Cutoff', value: 800, min: 20, max: 5000, step: 1, color: 'var(--ora-rose)' };

export const Disabled = Interactive.bind({});
Disabled.args = { label: 'Gain', value: 0.7, disabled: true };

export const ParameterRow = () => {
  const [params, setParams] = useState({ freq: 440, amp: 0.5, pan: 0, decay: 2.0 });
  const update = (k) => (v) => setParams((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      <ParameterControl label="Freq" value={params.freq} min={20} max={2000} step={1} color="var(--ora-mist)" onChange={update('freq')} />
      <ParameterControl label="Amp" value={params.amp} min={0} max={1} step={0.01} onChange={update('amp')} />
      <ParameterControl label="Pan" value={params.pan} min={-1} max={1} step={0.01} color="var(--ora-sage)" onChange={update('pan')} />
      <ParameterControl label="Decay" value={params.decay} min={0.01} max={10} step={0.01} color="var(--ora-rose)" onChange={update('decay')} />
    </div>
  );
};
