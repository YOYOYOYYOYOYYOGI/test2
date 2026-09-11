/**
 * ReelForge — generation pipeline orchestrator.
 *
 * Runs the real AI workflow for a project, stage by stage, persisting after
 * every step so the user can close/reopen and "continue from failed scene":
 *
 *   1. Product photo analysis (vision LLM) + optional creator analysis
 *   2. Storyboard generation (LLM + Knowledge Base + Brand Kit)
 *   3. Per-scene: voice (TTS) → image (image AI, with person/product refs)
 *      → optional AI video clip → optional lip-sync
 *   4. Background music (local synth / provider / upload)
 *   5. Final render happens client-side in render/compositor.js
 *
 * Every external call requires a properly configured provider. When a provider
 * is not configured the pipeline stops with a clear setup message — it never
 * fabricates assets.
 */

import { uid, clamp } from '../core/utils.js';
import { getAssetDataURL, saveBlob, putProject } from '../core/idb.js';
import { isConfigured, loadSettings } from '../core/storage.js';
import { chatJSON, chat } from '../providers/llm.js';
import { generateImage } from '../providers/image.js';
import { generateVideoClip } from '../providers/video.js';
import { synthesizeSpeech } from '../providers/tts.js';
import { generateLipSync } from '../providers/lipsync.js';
import { generateMusic } from '../providers/music.js';
import { generateLocalMusic, MUSIC_STYLES } from '../render/music-synth.js';
import { generateStoryboard } from '../ai/storyboard.js';
import { analyzeProductImages, isBeautyProduct } from '../ai/product.js';
import { extractVideoFrames, analyzeAudioDensity, analyzeReferenceStyle, formatReferenceContext, referenceImageFragment } from '../ai/reference.js';
import {
  compileInstructions, applyPacingToScenes, formatInstructionsContext,
  imageDirectivesFragment, voiceDirective,
} from '../ai/instructions.js';
import {
  buildCreatorPrompt, buildSceneImagePrompt, styleById,
} from '../ai/prompts.js';

/* ----------------------------- reference reel ------------------------------ */

/**
 * Analyze the uploaded reference reel (style only, anti-copy enforced).
 * Frames are extracted locally; only frames go to the user's vision provider.
 */
export async function runReferenceAnalysis(project, { signal, force } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('llm', settings)) throw setupError('llm');
  const ref = project.input.referenceReel;
  if (!ref?.assetId) throw new Error('No reference reel uploaded.');
  if (ref.analysis && !force) return project;

  const { getAsset } = await import('../core/idb.js');
  const rec = await getAsset(ref.assetId);
  if (!rec) throw new Error('Reference reel file is missing — re-upload it.');

  const { frames, durationSec, width, height } = await extractVideoFrames(rec.blob, { count: 10 });
  const audio = await analyzeAudioDensity(rec.blob);
  ref.meta = { durationSec, width, height, speechRatio: audio.speechRatio };
  ref.frames = frames.length;

  ref.analysis = await analyzeReferenceStyle(frames, { durationSec, width, height, speechRatio: audio.speechRatio }, {
    productName: project.input.productName,
    script: project.input.script,
  }, { signal });

  await putProject(project);
  return project;
}

/* --------------------------------- analysis -------------------------------- */

export async function runProductAnalysis(project, { signal } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('llm', settings)) throw setupError('llm');
  const dataURLs = [];
  for (const id of (project.input.images || []).slice(0, 4)) {
    const d = await getAssetDataURL(id);
    if (d) dataURLs.push(d);
  }
  if (!dataURLs.length) {
    project.input.productAnalysis = null;
    return project;
  }
  const analysis = await analyzeProductImages(dataURLs, {
    productName: project.input.productName,
    productInfo: project.input.productInfo,
    signal,
  });
  project.input.productAnalysis = analysis;
  project.input.beautyMode = isBeautyProduct(analysis);
  await putProject(project);
  return project;
}

