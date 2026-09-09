// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// v1.0.8 — Full Backup & Restore (Settings → Backup & Restore):
//   - one versioned JSON file (backupVersion: 1) with orders, historical old
//     data, products, fields, delivery/matching rules and
//     all settings (incl. label design + logo data URL) — order numbers are
//     manual and travel inside each order row
//   - export file name order-manager-backup-YYYY-MM-DD.json
//   - validation never crashes; invalid files get the exact user message
//   - restore happens only after the explicit confirmation, replaces the
//     local data, keeps the live spreadsheet connection, clears transient
//     sync caches, and refreshes the UI
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { backupFileName, buildFullBackup, parseBackupFile, restoreBackup } from '../src/services/backup';
import type { OldOrderRecord, Order, Product } from '../src/types';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const mkOrder = (id: string, number: string, ts: number, extra: Partial<Order> = {}): Order => ({
  id, orderNumber: number,
  customer: { name: 'Old Customer', whatsapp: '8347034843', mobile: '9123456780', address: 'A-601, Yogi Platina', city: 'Gandhinagar', state: 'Gujarat', pincode: '382421' },
  products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '',
  orderStatus: 'New', notes: '', totalAmount: 0, printed: 'Not Printed', printedAt: null, createdAt: ts, updatedAt: ts, customFields: {},
  ...extra,
});

function seededState() {
  const { settings, fields } = makeDefaultSettingsWithTemplate();
  settings.business.name = 'Backup Test Store';
  settings.business.logoDataUrl = 'data:image/png;base64,AAAA'; // persisted logo
  settings.labels.footerText = 'Restored footer';
  settings.labels.fontSize = 14;
  settings.labels.showBarcode = true;
  settings.labels.logoWidth = 120;
  settings.mappings = {};
  settings.delivery = { defaultCharge: 40, rules: [{ id: 'd1', conditions: [{ id: 'c1', field: '__amount', op: 'greaterThan', value: '500' }], charge: 60 }] };
  settings.matching = { rules: [{ id: 'm1', fieldId: fields.find((f) => f.key === 'customerWhatsapp')?.id ?? '', mode: 'exact', enabled: true }] };
  settings.spreadsheet = { provider: 'excel', connected: false, connection: null };
  const products: Product[] = [
    { id: 'p1', name: 'Night Cream', sku: 'NC-01', price: 499, labelName: 'NC', active: true, createdAt: 1 },
    { id: 'p2', name: 'Face Serum', sku: '', price: 699, active: false, createdAt: 2 },
  ];
  const orders: Order[] = [
    mkOrder('o1', 'B-14001', 1, { previousOrderNumber: '4673-4312-3542', previousSequenceOrderNumber: '4672', deliveryCharge: 60, notes: 'backup me', paymentStatus: 'COD', customFields: { note: 'x' } }),
    mkOrder('o2', 'B-14002-B-14001', 2, { previousOrderNumber: 'B-14001', previousSequenceOrderNumber: 'B-14000' }),
  ];
  const oldOrders: OldOrderRecord[] = [
    { id: 'oa', orderNumber: '14031-12772-10086-8491-7489', name: 'Trupti Joshi', address: 'A-204 Aarna Residency', whatsapp: '6358800465', mobile: '91234 56780', sourceRow: 2, importedAt: 1 },
  ];
  return { settings, fields, products, orders, oldOrders, setupDone: true };
}

async function seedAll() {
  const s = seededState();
  await storage.area.clear();
  await storage.setMany({
    [LS.settings]: s.settings, [LS.fields]: s.fields, [LS.products]: s.products,
    [LS.orders]: s.orders, [LS.oldOrders]: s.oldOrders,
    [LS.setupDone]: true,
  });
  return s;
}

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
});

