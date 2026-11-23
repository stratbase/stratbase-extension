/**
 * Messages between the extension's pages and its background worker, which alone holds the
 * Stratbase token and talks to Stratbase.
 */

export interface Session {
  name: string;
  subscribed: boolean;
  subscribeUrl: string;
}

/**
 * Where a FACEIT match stands for the signed-in player. `new` means nobody has imported it;
 * `available` means another player has, so it can be added without fetching a link.
 */
export type MatchStatus = 'new' | 'available' | 'downloading' | 'processing' | 'ready' | 'failed';

export interface MatchState {
  status: MatchStatus;
  url: string | null;
  failure: string | null;
  /** Whether importing again could fix a failure: only a failed download can be. */
  retryable: boolean;
}

export type Request =
  | { type: 'session:get' }
  | { type: 'session:sign-in' }
  | { type: 'session:sign-out' }
  | { type: 'match:get'; matchId: string }
  | { type: 'match:import'; matchId: string; downloadUrl: string | null };

/**
 * Every answer is either the result or an error the UI can show. `signedOut` and
 * `notSubscribed` let it offer the right button instead of a message.
 */
export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; signedOut?: boolean; notSubscribed?: boolean; subscribeUrl?: string };

export async function send<T>(request: Request): Promise<Response<T>> {
  return (await browser.runtime.sendMessage(request)) as Response<T>;
}
