/**
 * ReelForge — Settings: connection mode, provider configuration, defaults,
 * data management. All inputs persist to chrome.storage.local immediately.
 */

import { el, icon, toast, dropzone } from '../ui.js';
import { saveSettings, DEFAULT_SETTINGS } from '../../../shared/core/storage.js';
import { PROVIDERS, CAPABILITIES } from '../../../shared/providers/config.js';
import { testProvider } from '../../../shared/providers/test.js';
import { listVoices } from '../../../shared/providers/tts.js';
import { exportAll, importAll } from '../../../shared/core/idb.js';
import { CAPTION_STYLES } from '../../../shared/render/captions.js';
import { refreshSettings, state } from '../state.js';

export async function renderSettings(view) {
  const s = state.settings;

  const save = async () => {
    await saveSettings(s);
    await refreshSettings();
    document.dispatchEvent(new CustomEvent('rf-settings-changed'));
  };

  view.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', {}, 'Settings'),
        el('p', {}, 'Connect AI providers and set generation defaults. In backend mode, secret keys live only on your backend server (recommended). In direct mode, your own keys are stored locally in this browser profile only.'),
      ),
    ),
  );

  /* ------------------------------ connection ------------------------------ */
  const connCard = el('div', { class: 'card', style: { marginBottom: '18px' } },
    el('h3', {}, 'Connection'),
    el('p', { class: 'sub' }, 'How the extension talks to AI providers.'),
    el('div', { class: 'row', style: { marginBottom: '12px' } },
      modeBtn('direct', '🔑 Direct mode (BYO keys)', 'Keys are stored in this browser only'),
      modeBtn('backend', '🛡 Backend mode (recommended)', 'Keys live in your backend .env — extension never sees them'),
    ),
    el('div', { id: 'backend-cfg', style: { display: s.mode === 'backend' ? 'block' : 'none' } },
      field('Backend URL', urlInput()),
      field('Access token (optional, must match backend EXTENSION_TOKEN)', tokenInput()),
      el('div', { class: 'note', style: { marginBottom: '10px' } },
        'Run the bundled backend (see /backend folder in the ZIP): ', el('code', { class: 'inline' }, 'cd backend && npm install && npm start'),
        ' — it proxies provider calls and injects keys from environment variables.'),
    ),
  );
  view.append(connCard);

  function modeBtn(mode, label, sub) {
    const b = el('button', { class: `btn ${s.mode === mode ? 'primary' : ''}` }, label);
    b.addEventListener('click', async () => {
      s.mode = mode;
      await save();
      connCard.querySelectorAll('.btn').forEach((x) => x.classList.remove('primary'));
      b.classList.add('primary');
      connCard.querySelector('#backend-cfg').style.display = mode === 'backend' ? 'block' : 'none';
    });
    b.title = sub;
    return b;
  }
  function urlInput() {
    const i = el('input', { class: 'input', value: s.backend.url, placeholder: 'http://localhost:8787' });
    i.addEventListener('change', async () => { s.backend.url = i.value.trim(); await save(); toast('Backend URL saved', 'success', 1800); });
    return i;
  }
  function tokenInput() {
    const i = el('input', { class: 'input', type: 'password', value: s.backend.token, placeholder: 'optional shared secret' });
    i.addEventListener('change', async () => { s.backend.token = i.value.trim(); await save(); toast('Token saved', 'success', 1800); });
    return i;
  }

  /* ------------------------------- providers ------------------------------ */
  view.append(el('h3', { style: { margin: '6px 0 4px', fontSize: '17px' } }, 'AI Providers'));
  view.append(el('p', { class: 'hint', style: { marginBottom: '14px' } },
    'ReelForge is provider-agnostic: swap any vendor without touching the workflow. Only the LLM is required for script understanding; everything else upgrades quality.'));

  const grid = el('div', { class: 'grid cols-2' });
  for (const cap of CAPABILITIES) grid.append(providerCard(cap));
  view.append(grid);

  function providerCard(cap) {
    const cfg = s[cap.id];
    const meta = PROVIDERS[cap.id] || {};
    const card = el('div', { class: 'card' });
    card.append(
      el('div', { class: 'row', style: { marginBottom: '4px' } },
        el('h3', { style: { margin: 0, flex: 1 } }, cap.label),
        cap.required ? el('span', { class: 'badge violet' }, 'Required') : el('span', { class: 'badge gray' }, 'Optional'),
      ),
      el('p', { class: 'sub' }, cap.hint),
    );

    const sel = el('select', { class: 'input', style: { marginBottom: '10px' } },
      el('option', { value: cap.id === 'music' ? 'local' : 'none' }, cap.id === 'music' ? 'Local Procedural Generator (free, offline)' : '— None —'),
      ...Object.entries(meta).map(([id, m]) => el('option', { value: id, selected: cfg.provider === id }, m.label)),
    );
    card.append(sel);

    const body = el('div', {});
    card.append(body);
    const renderBody = () => {
      body.innerHTML = '';
      const p = cfg.provider;
      if (!p || p === 'none' || (cap.id === 'music' && p === 'local')) {
        body.append(el('p', { class: 'hint', style: { margin: '0' } },
          cap.id === 'music'
            ? 'The procedural generator composes royalty-free-style tracks offline with the Web Audio API. For premium AI music choose fal.ai, or upload your own licensed track in each project.'
            : 'Not configured. Features that need this provider will show a clear setup message instead of pretending to work.'));
        return;
      }
      const m = meta[p];
      if (m?.keyLabel && s.mode === 'direct') {
        const key = el('input', { class: 'input', type: 'password', value: cfg.apiKey || '', placeholder: `${m.keyLabel} (paste your key)` });
        key.addEventListener('change', async () => { cfg.apiKey = key.value.trim(); await save(); });
        body.append(field(`${m.keyLabel} — stored locally, never synced`, key,
          m.keyUrl ? el('a', { href: m.keyUrl, target: '_blank', rel: 'noreferrer' }, 'Get a key ↗') : null));
      }
      if (p === 'openai-compat') {
        const base = el('input', { class: 'input', value: cfg.baseUrl || '', placeholder: 'https://api.groq.com/openai/v1' });
        base.addEventListener('change', async () => { cfg.baseUrl = base.value.trim(); await save(); });
        body.append(field('Base URL (OpenAI-compatible /v1)', base));
      }
      if (m?.models?.length || m?.defaultModel) {
        const dl = el('datalist', { id: `dl-${cap.id}` }, ...(m.models || [m.defaultModel]).map((mm) => el('option', { value: mm })));
        const model = el('input', { class: 'input', list: `dl-${cap.id}`, value: cfg.model || '', placeholder: m.defaultModel || 'model id' });
        model.addEventListener('change', async () => { cfg.model = model.value.trim(); await save(); });
        body.append(field('Model', model, dl, el('span', { class: 'hint' }, `Default: ${m.defaultModel || 'provider default'} — use the model your account has access to`)));
      }
      if (cap.id === 'tts') {
        const voiceWrap = el('div', {});
        const loadVoices = el('button', {
          class: 'btn small',
          onclick: async () => {
            loadVoices.disabled = true; loadVoices.textContent = 'Loading voices…';
            try {
              const voices = await listVoices();
              voiceWrap.innerHTML = '';
              const sel2 = el('select', { class: 'input' },
                ...voices.map((v) => el('option', { value: v.id, selected: cfg.voiceId === v.id }, `${v.name}${v.labels?.gender ? ` · ${v.labels.gender}` : ''}${v.labels?.accent ? ` · ${v.labels.accent}` : ''}`)));
              sel2.addEventListener('change', async () => { cfg.voiceId = sel2.value; await save(); });
              voiceWrap.append(sel2, el('p', { class: 'hint' }, `${voices.length} voices available. Per-project voice overrides can be set when creating a video.`));
            } catch (e) {
              toast(e.message, 'error');
              loadVoices.disabled = false; loadVoices.textContent = 'Load voices';
            }
          },
        }, cfg.voiceId ? `Current voice: ${cfg.voiceId} — change` : 'Load voice list');
        body.append(field('Default voice', el('div', {}, loadVoices, voiceWrap)));
      }

      const testBtn = el('button', { class: 'btn small' }, 'Test connection');
      const result = el('span', { class: 'hint', style: { marginLeft: '10px' } });
      testBtn.addEventListener('click', async () => {
        testBtn.disabled = true; result.textContent = 'Testing…'; result.className = 'hint';
        try {
          const r = await testProvider(cap.id);
          result.textContent = `${r.ok ? '✓' : '⚠'} ${r.info}`;
          result.className = `hint ${r.ok ? 'ok' : 'warn'}`;
        } catch (e) {
          result.textContent = `✗ ${e.message}`;
          result.className = 'hint warn';
        }
        testBtn.disabled = false;
      });
      body.append(el('div', { style: { marginTop: '6px' } }, testBtn, result));
    };
    sel.addEventListener('change', async () => { cfg.provider = sel.value; await save(); renderBody(); });
    renderBody();
    return card;
  }

  /* ------------------------------- defaults ------------------------------- */
  const d = s.defaults;
  const defaultsCard = el('div', { class: 'card', style: { marginTop: '18px' } },
    el('h3', {}, 'Generation defaults'),
    el('div', { class: 'grid cols-2', style: { marginTop: '10px' } },
      field('Aspect ratio', selectInput(['9:16', '1:1', '16:9'], d.aspect, (v) => { d.aspect = v; save(); })),
      field('Render quality (width px)', selectInput(['720', '1080'], String(d.quality), (v) => { d.quality = Number(v); save(); })),
      field('FPS', selectInput(['24', '30'], String(d.fps), (v) => { d.fps = Number(v); save(); })),
      field('Caption style', selectInput(CAPTION_STYLES.map((c) => [c.id, `${c.label} — ${c.hint}`]), d.captionStyle, (v) => { d.captionStyle = v; save(); })),
      field('Voice volume', rangeInput(d.voiceVolume, 0, 1.5, 0.05, (v) => { d.voiceVolume = v; save(); })),
      field('Music volume', rangeInput(d.musicVolume, 0, 1, 0.02, (v) => { d.musicVolume = v; save(); })),
    ),
    check('Auto-duck music while the creator speaks', d.autoDucking, (v) => { d.autoDucking = v; save(); }),
    check('Transition whoosh sound effects', d.sfx !== false, (v) => { d.sfx = v; save(); }),
    check('Append brand CTA end-card to every video', d.includeCTA, (v) => { d.includeCTA = v; save(); }),
  );
  view.append(defaultsCard);

  /* --------------------------------- data --------------------------------- */
  const dataCard = el('div', { class: 'card', style: { marginTop: '18px' } },
    el('h3', {}, 'Data'),
    el('p', { class: 'sub' }, 'Projects, media, knowledge base and brand kits are stored locally in this browser (IndexedDB + chrome.storage). Export a backup to move to another machine.'),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onclick: async () => {
          const snap = await exportAll();
          const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
          const a = el('a', { href: URL.createObjectURL(blob), download: `reelforge-backup-${Date.now()}.json` });
          document.body.append(a); a.click(); a.remove();
          toast('Backup exported', 'success');
        },
      }, icon('download'), 'Export backup'),
      dropzone({
        accept: 'application/json', label: 'Import a backup file', sub: 'Restores projects + media',
        onFiles: async ([f]) => {
          try {
            const snap = JSON.parse(await f.text());
            await importAll(snap);
            toast('Backup imported — reload to see projects', 'success');
          } catch (e) { toast(`Import failed: ${e.message}`, 'error'); }
        },
      }),
      el('button', {
        class: 'btn danger',
        onclick: async () => {
          if (!confirm('Erase ALL ReelForge data in this browser (projects, media, knowledge base, settings)?')) return;
          await chrome.storage.local.clear();
          indexedDB.deleteDatabase('reelforge');
          toast('All data erased. Reloading…', 'success');
          setTimeout(() => location.reload(), 900);
        },
      }, icon('trash'), 'Erase all data'),
    ),
  );
  view.append(dataCard);

  /* --------------------------------- about -------------------------------- */
  view.append(el('div', { class: 'note', style: { marginTop: '20px' } },
    el('b', {}, 'ReelForge v1.0.0 — '), 'AI UGC Video Generator for Chrome. ',
    'Rendering (compositing, captions, music mixing, MP4 export) runs locally in your browser. Realistic humans, lip-sync and AI video clips depend on the external providers you connect — ',
    'the app never pretends a provider is available when it is not. See docs/PROVIDERS.md in the project ZIP.'));
}

/* ------------------------------- form helpers ------------------------------ */

function field(label, input, ...extra) {
  return el('label', { class: 'field' },
    el('span', {}, label),
    input,
    ...extra.filter(Boolean),
  );
}

function selectInput(options, value, onChange) {
  const sel = el('select', { class: 'input' },
    ...options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return el('option', { value: v, selected: v === value }, l);
    }));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function rangeInput(value, min, max, step, onChange) {
  const wrap = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } });
  const r = el('input', { type: 'range', min, max, step, value });
  const num = el('span', { class: 'hint', style: { minWidth: '34px', textAlign: 'right' } }, String(value));
  r.addEventListener('input', () => { num.textContent = r.value; onChange(Number(r.value)); });
  wrap.append(r, num);
  return wrap;
}

function check(label, value, onChange) {
  const c = el('input', { type: 'checkbox' });
  c.checked = !!value;
  c.addEventListener('change', () => onChange(c.checked));
  return el('label', { class: 'check-row' }, c, el('span', {}, label));
}
