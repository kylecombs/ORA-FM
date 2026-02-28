import { useState } from 'react';
import Knob from './Knob';

export default {
  title: 'Atoms/Knob',
  component: Knob,
  argTypes: {
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    size: { control: 'number' },
    disabled: { control: 'boolean' },
  },
};

const Interactive = (args) => {
  const [val, setVal] = useState(args.value ?? 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <Knob {...args} value={val} onChange={setVal} />
      <span style={{ fontFamily: 'var(--ora-font-mono)', fontSize: '0.7rem', color: 'var(--ora-dim)' }}>
        {val.toFixed(2)}
      </span>
    </div>
  );
};

export const Default = Interactive.bind({});
Default.args = { value: 0.5, min: 0, max: 1, step: 0.01 };

export const Frequency = Interactive.bind({});
Frequency.args = { value: 440, min: 20, max: 2000, step: 1, color: 'var(--ora-mist)' };

export const Small = Interactive.bind({});
Small.args = { value: 0.75, size: 24 };

export const Large = Interactive.bind({});
Large.args = { value: 0.3, size: 56 };

export const Disabled = Interactive.bind({});
Disabled.args = { value: 0.5, disabled: true };

export const KnobRow = () => {
  const [vals, setVals] = useState([0.2, 0.5, 0.8, 0.4]);
  const colors = ['var(--ora-gold)', 'var(--ora-mist)', 'var(--ora-rose)', 'var(--ora-sage)'];
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      {vals.map((v, i) => (
        <Knob
          key={i}
          value={v}
          color={colors[i]}
          onChange={(nv) => setVals((p) => p.map((pv, pi) => (pi === i ? nv : pv)))}
        />
      ))}
    </div>
  );
};
