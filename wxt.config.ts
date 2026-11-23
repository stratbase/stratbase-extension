import { defineConfig } from 'wxt';

const stratbaseUrl = process.env.WXT_STRATBASE_URL ?? 'https://stratbase.app';

export default defineConfig({
  // Firefox too: its MV2 build can't run the page script in FACEIT's own world.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Stratbase',
    description: 'Import your FACEIT matches into Stratbase with one click.',
    // identity: signing in to Stratbase. storage: keeping the Stratbase token.
    permissions: ['identity', 'storage'],
    host_permissions: ['https://www.faceit.com/*', `${new URL(stratbaseUrl).origin}/*`],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'extension@stratbase.app', strict_min_version: '128.0' },
          },
        }
      : {}),
  }),
});
