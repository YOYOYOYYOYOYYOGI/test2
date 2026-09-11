/*
 * settings.js - Options page controller. Secrets are written to chrome.storage.local
 * only on explicit Save, never echoed back into the form (password inputs stay blank
 * and show a "saved" placeholder instead).
 */

import {
  PROVIDERS, UGC_STYLES, LANGUAGES, CREATOR_STYLES, VIDEO_DURATIONS,
  STORAGE_KEYS,
} from '../scripts/config.js';
import { getSettings, saveSettings } from '../scripts/storage.js';
import { testConnection, ensureActionPermissions } from '../scripts/workflow.js';
import { el, showStatus, clearStatus } from '../scripts/util.js';

const $ = (id) => document.getElementById(id);

let settings = null;

init();

async function init() {
  settings = await getSettings();
  populateStaticOptions();
  hydrate();
  bindEvents();
}

function populateStaticOptions() {
  fillSelect($('llm-provider'), PROVIDERS.llm.map((p) => [p.id, p.label]));
  fillSelect($('image-provider'), PROVIDERS.image.map((p) => [p.id, p.label]));
  fillSelect($('video-provider'), PROVIDERS.video.map((p) => [p.id, p.label]));
  fillSelect($('def-duration'), VIDEO_DURATIONS.map((d) => [String(d), `${d} seconds`]));
  fillSelect($('def-language'), LANGUAGES.map((l) => [l, l]));
  fillSelect($('def-style'), UGC_STYLES.map((s) => [s, s]));
  fillSelect($('def-creator'), CREATOR_STYLES.map((s) => [s, s]));
}

function fillSelect(select, pairs) {
  select.replaceChildren(...pairs.map(([value, label]) => el('option', { value }, label)));
}

function hydrate() {
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.checked = radio.value === settings.mode;
  });
  toggleModePanels();

  $('proxy-url').value = settings.proxyUrl || '';
  setKeyField('proxy-key', !!settings.proxyKey);

  $('llm-provider').value = settings.llm.provider;
  $('image-provider').value = settings.image.provider;
  $('video-provider').value = settings.video.provider;

  renderKindFields('llm');
  renderKindFields('image');
  renderKindFields('video');

  $('def-duration').value = String(settings.defaults.duration || 8);
  $('def-language').value = settings.defaults.language || 'English';
  $('def-style').value = settings.defaults.ugcStyle || UGC_STYLES[0];
  $('def-creator').value = settings.defaults.creatorStyle || CREATOR_STYLES[0];
  $('def-cta').value = settings.defaults.cta || '';
}

function setKeyField(id, saved) {
  const input = $(id);
  if (!input) return;
  input.value = '';
  input.placeholder = saved ? 'Saved ••••••••  (leave blank to keep)' : 'Not saved yet';
  input.dataset.cleared = '';
}

function bindEvents() {
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', toggleModePanels);
  });
  $('llm-provider').addEventListener('change', () => renderKindFields('llm'));
  $('image-provider').addEventListener('change', () => renderKindFields('image'));
  $('video-provider').addEventListener('change', () => renderKindFields('video'));

  $('btn-save').addEventListener('click', onSave);
  $('btn-test-all').addEventListener('click', () => runTest('all'));
  $('btn-test-llm').addEventListener('click', () => runTest('llm'));
  $('btn-test-image').addEventListener('click', () => runTest('image'));
  $('btn-test-video').addEventListener('click', () => runTest('video'));
  $('btn-test-proxy').addEventListener('click', () => runTest('proxy'));
  $('btn-clear-data').addEventListener('click', onClearData);
}

function toggleModePanels() {
  const mode = currentMode();
  $('panel-proxy').classList.toggle('hidden', mode !== 'proxy');
  $('panel-direct').classList.toggle('hidden', mode !== 'direct');
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.closest('.mode-option').classList.toggle('selected', radio.checked);
  });
  $('defaults-heading').textContent = mode === 'proxy' ? '3 · UGC defaults' : '5 · UGC defaults';
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'direct';
}

