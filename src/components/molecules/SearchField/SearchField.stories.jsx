import { useState } from 'react';
import SearchField from './SearchField';

export default {
  title: 'Molecules/SearchField',
  component: SearchField,
  argTypes: {
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

const Interactive = (args) => {
  const [val, setVal] = useState(args.value ?? '');
  return <SearchField {...args} value={val} onChange={setVal} />;
};

export const Empty = Interactive.bind({});
Empty.args = { placeholder: 'Search modules…' };

export const WithValue = Interactive.bind({});
WithValue.args = { value: 'sine' };

export const Disabled = Interactive.bind({});
Disabled.args = { placeholder: 'Search…', disabled: true };
