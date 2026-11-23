import { OAUTH_CLIENT_ID, OAUTH_SCOPE, STRATBASE_URL } from './config';

/**
 * Signing in to Stratbase with OAuth 2 and PKCE, through the browser's own sign-in window.
 * Only the background worker uses this. The token is kept in extension storage, which
 * websites can't read.
 */

interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

const TOKENS_KEY = 'local:stratbaseTokens';
const tokens = storage.defineItem<Tokens | null>(TOKENS_KEY, { fallback: null });

export async function signIn(): Promise<void> {
  if (!OAUTH_CLIENT_ID) {
    throw new Error('This build has no Stratbase OAuth client ID.');
  }

  const redirectUri = browser.identity.getRedirectURL();
  const verifier = randomString(64);
  const state = randomString(32);
  const authorizeUrl = new URL(`${STRATBASE_URL}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  }).toString();

  const callback = await browser.identity.launchWebAuthFlow({ url: authorizeUrl.toString(), interactive: true });

  if (!callback) {
    throw new Error('Signing in was cancelled.');
  }

  const params = new URL(callback).searchParams;

  if (params.get('state') !== state) {
    throw new Error('Signing in failed: the reply was not for this sign-in.');
  }

  const code = params.get('code');

  if (!code) {
    throw new Error(params.get('error') === 'access_denied' ? 'Signing in was cancelled.' : 'Signing in failed.');
  }

  await tokens.setValue(
    await requestTokens({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }),
  );
}

export async function signOut(): Promise<void> {
  await tokens.setValue(null);
}

/**
 * A current access token, refreshed when it is about to expire, or null when signed out.
 */
export async function accessToken(): Promise<string | null> {
  const current = await tokens.getValue();

  if (!current) {
    return null;
  }

  if (current.expiresAt - 60_000 > Date.now()) {
    return current.accessToken;
  }

  if (!current.refreshToken) {
    await signOut();

    return null;
  }

  try {
    const refreshed = await requestTokens({ grant_type: 'refresh_token', refresh_token: current.refreshToken });
    await tokens.setValue(refreshed);

    return refreshed.accessToken;
  } catch {
    await signOut();

    return null;
  }
}

async function requestTokens(params: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${STRATBASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: OAUTH_CLIENT_ID, ...params }),
  });

  if (!response.ok) {
    throw new Error(`Stratbase refused the sign-in (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

function randomString(bytes: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function challengeFor(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
