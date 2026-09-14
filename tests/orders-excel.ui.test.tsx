// @vitest-environment happy-dom
// Orders page Excel buttons: Download Today's Orders + Download All Orders
// produce real .xlsx downloads with the correct filenames.
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { excelFilename } from '../src/services/excelExport';
import type { Order, Product } from '../src/types';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow]);
});

describe('Orders page Excel downloads', () => {
  it('downloads all-orders.xlsx and orders-<date>.xlsx from the page buttons', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    const products: Product[] = [
      { id: 'p1', name: 'Night Cream', sku: '', price: 499, active: true, createdAt: 1 },
      { id: 'p2', name: 'Face Serum', sku: '', price: 699, active: true, createdAt: 1 },
    ];
    const mk = (id: string, name: string, createdAt: number): Order => ({
      id, orderNumber: id, customer: { name, whatsapp: '9876543210', mobile: '', address: 'MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
      products: { p1: { productId: 'p1', productName: 'Night Cream', quantity: 2, price: 499 } },
      paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New',
      notes: '', totalAmount: 998, printed: 'Not Printed', printedAt: null, createdAt, updatedAt: createdAt,
      customFields: {},
    });
    const now = Date.now();
    const orders = [
      mk('ORD-1001', 'Rahul', now - 60 * 60_000), // today
      mk('ORD-1002', 'Priya', now - 26 * 3600_000), // yesterday
      mk('ORD-1003', 'Amit', now - 3 * 86400_000), // 3 days ago
    ];
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products, [LS.orders]: orders, [LS.setupDone]: true, [LS.nextOrderNumber]: 1004 });

    // download spies
    const downloaded: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { downloaded.push(this.download); };
    const origCO = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:mock' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      const { App } = await import('../src/app/App');
      await act(async () => { root.render(<App />); });
      await act(async () => { await tick(400); });
      const { navigate } = await import('../src/app/router');
      await act(async () => { navigate('orders'); });
      await act(async () => { await tick(400); });
      expect(el.textContent ?? '').toContain('Download All Orders');
      expect(el.textContent ?? '').toContain('Download Today');

      const clickBtn = async (label: string) => {
        const btns = Array.from(el.querySelectorAll('button')) as HTMLElement[];
        const btn = btns.find((b) => (b.textContent ?? '').includes(label) && !(b as HTMLButtonElement).disabled);
        expect(btn, label).toBeTruthy();
        await act(async () => { btn!.click(); });
        await act(async () => { await tick(200); });
      };

      await clickBtn('Download Today');
      await clickBtn('Download All Orders');

      expect(downloaded[0]).toBe(excelFilename('today', new Date()));
      expect(downloaded[1]).toBe('all-orders.xlsx');
      // order rows: 1 today / 3 total — verify via the pure builder
      const { prepareOrdersExport } = await import('../src/services/excelExport');
      const ctx = { settings, fields, products };
      expect(prepareOrdersExport('today', orders, ctx).count).toBe(1);
      expect(prepareOrdersExport('all', orders, ctx).count).toBe(3);
    } finally {
      root.unmount();
      el.remove();
      HTMLAnchorElement.prototype.click = origClick;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: origCO });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: origRevoke });
    }
  });
});
