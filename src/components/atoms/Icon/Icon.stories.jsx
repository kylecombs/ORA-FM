import Icon from './Icon';

export default {
  title: 'Atoms/Icon',
  component: Icon,
  argTypes: {
    name: { control: 'select', options: Icon.NAMES },
    size: { control: 'number' },
    color: { control: 'color' },
  },
};

const Template = (args) => <Icon {...args} />;

export const Play = Template.bind({});
Play.args = { name: 'play', size: 24, color: '#7aab88' };

export const Stop = Template.bind({});
Stop.args = { name: 'stop', size: 24, color: '#c08880' };

export const Record = Template.bind({});
Record.args = { name: 'record', size: 24, color: '#c08880' };

export const AllIcons = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
    {Icon.NAMES.map((name) => (
      <div
        key={name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <Icon name={name} size={24} color="#d4cfc8" />
        <span style={{ fontSize: '0.65rem', color: '#7a7570' }}>{name}</span>
      </div>
    ))}
  </div>
);