function catalog(kind) {
  return PROVIDERS[kind];
}

function selectedProviderId(kind) {
  return $(`${kind}-provider`).value;
}

function entryFor(kind, id) {
  return catalog(kind).find((p) => p.id === id);
}

function keyField({ id, label, savedValue }) {
  const keyInput = el('input', {
    type: 'password', id, autocomplete: 'off',
    placeholder: savedValue ? 'Saved ••••••••  (leave blank to keep)' : label,
  });
  const clearBtn = el('button', {
    class: 'btn btn-small btn-danger', type: 'button',
    onClick: () => {
      keyInput.value = '';
      keyInput.dataset.cleared = '1';
      keyInput.placeholder = 'Saved key will be removed on Save';
      keyInput.focus();
    },
  }, 'Clear saved key');
  return el('div', { class: 'field' },
    el('label', { for: id }, label),
    el('div', { class: 'key-row' }, keyInput, clearBtn),
    el('p', { class: 'field-note', text: 'Stored only in this browser (chrome.storage.local). Never synced, never printed back, and only sent to this provider\u2019s own host.' }),
  );
}

function renderLlmFields() {
  const container = $('llm-fields');
  container.replaceChildren();
  const id = selectedProviderId('llm');
  const entry = entryFor('llm', id);
  const cfg = settings.llm.providers?.[id] || {};

  if (entry.docs) container.append(el('p', { class: 'provider-docs', text: entry.docs }));

  if (!entry.secret) {
    container.append(el('p', { class: 'provider-docs', text: 'Offline mode: scripts, hooks and briefs are built locally with templates. Image and video generation still require their own providers below.' }));
    return;
  }

  // Dedicated, provider-scoped key (never shared between providers).
  container.append(keyField({
    id: 'llm-key',
    label: entry.keyLabel || `${entry.label} API key`,
    savedValue: cfg.apiKey,
  }));

  if (entry.showBaseUrl) {
    const baseInput = el('input', { type: 'url', id: 'llm-base', placeholder: entry.baseUrl });
    baseInput.value = cfg.baseUrl || entry.baseUrl || '';
    container.append(
      el('div', { class: 'field' },
        el('label', { for: 'llm-base' }, 'API endpoint (base URL)'),
        baseInput,
        el('p', { class: 'field-note', text: id === 'gemini'
          ? 'Google\u2019s documented Gemini REST endpoint. Change it only for a Google-compatible proxy.'
          : 'Pre-filled for this provider. Change it only for a self-hosted compatible API.' })),
    );
  }

  const listId = 'llm-models-list';
  const modelInput = el('input', {
    type: 'text', id: 'llm-model', list: entry.models?.length ? listId : undefined,
    placeholder: entry.models?.[0] || 'model name',
    value: cfg.model || entry.models?.[0] || '',
  });
  container.append(
    el('div', { class: 'field' },
      el('label', { for: 'llm-model' }, id === 'fal' ? 'fal any-llm model name' : 'Model'),
      modelInput,
      entry.models?.length ? el('datalist', { id: listId }, ...entry.models.map((m) => el('option', { value: m }))) : null,
      id === 'gemini'
        ? el('p', { class: 'field-note', text: 'Pick a Gemini model (stable 2.5 aliases recommended).' })
        : null),
  );
}

