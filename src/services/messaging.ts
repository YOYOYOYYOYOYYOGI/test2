// ---------------------------------------------------------------------------
// Messaging protocol between extension pages (app/popup/print) and the MV3
// background service worker. Only auth/sheet/sync operations need the worker
// (chrome.identity must run there); everything else uses chrome.storage.
// ---------------------------------------------------------------------------
import type { OrderField, Order, Product, Settings, SpreadsheetConnection } from '../types';
import { LS, inExtension, storage } from './storage';
import { clearCachedGoogleTokens, connectionFromSession, getGoogleAuthToken, googleAccountEmail } from './google/oauth';
import { GoogleSheetsDriver } from './google/googleDriver';
import { DemoDriver } from './spreadsheet/demoDriver';
import { SpreadsheetEngine } from './spreadsheet/engine';
import { bindOrderColumns, parseOrderRow } from './dataExchange';
import { localOrderDate } from '../lib/orderDate';
import { makeId } from '../lib/constants';

export type SheetOp =
  | { kind: 'ensureSchema'; fields: OrderField[]; products: Product[]; settings: Settings }
  | { kind: 'appendOrder'; order: Order; fields: OrderField[]; products: Product[]; settings: Settings }
  | { kind: 'updateOrder'; order: Order; rowIndex: number; fields: OrderField[]; products: Product[]; settings: Settings };

export type Msg =
  | { type: 'AUTH_STATUS' }
  | { type: 'AUTH_CONNECT' }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CONNECTION_GET' }
  | { type: 'CONNECTION_SAVE'; payload: { spreadsheetId: string; spreadsheetName: string; worksheetName: string } }
  | { type: 'SHEET_LIST' }
  | { type: 'WORKSHEET_LIST'; payload: { spreadsheetId: string } }
  | { type: 'SHEET_OP'; payload: SheetOp }
  | { type: 'SYNC_PENDING_ORDERS' }
  | { type: 'GET_SETUP_STATE' };

export type MsgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; code?: string; technical?: string };

export function message<T = MsgResponse>(msg: Msg, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      reject(new Error('Not running inside the Chrome extension.'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('The extension background service is not responding. Try reloading the extension.')), timeoutMs);
    chrome.runtime.sendMessage(msg, (res: MsgResponse | undefined) => {
      clearTimeout(timer);
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || 'Extension messaging failed.'));
        return;
      }
      if (!res) {
        reject(new Error('No response from the extension background service.'));
        return;
      }
      if (!res.ok) {
        const err = new Error(res.error || 'Operation failed.') as Error & { code?: string; technical?: string };
        err.code = res.code;
        err.technical = res.technical;
        reject(err);
        return;
      }
      resolve(res.data as T);
    });
  });
}

export type AuthStatusData = { signedIn: boolean; email?: string | null };

/** Browser/PWA equivalents of the extension background actions. They deliberately
 * use the same GoogleSheetsDriver and SpreadsheetEngine, so the web app has no
 * parallel business logic or separate database. */
async function pwaDriverFor(): Promise<{ settings: Settings; driver: GoogleSheetsDriver | DemoDriver; spreadsheetId: string; worksheetName: string }> {
  const state = await storage.loadAll();
  if (state.settings.demoMode) {
    return { settings: state.settings, driver: new DemoDriver(state.settings), spreadsheetId: 'demo-spreadsheet', worksheetName: 'Orders' };
  }
  const connection = state.settings.spreadsheet.connection;
  if (!state.settings.spreadsheet.connected || !connection) throw new Error('Connect your Google Account in Settings before using Google Sheets.');
  return { settings: state.settings, driver: new GoogleSheetsDriver(connection), spreadsheetId: connection.spreadsheetId, worksheetName: connection.worksheetName };
}

async function pwaAuthConnect(): Promise<{ email: string | null; connection?: SpreadsheetConnection }> {
  const token = await getGoogleAuthToken(true);
  const email = await googleAccountEmail(token);
  const state = await storage.loadAll();
  const connection = connectionFromSession({ email });
  const settings: Settings = {
    ...state.settings,
    spreadsheet: { ...state.settings.spreadsheet, connected: true, connection },
  };
  await storage.set(LS.settings, settings);
  return { email: email ?? null, connection };
}

async function pwaDisconnect(): Promise<{ ok: boolean }> {
  const state = await storage.loadAll();
  await storage.set(LS.settings, {
    ...state.settings,
    spreadsheet: { ...state.settings.spreadsheet, connected: false, connection: null },
  });
  await clearCachedGoogleTokens();
  return { ok: true };
}

/** Turn an existing Orders worksheet into the app's normal order cache.
 * This runs only in the PWA after the user picks a sheet, so a phone can work
 * with the same business history as the desktop extension.  It uses the
 * existing import bindings rather than a second cloud data model. */
