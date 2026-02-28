import { useState } from 'react';
import Toolbar from './Toolbar';

export default {
  title: 'Organisms/Toolbar',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    engineStatus: { control: 'select', options: ['idle', 'booting', 'ready', 'error'] },
    panelOpen: { control: 'boolean' },
    consoleOpen: { control: 'boolean' },
    recording: { control: 'boolean' },
    recordingTime: { control: 'number' },
  },
};

const Template = (args) => <Toolbar {...args} />;

export const Idle = Template.bind({});
Idle.args = { engineStatus: 'idle' };

export const Booting = Template.bind({});
Booting.args = { engineStatus: 'booting' };

export const Ready = Template.bind({});
Ready.args = { engineStatus: 'ready', panelOpen: true };

export const Recording = Template.bind({});
Recording.args = { engineStatus: 'ready', recording: true, recordingTime: 95 };

export const Interactive = () => {
  const [status, setStatus] = useState('idle');
  const [panel, setPanel] = useState(false);
  const [console_, setConsole] = useState(false);
  const [rec, setRec] = useState(false);

  const handleBoot = () => {
    setStatus('booting');
    setTimeout(() => setStatus('ready'), 1500);
  };

  return (
    <Toolbar
      engineStatus={status}
      panelOpen={panel}
      consoleOpen={console_}
      recording={rec}
      recordingTime={42}
      onBoot={handleBoot}
      onTogglePanel={() => setPanel((p) => !p)}
      onToggleConsole={() => setConsole((p) => !p)}
      onSave={() => alert('Save')}
      onLoad={() => alert('Load')}
      onToggleRecording={() => setRec((p) => !p)}
    />
  );
};
