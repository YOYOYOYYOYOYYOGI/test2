// ---------------------------------------------------------------------------
// Product table editor — used on the Products page and in the setup wizard.
// Every product may own a "<Name> Qty" column in the spreadsheet.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import type { DragEvent } from 'react';
import type { Product } from '../../types';
import { DEFAULT_DEMO_PRODUCTS, makeId } from '../../lib/constants';
import { Button, Checkbox, Input } from '../ui';
import { IconBox, IconPlus, IconTrash } from '../icons';

export interface ProductDraft extends Omit<Product, 'id' | 'createdAt'> {
  id?: string;
  dirty?: boolean;
}

export function ProductTableEditor({ products, onChange, spreadsheetColumnIds, onToggleSpreadsheetColumn }: {
  products: Product[];
  onChange: (next: Product[]) => void;
  /** product ids currently included as qty columns in the spreadsheet */
  spreadsheetColumnIds?: string[];
  onToggleSpreadsheetColumn?: (productId: string, include: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const commit = (rows: ProductDraft[]) => {
    const ready = rows.filter((r) => r.id);
    const now = Date.now();
    const next = ready.map((r, i) => ({
      id: r.id as string,
      name: r.name.trim() || 'Unnamed product',
      sku: (r.sku ?? '').trim(),
      price: Number.isFinite(Number(r.price)) ? Number(r.price) : 0,
      labelName: (r.labelName ?? '').trim() || undefined,
      active: r.active ?? true,
      createdAt: (products.find((p) => p.id === r.id)?.createdAt) ?? now - i,
    }));
    onChange(next);
  };

  /** Drag handle drop → reorder the catalogue (array order IS the product
   *  order used by the picker, labels of new orders, Excel & sheet columns). */
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= products.length || to >= products.length) return;
    const list = [...products];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    onChange(list);
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null && dragFrom !== to) reorder(dragFrom, to);
    setDragFrom(null);
    setDragOver(null);
  };
  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to >= 0 && to < products.length) reorder(from, to);
  };

  const beginAdd = () => {
    const row: ProductDraft = { name: '', sku: '', price: 0, labelName: '', active: true, dirty: true };
    setDrafts([...drafts, row]);
  };

  const patchDraft = (i: number, patch: Partial<ProductDraft>) => {
    setDrafts(drafts.map((d, di) => (di === i ? { ...d, ...patch } : d)));
  };

  const saveDraft = (i: number) => {
    const row = drafts[i];
    if (!row.name.trim()) return;
    const id = row.id ?? makeId();
    const all: ProductDraft[] = [
      ...products.map((p) => ({ ...p, dirty: false })),
      { ...row, id },
    ];
    setDrafts([]);
    commit(all);
  };

  const discardDraft = (i: number) => setDrafts(drafts.filter((_, di) => di !== i));

  const updateProduct = (id: string, patch: Partial<Product>) => {
    onChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const remove = (id: string) => {
    if (!confirm('Delete this product? Spreadsheet columns and old orders are kept.')) return;
    onChange(products.filter((p) => p.id !== id));
  };

  const addSample = () => {
    const now = Date.now();
    const existing = new Set(products.map((p) => p.name.trim().toLowerCase()));
    const samples = DEFAULT_DEMO_PRODUCTS
      .filter((p) => !existing.has(p.name.toLowerCase()))
      .map((p, i) => ({ ...p, id: makeId(), createdAt: now + i }));
    onChange([...products, ...samples]);
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row spread" style={{ flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="primary" icon={<IconPlus width={14} />} onClick={beginAdd}>Add product</Button>
          {products.length === 0 && (
            <Button size="sm" variant="outline" onClick={addSample} icon={<IconBox width={14} />}>Load sample products</Button>
          )}
        </div>
        <span className="hint">{products.length} product{products.length === 1 ? '' : 's'}</span>
      </div>

      {products.length > 0 && (
        <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
          <table className="tbl" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 118 }} title="Drag ≡ or use ↑/↓ to change the product order used in the picker, Excel, sheet columns and dashboard">Position</th>
                <th>Product name</th>
                <th style={{ width: 90 }}>SKU</th>
                <th style={{ width: 110 }} className="num">Price</th>
                <th style={{ width: 180 }}>Label name (on labels)</th>
                <th style={{ width: 70 }}>Active</th>
                {spreadsheetColumnIds && onToggleSpreadsheetColumn && <th style={{ width: 150 }}>Qty column in sheet</th>}
                <th style={{ width: 46 }} />
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ ...(dragOver === i ? { outline: '2px dashed var(--primary)', outlineOffset: -2 } : {}) }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
                  onDrop={(e) => onDrop(e, i)}
                >
                  <td>
                    <div className="row" style={{ gap: 2, alignItems: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        draggable
                        title="Drag to reorder"
                        style={{ cursor: 'grab', color: 'var(--muted)' }}
                        onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
                        onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                        onClick={(e) => e.preventDefault()}
                      >
                        ≡
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Move up" disabled={i === 0} style={{ color: 'var(--muted)' }} onClick={() => move(i, -1)}>↑</button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Move down" disabled={i === products.length - 1} style={{ color: 'var(--muted)' }} onClick={() => move(i, 1)}>↓</button>
                      <span className="muted small" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
                    </div>
                  </td>
                  <td>
                    <Input defaultValue={p.name} className="small" style={{ padding: '4px 8px', fontSize: 13 }}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) updateProduct(p.id, { name: v }); }} />
                  </td>
                  <td>
                    <Input defaultValue={p.sku} className="small" style={{ padding: '4px 8px', fontSize: 13 }}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== p.sku) updateProduct(p.id, { sku: v }); }} />
                  </td>
                  <td className="num">
                    <Input type="number" min={0} step="0.01" defaultValue={p.price} className="small" style={{ padding: '4px 8px', fontSize: 13, textAlign: 'right' }}
                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== p.price) updateProduct(p.id, { price: v }); }} />
                  </td>
                  <td title="Shown on the customer label — separate from the product name">
                    <Input defaultValue={p.labelName ?? ''} placeholder={p.name} className="small" style={{ padding: '4px 8px', fontSize: 13 }}
                      onBlur={(e) => { const v = e.target.value.trim(); if ((v || undefined) !== (p.labelName?.trim() || undefined)) updateProduct(p.id, { labelName: v || undefined }); }} />
                  </td>
                  <td><Checkbox checked={p.active} onChange={(e) => updateProduct(p.id, { active: e.target.checked })} /></td>
                  {spreadsheetColumnIds && onToggleSpreadsheetColumn && (
                    <td>
                      <Checkbox checked={spreadsheetColumnIds.includes(p.id)} onChange={(e) => onToggleSpreadsheetColumn(p.id, e.target.checked)} />
                    </td>
                  )}
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => remove(p.id)} style={{ color: 'var(--danger)' }}>
                      <IconTrash width={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {drafts.map((d, i) => (
                <tr key={`draft-${i}`} style={{ background: 'var(--primary-soft)' }}>
                  <td className="muted small">new</td>
                  <td>
                    <Input value={d.name} autoFocus placeholder="Product name"
                      onChange={(e) => patchDraft(i, { name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveDraft(i); if (e.key === 'Escape') discardDraft(i); }} />
                  </td>
                  <td><Input value={d.sku} placeholder="SKU" onChange={(e) => patchDraft(i, { sku: e.target.value })} /></td>
                  <td><Input type="number" min={0} value={d.price} onChange={(e) => patchDraft(i, { price: Number(e.target.value) })} /></td>
                  <td><Input value={d.labelName} placeholder="(same as name)" onChange={(e) => patchDraft(i, { labelName: e.target.value })} /></td>
                  <td><Checkbox checked={d.active ?? true} onChange={(e) => patchDraft(i, { active: e.target.checked })} /></td>
                  {spreadsheetColumnIds && onToggleSpreadsheetColumn && <td />}
                  <td>
                    <div className="row" style={{ gap: 2 }}>
                      <Button size="sm" variant="primary" onClick={() => saveDraft(i)}>Add</Button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => discardDraft(i)} style={{ color: 'var(--muted)' }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {products.length === 0 && drafts.length === 0 && (
        <div className="empty" style={{ border: '1px dashed var(--border-strong)', borderRadius: 10, padding: 30 }}>
          <div className="icon"><IconBox width={30} height={30} style={{ color: 'var(--muted)' }} /></div>
          No products yet. Add your first product (e.g. Night Cream ₹499) or load the sample set to see how it works.
          <div style={{ marginTop: 12 }}><Button variant="outline" size="sm" onClick={addSample}>Load sample products</Button></div>
        </div>
      )}
      <p className="hint">Product order: drag the ≡ handle (or use ↑/↓) — the saved order is used by the product picker, new-order screen, Excel export, spreadsheet product columns and the dashboard's Product Sales. Label name is what appears on printed labels; product name stays the business name. Historical orders keep the product info saved with them.</p>
    </div>
  );
}
