// ---------------------------------------------------------------------------
// MV3 background service worker — auth (chrome.identity), spreadsheet ops and
// offline sync. Kept intentionally small: pages talk to chrome.storage
// directly for local data and send messages here only when the worker is
// required (identity flow, sheet API, sync).
// ---------------------------------------------------------------------------
import { exchangeCode, ensureFreshConnection, launchChromeAuthFlow } from '../services/google/oauth';
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

async function connectAccount(): Promise<{ ok: true; email: string | null } | MsgResponse> {
  try {
    const { code } = await launchChromeAuthFlow(true);
    const connection = await exchangeCode(code);
    await saveConnection({ ...connection, spreadsheetId: '', spreadsheetName: '', worksheetName: '' });
    return { ok: true, data: { email: connection.email ?? null, connection } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Google sign-in failed.';
    return { ok: false, error: msg, code: 'auth_error' };
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
    const fresh = await ensureFreshConnection(s.spreadsheet.connection);
    await saveConnection(fresh);
    return {
      driver: new GoogleSheetsDriver(fresh),
      ctx: { spreadsheetId: fresh.spreadsheetId, worksheetName: fresh.worksheetName },
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
      if (!s.spreadsheet.connection?.accessToken) return { ok: true, data: { signedIn: false } };
      return { ok: true, data: { signedIn: true, email: s.spreadsheet.connection.email ?? null } };
    }
    case 'AUTH_CONNECT': {
      return connectAccount();
    }
    case 'AUTH_LOGOUT': {
      const s = await loadSettings();
      s.spreadsheet.connection = null;
      s.spreadsheet.connected = false;
      await storage.set(LS.settings, s);
      return { ok: true, data: { ok: true } };
    }
    case 'AUTH_FLOW_RESULT': {
      const { status, detail } = msg.payload;
      if (status === 'success' && detail) {
        try {
          const connection = await exchangeCode(detail);
          await saveConnection({ ...connection, spreadsheetId: '', spreadsheetName: '', worksheetName: '' });
          return { ok: true, data: { email: connection.email ?? null } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Google sign-in failed.', code: 'auth_error' };
        }
      }
      return { ok: false, error: detail || 'Google sign-in was not completed.', code: 'user_cancelled' };
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
      const list = await d.driver.listSpreadsheets();
      return { ok: true, data: { spreadsheets: list.map((x) => ({ id: x.spreadsheetId, name: x.spreadsheetName })) } };
    }
    case 'WORKSHEET_LIST': {
      const d = await driverFor();
      if ('error' in d) return fail(d);
      const names = await d.driver.listWorksheets(msg.payload.spreadsheetId);
      return { ok: true, data: names };
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
        const err = e as { message?: string; code?: string; status?: number; error?: { message?: string; code?: number } };
        const status = err.error?.code ?? err.status;
        if (status === 401 || status === 403) {
          return { ok: false, error: 'Google permission expired. Reconnect your account in Settings → Spreadsheet.', code: 'auth_required', technical: err.message };
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
          } catch {
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
        return { ok: false, error: 'Sync failed. ' + (e instanceof Error ? e.message : ''), code: 'sync_error' };
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
      sendResponse({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error.', code: 'internal' });
    });
  return true; // async response
});

chrome.runtime.onInstalled.addListener((details) => {
  console.info(LOG, 'installed', details.reason);
});