describe('backup service', () => {
  it('exports every section with backupVersion 1 and a dated file name', async () => {
    const s = await seedAll();
    const name = backupFileName(new Date(2026, 8, 8));
    expect(name).toBe('order-manager-backup-2026-09-08.json');
    const json = await buildFullBackup();
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('order-label-manager');
    expect(parsed.backupVersion).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.data.orders).toHaveLength(s.orders.length);
    expect(parsed.data.oldOrders).toHaveLength(1);
    expect(parsed.data.products).toHaveLength(2);
    expect(parsed.data.fields.length).toBeGreaterThan(5);
    expect(parsed.data.setupDone).toBe(true);
    expect(parsed.data).not.toHaveProperty('nextOrderNumber'); // auto counters are gone
  });

  it('rejects invalid files with the exact friendly message — never crashes', () => {
    for (const bad of ['not json at all', '{"app":"other"}', '{"app":"order-label-manager"}', '{"app":"order-label-manager","backupVersion":1}', '{"app":"order-label-manager","backupVersion":1,"data":{"settings":{}}}', '{"app":"order-label-manager","backupVersion":2,"data":{}}', '[]', '42']) {
      const res = parseBackupFile(bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain('Invalid backup file');
    }
    // a legacy config-only export (no full data) must NOT be accepted as a full backup
    const legacy = JSON.stringify({ app: 'order-label-manager', version: 1, settings: {}, fields: [], products: [] });
    expect(parseBackupFile(legacy).ok).toBe(false);
  });

  it('full round trip: restore replaces data and survives reload (computer A → computer B)', async () => {
    const s = await seedAll();
    const json = await buildFullBackup();
    const res = parseBackupFile(json);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.file.data.orders[0].orderNumber).toBe('B-14001');
    expect(res.file.data.orders[0].previousOrderNumber).toBe('4673-4312-3542');
    expect(res.file.data.orders[0].previousSequenceOrderNumber).toBe('4672');
    expect(res.file.data.orders[0].customer.mobile).toBe('9123456780');
    expect(res.file.data.oldOrders[0].mobile).toBe('91234 56780');

    // computer B — totally different data
    await storage.area.clear();
    await storage.setMany({
      [LS.settings]: { ...s.settings, business: { ...s.settings.business, name: 'Other Store' } },
      [LS.fields]: [], [LS.products]: [], [LS.orders]: [], [LS.oldOrders]: [],
      [LS.setupDone]: false, [LS.pendingOps]: [{ fake: 'op' }],
    });
    // a live Google connection on B is kept (device-specific)
    await storage.set(LS.settings, {
      ...s.settings, business: { ...s.settings.business, name: 'Other Store' },
      spreadsheet: { provider: 'google', connected: true, connection: { accessToken: 'tok', email: 'a@b.c', refreshToken: 'rt', spreadsheetId: 's1', spreadsheetName: 'S', worksheetName: 'W', connectedAt: 1 } },
    });

    await restoreBackup(res.file);

    const b = await storage.loadAll();
    expect(b.settings.business.name).toBe('Backup Test Store');
    expect(b.settings.business.logoDataUrl).toBe('data:image/png;base64,AAAA'); // label logo restored
    expect(b.settings.labels.footerText).toBe('Restored footer');
    expect(b.settings.labels.showBarcode).toBe(true);
    expect(b.settings.labels.logoWidth).toBe(120);
    expect(b.settings.delivery.rules).toHaveLength(1);
    expect(b.settings.delivery.rules[0].charge).toBe(60);
    expect(b.settings.matching.rules[0].enabled).toBe(true);
    expect(b.orders).toHaveLength(2);
    expect(b.orders.find((o) => o.id === 'o1')?.previousOrderNumber).toBe('4673-4312-3542');
    expect(b.orders.find((o) => o.id === 'o1')?.previousSequenceOrderNumber).toBe('4672');
    expect(b.orders.find((o) => o.id === 'o1')?.customer.mobile).toBe('9123456780');
    expect(b.orders.find((o) => o.id === 'o2')?.orderNumber).toBe('B-14002-B-14001');
    expect(b.oldOrders).toHaveLength(1);
    expect(b.oldOrders[0].mobile).toBe('91234 56780');
    expect(b.oldOrders[0].orderNumber).toBe('14031-12772-10086-8491-7489');
    expect(b.products).toHaveLength(2);
    expect(b.products[1].active).toBe(false);
    expect(b.fields.length).toBeGreaterThan(5);
    expect(b).not.toHaveProperty('nextOrderNumber');
    expect(b.setupDone).toBe(true);
    // live spreadsheet connection kept on B, transient caches cleared
    const live = await storage.getState<typeof b.settings>(LS.settings);
    expect(live?.spreadsheet.connected).toBe(true);
    expect(live?.spreadsheet.connection?.email).toBe('a@b.c');
    expect((await storage.getState<unknown>(LS.pendingOps)) ?? []).toHaveLength(0);
  });
});

