// ---------------------------------------------------------------------------
// Order service — local order store (chrome.storage) + spreadsheet write
// ---------------------------------------------------------------------------
import type { Order, OrderField, Product, Settings } from '../types';
import { makeId } from '../lib/constants';
import { computeTotal } from '../lib/format';
import { LS, storage } from './storage';
import { engineForSettings } from './sync';
import { SpreadsheetEngine, SpreadsheetError, friendlySheetsError } from './spreadsheet/engine';
import { defaultSettings } from '../lib/constants';

export interface OrderInput {
  orderNumber: string;
  customer: Order['customer'];
  products: Record<string, { productName?: string; quantity: number; price?: number; sku?: string; labelName?: string }>;
  paymentStatus: Order['paymentStatus'];
  paymentMethod: Order['paymentMethod'];
  transactionId: string;
  paymentAmount: string;
  orderStatus: Order['orderStatus'];
  notes: string;
  customFields?: Record<string, string | number | boolean>;
}

export interface OrderCtx {
  settings: Settings;
  fields: OrderField[];
  products: Product[];
}

export async function getAllOrders(): Promise<Order[]> {
  return (await storage.getState<Order[]>(LS.orders)) ?? [];
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const all = await getAllOrders();
  return all.find((o) => o.id === id);
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
  const all = await getAllOrders();
  const n = orderNumber.trim().toLowerCase();
  return all.find((o) => o.orderNumber.trim().toLowerCase() === n);
}

export async function persistOrders(orders: Order[]): Promise<void> {
  await storage.set(LS.orders, orders);
}

export async function deleteOrderLocal(id: string): Promise<void> {
  const all = await getAllOrders();
  await persistOrders(all.filter((o) => o.id !== id));
}

/** The next counter value for automatic order numbers. */
export async function nextCounter(): Promise<number> {
  const cur = (await storage.getState<number>(LS.nextOrderNumber)) ?? defaultSettings().order.startNumber;
  return cur;
}

export async function setCounter(n: number): Promise<void> {
  await storage.set(LS.nextOrderNumber, n);
}

export function makeOrderNumber(counter: number, settings: Settings): string {
  const p = settings.order.prefix || '';
  const pad = settings.order.padding || 0;
  const body = pad > 0 ? String(counter).padStart(pad, '0') : String(counter);
  return `${p}${body}`;
}

/** Bump the counter beyond any existing manual order number (prefix-aware). */
export function normalizeCounter(orders: Order[], settings: Settings): number {
  const prefix = (settings.order.prefix || '').toLowerCase();
  let max = 0;
  for (const o of orders) {
    const n = o.orderNumber.toLowerCase();
    if (!n.startsWith(prefix)) continue;
    const rest = n.slice(prefix.length).replace(/^0+/, '');
    if (/^\d+$/.test(rest)) max = Math.max(max, parseInt(rest, 10));
  }
  const start = settings.order.startNumber - 1;
  return Math.max(start, max, 0) + 1;
}

function newOrderObject(input: OrderInput, ctx: OrderCtx, opts: { id?: string; now?: number } = {}): Order {
  const now = opts.now ?? Date.now();
  const products: Record<string, Order['products'][string]> = {};
  for (const [pid, line] of Object.entries(input.products)) {
    const product = ctx.products.find((p) => p.id === pid);
    products[pid] = {
      productId: pid,
      productName: line.productName || product?.name || pid,
      sku: line.sku ?? product?.sku,
      quantity: line.quantity,
      price: line.price ?? product?.price ?? 0,
      labelName: line.labelName ?? product?.labelName ?? line.productName ?? product?.name,
    };
  }
  return {
    id: opts.id ?? makeId(),
    orderNumber: input.orderNumber.trim(),
    customer: { ...input.customer },
    products,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    transactionId: (input.transactionId ?? '').trim(),
    paymentAmount: (input.paymentAmount ?? '').trim(),
    orderStatus: input.orderStatus,
    notes: (input.notes ?? '').trim(),
    totalAmount: Math.round(computeTotal(products) * 100) / 100,
    printed: 'Not Printed',
    printedAt: null,
    createdAt: now,
    updatedAt: now,
    customFields: input.customFields ?? {},
    spreadsheetRow: undefined,
    syncedAt: null,
  };
}

