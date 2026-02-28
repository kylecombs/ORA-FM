import ModulePanel from './ModulePanel';

export default {
  title: 'Organisms/ModulePanel',
  component: ModulePanel,
  parameters: { layout: 'none' },
  decorators: [
    (Story) => (
      <div style={{ height: '500px', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
};

export const Default = () => (
  <ModulePanel
    onSelectModule={(m) => console.log('Selected:', m)}
    onClose={() => console.log('Close')}
  />
);

export const CustomCategories = () => (
  <ModulePanel
    categories={{
      'Sound Sources': ['FM Synth', 'Wavetable', 'Sampler', 'Granular'],
      'Signal Processing': ['Filter', 'Waveshaper', 'Compressor'],
      'Spatial': ['Pan', 'Reverb', 'Delay'],
    }}
    onSelectModule={(m) => console.log('Selected:', m)}
  />
);

export const FewItems = () => (
  <ModulePanel
    categories={{
      Basic: ['Sine', 'Output'],
    }}
    onSelectModule={(m) => console.log('Selected:', m)}
  />
);
