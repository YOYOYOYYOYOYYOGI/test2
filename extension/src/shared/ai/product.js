/**
 * ReelForge — product image understanding (vision AI).
 *
 * Sends the uploaded product photos to a vision-capable LLM and extracts
 * structured product facts used to keep the product visually consistent
 * across all generated scenes and to seed beauty-mode scene templates.
 */

import { chatJSON } from '../providers/llm.js';
import { buildProductAnalysisPrompt } from './prompts.js';
import { PROVIDERS } from '../providers/config.js';
import { loadSettings } from '../core/storage.js';

/**
 * images: [dataURL]. Returns structured analysis or throws when the configured
 * LLM has no vision capability (the UI then asks for a manual description).
 */
export async function analyzeProductImages(images, { productName, productInfo, signal } = {}) {
  if (!images?.length) throw new Error('No product images provided.');
  const settings = await loadSettings();
  const provider = settings.llm?.provider;
  const meta = PROVIDERS.llm[provider];
  if (!meta?.vision) {
    const err = new Error(`The configured LLM (${provider}) has no vision capability. Use OpenAI/Anthropic/Gemini for product photo analysis, or describe the product manually.`);
    err.code = 'NO_VISION';
    throw err;
  }

  return chatJSON({
    system: 'You are a packaging-design expert and product photographer. Analyze product photos precisely and objectively. Output ONLY valid JSON.',
    messages: [{ role: 'user', content: buildProductAnalysisPrompt(productName, productInfo) }],
    images: images.slice(0, 4),
    temperature: 0.3,
    maxTokens: 1500,
    signal,
  });
}

/** Given an analysis, is this a beauty/cosmetics product? */
export function isBeautyProduct(analysis) {
  if (!analysis) return false;
  if (typeof analysis.isBeauty === 'boolean') return analysis.isBeauty;
  const beautyCats = ['face-cream', 'night-cream', 'serum', 'moisturizer', 'sunscreen', 'face-wash', 'makeup', 'haircare', 'skincare', 'fragrance'];
  return beautyCats.includes(String(analysis.category || '').toLowerCase());
}

/** Beauty-mode scene blueprint injected into storyboard generation. */
export const BEAUTY_SCENE_BLUEPRINT = [
  { role: 'hook', note: 'Creator face-to-camera, product visible at edge of frame' },
  { role: 'problem', note: 'Skin concern shown honestly (no fear-mongering)' },
  { role: 'experience', note: 'Personal story with product in hand' },
  { role: 'product-intro', note: 'Product held beside face, label readable' },
  { role: 'demo', note: 'Macro texture shot / applying to hand or cheek' },
  { role: 'benefits', note: 'Pointing to label, explaining ingredients feel' },
  { role: 'result', note: 'Soft glow close-up, satisfied reaction to camera' },
  { role: 'cta', note: 'Holding product to camera with brand CTA' },
];
