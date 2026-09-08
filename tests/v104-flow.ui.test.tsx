// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// v1.0.4 end-to-end UI flows:
//  A) Orders filters (Date + Method + Status) → Download Filtered Orders
//     exports exactly the visible rows.
//  B) New order: delivery-rule preview, Grand Total, duplicate matching
//     dialog (Transaction ID), Continue Anyway, charge + txn persisted and
//     written into the (demo) spreadsheet row.
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { DEFAULT_DEMO_PRODUCTS } from '../src/lib/constants';
import { excelFilename } from '../src/services/excelExport';
import type { Order } from '../src/types';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow, LS.settings, LS.fields, LS.products, LS.setupDone]);
});

async function mountApp() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const { App } = await import('../src/app/App');
  await act(async () => { root.render(<App />); });
  await act(async () => { await tick(350); });
  const { navigate } = await import('../src/app/router');
  return { el, root, navigate };
}

function mkOrder(id: string, number: string, over: Partial<Order> = {}): Order {
  return {
    id, orderNumber: number,
    customer: { name: 'Rahul Patel', whatsapp: '9876543210', mobile: '', address: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: { 'p1': { productId: 'p1', productName: 'Night Cream', quantity: 1, price: 499 } },
    paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New',
    notes: '', totalAmount: 499, printed: 'Not Printed', printedAt: null, createdAt: 1, updatedAt: 1, customFields: {},
    ...over,
  };
}

describe('v1.0.4: filters → filtered excel (Orders page)', () => {
  it('Date=Yesterday + Method=COD + Status=Delivered shows 1 order; Download Filtered exports it', async () => {
    const downloaded: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { downloaded.push(this.download); };
    const origCO = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:mock' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });

    const now = Date.now();
    const day = 86400_000;
    const orders = [
      mkOrder('o1', 'ORD-1001', { createdAt: now - 1 * 3600_000 }), // today, Paid UPI
      mkOrder('o2', 'ORD-1002', { createdAt: now - day - 5 * 3600_000, paymentStatus: 'COD', paymentMethod: 'COD', orderStatus: 'Delivered', customer: { ...mkOrder('o2', 'ORD-1002').customer, name: 'Priya Shah' } }), // yesterday COD Delivered
      mkOrder('o3', 'ORD-1003', { createdAt: now - 3 * day }), // 3 days ago
    ];
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: DEFAULT_DEMO_PRODUCTS, [LS.orders]: orders, [LS.nextOrderNumber]: 1004, [LS.setupDone]: true });

    const { el, root, navigate } = await mountApp();
    try {
      await act(async () => { navigate('orders'); });
      await act(async () => { await tick(300); });
      const text = () => el.textContent ?? '';
      expect(text()).toContain('Download Filtered Orders');

      const pick = async (value: string) => {
        const sel = Array.from(el.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === value)) as HTMLSelectElement | undefined;
        expect(sel, `select ${value}`).toBeTruthy();
        await act(async () => {
          const proto = Object.getPrototypeOf(sel!);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(sel, value);
          sel!.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await act(async () => { await tick(150); });
      };
      await pick('yesterday');
      await pick('COD');
      await pick('Delivered');
      expect(text()).toContain('1 order'); // summary count after filtering
      expect(text()).toContain('Priya Shah');

      const btn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Download Filtered Orders') && !(b as HTMLButtonElement).disabled);
      expect(btn, 'filtered button enabled').toBeTruthy();
      await act(async () => { btn!.click(); });
      await act(async () => { await tick(250); });
      expect(downloaded[0]).toBe(excelFilename('filtered', new Date()));

      // sanity: unfiltered All still exports everything
      const allBtn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Download All Orders'));
      await act(async () => { allBtn!.click(); });
      await act(async () => { await tick(250); });
      expect(downloaded[1]).toBe('all-orders.xlsx');
    } finally {
      root.unmount();
      el.remove();
      HTMLAnchorElement.prototype.click = origClick;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: origCO });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: origRevoke });
    }
  });
});

