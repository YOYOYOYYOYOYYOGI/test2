// ---------------------------------------------------------------------------
// Google OAuth 2.0 for the Sheets API — Chrome Extension flow (Manifest V3).
//
// How this works (and what was wrong before):
//  - The extension previously bundled a hard-coded OAuth client ID
//    (806501874577-8l6q0…apps.googleusercontent.com) that is no longer
//    registered in any Google Cloud project — Google answers every connect
//    attempt with "Error 401: invalid_client / The OAuth client was not
//    found". No code change can revive a deleted client, so that ID has been
//    removed and NO client ID is hard-coded anymore.
//  - Authentication uses the official Chrome Extension mechanism:
//    chrome.identity.getAuthToken with the manifest "oauth2" section. The
//    OAuth client must be created in Google Cloud Console as application
//    type "Chrome Extension", with the Item ID set to THIS extension's ID,
//    and the generated Client ID pasted into the ONE central configuration
//    spot: public/manifest.json → "oauth2" → "client_id".
//  - The manifest "key" pins a stable extension ID, so the ID (and therefore
//    the registered OAuth client) never changes between rebuilds, folders or
//    computers — the console configuration only has to be done once.
//  - Chrome caches the access token and refreshes it automatically, so no
//    token (and no sensitive OAuth data) is stored by the extension. Access
//    tokens are fetched on demand via getAuthToken and only live in memory.
//  - Technical errors are logged to the console only; users only ever see
//    friendly messages.
// ---------------------------------------------------------------------------
import { inExtension } from '../storage';

/** Scopes the extension actually uses:
 *   spreadsheets  — read/write the selected spreadsheet's rows/columns
 *   drive.readonly — list spreadsheets owned by / opened from the account
 *   userinfo.email — show which Google account is connected
 * (Google Sheets API + Google Drive API must be enabled in the Cloud
 *  project; see README "Connect Google Sheets".) */
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Marker value shipped in manifest oauth2.client_id until the owner pastes
 *  their real client id (see isClientIdConfigured). */
const UNCONFIGURED_MARKER = 'PASTE_YOUR_GOOGLE_CLIENT_ID_HERE';

/** The OAuth client id from the ONE central configuration location:
 *  public/manifest.json → "oauth2" → "client_id". */
export function oauthClientId(): string {
  try {
    const manifest = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
      ? (chrome.runtime.getManifest() as { oauth2?: { client_id?: string } })
      : undefined;
    return (manifest?.oauth2?.client_id ?? '').trim();
  } catch {
    return '';
  }
}

/** True when the manifest carries a real (non-placeholder) client id. */
export function isClientConfigured(): boolean {
  return isClientIdConfigured(oauthClientId());
}

export function isClientIdConfigured(id: string): boolean {
  const clean = (id ?? '').trim();
  if (!clean || clean.includes(UNCONFIGURED_MARKER)) return false;
  // Chrome Extension OAuth client ids always look like
  // <project>-<hash>.apps.googleusercontent.com
  return clean.endsWith('.apps.googleusercontent.com');
}

/** Short label for the connected client (kept out of any UI error text). */
export function clientIdHint(id: string): string {
  if (!id) return 'not configured';
  if (!isClientIdConfigured(id)) return 'not configured yet';
  return `…${id.slice(-14)}`;
}

// ---------------------------------------------------------------------------
// Typed errors — every error a user can hit has a friendly message; the raw
// technical detail only ever goes to the extension console (console.error).
// ---------------------------------------------------------------------------
export type GoogleAuthErrorCode =
  | 'not_configured' // manifest client_id is empty/placeholder
  | 'user_cancelled' // user closed the consent window
  | 'auth_required' // no valid grant/token (expired, revoked, signed out)
  | 'not_extension' // chrome.identity unavailable
  | 'unknown';

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;
  /** raw technical detail (console only) */
  technical?: string;
  constructor(code: GoogleAuthErrorCode, message: string, technical?: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    this.technical = technical;
  }
}

const FRIENDLY: Record<GoogleAuthErrorCode, string> = {
  not_configured:
    'Google OAuth is not configured yet. Open Settings → Spreadsheet → "Google OAuth setup" and paste your OAuth Client ID into the manifest (single spot), then reload the extension.',
  user_cancelled: 'Google sign-in was cancelled. You can try again whenever you are ready.',
  auth_required: 'Google connection expired. Please reconnect your Google Account.',
  not_extension: 'Google sign-in requires the Chrome extension. Load the built extension in Chrome (see README).',
  unknown: 'Google connection could not be completed. Please reconnect your Google Account.',
};

