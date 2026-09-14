// @vitest-environment happy-dom
// ---------------------------------------------------------------------------
// Products page editor: Move up/down reorders the catalogue (persisted by the
// page) and the Label Name field is editable independently of the product
// name — no delete/recreate needed.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Product } from '../src/types';
import { ProductTableEditor } from '../src/components/products/ProductTableEditor';

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function p(id: string, name: string, labelName?: string): Product {
  return { id, name, sku: `${id}-sku`, price: 100, labelName, active: true, createdAt: 1 };
}

describe('ProductTableEditor drag-and-drop ordering', () => {
  it('dragging the ≡ handle drops the row at the target position', async () => {
    class DT {
      effectAllowed = 'move';
      dropEffect = 'none';
      data: Record<string, string> = {};
      setData(k: string, v: string) { this.data[k] = v; }
      getData(k: string) { return this.data[k] ?? ''; }
    }
    const products = [p('nc', 'Night Cream'), p('fs', 'Face Serum'), p('dc', 'Day Cream')];
    const calls: Product[][] = [];
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<ProductTableEditor products={products} onChange={(next) => calls.push(next)} />);
    });
    await act(async () => { await tick(50); });
    try {
      const rows = Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[];
      const handle = (row: HTMLElement) => row.querySelector('button[draggable="true"]') as HTMLButtonElement | null;
      const dt = () => new DT() as unknown as DataTransfer;
      const dragEv = (type: string) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: dt() });
        return ev;
      };
      // drag Face Serum (row 1) above Night Cream (row 0) — separate acts so
      // the dragstart state commits before the drop handler reads it
      await act(async () => {
        handle(rows[1])!.dispatchEvent(dragEv('dragstart'));
      });
      await act(async () => { await tick(50); });
      await act(async () => {
        rows[0].dispatchEvent(dragEv('dragover'));
      });
      await act(async () => { await tick(20); });
      await act(async () => {
        rows[0].dispatchEvent(dragEv('drop'));
      });
      await act(async () => { await tick(50); });
      await act(async () => {
        handle(rows[1])!.dispatchEvent(dragEv('dragend'));
      });
      await act(async () => { await tick(50); });
      expect(calls).toHaveLength(1);
      expect(calls[0].map((x) => x.id)).toEqual(['fs', 'nc', 'dc']);
    } finally {
      root.unmount();
      el.remove();
    }
  });
});

describe('ProductTableEditor ordering + label name editing', () => {
  it('Move down button reorders the catalogue array (source of product order)', async () => {
    const products = [p('nc', 'Night Cream', 'Night Cream 50g'), p('fs', 'Face Serum'), p('dc', 'Day Cream')];
    const calls: Product[][] = [];
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<ProductTableEditor products={products} onChange={(next) => calls.push(next)} />);
    });
    await act(async () => { await tick(50); });
    try {
      const rows = Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[];
      expect(rows.length).toBe(3);
      const moveDownFirst = rows[0].querySelector('button[title="Move down"]') as HTMLButtonElement;
      expect(moveDownFirst).toBeTruthy();
      await act(async () => { moveDownFirst.click(); });
      await act(async () => { await tick(50); });
      expect(calls).toHaveLength(1);
      expect(calls[0].map((x) => x.id)).toEqual(['fs', 'nc', 'dc']);
    } finally {
      root.unmount();
      el.remove();
    }
  });

  it('edits Label Name in place (separate value) without touching product name', async () => {
    const products = [p('nc', 'Night Cream')];
    const calls: Product[][] = [];
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<ProductTableEditor products={products} onChange={(next) => calls.push(next)} />);
    });
    await act(async () => { await tick(50); });
    try {
      const labelInput = Array.from(el.querySelectorAll('input')).find((i) => i.placeholder === 'Night Cream') as HTMLInputElement | undefined;
      expect(labelInput, 'label name input').toBeTruthy();
      await act(async () => {
        const proto = Object.getPrototypeOf(labelInput!);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(labelInput, 'Advanced Night Cream');
        labelInput!.dispatchEvent(new Event('input', { bubbles: true }));
        // React maps onBlur to the bubbling focusout event
        labelInput!.dispatchEvent(new Event('focusout', { bubbles: true }));
      });
      await act(async () => { await tick(50); });
      expect(calls).toHaveLength(1);
      const next = calls[0][0];
      expect(next.name).toBe('Night Cream'); // product name unchanged
      expect(next.labelName).toBe('Advanced Night Cream');
      expect(next.sku).toBe('nc-sku'); // untouched fields survive
    } finally {
      root.unmount();
      el.remove();
    }
  });
});
