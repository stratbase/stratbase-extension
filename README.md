# Stratbase browser extension

Adds an **Import to Stratbase** button to FACEIT match rooms. One click sends the match's demo to your Stratbase account, where it's analysed like any upload. It works in Chrome and Firefox.

Importing needs a Stratbase subscription.

## How it works

1. You sign in to Stratbase once, through Stratbase's own sign-in page (OAuth with PKCE). The extension gets a token that can only see your name and subscription and import FACEIT matches. It can't do anything else on your account.
2. On a finished match room, the extension asks Stratbase whether it already has the match. If a teammate imported it, you get it straight away and nothing is downloaded.
3. Otherwise the extension does what FACEIT's own **Download demo** button does: it asks FACEIT for a short-lived download link, using your FACEIT session and FACEIT's Cloudflare check. It sends that link to Stratbase, and Stratbase downloads the demo from FACEIT's storage.

The demo never passes through your connection, and Stratbase checks every link against FACEIT's API before it fetches it. A modified copy of this extension can't attach some other file to a match.

## What it can access

| Permission | Why |
| --- | --- |
| `www.faceit.com` | To show the button on match rooms and ask FACEIT for the download link. |
| Your Stratbase site | To sign you in and send imports. |
| `identity` | To open Stratbase's sign-in window. |
| `storage` | To keep your Stratbase token. Websites can't read it. |

The extension sends Stratbase the FACEIT match ID and the download link, and nothing else from FACEIT. It doesn't read your FACEIT password or cookies; FACEIT's own page sends them with its requests, as it does when you click Download demo.

## Development

```sh
bun install
cp .env.example .env   # set WXT_OAUTH_CLIENT_ID, and WXT_STRATBASE_URL for a local Stratbase
bun run dev            # Chrome
bun run dev:firefox    # Firefox
```

`bun run compile` type-checks. `bun run zip` and `bun run zip:firefox` build the store packages.

Everything that depends on FACEIT's website is in `utils/faceit.ts` and `entrypoints/faceit-page.content.ts`. FACEIT changes its site without notice, so when the button disappears or imports break, look there first.

### The OAuth client

The extension signs in with a public Passport client on Stratbase, which has no secret. Create it once with the extension's redirect URLs. Each browser gives an extension its own URL, from `browser.identity.getRedirectURL()`:

- Chrome: `https://<extension id>.chromiumapp.org/`
- Firefox: `https://<hash of the add-on id>.extensions.allizom.org/`

```sh
php artisan passport:client --public --name="Stratbase extension" \
  --redirect_uri="https://<chrome id>.chromiumapp.org/,https://<firefox hash>.extensions.allizom.org/"
```

Put the client ID in `WXT_OAUTH_CLIENT_ID`, and in the `OAUTH_CLIENT_ID` repository variable for release builds.

## Releases

Tagging a commit `vX.Y.Z` builds both zips in GitHub Actions and attaches them to a GitHub release. The zips in the stores are those files, so anyone can check them against the tagged source.

## Licence

MIT
