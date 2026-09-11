/**
 * ReelForge — Video Styles: built-in presets + user-defined custom styles.
 */

import { el, icon, toast, confirmDlg } from '../ui.js';
import { STYLE_PRESETS } from '../../../shared/ai/prompts.js';
import { listCustomStyles, saveCustomStyle, deleteCustomStyle } from '../../../shared/core/storage.js';

export async function renderStyles(view) {
  view.append(el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'Video Styles'),
      el('p', {}, 'Styles steer the AI director: pacing, camera language, lighting and scene templates. Pick a preset when creating a project, or define your own.'),
    ),
  ));

  view.append(el('h3', { style: { margin: '4px 0 12px', fontSize: '17px' } }, `Built-in presets (${STYLE_PRESETS.length})`));
  const grid = el('div', { class: 'grid cols-3' });
  for (const s of STYLE_PRESETS) {
    grid.append(el('div', { class: 'style-card' },
      el('div', { class: 'emoji' }, s.icon),
      el('b', {}, s.name),
      el('span', {}, s.description),
      el('details', { style: { marginTop: '8px' } },
        el('summary', { style: { cursor: 'pointer', fontSize: '11.5px', color: 'var(--faint)' } }, 'prompt details'),
        el('p', { style: { fontSize: '11.5px', color: 'var(--muted)', marginTop: '6px' } }, s.prompt)),
    ));
  }
  view.append(grid);

  let custom = await listCustomStyles();
  const customHead = el('div', { class: 'row', style: { margin: '28px 0 12px' } },
    el('h3', { style: { margin: 0, fontSize: '17px', flex: 1 } }, `Custom styles (${custom.length})`),
    el('button', { class: 'btn primary small', onclick: () => edit(null) }, icon('plus'), 'New custom style'));
  view.append(customHead);
  const cgrid = el('div', { class: 'grid cols-3' });
  view.append(cgrid);
  paintCustom();

  function paintCustom() {
    cgrid.innerHTML = '';
    if (!custom.length) {
      cgrid.append(el('div', { class: 'empty', style: { gridColumn: '1/-1', padding: '30px' } },
        el('h3', {}, 'No custom styles yet'),
        el('p', {}, 'Create reusable style instructions, e.g. "Mexican Spanish skincare UGC — golden hour, soft glam".')));
      return;
    }
    for (const s of custom) {
      cgrid.append(el('div', { class: 'style-card' },
        el('div', { class: 'emoji' }, '✨'),
        el('b', {}, s.name),
        el('span', {}, s.instructions),
        el('div', { class: 'row', style: { marginTop: '10px', gap: '6px' } },
          el('button', { class: 'btn small', onclick: () => edit(s) }, icon('edit'), 'Edit'),
          el('button', {
            class: 'btn small danger',
            onclick: async () => {
              if (await confirmDlg({ title: 'Delete style?', body: s.name, okLabel: 'Delete', danger: true })) {
                await deleteCustomStyle(s.id);
                custom = await listCustomStyles();
                paintCustom();
              }
            },
          }, icon('trash'), 'Delete'),
        )));
    }
  }

  function edit(existing) {
    import('../ui.js').then(({ modal }) => {
      const name = el('input', { class: 'input', value: existing?.name || '', placeholder: 'Style name' });
      const instructions = el('textarea', { class: 'input', rows: '5', placeholder: 'Style instructions for the AI director…' });
      instructions.value = existing?.instructions || '';
      modal({
        title: existing ? 'Edit custom style' : 'New custom style',
        content: el('div', {},
          el('label', { class: 'field' }, el('span', {}, 'Name'), name),
          el('label', { class: 'field' }, el('span', {}, 'Instructions'), instructions),
        ),
        footer: (close) => [
          el('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
          el('button', {
            class: 'btn primary',
            onclick: async () => {
              if (!name.value.trim()) { toast('Name required', 'warn'); return; }
              await saveCustomStyle({ id: existing?.id, name: name.value.trim(), instructions: instructions.value.trim() });
              custom = await listCustomStyles();
              paintCustom();
              close();
              toast('Custom style saved', 'success');
            },
          }, 'Save'),
        ],
      });
    });
  }
}
