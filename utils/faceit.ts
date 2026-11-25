/**
 * Everything that depends on FACEIT's website lives here and in
 * entrypoints/faceit-page.content.ts. FACEIT changes its site without notice, so when the
 * button disappears or imports break, this is where to look.
 */

/** A match room: https://www.faceit.com/{language}/cs2/room/{match id}, sometimes with a tab after it. */
const MATCH_ROOM = /^https:\/\/www\.faceit\.com\/[^/]+\/cs2\/room\/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/;

export function matchIdFromUrl(url: string): string | null {
  return MATCH_ROOM.exec(url)?.[1] ?? null;
}

/** Where in a match room the button goes: the overview, or the stats tab FACEIT now opens by default. */
export type Placement = 'overview' | 'stats';

/** The stats tab and its sub-tabs: …/room/{match id}/scoreboard, …/scoreboard/duels and so on. */
const STATS_TAB = /^[^?#]*\/room\/[^/?#]+\/scoreboard(?:[/?#]|$)/;

export function placementFromUrl(url: string): Placement {
  return STATS_TAB.test(url) ? 'stats' : 'overview';
}

/**
 * Where the button goes. A selector rather than a lookup, because WXT's autoMount refuses an
 * anchor that already exists when it starts.
 *
 * - overview: under FACEIT's own "Watch demo" button, in the match room's info panel.
 * - stats: the stats tab has no demo buttons, so a full-width banner goes under its Summary,
 *   Duels and Utility tabs, where FACEIT shows its own "What did you think…" feedback box.
 */
export const BUTTON_ANCHORS: Record<Placement, string> = {
  overview: 'div[name="info"] div:first-child > div:first-child > button',
  stats: 'div[class*="styles__MainNavBar"]',
};

/**
 * The page script (MAIN world) and the content script (isolated world) talk with
 * window.postMessage. The page can read these too, which is fine: all they carry is a
 * download link that Stratbase checks against FACEIT itself.
 */
export const PAGE_MESSAGE_SOURCE = 'stratbase-extension';

export type DownloadLinkResult =
  | { status: 'ok'; url: string }
  | { status: 'not-ready' }
  | { status: 'error'; error: string };

export interface DownloadLinkRequest {
  source: typeof PAGE_MESSAGE_SOURCE;
  kind: 'download-link:request';
  id: string;
  matchId: string;
}

export interface DownloadLinkResponse {
  source: typeof PAGE_MESSAGE_SOURCE;
  kind: 'download-link:response';
  id: string;
  result: DownloadLinkResult;
}

/**
 * Asks the page script for a signed link to the match's demo, made with the player's own
 * FACEIT session the way FACEIT's "Download demo" button makes one.
 */
export function requestDownloadLink(matchId: string): Promise<DownloadLinkResult> {
  const id = crypto.randomUUID();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish({ status: 'error', error: 'FACEIT took too long to give a download link.' }), 120_000);

    function onMessage(event: MessageEvent) {
      const data = event.data as Partial<DownloadLinkResponse> | null;

      if (event.source === window && data?.source === PAGE_MESSAGE_SOURCE && data.kind === 'download-link:response' && data.id === id && data.result) {
        finish(data.result);
      }
    }

    function finish(result: DownloadLinkResult) {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(result);
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ source: PAGE_MESSAGE_SOURCE, kind: 'download-link:request', id, matchId } satisfies DownloadLinkRequest, location.origin);
  });
}
