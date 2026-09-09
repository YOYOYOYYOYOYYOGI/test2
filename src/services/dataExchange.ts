// ---------------------------------------------------------------------------
// Product + Order Excel exchange — separate, simple, real .xlsx.
//
//   PRODUCTS ONLY        products-YYYY-MM-DD.xlsx (one "Products" sheet)
//   ORDERS (existing)    today / filtered / all — unchanged, in excelExport.ts
//   ORDERS + PRODUCTS    orders-products-YYYY-MM-DD.xlsx with three sheets:
//                          Orders (every order field incl. custom fields),
//                          Products (product master),
//                          Order Items (per-line product snapshot)
//
// Matching rules (never create duplicates):
//   products — SKU → Product ID → Product Name (fallbacks only when the
//              stronger key is unavailable); existing products are UPDATED,
//              internal IDs are kept, and only values present in the file
//              are applied (missing/empty optional cells never erase data).
//   orders   — Order Number (trimmed, case-insensitive) is the primary key;
//              existing orders are updated, never duplicated.
//
// Historical safety: order items always carry their own snapshot (name, SKU,
// quantity, price as of the order) — later product renames/price changes
// never rewrite old orders. Imported historical old-data records live in
// their own store (settingsOldData) and are never touched here.
// ---------------------------------------------------------------------------
import type { Order, OrderField, Product, Settings } from '../types';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, makeId } from '../lib/constants';
import { roundMoney, computeTotal } from '../lib/format';
import { normalizeOrderNumber, normalizePhone, normalizePhoneText } from '../lib/normalizePhone';
import { xlsxWorkbookBlob, type XlsxCell, type XlsxSheet } from '../lib/xlsx';
import { parseXlsxSheets, type XlsxSheetRows } from '../lib/tableImport';
import { excelGrid, localDateStamp } from './excelExport';
import { resolveFieldColumn } from './spreadsheet/values';

// ---------------------------------------------------------------------------
// Sheet names
// ---------------------------------------------------------------------------
export const SHEET_ORDERS = 'Orders';
export const SHEET_PRODUCTS = 'Products';
export const SHEET_ITEMS = 'Order Items';

