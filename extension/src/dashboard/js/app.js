/**
 * ReelForge — dashboard application shell + hash router.
 */

import { el, icon, toast } from './ui.js';
import { refreshSettings, state } from './state.js';
import { isLLMConfigured } from '../../shared/core/storage.js';

import { renderHome } from './views/home.js';
import { renderNewProject } from './views/new.js';
import { renderProject } from './views/project.js';
import { renderHooks } from './views/hooks.js';
import { renderKnowledge } from './views/knowledge.js';
import { renderBrandKit } from './views/brandkit.js';
import { renderStyles } from './views/styles.js';
import { renderSettings } from './views/settings.js';

const ROUTES = {
  home: { title: 'Dashboard', render: renderHome, nav: 'home' },
  new: { title: 'New UGC Video', render: renderNewProject, nav: 'new' },
  project: { title: 'Project', render: renderProject, nav: 'projects' },
  projects: { title: 'My Projects', render: renderHome, nav: 'projects' },
  hooks: { title: 'AI Hook Studio', render: renderHooks, nav: 'hooks' },
  knowledge: { title: 'UGC Knowledge Base', render: renderKnowledge, nav: 'knowledge' },
  brand: { title: 'Brand Kit', render: renderBrandKit, nav: 'brand' },
  styles: { title: 'Video Styles', render: renderStyles, nav: 'styles' },
  settings: { title: 'Settings', render: renderSettings, nav: 'settings' },
};

/* --------------------------------- sidebar --------------------------------- */

const NAV = [
  { section: null },
  { id: 'home', icon: 'home', label: 'Dashboard', route: '#/home' },
  { id: 'new', icon: 'plus', label: 'New UGC Video', route: '#/new' },
  { id: 'projects', icon: 'folder', label: 'My Projects', route: '#/projects' },
  { section: 'AI Studio' },
  { id: 'hooks', icon: 'spark', label: 'Hook Studio', route: '#/hooks' },
  { id: 'knowledge', icon: 'book', label: 'Knowledge Base', route: '#/knowledge' },
  { id: 'brand', icon: 'palette', label: 'Brand Kit', route: '#/brand' },
  { id: 'styles', icon: 'film', label: 'Video Styles', route: '#/styles' },
  { section: 'System' },
  { id: 'settings', icon: 'gear', label: 'Settings', route: '#/settings' },
];

function buildSidebar() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = '';
  sb.append(
    el('div', { class: 'logo' },
      el('div', { class: 'logo-mark' }, el('div', { html: icon('play').innerHTML, style: { width: '15px', height: '15px', color: '#fff' } })),
      el('div', { class: 'logo-name' }, 'ReelForge', el('small', {}, 'AI UGC Studio')),
    ),
  );
  for (const item of NAV) {
    if (item.section !== undefined && item.section !== null) {
      sb.append(el('div', { class: 'nav-section' }, item.section));
      continue;
    }
    sb.append(el('div', {
      class: 'nav-item', id: `nav-${item.id}`,
      onclick: () => { location.hash = item.route; },
    }, icon(item.icon), el('span', {}, item.label)));
  }
  sb.append(el('div', { class: 'spacer' }));
  sb.append(el('div', { class: 'setup-chip', id: 'setup-chip', onclick: () => { location.hash = '#/settings'; } }));
}

export function updateSetupChip() {
  const chip = document.getElementById('setup-chip');
  if (!chip || !state.settings) return;
  const ok = isLLMConfigured(state.settings);
  chip.className = `setup-chip ${ok ? 'ok' : 'todo'}`;
  chip.innerHTML = '';
  chip.append(
    el('b', {}, ok ? '✓ AI connected' : '⚠ Finish setup'),
    el('span', {}, ok
      ? `${state.settings.mode === 'backend' ? 'Backend mode' : 'Direct mode'} · ${state.settings.llm.provider}`
      : 'Connect an AI provider to start generating'),
  );
}

/* --------------------------------- topbar --------------------------------- */

function setTopbar(title, ...actions) {
  const tb = document.getElementById('topbar');
  tb.innerHTML = '';
  tb.append(
    el('h2', {}, title),
    el('div', { class: 'grow' }),
    ...actions,
  );
}

/* --------------------------------- router --------------------------------- */

let activeViewCleanup = null;

export async function navigate() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [routeKey, param] = hash.split('/');
  const route = ROUTES[routeKey] || ROUTES.home;

  for (const item of NAV) {
    if (item.id) document.getElementById(`nav-${item.id}`)?.classList.toggle('active', item.nav === route.nav);
  }
  setTopbar(route.title);

  if (typeof activeViewCleanup === 'function') {
    try { activeViewCleanup(); } catch { /* noop */ }
  }
  activeViewCleanup = null;

  const view = document.getElementById('view');
  view.innerHTML = '';
  view.scrollTop = 0;
  const loading = el('div', { class: 'empty' }, el('div', { class: 'spinner accent', style: { width: '28px', height: '28px', borderWidth: '3px' } }));
  view.append(loading);
  try {
    await refreshSettings();
    updateSetupChip();
    const cleanup = await route.render(view, param, { setTopbar });
    activeViewCleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (err) {
    console.error('[ReelForge] view render failed:', err);
    view.innerHTML = '';
    view.append(el('div', { class: 'empty' },
      el('div', { class: 'icon' }, '⚠️'),
      el('h3', {}, 'Something went wrong'),
      el('p', {}, err.message || String(err)),
      el('button', { class: 'btn primary', onclick: () => navigate() }, 'Reload view'),
    ));
  } finally {
    loading.remove();
  }
}

export function rerender() { return navigate(); }

/* ---------------------------------- boot ----------------------------------- */

window.addEventListener('hashchange', navigate);

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar();
  if (!location.hash) location.hash = '#/home';
  navigate();
  toast('ReelForge Studio loaded', 'success', 2200);
});