describe('v1.0.4: delivery rules + duplicate matching on New Order', () => {
  it('previews Grand Total, warns on matching Transaction ID, saves charge + txn everywhere', async () => {
    DemoDriver.resetDemoGrid();
    await storage.area.clear();
    await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow, LS.settings, LS.fields, LS.products, LS.setupDone]);

    const { settings, fields } = makeDefaultSettingsWithTemplate();
    const txn = fields.find((f) => f.key === 'transactionId')!;
    const state = fields.find((f) => f.key === 'customerState')!;
    expect(txn).toBeTruthy();
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    // delivery: State = Gujarat AND Amount < 600 → ₹100
    settings.delivery = {
      defaultCharge: 0,
      rules: [{
        id: 'dr1', charge: 100,
        conditions: [
          { id: 'c1', field: state.id, op: 'equals', value: 'Gujarat' },
          { id: 'c2', field: '__amount', op: 'lessThan', value: '600' },
        ],
      }],
    };
    // matching: Transaction ID exact
    settings.matching = { rules: [{ id: 'mr1', fieldId: txn.id, mode: 'exact', enabled: true }] };

    const existing = mkOrder('ord-1001', 'ORD-1001', { createdAt: Date.now() - 3600_000, transactionId: 'TXN12345' });
    await storage.setMany({
      [LS.settings]: settings, [LS.fields]: fields, [LS.products]: DEFAULT_DEMO_PRODUCTS,
      [LS.orders]: [existing], [LS.nextOrderNumber]: 1002, [LS.setupDone]: true,
    });

    const { el, root, navigate } = await mountApp();
    try {
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(400); });
      const text = () => el.textContent ?? '';

      const setInput = async (placeholder: string, value: string) => {
        const candidates = [...Array.from(el.querySelectorAll('input')), ...Array.from(el.querySelectorAll('textarea'))] as Array<HTMLInputElement | HTMLTextAreaElement>;
        const input = candidates.find((i) => i.getAttribute('placeholder') === placeholder);
        expect(input, `input ${placeholder}`).toBeTruthy();
        await act(async () => {
          const proto = Object.getPrototypeOf(input!);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(input, value);
          input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await tick(60); });
      };
      const setById = async (id: string, value: string) => {
        const input = el.querySelector(`#${id}`) as HTMLInputElement | null;
        expect(input, `#${id}`).toBeTruthy();
        await act(async () => {
          const proto = Object.getPrototypeOf(input!);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(input, value);
          input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => { await tick(60); });
      };
      const pickById = async (id: string, value: string) => {
        const sel = el.querySelector(`#${id}`) as HTMLSelectElement | null;
        expect(sel, `select #${id}`).toBeTruthy();
        await act(async () => {
          const proto = Object.getPrototypeOf(sel!);
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(sel, value);
          sel!.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await act(async () => { await tick(80); });
      };

      await setInput('Customer name', 'Dup Test Customer');
      await setInput('9876543210', '9000012345');
      await setInput('House no., street, landmark…', '221B Baker Street');
      // state dropdown → Gujarat (needed by the delivery rule)
      await pickById(`f-${state.id}`, 'Gujarat');
      // txn id typed = same as ORD-1001's
      await setById(`f-${txn.id}`, 'TXN12345');
      // add a product: Night Cream ₹499 (subtotal < 600 → rule fires)
      await act(async () => {
        const pill = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Night Cream'));
        expect(pill).toBeTruthy();
        pill!.click();
      });
      await act(async () => { await tick(150); });

      // delivery preview: Subtotal 499 + Delivery 100 = Grand Total 599
      expect(text()).toContain('Subtotal:');
      expect(text()).toContain('₹499');
      expect(text()).toContain('Delivery:');
      expect(text()).toContain('₹100');
      expect(text()).toContain('Grand Total:');
      expect(text()).toContain('₹599');

      // Save → matching dialog appears (TXN12345 exists in ORD-1001)
      await act(async () => {
        const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
        expect(save).toBeTruthy();
        save!.click();
      });
      await act(async () => { await tick(500); });
      expect(text()).toContain('Matching Transaction ID Found');
      expect(text()).toContain('TXN12345');
      expect(text()).toContain('ORD-1001');

      // Continue Anyway → order is saved with charge + txn
      await act(async () => {
        const btn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Continue Anyway'));
        expect(btn).toBeTruthy();
        btn!.click();
      });
      await act(async () => { await tick(1200); });

      const stored = await storage.loadAll();
      const newest = [...stored.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      expect(newest).toBeTruthy();
      expect(newest.orderNumber).toBe('ORD-1002');
      expect(newest.transactionId).toBe('TXN12345');
      expect(newest.deliveryCharge).toBe(100);
      expect(newest.totalAmount).toBe(599);
      // counter advanced past it
      expect(stored.nextOrderNumber).toBeGreaterThanOrEqual(1003);

      // the (demo) spreadsheet row contains Delivery Charge + Grand Total
      const driver = new DemoDriver();
      const grid = await driver.getGrid();
      const header = grid[0];
      const last = grid[grid.length - 1];
      expect(header).toContain('Delivery Charge');
      const chargeIdx = header.indexOf('Delivery Charge');
      const totalIdx = header.indexOf('Total');
      expect(last[chargeIdx]).toBe('100');
      expect(last[totalIdx]).toBe('599');
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