describe('Settings → Backup & Restore UI', () => {
  it('imports a backup file, requires confirmation, restores and refreshes', { timeout: 90000 }, async () => {
    const s = await seedAll();
    const { useAppStore } = await import('../src/store/appStore');
    await act(async () => { await useAppStore.getState().init(); });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      const { SettingsPage } = await import('../src/app/pages/SettingsPage');
      const { ToastHost } = await import('../src/components/ui');
      await act(async () => {
        root.render(<><SettingsPage go={() => undefined} /><ToastHost /></>);
      });
      await act(async () => { await tick(300); });

      // open the tab
      const tab = Array.from(el.querySelectorAll('button.tab')).find((b) => (b.textContent ?? '').includes('Backup & Restore')) as HTMLButtonElement | undefined;
      expect(tab).toBeTruthy();
      await act(async () => { tab!.click(); });
      await act(async () => { await tick(250); });
      const text = () => el.textContent ?? '';
      expect(text()).toContain('Export Full Backup');
      expect(text()).toContain('Import Backup');
      expect(text()).toContain('backupVersion: 1');

      // ----- invalid file → exact message, nothing changes -----
      const fileInput = () => el.querySelector('input[type="file"]') as HTMLInputElement | null;
      const feed = async (file: File) => {
        await act(async () => {
          Object.defineProperty(fileInput()!, 'files', { configurable: true, value: [file] });
          fileInput()!.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await act(async () => { await tick(700); });
      };
      await feed(new File(['garbage'], 'bad.json', { type: 'application/json' }));
      expect(text()).toContain('Invalid backup file');
      expect((await storage.loadAll()).orders).toHaveLength(2);

      // ----- valid backup → confirm dialog gates the restore -----
      const json = await buildFullBackup();
      await feed(new File([json], 'order-manager-backup-2026-09-08.json', { type: 'application/json' }));
      expect(text()).toContain('Restore “order-manager-backup-2026-09-08.json”?');
      expect(text()).toContain('2 orders · 1 historical record · 2 products');
      expect(text()).toContain('Restore Backup');

      // Cancel the pending restore → nothing changed
      const cancelPending = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Cancel') as HTMLButtonElement | undefined;
      await act(async () => { cancelPending!.click(); });
      await act(async () => { await tick(250); });
      expect(text()).not.toContain('Restore “order-manager-backup-2026-09-08.json”?');

      // change the data, then import again and confirm
      await storage.setMany({ [LS.orders]: [], [LS.oldOrders]: [] });
      await feed(new File([json], 'order-manager-backup-2026-09-08.json', { type: 'application/json' }));
      const restoreBtn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Restore Backup') as HTMLButtonElement | undefined;
      expect(restoreBtn).toBeTruthy();
      await act(async () => { restoreBtn!.click(); });
      await act(async () => { await tick(250); });
      // the confirmation dialog
      expect(text()).toContain('Restore Backup?');
      expect(text()).toContain('This will replace the current extension data');

      const dialogRestore = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Restore') as HTMLButtonElement | undefined;
      expect(dialogRestore).toBeTruthy();
      await act(async () => { dialogRestore!.click(); });
      await act(async () => { await tick(900); });

      expect(text()).toContain('Backup restored successfully');
      const b = await storage.loadAll();
      expect(b.orders).toHaveLength(2);
      expect(b.orders.find((o) => o.id === 'o1')?.orderNumber).toBe('B-14001');
      expect(b.orders.find((o) => o.id === 'o1')?.previousOrderNumber).toBe('4673-4312-3542');
      expect(b.oldOrders).toHaveLength(1);
      expect(b.settings.business.name).toBe('Backup Test Store');
      // UI store was refreshed (not only storage)
      expect(useAppStore.getState().orders.length).toBe(2);

      // label design keeps working after the restore (TEST 10): the Label
      // Design tab opens and its live preview uses the restored settings
      const labelTab = Array.from(el.querySelectorAll('button.tab')).find((bl) => (bl.textContent ?? '').includes('Label Design')) as HTMLButtonElement | undefined;
      expect(labelTab).toBeTruthy();
      await act(async () => { labelTab!.click(); });
      await act(async () => { await tick(350); });
      expect(text()).toContain('Live preview');
      expect(text()).toContain('Backup Test Store'); // restored business name on the label
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
