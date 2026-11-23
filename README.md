# Stratbase browser extension

This is a Chrome and Firefox (MV3) extension that adds an **Import to Stratbase** button to finished FACEIT CS2 match rooms, under FACEIT's **Watch demo** button. Click it to send the match demo straight to your Stratbase account for analysis.

Importing matches requires a Stratbase subscription.

## How it works

1. You sign in to Stratbase once over OAuth (with PKCE). The token only has the `faceit:import` scope, so the extension can read your name and subscription status and queue FACEIT imports, and nothing else.
2. When you open a finished CS2 match room, the extension asks Stratbase if it already has the match. If another player has imported it, clicking **Add to Stratbase** adds it to your account without downloading anything.
3. Otherwise, the extension asks FACEIT for a short-lived demo link using your FACEIT session and Cloudflare Turnstile check, then sends that link to Stratbase. Stratbase downloads the demo directly from FACEIT's storage.

The demo never goes through your connection. Stratbase also checks every link against FACEIT's API before fetching it, so a modified build of this extension can't point a match at a different file.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `https://www.faceit.com/*` | Adds the button to match rooms and requests the signed demo link from FACEIT. |
| `https://stratbase.app/*` | Signs you in and calls Stratbase's extension API (or your local URL in dev builds). |
| `identity` | Opens the browser's OAuth sign-in window. |
| `storage` | Saves your Stratbase OAuth tokens locally where websites can't read them. |

The extension only sends Stratbase the match ID and the signed download URL. It never reads your FACEIT password or cookies: the page script runs on `www.faceit.com`, so the browser sends your session cookies with the request just as it does when you download a demo yourself.

## Development

```sh
bun install
cp .env.example .env   # set WXT_OAUTH_CLIENT_ID (and WXT_STRATBASE_URL for local dev)
bun run dev            # Chrome
bun run dev:firefox    # Firefox
```

Use `bun run compile` to type-check, and `bun run zip` or `bun run zip:firefox` to build store packages.

Everything that relies on FACEIT's DOM or internal endpoints is in `utils/faceit.ts` and `entrypoints/faceit-page.content.ts`. FACEIT changes its site without notice, so look there first if the button disappears or imports break.

### OAuth client

Sign-in uses a public Laravel Passport client on Stratbase with no client secret. Create it once with both browsers' redirect URLs from `browser.identity.getRedirectURL()`:

- Chrome: `https://<extension id>.chromiumapp.org/`
- Firefox: `https://<hash of the add-on id>.extensions.allizom.org/` (add-on ID `extension@stratbase.app`, Firefox 140+)

```sh
php artisan passport:client --public --name="Stratbase extension" \
  --redirect_uri="https://<chrome id>.chromiumapp.org/,https://<firefox hash>.extensions.allizom.org/"
```

Put the client ID in `WXT_OAUTH_CLIENT_ID` in your local `.env`, and in the `OAUTH_CLIENT_ID` repository variable on GitHub for release builds.

## Releases

Tagging a commit `vX.Y.Z` builds both zips in GitHub Actions (against `https://stratbase.app`) and attaches them to a GitHub release. The Chrome Web Store and Firefox Add-ons packages are those zips, so anyone can compare them against the tagged source.

## Licence

MIT
