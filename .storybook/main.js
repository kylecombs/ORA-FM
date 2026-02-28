/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    '../src/components/**/*.mdx',
    '../src/components/**/*.stories.@(js|jsx)',
  ],
  addons: ['@storybook/addon-essentials'],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    // Remove the cross-origin isolation headers for Storybook
    // (they break Storybook's iframe communication)
    return config;
  },
};
export default config;