/** Describe the uploaded creator with the vision LLM so prompts match her identity. */
export async function runPersonAnalysis(project, { signal } = {}) {
  const settings = await loadSettings();
  if (!project.input.personImage) return project;
  if (!isConfigured('llm', settings)) return project;
  const metaOk = ['openai', 'anthropic', 'gemini'].includes(settings.llm.provider);
  if (!metaOk) return project;
  try {
    const d = await getAssetDataURL(project.input.personImage);
    if (!d) return project;
    const res = await chatJSON({
      system: 'Describe the person in the photo for a video director. Output ONLY JSON: {"ageRange":"","gender":"","hair":"","features":"","style":"","vibe":""}',
      messages: [{ role: 'user', content: 'Describe this person precisely but respectfully.' }],
      images: [d],
      temperature: 0.2,
      maxTokens: 400,
      signal,
    });
    project.input.personInfo = [res.ageRange, res.gender, res.hair, res.features, `wearing ${res.style}`, `vibe: ${res.vibe}`]
      .filter(Boolean).join(', ');
    await putProject(project);
  } catch { /* person analysis is best-effort */ }
  return project;
}

/* -------------------------------- storyboard ------------------------------- */

export async function generateProjectStoryboard(project, { hook, signal } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('llm', settings)) throw setupError('llm');
  const sb = await generateStoryboard({
    script: project.input.script,
    productName: project.input.productName,
    productInfo: project.input.productInfo,
    brand: project.brand,
    stylePreset: project.input.stylePreset,
    customInstructions: project.input.customInstructions,
    hook: hook || project.input.selectedHook || null,
    aspect: project.input.aspect,
    durationSec: project.input.durationSec || 30,
    personInfo: project.input.personInfo || null,
    productAnalysis: project.input.productAnalysis || null,
    beautyMode: !!project.input.beautyMode,
  }, { signal });

  project.storyboard = sb;
  project.status = 'storyboard';
  await putProject(project);
  return project;
}

/* ----------------------------------- voice --------------------------------- */

const VOICE_INSTRUCTIONS = {
  'casual-friendly': 'Sound like a real young woman recording a casual social media video for her followers: warm, enthusiastic, conversational, smiling voice, natural pacing with small pauses.',
  'excited-hype': 'High energy influencer voice, excited but believable, fast pacing, like announcing a great find to a friend.',
  'calm-trust': 'Calm, warm, trustworthy voice, slower pacing, sincere recommendation energy.',
  'playful': 'Playful, bright, a little cheeky, like sharing a fun secret.',
};

export async function generateSceneVoice(project, scene, { signal, voiceId, speed, force } = {}) {
  if (!force && scene.assets?.audioAssetId) return null; // already generated (resumable)
  const settings = await loadSettings();
  if (!isConfigured('tts', settings)) throw setupError('tts');
  if (!scene.dialog?.trim()) throw new Error('This scene has no dialogue to speak.');

  const cfg = settings.tts;
  const compiled = compileInstructions(project.input.additionalInstructions);
  const style = voiceDirective(compiled, project.input.voice?.style || 'casual-friendly');
  const baseInstructions = VOICE_INSTRUCTIONS[style] || VOICE_INSTRUCTIONS['casual-friendly'];
  const instructionAddons = [];
  if (compiled.raw) instructionAddons.push(`Delivery note from the director: ${compiled.raw}`);
  const finalInstructions = cfg.provider === 'openai'
    ? [baseInstructions, ...instructionAddons].join(' ')
    : undefined;

  const { blob, mime } = await synthesizeSpeech(scene.dialog, {
    voiceId: voiceId || project.input.voice?.voiceId || cfg.voiceId || undefined,
    speed: speed ?? project.input.voice?.speed ?? 1.0,
    signal,
    voiceInstructions: finalInstructions,
  });

  const asset = await saveBlob(blob, { type: mime, name: `voice-${scene.id}` });
  if (scene.assets.audioAssetId) { /* replaced below */ }
  scene.assets.audioAssetId = asset.id;

  // Keep video timing in sync with the actual voice duration.
  const dur = await audioBlobDuration(blob);
  if (dur) scene.durationSec = Math.round(clamp(Math.max(scene.durationSec, dur + 0.45), 1.5, 12) * 10) / 10;

  scene.status = scene.assets.imageAssetId || scene.assets.videoAssetId ? 'ready' : scene.status;
  await putProject(project);
  return asset;
}

