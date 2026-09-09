// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// Settings → Delivery + Duplicates tabs: rule builders render, Save persists
// rules into the same settings store (chrome.storage), and nothing else in
// the settings object is disturbed.
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LS, storage } from '../src/services/storage';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await storage.area.clear();
  await storage.remove([LS.settings, LS.fields, LS.orders, LS.setupDone]);
});

describe('Settings rule builders', () => {
  it('Delivery tab: add/edit a rule + default charge and persist both', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.setupDone]: true });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const { App } = await import('../src/app/App');
    await act(async () => { root.render(<App />); });
    await act(async () => { await tick(350); });
    const { navigate } = await import('../src/app/router');
    await act(async () => { navigate('settings'); });
    await act(async () => { await tick(250); });

    const text = () => el.textContent ?? '';
    const clickBtn = async (label: string) => {
      const btn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label));
      expect(btn, `button ${label}`).toBeTruthy();
      await act(async () => { btn!.click(); });
      await act(async () => { await tick(150); });
    };
    try {
      await clickBtn('Delivery');
      expect(text()).toContain('Delivery Charge Rules');
      expect(text()).toContain('first rule whose conditions all match');
      await clickBtn('Add Rule');
      expect(text()).toContain('Rule 1');

      // set the default charge (number input with placeholder "0") = 150
      const numInputs = Array.from(el.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      const defaultInput = numInputs.find((i) => i.placeholder === '0');
      expect(defaultInput, 'default charge input').toBeTruthy();
      await act(async () => {
        const proto = Object.getPrototypeOf(defaultInput!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(defaultInput, '150');
        defaultInput!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // rule charge input (placeholder "100")
      const chargeInput = numInputs.find((i) => i.placeholder === '100');
      expect(chargeInput, 'rule charge input').toBeTruthy();
      await act(async () => {
        const proto = Object.getPrototypeOf(chargeInput!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(chargeInput, '120');
        chargeInput!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { await tick(100); });
      await clickBtn('Save');
      await act(async () => { await tick(300); });

      const s = (await storage.loadAll()).settings;
      expect(s.delivery.defaultCharge).toBe(150);
      expect(s.delivery.rules).toHaveLength(1);
      expect(s.delivery.rules[0].charge).toBe(120);
      expect(s.delivery.rules[0].conditions).toHaveLength(1);
      // rest of settings untouched (no auto order-number fields exist anymore)
      expect(s.order).not.toHaveProperty('prefix');
      expect(s.labels.fontSize).toBe(13);
    } finally {
      root.unmount();
      el.remove();
    }
  });

  it('Duplicates tab: enable rules on a field + comparison mode and persist', async () => {
    const { settings, fields } = makeDefaultSettingsWithTemplate();
    await storage.setMany({ [LS.settings]: settings, [LS.fields]: fields, [LS.setupDone]: true });

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const { App } = await import('../src/app/App');
    await act(async () => { root.render(<App />); });
    await act(async () => { await tick(350); });
    const { navigate } = await import('../src/app/router');
    await act(async () => { navigate('settings'); });
    await act(async () => { await tick(250); });
    const clickBtn = async (label: string) => {
      const btn = Array.from(el.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label));
      expect(btn, `button ${label}`).toBeTruthy();
      await act(async () => { btn!.click(); });
      await act(async () => { await tick(150); });
    };
    try {
      await clickBtn('Duplicates');
      expect((el.textContent ?? '')).toContain('Duplicate / Matching Rules');
      await clickBtn('Add Rule');

      const selects = Array.from(el.querySelectorAll('select')) as HTMLSelectElement[];
      // first select in the rule row = field, second = comparison mode
      const fieldSel = selects[0];
      const modeSel = selects[1];
      expect(fieldSel).toBeTruthy();
      expect(modeSel).toBeTruthy();
      // choose "Transaction ID" (if present in the template) else the last field
      const txnOpt = Array.from(fieldSel.options).find((o) => o.text === 'Transaction ID');
      const wantedField = txnOpt ? txnOpt.value : fieldSel.options[fieldSel.options.length - 1]?.value;
      await act(async () => {
        const proto = Object.getPrototypeOf(fieldSel);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(fieldSel, wantedField);
        fieldSel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // mode → contains
      const modeVal = Array.from(modeSel.options).find((o) => o.text === 'Contains')?.value ?? 'contains';
      await act(async () => {
        const proto = Object.getPrototypeOf(modeSel);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(modeSel, modeVal);
        modeSel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => { await tick(100); });
      await clickBtn('Save');
      await act(async () => { await tick(300); });

      const s = (await storage.loadAll()).settings;
      expect(s.matching.rules).toHaveLength(1);
      expect(s.matching.rules[0].fieldId).toBe(wantedField);
      expect(s.matching.rules[0].mode).toBe('contains');
      expect(s.matching.rules[0].enabled).toBe(true);
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
