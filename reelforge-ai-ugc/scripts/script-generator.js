/*
 * script-generator.js - Content construction for the workflow:
 *  - LLM prompt builders (script, hooks, product copy)
 *  - strict JSON/text parsers for model output
 *  - genuine offline template generators (text only; never used to fake media)
 *  - the creator-image and video motion prompts
 */

import { SCRIPT_SECTIONS, DEFAULT_CTA } from './config.js';
import { ValidationError } from './errors.js';

export function blankProduct() {
  return { name: '', description: '', benefits: '', audience: '', problem: '', solution: '', offer: '', cta: '' };
}

/* ---------------- JSON extraction ---------------- */

export function extractJsonObject(text) {
  if (!text) throw new ValidationError('The model returned an empty response.');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ValidationError('The model response was not valid JSON.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function extractJsonArray(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1) throw new ValidationError('The model response was not a JSON list.');
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new ValidationError('Expected a list of hooks.');
  return parsed.map((x) => (typeof x === 'string' ? x : x.hook || x.text || '')).filter(Boolean);
}

/* ---------------- Product information ---------------- */

export function productInfoMessages(product) {
  return [
    {
      role: 'system',
      content:
        'You are a UGC (user-generated-content) marketing strategist. You write in the natural voice of a real customer, never corporate jargon. Respond ONLY with valid JSON.',
    },
    {
      role: 'user',
      content: `Fill in a UGC marketing brief for this product. Keep every value short and concrete.
Respond with a JSON object containing exactly these keys:
"name", "description", "benefits" (array of 3 short strings), "audience", "problem", "solution", "offer", "cta".
Known information so far:
${JSON.stringify(product, null, 2)}

Rules:
- Do not invent specific prices, discounts or guarantees that were not provided; for those use an honest generic suggestion.
- Benefits and the problem must be written the way a real person talks.
- The cta must be one short sentence.`,
    },
  ];
}

export function mergeProductInfo(previous, generated) {
  const merged = { ...previous };
  for (const key of Object.keys(blankProduct())) {
    const incoming = Array.isArray(generated[key]) ? generated[key].map((s) => String(s).trim()).filter(Boolean).join('\n') : generated[key];
    if (incoming && String(incoming).trim()) {
      if (!String(merged[key] || '').trim()) merged[key] = String(incoming).trim();
    }
  }
  return merged;
}

/* ---------------- UGC script ---------------- */

function productBrief(product) {
  const lines = [];
  for (const [label, key] of [
    ['Product', 'name'],
    ['What it is', 'description'],
    ['Benefits', 'benefits'],
    ['Audience', 'audience'],
    ['Problem it solves', 'problem'],
    ['How it works / solution', 'solution'],
    ['Offer / price', 'offer'],
    ['Call to action', 'cta'],
  ]) {
    if (product[key] && String(product[key]).trim()) lines.push(`${label}: ${String(product[key]).trim()}`);
  }
  return lines.join('\n');
}

export function scriptMessages({ product, defaults }) {
  const seconds = defaults.duration || 8;
  return [
    {
      role: 'system',
      content:
        'You are a natural UGC creator writing a short-form selfie video script. Sound like a real person talking to a friend: warm, specific, slightly informal. Never sound like a corporate ad. No hashtags, no emojis in the spoken lines. Respond ONLY with the labelled script, no commentary.',
    },
    {
      role: 'user',
      content: `Write a ${seconds}-second UGC video script in ${defaults.language || 'English'}.
Style: ${defaults.ugcStyle || 'Natural selfie / talking head'}.
Creator persona: ${defaults.creatorStyle || 'friendly female creator, age 22-30'}.

Product brief:
${productBrief(product)}

Use EXACTLY this format with these six labels in order:
HOOK
A 1-sentence scroll-stopping opener spoken to camera (curiosity, surprise or a relatable statement).

PROBLEM
1-2 sentences describing the frustrating problem from the viewer's life.

SOLUTION
1-2 sentences showing how the product changes things, like a personal recommendation.

PRODUCT
1-2 sentences where the creator shows the product and what makes it different.

BENEFIT
1-2 sentences about the tangible result/feeling after using it.

CTA
One clear spoken call to action${product.cta ? ` based on: "${product.cta}"` : ` such as: "${defaults.cta || DEFAULT_CTA}"`}.

Keep each section to ${Math.max(1, Math.round(seconds / 6))} short sentences. The whole script must be speakable in about ${seconds} seconds.`,
    },
  ];
}

export function hooksMessages({ product, defaults }) {
  return [
    {
      role: 'system',
      content: 'You write scroll-stopping UGC hooks in the voice of a real person. No clickbait lies, no emojis. Respond ONLY with valid JSON: {"hooks": ["...", "..."]}.',
    },
    {
      role: 'user',
      content: `Write 6 short UGC video hooks in ${defaults.language || 'English'} for this product.
Vary the openings (relief, curiosity, "I wish I knew", "okay so I finally found", "nobody told me", "if you struggle with...").
Each hook is a single sentence under 14 words, spoken naturally to camera.

Product: ${productBrief(product)}

Return JSON like: {"hooks": ["I wish I knew about this sooner...", "..."]}`,
    },
  ];
}

export function parseHooksPayload(text) {
  const parsed = extractJsonObject(text);
  const hooks = parsed.hooks || parsed.data || [];
  return hooks.map((h) => String(h).trim()).filter(Boolean).slice(0, 8);
}

/* ------------- Offline template generators (text only) ------------- */

export function buildLocalHooks(product, count = 6) {
  const thing = product.name || 'this product';
  const problem = shortPhrase(product.problem) || 'struggling with this';
  const hooks = [
    `I wish I knew about ${thing} sooner...`,
    `Okay, I finally found something that actually fixes ${problem}.`,
    `If you're ${problem}, you need to watch this.`,
    `Nobody told me ${thing} could do this.`,
    `Why am I only finding out about ${thing} now?`,
    `I was today years old when I stopped ${problem}.`,
    `Stop scrolling if you're still dealing with ${problem}.`,
    `This is your sign to try ${thing}.`,
  ];
  return hooks.slice(0, count);
}

function shortPhrase(text) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return cleaned.length > 60 ? cleaned.slice(0, 57).replace(/\s\S*$/, '') + '…' : cleaned;
}

