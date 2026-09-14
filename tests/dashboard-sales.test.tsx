// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// v1.0.5 tests: dashboard date windows + product sales, product ordering /
// label-name separation, dashboard UI (date filter drives cards & product
// sales instantly).
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { startOfDay, defaultSettings, makeId } from '../src/lib/constants';
import { dashWindow, ordersInWindow, ymd } from '../src/lib/dateRange';
import { computeProductSales, salesSummary } from '../src/lib/productSales';
import { excelHeaders } from '../src/services/excelExport';
import { desiredColumns } from '../src/services/spreadsheet/values';
import { createOrder } from '../src/services/orders';
import { DEFAULT_DEMO_PRODUCTS } from '../src/lib/constants';
import type { Order, Product, Settings, OrderField } from '../src/types';

const DAY = 86400_000;

function product(id: string, name: string, price: number): Product {
  return { id, name, sku: '', price, active: true, createdAt: 1 };
}

function order(over: Partial<Order> & { id: string; orderNumber: string }): Order {
  return {
    customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: {},
    paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New',
    notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null, createdAt: 1000, updatedAt: 1000,
    customFields: {}, ...over,
  };
}

// ---------------------------------------------------------------------------
describe('dashboard date windows', () => {
  const NOW = new Date(2026, 8, 8, 14, 0).getTime(); // 2026-09-08 14:00 local
  const todayStart = startOfDay(NOW);

  it('today / tomorrow / yesterday windows are full local days', () => {
    expect(dashWindow('today', '', '', NOW)).toEqual([todayStart, todayStart + DAY]);
    expect(dashWindow('tomorrow', '', '', NOW)).toEqual([todayStart + DAY, todayStart + 2 * DAY]);
    expect(dashWindow('yesterday', '', '', NOW)).toEqual([todayStart - DAY, todayStart]);
  });

  it('7d and 30d include today (rolling windows like the Orders page)', () => {
    expect(dashWindow('7d', '', '', NOW)).toEqual([todayStart - 7 * DAY, todayStart + DAY]);
    expect(dashWindow('30d', '', '', NOW)).toEqual([todayStart - 30 * DAY, todayStart + DAY]);
  });

  it('custom date = that one local day; custom range = inclusive end date', () => {
    expect(dashWindow('date', '2026-09-05', '', NOW)).toEqual([todayStart - 3 * DAY, todayStart - 2 * DAY]);
    const w = dashWindow('range', '2026-09-01', '2026-09-07', NOW)!;
    expect(w).toEqual([todayStart - 7 * DAY, todayStart]); // ends at the start of the 8th
    // from > to → single day of from (never inverted / empty)
    expect(dashWindow('range', '2026-09-07', '2026-09-01', NOW)).toEqual([todayStart - DAY, todayStart]);
    // missing dates → null (UI shows zeros until picked)
    expect(dashWindow('date', '', '', NOW)).toBeNull();
    expect(dashWindow('range', '', '', NOW)).toBeNull();
  });

  it('ordersInWindow filters by real createdAt for every mode', () => {
    const mk = (ts: number) => order({ id: `o${ts}`, orderNumber: `O${ts}`, createdAt: ts });
    const orders = [
      mk(todayStart + 60_000),               // today
      mk(todayStart + DAY + 60_000),         // tomorrow
      mk(todayStart - DAY + 60_000),         // yesterday
      mk(todayStart - 8 * DAY),              // inside last 30d
    ];
    expect(ordersInWindow(orders, 'today', '', '', NOW).map((o) => o.id)).toEqual([`o${todayStart + 60_000}`]);
    expect(ordersInWindow(orders, 'tomorrow', '', '', NOW).length).toBe(1);
    expect(ordersInWindow(orders, 'yesterday', '', '', NOW).length).toBe(1);
    expect(ordersInWindow(orders, '7d', '', '', NOW).length).toBe(2); // yesterday+today; tomorrow starts after the window
    expect(ordersInWindow(orders, '30d', '', '', NOW).length).toBe(3); // yesterday+today+(-8d); tomorrow after the window
    expect(ordersInWindow(orders, 'date', ymd(new Date(todayStart + DAY)), '', NOW).length).toBe(1);
    const range = ordersInWindow(orders, 'range', '2026-09-01', '2026-09-08', NOW);
    expect(range.length).toBe(2); // yesterday + today; tomorrow & -8d fall outside
    expect(range.some((o) => o.createdAt >= todayStart + DAY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('product sales (computed from order data)', () => {
  const products = [product('nc', 'Night Cream', 499), product('fs', 'Face Serum', 699), product('dc', 'Day Cream', 449)];
  const mk = (id: string, lines: [string, number][], total: number, ts: number, status: Order['paymentStatus'] = 'Paid'): Order => {
    const productsRec: Record<string, Order['products'][string]> = {};
    for (const [pid, qty] of lines) {
      const p = products.find((x) => x.id === pid)!;
      productsRec[pid] = { productId: pid, productName: p.name, quantity: qty, price: p.price };
    }
    return order({ id, orderNumber: id, products: productsRec, totalAmount: total, createdAt: ts, paymentStatus: status, paymentMethod: status === 'COD' ? 'COD' : 'UPI' });
  };

  it('aggregates qty sold, distinct order count and sales amount per product', () => {
    const rows = computeProductSales(
      [mk('ORD-1001', [['nc', 2]], 998, 1), mk('ORD-1002', [['nc', 3], ['fs', 1]], 2196, 2)],
      products,
    );
    expect(rows).toHaveLength(2);
    const nc = rows.find((r) => r.productId === 'nc')!;
    expect(nc.qty).toBe(5);
    expect(nc.orderCount).toBe(2);
    expect(nc.sales).toBe(5 * 499);
    const fs = rows.find((r) => r.productId === 'fs')!;
    expect(fs.qty).toBe(1);
    expect(fs.orderCount).toBe(1);
    expect(fs.sales).toBe(699);
  });

  it('keeps catalogue order of rows (dashboard product order)', () => {
    const rows = computeProductSales([mk('ORD-1', [['dc', 1], ['nc', 1]], 948, 1)], products);
    expect(rows.map((r) => r.productId)).toEqual(['nc', 'dc']); // catalog order, not input order
  });

  it('date-filtered window excludes orders outside (no separate sales db)', () => {
    const d1 = new Date(2026, 8, 1, 12).getTime(); // 01 Sep 2026
    const d2 = new Date(2026, 8, 2, 12).getTime(); // 02 Sep 2026
    const orders = [mk('ORD-1001', [['nc', 2]], 998, d1), mk('ORD-1002', [['nc', 3], ['fs', 1]], 2196, d2)];
    const only1001 = ordersInWindow(orders, 'date', '2026-09-01', '', d2);
    expect(only1001.map((o) => o.id)).toEqual(['ORD-1001']);
    const rows = computeProductSales(only1001, products);
    expect(rows.find((r) => r.productId === 'nc')!.qty).toBe(2);
    expect(rows.find((r) => r.productId === 'fs')).toBeUndefined();
    // and with the other order included, the counts grow from order data
    const both = computeProductSales(orders, products);
    expect(both.find((r) => r.productId === 'nc')!.qty).toBe(5);
  });

  it('salesSummary counts + revenue match the filter window', () => {
    const orders = [
      mk('ORD-1001', [['nc', 2]], 998, 1, 'Paid'),
      mk('ORD-1002', [['nc', 3], ['fs', 1]], 2196, 2, 'COD'),
      mk('ORD-1003', [], 500, 3, 'Pending'),
    ];
    expect(salesSummary([orders[0]])).toEqual({ count: 1, revenue: 998, paid: 1, cod: 0, pending: 0 });
    expect(salesSummary([orders[1]])).toEqual({ count: 1, revenue: 2196, paid: 0, cod: 1, pending: 0 });
    expect(salesSummary(orders)).toEqual({ count: 3, revenue: 3694, paid: 1, cod: 1, pending: 1 });
  });

  it('deleted products still appear from historical order lines (flagged)', () => {
    const o = order({
      id: 'OLD-1', orderNumber: 'OLD-1', createdAt: 1,
      products: { gone: { productId: 'gone', productName: 'Old Product', quantity: 4, price: 100 } },
      totalAmount: 400,
    });
    const rows = computeProductSales([o], [products[0]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].inCatalog).toBe(false);
    expect(rows[0].name).toBe('Old Product');
  });
});

// ---------------------------------------------------------------------------
describe('product order is used everywhere (Excel + sheet columns)', () => {
  function ctxWith(products: Product[]) {
    const settings = defaultSettings();
    settings.includedFields = ['f-name'];
    settings.products = { included: products.map((p) => p.id) };
    const fields: OrderField[] = [{ id: 'f-name', name: 'Customer Name', type: 'text', required: false, key: 'customerName', order: 0 }];
    return { settings, fields, products };
  }
  const nc = product('nc', 'Night Cream', 499);
  const fs = product('fs', 'Face Serum', 699);
  const dc = product('dc', 'Day Cream', 449);

  it('excel qty columns follow the catalogue (reordered) array', () => {
    const original = ctxWith([nc, fs, dc]);
    const headers1 = excelHeaders(original);
    const i1 = headers1.findIndex((h) => h === 'Night Cream Qty');
    const i2 = headers1.findIndex((h) => h === 'Face Serum Qty');
    expect(i1).toBeLessThan(i2);
    // user drags Face Serum above Night Cream
    const reordered = ctxWith([fs, nc, dc]);
    const h2 = excelHeaders(reordered);
    expect(h2.findIndex((h) => h === 'Face Serum Qty')).toBeLessThan(h2.findIndex((h) => h === 'Night Cream Qty'));
    expect(h2.indexOf('Day Cream Qty')).toBe(h2.indexOf('Night Cream Qty') + 1);
  });

  it('desired spreadsheet columns follow the same order', () => {
    const c1 = ctxWith([nc, fs, dc]);
    const w1 = desiredColumns(c1.fields, c1.products, c1.settings);
    expect(w1.indexOf('Night Cream Qty')).toBeLessThan(w1.indexOf('Face Serum Qty'));
    const c2 = ctxWith([fs, nc, dc]);
    const w2 = desiredColumns(c2.fields, c2.products, c2.settings);
    expect(w2.indexOf('Face Serum Qty')).toBeLessThan(w2.indexOf('Night Cream Qty'));
  });
});

// ---------------------------------------------------------------------------
describe('label name vs product name + historical order safety', () => {
  const fields: OrderField[] = [];
  const settings = defaultSettings();

  async function seed() {
    await storage.area.clear();
    const products: Product[] = [{ id: 'p1', name: 'Night Cream', sku: 'NC1', price: 499, labelName: 'Night Cream 50g', active: true, createdAt: 1 }];
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products, [LS.nextOrderNumber]: 1001 });
    return products;
  }

  it('existing orders keep their snapshot; new orders use the updated label name', async () => {
    const products = await seed();
    const input = (orderNumber: string) => ({
      orderNumber,
      customer: { name: 'Rahul', whatsapp: '9876543210', mobile: '', address: 'A', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
      products: { p1: { quantity: 2, price: 499 } },
      paymentStatus: 'Paid' as const, paymentMethod: 'UPI' as const, transactionId: '', paymentAmount: '',
      orderStatus: 'New' as const, notes: '',
    });
    const ctx = { settings, fields, products };
    const first = await createOrder(input('ORD-1001'), ctx, { skipSheet: true });
    expect(first.ok).toBe(true);
    expect(first.order!.products.p1.labelName).toBe('Night Cream 50g');

    // later the user edits the catalogue label name
    const edited: Product[] = [{ ...products[0], labelName: 'Advanced Night Cream' }];
    await storage.set(LS.products, edited);

    const second = await createOrder(input('ORD-1002'), { settings, fields, products: edited }, { skipSheet: true });
    expect(second.ok).toBe(true);
    // historical order untouched
    const all = (await storage.getState<Order[]>(LS.orders))!;
    const oldOne = all.find((o) => o.orderNumber === 'ORD-1001')!;
    expect(oldOne.products.p1.labelName).toBe('Night Cream 50g');
    expect(oldOne.products.p1.quantity).toBe(2);
    expect(oldOne.totalAmount).toBe(998);
    // new order picks up the updated label name
    expect(all.find((o) => o.orderNumber === 'ORD-1002')!.products.p1.labelName).toBe('Advanced Night Cream');
  });
});

// ---------------------------------------------------------------------------
// UI: dashboard date filter drives cards + product sales immediately
// ---------------------------------------------------------------------------
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await storage.area.clear();
  await storage.remove([LS.settings, LS.fields, LS.orders, LS.products, LS.nextOrderNumber, LS.setupDone]);
});

describe('Dashboard UI date filter', () => {
  it('defaults to Today; switching to Yesterday / Last 7 days recalculates instantly', async () => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const yStart = todayStart - DAY;
    const p = (id: string, name: string, price: number): Product => ({ id, name, sku: '', price, active: true, createdAt: 1 });
    const nc = p('nc', 'Night Cream', 499);
    const fs = p('fs', 'Face Serum', 699);
    const products = [nc, fs];
    const line = (pid: string, qty: number) => ({ productId: pid, productName: products.find((x) => x.id === pid)!.name, quantity: qty, price: products.find((x) => x.id === pid)!.price });
    const mk = (id: string, orderNumber: string, lines: [string, number][], status: Order['paymentStatus'], ts: number): Order => {
      const rec: Record<string, Order['products'][string]> = {};
      const total = lines.reduce((s, [pid, qty]) => s + qty * products.find((x) => x.id === pid)!.price, 0);
      for (const [pid, qty] of lines) rec[pid] = line(pid, qty);
      return order({ id, orderNumber, products: rec, paymentStatus: status, paymentMethod: status === 'COD' ? 'COD' : 'UPI', createdAt: ts, updatedAt: ts, totalAmount: total });
    };
    const orders = [
      mk('o1', 'ORD-1001', [['nc', 2]], 'Paid', todayStart + 3600_000),   // today
      mk('o2', 'ORD-1002', [['nc', 3], ['fs', 1]], 'COD', yStart + 3600_000), // yesterday
    ];
    const { settings } = await import('../src/services/config').then((m) => m.makeDefaultSettingsWithTemplate());
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    settings.products = { included: ['nc', 'fs'] };
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: [], [LS.products]: products, [LS.orders]: orders, [LS.nextOrderNumber]: 1003, [LS.setupDone]: true });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const { App } = await import('../src/app/App');
    await act(async () => { root.render(<App />); });
    await act(async () => { await tick(400); });
    try {
      const text = () => el.textContent ?? '';
      const statValue = (label: string) => {
        const cards = Array.from(el.querySelectorAll('.stat-card')) as HTMLElement[];
        const card = cards.find((c) => (c.querySelector('.label')?.textContent ?? '') === label);
        return card?.querySelector('.value')?.textContent ?? '';
      };
      const salesText = () => {
        const tables = Array.from(el.querySelectorAll('table')) as HTMLTableElement[];
        const t = tables.find((tb) => (tb.querySelector('thead')?.textContent ?? '').includes('Qty Sold'));
        return t?.textContent ?? '';
      };
      // default dashboard → Today
      expect(text()).toContain('Product Sales');
      expect(statValue('Total Orders')).toBe('1');
      expect(statValue('Total Sales')).toBe('₹998');
      expect(statValue('Paid Orders')).toBe('1');
      expect(statValue('COD Orders')).toBe('0');
      // product sales: only today's Night Cream ×2
      expect(salesText()).toContain('Night Cream');
      expect(salesText()).toContain('₹998');
      expect(salesText()).not.toContain('Face Serum');

      // switch to Yesterday
      const sel = Array.from(el.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === 'yesterday')) as HTMLSelectElement | undefined;
      expect(sel, 'dashboard range select').toBeTruthy();
      await act(async () => {
        const proto = Object.getPrototypeOf(sel!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(sel, 'yesterday');
        sel!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(200); });
      expect(statValue('Total Orders')).toBe('1');
      expect(statValue('Total Sales')).toBe('₹2,196');
      expect(statValue('Paid Orders')).toBe('0');
      expect(statValue('COD Orders')).toBe('1');
      expect(salesText()).toContain('Night Cream');
      expect(salesText()).toContain('Face Serum');
      expect(salesText()).toContain('₹1,497');
      expect(salesText()).not.toContain('₹998'); // today's sales not in the table

      // switch to Last 7 days → both orders; Night Cream qty 5 across 2 orders
      await act(async () => {
        const proto = Object.getPrototypeOf(sel!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(sel, '7d');
        sel!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(200); });
      expect(statValue('Total Orders')).toBe('2');
      expect(statValue('Total Sales')).toBe('₹3,194');
      expect(salesText()).toContain('₹2,495'); // Night Cream 5 × ₹499
      expect(salesText()).toContain('₹699');   // Face Serum 1 × ₹699
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