const keyOf = (h: string) => (h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------------------------------------------------------------------------
// PRODUCTS — export + import planning
// ---------------------------------------------------------------------------
export const PRODUCT_EXPORT_HEADERS = [
  'Product ID', 'Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position', 'Created At',
];

export interface ProductRowView {
  rowIndex: number;
  productId: string;
  name: string;
  sku: string;
  price: number;
  labelName: string;
  active: boolean;
}

export interface ImportAction {
  action: 'new' | 'update' | 'duplicate';
  /** matched existing product for updates */
  existingId?: string;
  view: ProductRowView;
  /** parsed file row (presence flags) — used when applying the plan */
  row?: ParsedProductRow;
}

export interface ProductImportPlan {
  columnsPresent: Set<string>;
  actions: ImportAction[];
  newCount: number;
  updateCount: number;
  duplicateCount: number;
  /** rows skipped (no name and no SKU) */
  problemCount: number;
  /** informational notes (e.g. unparsable price kept unchanged) */
  warnings: string[];
}

/** Rows for the Products sheet of any workbook. */
export function productsSheetRows(products: Product[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [PRODUCT_EXPORT_HEADERS];
  products.forEach((p, i) => {
    rows.push([
      p.id,
      p.name,
      p.sku ?? '',
      roundMoney(p.price),
      p.labelName ?? '',
      p.active ? 'Active' : 'Inactive',
      i + 1,
      new Date(p.createdAt ?? Date.now()).toISOString().slice(0, 10),
    ]);
  });
  return rows;
}

export function exportProductsBlob(products: Product[]): Blob {
  return xlsxWorkbookBlob([{ name: SHEET_PRODUCTS, rows: productsSheetRows(products) }]);
}

export function productsFilename(now: Date = new Date()): string {
  return `products-${localDateStamp(now)}.xlsx`;
}

// header aliases -> canonical product field
const PRODUCT_COLUMN_ALIASES: Record<string, string[]> = {
  id: ['product id', 'id', 'productid'],
  name: ['product name', 'name', 'product', 'item'],
  sku: ['sku', 'product sku', 'item code', 'code'],
  price: ['price', 'product price', 'mrp', 'rate', 'selling price'],
  labelName: ['label name', 'labelname', 'print name', 'label'],
  status: ['status', 'active', 'active/inactive', 'active inactive', 'isactive', 'enabled'],
  position: ['position', 'sort order', 'sortorder', 'order', 'product order'],
  createdAt: ['created at', 'createdat', 'created date', 'date created'],
};

function productColumnKey(header: string): string | null {
  const k = keyOf(header);
  if (!k) return null;
  for (const [canon, aliases] of Object.entries(PRODUCT_COLUMN_ALIASES)) {
    if (aliases.some((a) => keyOf(a) === k)) return canon;
  }
  return null;
}

function parseMoney(raw: unknown): number | null {
  const t = String(raw ?? '').replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function parseActive(raw: string): boolean {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return true;
  return ['active', 'yes', 'y', 'true', '1', 'enabled'].includes(s);
}

export interface ParsedProductRow {
  id: string;
  name: string;
  nameSet: boolean;   // non-empty Product Name on the row
  sku: string;
  skuSet: boolean;    // non-empty SKU on the row
  price: number;
  priceSet: boolean;  // Price column present with a parsable non-empty value
  labelName: string;
  labelSet: boolean;  // Label Name column physically present on the row
  active: boolean;
  activeSet: boolean; // Status column present with a non-empty value
  position: string;   // raw Position cell (file order hint — display only)
  createdAt?: string;
  problem?: string;   // informational note (row still imports when possible)
}

/** Parse product rows from a Products sheet. */
export function parseProductRows(sheetRows: string[][]): { rows: ParsedProductRow[]; columnsPresent: Set<string> } {
  const header = sheetRows[0] ?? [];
  const index = new Map<string, number>();
  const columnsPresent = new Set<string>();
  header.forEach((h, i) => {
    const canon = productColumnKey(h);
    if (canon) {
      columnsPresent.add(canon);
      if (!index.has(canon)) index.set(canon, i);
    }
  });
  const cell = (row: string[], canon: string) => {
    const idx = index.get(canon);
    return idx === undefined ? '' : String(row[idx] ?? '').trim();
  };
  // true when the column exists on the row AND the cell was physically
  // written (empty but present) — trailing empty cells are trimmed by the
  // parser, so a present-but-empty cell means the file intentionally
  // contained an empty value for that column.
  const physicallyPresent = (row: string[], canon: string) => {
    const idx = index.get(canon);
    return idx !== undefined && idx < row.length;
  };
  const rows: ParsedProductRow[] = [];
  for (let ri = 1; ri < sheetRows.length; ri += 1) {
    const row = sheetRows[ri] ?? [];
    if ((row ?? []).every((c) => !String(c ?? '').trim())) continue;
    const name = cell(row, 'name');
    const sku = cell(row, 'sku');
    if (!name && !sku) {
      rows.push({
        id: cell(row, 'id'), name: '', nameSet: false, sku: '', skuSet: false,
        price: 0, priceSet: false, labelName: '', labelSet: false, active: true, activeSet: false,
        position: '', problem: `Row ${ri + 1}: no product name or SKU — skipped.`,
      });
      continue;
    }
    const rawPrice = cell(row, 'price');
    const parsedPrice = rawPrice !== '' ? parseMoney(rawPrice) : null;
    const rawStatus = cell(row, 'status');
    rows.push({
      id: cell(row, 'id'),
      name,
      nameSet: name !== '',
      sku,
      skuSet: sku !== '',
      price: parsedPrice ?? 0,
      priceSet: parsedPrice !== null,
      labelName: cell(row, 'labelName'),
      labelSet: physicallyPresent(row, 'labelName'),
      active: rawStatus !== '' ? parseActive(rawStatus) : true,
      activeSet: rawStatus !== '',
      position: cell(row, 'position'),
      createdAt: cell(row, 'createdAt') || undefined,
      problem: columnsPresent.has('price') && rawPrice !== '' && parsedPrice === null
        ? `Row ${ri + 1}: price “${rawPrice}” is not a number — price left unchanged.`
        : undefined,
    });
  }
  return { rows, columnsPresent };
}

const normSku = (s: string) => (s ?? '').trim().toLowerCase();
const normName = (s: string) => (s ?? '').trim().toLowerCase();

/**
 * Classify imported product rows against the current catalogue.
 * Matching priority per row: SKU (when the file row has one) → Product ID →
 * exact Product Name. Rows that would double-match a product already claimed
 * by an earlier file row are counted as duplicates (never silently merged).
 */
export function planProductImport(products: Product[], sheetRows: string[][]): ProductImportPlan {
  const { rows, columnsPresent } = parseProductRows(sheetRows);
  const existing = [...products];
  const claimedExisting = new Set<string>();
  const inFileKeys = new Set<string>();
  const actions: ImportAction[] = [];
  const warnings: string[] = [];
  let newCount = 0;
  let updateCount = 0;
  let duplicateCount = 0;
  let problemCount = 0;

  rows.forEach((r) => {
    if (r.problem) {
      if (/skipped/.test(r.problem)) problemCount += 1;
      else warnings.push(r.problem);
    }
    if (!r.name && !r.sku) return; // skipped row (already counted)
    const fileKey = (r.sku ? `s:${normSku(r.sku)}` : `n:${normName(r.name)}`);
    if (inFileKeys.has(fileKey)) {
      duplicateCount += 1;
      actions.push({
        action: 'duplicate',
        row: r,
        view: { rowIndex: 0, productId: r.id, name: r.name, sku: r.sku, price: r.priceSet ? r.price : 0, labelName: r.labelName, active: r.active },
      });
      return;
    }
    inFileKeys.add(fileKey);
    // find an existing product — SKU → ID → Name (fallbacks only when the
    // stronger key is unavailable on the file row)
    let match: Product | undefined;
    if (r.sku) match = existing.find((p) => p.sku && normSku(p.sku) === normSku(r.sku));
    if (!match && !r.sku && r.id) match = existing.find((p) => p.id === r.id);
    if (!match && !r.sku) match = existing.find((p) => normName(p.name) === normName(r.name));
    if (match) {
      if (claimedExisting.has(match.id)) {
        duplicateCount += 1;
        actions.push({
          action: 'duplicate',
          row: r,
          view: { rowIndex: 0, productId: r.id, name: r.name, sku: r.sku, price: r.priceSet ? r.price : match.price, labelName: r.labelName, active: r.active },
        });
        return;
      }
      claimedExisting.add(match.id);
      updateCount += 1;
      actions.push({
        action: 'update',
        existingId: match.id,
        row: r,
        view: {
          rowIndex: 0,
          productId: match.id,
          name: r.name || match.name,
          sku: r.sku || match.sku || '',
          price: r.priceSet ? r.price : match.price,
          labelName: r.labelName !== undefined ? (r.labelSet ? r.labelName : match.labelName || '') : (match.labelName || ''),
          active: r.activeSet ? r.active : match.active,
        },
      });
      return;
    }
    newCount += 1;
    actions.push({
      action: 'new',
      row: r,
      view: {
        rowIndex: 0,
        productId: r.id,
        name: r.name || 'Unnamed product',
        sku: r.sku || '',
        price: r.priceSet ? r.price : 0,
        labelName: r.labelSet ? r.labelName : '',
        active: r.activeSet ? r.active : true,
      },
    });
  });

  return { columnsPresent, actions, newCount, updateCount, duplicateCount, problemCount, warnings };
}

/** Apply a product import plan:
 *  - updates keep the existing internal id (orders never break) AND their
 *    current catalogue position (in-app sort order / Position is preserved) —
 *    only values the file intentionally includes are applied (missing
 *    columns or empty optional cells never erase existing data);
 *  - new products are appended in file-row order at the end (like adding
 *    them in the UI) and reuse the file id only when it is free — otherwise
 *    a fresh id is generated. */
export function applyProductImport(existing: Product[], plan: ProductImportPlan): Product[] {
  const now = Date.now();
  const usedIds = new Set(existing.map((p) => p.id));
  const updates = new Map<string, Product>();
  const created: Product[] = [];
  let createdIdx = 0;
  for (const a of plan.actions) {
    const r = a.row;
    if (a.action === 'duplicate') continue;
    if (a.action === 'update' && a.existingId) {
      const cur = existing.find((p) => p.id === a.existingId);
      if (!cur || !r) continue;
      const next: Product = { ...cur };
      if (r.nameSet && r.name !== cur.name) next.name = r.name;
      if (r.skuSet && r.sku !== (cur.sku ?? '')) next.sku = r.sku;
      if (r.priceSet && r.price !== cur.price) next.price = r.price;
      if (r.labelSet && (r.labelName || '') !== (cur.labelName ?? '')) next.labelName = r.labelName || undefined;
      if (r.activeSet && r.active !== cur.active) next.active = r.active;
      updates.set(cur.id, next);
      continue;
    }
    if (a.action === 'new') {
      const id = a.view.productId && !usedIds.has(a.view.productId) ? a.view.productId : makeId();
      usedIds.add(id);
      created.push({
        id,
        name: a.view.name || 'Unnamed product',
        sku: a.view.sku || '',
        price: a.view.price || 0,
        labelName: a.view.labelName || undefined,
        active: a.view.active,
        createdAt: now - createdIdx,
      });
      createdIdx += 1;
    }
  }
  const out = existing.map((p) => updates.get(p.id) ?? p);
  out.push(...created);
  return out;
}

// ---------------------------------------------------------------------------
// FULL WORKBOOK — Orders + Products + Order Items (export)
// ---------------------------------------------------------------------------
export interface FullExportCtx {
  settings: Settings;
  fields: OrderField[];
  products: Product[];
}

function dt(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Orders sheet: the standard all-orders layout plus system columns that
 *  make a full restore possible (label/print/created/updated stamps). */
export function fullOrdersSheet(orders: Order[], ctx: FullExportCtx): XlsxCell[][] {
  const sorted = [...orders].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.orderNumber.localeCompare(b.orderNumber),
  );
  const grid = excelGrid(sorted, ctx); // header row + one row per order
  const headerRow = grid[0]?.map((h) => String(h ?? '')) ?? [];
  const have = new Set(headerRow.map((h) => h.trim().toLowerCase()));
  const extras: { header: string; get: (o: Order) => string }[] = [
    { header: 'Label Status', get: (o) => o.printed ?? 'Not Printed' },
    { header: 'Printed At', get: (o) => dt(o.printedAt) },
    { header: 'Created At', get: (o) => dt(o.createdAt) },
    { header: 'Updated At', get: (o) => dt(o.updatedAt) },
  ];
  for (const e of extras) {
    if (have.has(e.header.toLowerCase())) continue;
    headerRow.push(e.header);
    have.add(e.header.toLowerCase());
    sorted.forEach((o, i) => {
      const row = grid[i + 1] ?? [];
      row.push(e.get(o));
    });
  }
  if (grid.length === 0) grid.push(headerRow);
  else grid[0] = headerRow;
  return grid;
}

const ITEMS_HEADERS = ['Order Number', 'Product ID', 'Product Name', 'SKU', 'Quantity', 'Price', 'Subtotal'];

export function orderItemsSheet(orders: Order[], products: Product[]): XlsxCell[][] {
  const sorted = [...orders].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.orderNumber.localeCompare(b.orderNumber),
  );
  const skuOf = (productId: string, fallback?: string) => {
    const p = products.find((x) => x.id === productId);
    return p ? p.sku || '' : fallback ?? '';
  };
  const rows: XlsxCell[][] = [ITEMS_HEADERS];
  for (const o of sorted) {
    for (const line of Object.values(o.products)) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      rows.push([
        o.orderNumber,
        line.productId ?? '',
        line.productName ?? '',
        skuOf(line.productId ?? '', line.sku),
        qty,
        roundMoney(price),
        roundMoney(qty * price),
      ]);
    }
  }
  return rows;
}

export function fullWorkbook(orders: Order[], ctx: FullExportCtx): { blob: Blob; filename: string; orderCount: number; productCount: number; itemCount: number } {
  const sheets: XlsxSheet[] = [
    { name: SHEET_ORDERS, rows: fullOrdersSheet(orders, ctx) },
    { name: SHEET_PRODUCTS, rows: productsSheetRows(ctx.products) },
    { name: SHEET_ITEMS, rows: orderItemsSheet(orders, ctx.products) },
  ];
  return {
    blob: xlsxWorkbookBlob(sheets),
    filename: `orders-products-${localDateStamp()}.xlsx`,
    orderCount: orders.length,
    productCount: ctx.products.length,
    itemCount: orders.reduce((s, o) => s + Object.keys(o.products).length, 0),
  };
}

// ---------------------------------------------------------------------------
// FULL IMPORT — read the three sheets and plan/apply the merge
// ---------------------------------------------------------------------------

export interface FullImportCounts {
  ordersFound: number;
  productsFound: number;
  itemsFound: number;
  newProducts: number;
  existingProducts: number;
  duplicateProducts: number;
  newOrders: number;
  existingOrders: number;
  problemRows: number;
}

export interface FullImportPlan extends FullImportCounts {
  ok: boolean;
  fileName: string;
  errors: string[];
  /** raw parsed sheets — kept for the apply step (same session only) */
  sheetOrders: string[][];
  sheetProducts: string[][];
  sheetItems: string[][];
}

const ORDERS_ALIASES: Record<string, string[]> = {
  orderNumber: ['order number', 'order no', 'order'],
  previousOrderNumber: ['previous order number', 'previous order'],
  customerName: ['customer name', 'name', 'client name'],
  customerWhatsapp: ['whatsapp number', 'whatsapp', 'wa number', 'whatsapp no', 'whatsapp no.'],
  customerMobile: ['mobile number', 'mobile', 'mobile no', 'mobile no.'],
  customerAddress: ['address', 'customer address', 'full address', 'shipping address'],
  customerCity: ['city'],
  customerState: ['state'],
  customerPincode: ['pincode', 'pin code', 'zip'],
  paymentStatus: ['payment status'],
  paymentMethod: ['payment method', 'payment type'],
  transactionId: ['transaction id', 'txn id', 'transaction'],
  paymentAmount: ['payment amount', 'amount paid', 'paid amount'],
  orderStatus: ['order status'],
  notes: ['notes', 'note'],
  deliveryCharge: ['delivery charge', 'delivery'],
  totalAmount: ['total', 'total amount', 'grand total'],
  labelStatus: ['label status', 'print status'],
  printedAt: ['printed at'],
  createdAt: ['created at', 'date', 'order date'],
  updatedAt: ['updated at'],
};

type ColumnBinding =
  | { kind: 'slot'; slot: string; idx: number }
  | { kind: 'custom'; fieldId: string; fieldType: string; idx: number }
  | { kind: 'ignore'; idx: number };

/** Bind Orders-sheet header columns: canonical slots first, then columns
 *  that match a configured custom field (by resolved column/name), then
 *  everything else (product Qty columns, unknown columns) is ignored. */
export function bindOrderColumns(headerRow: string[], fields: OrderField[], settings: Settings): ColumnBinding[] {
  const bindings: ColumnBinding[] = [];
  const usedCanonical = new Set<string>();
  headerRow.forEach((h, idx) => {
    const key = keyOf(h);
    if (!key) return;
    for (const [canon, aliases] of Object.entries(ORDERS_ALIASES)) {
      if (!usedCanonical.has(canon) && aliases.some((a) => keyOf(a) === key)) {
        bindings.push({ kind: 'slot', slot: canon, idx });
        usedCanonical.add(canon);
        return;
      }
    }
    const field = fields.find(
      (f) => keyOf(resolveFieldColumn(f, settings)) === key || keyOf(f.name) === key || keyOf(f.columnHeader ?? '') === key,
    );
    if (field && String(field.key) === 'custom') {
      bindings.push({ kind: 'custom', fieldId: field.id, fieldType: field.type, idx });
      return;
    }
    bindings.push({ kind: 'ignore', idx });
  });
  return bindings;
}

function cellOf(row: string[], idx: number | undefined): string {
  return idx === undefined ? '' : String(row[idx] ?? '').trim();
}

function asNumber(raw: string): number | null {
  if (!raw) return null;
  const t = raw.replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function enumMatch<T extends string>(list: readonly T[], raw: string): T | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  return list.find((x) => x.toLowerCase() === v) ?? null;
}

export interface ParsedOrderRow {
  orderNumber: string;
  previousOrderNumber: string;
  customer: Order['customer'];
  paymentStatus: Order['paymentStatus'] | null;
  paymentMethod: Order['paymentMethod'] | null;
  transactionId: string;
  paymentAmount: string;
  orderStatus: Order['orderStatus'] | null;
  notes: string;
  deliveryCharge: number | null;
  totalFromFile: number | null;
  labelStatus: Order['printed'] | null;
  printedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  custom: Record<string, string | number | boolean>;
  sourceRow: number;
}

function tsOfText(raw: string): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/.exec(raw);
  if (m) {
    const t = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] ?? 0), Number(m[5] ?? 0),
    ).getTime();
    if (Number.isFinite(t)) return t;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Parse one Orders-sheet row into an order-like object using the bindings. */
