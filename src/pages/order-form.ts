import { PAYMENT_STATUSES } from '../constants';
import { bumpOrderNumber, findByNumber, getFields, getOrder, getProducts, getSettings, nextOrderNumber, saveOrder } from '../services/store';
import { syncOrder, sheetHasOrder } from '../services/sheets-data';
import type { CustomField, Order, OrderItem, PaymentStatus } from '../types';
import { esc, isValidEmail, isValidPhone, money, uid } from '../utils';
import { modal, msg, toast } from '../ui';
import type { Ctx, PageResult } from './ctx';

interface Draft {
  id: string | null;
  orderNumber: string;
  customerData: Record<string, string>;
  items: OrderItem[];
  paymentStatus: PaymentStatus;
  sheetRow?: number;
  createdAt?: string;
  labelPrinted?: boolean;
}

let draft: Draft | null = null;
let draftFor: string | null = null; // ctx.id the draft was loaded for

/** Start a fresh draft (used when the user clicks "New Order" in the navigation). */
export function resetDraft(): void {
  draft = null;
  draftFor = '\u0000reset';
}

function freshDraft(): Draft {
  return { id: null, orderNumber: nextOrderNumber(), customerData: {}, items: [], paymentStatus: 'COD' };
}

function fieldInput(f: CustomField, value: string): string {
  const req = f.required ? ' <span class="req">*</span>' : '';
  const id = esc(f.id);
  switch (f.type) {
    case 'textarea':
      return `<div class="field span2"><label class="f">${esc(f.name)}${req}</label><textarea rows="2" data-fid="${id}">${esc(value)}</textarea></div>`;
    case 'dropdown': {
      const opts = (f.options || []).map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('');
      return `<div class="field"><label class="f">${esc(f.name)}${req}</label><select data-fid="${id}"><option value=""></option>${opts}</select></div>`;
    }
    case 'checkbox':
      return `<div class="field"><label class="f">${esc(f.name)}${req}</label><label class="checkrow" style="padding:6px 0 0"><input type="checkbox" data-fid="${id}" ${value === 'Yes' ? 'checked' : ''}> Yes</label></div>`;
    default: {
      const t = f.type === 'number' ? 'number' : f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text';
      return `<div class="field"><label class="f">${esc(f.name)}${req}</label><input type="${t}" data-fid="${id}" value="${esc(value)}"${f.type === 'number' ? ' step="any"' : ''}></div>`;
    }
  }
}

