import { defineConfig } from 'wxt';

const stratbaseUrl = new URL(process.env.WXT_STRATBASE_URL ?? 'https://stratbase.app');

export default defineConfig({
  // Firefox too: its MV2 build can't run the page script in FACEIT's own world.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Stratbase',
    description: 'Import your FACEIT matches into Stratbase with one click.',
    // identity: signing in to Stratbase. storage: keeping the Stratbase token.
    permissions: ['identity', 'storage'],
    // No port: Firefox's match patterns don't allow one, and Chrome's ignore it.
    host_permissions: ['https://www.faceit.com/*', `${stratbaseUrl.protocol}//${stratbaseUrl.hostname}/*`],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'extension@stratbase.app',
              // 140 is the first Firefox that asks for data consent at install.
              strict_min_version: '140.0',
              // It sends Stratbase the match and FACEIT's link to its demo, and signs in to Stratbase.
              data_collection_permissions: { required: ['websiteContent', 'authenticationInfo'] },
            },
          },
        }
      : {}),
  }),
});
