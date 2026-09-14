// ---------------------------------------------------------------------------
// MV3 background service worker — auth (chrome.identity), spreadsheet ops and
// offline sync. Kept intentionally small: pages talk to chrome.storage
// directly for local data and send messages here only when the worker is
// required (identity flow, sheet API, sync).
// ---------------------------------------------------------------------------
import { clearCachedGoogleTokens, connectionFromSession, friendlyAuthMessage, getGoogleAuthToken, GoogleAuthError, googleAccountEmail, isClientConfigured, oauthClientId } from '../services/google/oauth';
import { GoogleSheetsDriver } from '../services/google/googleDriver';
import { LS, storage } from '../services/storage';
import type { Settings, SpreadsheetConnection } from '../types';
import type { Msg, MsgResponse } from '../services/messaging';
import { SpreadsheetEngine } from '../services/spreadsheet/engine';
import { DemoDriver } from '../services/spreadsheet/demoDriver';

const LOG = 'OLM background:';

async function loadSettings(): Promise<Settings> {
  const s = await storage.loadAll();
  return s.settings;
}

async function saveConnection(connection: SpreadsheetConnection | null) {
  const s = await loadSettings();
  s.spreadsheet.connection = connection;
  s.spreadsheet.connected = Boolean(connection);
  await storage.set(LS.settings, s);
}

/** Friendly response for auth problems; technical detail goes to the console
 *  only — users never see invalid_client/401/redirect_uri_mismatch. */
function authFailure(e: unknown): MsgResponse {
  if (e instanceof GoogleAuthError) {
    console.error(LOG, 'google auth technical detail:', e.technical ?? e.message, `(code: ${e.code})`);
    return { ok: false, error: e.message, code: e.code === 'user_cancelled' ? 'user_cancelled' : 'auth_error', technical: e.technical };
  }
  const msg = e instanceof Error ? e.message : '';
  console.error(LOG, 'google auth technical detail:', msg);
  return { ok: false, error: friendlyAuthMessage('unknown', msg), code: 'auth_error', technical: msg };
}

async function connectAccount(): Promise<{ ok: true; email: string | null; connection?: SpreadsheetConnection } | MsgResponse> {
  try {
    const token = await getGoogleAuthToken(true);
    // only the connection metadata is persisted — never the token itself
    const email = await googleAccountEmail(token);
    const connection = connectionFromSession({ email }) as SpreadsheetConnection;
    await saveConnection({ ...connection, spreadsheetId: '', spreadsheetName: '', worksheetName: '' });
    console.info(LOG, `connected as ${email ?? 'unknown email'}`);
    return { ok: true, data: { email: email ?? null, connection } };
  } catch (e) {
    if (e instanceof GoogleAuthError && e.code === 'not_configured') {
      console.error(LOG, 'google auth technical detail: manifest oauth2.client_id is not configured (client id used would be unknown to Google)', e.message);
      return { ok: false, error: e.message, code: 'not_configured', technical: e.technical };
    }
    return authFailure(e);
  }
}

/** driver based on the stored connection (or demo) */
type DriverResult =
  | { driver: GoogleSheetsDriver | DemoDriver; ctx: { spreadsheetId: string; worksheetName: string } }
  | { error: string; code: string };

function fail(d: { error: string; code: string }): MsgResponse {
  return { ok: false, error: d.error, code: d.code };
}

