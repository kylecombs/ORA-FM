import { useEffect } from 'react';
import '../src/components/tokens.css';

/** Apply data-theme on <html> so tokens resolve correctly */
function ThemeDecorator(Story, context) {
  const theme = context.globals.theme || 'dark';
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const bg = theme === 'light' ? '#e0e0e0' : '#0c0b0a';
  const fg = theme === 'light' ? '#2a2a2a' : '#d4cfc8';

  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      color: fg,
      background: bg,
      padding: '2rem',
      minHeight: '100vh',
    }}>
      <Story />
    </div>
  );
}

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Dark / Light mode',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
    layout: 'centered',
  },
  decorators: [ThemeDecorator],
};

export default preview;
