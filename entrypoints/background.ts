import { signIn, signOut } from '@/utils/auth';
import type { Request, Response } from '@/utils/messages';
import { getMatch, getSession, importMatch } from '@/utils/stratbase';

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

      return { ok: true, data: null };
    case 'session:sign-out':
      await signOut();

      return { ok: true, data: null };
    case 'match:get':
      return getMatch(request.matchId);
    case 'match:import':
      return importMatch(request.matchId, request.downloadUrl);
  }
}

