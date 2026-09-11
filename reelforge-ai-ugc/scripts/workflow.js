/*
 * workflow.js - High-level orchestration used by the popup. Every user-facing
 * action validates its inputs first, then talks to swappable providers, and
 * never resolves successfully with fake media.
 */

import { getSettings, requireConfig, upsertProject, listProjects, getActiveJobs, saveActiveJobs, storeVideo, getVideo } from './storage.js';
import { createProviders } from './providers/index.js';
import { fetchImageAsDataUrl } from './providers/image.js';
import { VIDEO_STATUS } from './providers/video.js';
import { requestOriginPatterns, ensureOriginPermission } from './util.js';
import { activeLlm } from './config.js';
import { ConfigurationError, ValidationError, ProviderError, toReelForgeError } from './errors.js';
import {
  productInfoMessages, extractJsonObject, mergeProductInfo,
  scriptMessages, hooksMessages, parseHooksPayload,
  buildLocalScript, buildLocalHooks, creatorImagePrompt, videoMotionPrompt, blankProduct,
} from './script-generator.js';

function falOrigins() {
  return ['https://queue.fal.run/*', 'https://fal.run/*', 'https://v3.fal.media/*', 'https://*.fal.media/*'];
}

function originPatternOf(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.protocol}//${url.host}/*`;
}

/* Host permissions for the SELECTED language provider only (keys never cross providers). */
function llmOriginPatterns(settings) {
  const { id, cfg } = activeLlm(settings);
  if (id === 'local') return [];
  if (id === 'fal') return falOrigins();
  if (id === 'gemini') {
    const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    return [originPatternOf(base)];
  }
  // OpenAI-compatible providers (openai/openrouter/groq/together)
  return cfg.baseUrl ? [originPatternOf(cfg.baseUrl)] : [];
}

/* Host permissions used by the OpenAI-compatible image/video adapters. */
function openAiMediaOrigin(settings) {
  const base = settings.llm.providers?.openai?.baseUrl || 'https://api.openai.com/v1';
  return originPatternOf(base);
}

/* Request host permission for every host the chosen workflow step may contact. */
export async function ensureActionPermissions(settings, kind) {
  const patterns = [];
  if (settings.mode === 'proxy') {
    if (settings.proxyUrl) patterns.push(originPatternOf(settings.proxyUrl));
  } else {
    if (kind === 'llm' || kind === 'all') {
      patterns.push(...llmOriginPatterns(settings));
    }
    if (kind === 'image' || kind === 'all') {
      if (settings.image.provider === 'fal') patterns.push(...falOrigins());
      if (settings.image.provider === 'openai') patterns.push(openAiMediaOrigin(settings));
    }
    if (kind === 'video' || kind === 'all') {
      if (settings.video.provider === 'fal') patterns.push(...falOrigins());
      if (settings.video.provider === 'openai') patterns.push(openAiMediaOrigin(settings));
    }
  }
  await requestOriginPatterns([...new Set(patterns)]);
}

async function providers(settings) {
  requireConfig(settings);
  return createProviders(settings);
}

/* ---------------- Text / LLM actions ---------------- */

export async function testConnection(kind, settingsArg) {
  const settings = settingsArg || await getSettings();
  await ensureActionPermissions(settings, kind === 'all' ? 'all' : kind);
  const bundle = createProviders(settings);
  if (kind === 'llm') {
    if (settings.mode === 'proxy') return bundle.llm.test();
    if (bundle.llmIsLocal) return { ok: true, message: 'Offline template mode is active — no network connection needed for scripts and hooks.' };
    return bundle.llm.test();
  }
  if (kind === 'image') return bundle.image.test();
  if (kind === 'video') return bundle.video.test();
  throw new ValidationError(`Unknown connection test: ${kind}`);
}

export async function generateProductBrief(product, settingsArg) {
  const settings = settingsArg || await getSettings();
  if (settings.mode !== 'proxy' && settings.llm.provider === 'local') {
    throw new ConfigurationError(
      'Brief generation needs a language model.',
      'Pick an LLM provider in Settings, or fill the fields manually. Offline mode can still build scripts and hooks.',
    );
  }
  if (!product.name?.trim() && !product.description?.trim()) {
    throw new ValidationError('Add at least a product name or description so the AI has something to work from.');
  }
  await ensureActionPermissions(settings, 'llm');
  const bundle = await providers(settings);
  const text = await bundle.llm.chat(productInfoMessages(product), { json: true, maxTokens: 700 });
  const generated = extractJsonObject(text);
  return mergeProductInfo(product, generated);
}

export async function generateScript(product, settingsArg) {
  const settings = settingsArg || await getSettings();
  validateProductBrief(product, { requireImage: false });
  const bundle = createProviders(settings);
  if (settings.mode !== 'proxy' && bundle.llmIsLocal) {
    return buildLocalScript({ product, defaults: settings.defaults });
  }
  await ensureActionPermissions(settings, 'llm');
  return bundle.llm.chat(scriptMessages({ product, defaults: settings.defaults }), { maxTokens: 800 });
}

