import '../src/components/tokens.css';

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'deep',
      values: [
        { name: 'deep', value: '#0c0b0a' },
        { name: 'surface', value: '#111010' },
        { name: 'lift', value: '#1a1917' },
      ],
    },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{
        fontFamily: "'DM Mono', monospace",
        color: '#d4cfc8',
        padding: '2rem',
      }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
