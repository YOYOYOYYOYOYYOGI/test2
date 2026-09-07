import { getFields, saveFields } from '../services/store';
import { FIELD_TYPES } from '../constants';
import type { CustomField, FieldType } from '../types';
import { esc, uid } from '../utils';
import { confirmModal, modal, toast } from '../ui';
import type { Ctx, PageResult } from './ctx';

export function fieldsPage(ctx: Ctx): PageResult {
  const fields = getFields();
  return {
    html: `<div class="page-head">
        <div><h2 class="page-title">Custom Fields</h2><div class="page-sub">Each field becomes a spreadsheet column — every order fills one row</div></div>
        <div class="head-actions"><button class="btn primary" data-act="add">+ Add Field</button></div>
      </div>
      <div class="card">
        ${
          fields.length === 0
            ? `<div class="empty">No fields yet. Add fields like Customer Name, Phone, Address, City…<br><button class="btn primary" data-act="add">+ Add Field</button></div>`
            : `<div>${fields
                .map(
                  (f, i) => `<div class="list-row">
              <span class="muted nowrap" style="font-size:11px">${i + 1}.</span>
              <div class="grow"><span class="name">${esc(f.name)}</span>${f.required ? ' <span class="req" style="color:var(--danger);font-weight:800">*</span>' : ''}</div>
              <span class="type-badge">${f.type}</span>
              <label class="switch" title="Required"><input type="checkbox" data-req="${f.id}" ${f.required ? 'checked' : ''}><i></i></label>
              <button class="btn small icon" data-up="${f.id}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="btn small icon" data-down="${f.id}" ${i === fields.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
              <button class="btn small" data-edit="${f.id}">Edit</button>
              <button class="btn small ghost-danger" data-del="${f.id}">Delete</button>
            </div>`
                )
                .join('')}</div>`
        }
        <div class="hint">Reorder with ↑ ↓ — the order here is the order in the order form and on the label.</div>
      </div>`,
    bind(root) {
      root.querySelector('[data-act="add"]')?.addEventListener('click', () => void fieldModal(null, ctx));
      root.querySelectorAll('[data-req]').forEach((el) =>
        el.addEventListener('change', async () => {
          const id = (el as HTMLInputElement).dataset.req!;
          const on = (el as HTMLInputElement).checked;
          await saveFields(getFields().map((f) => (f.id === id ? { ...f, required: on } : f)));
        })
      );
      const move = async (id: string, dir: -1 | 1) => {
        const list = getFields();
        const i = list.findIndex((f) => f.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        await saveFields(list.map((f, k) => ({ ...f, order: k })));
        ctx.rerender();
      };
      root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => void move((b as HTMLElement).dataset.up!, -1)));
      root.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => void move((b as HTMLElement).dataset.down!, 1)));
      root.querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => {
          const f = getFields().find((x) => x.id === (b as HTMLElement).dataset.edit);
          if (f) void fieldModal(f, ctx);
        })
      );
      root.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', async () => {
          const f = getFields().find((x) => x.id === (b as HTMLElement).dataset.del);
          if (!f) return;
          const ok = await confirmModal('Delete field?', `<b>${esc(f.name)}</b> will be removed from the order form. Existing orders keep their data, and the spreadsheet column is never deleted.`, 'Delete');
          if (!ok) return;
          const rest = getFields().filter((x) => x.id !== f.id);
          await saveFields(rest.map((x, k) => ({ ...x, order: k })));
          toast('Field deleted.');
          ctx.rerender();
        })
      );
    },
  };
}

async function fieldModal(f: CustomField | null, ctx: Ctx): Promise<void> {
  modal(
    `<h3>${f ? 'Edit Field' : 'Add Field'}</h3>
     <div class="fgrid">
       <div class="field span2"><label class="f">Field name <span class="req">*</span></label><input type="text" data-n value="${esc(f?.name || '')}" placeholder="e.g. Customer Name"></div>
       <div class="field"><label class="f">Type</label><select data-t>${FIELD_TYPES.map(([v, l]) => `<option value="${v}" ${f?.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
       <div class="field"><label class="f">Required</label><label class="checkrow" style="padding:6px 0 0"><input type="checkbox" data-r ${f?.required ? 'checked' : ''}> Must be filled</label></div>
       <div class="field span2" data-optwrap style="display:${f?.type === 'dropdown' ? 'block' : 'none'}"><label class="f">Dropdown options <span class="muted">(one per line)</span></label><textarea rows="3" data-o>${esc((f?.options || []).join('\n'))}</textarea></div>
     </div>
     <div class="hint">Field names become spreadsheet column headers. Existing orders are never affected by changes here.</div>
     <div class="row"><button class="btn" data-x>Cancel</button><button class="btn primary" data-save>Save Field</button></div>`,
    (el, close) => {
      const typeSel = el.querySelector('[data-t]') as HTMLSelectElement;
      typeSel.addEventListener('change', () => {
        (el.querySelector('[data-optwrap]') as HTMLElement).style.display = typeSel.value === 'dropdown' ? 'block' : 'none';
      });
      el.querySelector('[data-x]')!.addEventListener('click', close);
      el.querySelector('[data-save]')!.addEventListener('click', async () => {
        const nameEl = el.querySelector('[data-n]') as HTMLInputElement;
        const name = nameEl.value.trim();
        const type = typeSel.value as FieldType;
        const required = (el.querySelector('[data-r]') as HTMLInputElement).checked;
        const options = (el.querySelector('[data-o]') as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!name) {
          nameEl.classList.add('invalid');
          toast('Field name is required.', 'err');
          return;
        }
        if (type === 'dropdown' && options.length === 0) {
          toast('Add at least one dropdown option.', 'err');
          return;
        }
        const dup = getFields().find((x) => x.name.trim().toLowerCase() === name.toLowerCase() && x.id !== f?.id);
        if (dup) {
          nameEl.classList.add('invalid');
          toast('A field with this name already exists.', 'err');
          return;
        }
        const fields = getFields();
        if (f) {
          await saveFields(fields.map((x) => (x.id === f.id ? { ...x, name, type, required, options: type === 'dropdown' ? options : undefined } : x)));
        } else {
          await saveFields([...fields, { id: uid('f_'), name, type, required, options: type === 'dropdown' ? options : undefined, order: fields.length }]);
        }
        close();
        toast('Field saved.', 'ok');
        ctx.rerender();
      });
    }
  );
}
