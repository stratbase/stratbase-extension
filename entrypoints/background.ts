import { signIn, signOut } from '@/utils/auth';
import type { Request, Response } from '@/utils/messages';
import { getMatch, getSession, importMatch } from '@/utils/stratbase';

const FACEIT_MATCH_ID = /^1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
    // Only the extension's own pages and its FACEIT content script may ask.
    if (sender.id !== browser.runtime.id || (sender.tab && !sender.url?.startsWith('https://www.faceit.com/'))) {
      return false;
    }

    handle(request).then(sendResponse, (error: unknown) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );

    return true;
  });
});

async function handle(request: Request): Promise<Response<unknown>> {
  switch (request.type) {
    case 'session:get':
      return getSession();
    case 'session:sign-in':
      await signIn();

      return getSession();
    case 'session:sign-out':
      await signOut();

      return { ok: true, data: null };
    case 'match:get':
      return FACEIT_MATCH_ID.test(request.matchId) ? getMatch(request.matchId) : invalidMatch();
    case 'match:import':
      return FACEIT_MATCH_ID.test(request.matchId) ? importMatch(request.matchId, request.downloadUrl) : invalidMatch();
  }
}

function invalidMatch(): Response<never> {
  return { ok: false, error: "That isn't a FACEIT match." };
}
