// @vitest-environment happy-dom
// Crash-hunt: render every page with realistic data to reproduce the shipped
// app error in DEV React (readable messages). Scans DOM for the error overlay.
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { defaultSettings } from '../src/lib/constants';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import type { Order, OrderField, Product, Settings } from '../src/types';

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow, LS.settings, LS.fields, LS.setupDone]);
});

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function installFixture() {
  const { settings, fields } = makeDefaultSettingsWithTemplate();
  settings.demoMode = true;
  settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
  const products: Product[] = [
    { id: 'p1', name: 'Night Cream', sku: 'NC-01', price: 499, active: true, createdAt: 1 },
    { id: 'p2', name: 'Face Serum', sku: 'FS-01', price: 699, active: true, createdAt: 1 },
    { id: 'p3', name: 'Sunscreen', sku: 'SS-01', price: 350, active: true, createdAt: 1 },
  ];
  const mk = (id: string, name: string): Order => ({
    id, orderNumber: id, customer: { name, whatsapp: '9876543210', mobile: '', address: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    products: { 'p1': { productId: 'p1', productName: 'Night Cream', quantity: 2, price: 499 }, 'p2': { productId: 'p2', productName: 'Face Serum', quantity: 1, price: 699 } },
    paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: 'TXN-1', paymentAmount: '1697', orderStatus: 'New',
    notes: 'Handle with care', totalAmount: 1697, createdAt: 1000, updatedAt: 1000, printed: 'Not Printed' as const, printedAt: null,
  });
  const orders: Order[] = [mk('ORD-1001', 'Rahul Patel'), mk('ORD-1002', 'Priya Shah'), mk('ORD-1003', 'Amit Desai')];
  orders[1].paymentStatus = 'Pending';
  orders[1].paymentMethod = 'COD';
  orders[1].printed = 'Printed';
  orders[1].printedAt = 2000;
  await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products, [LS.orders]: orders, [LS.setupDone]: true, [LS.nextOrderNumber]: 1004 });
}

/** Render a JSX tree; returns the mounted container. */
async function mount(el: HTMLElement, node: React.ReactNode, root: Root): Promise<void> {
  await act(async () => { root.render(node); });
  await act(async () => { await tick(220); }); // effects + async init/suspense settle
  await act(async () => { await tick(120); });
}

function findErrorText(el: HTMLElement): string {
  const ol = el.querySelector('[data-reactroot], #root > *');
  void ol;
  const possible = Array.from(el.querySelectorAll('*')).map((n) => (n.textContent ?? '')).filter((t) =>
    t.includes('Minified React error') || t.includes('The above error occurred') || t.includes('Uncaught') || t.includes('TypeError') || t.includes('is not a function') || t.includes('Cannot read'),
  );
  return possible.slice(0, 1)[0] ?? '';
}

describe('crash hunt', () => {
  it('walks every page without an error overlay', async () => {
    (window as unknown as { print: () => void }).print = () => {};
    (window as unknown as { close: () => void }).close = () => {};
    (window as unknown as { onbeforeprint: unknown }).onbeforeprint = null;
    await installFixture();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      const mod = await import('../src/app/App');
      // 1) Full app boot
      await mount(el, <mod.App />, root);
      expect(findErrorText(el)).toBe('');
      expect(el.textContent ?? '').toContain('Dashboard');

      // 2) Programmatic route switch to each page (skip Google-only flows)
      const { navigate } = await import('../src/app/router');
      const visits: Array<[string, string]> = [
        ['dashboard', 'Dashboard'],
        ['orders', 'Orders'],
        ['new', 'Customer Information'],
        ['edit/ORD-1001', 'Edit'],
        ['products', 'Products'],
        ['fields', 'Columns'],
        ['settings', 'Settings'],
      ];
      for (const [route, needle] of visits) {
        await act(async () => { navigate(route); });
        await act(async () => { await tick(260); });
        const txt = el.textContent ?? '';
        const err = findErrorText(el);
        if (err) throw new Error(`route ${route} error: ${err}`);
        expect(err).toBe('');
      }

      // 3) Demo mode + no-internet resilience: try clicking Save Order (valid form) — checks createOrder network paths
      await act(async () => { navigate('new'); });
      await act(async () => { await tick(150); });
      const inputs = Array.from(el.querySelectorAll('input')) as HTMLInputElement[];
      const name = inputs.find((i) => i.placeholder === 'Customer name');
      expect(name).toBeTruthy();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(name!), 'value')?.set;
        setter?.call(name, 'Crash Test');
        name!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const saveBtn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
      await act(async () => { saveBtn!.click(); });
      await act(async () => { await tick(1500); });
      const err2 = findErrorText(el);
      if (err2) throw new Error(`save-order error: ${err2}`);

      // 4) Print page directly (chrome.* shims not needed for render)
      const { PrintPage } = await import('../src/print/PrintPage');
      await act(async () => { root.unmount(); });
      const el2 = document.createElement('div');
      document.body.appendChild(el2);
      const root2 = createRoot(el2);
      await mount(el2, <PrintPage />, root2);
      await act(async () => { await tick(1300); });
      const ptxt = el2.textContent ?? '';
      const perr = findErrorText(el2);
      if (perr) throw new Error(`print-page error: ${perr}`);
      expect(ptxt).toContain('label');
      await act(async () => { root2.unmount(); });
      el2.remove();
      el.remove();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // record so the summary assertion reports it
      expect(msg).toBe('');
    }
  }, 60000);
});
