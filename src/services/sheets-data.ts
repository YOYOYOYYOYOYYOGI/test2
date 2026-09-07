// Maps custom fields <-> spreadsheet columns and syncs orders to Google Sheets.
// Rule: fields are columns, every order is one row. Existing rows/columns are never deleted.
import type { Order } from '../types';
import { getFields, getHeaders, getProducts, getSettings, saveHeaders } from './store';
import * as sheets from './google';

export const STD_COLS = ['Order Number', 'Order Date', 'Payment Status', 'Amount'];

export function autoColumnFor(name: string, headers: string[]): string {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const i = lower.indexOf(name.trim().toLowerCase());
  return i >= 0 ? headers[i] : '';
}

export function fieldColumn(fieldId: string, fieldName: string, headers: string[], customMap: Record<string, string>): string {
  return customMap[fieldId] || autoColumnFor(fieldName, headers);
}

export function orderNumberColumn(headers: string[]): string {
  return autoColumnFor('Order Number', headers);
}

/** Read headers if not cached, create any missing columns (once), and cache the result. */
export async function ensureAllColumns(sheetId: string, sheetName: string): Promise<string[]> {
  const s = getSettings();
  let headers = getHeaders();
  if (headers.length === 0) headers = await sheets.readHeaders(sheetId, sheetName);
  const lower = headers.map((h) => h.trim().toLowerCase());
  const wanted: string[] = [];
  for (const c of STD_COLS) if (!lower.includes(c.toLowerCase())) wanted.push(c);
  for (const f of getFields()) {
    if (s.customMap?.[f.id]) continue; // manually mapped to an existing column
    if (!lower.includes(f.name.trim().toLowerCase())) wanted.push(f.name);
  }
  // one qty column per product (e.g. "Night Cream Qty") — products are rows too, never duplicated
  for (const p of getProducts()) {
    const col = `${p.name} Qty`;
    if (!lower.includes(col.toLowerCase())) wanted.push(col);
  }
  const full = wanted.length > 0 ? await sheets.ensureColumns(sheetId, sheetName, headers, wanted) : headers;
  if (full !== headers || getHeaders().length === 0) saveHeaders(full);
  return full;
}

/** Build the row values for an order, aligned to the spreadsheet columns. */
export function buildRow(order: Order, headers: string[], customMap: Record<string, string> = {}): string[] {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const row: string[] = new Array(headers.length).fill('');
  const put = (col: string, v: string) => {
    if (!col) return;
    const i = lower.indexOf(col.trim().toLowerCase());
    if (i >= 0) row[i] = v;
  };
  put('Order Number', order.orderNumber);
  put('Order Date', order.createdAt.slice(0, 10));
  put('Payment Status', order.paymentStatus);
  put('Amount', String(order.total));
  put('Products', order.items.map((i) => (i.qty > 1 ? `${i.name} x ${i.qty}` : i.name)).join(', '));
  put('Quantity', String(order.items.reduce((s, i) => s + i.qty, 0)));
  put('SKU', order.items.map((i) => i.sku).filter(Boolean).join(', '));
  for (const i of order.items) put(`${i.name} Qty`, String(i.qty));
  for (const f of getFields()) put(fieldColumn(f.id, f.name, headers, customMap), order.customerData[f.id] || '');
  return row;
}

/**
 * Sync one order to Sheets: update its existing row or append exactly one new row.
 * Returns the 1-based row number (0 when not connected).
 */
export async function syncOrder(order: Order): Promise<number> {
  const s = getSettings();
  if (!s.sheetId || !s.sheetName) return 0;
  const headers = await ensureAllColumns(s.sheetId, s.sheetName);
  const customMap = s.customMap || {};
  let row = order.sheetRow || 0;
  if (row === 0) {
    const keyCol = orderNumberColumn(headers);
    if (keyCol) row = (await sheets.findRowByOrderNumber(s.sheetId, s.sheetName, keyCol, order.orderNumber)).row;
  }
  const values = buildRow(order, headers, customMap);
  const written = await sheets.writeRow(s.sheetId, s.sheetName, row, values);
  order.sheetRow = written || row;
  return order.sheetRow;
}

/** True if the order number already exists in the spreadsheet. */
export async function sheetHasOrder(orderNumber: string): Promise<boolean> {
  const s = getSettings();
  if (!s.sheetId || !s.sheetName) return false;
  const headers = getHeaders().length > 0 ? getHeaders() : await sheets.readHeaders(s.sheetId, s.sheetName);
  const keyCol = orderNumberColumn(headers);
  if (!keyCol) return false;
  const found = await sheets.findRowByOrderNumber(s.sheetId, s.sheetName, keyCol, orderNumber);
  return found.row > 0;
}

/** Extract a spreadsheet ID from a pasted Sheets URL or raw ID. */
export function extractSheetId(input: string): string {
  const v = input.trim();
  if (!v) return '';
  const m = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(v);
  return m ? m[1] : v;
}
