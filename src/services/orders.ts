// ---------------------------------------------------------------------------
// Order service — local order store (chrome.storage) + spreadsheet write
// ---------------------------------------------------------------------------
import type { CustomerData, OldOrderRecord, Order, OrderField, Product, Settings } from '../types';
import { makeId } from '../lib/constants';
import { computeTotal } from '../lib/format';
import { localOrderDate, parseOrderDate } from '../lib/orderDate';
import { LS, storage } from './storage';
import { normalizeOrderNumber, normalizePhone } from '../lib/normalizePhone';
import { engineForSettings } from './sync';
import { SpreadsheetEngine, SpreadsheetError, friendlySheetsError } from './spreadsheet/engine';
import { GoogleAuthError } from './google/oauth';

export interface OrderInput {
  orderNumber: string;
  /** Business date selected by the user, stored as timezone-safe YYYY-MM-DD. */
  orderDate?: string;
  customer: Order['customer'];
  products: Record<string, { productName?: string; quantity: number; price?: number; sku?: string; labelName?: string }>;
  paymentStatus: Order['paymentStatus'];
  paymentMethod: Order['paymentMethod'];
  transactionId: string;
  paymentAmount: string;
  orderStatus: Order['orderStatus'];
  notes: string;
  customFields?: Record<string, string | number | boolean>;
  /** delivery charge to add to the product total (already evaluated) */
  deliveryCharge?: number;
  /** old order this new order was created from (shown separately) */
  previousOrderNumber?: string;
  /** informational sequence reference (read-only — never merged into the
   *  order number and never chained) */
  previousSequenceOrderNumber?: string;
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

// ---------------------------------------------------------------------------
// Previous Sequence Order — informational reference (NOT part of the order
// number, NOT a counter, NOT reserved; it never modifies anything).
// ---------------------------------------------------------------------------

const SIMPLE_NUMBER_RE = /^(\d+)$/;

/** True when the order number is a plain digit sequence (15000) — chain
 *  numbers such as 15000-14030-11694-9602-4776 are customer-previous-order
 *  numbers and are NEVER interpreted as a sequence number. */
export function isSimpleOrderNumber(orderNumber: string): boolean {
  return SIMPLE_NUMBER_RE.test(String(orderNumber ?? '').trim());
}

/**
 * The latest existing SIMPLE numeric order number below `orderNumber`,
 * searched over the given saved orders (never computed as current − 1 —
 * missing numbers in between are skipped). Returns the found order number
 * string, or '' when there is no lower simple order number.
 *
 * Examples:
 *   orders 14995,14997,14998,14999 + current 15000  → '14999'
 *   orders 14995,14997,14998       + current 15000  → '14998' (14999 missing)
 *   current 14900 (first number)                    → ''
 * Chain numbers (14030-11694-9602-4776) are ignored; values compare
 * numerically (BigInt) so leading zeros and very long numbers stay correct.
 */
export function previousSequenceOrderFor(orderNumber: string, orders: Order[]): string {
  const raw = String(orderNumber ?? '').trim();
  if (!isSimpleOrderNumber(raw)) return '';
  let current: bigint;
  try {
    current = BigInt(raw);
  } catch {
    return '';
  }
  let best: { text: string; value: bigint } | null = null;
  for (const o of orders) {
    const m = SIMPLE_NUMBER_RE.exec(String(o.orderNumber ?? '').trim());
    if (!m) continue; // chains are customer-history numbers, never sequence refs
    let v: bigint;
    try {
      v = BigInt(m[1]);
    } catch {
      continue;
    }
    if (v < current && (!best || v > best.value)) {
      best = { text: m[1], value: v };
    }
  }
  return best?.text ?? '';
}

// ---------------------------------------------------------------------------
// Automatic order numbers
// ---------------------------------------------------------------------------

const AUTOMATIC_NUMBER_RE = /^\d+$/;

/** A Next Order Number is deliberately text, so large values and leading
 * zeroes never become scientific notation or a rounded JavaScript number. */
export function isAutomaticBaseNumber(value: string | null | undefined): boolean {
  return AUTOMATIC_NUMBER_RE.test(String(value ?? '').trim());
}

export function incrementAutomaticBaseNumber(value: string): string {
  const raw = String(value).trim();
  if (!isAutomaticBaseNumber(raw)) throw new Error('Next Order Number must contain digits only.');
  const next = (BigInt(raw) + 1n).toString();
  // Preserve intentionally entered padding: 0015000 → 0015001.
  return next.length < raw.length ? next.padStart(raw.length, '0') : next;
}

function customerPhones(customer: Pick<CustomerData, 'whatsapp' | 'mobile'>): Set<string> {
  const phones = new Set<string>();
  for (const raw of [customer.whatsapp, customer.mobile]) {
    const normalized = normalizePhone(raw ?? '');
    if (normalized.length >= 10) phones.add(normalized);
  }
  return phones;
}

function sharesCustomerPhone(
  customer: Pick<CustomerData, 'whatsapp' | 'mobile'>,
  candidate: Pick<CustomerData | OldOrderRecord, 'whatsapp' | 'mobile'>,
): boolean {
  const target = customerPhones(customer);
  if (!target.size) return false;
  for (const raw of [candidate.whatsapp, candidate.mobile]) {
    const normalized = normalizePhone(raw ?? '');
    if (target.has(normalized)) return true;
  }
  return false;
}

/**
 * Find the immediate full customer-history parent for an automatically created
 * order. Current orders win because they are the newest live history; imported
 * old records supply the parent only until the customer has a new app order.
 */
export function latestCustomerOrderNumber(
  customer: Pick<CustomerData, 'whatsapp' | 'mobile'>,
  orders: Order[],
  oldOrders: OldOrderRecord[],
): string {
  const current = orders
    .filter((order) => sharesCustomerPhone(customer, order.customer))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
  if (current) return normalizeOrderNumber(current.orderNumber);

  const historic = oldOrders
    .filter((record) => sharesCustomerPhone(customer, record))
    .sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0) || (b.sourceRow ?? 0) - (a.sourceRow ?? 0))[0];
  return historic ? normalizeOrderNumber(historic.orderNumber) : '';
}

