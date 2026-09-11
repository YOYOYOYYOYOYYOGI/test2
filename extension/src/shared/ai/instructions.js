/**
 * ReelForge — Additional Instructions engine ("Creative Direction").
 *
 * The user's free-text commands ("Make her more energetic", "Use faster
 * cuts", "Show the product closer to the camera"…) must genuinely change the
 * generated video — not just decorate a prompt. This module:
 *
 *   1. compiles raw text into structured, deterministic levers
 *      (pacing scale, transition style, voice energy, camera distance,
 *      lighting keywords, outfit notes, CTA tone…), and
 *   2. keeps the raw text so the LLM also receives the full nuance.
 *
 * Priority order enforced everywhere:
 *   user script > user product > user model image > reference reel STYLE > additional instructions
 * (instructions override the reference style; nothing overrides the user's
 *  script, product or creator identity).
 */

import { clamp } from '../core/utils.js';

/** Deterministic lexicon for common UGC direction commands. */
const RULES = [
  {
    id: 'energy-high',
    test: /(more\s+)?(energetic|energentic|hype|excited|high.energy|bubbly|enthusiastic)/i,
    apply: (c) => { c.voice.energy = 'high'; c.storyboard.push('Creator energy: noticeably higher — bigger expressions, livelier delivery, upbeat rhythm.'); },
  },
  {
    id: 'energy-calm',
    test: /(calmer|more\s+calm|slower\s+pace|softer|relaxed|less\s+energy)/i,
    apply: (c) => { c.voice.energy = 'calm'; c.storyboard.push('Creator energy: calm and soothing — relaxed pacing, gentle delivery.'); },
  },
  {
    id: 'smile',
    test: /smile(ing)?\s+(more\s+)?naturally|more\s+(natural\s+)?smil|warmer\s+smile/i,
    apply: (c) => { c.storyboard.push('Expressions: frequent warm, NATURAL smiles (not posed); smile with the eyes.'); c.image.push('warm natural genuine smile, relaxed authentic expression'); },
  },
  {
    id: 'background',
    test: /background\s*(to|:)?\s*([a-z0-9\s\-]{3,60})|change\s+the\s+background/i,
    apply: (c, m) => {
      const what = (m[2] || '').trim();
      c.background = what || 'modern bathroom';
      c.storyboard.push(`Background: use "${what || 'modern bathroom'}" consistently in every person scene.`);
      c.image.push(`background setting: ${what || 'modern bathroom'}`);
    },
  },
  {
    id: 'premium',
    test: /(more\s+)?(premium|luxur|high.end|elegant|expensive)/i,
    apply: (c) => {
      c.storyboard.push('Look & feel: premium/luxurious — refined pacing, elegant framing, richer lighting, slower deliberate product moments.');
      c.image.push('premium luxurious aesthetic, elegant lighting, high-end product photography feel');
      c.music = 'cinematic';
    },
  },
  {
    id: 'stronger-hook',
    test: /(stronger|better|punchier|more\s+aggressive)\s+hook|hook\s+stronger/i,
    apply: (c) => { c.storyboard.push('HOOK: make scene 1 significantly stronger — bolder claim or pattern interrupt in the first 1.5 seconds, louder on-screen text.'); },
  },
  {
    id: 'product-closer',
    test: /product\s+(closer|near|big|bigger|up\s+close)|closer\s+to\s+the\s+camera|show\s+the\s+product\s+closer/i,
    apply: (c) => { c.camera = 'close'; c.image.push('product held very close to camera, label large and readable, macro detail'); c.storyboard.push('Product visibility: bring the product much closer to the lens in product scenes; label clearly readable.'); },
  },
  {
    id: 'faster-cuts',
    test: /(faster|quick|snappy|rapid)\s+(cuts?|pacing|editing)|faster\s+pacing/i,
    apply: (c) => { c.pacing = 'faster'; c.durationScale = 0.72; c.transition = 'fast'; c.storyboard.push('Pacing: faster cuts — shorten scene durations (~30% shorter), punchy cut/whip transitions.'); },
  },
  {
    id: 'slower-cuts',
    test: /(slower|longer)\s+(cuts?|pacing)|more\s+time\s+on\s+each\s+scene/i,
    apply: (c) => { c.pacing = 'slower'; c.durationScale = 1.25; c.storyboard.push('Pacing: slower, let scenes breathe (~25% longer durations).'); },
  },
  {
    id: 'aggressive-cta',
    test: /cta\s+(more\s+)?aggressive|aggressive\s+cta|stronger\s+cta|harder\s+sell/i,
    apply: (c) => { c.cta = 'aggressive'; c.storyboard.push('CTA: aggressive, urgent, direct — "buy now" energy with a clear reason to act immediately.'); },
  },
  {
    id: 'soft-cta',
    test: /cta\s+(softer|subtle|gentle)|softer\s+cta/i,
    apply: (c) => { c.cta = 'soft'; c.storyboard.push('CTA: soft and low-pressure — gentle invitation instead of a hard sell.'); },
  },
  {
    id: 'outfit',
    test: /outfit|clothes|clothing|wear(ing)?\s+[a-z]/i,
    apply: (c, m) => {
      const what = m[0] && m[0].length > 6 ? m[0].replace(/^(change|make|use)\s+(the\s+)?(outfit|clothes|clothing)\s*(to)?\s*/i, '').trim() : '';
      c.outfit = what || c.outfit || 'different outfit than default';
      c.storyboard.push(`Wardrobe: creator wears ${what || 'the specified outfit'} in all scenes (keep it consistent).`);
      c.image.push(`creator wearing ${what || 'the specified outfit'}`);
    },
  },
  {
    id: 'lighting-brighter',
    test: /(lighting|light)\s+(brighter|brighter.|more\s+bright)|brighter\s+(lighting|light)/i,
    apply: (c) => { c.lighting = 'brighter'; c.image.push('bright airy lighting, well-lit scene'); c.storyboard.push('Lighting: brighter, airy, well-lit in every scene.'); },
  },
  {
    id: 'lighting-darker',
    test: /(lighting|light)\s+(darker|moody)|moody\s+lighting/i,
    apply: (c) => { c.lighting = 'moody'; c.image.push('moody dramatic lighting, deeper shadows'); c.storyboard.push('Lighting: moody and dramatic.'); },
  },
  {
    id: 'voice-language',
    test: /(speak|say\s+it|dialog)\s+(in\s+)?(spanish|hindi|french|german|portuguese|arabic|english|british|american)/i,
    apply: (c, m) => { c.language = (m[5] || m[1] || '').toLowerCase(); c.storyboard.push(`Language/accent: the creator speaks with ${c.language} language/accent.`); },
  },
];

