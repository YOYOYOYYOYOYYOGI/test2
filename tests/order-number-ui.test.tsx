// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// New Order UI acceptance: Automatic preview is read-only, then the actual
// Save Order action persists the final order and advances Settings' counter.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it } from 'vitest';
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
      expect(host.textContent ?? '').toContain('Generated from Next Order Number: 15000.');
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
});