export function parseOrderRow(row: string[], bindings: ColumnBinding[], sourceRow: number): ParsedOrderRow | null {
  const get = (slot: string) => {
    const b = bindings.find((x) => x.kind === 'slot' && x.slot === slot) as { idx: number } | undefined;
    return b ? cellOf(row, b.idx) : '';
  };
  const orderNumber = normalizeOrderNumber(get('orderNumber'));
  if (!orderNumber) return null;
  const custOf = (slot: string) => {
    const v = get(slot);
    if (slot === 'customerWhatsapp') return normalizePhone(v);
    if (slot === 'customerMobile') return normalizePhoneText(v);
    return v;
  };
  const custom: Record<string, string | number | boolean> = {};
  for (const b of bindings) {
    if (b.kind !== 'custom') continue;
    const raw = cellOf(row, b.idx);
    if (!raw) continue;
    const t = b.fieldType;
    if (t === 'checkbox') custom[b.fieldId] = ['yes', 'true', '1', 'active'].includes(raw.trim().toLowerCase());
    else if (t === 'number' || t === 'currency' || t === 'quantity') {
      const n = asNumber(raw);
      custom[b.fieldId] = n !== null ? n : raw;
    } else custom[b.fieldId] = raw;
  }
  const rawPrev = get('previousOrderNumber');
  return {
    orderNumber,
    previousOrderNumber: rawPrev ? normalizeOrderNumber(rawPrev) : '',
    customer: {
      name: custOf('customerName'),
      whatsapp: custOf('customerWhatsapp'),
      mobile: custOf('customerMobile'),
      address: custOf('customerAddress'),
      city: custOf('customerCity'),
      state: custOf('customerState'),
      pincode: custOf('customerPincode'),
    },
    paymentStatus: enumMatch(PAYMENT_STATUSES, get('paymentStatus')),
    paymentMethod: enumMatch(PAYMENT_METHODS, get('paymentMethod')),
    transactionId: get('transactionId'),
    paymentAmount: get('paymentAmount'),
    orderStatus: enumMatch(ORDER_STATUSES, get('orderStatus')),
    notes: get('notes'),
    deliveryCharge: asNumber(get('deliveryCharge')),
    totalFromFile: asNumber(get('totalAmount')),
    labelStatus: /^printed$/i.test(get('labelStatus')) ? 'Printed' : /not printed/i.test(get('labelStatus')) ? 'Not Printed' : null,
    printedAt: tsOfText(get('printedAt')),
    createdAt: tsOfText(get('createdAt')),
    updatedAt: tsOfText(get('updatedAt')),
    custom,
    sourceRow,
  };
}