/**
 * Compile free-text instructions into structured levers + directive lists.
 * @returns {{ raw, storyboard: string[], image: string[], voice: object,
 *              pacing, durationScale, transition, camera, lighting, background,
 *              outfit, cta, music, language, hasDirectives }}
 */
export function compileInstructions(rawText) {
  const c = {
    raw: String(rawText || '').trim(),
    storyboard: [],
    image: [],
    voice: {},
    pacing: null,
    durationScale: 1,
    transition: null,
    camera: null,
    lighting: null,
    background: null,
    outfit: null,
    cta: null,
    music: null,
    language: null,
  };
  if (!c.raw) return { ...c, hasDirectives: false };

  for (const rule of RULES) {
    const m = c.raw.match(rule.test);
    if (m) rule.apply(c, m);
  }
  return { ...c, hasDirectives: c.storyboard.length > 0 || c.image.length > 0 };
}

/** Apply deterministic levers to an already-generated storyboard (durations, transitions). */
export function applyPacingToScenes(scenes, compiled) {
  if (!compiled || (!compiled.durationScale || compiled.durationScale === 1) && !compiled.transition) return scenes;
  for (const s of scenes) {
    if (compiled.durationScale !== 1) {
      s.durationSec = clamp(Math.round(Number(s.durationSec) * compiled.durationScale * 10) / 10, 1.2, 8);
    }
    if (compiled.transition === 'fast' && s.transition === 'crossfade') s.transition = 'cut';
  }
  return scenes;
}

/** Block appended to the storyboard LLM prompt — high priority. */
export function formatInstructionsContext(compiled) {
  if (!compiled?.raw) return '';
  const lines = [
    '\n=== ADDITIONAL INSTRUCTIONS FROM THE USER (HIGH PRIORITY — obey these over style defaults and over the reference reel) ===',
    `"${compiled.raw}"`,
  ];
  if (compiled.storyboard.length) lines.push(...compiled.storyboard.map((s) => `- ${s}`));
  lines.push('=== END ADDITIONAL INSTRUCTIONS ===');
  return lines.join('\n');
}

/** Extra fragment appended to every scene image prompt. */
export function imageDirectivesFragment(compiled) {
  if (!compiled?.image?.length) return '';
  return compiled.image.join(', ') + '.';
}

/** Voice style override from instructions (falls back to project voice style). */
export function voiceDirective(compiled, projectVoiceStyle) {
  if (compiled?.voice?.energy === 'high') return 'excited-hype';
  if (compiled?.voice?.energy === 'calm') return 'calm-trust';
  return projectVoiceStyle || 'casual-friendly';
}
