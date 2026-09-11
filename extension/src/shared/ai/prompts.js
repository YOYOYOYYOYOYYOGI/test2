/**
 * ReelForge — prompt engineering layer.
 *
 * All LLM prompts live here so the "AI director" behavior is easy to audit and
 * improve. The Knowledge Base (ai/kb.js) injects the user's saved winning
 * hooks/scripts/rules into these prompts — a retrieval-augmented template
 * system, NOT a model-training pipeline (we never train or fine-tune models).
 */

import { truncate } from '../core/utils.js';

/* ------------------------------ style presets ------------------------------ */

export const STYLE_PRESETS = [
  {
    id: 'realistic-ugc', name: 'Realistic UGC', icon: '🎥',
    description: 'Authentic creator-style ad: handheld camera, natural lighting, casual delivery.',
    prompt: 'Authentic amateur UGC aesthetic. Handheld phone-camera look, natural window lighting, real home environment, casual relatable delivery, slight camera imperfection, vertical framing focused on the face and product.',
  },
  {
    id: 'beauty-ugc', name: 'Beauty UGC', icon: '💄',
    description: 'Beauty/skincare creator: soft glam, texture shots, application close-ups.',
    prompt: 'Beauty influencer UGC aesthetic. Soft flattering ring-light glow, clean vanity or bathroom background, flawless-but-natural makeup, close-ups on skin texture and product application, elegant slow hand movements showing the product clearly.',
  },
  {
    id: 'product-review', name: 'Product Review', icon: '⭐',
    description: 'Honest reviewer energy: unbox, inspect, verdict.',
    prompt: 'Honest product-review UGC aesthetic. Creator inspects the product closely, points at details, compares before/after, expressive eyebrows, desk or table setup with the product always in frame.',
  },
  {
    id: 'testimonial', name: 'Testimonial', icon: '💬',
    description: 'Talking-head testimonial with emotional payoff.',
    prompt: 'Emotional testimonial aesthetic. Tight talking-head framing, eye contact with camera, sincere expressions, subtle handheld movement, warm tones, product held near the chest during the story.',
  },
  {
    id: 'unboxing', name: 'Unboxing', icon: '📦',
    description: 'ASMR-ish unboxing with satisfying reveals.',
    prompt: 'Unboxing aesthetic. Top-down or 45-degree desk shot, careful hands opening packaging, satisfying reveal moments, crisp product macro shots, neutral backdrop with soft shadows.',
  },
  {
    id: 'problem-solution', name: 'Problem → Solution', icon: '🧩',
    description: 'Pain point first, relief after discovering the product.',
    prompt: 'Problem-solution aesthetic. First half slightly desaturated showing frustration with the problem; second half brighter and warmer after the product appears. Clear visual contrast between before and after.',
  },
  {
    id: 'before-after', name: 'Before → After', icon: '🔄',
    description: 'Transformation structure with split-screen energy.',
    prompt: 'Before/after transformation aesthetic. Early scenes visually duller (problem state), later scenes polished and glowing (result state), matching framing so the transformation is obvious.',
  },
  {
    id: 'product-demo', name: 'Product Demonstration', icon: '🛠️',
    description: 'Hands-on demo showing the product in real use.',
    prompt: 'Product demonstration aesthetic. Clear over-shoulder and top-down shots of the product being used correctly, fingers pointing at key features, well-lit workspace, product centered and readable.',
  },
  {
    id: 'voiceover-product', name: 'Voice-over Product Video', icon: '🎙️',
    description: 'Voice-driven b-roll style: product b-roll with narration.',
    prompt: 'Voice-over product video aesthetic. Cinematic b-roll of the product in lifestyle contexts, smooth slider-style camera moves, creator voice narrates off-screen with occasional quick on-camera moments.',
  },
  {
    id: 'viral-reel', name: 'Viral Instagram Reel', icon: '⚡',
    description: 'Fast cuts, pattern interrupts, trend-aware energy.',
    prompt: 'Viral Instagram Reel aesthetic. Extremely fast pacing, zoom punches, whip transitions, expressive faces directly into camera, bold on-screen text, trending energy, strong pattern interrupt in the first second.',
  },
  {
    id: 'cinematic-ad', name: 'Cinematic Product Advertisement', icon: '🎬',
    description: 'Premium cinematic lighting and grade, high-end feel.',
    prompt: 'Cinematic advertisement aesthetic. Dramatic soft lighting, shallow depth of field, slow dolly and orbit camera moves, premium color grade, luxurious textures, product hero shots with reflective surfaces.',
  },
];