export interface ParsedItemRow {
  orderNumber: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
}

/** Parse Order Items rows (the per-line snapshot). */
export function parseItemRows(sheetRows: string[][]): ParsedItemRow[] {
  const header = sheetRows[0] ?? [];
  const find = (aliases: string[]) => {
    for (const a of aliases) {
      const idx = header.findIndex((h) => keyOf(h) === keyOf(a));
      if (idx >= 0) return idx;
    }
    return undefined;
  };
  const idxOrder = find(['order number', 'order no']);
  const idxPid = find(['product id', 'productid']);
  const idxName = find(['product name', 'item name', 'name']);
  const idxSku = find(['sku', 'product sku']);
  const idxQty = find(['quantity', 'qty']);
  const idxPrice = find(['price', 'unit price', 'rate']);
  const rows: ParsedItemRow[] = [];
  for (let ri = 1; ri < sheetRows.length; ri += 1) {
    const row = sheetRows[ri] ?? [];
    const orderNumber = normalizeOrderNumber(cellOf(row, idxOrder));
    if (!orderNumber) continue;
    const qty = asNumber(cellOf(row, idxQty));
    if (qty === null) continue;
    rows.push({
      orderNumber,
      productId: cellOf(row, idxPid),
      productName: cellOf(row, idxName),
      sku: cellOf(row, idxSku),
      quantity: qty,
      price: asNumber(cellOf(row, idxPrice)) ?? 0,
    });
  }
  return rows;
}

