/**
 * ReelForge — Reference Reel analysis.
 *
 * The user uploads an Instagram Reel as a STYLE reference. ReelForge:
 *   1. extracts keyframes locally (canvas — no upload to any third party
 *      other than the vision provider the user configured),
 *   2. measures duration + speech density locally (Web Audio RMS envelope),
 *   3. asks the vision LLM for a structured UGC style profile,
 *   4. injects that profile into storyboard + image generation.
 *
 * COPYRIGHT SAFETY (enforced in every prompt that consumes the profile):
 * only the ABSTRACT style is reused. The user's own product, script, model
 * image and brand are used for content. No footage, audio, branding,
 * watermarks, captions text, or the reference creator's identity are copied,
 * and the output is a brand-new original video.
 */

import { uid } from '../core/utils.js';

/* ------------------------- local media extraction ------------------------- */

/**
 * Extract N evenly spaced keyframes from a video File/Blob.
 * @returns {Promise<{frames: [{time, dataURL}], durationSec, width, height}>}
 */
export async function extractVideoFrames(file, { count = 10, maxWidth = 512 } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video file. Use MP4, WebM or MOV.'));
      setTimeout(() => reject(new Error('Video load timed out.')), 20000);
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error('Unreadable video duration — try re-exporting the clip as MP4.');

    const W = Math.min(maxWidth, video.videoWidth || maxWidth);
    const scale = W / (video.videoWidth || W);
    const H = Math.max(2, Math.round((video.videoHeight || maxWidth) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const frames = [];
    // Skip the very first/last 4% to avoid black end frames.
    const span = duration * 0.92;
    for (let i = 0; i < count; i++) {
      const t = duration * 0.04 + (span * i) / Math.max(1, count - 1);
      await seek(video, t);
      ctx.drawImage(video, 0, 0, W, H);
      frames.push({ time: Math.round(t * 10) / 10, dataURL: canvas.toDataURL('image/jpeg', 0.72) });
    }
    return { frames, durationSec: Math.round(duration * 10) / 10, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    try { video.currentTime = t; } catch { done(); }
    setTimeout(done, 2500); // never hang on a broken frame
  });
}

/**
 * Local speech-density estimate: RMS envelope of the decoded audio.
 * @returns {Promise<{durationSec, speechRatio, loudness}>} speechRatio 0..1
 */
export async function analyzeAudioDensity(file) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const ch = buf.getChannelData(0);
    const step = Math.floor(buf.sampleRate * 0.25);
    let voiced = 0;
    let total = 0;
    let peak = 0;
    for (let i = 0; i < ch.length; i += step) {
      let sum = 0;
      const end = Math.min(ch.length, i + step);
      for (let j = i; j < end; j++) sum += ch[j] * ch[j];
      const rms = Math.sqrt(sum / Math.max(1, end - i));
      peak = Math.max(peak, rms);
      total++;
      if (rms > 0.045) voiced++;
    }
    ac.close();
    return { durationSec: Math.round(buf.duration), speechRatio: total ? Math.round((voiced / total) * 100) / 100 : 0, loudness: Math.round(peak * 100) / 100 };
  } catch {
    return { durationSec: null, speechRatio: null, loudness: null }; // silent/no-audio video is fine
  }
}

/* ---------------------------- vision LLM analysis -------------------------- */

export const REFERENCE_SYSTEM = `You are a UGC video director analyzing a REFERENCE reel so its STYLE can be recreated in a completely NEW, ORIGINAL advertisement for a different product, brand and creator.

CRITICAL RULES:
- Describe STYLE, TECHNIQUE and STRUCTURE only — never content to copy.
- Never reproduce the reference creator's identity, face, name, outfit specifics, voice, or any trademark/branding/logo/watermark/handle visible in the video.
- Never suggest copying footage, on-screen text wording, or audio. The new video will use the USER'S product photos, USER'S script and a NEW creator.
- If you notice branding in the reference, explicitly note it as "DO NOT COPY".
Output ONLY valid JSON.`;

const REFERENCE_SCHEMA = `{
  "hookStyle": "how the reel opens and grabs attention (technique, not wording)",
  "sceneStructure": [{"beat": "hook|problem|demo|benefit|result|social-proof|cta|other", "approxSec": number, "whatHappens": "short description of the SHOT TYPE and action pattern"}],
  "pacing": {"cutsPerMinute": number|null, "avgSceneSec": number|null, "rhythm": "slow/moderate/fast/very fast"},
  "camera": {"angles": ["selfie close-up", "top-down", "…"], "movement": ["handheld", "push-in", "…"], "framing": "how subjects/products are framed, headroom, product size in frame"},
  "transitions": ["cut", "whip", "…"],
  "speakingStyle": {"tone": "…", "pace": "…", "style": "casual/storytelling/hype/…"},
  "gestures": ["recurring gesture patterns"],
  "expressions": ["recurring facial expressions"],
  "captionStyle": {"look": "font feel, colors, animation style as observed", "density": "how much text on screen", "note": "DO NOT copy actual caption wording"},
  "productPresentation": "how the product is shown: distance, angles, moments (holding, applying, table shots)",
  "lighting": "lighting setup and mood",
  "background": "setting type and props pattern (generic, no brands)",
  "overallStyle": "2-3 sentence visual DNA of the reel",
  "doNotCopy": ["anything observed that must NOT be reproduced: logos, watermarks, handles, audio, exact wording"],
  "stylePromptFragment": "one paragraph of POSITIVE style guidance usable in image prompts for lighting/camera/grade"
}`;

