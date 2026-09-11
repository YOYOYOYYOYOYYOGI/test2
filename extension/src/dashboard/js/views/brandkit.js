/**
 * ReelForge — Brand Kit.
 * Brand identity (name, logo, colors, fonts, CTA, audience, voice) that is
 * saved once and automatically injected into every new project: the LLM
 * receives it as context and the renderer uses the colors/logo for the
 * CTA end-card and text accents.
 */

import { el, icon, toast, confirmDlg, dropzone, assetImg } from '../ui.js';
import { listBrands, saveBrand, deleteBrand, DEFAULT_BRAND } from '../../../shared/core/storage.js';
import { saveBlob } from '../../../shared/core/idb.js';
import { STYLE_PRESETS } from '../../../shared/ai/prompts.js';
import { OPENAI_VOICES } from '../../../shared/providers/tts.js';

export async function renderBrandKit(view) {
  let brands = await listBrands();
  let active = brands[0] || null;

  view.append(el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'Brand Kit'),
      el('p', {}, 'Saved brand kits are applied automatically to new projects: the AI writes on-brand copy, and the renderer uses your colors, logo and CTA for captions and the end-card.'),
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', id: 'brand-new' }, icon('plus'), 'New brand kit'),
    ),
  ));

  if (!brands.length) active = blank();

  const tabsRow = el('div', { class: 'row', style: { marginBottom: '16px' } });
  view.append(tabsRow);
  const formBox = el('div', {});
  view.append(formBox);

  paintTabs();
  paintForm();

  function blank() {
    return { ...JSON.parse(JSON.stringify(DEFAULT_BRAND)), colors: { ...DEFAULT_BRAND.colors }, fonts: { ...DEFAULT_BRAND.fonts }, name: '' };
  }

  function paintTabs() {
    tabsRow.innerHTML = '';
    for (const b of brands) {
      tabsRow.append(el('button', {
        class: `btn small ${active?.id === b.id ? 'primary' : ''}`,
        onclick: () => { active = b; paintTabs(); paintForm(); },
      }, b.name || 'Unnamed'));
    }
    if (brands.length) {
      tabsRow.append(el('button', {
        class: 'btn small danger',
        onclick: async () => {
          if (!(await confirmDlg({ title: 'Delete brand kit?', body: active?.name, okLabel: 'Delete', danger: true }))) return;
          await deleteBrand(active.id);
          brands = await listBrands();
          active = brands[0] || blank();
          paintTabs(); paintForm();
        },
      }, icon('trash'), 'Delete active'));
    }
  }

  function paintForm() {
    formBox.innerHTML = '';
    const b = active;

    const F = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
    const text = (key, placeholder, obj = b) => {
      const i = el('input', { class: 'input', value: obj[key] || '', placeholder });
      i.addEventListener('input', debounceSave(() => { obj[key] = i.value; }));
      return i;
    };
    const area = (key, placeholder, rows = 3) => {
      const i = el('textarea', { class: 'input', rows, placeholder });
      i.value = b[key] || '';
      i.addEventListener('input', debounceSave(() => { b[key] = i.value; }));
      return i;
    };
    const color = (key) => {
      const i = el('input', { type: 'color', class: 'input', value: b.colors[key] || '#888888' });
      i.addEventListener('input', debounceSave(() => { b.colors[key] = i.value; }));
      return i;
    };

    // logo
    const logoBox = el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } });
    const paintLogo = () => {
      logoBox.innerHTML = '';
      if (b.logoAssetId) {
        const t = el('div', { class: 'thumb', style: { width: '72px', height: '72px' } }, assetImg(b.logoAssetId));
        logoBox.append(t);
        logoBox.append(el('button', {
          class: 'btn small',
          onclick: () => { b.logoAssetId = null; save(); paintLogo(); },
        }, 'Remove'));
      } else {
        logoBox.append(dropzone({
          label: 'Upload logo', sub: 'PNG with transparency works best',
          onFiles: async ([f]) => {
            const asset = await saveBlob(f, { name: f.name, type: f.type });
            b.logoAssetId = asset.id;
            await save();
            paintLogo();
          },
        }));
      }
    };
    paintLogo();

    const styleSel = el('select', { class: 'input' },
      ...STYLE_PRESETS.map((s) => el('option', { value: s.id, selected: b.defaultStyle === s.id }, s.name)));
    styleSel.addEventListener('change', debounceSave(() => { b.defaultStyle = styleSel.value; }));

    const voiceSel = el('select', { class: 'input' },
      el('option', { value: '' }, '— Provider default —'),
      ...OPENAI_VOICES.map((v) => el('option', { value: v.id, selected: b.defaultVoice === v.id }, `${v.name} (${v.labels?.accent || 'any'})`)));
    voiceSel.addEventListener('change', debounceSave(() => { b.defaultVoice = voiceSel.value; }));

    formBox.append(el('div', { class: 'card', style: { maxWidth: '980px' } },
      el('div', { class: 'grid cols-2' },
        F('Brand name', text('name', 'e.g. GlowLab')),
        F('Website', text('website', 'https://…')),
      ),
      el('label', { class: 'field' }, el('span', {}, 'Logo'), logoBox),
      el('div', { class: 'grid cols-3' },
        F('Primary color', color('primary')),
        F('Secondary color', color('secondary')),
        F('Accent color', color('accent')),
      ),
      el('div', { class: 'grid cols-2' },
        F('Heading font (CSS stack)', (() => { const i = el('input', { class: 'input', value: b.fonts.heading || '' }); i.addEventListener('input', debounceSave(() => { b.fonts.heading = i.value; })); return i; })()),
        F('Body font (CSS stack)', (() => { const i = el('input', { class: 'input', value: b.fonts.body || '' }); i.addEventListener('input', debounceSave(() => { b.fonts.body = i.value; })); return i; })()),
      ),
      el('div', { class: 'grid cols-2' },
        F('Default CTA (spoken + end-card)', text('cta', 'e.g. Shop the link in bio')),
        F('Default UGC style', styleSel),
      ),
      F('Brand description', area('description', 'What the brand is about, tone of voice…')),
      F('Target audience', area('audience', 'e.g. women 18–30 interested in Korean skincare', 2)),
      F('Default voice', voiceSel),
      el('p', { class: 'hint' }, 'Saved automatically. New projects snapshot the selected brand kit.'),
    ));
  }

  let t;
  function debounceSave(fn) {
    return () => {
      fn();
      clearTimeout(t);
      t = setTimeout(save, 500);
    };
  }

  async function save() {
    if (!active.name && !active.description && !active.cta) return; // don't save empty drafts
    const saved = await saveBrand(active);
    if (!active.id) active = saved;
    if (!brands.find((x) => x.id === saved.id)) {
      brands.push(saved);
      paintTabs();
    }
  }

  view.querySelector('#brand-new').addEventListener('click', () => {
    active = blank();
    paintTabs();
    paintForm();
    toast('Fill in the kit — it saves automatically', 'info', 3000);
  });
}
