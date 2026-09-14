// @vitest-environment happy-dom
// Regression: the popup used to crash on open because the store's `settings`
// is undefined until async init() finishes, and the component read
// settings.demoMode before the `ready` gate (TypeError on first render).
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { Popup } from '../src/popup/Popup';

beforeAll(async () => {
  await storage.area.clear();
  await storage.remove([LS.settings, LS.fields, LS.products, LS.orders, LS.setupDone, LS.nextOrderNumber]);
});

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('popup boot', () => {
  it('renders the loading state first, then the ready UI — never throws on undefined settings', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);

    const captured: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { captured.push(String(a[0])); orig(...a); };

    try {
      await act(async () => { root.render(<Popup />); });
      await act(async () => { await tick(30); });
      // must never crash: either the static loading frame or the ready UI
      const firstPaint = el.textContent ?? '';
      expect(firstPaint.includes('Loading…') || firstPaint.includes('New Order')).toBe(true);

      // let init() hydrate the store
      await act(async () => { await tick(400); });
      const txt = el.textContent ?? '';
      expect(txt).toContain('New Order');
      expect(txt).toContain('Open Full App');

      const crashes = captured.filter((m) => !m.includes('not configured to support act'));
      expect(crashes).toEqual([]);
    } finally {
      console.error = orig;
      root.unmount();
      el.remove();
    }
  });
});
