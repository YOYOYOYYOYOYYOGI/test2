import { addProduct, getProducts, saveProducts } from '../services/store';
import type { Product } from '../types';
import { esc, money, uid } from '../utils';
import { confirmModal, modal, toast } from '../ui';
import type { Ctx, PageResult } from './ctx';

export function productsPage(ctx: Ctx): PageResult {
  const products = getProducts();
  return {
    html: `<div class="page-head">
        <div><h2 class="page-title">Products</h2><div class="page-sub">Select these while creating an order</div></div>
        <div class="head-actions"><button class="btn primary" data-act="add">+ Add Product</button></div>
      </div>
      ${
        products.length === 0
          ? `<div class="card"><div class="empty">No products yet.<br><button class="btn primary" data-act="add">+ Add Product</button></div></div>`
          : `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>Name</th><th>SKU</th><th class="num">Price</th><th>Active</th><th></th></tr></thead>
        <tbody>${products
          .map(
            (p) => `<tr>
          <td class="strong">${esc(p.name)}</td>
          <td class="muted">${esc(p.sku)}</td>
          <td class="num strong nowrap">${money(p.price)}</td>
          <td><label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.active ? 'checked' : ''}><i></i></label></td>
          <td><div class="rowbtns">
            <button class="btn small" data-edit="${p.id}">Edit</button>
            <button class="btn small ghost-danger" data-del="${p.id}">Delete</button>
          </div></td>
        </tr>`
          )
          .join('')}</tbody></table></div>`
      }`,
    bind(root) {
      root.querySelectorAll('[data-act="add"]').forEach((b) => b.addEventListener('click', () => void productModal(null, ctx)));
      root.querySelectorAll('[data-toggle]').forEach((el) =>
        el.addEventListener('change', async () => {
          const id = (el as HTMLInputElement).dataset.toggle!;
          const on = (el as HTMLInputElement).checked;
          await saveProducts(getProducts().map((p) => (p.id === id ? { ...p, active: on } : p)));
        })
      );
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const p = getProducts().find((x) => x.id === (b as HTMLElement).dataset.edit);
        if (p) void productModal(p, ctx);
      }));
      root.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', async () => {
          const p = getProducts().find((x) => x.id === (b as HTMLElement).dataset.del);
          if (!p) return;
          const ok = await confirmModal('Delete product?', `<b>${esc(p.name)}</b> will be removed from the product list. Existing orders are not affected.`, 'Delete');
          if (!ok) return;
          await saveProducts(getProducts().filter((x) => x.id !== p.id));
          toast('Product deleted.');
          ctx.rerender();
        })
      );
    },
  };
}

async function productModal(p: Product | null, ctx: Ctx): Promise<void> {
  modal(
    `<h3>${p ? 'Edit Product' : 'Add Product'}</h3>
     <div class="fgrid">
       <div class="field span2"><label class="f">Name <span class="req">*</span></label><input type="text" data-n value="${esc(p?.name || '')}"></div>
       <div class="field"><label class="f">SKU</label><input type="text" data-s value="${esc(p?.sku || '')}"></div>
       <div class="field"><label class="f">Price (₹)</label><input type="number" step="any" min="0" data-p value="${p?.price ?? 0}"></div>
     </div>
     <label class="checkrow"><input type="checkbox" data-a ${p?.active ?? true ? 'checked' : ''}> Active (selectable in orders)</label>
     <div class="row"><button class="btn" data-x>Cancel</button><button class="btn primary" data-save>Save</button></div>`,
    (el, close) => {
      el.querySelector('[data-x]')!.addEventListener('click', close);
      el.querySelector('[data-save]')!.addEventListener('click', async () => {
        const name = (el.querySelector('[data-n]') as HTMLInputElement).value.trim();
        const sku = (el.querySelector('[data-s]') as HTMLInputElement).value.trim();
        const price = Math.max(0, Number((el.querySelector('[data-p]') as HTMLInputElement).value) || 0);
        const active = (el.querySelector('[data-a]') as HTMLInputElement).checked;
        if (!name) {
          (el.querySelector('[data-n]') as HTMLInputElement).classList.add('invalid');
          toast('Product name is required.', 'err');
          return;
        }
        const products = getProducts();
        if (p) {
          await saveProducts(products.map((x) => (x.id === p.id ? { ...x, name, sku, price, active } : x)));
        } else {
          await saveProducts([...products, { id: uid('p_'), name, sku, price, active }]);
        }
        close();
        toast('Product saved.', 'ok');
        ctx.rerender();
      });
    }
  );
}