export interface AutomaticOrderNumber {
  baseNumber: string;
  orderNumber: string;
  previousOrderNumber?: string;
}

/** Build an automatic final number without reserving or incrementing anything. */
export function automaticOrderNumberFor(
  nextOrderNumber: string,
  customer: Pick<CustomerData, 'whatsapp' | 'mobile'>,
  orders: Order[],
  oldOrders: OldOrderRecord[],
): AutomaticOrderNumber {
  const baseNumber = String(nextOrderNumber ?? '').trim();
  if (!isAutomaticBaseNumber(baseNumber)) throw new Error('Set Next Order Number to digits only before saving an automatic order.');
  const previousOrderNumber = latestCustomerOrderNumber(customer, orders, oldOrders);
  return {
    baseNumber,
    orderNumber: previousOrderNumber ? `${baseNumber}-${previousOrderNumber}` : baseNumber,
    previousOrderNumber: previousOrderNumber || undefined,
  };
}

/** Serializes automatic creations inside this app context. The final duplicate
 * check still reads storage inside the lock, so a stale form preview cannot
 * reuse a number after another save. */
let automaticCreateTail: Promise<void> = Promise.resolve();
async function inAutomaticCreateLock<T>(work: () => Promise<T>): Promise<T> {
  // Web Locks coordinates the extension tab, popup and PWA tabs. The promise
  // tail keeps the same guarantee in test/older environments without it.
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request('order-label-manager:automatic-order-create', { mode: 'exclusive' }, async () => work());
  }
  const before = automaticCreateTail;
  let release!: () => void;
  automaticCreateTail = new Promise<void>((resolve) => { release = resolve; });
  await before;
  try {
    return await work();
  } finally {
    release();
  }
}

function newOrderObject(input: OrderInput, ctx: OrderCtx, opts: { id?: string; now?: number } = {}): Order {
  const now = opts.now ?? Date.now();
  // Programmatic/legacy callers which omit the field retain the new-order
  // default. A supplied blank or malformed selection is an error: never turn
  // a user's selected day into today's date without telling them.
  const fallbackDate = localOrderDate(new Date(now));
  const chosenDate = input.orderDate === undefined ? fallbackDate : parseOrderDate(input.orderDate);
  if (!chosenDate) throw new Error('Order Date must be a valid calendar date.');
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
    orderDate: chosenDate,
    customer: { ...input.customer },
    products,
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    transactionId: (input.transactionId ?? '').trim(),
    paymentAmount: (input.paymentAmount ?? '').trim(),
    orderStatus: input.orderStatus,
    notes: (input.notes ?? '').trim(),
    deliveryCharge: Math.round((Number(input.deliveryCharge) || 0) * 100) / 100,
    previousOrderNumber: (input.previousOrderNumber ?? '').trim() || undefined,
    previousSequenceOrderNumber: (input.previousSequenceOrderNumber ?? '').trim() || undefined,
    totalAmount: Math.round((computeTotal(products) + (Number(input.deliveryCharge) || 0)) * 100) / 100,
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
  // Settings may have changed in another open app window after this form was
  // rendered. Read them again before deciding whether this is automatic.
  const live = await storage.loadAll();
  if (live.settings.order.numberMode === 'automatic') {
    return inAutomaticCreateLock(() => createOrderInner(input, { ...ctx, settings: live.settings }, opts, true));
  }
  return createOrderInner(input, ctx, opts, false);
}

