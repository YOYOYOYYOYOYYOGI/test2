/**
 * ReelForge — UGC Knowledge Base.
 *
 * A retrieval-augmented prompt system (RAG): the user saves winning scripts,
 * hooks, CTAs, structures, brand rules etc.; the most relevant entries are
 * retrieved by keyword scoring and injected into generation prompts.
 *
 * This is NOT model training — no AI model is trained or fine-tuned here.
 * The UI says so explicitly to stay honest about what the feature does.
 */

import { el, icon, toast, confirmDlg, dropzone, debounce } from '../ui.js';
import { listKB, saveKBEntry, deleteKBEntry, bumpKB, KB_TYPES, kbTypeLabel } from '../../../shared/ai/kb.js';
import { uid, escapeHtml } from '../../../shared/core/utils.js';

export async function renderKnowledge(view) {
  let entries = await listKB();
  let filterType = '';
  let query = '';

  view.append(el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'UGC Knowledge Base'),
      el('p', {}, 'Teach ReelForge what already works for your brand. Saved scripts, hooks, CTAs, rules and structures are retrieved into every new storyboard + hook generation (retrieval-augmented prompts).'),
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', id: 'kb-export' }, icon('download'), 'Export'),
      dropzone({
        accept: 'application/json,.json', label: 'Import JSON', sub: '',
        onFiles: async ([f]) => {
          try {
            const data = JSON.parse(await f.text());
            const list = Array.isArray(data) ? data : data.entries;
            if (!Array.isArray(list)) throw new Error('Expected an array of entries');
            for (const e of list) await saveKBEntry({ ...e, id: e.id || uid('kb') });
            toast(`Imported ${list.length} entries`, 'success');
            rerender();
          } catch (err) { toast(`Import failed: ${err.message}`, 'error'); }
        },
      }),
      el('button', { class: 'btn primary', id: 'kb-new' }, icon('plus'), 'Add entry'),
    ),
  ));

  view.append(el('div', { class: 'note', style: { marginBottom: '18px' } },
    'ℹ️ ', el('b', {}, 'How learning works: '), 'ReelForge does ', el('b', {}, 'not'), ' train or fine-tune any AI model. It stores your examples and rules, ranks them by relevance to the current product/script, and injects the best matches into the AI prompts — the standard RAG approach used by production AI tools.',
  ));

  const toolbar = el('div', { class: 'row', style: { marginBottom: '14px' } });
  const search = el('input', { class: 'input', placeholder: 'Search entries…', style: { maxWidth: '300px' } });
  const typeSel = el('select', { class: 'input', style: { maxWidth: '220px' } },
    el('option', { value: '' }, 'All types'),
    ...KB_TYPES.map((t) => el('option', { value: t.id }, t.label)));
  search.addEventListener('input', debounce(() => { query = search.value; paint(); }, 200));
  typeSel.addEventListener('change', () => { filterType = typeSel.value; paint(); });
  toolbar.append(search, typeSel);
  view.append(toolbar);

  const listBox = el('div', {});
  view.append(listBox);

  const doExport = () => {
    const blob = new Blob([JSON.stringify({ format: 'reelforge-kb', version: 1, entries }, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'reelforge-knowledge-base.json' });
    document.body.append(a); a.click(); a.remove();
  };
  view.querySelector('#kb-export').addEventListener('click', doExport);
  view.querySelector('#kb-new').addEventListener('click', () => editEntry(null));

  paint();

  function paint() {
    listBox.innerHTML = '';
    const q = query.toLowerCase();
    const shown = entries
      .filter((e) => (!filterType || e.type === filterType))
      .filter((e) => !q || `${e.title} ${e.content} ${(e.tags || []).join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!shown.length) {
      listBox.append(el('div', { class: 'empty' },
        el('div', { class: 'icon' }, '📚'),
        el('h3', {}, entries.length ? 'No matches' : 'Your knowledge base is empty'),
        el('p', {}, entries.length ? 'Try a different search or filter.' : 'Add winning scripts, hooks, CTAs, do/don’t rules and campaign instructions. The AI retrieves the relevant ones for every new video.'),
        el('button', { class: 'btn primary', onclick: () => editEntry(null) }, icon('plus'), 'Add your first entry'),
      ));
      return;
    }

    const grid = el('div', { class: 'grid cols-3' });
    for (const entry of shown) {
      const card = el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        el('div', { class: 'row', style: { gap: '6px' } },
          el('span', { class: 'badge cyan' }, kbTypeLabel(entry.type)),
          ...(entry.tags || []).slice(0, 2).map((t) => el('span', { class: 'badge gray' }, `#${t}`)),
        ),
        el('b', {}, entry.title || 'Untitled'),
        el('div', { style: { color: 'var(--muted)', fontSize: '12.5px', maxHeight: '110px', overflow: 'hidden' } }, entry.content),
        el('div', { class: 'row', style: { gap: '6px', marginTop: 'auto' } },
          el('span', { class: 'hint' }, `${entry.stats?.uses || 0} uses · ${entry.stats?.wins || 0} wins`),
          el('span', { style: { flex: 1 } }),
          el('button', { class: 'btn small icon', title: 'Mark as winner', onclick: async () => { await bumpKB(entry.id, 'wins'); rerender(); } }, '🏆'),
          el('button', { class: 'btn small icon', title: 'Edit', onclick: () => editEntry(entry) }, icon('edit')),
          el('button', {
            class: 'btn small icon', title: 'Delete',
            onclick: async () => {
              if (await confirmDlg({ title: 'Delete entry?', body: entry.title, okLabel: 'Delete', danger: true })) {
                await deleteKBEntry(entry.id);
                entries = await listKB();
                paint();
              }
            },
          }, icon('trash')),
        ),
      );
      grid.append(card);
    }
    listBox.append(grid);
  }

  function editEntry(existing) {
    import('../ui.js').then(({ modal }) => open(modal));
    function open(modal) {
      const typeIn = el('select', { class: 'input' },
        ...KB_TYPES.map((t) => el('option', { value: t.id, selected: existing?.type === t.id }, t.label)));
      const titleIn = el('input', { class: 'input', value: existing?.title || '', placeholder: 'e.g. Serum launch hook that got 2.1M views' });
      const contentIn = el('textarea', { class: 'input', rows: '7', placeholder: 'Paste the full script / hook / rule / instruction…' });
      contentIn.value = existing?.content || '';
      const tagsIn = el('input', { class: 'input', value: (existing?.tags || []).join(', '), placeholder: 'comma, separated, tags' });

      modal({
        title: existing ? 'Edit knowledge entry' : 'Add knowledge entry',
        content: el('div', {},
          el('label', { class: 'field' }, el('span', {}, 'Type'), typeIn),
          el('label', { class: 'field' }, el('span', {}, 'Title'), titleIn),
          el('label', { class: 'field' }, el('span', {}, 'Content'), contentIn),
          el('label', { class: 'field' }, el('span', {}, 'Tags'), tagsIn),
        ),
        footer: (close) => [
          el('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
          el('button', {
            class: 'btn primary',
            onclick: async () => {
              if (!contentIn.value.trim()) { toast('Content is required', 'warn'); return; }
              await saveKBEntry({
                id: existing?.id,
                type: typeIn.value,
                title: titleIn.value.trim() || contentIn.value.slice(0, 50),
                content: contentIn.value.trim(),
                tags: tagsIn.value.split(',').map((t) => t.trim()).filter(Boolean),
              });
              entries = await listKB();
              paint();
              close();
              toast('Entry saved — it will be retrieved into future generations', 'success');
            },
          }, 'Save entry'),
        ],
      });
    }
  }

  function rerender() {
    // simple refresh
    location.reload();
  }
}
