import { type DownloadLinkRequest, type DownloadLinkResponse, type DownloadLinkResult, PAGE_MESSAGE_SOURCE } from '@/utils/faceit';

/**
 * Runs in FACEIT's own page (the MAIN world), so its requests carry the player's FACEIT
 * session and it can use the Cloudflare Turnstile FACEIT already loads. It does exactly what
 * FACEIT's "Download demo" button does: look up the match's demo, pass a Turnstile check
 * and ask FACEIT to sign a download link. The link is handed back to the content script,
 * which sends it to Stratbase. Nothing here talks to Stratbase.
 *
 * This depends on FACEIT's private website API and will break when FACEIT changes it.
 */

/** The Turnstile action FACEIT's own download button uses. */
const TURNSTILE_ACTION = 'matchroomFinished_downloadDemos';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export default defineContentScript({
  matches: ['https://www.faceit.com/*'],
  world: 'MAIN',
  main() {
    window.addEventListener('message', async (event) => {
      const data = event.data as Partial<DownloadLinkRequest> | null;

      if (event.source !== window || data?.source !== PAGE_MESSAGE_SOURCE || data.kind !== 'download-link:request' || !data.id || !data.matchId) {
        return;
      }

      const result = await downloadLink(data.matchId).catch(
        (error: unknown): DownloadLinkResult => ({ status: 'error', error: error instanceof Error ? error.message : String(error) }),
      );

      window.postMessage({ source: PAGE_MESSAGE_SOURCE, kind: 'download-link:response', id: data.id, result } satisfies DownloadLinkResponse, location.origin);
    });
  },
});

async function downloadLink(matchId: string): Promise<DownloadLinkResult> {
  const matchResponse = await fetch(`/api/match/v2/match/${encodeURIComponent(matchId)}`, { credentials: 'include' });

  if (!matchResponse.ok) {
    return { status: 'error', error: `FACEIT couldn't find this match (HTTP ${matchResponse.status}).` };
  }

  const match = (await matchResponse.json()) as { payload?: { demoURLs?: string[] } };
  const resourceUrl = match.payload?.demoURLs?.[0];

  if (!resourceUrl) {
    return { status: 'not-ready' };
  }

  const captchaToken = await turnstileToken();
  const linkResponse = await fetch('/api/download/v2/demos/download-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource_url: resourceUrl, captcha_token: captchaToken }),
  });

  if (!linkResponse.ok) {
    return {
      status: 'error',
      error: linkResponse.status === 401 ? 'Sign in to FACEIT first.' : `FACEIT wouldn't give a download link (HTTP ${linkResponse.status}).`,
    };
  }

  const link = (await linkResponse.json()) as { payload?: { download_url?: string } };

  return link.payload?.download_url
    ? { status: 'ok', url: link.payload.download_url }
    : { status: 'error', error: "FACEIT didn't give a download link." };
}

// Turnstile

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let siteKeyPromise: Promise<string> | null = null;

/**
 * Passes the Turnstile check FACEIT asks for before it signs a link. Usually invisible; if
 * Cloudflare wants the player to click, the widget shows in the corner of the page.
 */
async function turnstileToken(): Promise<string> {
  const [siteKey, turnstile] = await Promise.all([(siteKeyPromise ??= findSiteKey()), loadTurnstile()]);
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  document.body.append(container);
  let widgetId: string | undefined;

  try {
    return await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("FACEIT's security check timed out.")), 90_000);

      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action: TURNSTILE_ACTION,
        appearance: 'interaction-only',
        callback: (token: string) => {
          clearTimeout(timeout);
          resolve(token);
        },
        'error-callback': () => {
          clearTimeout(timeout);
          reject(new Error("FACEIT's security check failed. Try again."));
        },
      });
    });
  } finally {
    if (widgetId) {
      turnstile.remove(widgetId);
    }

    container.remove();
  }
}

/**
 * FACEIT doesn't put its Turnstile site key in the page, so it is found in FACEIT's
 * JavaScript bundles, which the browser has already cached.
 */
async function findSiteKey(): Promise<string> {
  const fromPage = document.querySelector<HTMLElement>('[data-sitekey^="0x"]')?.dataset.sitekey;

  if (fromPage) {
    return fromPage;
  }

  const scripts = new Set(
    Array.from(document.scripts)
      .map((script) => script.src)
      .concat(performance.getEntriesByType('resource').map((entry) => entry.name))
      .filter((src) => /^https:\/\/[^/]*faceit-cdn\.net\/.+\.js(\?|$)/.test(src)),
  );

  const keys = await Promise.all(
    [...scripts].map(async (src) => {
      try {
        const source = await (await fetch(src)).text();

        return /["'](0x4[A-Za-z0-9_-]{20,})["']/.exec(source)?.[1] ?? null;
      } catch {
        return null;
      }
    }),
  );

  const key = keys.find((found) => found !== null);

  if (!key) {
    siteKeyPromise = null;

    throw new Error("Couldn't find FACEIT's security check. FACEIT may have changed its site.");
  }

  return key;
}

/** FACEIT's own copy of Turnstile, or Cloudflare's if FACEIT hasn't loaded it yet. */
async function loadTurnstile(): Promise<Turnstile> {
  for (let tries = 0; tries < 20 && !window.turnstile; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (window.turnstile) {
    return window.turnstile;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load FACEIT's security check."));
    document.head.append(script);
  });

  for (let tries = 0; tries < 50 && !window.turnstile; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!window.turnstile) {
    throw new Error("Couldn't load FACEIT's security check.");
  }

  return window.turnstile;
}
