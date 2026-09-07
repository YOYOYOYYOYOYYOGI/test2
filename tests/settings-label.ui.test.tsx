// @vitest-environment happy-dom
// Label Design tab smoke: live preview, font controls, logo section and Save.
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { demoOrders } from '../src/lib/constants';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow]);
});

describe('Label Design settings tab', () => {
  it('renders fonts + logo sections with a live preview and saves changes', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    settings.demoMode = true;
    settings.spreadsheet = { provider: 'demo', connected: false, connection: null };
    const orders = demoOrders().map((o) => ({ ...o, customer: { ...o.customer } }));
    await storage.setMany({
      [LS.settings]: settings,
      [LS.fields]: fields,
      [LS.products]: [],
      [LS.orders]: orders,
      [LS.setupDone]: true,
      [LS.nextOrderNumber]: 1005,
    });

    const storeMod = await import('../src/store/appStore');
    await act(async () => { await useAppStoreProxy(storeMod); });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    try {
      const { SettingsPage } = await import('../src/app/pages/SettingsPage');
      await act(async () => { root.render(<SettingsPage go={() => undefined} />); });
      await act(async () => { await tick(250); });

      // switch to the Label Design tab
      const tabs = Array.from(el.querySelectorAll('button.tab')) as HTMLElement[];
      const labelTab = tabs.find((b) => (b.textContent ?? '').includes('Label Design'));
      expect(labelTab).toBeTruthy();
      await act(async () => { labelTab!.click(); });
      await act(async () => { await tick(300); });

      const text = () => el.textContent ?? '';
      expect(text()).toContain('Live preview');
      expect(text()).toContain('Logo on the label');
      expect(text()).toContain('Fonts');
      expect(text()).toContain('Global label font size');
      expect(text()).toContain('Business name'); // per-part font rows
      expect(text()).toContain('Customer name');
      expect(text()).toContain('auto'); // follow-global markers

      // the live preview should render an actual label with the business name
      expect(text()).toContain(settings.business.name || 'My Business');

      // change the font family → Save
      const selects = Array.from(el.querySelectorAll('select')) as HTMLSelectElement[];
      const family = selects.find((s) => Array.from(s.options).some((o) => o.value === 'Arial'));
      expect(family).toBeTruthy();
      await act(async () => {
        family!.value = 'Arial';
        family!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(120); });

      const saveBtn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Save');
      expect(saveBtn).toBeTruthy();
      expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
      await act(async () => { saveBtn!.click(); });
      await act(async () => { await tick(400); });

      const stored = await storage.getState<typeof settings>(LS.settings);
      expect(stored?.labels?.fontFamily).toBe('Arial');
      expect(stored?.labels?.fontSize).toBe(13);
      // logo + per-part defaults came along in the same persisted object
      expect(typeof stored?.labels?.showLogo).toBe('boolean');
    } finally {
      root.unmount();
      el.remove();
    }
  });
});

// store init helper (init must finish before the page reads settings)
async function useAppStoreProxy(mod: typeof import('../src/store/appStore')) {
  await mod.useAppStore.getState().init();
}
