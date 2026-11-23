/** Where Stratbase lives. Override with WXT_STRATBASE_URL for local development. */
export const STRATBASE_URL = (import.meta.env.WXT_STRATBASE_URL ?? 'https://stratbase.app').replace(/\/$/, '');

/** The extension's public OAuth client on Stratbase. It holds no secret: sign-in uses PKCE. */
export const OAUTH_CLIENT_ID: string = import.meta.env.WXT_OAUTH_CLIENT_ID ?? '';

/** The only thing the extension's token may do. */
export const OAUTH_SCOPE = 'faceit:import';
