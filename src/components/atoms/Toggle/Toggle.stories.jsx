import { useState } from 'react';
import Toggle from './Toggle';

export default {
  title: 'Atoms/Toggle',
  component: Toggle,
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
  },
};

const Interactive = (args) => {
  const [on, setOn] = useState(args.checked ?? false);
  return <Toggle {...args} checked={on} onChange={setOn} />;
};

export const Off = Interactive.bind({});
Off.args = { label: 'Pad Layer' };

export const On = Interactive.bind({});
On.args = { label: 'Pad Layer', checked: true };

export const Disabled = Interactive.bind({});
Disabled.args = { label: 'Binaural', checked: false, disabled: true };

export const NoLabel = Interactive.bind({});
NoLabel.args = { checked: true };

export const LayerToggles = () => {
  const [layers, setLayers] = useState({ pad: true, texture: false, melody: true, noise: false });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {Object.entries(layers).map(([key, val]) => (
        <Toggle
          key={key}
          label={key.charAt(0).toUpperCase() + key.slice(1)}
          checked={val}
          onChange={(v) => setLayers((p) => ({ ...p, [key]: v }))}
        />
      ))}
    </div>
  );
};
