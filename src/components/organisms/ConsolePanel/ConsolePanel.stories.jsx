import ConsolePanel from './ConsolePanel';

export default {
  title: 'Organisms/ConsolePanel',
  component: ConsolePanel,
  parameters: { layout: 'fullscreen' },
};

export const Empty = () => (
  <ConsolePanel
    lines={[]}
    onClose={() => console.log('close')}
    onClear={() => console.log('clear')}
  />
);

export const WithOutput = () => (
  <ConsolePanel
    lines={[
      { type: 'info', text: 'Engine booted successfully' },
      { type: 'info', text: 'SynthDef "sine_osc" loaded' },
      { type: 'info', text: 'SynthDef "saw_osc" loaded' },
      { type: 'debug', text: 'Bus 16 allocated for node 1001' },
      { type: 'warn', text: 'Parameter "freq" clamped to range [20, 20000]' },
      { type: 'info', text: 'Node 1001 created: sine_osc → bus 16' },
      { type: 'info', text: 'Node 1002 created: lpf → bus 18' },
      { type: 'info', text: 'Connection: bus 16 → lpf input' },
      { type: 'error', text: 'Node 1003 failed: unknown synthdef "missing"' },
      { type: 'debug', text: 'Audio callback: 44100 Hz, 128 frames' },
    ]}
    onClose={() => console.log('close')}
    onClear={() => console.log('clear')}
  />
);

export const ErrorHeavy = () => (
  <ConsolePanel
    lines={[
      { type: 'error', text: 'AudioContext suspended — user gesture required' },
      { type: 'error', text: 'SharedArrayBuffer unavailable: COOP/COEP headers missing' },
      { type: 'warn', text: 'Falling back to ScriptProcessorNode' },
      { type: 'error', text: 'WASM instantiation failed' },
    ]}
  />
);
