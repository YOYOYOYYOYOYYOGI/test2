// ---------------------------------------------------------------------------
// Google OAuth 2.0 for the Sheets API, using the Chrome identity API.
//
// Security model:
//  - No client secret is stored anywhere. The extension uses the public OAuth
//    client (installed-app type) whose secret is "not a secret" by design —
//    that flow requires the exact redirect URI
//    https://<EXTENSION_ID>.chromiumapp.org/<PROVIDER_PATH> which only this
//    extension id can claim, so a stolen client id is useless.
//  - The token exchange happens from the extension's own origin, so the
//    authorization code is never exposed to third parties.
//  - Access + refresh tokens live only in chrome.storage.local.
// ---------------------------------------------------------------------------
import { inExtension } from '../storage';
import type { AuthState, SpreadsheetConnection } from '../../types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_PATH = 'google-sheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'];

export function oauthClientId(): string {
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '806501874577-8l6q0ftvc47d2j6po1a5jqv97i42sv4o.apps.googleusercontent.com'
  );
}

/** Chrome identity uses the fixed redirect https://<id>.chromiumapp.org/<path> */
export function getRedirectUri(): string {
  const id = chrome.runtime?.id;
  if (id) return `https://${id}.chromiumapp.org/${OAUTH_PATH}`;
  // dev fallback
  const devId = 'abcdefghijklmnopqrstuvwxyzabcdef';
  return `https://${devId}.chromiumapp.org/${OAUTH_PATH}`;
}

export function getAuthUrl(extra?: { loginHint?: string; prompt?: 'consent' | 'select_account' }): string {
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: extra?.prompt ?? 'consent',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
  });
  if (extra?.loginHint) params.set('login_hint', extra.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getConsentUrl(): string {
  return getAuthUrl({ prompt: 'consent' });
}

async function exchangeCode(code: string): Promise<SpreadsheetConnection> {
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    error?: string; error_description?: string; scope?: string;
  };
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Google sign-in failed: ${detail}`);
  }
  const email = decodeEmail(data.access_token);
  const refreshExp = data.refresh_token ? Date.now() + 180 * 24 * 3600 * 1000 : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    refreshExpiresAt: refreshExp,
    tokenExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    email: email ?? undefined,
    spreadsheetId: '',
    spreadsheetName: '',
    worksheetName: '',
    connectedAt: Date.now(),
    viaOfflineGrant: Boolean(data.refresh_token),
  };
}

/** jwt payload decode (no signature verification — payload is base64 JSON) */
function decodeEmail(accessToken: string): string | null {
  try {
    const part = accessToken.split('.')[1];
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')) ) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(connection: SpreadsheetConnection): Promise<SpreadsheetConnection> {
  if (!connection.refreshToken) {
    throw new Error('This Google connection cannot be refreshed (it was created without a refresh token). Reconnect your account.');
  }
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    refresh_token: connection.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string; expires_in?: number; error?: string; error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `Token refresh failed (${res.status})`);
  }
  return {
    ...connection,
    accessToken: data.access_token,
    tokenExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Ensure the stored connection has a fresh access token (refreshes if needed). */
export async function ensureFreshConnection(connection: SpreadsheetConnection): Promise<SpreadsheetConnection> {
  const expires = connection.tokenExpiresAt ?? 0;
  if (Date.now() < expires - 5 * 60 * 1000) return connection;
  return refreshAccessToken(connection);
}

export async function validateTokenInfo(accessToken: string): Promise<{ email?: string; expiresIn?: number }> {
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as { email?: string; expires_in?: string; error?: string };
  if (!res.ok || data.error) throw new Error('Token validation failed');
  return { email: data.email, expiresIn: data.expires_in ? parseInt(data.expires_in, 10) : undefined };
}

/** Human-readable name of a Google account from Drive metadata is heavy; keep email only. */
export async function profileEmail(accessToken: string): Promise<string | null> {
  try {
    const { email } = await validateTokenInfo(accessToken);
    return email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// chrome.identity launch — only available inside the extension
// ---------------------------------------------------------------------------
export function launchChromeAuthFlow(interactive = true): Promise<{ code: string }> {
  const url = getAuthUrl({ prompt: interactive ? 'consent' : undefined });
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Google sign-in window was closed.'));
        return;
      }
      if (!redirectUrl) {
        reject(new Error('Google sign-in did not return a redirect.'));
        return;
      }
      const parsed = new URL(redirectUrl);
      const code = parsed.searchParams.get('code');
      const err = parsed.searchParams.get('error');
      if (err) {
        reject(new Error(decodeURIComponent(err).replace(/\+/g, ' ')));
        return;
      }
      if (!code) {
        reject(new Error('Missing authorization code from Google.'));
        return;
      }
      resolve({ code });
    });
  });
}

export function authState(): AuthState {
  return {
    status: 'signedOut',
    email: null,
    error: null,
    consent: inExtension() ? getConsentUrl() : null,
    tokenExpiresAt: null,
  };
}

export { SCOPES, OAUTH_PATH, exchangeCode };