export interface CreateOutcome {
  ok: boolean;
  duplicate?: { existing: Order };
  order?: Order;
  synced?: boolean;
  spreadsheetRow?: number;
  error?: string;
  code?: string;
  technical?: string;
}

/**
 * Save a new order:
 *  1. duplicate check (unless force)
 *  2. local write
 *  3. spreadsheet append (one new ROW; columns ensured earlier)
 *  On network failure the order stays local with pendingSync and is queued.
 */
export async function createOrder(
  input: OrderInput,
  ctx: OrderCtx,
  opts: { force?: boolean; skipSheet?: boolean } = {},
): Promise<CreateOutcome> {
  const existing = await getOrderByNumber(input.orderNumber);
  if (existing && !opts.force) {
    return { ok: false, duplicate: { existing } };
  }
  const order = newOrderObject(input, ctx);
  const orders = await getAllOrders();
  orders.push(order);
  await persistOrders(orders);

  // advance the counter past every order we know about
  if (!ctx.settings.order.manualNumbering) {
    const cnt = normalizeCounter(orders, ctx.settings);
    await setCounter(cnt);
  }

  if (opts.skipSheet) {
    return { ok: true, order, synced: false };
  }

  try {
    const row = await appendOrderToSheet(order, ctx);
    order.spreadsheetRow = row;
    order.syncedAt = Date.now();
    order.pendingSync = false;
    await persistOrders(orders.map((o) => (o.id === order.id ? order : o)));
    return { ok: true, order, synced: true, spreadsheetRow: row };
  } catch (e) {
    const se = e instanceof SpreadsheetError ? e : friendlySheetsError(e);
    if (se.code === 'network' || se.code === 'spreadsheet_error' || se.code === 'rate_limit' || se.code === 'not_connected') {
      // offline resilience: keep the order locally and queue it for sync
      order.pendingSync = true;
      await persistOrders(orders.map((o) => (o.id === order.id ? order : o)));
      await enqueuePending({ action: 'append', orderId: order.id, ts: Date.now() });
      const message = se.code === 'not_connected'
        ? 'Order saved locally. Connect Google Sheets in Settings and it will sync automatically.'
        : 'Offline — order saved locally and will sync automatically when the connection returns.';
      return {
        ok: true,
        order,
        synced: false,
        error: message,
        code: 'pending',
      };
    }
    return { ok: false, order, error: se.message, code: se.code, technical: se.technical };
  }
}

export async function appendOrderToSheet(order: Order, ctx: OrderCtx): Promise<number> {
  const driver = engineForSettings(ctx.settings);
  if (!driver) throw new SpreadsheetError('No spreadsheet connected. Connect Google Sheets first.', 'not_connected');
  const inst = new SpreadsheetEngine();
  const spreadsheetId = ctx.settings.spreadsheet.connection?.spreadsheetId ?? '';
  const worksheetName = ctx.settings.spreadsheet.connection?.worksheetName ?? 'Orders';
  return inst.appendOrder({ driver, spreadsheetId, worksheetName }, order, ctx.fields, ctx.products, ctx.settings);
}