async function createOrderInner(
  input: OrderInput,
  ctx: OrderCtx,
  opts: { force?: boolean; skipSheet?: boolean },
  automatic: boolean,
): Promise<CreateOutcome> {
  let finalInput = input;
  let automaticSourceNext: string | null = null;

  if (automatic) {
    // Re-read inside the queue. This is the authoritative final number, not
    // merely the preview shown in the New Order form.
    const state = await storage.loadAll();
    if (state.settings.order.numberMode !== 'automatic') {
      return createOrderInner(input, { ...ctx, settings: state.settings }, opts, false);
    }
    const generated = automaticOrderNumberFor(
      state.settings.order.nextOrderNumber,
      input.customer,
      state.orders,
      state.oldOrders,
    );
    automaticSourceNext = generated.baseNumber;
    finalInput = {
      ...input,
      orderNumber: generated.orderNumber,
      previousOrderNumber: generated.previousOrderNumber,
      // The sequence reference is the independent global base number only;
      // it is never appended to the customer-history chain.
      previousSequenceOrderNumber: previousSequenceOrderFor(generated.baseNumber, state.orders) || undefined,
    };
    ctx = { ...ctx, settings: state.settings, fields: state.fields, products: state.products };
  }

  const existing = await getOrderByNumber(finalInput.orderNumber);
  // Exact number duplicates are never allowed for automatic orders, even if a
  // caller used force for a separate matching-rule confirmation.
  if (existing && (!opts.force || automatic)) {
    return { ok: false, duplicate: { existing }, error: 'This order number already exists. Change Next Order Number and try again.' };
  }
  const order = newOrderObject(finalInput, ctx);
  const orders = await getAllOrders();
  // A last storage read is the final guard against two near-simultaneous saves.
  const raced = orders.find((item) => item.orderNumber.trim().toLowerCase() === order.orderNumber.trim().toLowerCase());
  if (raced && (!opts.force || automatic)) {
    return { ok: false, duplicate: { existing: raced }, error: 'This order number was just saved by another order. Please try again.' };
  }
  orders.push(order);
  await persistOrders(orders);

  if (automatic && automaticSourceNext) {
    // Increment only after the order exists in durable local storage. If the
    // owner changed the setting while saving, honour their newer choice.
    const latest = await storage.loadAll();
    if (
      latest.settings.order.numberMode === 'automatic'
      && latest.settings.order.nextOrderNumber.trim() === automaticSourceNext
    ) {
      await storage.set(LS.settings, {
        ...latest.settings,
        order: { ...latest.settings.order, nextOrderNumber: incrementAutomaticBaseNumber(automaticSourceNext) },
      });
    }
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
    if (e instanceof GoogleAuthError) {
      // Google grant expired/revoked — keep the order local and queue it
      order.pendingSync = true;
      await persistOrders(orders.map((o) => (o.id === order.id ? order : o)));
      await enqueuePending({ action: 'append', orderId: order.id, ts: Date.now() });
      return { ok: true, order, synced: false, code: 'pending', error: 'Google connection expired — order saved locally. Reconnect Google in Settings → Spreadsheet, then press “Sync pending orders”.' };
    }
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
    const authExpired = e instanceof GoogleAuthError;
    merged.pendingSync = true;
    await persistOrders(all);
    await enqueuePending({ action: 'update', orderId: merged.id, ts: Date.now() });
    const message = authExpired
      ? 'Google connection expired — changes saved locally. Reconnect Google in Settings → Spreadsheet, then press “Sync pending orders”.'
      : 'Saved locally. Spreadsheet update is queued and will sync automatically.';
    return { ok: true, order: merged, synced: false, error: message, code: 'pending' };
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