export function mergePwaSheetOrders(grid: string[][], state: Awaited<ReturnType<typeof storage.loadAll>>): Order[] {
  const headers = grid[0] ?? [];
  const bindings = bindOrderColumns(headers, state.fields, state.settings);
  const byNumber = new Map(state.orders.map((order) => [order.orderNumber.trim().toLowerCase(), order]));
  const next = [...state.orders];
  const qtyColumns = headers
    .map((name, index) => ({ name: String(name ?? '').replace(/\s+qty\s*$/i, '').trim(), index, isQty: /\s+qty\s*$/i.test(String(name ?? '')) }))
    .filter((column) => column.isQty && column.name);
  const now = Date.now();

  for (let index = 1; index < grid.length; index += 1) {
    const parsed = parseOrderRow(grid[index] ?? [], bindings, index + 1);
    if (!parsed) continue;
    const key = parsed.orderNumber.toLowerCase();
    const existing = byNumber.get(key);
    // Never overwrite an order still waiting to be written from this device.
    if (existing?.pendingSync) continue;
    const products: Order['products'] = {};
    for (const column of qtyColumns) {
      const quantity = Number(String(grid[index]?.[column.index] ?? '').replace(/[,\s]/g, ''));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const configured = state.products.find((product) => product.name.trim().toLowerCase() === column.name.toLowerCase());
      const productId = configured?.id ?? `sheet-product-${column.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || column.index}`;
      products[productId] = {
        productId,
        productName: configured?.name ?? column.name,
        sku: configured?.sku,
        labelName: configured?.labelName ?? column.name,
        price: configured?.price ?? 0,
        quantity,
      };
    }
    const fromSheet: Order = {
      id: existing?.id ?? makeId(),
      orderNumber: parsed.orderNumber,
      orderDate: parsed.orderDate ?? localOrderDate(new Date(parsed.createdAt ?? now)),
      customer: parsed.customer,
      products,
      paymentStatus: parsed.paymentStatus ?? 'Pending',
      paymentMethod: parsed.paymentMethod ?? 'UPI',
      transactionId: parsed.transactionId,
      paymentAmount: parsed.paymentAmount,
      orderStatus: parsed.orderStatus ?? 'New',
      notes: parsed.notes,
      customFields: parsed.custom,
      deliveryCharge: parsed.deliveryCharge ?? 0,
      totalAmount: parsed.totalFromFile ?? 0,
      previousOrderNumber: parsed.previousOrderNumber || undefined,
      previousSequenceOrderNumber: parsed.previousSequenceOrderNumber || undefined,
      printed: parsed.labelStatus ?? 'Not Printed',
      printedAt: parsed.printedAt,
      createdAt: parsed.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
      spreadsheetRow: index + 1,
      syncedAt: now,
      pendingSync: false,
    };
    const merged: Order = existing ? {
      ...existing,
      ...fromSheet,
      id: existing.id,
      products: Object.keys(products).length ? products : existing.products,
      customFields: { ...existing.customFields, ...parsed.custom },
      // A blank historical Sheets cell must not erase a known local total.
      totalAmount: parsed.totalFromFile ?? existing.totalAmount,
    } : fromSheet;
    const at = next.findIndex((order) => order.orderNumber.trim().toLowerCase() === key);
    if (at >= 0) next[at] = merged;
    else next.push(merged);
  }
  return next;
}

/** Refresh the PWA cache from the selected shared worksheet. This is a pull
 * complement to the existing queued push sync, not a second persistence layer. */
async function pwaRefreshOrdersFromSheet(): Promise<number> {
  const state = await storage.loadAll();
  const target = await pwaDriverFor();
  const grid = await target.driver.getGrid({ worksheetName: target.worksheetName }, 5000);
  const orders = mergePwaSheetOrders(grid, state);
  await storage.set(LS.orders, orders);
  return orders.filter((order) => Boolean(order.spreadsheetRow)).length;
}

async function pwaSaveConnection(input: ConnectionSaveInput): Promise<SpreadsheetConnection | null> {
  const state = await storage.loadAll();
  const previous = state.settings.spreadsheet.connection;
  if (!previous) throw new Error('Google account is not connected.');
  const connection: SpreadsheetConnection = { ...previous, ...input, connectedAt: Date.now() };
  const settings: Settings = {
    ...state.settings,
    spreadsheet: { ...state.settings.spreadsheet, connected: true, connection },
  };
  await storage.set(LS.settings, settings);
  try {
    await pwaRefreshOrdersFromSheet();
  } catch (error) {
    // Selecting a usable sheet must not fail because its history cannot be
    // read right now. Existing local data and all offline queue behavior stay
    // intact; the normal sync action can be retried when online.
    console.warn('[pwa] unable to load existing Google Sheets orders:', error);
  }
  return connection;
}

