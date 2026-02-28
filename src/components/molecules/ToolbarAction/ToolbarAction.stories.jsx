import ToolbarAction from './ToolbarAction';

export default {
  title: 'Molecules/ToolbarAction',
  component: ToolbarAction,
  argTypes: {
    icon: { control: 'select', options: ['play', 'stop', 'plus', 'save', 'load', 'record', 'wave', 'settings', 'close'] },
    label: { control: 'text' },
    active: { control: 'boolean' },
    disabled: { control: 'boolean' },
    variant: { control: 'select', options: ['default', 'primary', 'danger', 'ghost'] },
  },
};

const Template = (args) => <ToolbarAction {...args} />;

export const BootEngine = Template.bind({});
BootEngine.args = { icon: 'play', label: 'Boot Engine', variant: 'primary' };

export const AddModule = Template.bind({});
AddModule.args = { icon: 'plus', label: 'Add Module', active: true };

export const Save = Template.bind({});
Save.args = { icon: 'save', label: 'Save' };

export const Record = Template.bind({});
Record.args = { icon: 'record', label: 'Rec', variant: 'danger' };

export const Disabled = Template.bind({});
Disabled.args = { icon: 'load', label: 'Load', disabled: true };

export const ActionRow = () => (
  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
    <ToolbarAction icon="play" label="Boot Engine" variant="primary" />
    <ToolbarAction icon="plus" label="Add Module" active />
    <ToolbarAction icon="wave" label="Console" />
    <ToolbarAction icon="save" label="Save" />
    <ToolbarAction icon="load" label="Load" />
    <ToolbarAction icon="record" label="Rec" variant="danger" />
  </div>
);
