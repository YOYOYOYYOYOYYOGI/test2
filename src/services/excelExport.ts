// ---------------------------------------------------------------------------
// Excel export — Orders page → .xlsx downloads.
//
// Columns are NEVER hard-coded. They mirror the spreadsheet structure the app
// writes: one column per *included* admin field (in field order, respecting
// header names/mappings) + one "<Product> Qty" column per product, with zero
// fill for products not in an order. Rows = orders (one per row).
//
// Data source = the same order store the extension already uses (the local
// cache that mirrors Google Sheets); no duplicate database is created.
// ---------------------------------------------------------------------------
import type { Order, OrderField, Product, Settings } from '../types';
import { xlsxBlob } from '../lib/xlsx';
import { boundFieldValue, productColumnName, resolveFieldColumn } from './spreadsheet/values';

export type ExcelValue = string | number | boolean | null;

interface ColumnDef {
  header: string;
  value: (o: Order) => ExcelValue;
}

interface ExportCtx {
  settings: Settings;
  fields: OrderField[];
  products: Product[];
}

const MONEY_KEYS = new Set(['paymentAmount', 'totalAmount']);
const NUM_TYPES = new Set(['number', 'quantity', 'currency']);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "1,20,000" / "₹1,200" / "1697" → 120000 / 1200 / 1697 */
function parseAmount(raw: string): number | null {
  const t = raw.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? round2(n) : null;
}

/** Pure digit strings (order numbers, phones, pincodes) become real numbers. */
function digitNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  if (raw.length > 15) return null; // would exceed Excel numeric precision
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function excelValue(raw: string | number | boolean | undefined | null, field: OrderField): ExcelValue {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') return round2(raw);
  const s = String(raw);
  const key = String(field.key ?? '');
  const type = field.type;

  // Currency / amounts (may carry ₹ or Indian digit-grouping commas)
  if (type === 'currency' || MONEY_KEYS.has(key)) {
    const n = parseAmount(s);
    return n !== null ? n : s;
  }
  // Plain numeric fields
  if (NUM_TYPES.has(type)) {
    const n = parseAmount(s);
    return n !== null ? n : s;
  }
  // Phones / order numbers / pincodes: "1001" → 1001 (matches the reference
  // tables); anything with letters or +91 stays text.
  if (/^\+?\d{4,15}$/.test(s.replace(/\s/g, ''))) {
    const n = digitNumber(s.replace(/\s/g, ''));
    if (n !== null) return n;
  }
  return s;
}

/** Order fields that map to user-facing columns in this export. */
function includedFields(fields: OrderField[], settings: Settings): OrderField[] {
  const set = new Set(settings.includedFields ?? fields.map((f) => f.id));
  return fields
    .filter((f) => set.has(f.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || 0);
}

/** Products that get a "Qty" column (mirrors the spreadsheet's product set). */
function includedProducts(products: Product[], settings: Settings): Product[] {
  const set = new Set(settings.products?.included ?? products.filter((p) => p.active).map((p) => p.id));
  return products.filter((p) => set.has(p.id));
}

/** Build the dynamic column list. Duplicate headers are dropped (first wins). */
export function excelColumns(ctx: ExportCtx): ColumnDef[] {
  const cols: ColumnDef[] = [];
  const seen = new Set<string>();
  const push = (header: string, value: (o: Order) => ExcelValue) => {
    const h = (header || '').trim();
    if (!h || seen.has(h.toLowerCase())) return; // no duplicate columns
    seen.add(h.toLowerCase());
    cols.push({ header: h, value });
  };

  for (const f of includedFields(ctx.fields, ctx.settings)) {
    const header = resolveFieldColumn(f, ctx.settings) || f.name;
    push(header, (o) => excelValue(boundFieldValue(o, f), f));
  }
  for (const p of includedProducts(ctx.products, ctx.settings)) {
    const header = productColumnName(p);
    push(header, (o) => {
      const line = o.products[p.id];
      return line ? round2(line.quantity) : 0; // zero-fill, same as the sheet
    });
  }
  return cols;
}

/** Header strings only (handy for previews/tests). */
export function excelHeaders(ctx: ExportCtx): string[] {
  return excelColumns(ctx).map((c) => c.header);
}

/** Build the full workbook grid: row 0 = headers, then one row per order. */
export function excelGrid(orders: Order[], ctx: ExportCtx): (string | number | boolean | null)[][] {
  const cols = excelColumns(ctx);
  const headers = cols.map((c) => c.header);
  const body = [...orders]
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.orderNumber.localeCompare(b.orderNumber))
    .map((o) => cols.map((c) => c.value(o)));
  return [headers, ...body];
}

// ---------------------------------------------------------------------------
// "Today" semantics + filenames (local time, actual current date)
// ---------------------------------------------------------------------------
export function localDateStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** [start, end) ms range covering the local day of `now`. */
export function todayRange(now: number = Date.now()): [number, number] {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return [start, end];
}

/** Orders whose createdAt falls on the same local day as `now`. */
export function ordersCreatedToday(orders: Order[], now: number = Date.now()): Order[] {
  const [start, end] = todayRange(now);
  return orders.filter((o) => {
    const ts = o.createdAt ?? 0;
    return ts >= start && ts < end;
  });
}

export function excelFilename(kind: 'today' | 'all', now: Date = new Date()): string {
  return kind === 'today' ? `orders-${localDateStamp(now)}.xlsx` : 'all-orders.xlsx';
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Build the workbook for a download. Returns the blob + filename + how many
 * order rows it contains (0 = none on that day / none stored).
 */
export function prepareOrdersExport(
  kind: 'today' | 'all',
  orders: Order[],
  ctx: ExportCtx,
  now: Date = new Date(),
): { filename: string; blob: Blob; count: number } {
  const source = kind === 'today' ? ordersCreatedToday(orders, now.getTime()) : orders;
  const grid = excelGrid(source, ctx);
  return {
    filename: excelFilename(kind, now),
    blob: xlsxBlob(grid, { sheetName: 'Orders' }),
    count: source.length,
  };
}

