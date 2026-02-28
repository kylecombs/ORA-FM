import { useState } from 'react';
import Input from './Input';

export default {
  title: 'Atoms/Input',
  component: Input,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
};

const Interactive = (args) => {
  const [val, setVal] = useState(args.value ?? '');
  return <Input {...args} value={val} onChange={setVal} />;
};

export const Default = Interactive.bind({});
Default.args = { placeholder: 'Search modules…' };

export const WithValue = Interactive.bind({});
WithValue.args = { value: 'sine_osc', placeholder: 'Search…' };

export const Small = Interactive.bind({});
Small.args = { placeholder: 'Freq', size: 'sm' };

export const Large = Interactive.bind({});
Large.args = { placeholder: 'Enter patch name…', size: 'lg' };

export const Disabled = Interactive.bind({});
Disabled.args = { value: 'locked', disabled: true };

export const Number = Interactive.bind({});
Number.args = { type: 'number', value: '440', size: 'sm' };
