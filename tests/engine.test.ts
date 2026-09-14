// ---------------------------------------------------------------------------
// Core rule tests: fields = columns, orders = rows, existing columns reused,
// no duplicate columns/rows unless forced.
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeEach } from 'vitest';
import type { Order, OrderField, Product, Settings } from '../src/types';
import { defaultSettings, makeId } from '../src/lib/constants';
import { SpreadsheetEngine } from '../src/services/spreadsheet/engine';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { buildRowForHeaders, desiredColumns } from '../src/services/spreadsheet/values';
import { LS } from '../src/services/storage';

function fields(...names: [string, string][]): OrderField[] {
  return names.map(([name, key], i) => ({
    id: makeId(),
    name,
    type: 'text',
    required: true,
    key,
    order: i,
  }));
}

function productsOf(...names: string[]): Product[] {
  return names.map((n, i) => ({
    id: `p-${n.toLowerCase().replace(/\s/g, '-')}`,
    name: n,
    sku: `SKU${i}`,
    price: 100 + i,
    active: true,
    createdAt: Date.now(),
  }));
}

function demoCtx(settings: Settings, flds: OrderField[], prods: Product[], seedHeaders?: string[]) {
  const driver = new DemoDriver(settings, seedHeaders);
  const engine = new SpreadsheetEngine();
  const ctx = { driver, spreadsheetId: 'demo', worksheetName: 'Orders' };
  return { engine, ctx, settings, fields: flds, products: prods };
}

function order(num: string, products: Record<string, number>, over: Partial<Order> = {}): Order {
  const customer = { name: 'Rahul Patel', whatsapp: '9876543210', mobile: '9876543210', address: '123 Main Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' };
  const prodEntries = Object.entries(products).map(([pid, qty]) => [pid, { productId: pid, productName: pid, quantity: qty, price: 100 }]);
  return {
    id: makeId(),
    orderNumber: num,
    customer,
    products: Object.fromEntries(prodEntries) as Order['products'],
    paymentStatus: 'Paid',
    paymentMethod: 'UPI',
    transactionId: '',
    paymentAmount: '',
    orderStatus: 'New',
    notes: '',
    totalAmount: 200,
    printed: 'Not Printed',
    printedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  };
}

