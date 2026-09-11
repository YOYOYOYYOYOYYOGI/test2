/*
 * popup.js - ReelForge popup controller.
 * Plain ES modules, no frameworks, no remote code. All DOM text is set through
 * textContent / safe helpers (see scripts/util.js el()).
 */

import {
  PRODUCT_FIELDS, VIDEO_DURATIONS, SCRIPT_SECTIONS,
} from '../scripts/config.js';
import {
  getSettings, saveSettings, saveDraft, loadDraft, clearDraft,
  listProjects, getProject, upsertProject, deleteProject, getActiveJobs, newProjectId,
} from '../scripts/storage.js';
import {
  el, showStatus, clearStatus, prepareImage, bytesLabel, fileNameSafe,
  triggerDownload, drawVideoThumbnail, loadImage, httpRequest, readVideoDuration,
} from '../scripts/util.js';
import { blankProduct } from '../scripts/script-generator.js';
import {
  generateProductBrief, generateScript, generateHooks, ensureCreatorImage,
  generateVideoFlow, resumeJob, TrackingStopped, loadProjectVideoBlob,
  ensureActionPermissions,
} from '../scripts/workflow.js';
import { createProviders } from '../scripts/providers/index.js';

const $ = (id) => document.getElementById(id);

function imageLabel(image) {
  const dims = image.width && image.height ? `${image.width}×${image.height} · ` : '';
  const size = image.bytes ? `${bytesLabel(image.bytes)} · ` : '';
  const kind = (image.mimeType || 'image/jpeg').replace('image/', '').toUpperCase();
  return `${dims}${size}${kind}`;
}

const state = {
  settings: null,
  projectId: newProjectId(),
  product: blankProduct(),
  productImage: null,   // { dataUrl, width, height, mimeType, bytes, name }
  uploadedCreator: null,
  cachedCreator: null,  // { dataUrl, model }
  script: '',
  result: null,         // { blob, videoUrl, durationSec, size }
  generating: false,
  stopRequested: false,
  activeJob: null,
};

/* ------------------------------------------------------------------ */
/* Init                                                               */
/* ------------------------------------------------------------------ */

init();

async function init() {
  state.settings = await getSettings();
  buildProductFields();
  buildDurationOptions();
  const productSlot = createImageSlot({
    title: 'Upload product image',
    sub: 'JPG, JPEG, PNG or WEBP · up to 12 MB',
    onImage: (img) => { state.productImage = img; persistDraft(); },
    onClear: () => { state.productImage = null; persistDraft(); },
  });
  $('product-image-slot').append(productSlot.node);
  state.productSlot = productSlot;

  const creatorSlot = createImageSlot({
    title: 'Upload a creator / girl image (optional)',
    sub: 'Otherwise AI creates a matching creator for you',
    allowAiBadge: true,
    onImage: (img) => { state.uploadedCreator = img; state.cachedCreator = null; persistDraft(); renderCreatorAiState(); },
    onClear: () => { state.uploadedCreator = null; persistDraft(); },
  });
  $('creator-image-slot').append(creatorSlot.node);
  state.creatorSlot = creatorSlot;

  bindStaticEvents();
  wireAutosave();

  const draft = await loadDraft();
  if (draft) restoreDraft(draft);

  await refreshConfigWarning();
  await checkActiveJobs();
  setGenerationBusy(false);
}

function buildProductFields() {
  const container = $('product-fields');
  container.replaceChildren();
  for (const field of PRODUCT_FIELDS) {
    const input = field.multiline
      ? el('textarea', { rows: '2', id: `field-${field.key}`, placeholder: field.placeholder })
      : el('input', { type: 'text', id: `field-${field.key}`, placeholder: field.placeholder });
    input.dataset.key = field.key;
    container.append(
      el('div', { class: 'field' },
        el('label', { for: `field-${field.key}` }, field.label, field.required ? el('span', { class: 'req', text: '*' }) : null),
        input,
      ),
    );
  }
}

