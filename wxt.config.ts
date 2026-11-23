import { defineConfig } from 'wxt';

const stratbaseUrl = new URL(process.env.WXT_STRATBASE_URL ?? 'https://stratbase.app');

// Pins the Chrome extension ID (joonefmddfmanlgikenehlfopafpapng) for unpacked installs, which
// otherwise get an ID from their folder path, so sign-in's redirect URL would differ on every
// machine. The Chrome Web Store rejects a manifest with a key, so store builds set WXT_STORE_BUILD.
const chromeKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnab8IgckRimgldmPAtYJ3eRpWLxRxUO68TWwIyXvpG3GIu1I/45xqCsyzXeSGvEvRk7orgMa3GI6bt1CKg0hNGw8M3Hajav0agd2MkJk3P0vzvZNJc1+1C5XP2Uzbl0/5/rr8XRXcn0CnhCi4XjNgMa8+JUAyMKkVmUmFsi/TbC3+o0kgbGFegGjwipETLb04EkxvQJT0LL/R30OpKjl80epp2gECgfihLvpZijFmidGFoRIneYwcVpvNldCvDTd/Kvz9vNqid8/wMzd+z0eRbZAXclaiLAb/Y5Z/log4f8t0bPXXUzEIr4Aw8hlLORmL7NnvGUXhRM0D4aKEo3L/QIDAQAB';
const storeBuild = process.env.WXT_STORE_BUILD === 'true';

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
      : storeBuild
        ? {}
        : { key: chromeKey }),
  }),
});
