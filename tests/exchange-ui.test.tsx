// ---------------------------------------------------------------------------
// UI: Export/Import Products and Export Orders + Products buttons behave
// (downloads + preview modal + confirm import)
// ---------------------------------------------------------------------------
// @vitest-environment happy-dom
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { exportProductsBlob, fullWorkbook, productsFilename } from '../src/services/dataExchange';
import type { Order, Product } from '../src/types';

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow]);
});

const now = Date.now();
const products: Product[] = [
  { id: 'p1', name: 'Night Cream', sku: 'NC001', price: 500, active: true, createdAt: 1 },
  { id: 'p2', name: 'Face Serum', sku: 'FS001', price: 699, active: true, createdAt: 2 },
];

const mkOrder = (id: string, name: string): Order => ({
  id,
  orderNumber: id,
  customer: { name, whatsapp: '9876543210', mobile: '', address: 'MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  products: { p1: { productId: 'p1', productName: 'Night Cream', quantity: 2, price: 500 } },
  paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
  orderStatus: 'New', notes: '', totalAmount: 1000,
  printed: 'Not Printed', printedAt: null, createdAt: now, updatedAt: now,
  customFields: {},
});

async function bootApp() {
  const { settings, fields } = makeDefaultSettingsWithTemplate();
  settings.demoMode = true;
  settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
  await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: products, [LS.orders]: [mkOrder('14031', 'Rahul'), mkOrder('14032', 'Priya')], [LS.setupDone]: true, [LS.nextOrderNumber]: 14033 });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    const { App } = await import('../src/app/App');
    root.render(<App />);
  });
  await act(async () => { await tick(350); });
  const { navigate } = await import('../src/app/router');
  return { el, root, navigate };
}

async function clickButton(el: HTMLElement, label: string) {
  const btns = Array.from(el.querySelectorAll('button')) as HTMLElement[];
  const btn = btns.find((b) => (b.textContent ?? '').includes(label) && !(b as HTMLButtonElement).disabled);
  expect(btn, `button containing label ${label}`).toBeTruthy();
  await act(async () => { btn!.click(); });
  await act(async () => { await tick(250); });
}

async function clickExactButton(el: HTMLElement, label: string) {
  const btns = Array.from(el.querySelectorAll('button')) as HTMLElement[];
  const btn = btns.find((b) => (b.textContent ?? '').trim() === label && !(b as HTMLButtonElement).disabled);
  expect(btn, `button with exact label ${label}`).toBeTruthy();
  await act(async () => { btn!.click(); });
  await act(async () => { await tick(300); });
}

function wireDownloads() {
  const downloaded: string[] = [];
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { downloaded.push(this.download); };
  const origCO = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:mock' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  return {
    downloaded,
    restore: () => {
      HTMLAnchorElement.prototype.click = origClick;
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: origCO });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: origRevoke });
    },
  };
}

async function feedFile(el: HTMLElement, file: File) {
  const input = Array.from(el.querySelectorAll('input[type="file"]')).find((i) => !(i as HTMLInputElement).disabled) as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await tick(300); });
}

describe('Products page export/import buttons', () => {
  it('exports products-<date>.xlsx and imports it back through the preview modal', async () => {
    const dl = wireDownloads();
    const { el, root, navigate } = await bootApp();
    try {
      await act(async () => { navigate('products'); });
      await act(async () => { await tick(300); });
      expect(el.textContent ?? '').toContain('Export Products');

      await clickButton(el, 'Export Products');
      expect(dl.downloaded[0]).toBe(productsFilename());

      // changed price — import should update (no duplicates)
      const changed = products.map((p) => ({ ...p }));
      changed[0] = { ...changed[0], price: 550 };
      const file = new File([exportProductsBlob(changed)], 'products-2024-01-01.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await clickButton(el, 'Import Products');
      await feedFile(el, file);

      const text = el.textContent ?? '';
      expect(text).toContain('Products Found: 2');
      expect(text).toContain('Existing to Update: 2');
      expect(text).toContain('New: 0');

      await clickExactButton(el, 'Import 2 Products');
      await act(async () => { await tick(200); });
      const loaded = await storage.loadAll();
      const stored = loaded.products as Product[];
      expect(stored).toHaveLength(2);
      expect(stored.find((p) => p.id === 'p1')?.price).toBe(550);
      expect(stored.find((p) => p.id === 'p2')?.price).toBe(699);
    } finally {
      root.unmount();
      el.remove();
      dl.restore();
    }
  });
});

describe('Orders page full workbook buttons', () => {
  it('exports orders-products-<date>.xlsx with 3 sheets and re-imports without drift', async () => {
    const dl = wireDownloads();
    const { el, root, navigate } = await bootApp();
    try {
      await act(async () => { navigate('orders'); });
      await act(async () => { await tick(300); });
      expect(el.textContent ?? '').toContain('Export Orders + Products');
      expect(el.textContent ?? '').toContain('Import Orders + Products');

      await clickButton(el, 'Export Orders + Products');
      expect(dl.downloaded[0]).toMatch(/^orders-products-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(dl.downloaded[0]).toBe(dl.downloaded[0]);

      // import the same workbook back — everything counts as existing
      const tpl = makeDefaultSettingsWithTemplate();
      tpl.settings.demoMode = true;
      tpl.settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
      const orders = [mkOrder('14031', 'Rahul'), mkOrder('14032', 'Priya')];
      const { blob } = fullWorkbook(orders, { settings: tpl.settings, fields: tpl.fields, products });
      const file = new File([blob], 'orders-products-2024-01-01.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      await clickButton(el, 'Import Orders + Products');
      await feedFile(el, file);

      const text = el.textContent ?? '';
      expect(text).toContain('Orders Found: 2');
      expect(text).toContain('Products Found: 2');
      expect(text).toContain('Order Items Found: 2');
      expect(text).toContain('Existing Orders (updated): 2');
      expect(text).toContain('Existing Products (updated): 2');

      await clickExactButton(el, 'Import'); // modal confirm
      await act(async () => { await tick(300); });
      const loaded = await storage.loadAll();
      const stored = loaded.orders as Order[];
      expect(stored).toHaveLength(2); // no duplicates, no drift
      expect(stored.map((o) => o.orderNumber).sort()).toEqual(['14031', '14032']);
      const storedP = loaded.products as Product[];
      expect(storedP.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    } finally {
      root.unmount();
      el.remove();
      dl.restore();
    }
  });
});