export interface ImportCurrentState {
  orders: Order[];
  products: Product[];
  fields: OrderField[];
  settings: Settings;
}

/** Read a full workbook file (Orders / Products / Order Items sheets) and
 *  produce the preview counts + parsed rows. NOTHING is stored here. */
export async function readFullWorkbook(file: File, current: ImportCurrentState): Promise<FullImportPlan> {
  const buf = await file.arrayBuffer();
  const sheets = await parseXlsxSheets(buf);
  const byName = new Map(sheets.map((s) => [keyOf(s.name), s]));
  const pick = (names: string[], fallbackIndex: number): XlsxSheetRows | undefined =>
    names.map((n) => byName.get(keyOf(n))).find((s) => s !== undefined)
    ?? (sheets.length > fallbackIndex ? sheets[fallbackIndex] : undefined);

  const productsSheet = pick([SHEET_PRODUCTS], 1);
  const itemsSheet = pick([SHEET_ITEMS], 2);
  const ordersSheet = pick([SHEET_ORDERS], 0);

  const errors: string[] = [];
  if (!ordersSheet || ordersSheet.rows.length <= 1) errors.push('No Orders data found (sheet 1).');
  if (!productsSheet || productsSheet.rows.length <= 1) errors.push('No Products data found (sheet 2).');
  if (!itemsSheet || itemsSheet.rows.length <= 1) errors.push('No Order Items data found (sheet 3).');
  const empty: FullImportPlan = {
    ok: false, fileName: file.name, errors,
    ordersFound: 0, productsFound: 0, itemsFound: 0,
    newProducts: 0, existingProducts: 0, duplicateProducts: 0,
    newOrders: 0, existingOrders: 0, problemRows: 0,
    sheetOrders: [], sheetProducts: [], sheetItems: [],
  };
  if (errors.length > 0) return empty;

  const orderRows = ordersSheet!.rows;
  const bindings = bindOrderColumns(orderRows[0] ?? [], current.fields, current.settings);
  const seen = new Set<string>();
  const existingNumbers = new Set(current.orders.map((o) => o.orderNumber.trim().toLowerCase()));
  let orderCount = 0;
  let newOrders = 0;
  let existingOrders = 0;
  for (let ri = 1; ri < orderRows.length; ri += 1) {
    const row = orderRows[ri];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;
    const parsed = parseOrderRow(row, bindings, ri + 1);
    if (!parsed) continue;
    const key = parsed.orderNumber.toLowerCase();
    if (seen.has(key)) continue; // duplicates inside the file — one order
    seen.add(key);
    orderCount += 1;
    if (existingNumbers.has(key)) existingOrders += 1;
    else newOrders += 1;
  }

  const productPlan = planProductImport(current.products, productsSheet!.rows);
  const itemRows = parseItemRows(itemsSheet!.rows);

  return {
    ok: true,
    fileName: file.name,
    errors: [],
    ordersFound: orderCount,
    productsFound: Math.max(0, productsSheet!.rows.length - 1),
    itemsFound: itemRows.length,
    newProducts: productPlan.newCount,
    existingProducts: productPlan.updateCount,
    duplicateProducts: productPlan.duplicateCount,
    newOrders,
    existingOrders,
    problemRows: productPlan.problemCount,
    sheetOrders: orderRows,
    sheetProducts: productsSheet!.rows,
    sheetItems: itemsSheet!.rows,
  };
}

