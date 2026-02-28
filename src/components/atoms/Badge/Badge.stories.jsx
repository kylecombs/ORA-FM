import Badge from './Badge';

export default {
  title: 'Atoms/Badge',
  component: Badge,
  argTypes: {
    color: { control: 'select', options: ['gold', 'mist', 'rose', 'sage', 'dim'] },
    pulse: { control: 'boolean' },
    children: { control: 'text' },
  },
};

const Template = (args) => <Badge {...args} />;

export const Gold = Template.bind({});
Gold.args = { children: 'Active', color: 'gold' };

export const Mist = Template.bind({});
Mist.args = { children: 'Audio', color: 'mist' };

export const Rose = Template.bind({});
Rose.args = { children: 'Error', color: 'rose' };

export const Sage = Template.bind({});
Sage.args = { children: 'Ready', color: 'sage' };

export const Recording = Template.bind({});
Recording.args = { children: 'Rec 1:23', color: 'rose', pulse: true };

export const AllBadges = () => (
  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
    <Badge color="gold">Engine</Badge>
    <Badge color="mist">Control</Badge>
    <Badge color="rose">Recording</Badge>
    <Badge color="sage">Connected</Badge>
    <Badge color="dim">Idle</Badge>
    <Badge color="rose" pulse>Live</Badge>
  </div>
);