function audioBlobDuration(blob) {
  return new Promise((resolve) => {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    blob.arrayBuffer()
      .then((ab) => ac.decodeAudioData(ab))
      .then((buf) => { ac.close(); resolve(buf.duration); })
      .catch(() => { ac.close(); resolve(null); });
  });
}

/* ----------------------------------- image --------------------------------- */

function productDescription(project) {
  const a = project.input.productAnalysis;
  if (a) {
    return [
      a.appearance, a.packaging ? `Packaging: ${a.packaging}` : '',
      a.colors?.length ? `Colors: ${a.colors.join(', ')}` : '',
      a.label ? `Label: ${a.label}` : '',
    ].filter(Boolean).join('. ');
  }
  return project.input.productInfo || project.input.productName || 'the product';
}

export async function generateCreatorPortrait(project, { signal } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('image', settings)) throw setupError('image');
  const style = styleById(project.input.stylePreset);
  const prompt = [
    'Photorealistic portrait photo of a UGC content creator for social media, waist-up, looking at camera, holding',
    project.input.productName || 'a beauty product',
    'beside her face, natural soft lighting, authentic phone-camera quality, realistic skin texture.',
    style.prompt,
  ].join(' ');
  const refs = [];
  for (const pid of (project.input.images || []).slice(0, 1)) {
    const d = await getAssetDataURL(pid);
    if (d) refs.push(d);
  }
  const { blob, mime } = await generateImage({
    prompt, refs: refs.slice(0, 1), aspect: project.input.aspect || '9:16', signal,
  });
  const asset = await saveBlob(blob, { type: mime, name: 'creator-portrait' });
  project.input.personImage = asset.id;
  project.input.personAutoGenerated = true;
  await putProject(project);
  return asset;
}

export async function generateSceneImage(project, scene, { signal, promptOverride, useProductImageId, force } = {}) {
  if (!force && scene.assets?.imageAssetId) return null; // resumable
  const settings = await loadSettings();
  if (!isConfigured('image', settings)) throw setupError('image');

  const style = styleById(project.input.stylePreset);
  const creatorPrompt = buildCreatorPrompt(
    project.input.personInfo ? { description: project.input.personInfo } : null,
    `${project.input.productName} (${productDescription(project)})`
  );

  // Reference images for consistency
  const refs = [];
  const wantsPerson = scene.focus !== 'product';
  if (wantsPerson && project.input.personImage) {
    const d = await getAssetDataURL(project.input.personImage);
    if (d) refs.push(d);
  }
  const productRefId = useProductImageId || scene.productImageRef || (project.input.images || [])[0];
  if (productRefId) {
    const d = await getAssetDataURL(productRefId);
    if (d) refs.push(d);
  }

  const prompt = promptOverride || buildSceneImagePrompt({
    scene, creatorPrompt, productAnalysis: project.input.productAnalysis, style, aspect: project.input.aspect || '9:16',
  });

  scene.status = 'generating';
  await putProject(project);
  try {
    const { blob, mime, model } = await generateImage({
      prompt, refs, aspect: project.input.aspect || '9:16',
      model: scene.gen?.imageModel || undefined, signal,
    });
    const asset = await saveBlob(blob, { type: mime, name: `scene-${scene.index}` });
    scene.assets.imageAssetId = asset.id;
    scene.gen.imagePrompt = prompt;
    scene.gen.imageModel = model || null;
    scene.status = 'ready';
    scene.error = null;
  } catch (err) {
    scene.status = 'error';
    scene.error = err.message;
    throw err;
  }
  await putProject(project);
  return scene;
}

/* --------------------------------- video clip ------------------------------ */

