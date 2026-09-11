/**
 * ReelForge — Home dashboard: overview, recent projects, style templates.
 */

import { el, icon, toast, confirmDlg, statusBadge } from '../ui.js';
import { state } from '../state.js';
import { listProjects, deleteProject, getAssetURL } from '../../../shared/core/idb.js';
import { listKB, listBrands, isLLMConfigured, isConfigured } from '../../../shared/core/storage.js';
import { STYLE_PRESETS } from '../../../shared/ai/prompts.js';
import { fmtDuration } from '../../../shared/core/utils.js';

export async function renderHome(view) {
  const [projects, kb, brands] = await Promise.all([listProjects(), listKB(), listBrands()]);
  const settings = state.settings;

  const configuredCount = ['llm', 'image', 'tts', 'video', 'lipsync', 'music']
    .filter((c) => isConfigured(c, settings)).length;

  view.append(
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', {}, 'Create AI UGC video ads'),
        el('p', {}, 'Turn a script + product photos into a realistic Instagram Reel: AI storyboard, photorealistic creator, voice-over, lip-sync, captions, music and an MP4 export.'),
      ),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', onclick: () => { location.hash = '#/new'; } }, icon('plus'), 'New UGC Video'),
      ),
    ),
  );

  // Stats
  view.append(el('div', { class: 'grid cols-4', style: { marginBottom: '24px' } },
    stat(projects.length, 'Projects'),
    stat(kb.length, 'Knowledge entries'),
    stat(brands.length, 'Brand kits'),
    stat(`${configuredCount}/6`, 'AI providers connected'),
  ));

  if (!isLLMConfigured(settings)) {
    view.append(el('div', { class: 'note warn', style: { marginBottom: '22px' } },
      '⚠ ', el('b', {}, 'Setup needed: '), 'no AI provider is connected yet. ReelForge does not fake generation — ',
      el('a', { href: '#/settings' }, 'open Settings'), ' to connect an LLM (script understanding), and optionally image, voice, lip-sync and video providers.',
    ));
  }

  // Recent projects
  const section = el('h3', { style: { margin: '26px 0 12px', fontSize: '17px' } }, 'Recent projects');
  view.append(section);
  if (!projects.length) {
    view.append(el('div', { class: 'empty' },
      el('div', { class: 'icon' }, '🎬'),
      el('h3', {}, 'No projects yet'),
      el('p', {}, 'Create your first AI UGC video: paste a script, add product photos, pick a hook and let the AI direct the reel.'),
      el('button', { class: 'btn primary', onclick: () => { location.hash = '#/new'; } }, icon('plus'), 'Create your first video'),
    ));
  } else {
    const grid = el('div', { class: 'grid cols-4' });
    for (const p of projects.slice(0, 12)) grid.append(projectCard(p));
    view.append(grid);
    if (projects.length > 12) {
      view.append(el('p', { class: 'hint', style: { marginTop: '10px' } }, `Showing 12 of ${projects.length} projects — all projects remain saved locally.`));
    }
  }

  // Templates
  view.append(el('h3', { style: { margin: '30px 0 4px', fontSize: '17px' } }, 'Start from a template'));
  view.append(el('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Templates pre-select a proven UGC style. You can change everything later.'));
  const tgrid = el('div', { class: 'grid cols-4' });
  for (const s of STYLE_PRESETS) {
    tgrid.append(el('div', {
      class: 'style-card',
      onclick: () => {
        sessionStorage.setItem('reelforge.template', s.id);
        location.hash = '#/new';
      },
    },
      el('div', { class: 'emoji' }, s.icon),
      el('b', {}, s.name),
      el('span', {}, s.description),
    ));
  }
  view.append(tgrid);
}

function stat(num, label) {
  return el('div', { class: 'card' },
    el('div', { class: 'stat-num' }, String(num)),
    el('div', { class: 'sub', style: { margin: '0' } }, label),
  );
}

function projectCard(p) {
  const total = (p.storyboard?.scenes || []).reduce((a, s) => a + (Number(s.durationSec) || 0), 0);
  const firstImg = p.storyboard?.scenes?.find((s) => s.assets?.imageAssetId)?.assets?.imageAssetId;
  const cover = el('div', { class: 'cover' }, firstImg
    ? imgFor(firstImg)
    : el('div', { class: 'ph' }, '🎬'));
  const card = el('div', { class: 'project-card' },
    cover,
    el('div', { class: 'meta' },
      el('b', {}, p.name || 'Untitled project'),
      el('span', {}, `${p.input?.productName || 'No product'} · ${total ? fmtDuration(total) : 'not storyboarded'}`),
      el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' } },
        statusBadge(p.status || 'draft'),
        el('span', { style: { fontSize: '11px', color: 'var(--faint)' } }, new Date(p.updatedAt || p.createdAt || Date.now()).toLocaleDateString()),
      ),
    ),
  );
  card.addEventListener('click', () => { location.hash = `#/project/${p.id}`; });
  card.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (await confirmDlg({ title: 'Delete project?', body: `"${p.name}" and its generated media will be permanently removed.`, okLabel: 'Delete', danger: true })) {
      await deleteProject(p.id);
      toast('Project deleted', 'success');
      location.reload();
    }
  });
  return card;
}

function imgFor(assetId) {
  const img = el('img');
  getAssetURL(assetId).then((u) => { if (u) img.src = u; });
  return img;
}
