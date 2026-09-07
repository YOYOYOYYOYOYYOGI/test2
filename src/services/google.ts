// Google OAuth + Sheets API access.
// Auth uses chrome.identity.launchWebAuthFlow with a user-provided OAuth Client ID
// (configured once in Settings). Tokens stay in memory only — nothing is persisted.
import { SCOPES } from '../constants';
import { getSettings } from './store';

const hasIdentity = typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow;

let cached: { token: string; exp: number } | null = null;

export const oauthReady = (): boolean => hasIdentity && !!getSettings().clientId;

export function isSignedIn(): Promise<boolean> {
  if (!oauthReady()) return Promise.resolve(false);
  return getAccessToken(false).then(() => true).catch(() => false);
}

export async function connect(): Promise<void> {
  if (!hasIdentity) throw new Error('Chrome identity API is not available.');
  await getAccessToken(true);
}

export async function disconnect(): Promise<void> {
  if (cached) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(cached.token)).catch(() => undefined);
  }
  cached = null;
}

function authUrl(clientId: string, prompt: 'none' | 'select_account'): string {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPES,
    prompt,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

function flow(url: string, silent: boolean): Promise<string> {
  return new Promise((res, rej) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: !silent }, (redirect) => {
      const err = chrome.runtime.lastError;
      const fail = (m: string) => rej(new Error(silent ? 'silent-fail' : m));
      if (err || !redirect) return fail('Google sign-in failed or was cancelled.');
      try {
        const params = new URLSearchParams(new URL(redirect).hash.replace(/^#/, ''));
        const token = params.get('access_token');
        const exp = Number(params.get('expires_in') || '3600');
        if (!token) return fail('Google sign-in failed.');
        cached = { token, exp: Date.now() + Math.max(60, exp - 120) * 1000 };
        res(token);
      } catch {
        fail('Google sign-in failed.');
      }
    });
  });
}

export async function getAccessToken(interactive: boolean): Promise<string> {
  if (cached && cached.exp > Date.now()) return cached.token;
  const clientId = getSettings().clientId;
  if (!clientId) throw new Error('Google Sheets is not set up yet. Add your OAuth Client ID in Settings.');
  try {
    return await flow(authUrl(clientId, 'none'), true);
  } catch (e) {
    if (!interactive) throw new Error('Not signed in to Google.');
    return flow(authUrl(clientId, 'select_account'), false);
  }
}

/** Human-friendly messages for common Google API failures. */
async function apiError(res: Response, what: string): Promise<Error> {
  let detail = '';
  try {
    const j = await res.json();
    detail = j?.error?.message || '';
  } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) return new Error(`Google access was rejected while ${what}. Try reconnecting your account in Settings.`);
  if (res.status === 404) return new Error(`Spreadsheet or worksheet not found while ${what}. Check the connection in Settings.`);
  if (res.status >= 500) return new Error(`Google Sheets is temporarily unavailable while ${what}. Please try again.`);
  return new Error(detail || `Google Sheets request failed while ${what} (error ${res.status}).`);
}

async function authFetch(url: string, init?: RequestInit, interactive = true): Promise<Response> {
  let token: string;
  try {
    token = await getAccessToken(interactive);
  } catch (e) {
    throw new Error(e instanceof Error && e.message !== 'silent-fail' ? e.message : 'Not signed in to Google. Connect your account in Settings.');
  }
  let res = await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: 'Bearer ' + token } });
  if (res.status === 401) {
    cached = null; // expired — get a fresh one and retry once
    token = await getAccessToken(interactive);
    res = await fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: 'Bearer ' + token } });
  }
  return res;
}

export async function getSheetInfo(sheetId: string): Promise<{ sheets: string[] }> {
  let res: Response;
  try {
    res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`);
  } catch {
    throw new Error('Network problem while opening the spreadsheet. Check your internet connection.');
  }
  if (!res.ok) throw await apiError(res, 'opening the spreadsheet');
  const data = await res.json();
  return { sheets: (data.sheets || []).map((s: { properties: { title: string } }) => s.properties.title) };
}

export async function readHeaders(sheetId: string, sheetName: string): Promise<string[]> {
  const res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(qRange(sheetName, '1:1'))}`);
  if (!res.ok) throw await apiError(res, 'reading headers');
  const v = await res.json();
  return (v.values?.[0] || []).map((h: unknown) => String(h).trim());
}

/** Append missing columns to the header row (and only them). Never touches existing columns. */
export async function ensureColumns(sheetId: string, sheetName: string, existing: string[], wanted: string[]): Promise<string[]> {
  const have = existing.map((h) => h.trim().toLowerCase());
  const missing = wanted.filter((w) => !have.includes(w.trim().toLowerCase()));
  if (missing.length > 0) {
    const range = qRange(sheetName, `${colA1(existing.length)}1:${colA1(existing.length + missing.length - 1)}1`);
    const res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [missing] }),
    });
    if (!res.ok) throw await apiError(res, 'creating columns');
  }
  return [...existing, ...missing];
}

/** Look up an order number in its column. Returns { row: 1-based row or 0, last: last data row }. */
export async function findRowByOrderNumber(sheetId: string, sheetName: string, col: string, orderNumber: string): Promise<{ row: number; last: number }> {
  const res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(qRange(sheetName, `${col}:${col}`))}`);
  if (!res.ok) throw await apiError(res, 'looking up the order number');
  const v = await res.json();
  const rows: string[][] = v.values || [];
  const target = orderNumber.trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === target) return { row: i + 1, last: rows.length };
  }
  return { row: 0, last: rows.length };
}

/** Write one full row. Updates the given row, or appends a new row when rowNo is 0. Returns the 1-based row. */
export async function writeRow(sheetId: string, sheetName: string, rowNo: number, values: string[]): Promise<number> {
  if (rowNo > 0) {
    const range = qRange(sheetName, `A${rowNo}:${colA1(values.length - 1)}${rowNo}`);
    const res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    });
    if (!res.ok) throw await apiError(res, 'updating the order row');
    return rowNo;
  }
  const res = await authFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(qRange(sheetName, 'A:A'))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw await apiError(res, 'adding the order row');
  const data = await res.json();
  const m = /![A-Z]+(\d+)/.exec(String(data.updates?.updatedRange || ''));
  return m ? Number(m[1]) : 0;
}

/** Quote a sheet name for A1 ranges (names with spaces need single quotes). */
export function qRange(sheetName: string, rest: string): string {
  return `'` + sheetName.replace(/'/g, "''") + `'!` + rest;
}

/** 0-based index -> A1 column letters (0 -> A, 26 -> AA). */
export function colA1(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
