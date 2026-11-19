// @vitest-environment happy-dom
// Settings UI acceptance: mode and Next Order Number must persist as text.
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { SettingsPage } from '../src/app/pages/SettingsPage';
import { useAppStore } from '../src/store/appStore';
import { LS, storage } from '../src/services/storage';

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  await storage.area.clear();
});

describe('Order Numbers settings UI', () => {
  it('persists Automatic mode and an edited text counter, then preserves it when switched back to Manual', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.order = { ...settings.order, numberMode: 'manual', nextOrderNumber: '15000' };
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.products]: [], [LS.orders]: [], [LS.setupDone]: true });
    useAppStore.setState({ ready: true, setupComplete: true, settings, fields, products: [], orders: [], oldOrders: [] });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<SettingsPage go={() => undefined} />); });
      await act(async () => { await tick(); });
      const tab = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Order Numbers');
      expect(tab).toBeTruthy();
      await act(async () => { tab!.click(); });
      await act(async () => { await tick(); });

      const mode = host.querySelector<HTMLSelectElement>('select');
      expect(mode?.value).toBe('manual');
      await act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mode!), 'value')?.set?.call(mode, 'automatic');
        mode!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(); });
      const next = host.querySelector<HTMLInputElement>('input[placeholder="15000"]');
      expect(next).toBeTruthy();
      await act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(next!), 'value')?.set?.call(next, '00000000000000015000');
        next!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const save = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Save');
      expect(save).toBeTruthy();
      await act(async () => { save!.click(); });
      await act(async () => { await tick(); });
      expect((await storage.loadAll()).settings.order).toMatchObject({
        numberMode: 'automatic',
        nextOrderNumber: '00000000000000015000',
      });

      // Return to Manual: do not corrupt or consume the configured next value.
      const manualMode = host.querySelector<HTMLSelectElement>('select');
      await act(async () => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(manualMode!), 'value')?.set?.call(manualMode, 'manual');
        manualMode!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(); });
      const saveManual = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Save');
      await act(async () => { saveManual!.click(); });
      await act(async () => { await tick(); });
      expect((await storage.loadAll()).settings.order).toMatchObject({
        numberMode: 'manual',
        nextOrderNumber: '00000000000000015000',
      });
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