export async function generateHooks(product, settingsArg) {
  const settings = settingsArg || await getSettings();
  validateProductBrief(product, { requireImage: false });
  const bundle = createProviders(settings);
  if (settings.mode !== 'proxy' && bundle.llmIsLocal) {
    return buildLocalHooks(product, 6);
  }
  await ensureActionPermissions(settings, 'llm');
  const text = await bundle.llm.chat(hooksMessages({ product, defaults: settings.defaults }), { json: true, maxTokens: 400 });
  return parseHooksPayload(text);
}

/* ---------------- Creator image ---------------- */

export async function ensureCreatorImage({ product, productImage, uploadedCreator, cachedCreator }, onProgress, settingsArg) {
  if (uploadedCreator?.dataUrl) {
    return { dataUrl: uploadedCreator.dataUrl, source: 'upload', model: null };
  }
  if (cachedCreator?.dataUrl) {
    return { dataUrl: cachedCreator.dataUrl, source: 'ai', model: cachedCreator.model || null };
  }
  const settings = settingsArg || await getSettings();
  validateProductBrief(product, { requireImage: true, productImage });
  await ensureActionPermissions(settings, 'image');
  const bundle = await providers(settings);
  onProgress?.('Designing a UGC creator image…');
  const prompt = creatorImagePrompt({ product, defaults: settings.defaults });
  const supportsReference = settings.mode === 'proxy' || settings.image.provider === 'fal';
  const result = await bundle.image.generateCreator({
    prompt,
    referenceDataUrl: supportsReference ? productImage.dataUrl : null,
  });
  let dataUrl = result.dataUrl;
  if (!dataUrl && result.url) {
    await ensureOriginPermission(result.url);
    dataUrl = await fetchImageAsDataUrl(result.url);
  }
  if (!dataUrl) throw new ProviderError('The image provider returned neither an image URL nor image data.');
  return { dataUrl, source: 'ai', model: result.model || null };
}

/* ---------------- Full video workflow ---------------- */

function validateProductBrief(product, { requireImage = true, productImage = null } = {}) {
  if (!product.name?.trim()) throw new ValidationError('Product name is required.');
  if (!product.description?.trim() && !product.benefits?.trim() && !product.problem?.trim()) {
    throw new ValidationError('Add a product description, benefits or the main problem so the script has real content.');
  }
  if (requireImage && !productImage?.dataUrl) {
    throw new ValidationError('A product image is required.', 'Upload a JPG, PNG or WEBP image of the product.');
  }
}

export class TrackingStopped extends Error {
  constructor() {
    super('Tracking stopped by the user; the provider job continues.');
    this.name = 'TrackingStopped';
  }
}

export async function generateVideoFlow({
  projectId, product, productImage, uploadedCreator, cachedCreator, scriptText,
  onProgress, settingsArg, shouldStop,
}) {
  const settings = settingsArg || await getSettings();
  validateProductBrief(product, { requireImage: true, productImage });
  if (!scriptText || !scriptText.trim()) throw new ValidationError('Write or generate a UGC script first.');

  await ensureActionPermissions(settings, 'all');
  const bundle = await providers(settings);

  // Step 1: creator image (uploaded wins; otherwise AI creates one; workflow never stalls here).
  onProgress?.('Checking creator image…');
  const creator = await ensureCreatorImage(
    { product, productImage, uploadedCreator, cachedCreator },
    onProgress,
    settings,
  );

  // Persist processing state up front so the job can resume if the popup closes.
  let project = {
    id: projectId,
    productName: product.name,
    product,
    script: scriptText,
    productThumb: productImage.dataUrl,
    creatorThumb: creator.dataUrl,
    creatorSource: creator.source,
    status: 'processing',
    videoProvider: settings.mode === 'proxy' ? 'proxy' : settings.video.provider,
    videoModel: settings.mode === 'proxy' ? 'proxy' : settings.video.model,
  };
  await upsertProject(project);

  // Step 2: submit the video job (anything from here marks the project failed instead of leaving it "processing")
  onProgress?.('Submitting video generation…');
  const motionPrompt = videoMotionPrompt({ product, scriptText, defaults: settings.defaults });
  let job;
  try {
    job = await bundle.video.submit({
      prompt: motionPrompt,
      imageDataUrl: creator.dataUrl,
      duration: settings.defaults.duration || 8,
    });
  } catch (err) {
    await upsertProject({ id: projectId, status: 'failed', error: err.message || 'Video submission failed.' });
    throw err;
  }

  const activeJobs = await getActiveJobs();
  activeJobs.push({ projectId, job, createdAt: Date.now() });
  await saveActiveJobs(activeJobs);
  await upsertProject({ id: projectId, externalJob: job });

  // Step 3: poll until finished
  let result;
  try {
    result = await pollToCompletion(bundle, job, onProgress, settings, shouldStop);
  } catch (err) {
    if (err instanceof TrackingStopped) throw err; // the provider job keeps running; project stays resumable
    await upsertProject({ id: projectId, status: 'failed', error: err.message || 'Video generation failed.' });
    await removeActiveJob(projectId);
    throw err;
  }

  // Step 4: download bytes into a blob (provider authenticated URLs handled by adapters)
  onProgress?.('Downloading finished video…');
  const media = await bundle.video.download(job, result.videoUrl).catch((err) => {
    // Keep the remote URL even if local download fails; preview can still try it.
    onProgress?.(`Could not cache video locally (${err.message}). The provider link is kept.`);
    return { blob: null, url: result.videoUrl, contentType: 'video/mp4' };
  });

  project = {
    ...project,
    status: 'completed',
    videoUrl: result.videoUrl || media.url || null,
    contentType: media.contentType,
    videoSize: media.blob?.size || null,
    completedAt: new Date().toISOString(),
  };
  if (media.blob) {
    const storage = await storeVideo(projectId, media.blob);
    project.videoCached = storage.stored;
  }
  await upsertProject(project);
  await removeActiveJob(projectId);

  return { project, job, blob: media.blob, videoUrl: result.videoUrl || media.url || null, creator };
}