export function buildLocalScript({ product, defaults }) {
  const name = product.name || 'this product';
  const problem = product.problem || `dealing with exactly the problem ${name} is made for`;
  const solution = product.solution || product.description || `${name} makes the whole problem disappear`;
  const benefits = product.benefits
    ? String(product.benefits).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' and ')
    : '';
  const result = benefits || `honestly, it just works and I don't stress about it anymore`;
  const cta = product.cta || defaults.cta || DEFAULT_CTA;
  const audience = product.audience ? ` If you're ${String(product.audience).toLowerCase()}, this one's for you.` : '';
  const offerLine = product.offer ? ` Right now ${product.offer}, so honestly it's a no-brainer.` : '';

  const sections = {
    HOOK: buildLocalHooks(product, 1)[0],
    PROBLEM: `So I was so tired of ${String(problem).replace(/\.$/, '')}.${audience}`,
    SOLUTION: `Then I started using ${name}. ${capFirst(String(solution).replace(/\.$/, ''))}.`,
    PRODUCT: `Look at this — it's ${name}. What I actually like is that it's not overhyped, it just does the thing.`,
    BENEFIT: `After using it, ${String(result).replace(/\.$/, '').replace(/^i /i, 'I ')}${offerLine}`,
    CTA: capFirst(cta),
  };
  return formatScriptSections(sections);
}

function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function formatScriptSections(sections) {
  return SCRIPT_SECTIONS.map((name) => `${name}\n${sections[name] || ''}`).join('\n\n');
}

export function parseScriptSections(text) {
  const out = {};
  const pattern = new RegExp(`^(${SCRIPT_SECTIONS.join('|')})\\s*$`, 'gim');
  const matches = [...text.matchAll(pattern)];
  matches.forEach((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    out[match[1].toUpperCase()] = text.slice(start, end).trim();
  });
  if (!Object.keys(out).length) {
    out.HOOK = text.trim(); // Free-form scripts without labels are still valid.
  }
  return out;
}

/* ---------------- Visual prompts ---------------- */

export function creatorImagePrompt({ product, defaults }) {
  const c = defaults.creatorStyle || 'friendly female creator, age 22-30';
  const productLine = product.name
    ? `They are clearly holding and showcasing the product "${product.name}"${product.description ? ` (${trimSentence(product.description, 160)})` : ''}`
    : 'They are clearly holding and showcasing the product shown in the reference image';
  return [
    'Authentic vertical UGC selfie photo, 9:16 phone camera look, shot at home in natural window light.',
    `Creator: ${c}, warm genuine expression, looking directly into the camera lens, casual everyday clothing, light realistic makeup, skin texture preserved.`,
    `${productLine}. The product packaging, colours, proportions and logo are shown accurately and look identical to the reference product image.`,
    'Slightly imperfect handheld framing, real-life room softly blurred in the background, TikTok/Instagram Reels aesthetic, photorealistic, high detail, no text overlays, no watermark.',
  ].join(' ');
}

export function videoMotionPrompt({ product, scriptText, defaults }) {
  const sections = parseScriptSections(scriptText);
  const spoken = [sections.HOOK, sections.PROBLEM, sections.SOLUTION, sections.PRODUCT, sections.BENEFIT, sections.CTA].filter(Boolean).join(' ');
  const seconds = defaults.duration || 8;
  return [
    `Vertical 9:16 UGC selfie video, about ${seconds} seconds, authentic smartphone footage of a ${defaults.creatorStyle || 'friendly young creator'}.`,
    `Style: ${defaults.ugcStyle || 'Natural selfie / talking head'}. Natural handheld micro-movements, home setting with soft daylight, shallow depth of field.`,
    `The creator holds the product "${product.name || 'from the reference image'}" so its packaging stays clearly visible and consistent with the reference image, looks into the lens and speaks enthusiastically with natural lip movement and facial expressions.`,
    'Action beats: starts with an engaged hook expression, briefly shows the product close to camera, demonstrates using it, reacts with genuine delight, then points toward the screen/caption area for the call to action.',
    `Spoken content for lip-sync reference: "${trimSentence(spoken, 600)}"`,
    'Photorealistic people only, natural skin, no text overlays, no watermarks, no distorted hands, no extra limbs, smooth motion.',
  ].join(' ');
}

function trimSentence(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}