/** Apply a full import: products first (SKU → ID → Name), then orders by
 *  Order Number, then Order Items reconnected to the imported products.
 *  Order line prices/names always come from the Order Items snapshot, so
 *  later product changes never alter historical orders. Existing rows that
 *  are NOT in the file are never deleted. */
export function applyFullImport(plan: FullImportPlan, current: ImportCurrentState): { orders: Order[]; products: Product[] } {
  const productPlan = planProductImport(current.products, plan.sheetProducts);
  const products = applyProductImport(current.products, productPlan);

  // reconnect Order Items: file product id -> target product id
  const productsById = new Map(products.map((p) => [p.id, p]));
  const sourceIdToTarget = new Map<string, string>();
  const sourceSkuToTarget = new Map<string, string>();
  const sourceNameToTarget = new Map<string, string>();
  for (const a of productPlan.actions) {
    if (a.action === 'duplicate') continue;
    const target = a.action === 'update' && a.existingId ? productsById.get(a.existingId) : undefined;
    if (!target) continue;
    // the FILE row carries the source product id (view holds the target id
    // for updates) — that is what Order Items reference
    const sourceId = (a.action === 'update' && a.row?.id) ? a.row.id : a.view.productId;
    if (sourceId) sourceIdToTarget.set(sourceId, target.id);
    if (a.view.sku) sourceSkuToTarget.set(normSku(a.view.sku), target.id);
    if (a.view.name) sourceNameToTarget.set(normName(a.view.name), target.id);
  }
  // pre-existing untouched products also resolve by sku/name
  for (const p of products) {
    sourceSkuToTarget.set(normSku(p.sku), p.id);
    sourceNameToTarget.set(normName(p.name), p.id);
  }

  const bindings = bindOrderColumns(plan.sheetOrders[0] ?? [], current.fields, current.settings);
  const ordersByNumber = new Map(current.orders.map((o) => [o.orderNumber.trim().toLowerCase(), o]));
  const seenInFile = new Set<string>();
  const parsedOrders: ParsedOrderRow[] = [];
  for (let ri = 1; ri < plan.sheetOrders.length; ri += 1) {
    const row = plan.sheetOrders[ri];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;
    const parsed = parseOrderRow(row, bindings, ri + 1);
    if (!parsed) continue;
    const key = parsed.orderNumber.toLowerCase();
    if (seenInFile.has(key)) continue;
    seenInFile.add(key);
    parsedOrders.push(parsed);
  }

  const itemsByOrder = new Map<string, ParsedItemRow[]>();
  for (const item of parseItemRows(plan.sheetItems)) {
    const key = item.orderNumber.toLowerCase();
    const list = itemsByOrder.get(key);
    if (list) list.push(item);
    else itemsByOrder.set(key, [item]);
  }

  const finalOrders: Order[] = [];
  const now = Date.now();
  let ghostSeq = 0;
  for (const parsed of parsedOrders) {
    const key = parsed.orderNumber.toLowerCase();
    const existing = ordersByNumber.get(key);
    const items = itemsByOrder.get(key) ?? [];
    let productsMap: Order['products'];
    if (items.length === 0 && existing) {
      // order exists in the store but the file carries no lines for it —
      // never wipe historical order products
      productsMap = { ...existing.products };
    } else {
      productsMap = {};
      for (const item of items) {
        let targetId: string | undefined;
        if (item.productId) targetId = sourceIdToTarget.get(item.productId) ?? productsById.get(item.productId)?.id;
        if (!targetId && item.sku) targetId = sourceSkuToTarget.get(normSku(item.sku));
        if (!targetId && item.productName) targetId = sourceNameToTarget.get(normName(item.productName));
        const targetProduct = targetId ? productsById.get(targetId) : undefined;
        const keyId = targetId ?? `snap-${(ghostSeq += 1)}-${item.productId || item.sku || 'x'}`;
        productsMap[keyId] = {
          // the line keeps its historical identity — a ghost key only guards
          // the order's object map against future product-id collisions
          productId: item.productId || keyId,
          productName: item.productName || targetProduct?.name || '(unknown product)',
          sku: item.sku || targetProduct?.sku || undefined,
          quantity: item.quantity,
          price: item.price,
          labelName: targetProduct?.labelName,
        };
      }
    }
    const deliveryCharge = parsed.deliveryCharge ?? (existing?.deliveryCharge ?? 0);
    const subtotal = roundMoney(computeTotal(productsMap));
    const merged: Order = {
      id: existing?.id ?? makeId(),
      orderNumber: parsed.orderNumber,
      customer: {
        name: parsed.customer.name || existing?.customer.name || '',
        whatsapp: parsed.customer.whatsapp || existing?.customer.whatsapp || '',
        mobile: parsed.customer.mobile || existing?.customer.mobile || '',
        address: parsed.customer.address || existing?.customer.address || '',
        city: parsed.customer.city || existing?.customer.city || '',
        state: parsed.customer.state || existing?.customer.state || '',
        pincode: parsed.customer.pincode || existing?.customer.pincode || '',
      },
      products: productsMap,
      paymentStatus: parsed.paymentStatus ?? existing?.paymentStatus ?? 'Pending',
      paymentMethod: parsed.paymentMethod ?? existing?.paymentMethod ?? 'UPI',
      transactionId: parsed.transactionId || existing?.transactionId || '',
      paymentAmount: parsed.paymentAmount || existing?.paymentAmount || '',
      orderStatus: parsed.orderStatus ?? existing?.orderStatus ?? 'New',
      notes: parsed.notes || existing?.notes || '',
      customFields: { ...(existing?.customFields ?? {}), ...parsed.custom },
      deliveryCharge,
      previousOrderNumber: parsed.previousOrderNumber || existing?.previousOrderNumber,
      totalAmount: parsed.deliveryCharge !== null
        ? roundMoney(subtotal + deliveryCharge)
        : parsed.totalFromFile ?? (existing && existing.totalAmount > 0 ? existing.totalAmount : subtotal + deliveryCharge),
      printed: parsed.labelStatus ?? existing?.printed ?? 'Not Printed',
      printedAt: parsed.printedAt ?? existing?.printedAt ?? null,
      createdAt: parsed.createdAt ?? existing?.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
      spreadsheetRow: existing?.spreadsheetRow ?? undefined,
      syncedAt: existing?.syncedAt ?? null,
      pendingSync: existing?.pendingSync ?? false,
    };
    finalOrders.push(merged);
  }
  const importedKeys = new Set(finalOrders.map((o) => o.orderNumber.toLowerCase()));
  for (const o of current.orders) {
    if (!importedKeys.has(o.orderNumber.toLowerCase())) finalOrders.push(o);
  }
  return { orders: finalOrders, products };
}
