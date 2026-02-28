import Label from './Label';

export default {
  title: 'Atoms/Label',
  component: Label,
  argTypes: {
    variant: { control: 'select', options: ['default', 'dim', 'gold', 'mist', 'rose', 'sage', 'heading'] },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
    children: { control: 'text' },
  },
};

const Template = (args) => <Label {...args} />;

export const Default = Template.bind({});
Default.args = { children: 'Frequency' };

export const Dim = Template.bind({});
Dim.args = { children: 'secondary label', variant: 'dim', size: 'xs' };

export const Gold = Template.bind({});
Gold.args = { children: 'Active Module', variant: 'gold' };

export const Heading = Template.bind({});
Heading.args = { children: 'ORA-FM', variant: 'heading', size: 'lg', as: 'h1' };

export const AllVariants = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
    <Label variant="default">Default — Ink</Label>
    <Label variant="dim">Dim — Secondary</Label>
    <Label variant="gold">Gold — Accent</Label>
    <Label variant="mist">Mist — Info</Label>
    <Label variant="rose">Rose — Warning</Label>
    <Label variant="sage">Sage — Success</Label>
    <Label variant="heading" size="lg" as="h2">Heading — Serif</Label>
  </div>
);
