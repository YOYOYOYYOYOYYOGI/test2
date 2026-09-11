/**
 * ReelForge — storyboard generation & validation.
 *
 * Converts the user's raw script + product/brand context into a structured,
 * editable storyboard (array of scenes). Everything downstream (image prompts,
 * voice, lipsync, rendering) consumes this structure.
 */

import { chatJSON } from '../providers/llm.js';
import { retrieveKB } from './kb.js';
import { buildStoryboardPrompt, STORYBOARD_SYSTEM, styleById } from './prompts.js';
import { clamp, uid } from '../core/utils.js';

const VALID_ROLES = ['hook', 'problem', 'experience', 'product-intro', 'demo', 'benefits', 'result', 'social-proof', 'cta', 'other'];
const VALID_MOVES = ['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'handheld', 'orbit'];
const VALID_TRANSITIONS = ['cut', 'crossfade', 'whip', 'slide', 'fade-black'];

/**
 * Generate a storyboard.
 * ctx: { script, productName, productInfo, brand, stylePreset, customInstructions,
 *        hook, aspect, durationSec, personInfo, productAnalysis, beautyMode }
 * Returns { title, scenes: SceneDraft[] } with normalized fields.
 */
export async function generateStoryboard(ctx, { signal } = {}) {
  const kbEntries = await retrieveKB({
    script: ctx.script, productName: ctx.productName, productInfo: ctx.productInfo,
    brand: ctx.brand, styleId: ctx.stylePreset,
  });

  const sceneCountHint = Math.max(4, Math.min(14, Math.round(ctx.durationSec / 3.2)));
  const prompt = buildStoryboardPrompt({ ...ctx, kbEntries, sceneCountHint });

  const raw = await chatJSON({
    system: STORYBOARD_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    maxTokens: 8192,
    signal,
  });

  const scenesRaw = Array.isArray(raw?.scenes) ? raw.scenes : Array.isArray(raw) ? raw : null;
  if (!scenesRaw?.length) {
    const err = new Error('The AI did not return any scenes. Try regenerating or adjust the script.');
    err.raw = JSON.stringify(raw).slice(0, 500);
    throw err;
  }

  const scenes = scenesRaw.slice(0, 20).map((s, i) => normalizeScene(s, i, ctx));
  const title = typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : `${ctx.productName || 'UGC'} Reel`;

  return { title, scenes };
}

/** Coerce one raw LLM scene object into our strict scene shape. */
export function normalizeScene(s, index, ctx = {}) {
  const dur = clamp(Number(s.durationSec) || 3.5, 1.5, 10);
  return {
    id: s.id || uid('scn'),
    index,
    role: VALID_ROLES.includes(s.role) ? s.role : 'other',
    description: String(s.description || '').trim(),
    dialog: String(s.dialog || '').trim(),
    expression: String(s.expression || '').trim(),
    gesture: String(s.gesture || '').trim(),
    camera: String(s.camera || '').trim(),
    cameraMove: VALID_MOVES.includes(s.cameraMove) ? s.cameraMove : 'push-in',
    background: String(s.background || '').trim(),
    lighting: String(s.lighting || '').trim(),
    productPlacement: String(s.productPlacement || '').trim(),
    productInteraction: String(s.productInteraction || '').trim(),
    onScreenText: String(s.onScreenText || '').trim(),
    caption: String(s.caption || s.dialog || '').trim(),
    durationSec: dur,
    transition: VALID_TRANSITIONS.includes(s.transition) ? s.transition : 'crossfade',
    focus: ['person', 'product', 'both'].includes(s.focus) ? s.focus : 'person',
    assets: { imageAssetId: null, videoAssetId: null, audioAssetId: null, lipsyncAssetId: null },
    gen: { imagePrompt: null, videoPrompt: null, imageModel: null },
    productImageRef: null, // assetId of which uploaded product image this scene uses
    status: 'pending', // pending | generating | ready | error
    error: null,
  };
}

/** Recompute total duration from scene durations. */
export function storyboardDuration(scenes) {
  return (scenes || []).reduce((acc, s) => acc + (Number(s.durationSec) || 0), 0);
}

/** Quick sanity report for the UI. */
export function storyboardReport(storyboard) {
  const scenes = storyboard?.scenes || [];
  const missing = [];
  if (!scenes.length) missing.push('No scenes');
  const noDialog = scenes.filter((s) => !s.dialog).length;
  const total = storyboardDuration(scenes);
  return { sceneCount: scenes.length, totalDuration: total, scenesWithoutDialog: noDialog, missing };
}

export { styleById };
