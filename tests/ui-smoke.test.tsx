// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// Mount smoke test — verifies the app boots, the setup wizard renders and the
// user can reach the field builder in Demo Mode (no Chrome APIs needed).
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow, LS.settings, LS.fields, LS.setupDone]);
});

function tick(ms = 30): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('app boot + wizard (demo)', () => {
  it('renders welcome → connects demo → reaches fields step', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const { App } = await import('../src/app/App');
    await act(async () => { root.render(<App />); });
    await act(async () => { await tick(250); });
    // First-run welcome (init seeds defaults synchronously-ish)
    const text = () => el.textContent ?? '';
    expect(text()).toContain('Welcome to Order Label Manager');
    expect(text()).toContain('Get Started');

    // click Get Started
    const clickBtn = async (label: string) => {
      const btns = Array.from(el.querySelectorAll('button'));
      const btn = btns.find((b) => (b.textContent ?? '').includes(label));
      expect(btn, `button ${label}`).toBeTruthy();
      await act(async () => { btn!.click(); });
      await act(async () => { await tick(80); });
    };

    await clickBtn('Get Started');
    expect(text()).toContain('Connect Spreadsheet');
    await clickBtn('Start Demo Mode');
    await act(async () => { await tick(150); });
    expect(text()).toContain('Order Fields');
    expect(text()).toContain('Order Number');

    // Fields step: continue → Products
    await clickBtn('Continue to products');
    await act(async () => { await tick(120); });
    expect(text()).toContain('Products');
    await clickBtn('Finish setup');
    await act(async () => { await tick(400); });
    // Done → "Create my first order" navigates to dashboard
    await clickBtn('Create my first order');
    await act(async () => { await tick(350); });
    // dashboard has quick actions + date-filtered stats (default = Today)
    expect(text()).toContain('Total Orders');
    expect(text()).toContain('Product Sales');
    // demo seeded sample orders
    const stored = await storage.loadAll();
    expect(stored.orders.length).toBeGreaterThanOrEqual(4);
    expect(stored.settings.demoMode).toBe(true);
    // sidebar New Order navigable
    await act(async () => {
      const navs = Array.from(el.querySelectorAll('.nav-item')) as HTMLElement[];
      const newBtn = navs.find((b) => (b.textContent ?? '').includes('New Order'));
      expect(newBtn).toBeTruthy();
      newBtn!.click();
    });
    await act(async () => { await tick(200); });
    expect(text()).toContain('Customer Information');

    // fill + save an actual order (demo provider)
    const setInput = async (placeholder: string, value: string) => {
      const candidates = [
        ...Array.from(el.querySelectorAll('input')),
        ...Array.from(el.querySelectorAll('textarea')),
      ] as Array<HTMLInputElement | HTMLTextAreaElement>;
      const input = candidates.find((i) => i.getAttribute('placeholder') === placeholder);
      expect(input, `input ${placeholder}`).toBeTruthy();
      await act(async () => {
        const proto = Object.getPrototypeOf(input!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(input, value);
        input!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { await tick(20); });
    };
    await setInput('Customer name', 'E2E Customer');
    await setInput('9876543210', '9876500000');
    await setInput('House no., street, landmark…', '221B Baker Street, MG Road');
    // order numbers are fully manual — type the complete number
    await setInput('e.g. 15000', '16001');
    await act(async () => {
      const pill = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Night Cream'));
      expect(pill).toBeTruthy();
      pill!.click();
    });
    await act(async () => { await tick(60); });
    await act(async () => {
      const save = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Save Order'));
      expect(save).toBeTruthy();
      save!.click();
    });
    await act(async () => { await tick(1200); });
    const afterSave = await storage.loadAll();
    const newest = [...afterSave.orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    expect(newest).toBeTruthy();
    expect(newest.customer.name).toBe('E2E Customer');
    expect(Object.values(newest.products)[0]?.productName).toBe('Night Cream');
    expect(text()).toContain('Preview is scaled to fit');
    root.unmount();
    el.remove();
  });
});