function buildDurationOptions() {
  const select = $('duration');
  select.replaceChildren(...VIDEO_DURATIONS.map((d) => el('option', { value: String(d) }, `${d} seconds`)));
  select.value = String(state.settings.defaults.duration || 8);
}

function bindStaticEvents() {
  $('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-configure').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-history').addEventListener('click', openHistory);
  $('btn-close-history').addEventListener('click', () => $('history-modal').classList.add('hidden'));
  $('history-modal').addEventListener('click', (e) => {
    if (e.target === $('history-modal')) $('history-modal').classList.add('hidden');
  });

  $('btn-generate-brief').addEventListener('click', onGenerateBrief);
  $('btn-generate-script').addEventListener('click', onGenerateScript);
  $('btn-generate-hooks').addEventListener('click', onGenerateHooks);
  $('btn-generate-creator').addEventListener('click', onGenerateCreator);
  $('btn-generate-video').addEventListener('click', onGenerateVideo);
  $('btn-cancel').addEventListener('click', onStopTracking);
  $('btn-download').addEventListener('click', onDownload);
  $('btn-regenerate').addEventListener('click', onRegenerate);
  $('btn-edit-script').addEventListener('click', () => {
    $('card-script').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('script').focus(), 250);
  });
  $('btn-new').addEventListener('click', onCreateAnother);
  $('btn-resume').addEventListener('click', onResume);

  $('duration').addEventListener('change', async (e) => {
    state.settings.defaults.duration = Number(e.target.value);
    await saveSettings({ defaults: { duration: Number(e.target.value) } });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['reelforge:settings:v1']) return;
    getSettings().then((s) => { state.settings = s; refreshConfigWarning(); });
  });
}

function wireAutosave() {
  document.getElementById('product-fields').addEventListener('input', () => {
            readProductIntoState();
    persistDraft();
  });
  $('script').addEventListener('input', () => {
    state.script = $('script').value;
    persistDraft();
  });
}

/* ------------------------------------------------------------------ */
/* Product form helpers                                              */
/* ------------------------------------------------------------------ */

function readProductIntoState() {
  for (const field of PRODUCT_FIELDS) {
    const node = $(`field-${field.key}`);
    if (node) state.product[field.key] = node.value;
  }
}

function writeProductToForm(product) {
  for (const field of PRODUCT_FIELDS) {
    const node = $(`field-${field.key}`);
    if (node) node.value = product[field.key] || '';
  }
}

/* ------------------------------------------------------------------ */
/* Image upload widget                                               */
/* ------------------------------------------------------------------ */

function createImageSlot({ title, sub, onImage, onClear, allowAiBadge = false }) {
  const input = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    style: 'display:none',
  });
  const root = el('div', {});

  function renderEmpty() {
    root.replaceChildren();
    const drop = el('div', { class: 'upload', tabindex: '0', role: 'button', 'aria-label': title },
      el('span', { class: 'upload-icon', text: '🖼' }),
      el('span', { class: 'upload-title', text: title }),
      el('span', { class: 'upload-sub', text: sub }),
      input,
    );
    const openPicker = () => input.click();
    drop.addEventListener('click', openPicker);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    });
    root.append(drop);
  }

  function renderImage(image, { ai = false } = {}) {
    root.replaceChildren();
    const box = el('div', { class: 'upload has-image' },
      el('div', { class: 'upload-preview' },
        el('img', { src: image.dataUrl, alt: 'preview' }),
        el('div', { class: 'upload-meta' },
          el('strong', { text: image.name || (ai ? 'AI-generated creator' : 'Uploaded image') }),
          el('span', { text: imageLabel(image) }),
          ai ? el('span', { class: 'ai-pill', text: `Created by AI${image.model ? ` · ${image.model}` : ''}` }) : null,
        ),
        el('div', { class: 'upload-actions' },
          el('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => input.click(), text: 'Replace' }),
          el('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: clear, text: 'Remove' }),
        ),
      ),
      input,
    );
    root.append(box);
  }

  async function handleFile(file) {
    try {
      const prepared = await prepareImage(file);
      const image = { ...prepared, name: file.name };
      renderImage(image);
      onImage?.(image);
    } catch (err) {
      renderEmpty();
      transientSlotError(root, err);
    }
  }

  function clear() {
    renderEmpty();
    input.value = '';
    onClear?.();
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });

  renderEmpty();
  return {
    node: root,
    setImage(image, opts) { if (image) renderImage(image, opts); else renderEmpty(); },
  };
}