export async function pollToCompletion(bundle, job, onProgress, settingsArg, shouldStop) {
  const settings = settingsArg || await getSettings();
  const intervalMs = Math.max(3, Number(settings.video?.pollInterval) || 5) * 1000;
  const maxMs = 15 * 60 * 1000; // hard stop after 15 minutes of polling
  const started = Date.now();
  let lastLog = '';
  while (Date.now() - started < maxMs) {
    if (typeof shouldStop === 'function' && shouldStop()) {
      throw new TrackingStopped();
    }
    let state;
    try {
      state = await bundle.video.poll(job);
    } catch (err) {
      // Transient polling errors should not immediately kill long jobs.
      const wrapped = toReelForgeError(err);
      if (wrapped.retryable) {
        onProgress?.(`Temporary API issue, retrying… (${wrapped.message})`);
        await sleep(intervalMs);
        continue;
      }
      throw wrapped;
    }
    if (state.status === VIDEO_STATUS.completed && state.videoUrl) {
      onProgress?.('Video finished.');
      return state;
    }
    if (state.status === VIDEO_STATUS.failed) {
      await removeActiveJobByExternalId(job.externalId);
      throw new ProviderError(state.error || 'Video generation failed on the provider side.');
    }
    if (state.log && state.log !== lastLog) {
      lastLog = state.log;
      onProgress?.(state.log);
    } else {
      onProgress?.(state.status === VIDEO_STATUS.queued ? 'Queued with the provider…' : 'Generating your video…');
    }
    await sleep(intervalMs);
  }
  throw new ProviderError('Video generation is taking longer than 15 minutes. The job is saved in history and can be resumed.', { retryable: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function removeActiveJob(projectId) {
  const jobs = await getActiveJobs();
  await saveActiveJobs(jobs.filter((j) => j.projectId !== projectId));
}
async function removeActiveJobByExternalId(externalId) {
  const jobs = await getActiveJobs();
  await saveActiveJobs(jobs.filter((j) => j.job.externalId !== externalId));
}

/* Resume polling for a job that was submitted earlier (popup was closed). */
export async function resumeJob(activeJob, onProgress, shouldStop) {
  const settings = await getSettings();
  requireConfig(settings);
  const bundle = createProviders(settings);
  let result;
  try {
    result = await pollToCompletion(bundle, activeJob.job, onProgress, settings, shouldStop);
  } catch (err) {
    if (err instanceof TrackingStopped) throw err;
    await upsertProject({ id: activeJob.projectId, status: 'failed', error: err.message || 'Video generation failed.' });
    await removeActiveJob(activeJob.projectId);
    throw err;
  }
  const media = await bundle.video.download(activeJob.job, result.videoUrl).catch(() => ({ blob: null, url: result.videoUrl }));
  const record = await upsertProject({
    id: activeJob.projectId,
    status: 'completed',
    videoUrl: result.videoUrl || media.url || null,
    contentType: media.contentType || 'video/mp4',
    videoSize: media.blob?.size || null,
    completedAt: new Date().toISOString(),
  });
  if (media.blob) await storeVideo(activeJob.projectId, media.blob).catch(() => {});
  await removeActiveJob(activeJob.projectId);
  return { project: record, blob: media.blob, videoUrl: result.videoUrl || media.url || null };
}

export async function loadProjectVideoBlob(projectId) {
  const cached = await getVideo(projectId);
  if (cached) return { blob: cached, source: 'cache' };
  return { blob: null, source: null };
}

export { blankProduct };