function renderKindFields(kind) {
  if (kind === 'llm') return renderLlmFields();

  const container = $(`${kind}-fields`);
  container.replaceChildren();
  const id = selectedProviderId(kind);
  const entry = entryFor(kind, id);
  const savedSection = settings[kind] || {};

  if (entry.docs) container.append(el('p', { class: 'provider-docs', text: entry.docs }));

  if (entry.secret) {
    container.append(keyField({
      id: `${kind}-key`,
      label: 'API key',
      savedValue: savedSection.apiKey,
    }));
  }

  // Model picker
  if (entry.models?.length) {
    const listId = `${kind}-models-list`;
    const modelInput = el('input', {
      type: 'text', id: `${kind}-model`, list: listId, placeholder: entry.models[0],
      value: savedSection.model || entry.models[0],
    });
    const dataList = el('datalist', { id: listId }, ...entry.models.map((m) => el('option', { value: m })));
    container.append(
      el('div', { class: 'field' },
        el('label', { for: `${kind}-model` }, 'Model / endpoint'),
        modelInput, dataList),
    );
  }

  if (kind === 'image' && id === 'openai') {
    const base = settings.llm.providers?.openai?.baseUrl || 'https://api.openai.com/v1';
    container.append(el('p', { class: 'field-note', text: `Uses the OpenAI endpoint configured under the language model section (${base}).` }));
  }

  if (kind === 'video') {
    const poll = el('input', { type: 'number', id: 'video-poll', min: '3', max: '30', step: '1', value: String(settings.video.pollInterval || 5) });
    container.append(
      el('div', { class: 'field' },
        el('label', { for: 'video-poll' }, 'Poll interval (seconds)'),
        poll),
    );
  }
}

/* Build the settings patch to save. Empty key inputs preserve the saved value. */
function collectPatch() {
  const mode = currentMode();
  const patch = { mode, defaults: collectDefaults() };

  if (mode === 'proxy') {
    const url = $('proxy-url').value.trim();
    if (!url) throw new Error('Enter your secure backend URL.');
    validateHttpUrl(url);
    patch.proxyUrl = url.replace(/\/+$/, '');
    const key = $('proxy-key');
    if (key.dataset.cleared) patch.proxyKey = '';
    else if (key.value.trim()) patch.proxyKey = key.value.trim();
    return patch;
  }

  const llmId = selectedProviderId('llm');
  patch.llm = { provider: llmId, providers: {} };
  patch.image = { provider: selectedProviderId('image') };
  patch.video = { provider: selectedProviderId('video') };

  // Language provider: key/model/base are stored per provider, so switching
  // never reuses one service's key for another.
  const llmProviderPatch = {};
  const llmKey = $('llm-key');
  if (llmKey) {
    if (llmKey.dataset.cleared) llmProviderPatch.apiKey = '';
    else if (llmKey.value.trim()) llmProviderPatch.apiKey = llmKey.value.trim();
  }
  const llmModel = $('llm-model');
  if (llmModel && llmModel.value.trim()) llmProviderPatch.model = llmModel.value.trim();
  const llmBase = $('llm-base');
  if (llmBase && llmBase.value.trim()) {
    validateHttpUrl(llmBase.value.trim());
    llmProviderPatch.baseUrl = llmBase.value.trim().replace(/\/+$/, '');
  }
  if (llmId !== 'local') patch.llm.providers[llmId] = llmProviderPatch;

  for (const kind of ['image', 'video']) {
    const keyInput = $(`${kind}-key`);
    if (keyInput) {
      if (keyInput.dataset.cleared) patch[kind].apiKey = '';
      else if (keyInput.value.trim()) patch[kind].apiKey = keyInput.value.trim();
    }
    const modelInput = $(`${kind}-model`);
    if (modelInput && modelInput.value.trim()) patch[kind].model = modelInput.value.trim();
  }
  const poll = $('video-poll');
  if (poll) patch.video.pollInterval = Math.min(30, Math.max(3, Number(poll.value) || 5));
  return patch;
}

function collectDefaults() {
  return {
    duration: Number($('def-duration').value) || 8,
    language: $('def-language').value,
    ugcStyle: $('def-style').value,
    creatorStyle: $('def-creator').value,
    cta: $('def-cta').value.trim(),
  };
}