/** Update an existing order locally + in its spreadsheet row (no new row). */
export async function updateOrder(
  id: string,
  input: OrderInput,
  ctx: OrderCtx,
): Promise<CreateOutcome> {
  const all = await getAllOrders();
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return { ok: false, error: 'Order not found.' };
  const prev = all[idx];
  const dup = await getOrderByNumber(input.orderNumber);
  if (dup && dup.id !== id) return { ok: false, duplicate: { existing: dup } };
  const merged: Order = { ...prev, ...newOrderObject(input, ctx, { id: prev.id, now: prev.createdAt }) };
  merged.updatedAt = Date.now();
  merged.id = prev.id;
  merged.createdAt = prev.createdAt;
  merged.printed = prev.printed;
  merged.printedAt = prev.printedAt;
  if (prev.spreadsheetRow) merged.spreadsheetRow = prev.spreadsheetRow;
  if (prev.syncedAt) merged.syncedAt = prev.syncedAt;
  all[idx] = merged;
  await persistOrders(all);

  try {
    const row = prev.spreadsheetRow;
    if (row && row > 0) {
      const driver = engineForSettings(ctx.settings);
      if (driver) {
        const inst = new SpreadsheetEngine();
        await inst.updateOrder(
          { driver, spreadsheetId: ctx.settings.spreadsheet.connection?.spreadsheetId ?? '', worksheetName: ctx.settings.spreadsheet.connection?.worksheetName ?? 'Orders' },
          merged, row, ctx.fields, ctx.products, ctx.settings,
        );
        merged.syncedAt = Date.now();
        merged.pendingSync = false;
      }
    } else if (ctx.settings.spreadsheet.connected && !ctx.settings.demoMode) {
      const rowN = await appendOrderToSheet(merged, ctx);
      merged.spreadsheetRow = rowN;
      merged.syncedAt = Date.now();
    }
    await persistOrders(all);
    return { ok: true, order: merged, synced: true, spreadsheetRow: merged.spreadsheetRow };
  } catch (e) {
    const se = e instanceof SpreadsheetError ? e : friendlySheetsError(e);
    merged.pendingSync = true;
    await persistOrders(all);
    await enqueuePending({ action: 'update', orderId: merged.id, ts: Date.now() });
    return { ok: true, order: merged, synced: false, error: 'Saved locally. Spreadsheet update is queued and will sync automatically.', code: 'pending' };
  }
}

/** Mark an order printed (local + targeted spreadsheet update). */
export async function markPrinted(order: Order, ctx: OrderCtx, printedAt = Date.now()): Promise<void> {
  const all = await getAllOrders();
  const idx = all.findIndex((o) => o.id === order.id);
  if (idx === -1) return;
  const updated: Order = { ...all[idx], printed: 'Printed', printedAt, updatedAt: Date.now() };
  all[idx] = updated;
  await persistOrders(all);
  const shouldUpdateSheet = ctx.settings.printUpdatesStatus && !ctx.settings.demoMode;
  if (!shouldUpdateSheet) return;
  const conn = ctx.settings.spreadsheet.connection;
  const row = updated.spreadsheetRow;
  if (!conn || !row || row <= 0) return;
  try {
    const driver = engineForSettings(ctx.settings);
    if (!driver) return;
    const headers = await driver.getHeaders({
      accessToken: conn.accessToken,
      spreadsheetId: conn.spreadsheetId,
      worksheetName: conn.worksheetName,
    });
    const width = headers.reduce((m, h) => Math.max(m, h.index + 1), 1);
    const current = await driver.getRow(
      { accessToken: conn.accessToken, spreadsheetId: conn.spreadsheetId, worksheetName: conn.worksheetName },
      row, width,
    );
    const statusIdx = headers.find((h) => h.name.trim().toLowerCase() === 'label status')?.index;
    const atIdx = headers.find((h) => h.name.trim().toLowerCase() === 'printed at')?.index;
    const stamp = new Date(printedAt).toISOString().slice(0, 16).replace('T', ' ');
    if (statusIdx !== undefined) current[statusIdx] = 'Printed';
    if (atIdx !== undefined) current[atIdx] = stamp;
    await driver.updateRow(
      { accessToken: conn.accessToken, spreadsheetId: conn.spreadsheetId, worksheetName: conn.worksheetName },
      row, current,
    );
  } catch {
    // print-status sync failure is non-fatal; local state is already updated
  }
}

// ---------------------------------------------------------------------------
// Pending offline operations queue
// ---------------------------------------------------------------------------
export interface PendingOp {
  action: 'append' | 'update';
  orderId: string;
  ts?: number;
}

export async function enqueuePending(op: PendingOp): Promise<void> {
  const list = (await storage.getState<PendingOp[]>(LS.pendingOps)) ?? [];
  list.push({ ...op, ts: op.ts ?? Date.now() });
  await storage.set(LS.pendingOps, list);
}

export async function clearPendingOp(orderId: string): Promise<void> {
  const list = (await storage.getState<PendingOp[]>(LS.pendingOps)) ?? [];
  await storage.set(LS.pendingOps, list.filter((o) => o.orderId !== orderId));
}

export async function getPendingOps(): Promise<PendingOp[]> {
  return (await storage.getState<PendingOp[]>(LS.pendingOps)) ?? [];
}