/**
 * Analyze extracted frames + measurements into a style profile.
 * ctx: { productName, script } — used only to tailor "what matters for THIS project".
 */
export async function analyzeReferenceStyle(frames, meta, ctx, { signal } = {}) {
  const { chatJSON } = await import('../providers/llm.js');
  const images = frames.map((f) => f.dataURL);
  const user = `Analyze this reference reel (${frames.length} keyframes, chronological).

Measurements (computed locally): duration ${meta.durationSec ?? '?'}s, speech present ${Math.round((meta.speechRatio ?? 0) * 100)}% of the time, aspect ${meta.width}x${meta.height}.

New project context (for relevance only — NOT part of the style): product "${ctx.productName || ''}"; script starts: "${String(ctx.script || '').slice(0, 300)}".

Output ONLY JSON matching this schema:
${REFERENCE_SCHEMA}`;

  const parsed = await chatJSON({
    system: REFERENCE_SYSTEM,
    messages: [{ role: 'user', content: user }],
    images,
    temperature: 0.3,
    maxTokens: 3000,
    signal,
  });
  return parsed;
}

/** Compact block for the storyboard prompt (with anti-copy rules). */
export function formatReferenceContext(analysis) {
  if (!analysis) return '';
  const struct = (analysis.sceneStructure || [])
    .map((b) => `${b.beat} ~${b.approxSec}s — ${b.whatHappens}`)
    .join(' | ');
  const parts = [
    '\n=== REFERENCE REEL STYLE (recreate the STYLE only — the content is 100% the user\'s) ===',
    `Overall visual DNA: ${analysis.overallStyle || ''}`,
    `Hook technique: ${analysis.hookStyle || ''}`,
    struct ? `Scene structure: ${struct}` : '',
    analysis.pacing ? `Pacing: ${analysis.pacing.rhythm || ''} (~${analysis.pacing.avgSceneSec ?? '?'}s per scene, ~${analysis.pacing.cutsPerMinute ?? '?'} cuts/min)` : '',
    analysis.camera ? `Camera: angles ${JSON.stringify(analysis.camera.angles || [])} · movement ${JSON.stringify(analysis.camera.movement || [])} · framing ${analysis.camera.framing || ''}` : '',
    analysis.transitions ? `Transitions: ${JSON.stringify(analysis.transitions)}` : '',
    analysis.speakingStyle ? `Speaking style: ${JSON.stringify(analysis.speakingStyle)}` : '',
    analysis.gestures?.length ? `Gestures: ${analysis.gestures.join('; ')}` : '',
    analysis.expressions?.length ? `Expressions: ${analysis.expressions.join('; ')}` : '',
    analysis.captionStyle ? `Caption look (not wording): ${JSON.stringify(analysis.captionStyle)}` : '',
    analysis.productPresentation ? `Product presentation: ${analysis.productPresentation}` : '',
    analysis.lighting ? `Lighting: ${analysis.lighting}` : '',
    analysis.background ? `Background pattern: ${analysis.background}` : '',
    analysis.doNotCopy?.length ? `STRICTLY DO NOT COPY: ${analysis.doNotCopy.join('; ')}` : '',
    'COPYRIGHT SAFETY: produce a NEW ORIGINAL video. Use ONLY the user\'s product photos, user\'s script, user\'s creator image and brand. No reference footage, audio, branding, watermarks, captions wording or the reference creator\'s identity may be reproduced.',
    '=== END REFERENCE STYLE ===',
  ];
  return parts.filter(Boolean).join('\n');
}

/** Fragment appended to scene image prompts (visual style only). */
export function referenceImageFragment(analysis) {
  if (!analysis?.stylePromptFragment) return '';
  return `Reference reel visual style (technique only): ${analysis.stylePromptFragment}`;
}

/** Make a safe display summary for the UI. */
export function referenceSummary(analysis) {
  if (!analysis) return null;
  return {
    style: analysis.overallStyle || '',
    hook: analysis.hookStyle || '',
    pacing: analysis.pacing?.rhythm || '',
    structure: (analysis.sceneStructure || []).map((b) => b.beat),
    doNotCopy: analysis.doNotCopy || [],
  };
}

export { uid };