/* Merge form onto saved settings WITHOUT dropping unspecified saved keys (for tests). */
function effectiveSettings() {
  const merged = structuredClone(settings);
  merged.mode = currentMode();
  merged.defaults = collectDefaults();
  if (merged.mode === 'proxy') {
    merged.proxyUrl = $('proxy-url').value.trim() || merged.proxyUrl;
    const key = $('proxy-key');
    if (key.dataset.cleared) merged.proxyKey = '';
    else if (key.value.trim()) merged.proxyKey = key.value.trim();
    return merged;
  }
  const llmId = selectedProviderId('llm');
  merged.llm.provider = llmId;
  if (llmId !== 'local') {
    const llmCfg = merged.llm.providers[llmId] || {};
    const llmKey = $('llm-key');
    if (llmKey) {
      if (llmKey.dataset.cleared) llmCfg.apiKey = '';
      else if (llmKey.value.trim()) llmCfg.apiKey = llmKey.value.trim();
    }
    const llmModel = $('llm-model');
    if (llmModel && llmModel.value.trim()) llmCfg.model = llmModel.value.trim();
    const llmBase = $('llm-base');
    if (llmBase && llmBase.value.trim()) llmCfg.baseUrl = llmBase.value.trim().replace(/\/+$/, '');
    merged.llm.providers[llmId] = llmCfg;
  }

  for (const kind of ['image', 'video']) {
    merged[kind].provider = selectedProviderId(kind);
    const keyInput = $(`${kind}-key`);
    if (keyInput) {
      if (keyInput.dataset.cleared) merged[kind].apiKey = '';
      else if (keyInput.value.trim()) merged[kind].apiKey = keyInput.value.trim();
    }
    const modelInput = $(`${kind}-model`);
    if (modelInput && modelInput.value.trim()) merged[kind].model = modelInput.value.trim();
  }
  const poll = $('video-poll');
  if (poll) merged.video.pollInterval = Math.min(30, Math.max(3, Number(poll.value) || 5));
  return merged;
}

function validateHttpUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`"${raw}" is not a valid URL.`); }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'http:' && !isLocal) throw new Error('HTTP is only allowed for localhost. Use an HTTPS URL.');
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs are supported.');
}

async function onSave() {
  const status = $('save-status');
  clearStatus(status);
  await withButton($('btn-save'), 'Saving…', async () => {
    try {
      const patch = collectPatch();
      settings = await saveSettings(patch);
      hydrate();
      showStatus(status, 'success', 'Settings saved.');
    } catch (err) {
      showStatus(status, 'error', err.message || 'Could not save settings.', err.details || '');
      throw err;
    }
  });
}

async function runTest(kind) {
  const status = $('save-status');
  clearStatus(status);
  let effective;
  try {
    effective = effectiveSettings();
  } catch (err) {
    showStatus(status, 'error', err.message);
    return;
  }
  const kinds = kind === 'all'
    ? (effective.mode === 'proxy' ? ['proxy'] : ['llm', 'image', 'video'])
    : [kind];

  for (const k of kinds) {
    const label = k === 'llm' ? 'Language' : k === 'image' ? 'Image' : k === 'video' ? 'Video' : 'Backend';
    showStatus(status, 'info', `Testing ${label} connection…`);
    try {
      if (k !== 'proxy') await ensureActionPermissions(effective, k);
      const result = k === 'proxy'
        ? await testBackendProxy(effective)
        : await testConnection(k, effective);
      showStatus(status, 'success', `${label}: ${result.message || 'connected'}.`);
    } catch (err) {
      showStatus(status, 'error', `${label} connection failed: ${err.message}`, err.details || '');
      return;
    }
  }
  if (kinds.length > 1) showStatus(status, 'success', 'All connection tests passed.');
}

async function testBackendProxy(effective) {
  await ensureActionPermissions(effective, 'llm');
  const { testBackend } = await import('../scripts/providers/proxy.js');
  return testBackend(effective.proxyUrl, effective.proxyKey, 'video');
}

async function withButton(btn, busyText, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'spinner' }), ` ${busyText}`);
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function onClearData() {
  const status = $('clear-status');
  clearStatus(status);
  await chrome.storage.local.remove([
    STORAGE_KEYS.HISTORY, STORAGE_KEYS.DRAFT, STORAGE_KEYS.JOBS,
  ]);
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('reelforge-media');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
  showStatus(status, 'success', 'History, drafts and cached videos were cleared. Keys are kept.');
}

window.__reelforgeSettings = {
  get: () => settings,
};
