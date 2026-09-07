// ---------------------------------------------------------------------------
// End-to-end (in-memory): create → sheet row → edit (same row) → mark printed
// and the offline/local-first queue.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/constants';
import type { Order, OrderField, Product, Settings } from '../src/types';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { createOrder, updateOrder, markPrinted, getAllOrders, getPendingOps } from '../src/services/orders';

const flds: OrderField[] = [
  { id: 'f-ord', name: 'Order Number', type: 'text', required: true, key: 'orderNumber', order: 0 },
  { id: 'f-name', name: 'Customer Name', type: 'text', required: true, key: 'customerName', order: 1 },
  { id: 'f-wa', name: 'WhatsApp Number', type: 'phone', required: true, key: 'customerWhatsapp', order: 2 },
];
const prods: Product[] = [
  { id: 'p-night', name: 'Night Cream', sku: 'NC001', price: 499, active: true, createdAt: 1 },
  { id: 'p-serum', name: 'Face Serum', sku: 'FS001', price: 699, active: true, createdAt: 1 },
];

const input = (orderNumber: string) => ({
  orderNumber,
  customer: { name: 'Rahul Patel', whatsapp: '9876543210', mobile: '', address: '123 Main Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  products: { 'p-night': { productName: 'Night Cream', quantity: 2, price: 499 } },
  paymentStatus: 'Paid' as const,
  paymentMethod: 'UPI' as const,
  transactionId: 'TXN1',
  paymentAmount: '',
  orderStatus: 'New' as const,
  notes: 'gift wrap',
});

function demoSettings(): Settings {
  const s = defaultSettings();
  s.demoMode = true;
  s.spreadsheet = { provider: 'demo', connected: false, connection: null };
  s.products = { included: prods.map((p) => p.id) };
  s.includedFields = flds.map((f) => f.id);
  return s;
}

describe('demo end-to-end flow', () => {
  beforeEach(async () => {
    DemoDriver.resetDemoGrid();
    await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.lastRow, LS.sheetHeaders]);
  });

  it('creates an order, appends row 2, edits in place at row 2, marks printed', async () => {
    const settings = demoSettings();
    const ctx = { settings, fields: flds, products: prods };

    const res = await createOrder(input('ORD-1001'), ctx);
    expect(res.ok).toBe(true);
    expect(res.order?.spreadsheetRow).toBe(2);

    // row content check
    const driver = new DemoDriver(settings);
    const grid = await driver.getGrid();
    const row2 = grid[1];
    const header = grid[0];
    const at = (h: string) => header.indexOf(h);
    expect(row2[at('Order Number')]).toBe('ORD-1001');
    expect(row2[at('Customer Name')]).toBe('Rahul Patel');
    expect(row2[at('Night Cream Qty')]).toBe('2');
    expect(row2[at('Face Serum Qty')]).toBe('0');

    // edit — must stay on row 2, product lines updated
    const edited = input('ORD-1001');
    edited.products = { 'p-night': { productName: 'Night Cream', quantity: 3, price: 499 } };
    const upd = await updateOrder(res.order!.id, edited, ctx);
    expect(upd.ok).toBe(true);
    const orders = await getAllOrders();
    const one = orders.find((o) => o.id === res.order!.id)!;
    expect(one.spreadsheetRow).toBe(2);
    const grid2 = await driver.getGrid();
    expect(grid2[1][at('Night Cream Qty')]).toBe('3');
    // no new rows were created by the edit
    expect(grid2.length).toBe(2);

    // mark printed (demo: local only)
    await markPrinted(one, ctx);
    const after = (await getAllOrders()).find((o) => o.id === one.id)!;
    expect(after.printed).toBe('Printed');
    expect(after.printedAt).toBeTruthy();
  });

  it('saves locally and queues sync when no spreadsheet is connected', async () => {
    const settings = defaultSettings(); // not demo, not connected
    settings.products = { included: prods.map((p) => p.id) };
    settings.includedFields = flds.map((f) => f.id);
    const res = await createOrder(input('ORD-5001'), { settings, fields: flds, products: prods });
    expect(res.ok).toBe(true);
    expect(res.code).toBe('pending');
    expect(res.order?.pendingSync).toBe(true);
    expect(await getPendingOps()).toHaveLength(1);
    const all = await getAllOrders();
    expect(all.length).toBe(1);
    expect(all[0].orderNumber).toBe('ORD-5001');
  });

  it('blocks duplicate order numbers but allows force', async () => {
    const settings = demoSettings();
    const ctx = { settings, fields: flds, products: prods };
    await createOrder(input('ORD-2001'), ctx);
    const dup = await createOrder(input('ORD-2001'), ctx);
    expect(dup.ok).toBe(false);
    expect(dup.duplicate).toBeDefined();
    expect((await getAllOrders()).length).toBe(1);
    const forced = await createOrder(input('ORD-2001'), ctx, { force: true });
    expect(forced.ok).toBe(true);
    expect((await getAllOrders()).length).toBe(2);
  });

  it('does not rewrite an edited order number as a new row when the row index is known', async () => {
    const settings = demoSettings();
    const ctx = { settings, fields: flds, products: prods };
    const res = await createOrder(input('ORD-3001'), ctx);
    const changed = input('ORD-3001');
    changed.orderNumber = 'ORD-3001'; // same number preserved
    changed.customer = { ...changed.customer, name: 'Priya Shah' };
    const upd = await updateOrder(res.order!.id, changed, ctx);
    expect(upd.order?.customer.name).toBe('Priya Shah');
    expect(upd.order?.spreadsheetRow).toBe(2);
  });
});

describe('counter/numbering', () => {
  it('normalizeCounter returns the start number on an empty store and jumps past used numbers', async () => {
    const settings = demoSettings();
    settings.order.startNumber = 1042;
    const m = await import('../src/services/orders');
    await storage.remove([LS.orders, LS.nextOrderNumber]);
    expect(m.normalizeCounter([], settings)).toBe(1042);
    const used: Order[] = [
      {
        ...((await createOrder(input('ORD-1050'), { settings, fields: flds, products: prods }, { force: true })).order!),
      },
    ];
    expect(m.normalizeCounter(used, settings)).toBe(1051);
    expect(await m.nextCounter()).toBeGreaterThanOrEqual(1051);
  });

  it('makeOrderNumber pads per configuration', async () => {
    const s = demoSettings();
    s.order.prefix = 'ORD-';
    s.order.padding = 6;
    const { makeOrderNumber } = await import('../src/services/orders');
    expect(makeOrderNumber(1001, s)).toBe('ORD-001001');
  });
});