describe('spreadsheet columns ↔ orders rows', () => {
  let base: Settings;
  let flds: OrderField[];
  let prods: Product[];

  beforeEach(() => {
    DemoDriver.resetDemoGrid();
    base = { ...defaultSettings(), demoMode: true, spreadsheet: { provider: 'demo', connected: false, connection: null } };
    base.products = { included: [] };
    flds = fields(
      ['Order Number', 'orderNumber'],
      ['Customer Name', 'customerName'],
      ['WhatsApp Number', 'customerWhatsapp'],
      ['Address', 'customerAddress'],
    );
    prods = productsOf('Night Cream', 'Face Serum');
    base.products.included = prods.map((p) => p.id);
    base.includedFields = flds.map((f) => f.id);
  });

  it('appends every order as exactly one new row (never a new column)', async () => {
    const { engine, ctx } = demoCtx(base, flds, prods);
    const h1 = await engine.ensureSchema(ctx, flds, prods, base);
    const before = h1.headers.length;
    const row1 = await engine.appendOrder(ctx, order('ORD-1001', { 'p-night-cream': 2 }), flds, prods, base);
    const row2 = await engine.appendOrder(ctx, order('ORD-1002', { 'p-face-serum': 1 }), flds, prods, base);
    const h2 = await engine.ensureSchema(ctx, flds, prods, base);
    expect(row1).toBe(2);
    expect(row2).toBe(3);
    expect(h2.headers.length).toBe(before); // no new columns for new orders
  });

  it('creates missing product-qty columns once, then reuses them', async () => {
    const { engine, ctx } = demoCtx(base, flds, prods);
    const r1 = await engine.ensureSchema(ctx, flds, prods, base);
    const names1 = r1.headers.map((x) => x.name);
    expect(names1).toContain('Night Cream Qty');
    expect(names1).toContain('Face Serum Qty');
    expect(names1).toContain('Label Status');
    const r2 = await engine.ensureSchema(ctx, flds, prods, base);
    expect(r2.headers.length).toBe(r1.headers.length);
  });

  it('writes 0 qty for products not in the order and numeric amounts without ₹', async () => {
    const { engine, ctx } = demoCtx(base, flds, prods);
    const row = order('ORD-2001', { 'p-night-cream': 2 });
    // build aligned row
    const hdrs = await engine.ensureSchema(ctx, flds, prods, base);
    const values = buildRowForHeaders(hdrs.headers.map((h) => h.name), row, { fields: flds, products: prods, settings: base });
    const idx = (name: string) => hdrs.headers.findIndex((h) => h.name === name);
    expect(values[idx('Night Cream Qty')]).toBe('2');
    expect(values[idx('Face Serum Qty')]).toBe('0');
    expect(values[idx('Total')]).toBe('200');
  });

  it('creates only the missing columns when the sheet has unrelated headers', async () => {
    const { engine, ctx } = demoCtx(base, flds, prods, ['Customer Name', 'Some Other Column']);
    const headers = await engine.ensureSchema(ctx, flds, prods, base);
    const names = headers.headers.map((h) => h.name);
    expect(names).toContain('Order Number');
    expect(names).toContain('WhatsApp Number');
    expect(names).toContain('Night Cream Qty');
    expect(names).toContain('Some Other Column'); // untouched
    const again = await engine.ensureSchema(ctx, flds, prods, base);
    expect(again.headers.length).toBe(headers.headers.length);
  });

  it('maps existing legacy headers to reused columns', async () => {
    base.products.included = [];
    const legacy = new DemoDriver({ ...base }, ['Order Number', 'Customer Name', 'Night Cream Qty']);
    const { engine } = demoCtx(base, flds, prods);
    const headers = await engine.ensureSchema({ driver: legacy, spreadsheetId: 'x', worksheetName: 'Orders' }, flds, prods, base);
    expect(headers.headers.map((h) => h.name)).toContain('Night Cream Qty');
    // no duplicate "Night Cream Qty 2"
    const dup = headers.headers.filter((h) => h.name.startsWith('Night Cream Qty'));
    expect(dup.length).toBe(1);
  });

  it('product qty column width stays in the desiredColumns set', () => {
    base.products.included = prods.map((p) => p.id);
    const want = desiredColumns(flds, prods, base);
    expect(want).toContain('Night Cream Qty');
    expect(new Set(want).size).toBe(want.length);
  });
});

describe('duplicate order protection', () => {
  it('blocks a second order with the same number', async () => {
    const { createOrder } = await import('../src/services/orders');
    const settings = { ...defaultSettings(), demoMode: true, spreadsheet: { provider: 'demo' as const, connected: false, connection: null } };
    settings.products = { included: [] };
    const flds = fields(['Order Number', 'orderNumber'], ['Customer Name', 'customerName']);
    const prods = productsOf('Night Cream');
    const input = {
      orderNumber: 'ORD-1001',
      customer: { name: 'A', whatsapp: '9876543210', mobile: '', address: 'x', city: '', state: '', pincode: '' },
      products: { 'p-night-cream': { quantity: 1, price: 100, productName: 'Night Cream' } },
      paymentStatus: 'Paid' as const,
      paymentMethod: 'UPI' as const,
      transactionId: '',
      paymentAmount: '',
      orderStatus: 'New' as const,
      notes: '',
    };
    const first = await createOrder(input, { settings, fields: flds, products: prods });
    expect(first.ok).toBe(true);
    const dup = await createOrder(input, { settings, fields: flds, products: prods });
    expect(dup.ok).toBe(false);
    expect(dup.duplicate?.existing.orderNumber).toBe('ORD-1001');
    const forced = await createOrder(input, { settings, fields: flds, products: prods }, { force: true });
    expect(forced.ok).toBe(true);
    await import('../src/services/storage').then(({ storage }) => storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps]));
  });
});
