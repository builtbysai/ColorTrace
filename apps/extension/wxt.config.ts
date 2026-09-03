import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  zip: {
    // Firefox review needs the complete pnpm workspace, not only apps/extension,
    // because the extension depends on the local color-core and trace-model packages.
    sourcesRoot: '../..',
    excludeSources: ['**/.output/**', '**/.wxt/**'],
  },
  manifest: ({ browser }) => ({
    name: 'ColorTrace',
    short_name: 'ColorTrace',
    description: 'Local-first visual color debugger.',
    permissions: ['activeTab', 'scripting'],
    action: { default_title: 'Inspect color on this page' },
    commands: {
      'activate-picker': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Start the ColorTrace picker on the active page',
      },
      'open-dashboard': {
        description: 'Open local ColorTrace history',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: '{4594ab8c-5c7c-5eab-a1b8-fdee041cb882}',
              strict_min_version: '128.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