export function styleById(id) {
  return STYLE_PRESETS.find((s) => s.id === id) || STYLE_PRESETS[0];
}

/* ------------------------------ context blocks ----------------------------- */

/** Format knowledge-base entries retrieved for this generation (RAG context). */
export function formatKBContext(entries) {
  if (!entries?.length) return '';
  const blocks = entries.map((e) => {
    const tag = e.type ? `[${e.type}]` : '';
    return `- ${tag} ${e.title}: ${truncate(e.content, 700)}`;
  });
  return `\n\n=== LEARNED KNOWLEDGE FROM THIS BRAND'S PAST SUCCESSES (respect these) ===\n${blocks.join('\n')}\n=== END LEARNED KNOWLEDGE ===`;
}

export function formatBrandContext(brand) {
  if (!brand || (!brand.name && !brand.description)) return '';
  const bits = [];
  if (brand.name) bits.push(`Brand: ${brand.name}`);
  if (brand.description) bits.push(`Brand description: ${brand.description}`);
  if (brand.audience) bits.push(`Target audience: ${brand.audience}`);
  if (brand.cta) bits.push(`Brand CTA (must appear naturally): "${brand.cta}"`);
  if (brand.website) bits.push(`Website: ${brand.website}`);
  return `\n\n=== BRAND KIT ===\n${bits.join('\n')}\n=== END BRAND ===`;
}

/* ----------------------------- storyboard prompt --------------------------- */

const SCENE_FIELDS_SPEC = `For EVERY scene output exactly these fields:
- "role": one of hook | problem | experience | product-intro | demo | benefits | result | social-proof | cta | other
- "description": 1-2 sentences of what we SEE (director's visual description)
- "dialog": what the creator SAYS out loud, in natural spoken language, 1-3 short sentences, first person, contractions, no stage directions inside
- "expression": facial expression (e.g. "excited eyes, raised brows", "sympathetic wince")
- "gesture": hand/body action (e.g. "holds jar up beside face", "taps cheek with fingertip")
- "camera": shot size + angle (e.g. "close-up, eye level, slight high angle selfie")
- "cameraMove": one of static | push-in | pull-out | pan-left | pan-right | tilt-up | handheld | orbit
- "background": the location/setting visible behind the person
- "lighting": lighting description (e.g. "soft window light from left, golden hour")
- "productPlacement": how/where the product appears (name which uploaded product photo fits best, e.g. "PRODUCT-1 held in hand")
- "productInteraction": exactly how hands/body interact with the product
- "onScreenText": 2-6 word bold overlay text for this scene (empty string if none)
- "caption": the subtitle text shown at the bottom = the spoken dialog, word-for-word
- "durationSec": number, seconds this scene needs (2.0-8.0; scale with dialog length ~2.8 words/sec)
- "transition": transition INTO the next scene: cut | crossfade | whip | slide | fade-black
- "focus": person | product | both — whether this scene centers the person, the product, or both`;

export const STORYBOARD_SYSTEM = `You are an award-winning short-form video director specializing in UGC (user-generated content) advertisements for Instagram Reels, TikTok and beauty/cosmetics products. You write storyboards that a real production team could shoot: every scene is concrete, filmable and specific.

Rules you always follow:
1. The FIRST 3 seconds must grab attention (bold claim, question, pattern interrupt or visual shock). Never open with a slow brand intro.
2. Scenes are fast: most 2.5-4.5s. Total duration must match the requested target (±15%).
3. Dialog sounds like a real person talking to a friend — contractions, casual words, no corporate speak, no exclamation-mark spam.
4. Never make medical, health-recovery or guaranteed-result claims. Avoid words like "cures", "heals", "miracle", "clinically proven" unless the user's script explicitly contains them — even then prefer softer phrasing like "helps with", "my skin feels", "I noticed".
5. The product packaging, logo and label must stay consistent — reference the uploaded product photos as PRODUCT-1, PRODUCT-2 … when relevant.
6. On-screen text is short, punchy, ALL-CAPS-friendly, and never duplicates the first 5 words of the dialog.
7. Vary camera angles between scenes (selfie close-up, mirror shot, top-down product shot, over-shoulder, macro texture shot, full-body lifestyle).
8. End with a clear CTA scene.
9. Priority order when inputs conflict: the USER'S script > the USER'S product facts > the USER'S creator image identity > the reference reel's STYLE (technique only, never content) > your own creative taste. Additional instructions from the user override style defaults.
10. COPYRIGHT SAFETY: never reproduce footage, audio, branding, logos, watermarks, caption wording or a real person's identity from any reference material. The output is a new original ad built from the user's own assets.
Output ONLY valid JSON matching the requested schema. No markdown, no commentary.`;