function transientSlotError(root, err) {
  const banner = el('div', { class: 'status-banner status-error' },
    el('span', { class: 'status-icon', text: '⚠' }),
    el('div', { class: 'status-body' },
      el('div', { class: 'status-message', text: err.message || 'Invalid image' }),
      err.details ? el('div', { class: 'status-details', text: err.details }) : null));
  root.append(banner);
  setTimeout(() => banner.remove(), 6000);
}

function renderCreatorAiState() {
  if (state.uploadedCreator) {
    state.creatorSlot.setImage(state.uploadedCreator);
  } else if (state.cachedCreator) {
    state.creatorSlot.setImage({ name: 'AI-generated creator', ...state.cachedCreator }, { ai: true });
  } else {
    state.creatorSlot.setImage(null);
  }
}

/* Builds a full image record (dimensions/size) from a data URL returned by an API. */
async function creatorRecord(dataUrl, model) {
  let width = 0;
  let height = 0;
  try {
    const img = await loadImage(dataUrl);
    width = img.naturalWidth;
    height = img.naturalHeight;
  } catch { /* dimensions are cosmetic in the preview */ }
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'image/jpeg';
  const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
  return { dataUrl, width, height, mimeType: mime, bytes: Math.round(base64Length * 0.75), name: 'AI-generated creator', model: model || null };
}

/* ------------------------------------------------------------------ */
/* Button helpers                                                    */
/* ------------------------------------------------------------------ */

function withButton(btn, busyText, fn) {
  const label = btn.querySelector('.btn-label');
  const original = label ? label.textContent : '';
  btn.disabled = true;
  if (label) label.textContent = busyText;
  const spinner = el('span', { class: 'spinner' });
  btn.prepend(spinner);
  return fn().finally(() => {
    btn.disabled = false;
    if (label) label.textContent = original;
    spinner.remove();
  });
}

/* ------------------------------------------------------------------ */
/* Text generation actions                                          */
/* ------------------------------------------------------------------ */

async function onGenerateBrief() {
  readProductIntoState();
  const status = $('brief-status');
  clearStatus(status);
  try {
    await withButton($('btn-generate-brief'), 'Writing brief…', async () => {
      await ensureActionPermissions(state.settings, 'llm');
      const merged = await generateProductBrief(state.product);
      state.product = merged;
      writeProductToForm(merged);
      persistDraft();
      showStatus(status, 'success', 'Product brief completed — empty fields were filled in.');
    });
  } catch (err) {
    showStatus(status, 'error', err.message, err.details || '');
  }
}

async function onGenerateScript() {
  readProductIntoState();
  const status = $('script-status');
  clearStatus(status);
  try {
    await withButton($('btn-generate-script'), 'Writing script…', async () => {
      await ensureActionPermissions(state.settings, 'llm');
      const text = await generateScript(state.product);
      state.script = text.trim();
      $('script').value = state.script;
      persistDraft();
      showStatus(status, 'success', 'Script generated. Edit anything before generating the video.');
    });
  } catch (err) {
    showStatus(status, 'error', err.message, err.details || '');
  }
}

