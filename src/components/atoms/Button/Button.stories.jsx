import Button from './Button';

export default {
  title: 'Atoms/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['default', 'primary', 'danger', 'ghost'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    active: { control: 'boolean' },
    disabled: { control: 'boolean' },
    children: { control: 'text' },
  },
};

const Template = (args) => <Button {...args} />;

export const Default = Template.bind({});
Default.args = { children: 'Button', variant: 'default' };

export const Primary = Template.bind({});
Primary.args = { children: 'Boot Engine', variant: 'primary' };

export const Danger = Template.bind({});
Danger.args = { children: 'Delete', variant: 'danger' };

export const Ghost = Template.bind({});
Ghost.args = { children: 'Cancel', variant: 'ghost' };

export const Active = Template.bind({});
Active.args = { children: '+ Add Module', variant: 'default', active: true };

export const Disabled = Template.bind({});
Disabled.args = { children: 'Boot Engine', variant: 'primary', disabled: true };

export const Small = Template.bind({});
Small.args = { children: 'Rec', variant: 'default', size: 'sm' };

export const Large = Template.bind({});
Large.args = { children: 'Save Patch', variant: 'default', size: 'lg' };

export const AllVariants = () => (
  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
    <Button variant="default">Default</Button>
    <Button variant="primary">Primary</Button>
    <Button variant="danger">Danger</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="default" active>Active</Button>
    <Button variant="primary" disabled>Disabled</Button>
  </div>
);
