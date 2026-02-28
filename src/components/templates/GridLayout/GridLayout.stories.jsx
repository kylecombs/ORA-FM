import { useState } from 'react';
import GridLayout from './GridLayout';
import Toolbar from '../../organisms/Toolbar';
import ModulePanel from '../../organisms/ModulePanel';
import ConsolePanel from '../../organisms/ConsolePanel';

export default {
  title: 'Templates/GridLayout',
  component: GridLayout,
  parameters: { layout: 'fullscreen' },
};

const CanvasPlaceholder = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--ora-dim)',
    fontSize: 'var(--ora-text-sm)',
  }}>
    Canvas Area — Drag modules here
  </div>
);

const DetailsPlaceholder = () => (
  <div style={{
    padding: 'var(--ora-space-md)',
    color: 'var(--ora-dim)',
    fontSize: 'var(--ora-text-xs)',
  }}>
    Module Details Panel
  </div>
);

export const Default = () => {
  const [sidebar, setSidebar] = useState(true);
  const [console_, setConsole] = useState(false);

  return (
    <GridLayout
      sidebarOpen={sidebar}
      consoleOpen={console_}
      toolbar={
        <Toolbar
          engineStatus="ready"
          panelOpen={sidebar}
          consoleOpen={console_}
          onTogglePanel={() => setSidebar((p) => !p)}
          onToggleConsole={() => setConsole((p) => !p)}
        />
      }
      sidebar={
        <ModulePanel
          onSelectModule={(m) => console.log(m)}
          onClose={() => setSidebar(false)}
        />
      }
      canvas={<CanvasPlaceholder />}
      console={
        <ConsolePanel
          lines={[
            { type: 'info', text: 'Engine booted' },
            { type: 'info', text: 'SynthDef loaded: sine_osc' },
          ]}
          onClose={() => setConsole(false)}
        />
      }
    />
  );
};

export const FullyOpen = () => (
  <GridLayout
    sidebarOpen
    detailsOpen
    consoleOpen
    toolbar={<Toolbar engineStatus="ready" panelOpen consoleOpen />}
    sidebar={<ModulePanel />}
    canvas={<CanvasPlaceholder />}
    details={<DetailsPlaceholder />}
    console={
      <ConsolePanel
        lines={[
          { type: 'info', text: 'Node 1001: sine_osc' },
          { type: 'debug', text: 'Bus 16 allocated' },
        ]}
      />
    }
  />
);

export const Minimal = () => (
  <GridLayout
    toolbar={<Toolbar engineStatus="idle" />}
    canvas={<CanvasPlaceholder />}
  />
);