export function orderFormPage(ctx: Ctx): PageResult {
  if (!draft || draftFor !== ctx.id) {
    if (ctx.id) {
      const o = getOrder(ctx.id);
      draft = o
        ? { id: o.id, orderNumber: o.orderNumber, customerData: { ...o.customerData }, items: o.items.map((i) => ({ ...i })), paymentStatus: o.paymentStatus, sheetRow: o.sheetRow, createdAt: o.createdAt, labelPrinted: o.labelPrinted }
        : freshDraft();
    } else {
      draft = freshDraft();
    }
    draftFor = ctx.id;
  }
  const d = draft;
  const fields = getFields();
  const total = d.items.reduce((s, i) => s + i.price * i.qty, 0);

  const itemsRows = d.items
    .map(
      (i, idx) => `<tr>
        <td><div class="strong">${esc(i.name)}</div>${i.sku ? `<div class="muted" style="font-size:11px">${esc(i.sku)}</div>` : ''}</td>
        <td class="num"><input class="price-input" type="number" step="any" min="0" data-price="${idx}" value="${i.price}"></td>
        <td class="num"><input class="qty-input" type="number" min="1" step="1" data-qty="${idx}" value="${i.qty}"></td>
        <td class="num strong" data-line="${idx}">${money(i.price * i.qty)}</td>
        <td class="num"><button class="btn small ghost-danger" data-rm="${idx}" title="Remove">✕</button></td>
      </tr>`
    )
    .join('');

  return {
    html: `<div class="page-head">
        <div>
          <h2 class="page-title">${d.id ? 'Edit Order' : 'New Order'}</h2>
          <div class="page-sub">Order <span class="ordnum">${esc(d.orderNumber)}</span>${d.sheetRow ? ` · updates spreadsheet row ${d.sheetRow}` : ''}</div>
        </div>
        <div class="head-actions"><div><label class="f">Order Number</label><input type="text" class="mini-input" data-onum value="${esc(d.orderNumber)}" title="You can set a manual order number"></div></div>
      </div>
      <div class="card">
        <div class="card-title">Customer Details</div>
        ${fields.length === 0 ? `<div class="muted">No custom fields yet — create them in <b>Custom Fields</b>. They become your spreadsheet columns.</div>` : `<div class="fgrid">${fields.map((f) => fieldInput(f, d.customerData[f.id] || '')).join('')}</div>`}
      </div>
      <div class="card">
        <div class="card-title">Products</div>
        ${
          d.items.length === 0
            ? `<div class="muted" style="margin-bottom:10px">No products added yet.</div>`
            : `<div class="tblwrap" style="border:0;margin-bottom:10px"><table class="tbl items-tbl"><thead><tr><th>Product</th><th class="num">Price (₹)</th><th class="num">Qty</th><th class="num">Total</th><th></th></tr></thead><tbody>${itemsRows}</tbody></table></div>`
        }
        <button class="btn" data-act="addprod">+ Add Product</button>
      </div>
      <div class="card">
        <div class="savebar">
          <div class="paywrap">Payment
            <select data-pay style="width:150px">${PAYMENT_STATUSES.map((p) => `<option ${p === d.paymentStatus ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
          <div class="spacer"></div>
          <div class="totline">Total&nbsp; <b data-total>${money(total)}</b></div>
        </div>
      </div>
      <div class="form-foot">
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn primary" data-act="save">${d.id ? 'Update Order' : 'Save Order'}</button>
      </div>`,
    bind(root) {
      const d2 = draft!;
      // customer fields
      root.querySelectorAll('[data-fid]').forEach((el) => {
        const fid = (el as HTMLInputElement).dataset.fid!;
        const ev = el.tagName === 'SELECT' || (el as HTMLInputElement).type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(ev, () => {
          const i = el as HTMLInputElement;
          d2.customerData[fid] = i.type === 'checkbox' ? (i.checked ? 'Yes' : '') : i.value;
          i.classList.remove('invalid');
        });
      });
      // order number (manual allowed)
      root.querySelector('[data-onum]')?.addEventListener('input', (e) => {
        d2.orderNumber = (e.target as HTMLInputElement).value;
        root.querySelector('.ordnum')!.textContent = d2.orderNumber;
      });
      // payment
      root.querySelector('[data-pay]')?.addEventListener('change', (e) => {
        d2.paymentStatus = (e.target as HTMLSelectElement).value as PaymentStatus;
      });
      // qty / price live updates
      const upd = (idx: number) => {
        const it = d2.items[idx];
        const line = root.querySelector(`[data-line="${idx}"]`);
        if (line) line.textContent = money(it.price * it.qty);
        const tot = root.querySelector('[data-total]');
        if (tot) tot.textContent = money(d2.items.reduce((s, i) => s + i.price * i.qty, 0));
      };
      root.querySelectorAll('[data-qty]').forEach((el) =>
        el.addEventListener('input', () => {
          const idx = Number((el as HTMLInputElement).dataset.qty);
          d2.items[idx].qty = Math.max(1, Math.floor(Number((el as HTMLInputElement).value) || 1));
          upd(idx);
        })
      );
      root.querySelectorAll('[data-price]').forEach((el) =>
        el.addEventListener('input', () => {
          const idx = Number((el as HTMLInputElement).dataset.price);
          d2.items[idx].price = Math.max(0, Number((el as HTMLInputElement).value) || 0);
          upd(idx);
        })
      );
      // remove item
      root.querySelectorAll('[data-rm]').forEach((el) =>
        el.addEventListener('click', () => {
          d2.items.splice(Number((el as HTMLElement).dataset.rm), 1);
          ctx.rerender();
        })
      );
      // add product modal
      root.querySelector('[data-act="addprod"]')?.addEventListener('click', () => {
        const products = getProducts().filter((p) => p.active);
        if (products.length === 0) {
          toast('No active products. Add some in the Products page first.', 'err');
          return;
        }
        const m = modal(
          `<h3>Add Product</h3>
           <input type="text" placeholder="Search products…" data-search style="margin-bottom:8px">
           <div class="plist" data-list></div>
           <div class="row"><button class="btn" data-close>Close</button></div>`,
          (el, close) => {
            const list = el.querySelector('[data-list]') as HTMLElement;
            const search = el.querySelector('[data-search]') as HTMLInputElement;
            const renderList = () => {
              const q = search.value.trim().toLowerCase();
              const items = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
              list.innerHTML =
                items.length === 0
                  ? `<div class="muted" style="padding:10px">No products found.</div>`
                  : items
                      .map((p) => {
                        const added = d2.items.some((i) => i.productId === p.id);
                        return `<button data-pid="${p.id}" ${added ? 'disabled' : ''}><span class="strong">${esc(p.name)}</span><span class="muted">${esc(p.sku)}</span><span class="p-price">${money(p.price)}</span></button>`;
                      })
                      .join('');
            };
            renderList();
            search.addEventListener('input', renderList);
            search.focus();
            list.addEventListener('click', (e) => {
              const btn = (e.target as HTMLElement).closest('[data-pid]') as HTMLElement | null;
              if (!btn || btn.hasAttribute('disabled')) return;
              const p = products.find((x) => x.id === btn.dataset.pid)!;
              d2.items.push({ productId: p.id, name: p.name, sku: p.sku, price: p.price, qty: 1 });
              close();
              ctx.rerender();
            });
            el.querySelector('[data-close]')!.addEventListener('click', close);
          }
        );
        void m;
      });
      // cancel
      root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
        draft = null;
        draftFor = null;
        ctx.go('orders');
      });
      // save
      root.querySelector('[data-act="save"]')?.addEventListener('click', () => void save(ctx, root));
    },
  };
}

async function save(ctx: Ctx, root: HTMLElement): Promise<void> {
  const d = draft!;
  const fields = getFields();
  const errors: string[] = [];

  if (!d.orderNumber.trim()) errors.push('Order number is required.');
  for (const f of fields) {
    const v = (d.customerData[f.id] || '').trim();
    const input = root.querySelector(`[data-fid="${f.id}"]`) as HTMLElement | null;
    if (f.required && !v) {
      errors.push(`${f.name} is required.`);
      input?.classList.add('invalid');
    } else if (v && f.type === 'phone' && !isValidPhone(v)) {
      errors.push(`${f.name}: enter a valid phone number.`);
      input?.classList.add('invalid');
    } else if (v && f.type === 'email' && !isValidEmail(v)) {
      errors.push(`${f.name}: enter a valid email address.`);
      input?.classList.add('invalid');
    } else if (v && f.type === 'number' && Number.isNaN(Number(v))) {
      errors.push(`${f.name} must be a number.`);
      input?.classList.add('invalid');
    }
  }
  if (d.items.length === 0) errors.push('Add at least one product.');
  for (const it of d.items) {
    if (!(it.qty >= 1) || !Number.isInteger(it.qty)) errors.push(`Quantity for ${it.name} must be a whole number (at least 1).`);
    if (!(it.price >= 0)) errors.push(`Price for ${it.name} is invalid.`);
  }
  if (errors.length > 0) {
    toast(errors[0], 'err');
    return;
  }

  // Duplicate protection — local first
  const dup = findByNumber(d.orderNumber);
  if (dup && dup.id !== d.id) {
    modal(
      `<h3>Order already exists.</h3>
       <p class="muted" style="margin:0"><b>${esc(d.orderNumber)}</b> already exists on this device.</p>
       <div class="row" style="justify-content:flex-start">
         <button class="btn" data-open>Open Order</button>
         <button class="btn" data-edit>Edit Order</button>
         <button class="btn" data-x>Cancel</button>
       </div>`,
      (el, close) => {
        el.querySelector('[data-open]')!.addEventListener('click', () => {
          draft = null;
          draftFor = null;
          close();
          ctx.go('label', dup.id);
        });
        el.querySelector('[data-edit]')!.addEventListener('click', () => {
          draft = null;
          draftFor = null;
          close();
          ctx.go('new', dup.id);
        });
        el.querySelector('[data-x]')!.addEventListener('click', close);
      }
    );
    return;
  }

  // Duplicate protection — spreadsheet
  if (!d.id && getSettings().sheetId) {
    try {
      if (await sheetHasOrder(d.orderNumber.trim())) {
        modal(
          `<h3>Order already exists.</h3>
           <p class="muted" style="margin:0"><b>${esc(d.orderNumber)}</b> is already used in your spreadsheet.</p>
           <div class="row" style="justify-content:flex-start">
             <button class="btn primary" data-next>Use Next Number</button>
             <button class="btn" data-x>Cancel</button>
           </div>`,
          (el, close) => {
            el.querySelector('[data-next]')!.addEventListener('click', async () => {
              close();
              await bumpOrderNumber();
              d.orderNumber = nextOrderNumber();
              const inp = root.querySelector('[data-onum]') as HTMLInputElement;
              if (inp) inp.value = d.orderNumber;
              const span = root.querySelector('.ordnum');
              if (span) span.textContent = d.orderNumber;
              toast(`Switched to ${d.orderNumber}.`);
            });
            el.querySelector('[data-x]')!.addEventListener('click', close);
          }
        );
        return;
      }
    } catch (e) {
      toast(msg(e), 'err');
      return;
    }
  }

  // Build + save locally
  const now = new Date().toISOString();
  const order: Order = {
    id: d.id || uid('o_'),
    orderNumber: d.orderNumber.trim(),
    customerData: { ...d.customerData },
    items: d.items.map((i) => ({ ...i })),
    paymentStatus: d.paymentStatus,
    total: d.items.reduce((s, i) => s + i.price * i.qty, 0),
    createdAt: d.createdAt || now,
    updatedAt: now,
    labelPrinted: d.labelPrinted || false,
    sheetRow: d.sheetRow,
  };
  const isNew = !d.id;
  await saveOrder(order);

  // Sync to Google Sheets (one row) — local save is kept even if this fails
  let syncErr = '';
  if (getSettings().sheetId) {
    try {
      order.sheetRow = await syncOrder(order);
      await saveOrder(order);
    } catch (e) {
      syncErr = msg(e);
    }
  }

  if (isNew && d.orderNumber === nextOrderNumber()) await bumpOrderNumber();
  draft = null;
  draftFor = null;
  toast(isNew ? 'Order saved successfully.' : 'Order updated successfully.', 'ok');
  if (syncErr) toast('Saved on this device. Google Sheets: ' + syncErr, 'err');
  ctx.go('orders');
}
