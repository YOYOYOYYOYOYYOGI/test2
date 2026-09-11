/**
 * ReelForge — AI Hook Studio.
 * Generate hooks across 12 categories, reuse winning hooks from the
 * Knowledge Base, and hand a chosen hook to a new project.
 */

import { el, icon, toast, copyText } from '../ui.js';
import { generateHooks, HOOK_CATEGORIES } from '../../../shared/ai/hooks.js';
import { listKB, saveKBEntry } from '../../../shared/core/storage.js';
import { isLLMConfigured } from '../../../shared/core/storage.js';
import { state } from '../state.js';
import { uid } from '../../../shared/core/utils.js';

export async function renderHooks(view) {
  const settings = state.settings;

  view.append(el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'AI Hook Studio'),
      el('p', {}, 'The first 1–3 seconds decide whether anyone watches. Generate scroll-stopping openers across 12 proven UGC categories, then use one in a new project. Winning hooks you save to the Knowledge Base get reused in future generations.'),
    ),
  ));

  if (!isLLMConfigured(settings)) {
    view.append(el('div', { class: 'note warn' },
      '⚠ Hook generation needs an LLM provider. ', el('a', { href: '#/settings' }, 'Connect one in Settings'), '.'));
  }

  /* -------------------------------- inputs -------------------------------- */
  const prodIn = el('input', { class: 'input', placeholder: 'e.g. Radiance Vitamin C Serum' });
  const infoIn = el('textarea', { class: 'input', rows: '3', placeholder: 'Product info / key benefits (optional)' });
  const scriptIn = el('textarea', { class: 'input', rows: '4', placeholder: 'Script or message context (optional but improves hooks)' });
  const catSel = el('select', { class: 'input' },
    el('option', { value: '' }, 'All categories'),
    ...HOOK_CATEGORIES.map((c) => el('option', { value: c.id }, c.label)));
  const countSel = el('select', { class: 'input' },
    el('option', { value: '6' }, '6 hooks'), el('option', { value: '12', selected: true }, '12 hooks'), el('option', { value: '18' }, '18 hooks'));

  const results = el('div', {});

  view.append(el('div', { class: 'card', style: { maxWidth: '980px' } },
    el('div', { class: 'grid cols-2' },
      el('label', { class: 'field' }, el('span', {}, 'Product name'), prodIn),
      el('label', { class: 'field' }, el('span', {}, 'Hook category focus'), catSel),
    ),
    el('label', { class: 'field' }, el('span', {}, 'Product info'), infoIn),
    el('label', { class: 'field' }, el('span', {}, 'Script / message context'), scriptIn),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn primary',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Writing hooks…';
          results.innerHTML = '';
          try {
            const hooks = await generateHooks({
              productName: prodIn.value.trim(),
              productInfo: infoIn.value.trim(),
              script: scriptIn.value.trim(),
              count: Number(countSel.value),
            }, { categoryFilter: catSel.value || undefined });
            paintResults(hooks);
          } catch (err) {
            toast(`Hook generation failed: ${err.message}`, 'error', 8000);
          }
          btn.disabled = false; btn.innerHTML = `${icon('spark').innerHTML} Generate hooks`;
        },
      }, icon('spark'), 'Generate hooks'),
      el('label', { class: 'field', style: { margin: 0, width: '130px' } }, el('span', {}, 'How many'), countSel),
    ),
    results,
  ));

  /* ----------------------------- saved winners ---------------------------- */
  const kb = await listKB();
  const winners = kb.filter((e) => e.type === 'hook');
  view.append(el('h3', { style: { margin: '26px 0 10px', fontSize: '17px' } }, `Saved winning hooks (${winners.length})`));
  if (!winners.length) {
    view.append(el('p', { class: 'hint' }, 'Hooks you save (★) while generating are stored here and get retrieved into future hook + storyboard prompts.'));
  } else {
    const grid = el('div', { class: 'grid cols-3' });
    for (const w of winners.slice(0, 9)) {
      grid.append(el('div', { class: 'hook-card' },
        el('div', { class: 'text' }, w.content),
        el('div', { class: 'why' }, `${w.stats?.wins || 0} wins · ${w.stats?.uses || 0} uses`),
      ));
    }
    view.append(grid);
  }

  function paintResults(hooks) {
    const grid = el('div', { class: 'grid cols-2', style: { marginTop: '14px' } });
    for (const h of hooks) {
      const cat = HOOK_CATEGORIES.find((c) => c.id === h.category);
      grid.append(el('div', { class: 'hook-card' },
        el('div', { class: 'row', style: { gap: '6px' } }, el('span', { class: 'badge violet' }, cat?.label || h.category)),
        el('div', { class: 'text' }, `“${h.text}”`),
        h.visual ? el('div', { class: 'visual' }, `🎥 ${h.visual}`) : null,
        h.why ? el('div', { class: 'why' }, `💡 ${h.why}`) : null,
        el('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } },
          el('button', { class: 'btn small', title: 'Copy', onclick: () => copyText(h.text) }, icon('copy'), 'Copy'),
          el('button', {
            class: 'btn small',
            title: 'Save to Knowledge Base as a winning hook',
            onclick: async (e) => {
              await saveKBEntry({ type: 'hook', title: truncateText(h.text, 60), content: h.text, tags: [h.category, 'winning-hook'] });
              toast('Saved to Knowledge Base ✓', 'success', 2500);
              e.currentTarget.disabled = true;
            },
          }, '★ Save'),
          el('button', {
            class: 'btn small primary',
            title: 'Use this hook in a new project',
            onclick: () => {
              sessionStorage.setItem('reelforge.hook', JSON.stringify({ ...h, id: uid('hook') }));
              sessionStorage.setItem('reelforge.hookContext', JSON.stringify({ productName: prodIn.value, productInfo: infoIn.value, script: scriptIn.value }));
              location.hash = '#/new';
              toast('Hook attached — finish the wizard to build the video', 'success', 5000);
            },
          }, 'Use in project →'),
        ),
      ));
    }
    results.append(grid);
  }
}

function truncateText(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
