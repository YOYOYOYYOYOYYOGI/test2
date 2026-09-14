// ---------------------------------------------------------------------------
// Full workbook (Orders + Products + Order Items) export/import
// — 3 sheets, order-number and SKU keys, snapshot order items, idempotent.
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { parseXlsxSheets, type XlsxSheetRows } from '../src/lib/tableImport';
import { xlsxWorkbookBlob } from '../src/lib/xlsx';
import { fullWorkbook, readFullWorkbook, applyFullImport } from '../src/services/dataExchange';
import type { Order, Product, OrderField } from '../src/types';

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow]);
});

const T = 1_700_000_000_000; // stable "now" (Nov 2023)
const mkOrder = (orderNumber: string, customer: string, productId: string, name: string, qty: number, price: number, extra: Partial<Order> = {}): Order => ({
  id: orderNumber + '-id',
  orderNumber,
  customer: { name: customer, whatsapp: '9876543210', mobile: '9876500000', address: 'MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  products: { [productId]: { productId, productName: name, quantity: qty, price } },
  paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
  orderStatus: 'New', notes: '', totalAmount: qty * price,
  printed: 'Not Printed', printedAt: null, createdAt: T, updatedAt: T,
  customFields: { instagram: '@shop' },
  ...extra,
});

const products: Product[] = [
  { id: 'pr1', name: 'Night Cream', sku: 'NC001', price: 500, active: true, createdAt: 1 },
  { id: 'pr2', name: 'Face Serum', sku: 'FS001', price: 699, active: true, createdAt: 2 },
];

const withInstagramField = (fields: OrderField[], settings: ReturnType<typeof makeDefaultSettingsWithTemplate>['settings']) => {
  const insta: OrderField = { id: 'instagram', name: 'Instagram', type: 'text', required: false, key: 'custom', order: 60 };
  fields = [...fields, insta];
  settings.includedFields = [...(settings.includedFields ?? []), 'instagram'];
  return { settings, fields };
};

const mkCtx = () => {
  const base = makeDefaultSettingsWithTemplate();
  const { settings, fields } = withInstagramField(base.fields, base.settings);
  settings.demoMode = true;
  settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
  const orders: Order[] = [
    mkOrder('14031', 'Rahul Sharma', 'pr1', 'Night Cream', 2, 500),
    mkOrder('14032', 'Priya Patel', 'pr2', 'Face Serum', 1, 699),
  ];
  return { settings, fields, orders };
};

const ctxBase = (): { settings: ReturnType<typeof makeDefaultSettingsWithTemplate>['settings']; fields: OrderField[]; orders: Order[] } => mkCtx();

const asFile = (blob: Blob, name = 'orders-products-2024-01-01.xlsx'): File =>
  new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

const fileOfSheets = (sheets: XlsxSheetRows[], name = 'orders-products-2024-01-01.xlsx'): File =>
  new File([xlsxWorkbookBlob(sheets)], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('full workbook export', () => {
  it('produces a 3-sheet workbook with exact sheet names and column orders', async () => {
    const { settings, fields, orders } = ctxBase();
    const ctx = { settings, fields, products };
    const { blob, filename, orderCount, productCount, itemCount } = fullWorkbook(orders, ctx);
    expect(filename).toMatch(/^orders-products-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(orderCount).toBe(2);
    expect(productCount).toBe(2);
    expect(itemCount).toBe(2);

    const sheets = await parseXlsxSheets(await blob.arrayBuffer());
    expect(sheets.map((s) => s.name)).toEqual(['Orders', 'Products', 'Order Items']);

    const ordersSheet = sheets[0];
    expect(ordersSheet.rows[0]).toContain('Order Number');
    const onumIdx = ordersSheet.rows[0].indexOf('Order Number');
    const onums = ordersSheet.rows.slice(1).map((r) => r[onumIdx]);
    expect(onums).toEqual(['14031', '14032']); // text, never numbers

    const productsSheet = sheets[1];
    expect(productsSheet.rows[0]).toEqual(['Product ID', 'Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position', 'Created At']);
    expect(productsSheet.rows[1][1]).toBe('Night Cream');
    expect(productsSheet.rows[2][1]).toBe('Face Serum');

    const itemsSheet = sheets[2];
    expect(itemsSheet.rows[0]).toEqual(['Order Number', 'Product ID', 'Product Name', 'SKU', 'Quantity', 'Price', 'Subtotal']);
    expect(itemsSheet.rows[1]).toEqual(['14031', 'pr1', 'Night Cream', 'NC001', '2', '500', '1000']);
    expect(itemsSheet.rows[2]).toEqual(['14032', 'pr2', 'Face Serum', 'FS001', '1', '699', '699']);
  });

  it('carries product snapshot into every item — qty numeric string, prices exact', async () => {
    const { settings, fields, orders } = ctxBase();
    const order = mkOrder('14099', 'Meera', 'pr2', 'Face Serum', 3, 699);
    const { blob } = fullWorkbook([order], { settings, fields, products });
    const sheets = await parseXlsxSheets(await blob.arrayBuffer());
    const items = sheets.find((s) => s.name === 'Order Items')!;
    expect(items.rows[1][4]).toBe('3');
    expect(items.rows[1][5]).toBe('699');
    expect(items.rows[1][6]).toBe('2097');
  });
});

describe('full workbook import', () => {
  it('round-trips orders+products+items without drift; second import is a no-op (idempotent)', async () => {
    const { settings, fields, orders } = ctxBase();
    const ctx = { settings, fields, products };
    const { blob } = fullWorkbook(orders, ctx);

    // first import onto an empty store — counts + no product id collisions
    const first = await readFullWorkbook(asFile(blob), { orders: [], products: [], fields, settings });
    expect(first.ok).toBe(true);
    expect(first.ordersFound).toBe(2);
    expect(first.productsFound).toBe(2);
    expect(first.itemsFound).toBe(2);
    expect(first.newOrders).toBe(2);
    expect(first.newProducts).toBe(2);
    const applied1 = applyFullImport(first, { orders: [], products: [], fields, settings });
    expect(applied1.orders.map((o) => o.orderNumber).sort()).toEqual(['14031', '14032']);
    const pr1 = applied1.products.find((p) => p.sku === 'NC001')!;
    expect(pr1.name).toBe('Night Cream');
    expect(pr1.price).toBe(500);
    expect(pr1.id).toBe('pr1'); // original ids free → reused
    // items reconnected via orderNumber + productId
    expect(applied1.orders.find((o) => o.orderNumber === '14031')!.products['pr1'].productName).toBe('Night Cream');
    expect(applied1.orders.find((o) => o.orderNumber === '14031')!.products['pr1'].quantity).toBe(2);
    expect(applied1.orders.find((o) => o.orderNumber === '14031')!.customer.name).toBe('Rahul Sharma');
    expect(applied1.orders.find((o) => o.orderNumber === '14031')!.customFields).toEqual({ instagram: '@shop' });

    // second import onto the result — everything counts as existing, nothing drifts
    const second = await readFullWorkbook(asFile(blob), { orders: applied1.orders, products: applied1.products, fields, settings });
    expect(second.ok).toBe(true);
    expect(second.existingOrders).toBe(2);
    expect(second.existingProducts).toBe(2);
    expect(second.newOrders).toBe(0);
    expect(second.newProducts).toBe(0);
    expect(second.duplicateProducts).toBe(0);
    const applied2 = applyFullImport(second, { orders: applied1.orders, products: applied1.products, fields, settings });
    expect(applied2.orders).toEqual(applied1.orders);
    expect(applied2.products).toEqual(applied1.products);
  });

  it('re-import after price edit updates the product but never rewrites historical lines', async () => {
    const { settings, fields, orders } = ctxBase();
    const ctx = { settings, fields, products };
    const { blob } = fullWorkbook(orders, ctx);

    // edit Night Cream price to 550 in the exported products sheet (NC001 row)
    const sheets = await parseXlsxSheets(await blob.arrayBuffer());
    const productsSheet = sheets.find((s) => s.name === 'Products')!;
    const priceIdx = productsSheet.rows[0].indexOf('Price');
    const row = productsSheet.rows.find((r) => r[1] === 'Night Cream')!;
    row[priceIdx] = '550';

    const reimport = await readFullWorkbook(fileOfSheets(sheets), { orders: [], products: [], fields, settings });
    const applied = applyFullImport(reimport, { orders: [], products: [], fields, settings });
    expect(applied.products.find((p) => p.sku === 'NC001')!.price).toBe(550);
    // historical order line keeps the old price + snapshot
    const ord = applied.orders.find((o) => o.orderNumber === '14031')!;
    expect(Object.values(ord.products)[0].price).toBe(500);
    expect(Object.values(ord.products)[0].productName).toBe('Night Cream');
  });

  it('same order number twice in one file → one existing update, never two 14031s', async () => {
    const { settings, fields, orders } = ctxBase();
    const ctx = { settings, fields, products };
    const { blob } = fullWorkbook(orders, ctx);
    const sheets = await parseXlsxSheets(await blob.arrayBuffer());
    // duplicate the 14031 row in the Orders sheet + its items row
    const ordersSheet = sheets.find((s) => s.name === 'Orders')!;
    ordersSheet.rows.push([...ordersSheet.rows[1]]);
    const itemsSheet = sheets.find((s) => s.name === 'Order Items')!;
    itemsSheet.rows.push([...itemsSheet.rows[1]]);

    const plan = await readFullWorkbook(fileOfSheets(sheets), { orders: [], products: [], fields, settings });
    expect(plan.ordersFound).toBe(2); // the repeated 14031 row is deduplicated
    expect(plan.newOrders).toBe(2);
    expect(plan.existingOrders).toBe(0);
    const applied = applyFullImport(plan, { orders: [], products: [], fields, settings });
    expect(applied.orders).toHaveLength(2);
    expect(applied.orders.filter((o) => o.orderNumber === '14031')).toHaveLength(1); // never two 14031s
  });

  it('items referencing a product missing from the catalogue keep their snapshot as ghost lines', async () => {
    const { settings, fields } = mkCtx();
    const ghostOrder = mkOrder('14999', 'Ghost Customer', 'gone9', 'Old Night Cream', 1, 450);
    const { blob } = fullWorkbook([ghostOrder], { settings, fields, products });
    const plan = await readFullWorkbook(asFile(blob), { orders: [], products: [], fields, settings });
    const applied = applyFullImport(plan, { orders: [], products: [], fields, settings });
    const ghost = applied.orders.find((o) => o.orderNumber === '14999')!;
    const line = Object.values(ghost.products)[0];
    expect(line.productId).toBe('gone9'); // historical id kept (ghost key guards the map)
    expect(line.productName).toBe('Old Night Cream');
    expect(line.quantity).toBe(1);
    expect(line.price).toBe(450);
    // product master rows from the sheet still apply independently
    expect(applied.products.map((p) => p.name).sort()).toEqual(['Face Serum', 'Night Cream']);
  });

  it('local-only orders (not in the file) are never deleted', async () => {
    const { settings, fields, orders } = ctxBase();
    const ctx = { settings, fields, products };
    const wb = fullWorkbook([orders[0]], ctx);
    const plan = await readFullWorkbook(asFile(wb.blob), { orders, products, fields, settings });
    const applied = applyFullImport(plan, { orders, products, fields, settings });
    expect(applied.orders).toHaveLength(2); // 14032 survives untouched
    const untouched = applied.orders.find((o) => o.orderNumber === '14032')!;
    expect(untouched.customer.name).toBe('Priya Patel');
  });

  it('existing order without item rows in the file keeps its lines', async () => {
    const { settings, fields, orders } = ctxBase();
    // store already has 14031 (1 line) and 14100 (2 lines)
    const existingOrders = [
      orders[0],
      mkOrder('14100', 'Kiran', 'pr1', 'Night Cream', 1, 500, {
        products: {
          pr1: { productId: 'pr1', productName: 'Night Cream', quantity: 1, price: 500 },
          pr2: { productId: 'pr2', productName: 'Face Serum', quantity: 2, price: 699 },
        },
      }),
    ];
    // file: full export of 14031 + an Orders row for 14100 that has NO item rows
    const wb = fullWorkbook([orders[0]], { settings, fields, products });
    const sheets = await parseXlsxSheets(await wb.blob.arrayBuffer());
    const ordersSheet = sheets.find((s) => s.name === 'Orders')!;
    const onumIdx = ordersSheet.rows[0].indexOf('Order Number');
    const row = [...ordersSheet.rows[1]];
    row[onumIdx] = '14100';
    ordersSheet.rows.push(row);
    const plan = await readFullWorkbook(fileOfSheets(sheets), { orders: existingOrders, products, fields, settings });
    expect(plan.ok).toBe(true);
    expect(plan.ordersFound).toBe(2);
    const applied = applyFullImport(plan, { orders: existingOrders, products, fields, settings });
    const ord = applied.orders.find((o) => o.orderNumber === '14100')!;
    // no item rows in the file → the existing order lines are preserved
    expect(Object.values(ord.products)).toHaveLength(2);
    expect(Object.values(ord.products).map((l) => l.productName).sort()).toEqual(['Face Serum', 'Night Cream']);
    const fresh = applied.orders.find((o) => o.orderNumber === '14031')!;
    expect(Object.values(fresh.products)).toHaveLength(1);
  });

  it('workbook without required sheets is refused cleanly', async () => {
    const { settings, fields } = mkCtx();
    const { blob } = fullWorkbook([], { settings, fields, products: [] });
    const sheets = await parseXlsxSheets(await blob.arrayBuffer());
    // drop the Orders sheet entirely
    const withoutOrders = sheets.filter((s) => s.name !== 'Orders');
    const plan = await readFullWorkbook(fileOfSheets(withoutOrders), { orders: [], products: [], fields, settings });
    expect(plan.ok).toBe(false);
    expect(plan.errors.length).toBeGreaterThan(0);
  });
});