async function pwaRunSheetOp(op: SheetOp): Promise<unknown> {
  const target = await pwaDriverFor();
  const engine = new SpreadsheetEngine();
  const ctx = { driver: target.driver, spreadsheetId: target.spreadsheetId, worksheetName: target.worksheetName };
  if (op.kind === 'ensureSchema') {
    const result = await engine.ensureSchema(ctx, op.fields, op.products, op.settings);
    return { ...result, headers: result.headers.map((header) => header.name) };
  }
  if (op.kind === 'appendOrder') return { row: await engine.appendOrder(ctx, op.order, op.fields, op.products, op.settings) };
  await engine.updateOrder(ctx, op.order, op.rowIndex, op.fields, op.products, op.settings);
  return { row: op.rowIndex };
}

async function pwaSyncPendingOrders(): Promise<{ synced: number; failed: number; remaining?: number; loaded?: number }> {
  const { getPendingOps } = await import('./orders');
  const ops = await getPendingOps();
  // A PWA user may have no pending local work while the desktop extension has
  // appended orders. Sync Now therefore refreshes shared Sheet data either way.
  if (!ops.length) return { synced: 0, failed: 0, remaining: 0, loaded: await pwaRefreshOrdersFromSheet() };
  const target = await pwaDriverFor();
  const state = await storage.loadAll();
  const engine = new SpreadsheetEngine();
  const ctx = { driver: target.driver, spreadsheetId: target.spreadsheetId, worksheetName: target.worksheetName };
  let synced = 0;
  let failed = 0;
  const remaining: typeof ops = [];
  for (const op of ops) {
    const order = state.orders.find((item) => item.id === op.orderId);
    if (!order) continue;
    try {
      if (op.action === 'update' && order.spreadsheetRow) {
        await engine.updateOrder(ctx, order, order.spreadsheetRow, state.fields, state.products, state.settings);
      } else {
        order.spreadsheetRow = await engine.appendOrder(ctx, order, state.fields, state.products, state.settings);
      }
      order.pendingSync = false;
      order.syncedAt = Date.now();
      synced += 1;
    } catch {
      order.pendingSync = true;
      failed += 1;
      remaining.push(op);
    }
  }
  await storage.setMany({ [LS.orders]: state.orders, [LS.pendingOps]: remaining });
  return { synced, failed, remaining: remaining.length, loaded: await pwaRefreshOrdersFromSheet() };
}


export interface ConnectionSaveInput {
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
}

export interface SheetsListData {
  spreadsheets: { id: string; name: string }[];
}

export async function bgAuthConnect(): Promise<{ email: string | null; connection?: SpreadsheetConnection }> {
  return inExtension() ? message({ type: 'AUTH_CONNECT' }) : pwaAuthConnect();
}

export async function bgAuthStatus(): Promise<AuthStatusData> {
  if (inExtension()) return message({ type: 'AUTH_STATUS' });
  const state = await storage.loadAll();
  return { signedIn: Boolean(state.settings.spreadsheet.connection), email: state.settings.spreadsheet.connection?.email ?? null };
}

export async function bgAuthLogout(): Promise<{ ok: boolean }> {
  return inExtension() ? message({ type: 'AUTH_LOGOUT' }) : pwaDisconnect();
}

export async function bgGetConnection(): Promise<SpreadsheetConnection | null> {
  if (inExtension()) return message({ type: 'CONNECTION_GET' });
  return (await storage.loadAll()).settings.spreadsheet.connection;
}

export async function bgSaveConnection(input: ConnectionSaveInput): Promise<SpreadsheetConnection | null> {
  return inExtension() ? message({ type: 'CONNECTION_SAVE', payload: input }) : pwaSaveConnection(input);
}

export async function bgListSpreadsheets(): Promise<SheetsListData['spreadsheets']> {
  if (inExtension()) return message({ type: 'SHEET_LIST' });
  const target = await pwaDriverFor();
  return (await target.driver.listSpreadsheets()).map((item) => ({ id: item.spreadsheetId, name: item.spreadsheetName }));
}

export async function bgListWorksheets(spreadsheetId: string): Promise<string[]> {
  if (inExtension()) return message({ type: 'WORKSHEET_LIST', payload: { spreadsheetId } });
  return (await pwaDriverFor()).driver.listWorksheets(spreadsheetId);
}

export async function bgRunSheetOp(op: SheetOp): Promise<unknown> {
  return inExtension() ? message({ type: 'SHEET_OP', payload: op }) : pwaRunSheetOp(op);
}

export async function bgSyncPendingOrders(): Promise<{ synced: number; failed: number; remaining?: number; loaded?: number }> {
  return inExtension() ? message({ type: 'SYNC_PENDING_ORDERS' }) : pwaSyncPendingOrders();
}