async function driverFor(): Promise<DriverResult> {
  const s = await loadSettings();
  if (s.demoMode) {
    return { driver: new DemoDriver(s), ctx: { spreadsheetId: 'demo-spreadsheet', worksheetName: 'Orders' } };
  }
  if (!s.spreadsheet.connected || !s.spreadsheet.connection) {
    return { error: 'No spreadsheet connected. Open the extension and connect Google Sheets first.', code: 'not_connected' };
  }
  try {
    // no stored token exists — the driver fetches tokens through
    // chrome.identity (auto-refreshed by Chrome) on first use
    return {
      driver: new GoogleSheetsDriver(s.spreadsheet.connection),
      ctx: { spreadsheetId: s.spreadsheet.connection.spreadsheetId, worksheetName: s.spreadsheet.connection.worksheetName },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Spreadsheet connection failed.';
    return { error: msg, code: 'auth_error' };
  }
}

async function handle(msg: Msg): Promise<MsgResponse> {
  switch (msg.type) {
    case 'AUTH_STATUS': {
      const s = await loadSettings();
      return { ok: true, data: { signedIn: Boolean(s.spreadsheet.connection) } };
    }
    case 'AUTH_CONNECT': {
      return connectAccount();
    }
    case 'AUTH_LOGOUT': {
      // disconnect ONLY Google: no orders/products/settings are touched
      await saveConnection(null);
      await clearCachedGoogleTokens(); // best-effort token cache cleanup
      return { ok: true, data: { ok: true } };
    }
    case 'CONNECTION_GET': {
      const s = await loadSettings();
      return { ok: true, data: s.spreadsheet.connection };
    }
    case 'CONNECTION_SAVE': {
      const { spreadsheetId, spreadsheetName, worksheetName } = msg.payload;
      const s = await loadSettings();
      const prev = s.spreadsheet.connection;
      if (!prev) return { ok: false, error: 'Google account is not connected.', code: 'not_connected' };
      const updated: SpreadsheetConnection = {
        ...prev,
        spreadsheetId,
        spreadsheetName,
        worksheetName,
        connectedAt: Date.now(),
      };
      s.spreadsheet.connection = updated;
      s.spreadsheet.connected = true;
      await storage.set(LS.settings, s);
      return { ok: true, data: updated };
    }
    case 'SHEET_LIST': {
      const d = await driverFor();
      if ('error' in d) return fail(d);
      try {
        const list = await d.driver.listSpreadsheets();
        return { ok: true, data: { spreadsheets: list.map((x) => ({ id: x.spreadsheetId, name: x.spreadsheetName })) } };
      } catch (e) {
        if (e instanceof GoogleAuthError) return authFailure(e);
        const err = e as { message?: string; status?: number; error?: { message?: string; code?: number } };
        console.error(LOG, 'sheet list technical detail:', err.message);
        if (err.error?.code === 401 || err.status === 401 || err.error?.code === 403 || err.status === 403) {
          return { ok: false, error: 'Google connection expired. Please reconnect your Google Account.', code: 'auth_required', technical: err.message };
        }
        return { ok: false, error: 'Could not read your spreadsheets. Please try again.', code: 'drive_error', technical: err.message };
      }
    }
    case 'WORKSHEET_LIST': {
      const d = await driverFor();
      if ('error' in d) return fail(d);
      try {
        const names = await d.driver.listWorksheets(msg.payload.spreadsheetId);
        return { ok: true, data: names };
      } catch (e) {
        if (e instanceof GoogleAuthError) return authFailure(e);
        const err = e as { message?: string; status?: number };
        console.error(LOG, 'worksheet list technical detail:', err.message);
        if (err.status === 401 || err.status === 403) {
          return { ok: false, error: 'Google connection expired. Please reconnect your Google Account.', code: 'auth_required', technical: err.message };
        }
        return { ok: false, error: 'Could not read the worksheets. Please try again.', code: 'sheets_error', technical: err.message };
      }
    }
    case 'SHEET_OP': {
      const op = msg.payload;
      const d = await driverFor();
      if ('error' in d) return fail(d);
      try {
        const engine = new SpreadsheetEngine();
        const ctx = { driver: d.driver, spreadsheetId: d.ctx.spreadsheetId, worksheetName: d.ctx.worksheetName };
        if (op.kind === 'ensureSchema') {
          const res = await engine.ensureSchema(ctx, op.fields, op.products, op.settings);
          return { ok: true, data: { created: res.created, headers: res.headers.map((h) => h.name) } };
        }
        if (op.kind === 'appendOrder') {
          const row = await engine.appendOrder(ctx, op.order, op.fields, op.products, op.settings);
          return { ok: true, data: { row } };
        }
        if (op.kind === 'updateOrder') {
          await engine.updateOrder(ctx, op.order, op.rowIndex, op.fields, op.products, op.settings);
          return { ok: true, data: { row: op.rowIndex } };
        }
        return { ok: false, error: 'Unknown spreadsheet operation.', code: 'bad_op' };
      } catch (e) {
        if (e instanceof GoogleAuthError) return authFailure(e);
        const err = e as { message?: string; code?: string; status?: number; error?: { message?: string; code?: number } };
        const status = err.error?.code ?? err.status;
        console.error(LOG, 'sheet op technical detail:', err.message);
        if (status === 401 || status === 403) {
          return { ok: false, error: 'Google connection expired. Please reconnect your Google Account.', code: 'auth_required', technical: err.message };
        }
        if (status === 404) {
          return { ok: false, error: 'The spreadsheet or worksheet was not found. Check Settings → Spreadsheet.', code: 'not_found', technical: err.message };
        }
        if (status === 429) {
          return { ok: false, error: 'Google Sheets is busy — please wait a moment and try again.', code: 'rate_limit', technical: err.message };
        }
        return { ok: false, error: 'Unable to update Google Sheets. Check your internet connection and try again.', code: err?.code || 'spreadsheet_error', technical: err?.message };
      }
    }
    case 'SYNC_PENDING_ORDERS': {
      try {
        const { getPendingOps } = await import('../services/orders');
        const ops = await getPendingOps();
        if (ops.length === 0) return { ok: true, data: { synced: 0, failed: 0 } };
        const d = await driverFor();
        if ('error' in d) {
          return { ok: false, error: d.error, code: d.code };
        }
        const all = (await storage.getState<import('../types').Order[]>(LS.orders)) ?? [];
        const ctxState = { driver: d.driver, spreadsheetId: d.ctx.spreadsheetId, worksheetName: d.ctx.worksheetName };
        const engine = new SpreadsheetEngine();
        const conf = await storage.loadAll();
        const settings = conf.settings;
        const fields = conf.fields;
        const products = conf.products;
        let synced = 0;
        let failed = 0;
        const remaining: typeof ops = [];
        for (const op of ops) {
          const order = all.find((o) => o.id === op.orderId);
          if (!order) continue;
          try {
            if (op.action === 'append') {
              const row = await engine.appendOrder(ctxState, order, fields, products, settings);
              order.spreadsheetRow = row;
            } else if (order.spreadsheetRow && order.spreadsheetRow > 0) {
              await engine.updateOrder(ctxState, order, order.spreadsheetRow, fields, products, settings);
            } else {
              const row = await engine.appendOrder(ctxState, order, fields, products, settings);
              order.spreadsheetRow = row;
            }
            order.syncedAt = Date.now();
            order.pendingSync = false;
            synced += 1;
          } catch (e) {
            if (e instanceof GoogleAuthError) return authFailure(e);
            failed += 1;
            remaining.push(op);
          }
        }
        await storage.setMany({
          [LS.orders]: all,
          [LS.pendingOps]: remaining,
        });
        return { ok: true, data: { synced, failed, remaining: remaining.length } };
      } catch (e) {
        if (e instanceof GoogleAuthError) return authFailure(e);
        console.error(LOG, 'sync technical detail:', e instanceof Error ? e.message : e);
        return { ok: false, error: 'Sync failed. Please reconnect Google and try again.', code: 'sync_error', technical: e instanceof Error ? e.message : undefined };
      }
    }
    default: {
      return { ok: false, error: 'Unknown message type.', code: 'bad_message' };
    }
  }
}

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((e) => {
      console.error(LOG, e);
      sendResponse({ ok: false, error: 'Google connection could not be completed. Please reconnect your Google Account.', code: 'internal', technical: e instanceof Error ? e.message : undefined });
    });
  return true; // async response
});

chrome.runtime.onInstalled.addListener((details) => {
  console.info(LOG, 'installed', details.reason, 'client configured:', isClientConfigured(), 'client:', oauthClientId() ? oauthClientId().slice(-12) : '(none)');
});

// token availability sanity check on startup when a connection exists
// (silent; never prompts; only logs to the console)
void (async () => {
  try {
    const s = await loadSettings();
    if (s.spreadsheet?.connected && !s.demoMode) {
      await getGoogleAuthToken(false);
    }
  } catch {
    /* no cached grant — user reconnects from Settings when they want to */
  }
})();
