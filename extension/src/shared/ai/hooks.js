/**
 * ReelForge — AI Hook Generator.
 *
 * Generates multiple scroll-stopping hooks across 12 proven categories,
 * lets the user pick one for the storyboard, and learns from saved winning
 * hooks (via the Knowledge Base retrieval layer).
 */

import { chatJSON } from '../providers/llm.js';
import { retrieveKB } from './kb.js';
import { buildHooksPrompt, HOOK_CATEGORIES } from './prompts.js';
import { uid } from '../core/utils.js';

export { HOOK_CATEGORIES };

/**
 * ctx: { productName, productInfo, script, brand, count }
 * Returns [{ id, category, text, visual, why }]
 */
export async function generateHooks(ctx, { signal, categoryFilter } = {}) {
  const kbEntries = await retrieveKB({
    productName: ctx.productName, productInfo: ctx.productInfo,
    script: ctx.script, brand: ctx.brand, hookCategory: categoryFilter || undefined,
  }, { topK: 5 });

  const prompt = buildHooksPrompt({ ...ctx, kbEntries, count: ctx.count || 12 });
  const raw = await chatJSON({
    system: 'You are a viral short-form video hook writer for Instagram Reels and TikTok. You write specific, punchy, spoken-style hooks. Output ONLY valid JSON.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 1.0,
    maxTokens: 3000,
    signal,
  });

  const hooks = (raw?.hooks || raw || []).filter((h) => h && typeof h.text === 'string');
  if (!hooks.length) throw new Error('The AI returned no hooks. Try again.');
  return hooks.slice(0, 24).map((h) => ({
    id: uid('hook'),
    category: HOOK_CATEGORIES.find((c) => c.id === h.category)?.id || 'curiosity',
    text: String(h.text).trim(),
    visual: String(h.visual || '').trim(),
    why: String(h.why || '').trim(),
  }));
}