export function friendlyAuthMessage(code: GoogleAuthErrorCode | undefined | null, technical?: string): string {
  if (technical && /user did not approve|user cancelled|cancelled/i.test(technical)) {
    return FRIENDLY.user_cancelled;
  }
  return FRIENDLY[code ?? 'unknown'] ?? FRIENDLY.unknown;
}

function mapIdentityError(message: string): GoogleAuthError {
  const m = message || '';
  if (/not signed in|not authorized|authorization has expired|oauth2 not allowed|not granted|approval|consent|invalid grant|signed out/i.test(m)) {
    return new GoogleAuthError('auth_required', FRIENDLY.auth_required, m);
  }
  if (/user did not approve|did not approve access|cancelled/i.test(m)) {
    return new GoogleAuthError('user_cancelled', FRIENDLY.user_cancelled, m);
  }
  return new GoogleAuthError('unknown', FRIENDLY.unknown, m);
}

// ---------------------------------------------------------------------------
// chrome.identity — token handling
// ---------------------------------------------------------------------------

/** Get (or silently refresh) a Google access token through Chrome's identity
 *  API. Chrome caches the token and refreshes it automatically; tokens are
 *  never stored by the extension itself.
 *  - interactive=true  → shows the Google consent window when needed.
 *  - interactive=false → silent; succeeds only while a valid grant exists
 *    (used for automatic renewal of expired tokens). */
export function getGoogleAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!inExtension() || typeof chrome?.identity?.getAuthToken !== 'function') {
      reject(new GoogleAuthError('not_extension', FRIENDLY.not_extension));
      return;
    }
    if (!isClientConfigured()) {
      reject(new GoogleAuthError('not_configured', FRIENDLY.not_configured));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token?: string) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError?.message) {
        console.warn('[google oauth] technical detail:', lastError.message);
        reject(mapIdentityError(lastError.message));
        return;
      }
      if (!token) {
        reject(new GoogleAuthError('auth_required', FRIENDLY.auth_required, 'getAuthToken returned no token'));
        return;
      }
      resolve(token);
    });
  });
}

/** Drop Chrome's cached tokens for this extension (called on disconnect).
 *  Only the Google connection is removed — never any extension data. */
export async function clearCachedGoogleTokens(): Promise<void> {
  try {
    if (typeof chrome?.identity?.clearAllCachedAuthTokens === 'function') {
      await chrome.identity.clearAllCachedAuthTokens();
    } else if (typeof chrome?.identity?.removeCachedAuthToken === 'function') {
      // older Chrome: remove whatever token Chrome has cached
      await new Promise<void>((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          const t = token || undefined;
          const lastError = chrome.runtime?.lastError;
          console.warn('[google oauth] removeCachedAuthToken cleanup:', lastError?.message ?? 'none');
          if (t && typeof chrome.identity.removeCachedAuthToken === 'function') {
            chrome.identity.removeCachedAuthToken({ token: t }, () => resolve());
          } else {
            resolve();
          }
        });
      });
    }
  } catch (e) {
    console.warn('[google oauth] token cache cleanup failed (non-fatal):', e);
  }
}

/** Email of the connected Google account, from the token (scoped by the
 *  userinfo.email scope). Failure is non-fatal — returns null. */
export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
    if (!res.ok || data.error) {
      console.warn('[google oauth] tokeninfo failed:', data.error ?? `HTTP ${res.status}`);
      return null;
    }
    return data.email ?? null;
  } catch (e) {
    console.warn('[google oauth] tokeninfo error:', e);
    return null;
  }
}

/** Build the connection object persisted in settings — deliberately WITHOUT
 *  any token: Chrome's identity cache is the token store. */
export function connectionFromSession(opts: {
  email?: string | null;
  spreadsheetId?: string;
  spreadsheetName?: string;
  worksheetName?: string;
}): {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: null;
  tokenExpiresAt: number;
  email?: string;
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  connectedAt: number;
  viaOfflineGrant: boolean;
} {
  return {
    accessToken: '', // tokens are held by Chrome (chrome.identity), never stored
    refreshToken: '',
    refreshExpiresAt: null,
    tokenExpiresAt: 0,
    email: opts.email ?? undefined,
    spreadsheetId: opts.spreadsheetId ?? '',
    spreadsheetName: opts.spreadsheetName ?? '',
    worksheetName: opts.worksheetName ?? '',
    connectedAt: Date.now(),
    viaOfflineGrant: false,
  };
}