export async function generateSceneVideo(project, scene, { signal } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('video', settings)) throw setupError('video');
  const sourceId = scene.assets.imageAssetId || scene.productImageRef;
  if (!sourceId) throw new Error('Generate the scene image first — video animation needs a starting frame.');
  const imageDataURL = await getAssetDataURL(sourceId);
  if (!imageDataURL) throw new Error('Scene image asset is missing.');

  const prompt = [
    scene.description,
    scene.cameraMove && scene.cameraMove !== 'static' ? `Camera: ${scene.cameraMove.replace('-', ' ')}.` : '',
    scene.gesture ? `Action: ${scene.gesture}` : '',
    'Realistic natural motion, keep the product packaging and the person identical to the input image, no morphing, no extra people.',
  ].filter(Boolean).join(' ');

  scene.status = 'generating';
  await putProject(project);
  try {
    const { blob, mime } = await generateVideoClip({
      prompt, imageDataURL, durationSec: scene.durationSec,
      aspect: project.input.aspect || '9:16', signal,
    });
    const asset = await saveBlob(blob, { type: mime, name: `clip-${scene.index}` });
    scene.assets.videoAssetId = asset.id;
    scene.status = 'ready';
    scene.error = null;
  } catch (err) {
    scene.status = 'error';
    scene.error = err.message;
    throw err;
  }
  await putProject(project);
  return scene;
}

/* ---------------------------------- lip-sync ------------------------------- */

export async function generateSceneLipSync(project, scene, { signal } = {}) {
  const settings = await loadSettings();
  if (!isConfigured('lipsync', settings)) throw setupError('lipsync');
  if (!scene.assets.audioAssetId) throw new Error('Generate the scene voice first — lip-sync needs the audio.');
  const faceSource = project.input.personImage || scene.assets.imageAssetId;
  if (!faceSource) throw new Error('Need a creator image (uploaded or generated) for lip-sync.');

  const imageDataURL = await getAssetDataURL(faceSource);
  const audioDataURL = await getAssetDataURL(scene.assets.audioAssetId);
  if (!imageDataURL || !audioDataURL) throw new Error('Scene assets are missing.');

  scene.status = 'generating';
  await putProject(project);
  try {
    const { blob, mime } = await generateLipSync({
      imageDataURL, audioDataURL, signal,
    });
    const asset = await saveBlob(blob, { type: mime, name: `lipsync-${scene.index}` });
    scene.assets.lipsyncAssetId = asset.id;
    scene.status = 'ready';
    scene.error = null;
  } catch (err) {
    scene.status = 'error';
    scene.error = err.message;
    throw err;
  }
  await putProject(project);
  return scene;
}

/* ----------------------------------- music --------------------------------- */

export async function ensureMusic(project, { signal, forceRegenerate } = {}) {
  const settings = await loadSettings();
  const total = (project.storyboard?.scenes || []).reduce((a, s) => a + (Number(s.durationSec) || 0), 0) + 2.6;
  const musicCfg = project.music || {};
  const source = musicCfg.source || settings.music.provider || 'local';

  if (musicCfg.assetId && !forceRegenerate && Math.abs((musicCfg.generatedFor || 0) - total) < 1.2) {
    return project; // still valid
  }

  if (source === 'upload') {
    if (!musicCfg.uploadedAssetId) throw new Error('No music file uploaded. Upload a track or pick another music source.');
    project.music = { ...musicCfg, source, assetId: musicCfg.uploadedAssetId, generatedFor: total };
    await putProject(project);
    return project;
  }

  if (source === 'provider') {
    if (!isConfigured('music', settings) || settings.music.provider === 'local') throw setupError('music');
    const { blob, mime } = await generateMusic({
      prompt: musicCfg.prompt || `Upbeat modern ${project.input.beautyMode ? 'beauty' : 'product'} advertisement instrumental for a ${Math.round(total)}s social media video`,
      durationSec: total, signal,
    });
    const asset = await saveBlob(blob, { type: mime, name: 'music' });
    project.music = { ...musicCfg, source, assetId: asset.id, generatedFor: total };
    await putProject(project);
    return project;
  }

  // local procedural generator
  const styleId = musicCfg.styleId || 'upbeat-pop';
  const { blob } = await generateLocalMusic({ styleId, durationSec: Math.min(total, 120), seed: project.id });
  const asset = await saveBlob(blob, { type: 'audio/wav', name: `music-${styleId}` });
  project.music = { ...musicCfg, source: 'local', styleId, assetId: asset.id, generatedFor: total };
  await putProject(project);
  return project;
}