async function onGenerateHooks() {
  readProductIntoState();
  const status = $('script-status');
  clearStatus(status);
  const hooksBox = $('hooks');
  hooksBox.classList.remove('hidden');
  hooksBox.replaceChildren(el('div', { class: 'hint', text: 'Generating hooks…' }));
  try {
    const hooks = await withButton($('btn-generate-hooks'), 'Writing hooks…', async () => {
      await ensureActionPermissions(state.settings, 'llm');
      return generateHooks(state.product);
    });
    hooksBox.replaceChildren(...hooks.map((hook, i) =>
      el('button', {
        class: 'hook-chip',
        type: 'button',
        onClick: () => insertHook(hook),
      },
      String(hook),
      el('span', { class: 'hook-note', text: i === 0 ? 'Click to use this as the HOOK line' : 'Click to insert as the HOOK line' }))));
  } catch (err) {
    hooksBox.replaceChildren();
    hooksBox.classList.add('hidden');
    showStatus(status, 'error', err.message, err.details || '');
  }
}

function insertHook(hook) {
  readProductIntoState();
  const text = state.script || $('script').value || '';
  const labelPattern = new RegExp(`^(${SCRIPT_SECTIONS.join('|')})\\s*$`, 'm');
  let next;
  if (/^HOOK\s*$/m.test(text)) {
    next = text.replace(/(^HOOK\s*\n)([\s\S]*?)(?=^\s*(PROBLEM|SOLUTION|PRODUCT|BENEFIT|CTA)\s*$|$)/m,
      (_, head) => `${head}${hook}\n\n`);
  } else if (labelPattern.test(text)) {
    next = `HOOK\n${hook}\n\n${text}`;
  } else {
    next = text ? `${hook}\n\n${text}` : `HOOK\n${hook}`;
  }
  state.script = next.trim();
  $('script').value = state.script;
  persistDraft();
  const status = $('script-status');
  showStatus(status, 'success', `Hook inserted: “${hook}”`);
  $('card-script').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ */
/* Creator generation                                                */
/* ------------------------------------------------------------------ */

async function onGenerateCreator() {
  readProductIntoState();
  const status = $('creator-status');
  clearStatus(status);
  if (!state.productImage?.dataUrl) {
    showStatus(status, 'error', 'Upload a product image first.', 'The AI creator is generated holding/matching your product.');
    return;
  }
  try {
    await withButton($('btn-generate-creator'), 'Creating creator…', async () => {
      await ensureActionPermissions(state.settings, 'image');
      showStatus(status, 'info', 'Designing a UGC creator that matches the product…');
      const creator = await ensureCreatorImage({
        product: state.product,
        productImage: state.productImage,
        uploadedCreator: state.uploadedCreator,
        cachedCreator: null, // explicit "generate again" always makes a fresh one
      }, (msg) => showStatus(status, 'info', msg));
      state.cachedCreator = await creatorRecord(creator.dataUrl, creator.model);
      state.uploadedCreator = null;
      renderCreatorAiState();
      persistDraft();
      showStatus(status, 'success', creator.source === 'upload' ? 'Using your uploaded creator image.' : 'AI creator generated. You can regenerate or upload your own.');
    });
  } catch (err) {
    showStatus(status, 'error', err.message, err.details || '');
  }
}

/* ------------------------------------------------------------------ */
/* Video generation                                                  */
/* ------------------------------------------------------------------ */

function setProgress(on, message) {
  const box = $('progress');
  box.classList.toggle('hidden', !on);
  box.classList.toggle('indeterminate', on);
  const bar = $('progress-bar');
  bar.style.width = on ? '40%' : '4%';
  if (message) $('progress-log').textContent = message;
}

function setGenerationBusy(on) {
  state.generating = on;
  state.stopRequested = false;
  $('btn-generate-video').disabled = on;
  $('btn-cancel').classList.toggle('hidden', !on);
  document.querySelectorAll('.card .btn').forEach((b) => {
    if (!b.closest('#card-generate') && !b.closest('#card-result')) b.disabled = on;
  });
}

async function onGenerateVideo() {
  readProductIntoState();
  state.script = $('script').value;
  const status = $('video-status');
  clearStatus(status);
  $('card-result').classList.add('hidden');
  try {
    // Request host permission from the click gesture before any other async work.
    await ensureActionPermissions(state.settings, 'all');
  } catch (err) {
    showStatus(status, 'error', err.message, err.details || '');
    return;
  }
  setGenerationBusy(true);
  setProgress(true, 'Validating inputs…');
  try {
    const flow = await generateVideoFlow({
      projectId: state.projectId,
      product: state.product,
      productImage: state.productImage,
      uploadedCreator: state.uploadedCreator,
      cachedCreator: state.cachedCreator,
      scriptText: state.script,
      shouldStop: () => state.stopRequested,
    }, (msg) => {
      $('progress-log').textContent = msg;
    });
    state.result = {
      blob: flow.blob,
      videoUrl: flow.videoUrl,
      providerLabel: providerLabel(flow.project.videoProvider, flow.project.videoModel),
    };
    if (flow.creator?.source === 'ai') {
      state.cachedCreator = await creatorRecord(flow.creator.dataUrl, flow.creator.model);
      renderCreatorAiState();
    }
    await persistDraft();
    setProgress(false);
    await showResult(flow.project);
    openHistoryRefresh();
  } catch (err) {
    setProgress(false);
    if (err instanceof TrackingStopped) {
      showStatus(status, 'info', 'Tracking stopped.', 'The job continues on the provider. Use “Resume tracking” (it appears at the top) when you reopen.');
      await checkActiveJobs();
    } else {
      showStatus(status, 'error', err.message, err.details || '');
    }
  } finally {
    setGenerationBusy(false);
  }
}

function onStopTracking() {
  state.stopRequested = true;
  $('progress-log').textContent = 'Stopping local tracking…';
}

async function onResume() {
  const status = $('video-status');
  clearStatus(status);
  try {
    await ensureActionPermissions(state.settings, 'video');
  } catch (err) {
    showStatus(status, 'error', err.message, err.details || '');
    return;
  }
  const jobs = await getActiveJobs();
  const job = jobs.find((j) => j.projectId === state.projectId) || jobs[jobs.length - 1];
  if (!job) { $('resume-banner').classList.add('hidden'); return; }
  state.projectId = job.projectId;
  state.activeJob = job;
  setGenerationBusy(true);
  setProgress(true, 'Resuming…');
  try {
    const flow = await resumeJob(job, (msg) => { $('progress-log').textContent = msg; }, () => state.stopRequested);
    state.result = { blob: flow.blob, videoUrl: flow.videoUrl, providerLabel: providerLabel(flow.project.videoProvider, flow.project.videoModel) };
    setProgress(false);
    await showResult(flow.project);
    $('resume-banner').classList.add('hidden');
  } catch (err) {
    setProgress(false);
    if (err instanceof TrackingStopped) {
      showStatus(status, 'info', 'Tracking stopped; the provider job is still running.');
    } else {
      showStatus(status, 'error', err.message, err.details || '');
    }
  } finally {
    setGenerationBusy(false);
  }
}

function providerLabel(provider, model) {
  if (provider === 'proxy') return 'Secure backend';
  if (!provider) return '—';
  return model ? `${provider} · ${model}` : provider;
}

async function showResult(project) {
  const card = $('card-result');
  card.classList.remove('hidden');
  const video = $('result-video');
  let url = state.result?.videoUrl || project.videoUrl || '';
  if (state.result?.blob) {
    url = URL.createObjectURL(state.result.blob);
    state.result.objectUrl = url;
  }
  video.src = url;
  $('result-state').textContent = 'Completed';
  $('result-status').textContent = 'Completed';
  $('result-provider').textContent = state.result?.providerLabel || providerLabel(project.videoProvider, project.videoModel);
  $('result-size').textContent = project.videoSize ? bytesLabel(project.videoSize) : (state.result?.blob ? bytesLabel(state.result.blob.size) : 'remote file');
  video.onloadedmetadata = async () => {
    const d = await readVideoDuration(video);
    $('result-duration').textContent = d ? `${d.toFixed(1)} s` : 'unknown';
  };
  video.onerror = () => {
    $('result-duration').textContent = '—';
    const note = $('result-action-status');
    if (!state.result?.blob) showStatus(note, 'error', 'The provider link could not be played here.', 'Use Download, or reopen the project while the provider link is still valid.');
  };
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await maybeCaptureThumbnail(project.id, video);
}

async function maybeCaptureThumbnail(projectId, video) {
  if (!video.videoWidth) return;
  try {
    await new Promise((r) => { video.currentTime = 0.4; video.onseeked = r; setTimeout(r, 2500); });
  } catch { /* ignore */ }
  const thumb = drawVideoThumbnail(video);
  if (thumb) {
    await upsertProject({ id: projectId, thumbnail: thumb }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Result actions                                                    */
/* ------------------------------------------------------------------ */

async function onDownload() {
  const note = $('result-action-status');
  clearStatus(note);
  try {
    await ensureActionPermissions(state.settings, 'video');
    let blob = state.result?.blob;
    if (!blob) {
      const project = await getProject(state.projectId);
      const cached = await loadProjectVideoBlob(state.projectId);
      if (cached.blob) blob = cached.blob;
      if (!blob && project?.externalJob) {
        showStatus(note, 'info', 'Downloading from the provider…');
        await ensureActionPermissions(state.settings, 'video');
        const bundle = createProviders(state.settings);
        const media = await bundle.video.download(project.externalJob, project.videoUrl);
        blob = media.blob;
      }
      if (!blob && project?.videoUrl) {
        const res = await httpRequest({ method: 'GET', url: project.videoUrl, binary: true, timeoutMs: 300000 });
        if (!res.bytes || res.status < 200 || res.status >= 300) throw new Error('The provider did not return video bytes.');
        blob = new Blob([res.bytes], { type: res.contentType || 'video/mp4' });
      }
    }
    if (!blob) throw new Error('No video is available to download.');
    const ext = (blob.type || '').includes('webm') ? 'webm' : 'mp4';
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${fileNameSafe(state.product.name)}-ugc.${ext}`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showStatus(note, 'success', 'Video download started.');
  } catch (err) {
    showStatus(note, 'error', err.message, err.details || '');
  }
}

function onRegenerate() {
  $('card-result').classList.add('hidden');
  $('card-generate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  onGenerateVideo();
}

async function onCreateAnother() {
  state.projectId = newProjectId();
  state.product = blankProduct();
  state.productImage = null;
  state.uploadedCreator = null;
  state.cachedCreator = null;
  state.script = '';
  state.result = null;
  writeProductToForm(state.product);
  state.productSlot.setImage(null);
  state.creatorSlot.setImage(null);
  $('script').value = '';
  $('hooks').replaceChildren();
  $('hooks').classList.add('hidden');
  $('card-result').classList.add('hidden');
  ['brief-status', 'creator-status', 'script-status', 'video-status', 'result-action-status'].forEach((id) => clearStatus($(id)));
  await clearDraft();
  await checkActiveJobs();
  document.querySelector('.content').scrollIntoView({ behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* History                                                           */
/* ------------------------------------------------------------------ */

async function openHistory() {
  const modal = $('history-modal');
  modal.classList.remove('hidden');
  await openHistoryRefresh();
}

async function openHistoryRefresh() {
  const list = $('history-list');
  const projects = await listProjects();
  if (!projects.length) {
    list.replaceChildren(el('div', { class: 'history-empty', text: 'No videos yet. Your generated projects will appear here.' }));
    return;
  }
  list.replaceChildren(...projects.map((p) => {
    const thumb = p.thumbnail || p.creatorThumb || p.productThumb;
    const badgeClass = p.status === 'completed' ? 'badge-success' : p.status === 'processing' ? 'badge-processing' : 'badge-failed';
    return el('div', { class: 'history-item' },
      thumb
        ? el('img', { src: thumb, alt: '' })
        : el('div', { class: 'history-thumb-ph', text: '🎬' }),
      el('div', { class: 'history-main' },
        el('strong', { text: p.productName || 'Untitled product' }),
        el('div', { class: 'sub' }, new Date(p.createdAt).toLocaleString()),
        el('span', { class: `badge ${badgeClass}`, text: p.status || 'unknown' }),
      ),
      el('div', { class: 'history-actions' },
        el('button', { class: 'btn btn-small btn-secondary', onClick: () => loadProjectIntoState(p.id), text: p.status === 'processing' ? 'Resume' : 'Open' }),
        el('button', { class: 'btn btn-small btn-danger', onClick: () => removeHistoryItem(p.id), text: 'Delete' }),
      ),
    );
  }));
}

async function removeHistoryItem(id) {
  await deleteProject(id);
  await openHistoryRefresh();
  await checkActiveJobs();
}

async function loadProjectIntoState(id) {
  const p = await getProject(id);
  if (!p) return;
  $('history-modal').classList.add('hidden');
  state.projectId = id;
  if (p.product) {
    state.product = { ...blankProduct(), ...p.product };
    writeProductToForm(state.product);
  }
  state.productImage = p.productThumb ? { dataUrl: p.productThumb, name: 'product image', width: 0, height: 0, mimeType: 'image/jpeg', bytes: 0 } : null;
  state.productSlot.setImage(state.productImage);
  state.uploadedCreator = null;
  if (p.creatorThumb) {
    state.cachedCreator = { dataUrl: p.creatorThumb, model: null };
  } else {
    state.cachedCreator = null;
  }
  renderCreatorAiState();
  state.script = p.script || '';
  $('script').value = state.script;
  state.result = null;

  if (p.status === 'completed') {
    const cached = await loadProjectVideoBlob(id);
    state.result = {
      blob: cached.blob,
      videoUrl: p.videoUrl,
      providerLabel: providerLabel(p.videoProvider, p.videoModel),
    };
    await showResult(p);
  } else if (p.status === 'processing') {
    await checkActiveJobs();
  }
  persistDraft();
}

/* ------------------------------------------------------------------ */
/* Active jobs / config warning                                     */
/* ------------------------------------------------------------------ */

async function checkActiveJobs() {
  const jobs = await getActiveJobs();
  const banner = $('resume-banner');
  if (!jobs.length) {
    banner.classList.add('hidden');
    state.activeJob = null;
    return;
  }
  const job = jobs[jobs.length - 1];
  state.activeJob = job;
  const project = await getProject(job.projectId);
  $('resume-details').textContent = `${project?.productName || 'A video'} · submitted ${new Date(job.createdAt).toLocaleTimeString()}.`;
  banner.classList.remove('hidden');
}

async function refreshConfigWarning() {
  const s = state.settings;
  let missing = false;
  if (s.mode === 'proxy') {
    missing = !s.proxyUrl;
  } else {
    missing = !s.image.apiKey || !s.video.apiKey;
  }
  $('config-warning').classList.toggle('hidden', !missing);
}

/* ------------------------------------------------------------------ */
/* Draft persistence                                                 */
/* ------------------------------------------------------------------ */

let draftTimer = null;
function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    readProductIntoState();
    await saveDraft({
      projectId: state.projectId,
      product: state.product,
      productImage: state.productImage,
      uploadedCreator: state.uploadedCreator,
      cachedCreator: state.cachedCreator,
      script: state.script,
    });
  }, 400);
}

function restoreDraft(draft) {
  if (draft.projectId) state.projectId = draft.projectId;
  if (draft.product) {
    state.product = { ...blankProduct(), ...draft.product };
    writeProductToForm(state.product);
  }
  if (draft.productImage) {
    state.productImage = draft.productImage;
    state.productSlot.setImage(draft.productImage);
  }
  state.uploadedCreator = draft.uploadedCreator || null;
  state.cachedCreator = draft.cachedCreator || null;
  renderCreatorAiState();
  state.script = draft.script || '';
  $('script').value = state.script;
}

// Expose a tiny test hook for automated checks (read-only state summary).
window.__reelforge = {
  state: () => ({
    projectId: state.projectId,
    hasProductImage: !!state.productImage,
    hasCreatorUpload: !!state.uploadedCreator,
    hasCachedCreator: !!state.cachedCreator,
    scriptLength: state.script.length,
    generating: state.generating,
  }),
};
