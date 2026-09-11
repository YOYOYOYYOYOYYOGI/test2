/**
 * ReelForge — UI toolkit: DOM builder, toasts, modals, dropzones, misc helpers.
 */

import { escapeHtml, uid } from '../../shared/core/utils.js';
import { getAsset, getAssetURL } from '../../shared/core/idb.js';

/** DOM builder: el('div', {class:'x', onclick: fn}, child, 'text', …) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-2.5"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor"/><path d="M12 21a9 9 0 0 0 6.4-2.6c.9-2-.6-3.4-2.4-3.4h-2.5c-1.6 0-2.6-1.6-1.8-3"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 3v18M16 3v18M3 9h18M3 15h18"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 1.8 20.2h20.4z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 4 1 2.1L18 7l-2 1-1 2-1-2-2-1 2-.9zM20 12l.7 1.4 1.3.6-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.6zM4 20l9.5-9.5m2-2L18 6"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4H5a2 2 0 0 0-2 2v11"/></svg>',
};

export function icon(name, cls = '') {
  const span = el('span', { class: `icn ${cls}`, style: { display: 'inline-flex', width: '15px', height: '15px' } });
  span.innerHTML = icons[name] || '';
  const svg = span.querySelector('svg');
  if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
  return span;
}

/* --------------------------------- toasts --------------------------------- */

export function toast(message, type = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  const t = el('div', { class: `toast ${type}` }, message);
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
  return t;
}

/* --------------------------------- modals --------------------------------- */

export function modal({ title, content, footer, wide, onClose }) {
  const root = document.getElementById('modal-root');
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => { overlay.remove(); onClose?.(); };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const box = el('div', { class: `modal ${wide ? 'wide' : ''}` },
    el('div', { class: 'modal-head' },
      el('h3', {}, title),
      el('button', { class: 'btn icon ghost', title: 'Close', onclick: close }, icon('x')),
    ),
    el('div', { class: 'modal-body' }, content),
    footer ? el('div', { class: 'modal-foot' }, footer(close)) : null,
  );
  overlay.append(box);
  root.append(overlay);
  return { close, overlay };
}

export function confirmDlg({ title = 'Are you sure?', body = '', okLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const m = modal({
      title,
      content: el('p', { style: { margin: '4px 0 0', color: 'var(--muted)' } }, body),
      footer: (close) => [
        el('button', { class: 'btn ghost', onclick: () => { settled = true; close(); resolve(false); } }, 'Cancel'),
        el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { settled = true; close(); resolve(true); } }, okLabel),
      ],
      onClose: () => { if (!settled) resolve(false); },
    });
  });
}

/* -------------------------------- progress -------------------------------- */

export function progressBar(label = '') {
  const fill = el('div', { class: 'progress-fill' });
  const lbl = el('div', { class: 'progress-label' }, el('span', {}, label), el('span.pct', {}, ''));
  const root = el('div', {}, el('div', { class: 'progress-track' }, fill), lbl);
  return {
    root,
    set(pct, text) {
      fill.style.width = `${Math.round(clamp01(pct) * 100)}%`;
      lbl.children[0].textContent = text ?? label;
      lbl.children[1].textContent = `${Math.round(clamp01(pct) * 100)}%`;
    },
    remove() { root.remove(); },
  };
}
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/* -------------------------------- uploader -------------------------------- */

export function dropzone({ accept = 'image/png,image/jpeg,image/webp', multiple = false, onFiles, label = 'Drop images here or click to browse', sub = 'JPG · PNG · WebP' }) {
  const dz = el('div', { class: 'dropzone' },
    el('div', { class: 'big' }, label),
    el('div', {}, sub),
  );
  const input = el('input', { type: 'file', accept, style: { display: 'none' }, multiple: multiple ? true : null });
  const accepted = (f) => {
    if (accept.includes('image') && f.type.startsWith('image/')) return true;
    if (accept.includes('audio') && f.type.startsWith('audio/')) return true;
    if (accept.includes('json') && (f.type === 'application/json' || f.name.endsWith('.json'))) return true;
    if (accept.includes('.txt') && (f.type === 'text/plain' || f.name.endsWith('.txt'))) return true;
    return false;
  };
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const files = [...e.dataTransfer.files].filter(accepted);
    if (files.length) onFiles(multiple ? files : [files[0]]);
    else toast('Unsupported file type for this upload', 'warn', 2500);
  });
  input.addEventListener('change', () => {
    if (input.files.length) onFiles([...input.files]);
    input.value = '';
  });
  return el('div', {}, dz, input);
}

/** Async <img> for an IndexedDB asset. */
export function assetImg(assetId, alt = '') {
  const img = el('img', { alt, style: { opacity: '0', transition: 'opacity .25s' } });
  getAssetURL(assetId).then((url) => {
    if (!url) return;
    img.onload = () => { img.style.opacity = '1'; };
    img.src = url;
  });
  return img;
}

export function validateImageFile(f) {
  if (!/\.(jpe?g|png|webp)$/i.test(f.name) && !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
    toast(`${f.name}: unsupported format. Use JPG, PNG or WebP.`, 'error');
    return false;
  }
  if (f.size > 15 * 1024 * 1024) {
    toast(`${f.name}: file is larger than 15 MB.`, 'error');
    return false;
  }
  return true;
}

/* --------------------------------- misc ----------------------------------- */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'success', 1800);
  } catch {
    toast('Could not copy', 'error', 1800);
  }
}

export function debounce(fn, ms = 300) {
  let h;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}

export function statusBadge(status) {
  const map = {
    pending: ['gray', 'Pending'],
    generating: ['cyan', 'Generating'],
    ready: ['green', 'Ready'],
    error: ['red', 'Error'],
    draft: ['gray', 'Draft'],
    storyboard: ['violet', 'Storyboard'],
    assets: ['cyan', 'Assets'],
    rendered: ['green', 'Rendered'],
  };
  const [cls, label] = map[status] || ['gray', status];
  return el('span', { class: `badge ${cls}` }, label);
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export { escapeHtml, uid };
