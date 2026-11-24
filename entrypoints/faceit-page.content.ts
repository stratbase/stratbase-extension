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
    headers: { 'Content-Type': 'application/json', 'x-faceit-captcha-token': captchaToken },
    body: JSON.stringify({ resourceUrl }),
  });

  if (!linkResponse.ok) {
    return {
      status: 'error',
      error: linkResponse.status === 401 ? 'Sign in to FACEIT first.' : `FACEIT wouldn't give a download link (HTTP ${linkResponse.status}).`,
    };
  }

  const link = (await linkResponse.json()) as { payload?: { downloadUrl?: string; download_url?: string } };
  const url = link.payload?.downloadUrl ?? link.payload?.download_url;

  return url ? { status: 'ok', url } : { status: 'error', error: "FACEIT didn't give a download link." };
}

// Turnstile

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
    /** FACEIT's runtime config, which holds its Turnstile site key. */
    faceitRuntime?: { APP_TURNSTILE_SITEKEY?: unknown };
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
 * FACEIT's site keeps its Turnstile site key in its runtime config (`window.faceitRuntime`,
 * also inlined in the page). Older versions of the site only had it in their JavaScript
 * bundles, which are searched as a fallback.
 */
async function findSiteKey(): Promise<string> {
  const fromRuntime = window.faceitRuntime?.APP_TURNSTILE_SITEKEY;

  if (typeof fromRuntime === 'string' && fromRuntime.startsWith('0x')) {
    return fromRuntime;
  }

  const fromInlineConfig = Array.from(document.scripts)
    .map((script) => /"APP_TURNSTILE_SITEKEY"\s*:\s*"(0x[A-Za-z0-9_-]+)"/.exec(script.textContent ?? '')?.[1])
    .find((key) => key !== undefined);

  if (fromInlineConfig) {
    return fromInlineConfig;
  }

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

let turnstilePromise: Promise<Turnstile> | null = null;

/** FACEIT's own copy of Turnstile, or Cloudflare's if FACEIT hasn't loaded it. */
function loadTurnstile(): Promise<Turnstile> {
  turnstilePromise ??= (async () => {
    if (!(await waitForTurnstile(500))) {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      document.head.append(script);
    }

    const turnstile = await waitForTurnstile(5_000);

    if (!turnstile) {
      throw new Error("Couldn't load FACEIT's security check.");
    }

    return turnstile;
  })().catch((error: unknown) => {
    turnstilePromise = null;

    throw error;
  });

  return turnstilePromise;
}

async function waitForTurnstile(ms: number): Promise<Turnstile | undefined> {
  for (let waited = 0; !window.turnstile && waited < ms; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return window.turnstile;
}