/**
 * Build the storyboard user prompt.
 * ctx: { script, productName, productInfo, brand, style, hook, aspect,
 *        durationSec, personInfo, productAnalysis, kbEntries, customInstructions, sceneCountHint }
 */
export function buildStoryboardPrompt(ctx) {
  const parts = [];
  parts.push(`Create a UGC video storyboard as JSON:\n{"title": string, "scenes": [ { ${SCENE_FIELDS_SPEC.replace(/\n/g, ' ')} } ]}`);

  parts.push(`\n=== BRIEF ===
Product name: ${ctx.productName || 'the product'}
Product info: ${truncate(ctx.productInfo || ctx.productAnalysis?.summary || 'Not provided — infer from script.', 900)}
Script / message from the user:
"""${truncate(ctx.script || '(no script — invent a strong UGC script from the product info)', 6000)}"""`);

  if (ctx.productAnalysis) {
    parts.push(`\n=== PRODUCT PHOTO ANALYSIS (vision AI) ===
Category: ${ctx.productAnalysis.category || 'unknown'}
Appearance: ${truncate(ctx.productAnalysis.appearance || '', 300)}
Packaging colors: ${(ctx.productAnalysis.colors || []).join(', ')}
Label/logo: ${truncate(ctx.productAnalysis.label || '', 200)}
Reference these as PRODUCT-1, PRODUCT-2 … in productPlacement.`);
  }
  if (ctx.personInfo) {
    parts.push(`\n=== THE CREATOR (consistent across ALL scenes) ===\n${truncate(ctx.personInfo, 600)}`);
  }
  const style = ctx.stylePreset ? styleById(ctx.stylePreset) : null;
  if (style) parts.push(`\n=== STYLE PRESET: ${style.name} ===\n${style.prompt}`);
  if (ctx.customInstructions) parts.push(`\n=== USER STYLE INSTRUCTIONS ===\n${truncate(ctx.customInstructions, 800)}`);
  if (ctx.hook) parts.push(`\n=== CHOSEN HOOK (use as scene 1, adapt freely) ===\nCategory: ${ctx.hook.category}\nHook: ${ctx.hook.text}`);
  if (ctx.beautyMode) {
    parts.push(`\n=== BEAUTY MODE ENABLED ===
This is a beauty/cosmetics product. Include at least: holding the product beside the face, a macro texture/application shot (fingertip swatch or applying to cheek/hand), a "looking at camera" reaction moment, and a soft-glow result moment. Realistic application movements only.`);
  }
  parts.push(`\n=== FORMAT ===
Aspect ratio: ${ctx.aspect} (vertical 9:16 preferred)
Target total duration: ${ctx.durationSec} seconds across roughly ${ctx.sceneCountHint} scenes (adjust if the story needs it).`);

  if (ctx.kbEntries?.length) parts.push(formatKBContext(ctx.kbEntries));
  parts.push(formatBrandContext(ctx.brand));
  if (ctx.referenceContext) parts.push(ctx.referenceContext);
  if (ctx.instructionsContext) parts.push(ctx.instructionsContext);

  return parts.join('\n');
}

/* -------------------------------- hooks prompt ----------------------------- */

export const HOOK_CATEGORIES = [
  { id: 'problem', label: 'Problem Hook', example: 'Stop scrolling if [pain]…' },
  { id: 'curiosity', label: 'Curiosity Hook', example: 'I was not expecting this…' },
  { id: 'question', label: 'Question Hook', example: 'Why does nobody talk about this?' },
  { id: 'bold', label: 'Bold Statement', example: 'This changed everything.' },
  { id: 'experience', label: 'Personal Experience', example: 'Day 14 of using this…' },
  { id: 'before-after', label: 'Before/After Hook', example: 'Before vs after — look.' },
  { id: 'mistake', label: 'Mistake Hook', example: 'You are doing it wrong.' },
  { id: 'secret', label: 'Secret/Tip Hook', example: 'The trick nobody tells you…' },
  { id: 'discovery', label: 'Product Discovery', example: 'I finally found one that works.' },
  { id: 'emotional', label: 'Emotional Hook', example: 'I almost gave up until…' },
  { id: 'interrupt', label: 'Pattern Interrupt', example: 'PUT. THE. DOWN.' },
  { id: 'story', label: 'Story Hook', example: 'So this happened this morning…' },
];