/* ------------------------------- full pipeline ------------------------------ */

function setupError(category) {
  const err = new Error(`The "${category}" provider is not configured yet. Open Settings → Providers to add it (or switch to backend mode).`);
  err.code = 'PROVIDER_NOT_CONFIGURED';
  return err;
}

/**
 * Generate every missing asset for the project.
 * opts: { onProgress({label, done, total, current}), signal, includeVideo, includeLipSync, onlyFailed }
 */
export async function generateAllAssets(project, opts = {}) {
  const { onProgress, signal, includeVideo, includeLipSync } = opts;
  const scenes = project.storyboard?.scenes || [];
  if (!scenes.length) throw new Error('Generate the storyboard first.');

  const settings = await loadSettings();
  // Resumable: only queue tasks whose asset is still missing ("continue from failed scene").
  const missing = (assetId) => !assetId;
  const tasks = [];
  const push = (label, fn) => tasks.push({ label, fn });

  // voice first (durations depend on it). NOTE: the task is queued even when
  // TTS is unconfigured so generateSceneVoice can fail LOUDLY with a clear
  // setup message instead of silently skipping (no fake success).
  for (const scene of scenes) {
    if (scene.dialog?.trim() && missing(scene.assets?.audioAssetId)) {
      push(`Voice · scene ${scene.index + 1}`, () => generateSceneVoice(project, scene, { signal }));
    }
  }
  // images
  for (const scene of scenes) {
    if (missing(scene.assets?.imageAssetId) && !(scene.assets?.videoAssetId || scene.assets?.lipsyncAssetId)) {
      push(`Image · scene ${scene.index + 1}`, () => generateSceneImage(project, scene, { signal }));
    }
  }
  // video clips (optional — only when the user opted in AND provider exists)
  if (includeVideo) {
    for (const scene of scenes) {
      if (missing(scene.assets?.videoAssetId) && scene.assets?.imageAssetId) {
        push(`Video · scene ${scene.index + 1}`, () => generateSceneVideo(project, scene, { signal }));
      }
    }
  }
  // lip-sync (optional)
  if (includeLipSync) {
    for (const scene of scenes) {
      if (scene.dialog?.trim() && missing(scene.assets?.lipsyncAssetId) && scene.assets?.audioAssetId) {
        push(`Lip-sync · scene ${scene.index + 1}`, () => generateSceneLipSync(project, scene, { signal }));
      }
    }
  }
  // music
  push('Background music', () => ensureMusic(project, { signal }));

  if (!tasks.length) {
    onProgress?.({ label: 'All assets already generated ✓', done: 1, total: 1 });
    project.status = 'assets';
    await putProject(project);
    return { done: 0, total: 0, failures: [] };
  }

  let done = 0;
  const failures = [];
  for (const task of tasks) {
    if (signal?.aborted) break;
    onProgress?.({ label: task.label, done, total: tasks.length });
    try {
      await task.fn();
    } catch (err) {
      if (signal?.aborted) break;
      failures.push({ label: task.label, error: err.message });
      onProgress?.({ label: `⚠ ${task.label} failed: ${err.message}`, done, total: tasks.length, error: true });
    }
    done++;
    onProgress?.({ label: task.label, done, total: tasks.length });
  }

  project.status = failures.length && failures.length === tasks.length ? 'error' : 'assets';
  await putProject(project);
  return { done, total: tasks.length, failures };
}

export { MUSIC_STYLES, uid };
