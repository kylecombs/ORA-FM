import StatusIndicator from './StatusIndicator';

export default {
  title: 'Molecules/StatusIndicator',
  component: StatusIndicator,
  argTypes: {
    status: { control: 'select', options: StatusIndicator.STATUSES },
    label: { control: 'text' },
    customText: { control: 'text' },
  },
};

const Template = (args) => <StatusIndicator {...args} />;

export const Idle = Template.bind({});
Idle.args = { status: 'idle', label: 'Engine' };

export const Booting = Template.bind({});
Booting.args = { status: 'booting', label: 'Engine' };

export const Ready = Template.bind({});
Ready.args = { status: 'ready', label: 'Engine' };

export const Recording = Template.bind({});
Recording.args = { status: 'recording', customText: 'Rec 2:15' };

export const Error = Template.bind({});
Error.args = { status: 'error', label: 'Audio' };

export const AllStatuses = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    {StatusIndicator.STATUSES.map((s) => (
      <StatusIndicator key={s} status={s} label="Engine" />
    ))}
  </div>
);