export function buildHooksPrompt(ctx) {
  const cats = HOOK_CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', ');
  let prompt = `Generate ${ctx.count || 12} scroll-stopping UGC hooks for a short video ad.

Product: ${ctx.productName || 'the product'}
Product info: ${truncate(ctx.productInfo || '', 500)}
Script context: ${truncate(ctx.script || '', 1500)}
${ctx.brand ? `Brand voice: ${truncate(brandLine(ctx.brand), 250)}\n` : ''}
Output JSON: {"hooks": [{"category": one of ${cats}, "text": "the hook line as the creator would SAY it, max 14 words, spoken style", "visual": "one short sentence: what we see in the first frame", "why": "one short sentence: why it stops the scroll"}]}

Rules: no medical/guarantee claims; no clickbait lies about the product; each category at most twice; make them specific to THIS product, not generic.`;
  if (ctx.kbEntries?.length) prompt += formatKBContext(ctx.kbEntries);
  return prompt;
}

function brandLine(brand) {
  return [brand.name, brand.description, brand.audience ? `audience: ${brand.audience}` : ''].filter(Boolean).join(' — ');
}

/* ---------------------------- product analysis ----------------------------- */

export function buildProductAnalysisPrompt(productName, productInfo) {
  return `Analyze these product photos for a UGC video ad.

Product name: ${productName || 'unknown'}
Extra info: ${truncate(productInfo || 'none', 500)}

Output ONLY JSON:
{
  "category": "one of: face-cream, night-cream, serum, moisturizer, sunscreen, face-wash, makeup, haircare, skincare, fragrance, supplement, drink, food, tech, other",
  "isBeauty": boolean,
  "appearance": "2 sentences describing exactly what the product looks like",
  "packaging": "jar/bottle/tube/pump/box/pouch etc.",
  "colors": ["dominant colors"],
  "label": "what the label says / logo description",
  "shape": "shape and size description",
  "suggestedScenes": ["5 short scene ideas suited to this specific product"],
  "summary": "one sentence a video director can use to keep the product consistent in every shot"
}`;
}

/* ----------------------------- creator generation --------------------------- */

/** Build the photorealistic creator description used for image prompts. */
export function buildCreatorPrompt(person, productCtx) {
  if (person?.description) {
    return `The EXACT SAME real person in every shot — preserve her facial identity precisely (face shape, eyes, nose, lips, eyebrows, skin tone), her hairstyle and hair color, and her clothing style where the scene allows. ${person.description}. Photorealistic, natural skin texture with visible pores, authentic amateur phone-photo look. NOT cartoon, NOT anime, NOT 3D render, NOT CGI.`;
  }
  return `A photorealistic UGC creator chosen to fit this product: ${productCtx}.
Realistic human with natural skin texture, imperfect and authentic, shot on a phone camera.
NOT cartoon, NOT anime, NOT 3D render, NOT CGI, NOT airbrushed.
Appropriate age/gender/style for the target audience, trendy casual clothing, relatable appearance.`;
}

/** Map a scene + style into a full image-generation prompt. */
export function buildSceneImagePrompt({ scene, creatorPrompt, productAnalysis, style, aspect, referenceFragment, imageDirectives }) {
  const bits = [
    `UGC advertisement photo, ${aspect} vertical composition`,
    scene.description,
    creatorPrompt,
    scene.camera ? `Camera: ${scene.camera}.` : '',
    scene.cameraMove && scene.cameraMove !== 'static' ? `Implied motion: ${scene.cameraMove}.` : '',
    scene.background ? `Background: ${scene.background}.` : '',
    scene.lighting ? `Lighting: ${scene.lighting}.` : '',
    scene.expression ? `Expression: ${scene.expression}.` : '',
    scene.gesture ? `Action: ${scene.gesture}.` : '',
    scene.productInteraction || scene.productPlacement ? `Product: ${[scene.productPlacement, scene.productInteraction].filter(Boolean).join(' — ')}; keep packaging, logo and label EXACTLY consistent.` : '',
    style?.prompt || '',
    referenceFragment || '',
    imageDirectives || '',
    `Natural motion blur where appropriate, authentic amateur framing, no text overlays, no watermark, no logos other than the user's own product.`,
  ];
  return bits.filter(Boolean).join(' ');
}
