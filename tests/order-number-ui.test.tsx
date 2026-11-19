// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// New Order UI acceptance: Automatic preview is read-only, then the actual
// Save Order action persists the final order and advances Settings' counter.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
import type { OldOrderRecord, Order } from '../src/types';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { NewOrderPage } from '../src/app/pages/NewOrderPage';
import { useAppStore } from '../src/store/appStore';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

async function setText(el: HTMLElement, placeholder: string, value: string): Promise<void> {
  const input = Array.from(el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .find((node) => node.getAttribute('placeholder') === placeholder);
  expect(input, `input ${placeholder}`).toBeTruthy();
  await act(async () => {
    const proto = Object.getPrototypeOf(input!);
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await tick(); });
}

beforeEach(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
});

describe('New Order automatic mode', () => {
  it('shows a read-only generated number and advances it only after the user saves the order', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.order = { ...settings.order, numberMode: 'automatic', nextOrderNumber: '15000' };
    settings.products.included = [];
    await storage.setMany({
      [LS.settings]: settings,
      [LS.fields]: fields,
      [LS.products]: [],
      [LS.orders]: [],
      [LS.oldOrders]: [],
      [LS.setupDone]: true,
    });
    useAppStore.setState({
      ready: true,
      setupComplete: true,
      settings,
      fields,
      products: [],
      orders: [],
      oldOrders: [],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<NewOrderPage go={() => undefined} />); });
      await act(async () => { await tick(80); });

      const number = host.querySelector<HTMLInputElement>('#order-number');
      expect(number).toBeTruthy();
      expect(number!.disabled).toBe(true);
      expect(number!.value).toBe('15000');
      expect(host.textContent ?? '').toContain('No previous order selected — generated from Next Order Number only: 15000.');
      // No save happened yet: a user can cancel/leave and this value is not consumed.
      expect((await storage.loadAll()).settings.order.nextOrderNumber).toBe('15000');

      await setText(host, 'Customer name', 'UI first-time customer');
      await setText(host, '9876543210', '9000000001');
      await setText(host, 'House no., street, landmark…', '221B Baker Street, Ahmedabad');
      const save = Array.from(host.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('Save Order'));
      expect(save).toBeTruthy();
      await act(async () => { save!.click(); });
      await act(async () => { await tick(500); });

      const stored = await storage.loadAll();
      expect(stored.orders).toHaveLength(1);
      expect(stored.orders[0].orderNumber).toBe('15000');
      expect(stored.settings.order.nextOrderNumber).toBe('15001');
      // Saving opens the same LabelSheet renderer used by print/PDF output.
      expect(host.textContent ?? '').toContain('Label Preview — 15000');
      expect(host.textContent ?? '').toContain('ORDER: 15000');

      // Orders list and the Details modal must use the exact saved text too.
      const { OrdersPage } = await import('../src/app/pages/OrdersPage');
      await act(async () => { root.render(<OrdersPage go={() => undefined} />); });
      await act(async () => { await tick(120); });
      expect(host.textContent ?? '').toContain('15000');
      const view = host.querySelector<HTMLButtonElement>('button[title="View"]');
      expect(view).toBeTruthy();
      await act(async () => { view!.click(); });
      await act(async () => { await tick(60); });
      expect(host.textContent ?? '').toContain('Order 15000');
    } finally {
      root.unmount();
      host.remove();
    }
  });

  it('uses the exact imported or current order that the owner selects, while leaving history untouched', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.order = { ...settings.order, numberMode: 'automatic', nextOrderNumber: '15000' };
    settings.products.included = [];
    const imported: OldOrderRecord[] = [
      { id: 'old-6000', orderNumber: '6000', name: 'Older Imported', whatsapp: '6352808571', mobile: '9123456780', address: 'Old Address, Ahmedabad', importedAt: 10, sourceRow: 2 },
      { id: 'old-chain', orderNumber: '7000-6000', name: 'Chained Imported', whatsapp: '6352808571', address: 'Chain Address, Ahmedabad', importedAt: 20, sourceRow: 3 },
    ];
    const current = {
      id: 'current-3214', orderNumber: '3214', orderDate: '2026-09-01',
      customer: { name: 'Current Customer', whatsapp: '6352808571', mobile: '', address: 'Current Address, Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
      products: {}, paymentStatus: 'Paid', paymentMethod: 'UPI', transactionId: '', paymentAmount: '', orderStatus: 'New', notes: '',
      totalAmount: 0, deliveryCharge: 0, createdAt: 30, updatedAt: 30, pendingSync: false,
    } as Order;
    await storage.setMany({
      [LS.settings]: settings, [LS.fields]: fields, [LS.products]: [], [LS.orders]: [current], [LS.oldOrders]: imported, [LS.setupDone]: true,
    });
    useAppStore.setState({ ready: true, setupComplete: true, settings, fields, products: [], orders: [current], oldOrders: imported });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const selectExact = async (number: string) => {
      const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
        candidate.textContent?.includes('Select This Order')
        && candidate.parentElement?.querySelector('b')?.textContent === number,
      );
      expect(button, `selection button for ${number}`).toBeTruthy();
      await act(async () => { button!.click(); });
      await act(async () => { await tick(100); });
    };
    try {
      await act(async () => { root.render(<NewOrderPage go={() => undefined} />); });
      await act(async () => { await tick(80); });
      await setText(host, '9876543210', '6352808571');
      await act(async () => { await tick(450); });

      // Every match, imported and current, is displayed. A match alone never
      // auto-attaches history: the base stays bare until the user selects one.
      expect(host.textContent ?? '').toContain('6000');
      expect(host.textContent ?? '').toContain('7000-6000');
      expect(host.textContent ?? '').toContain('3214');
      expect(host.textContent ?? '').toContain('recent order');
      expect(host.querySelector<HTMLInputElement>('#order-number')!.value).toBe('15000');
      expect(host.textContent ?? '').toContain('No previous order selected');

      // Pick an older imported order instead of the newest result: saved
      // details copy into the editable form and only this full number suffixes.
      await selectExact('6000');
      expect(host.querySelector<HTMLInputElement>('#order-number')!.value).toBe('15000-6000');
      expect(host.textContent ?? '').toContain('Selected Previous Order');
      const name = Array.from(host.querySelectorAll<HTMLInputElement>('input')).find((input) => input.getAttribute('placeholder') === 'Customer name');
      expect(name?.value).toBe('Older Imported');
      const address = Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea')).find((input) => input.getAttribute('placeholder') === 'House no., street, landmark…');
      expect(address?.value).toBe('Old Address, Ahmedabad');

      // Switch to a different matching current order before saving. This also
      // proves the source data stays separate from edits to the new form.
      await selectExact('3214');
      expect(host.querySelector<HTMLInputElement>('#order-number')!.value).toBe('15000-3214');
      expect(name?.value).toBe('Current Customer');
      await setText(host, 'Customer name', 'Edited new order only');
      const save = Array.from(host.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('Save Order'));
      expect(save).toBeTruthy();
      await act(async () => { save!.click(); });
      await act(async () => { await tick(500); });

      const stored = await storage.loadAll();
      const created = stored.orders.find((order) => order.id !== current.id)!;
      expect(created).toMatchObject({ orderNumber: '15000-3214', previousOrderNumber: '3214', customer: { name: 'Edited new order only', address: 'Current Address, Ahmedabad' } });
      expect(stored.settings.order.nextOrderNumber).toBe('15001');
      expect(stored.oldOrders).toEqual(imported);
      expect(stored.orders.find((order) => order.id === current.id)).toEqual(current);
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
