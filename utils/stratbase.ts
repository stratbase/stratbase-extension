import { accessToken, signOut } from './auth';
import { STRATBASE_URL } from './config';
import type { MatchState, Response, Session } from './messages';

/**
 * Stratbase's extension API. Only the background worker uses this.
 */

export async function getSession(): Promise<Response<Session | null>> {
  const response = await call<{ user: { name: string }; subscribed: boolean; subscribe_url: string }>('GET', '/me');

  if (!response.ok) {
    return response.signedOut ? { ok: true, data: null } : response;
  }

  return {
    ok: true,
    data: { name: response.data.user.name, subscribed: response.data.subscribed, subscribeUrl: response.data.subscribe_url },
  };
}

export function getMatch(matchId: string): Promise<Response<MatchState>> {
  return call('GET', `/faceit/matches/${encodeURIComponent(matchId)}`);
}

export function importMatch(matchId: string, downloadUrl: string | null): Promise<Response<MatchState>> {
  return call('POST', `/faceit/matches/${encodeURIComponent(matchId)}/import`, { download_url: downloadUrl });
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<Response<T>> {
  const token = await accessToken();

  if (!token) {
    return { ok: false, error: 'Sign in to Stratbase first.', signedOut: true };
  }

  let response: globalThis.Response;

  try {
    response = await fetch(`${STRATBASE_URL}/api/extension${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "Couldn't reach Stratbase." };
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (response.ok && json !== null) {
    return { ok: true, data: json as T };
  }

  if (response.status === 401) {
    await signOut();

    return { ok: false, error: 'Sign in to Stratbase again.', signedOut: true };
  }

  if (response.status === 402) {
    return {
      ok: false,
      error: String(json?.message ?? 'This needs a Stratbase subscription.'),
      notSubscribed: true,
      subscribeUrl: typeof json?.subscribe_url === 'string' ? json.subscribe_url : `${STRATBASE_URL}/subscribe`,
    };
  }

  if (response.status === 429) {
    return { ok: false, error: 'Too many imports at once. Try again in a minute.' };
  }

  return { ok: false, error: firstError(json) ?? `Stratbase answered with HTTP ${response.status}.` };
}

/** Laravel's validation errors, or its message. */
function firstError(json: Record<string, unknown> | null): string | null {
  const errors = json?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : undefined;

  return first ?? (typeof json?.message === 'string' ? json.message : null);
}
