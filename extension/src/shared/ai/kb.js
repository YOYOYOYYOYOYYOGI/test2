/**
 * ReelForge — UGC Knowledge Base (RAG-style retrieval).
 *
 * The user saves winning hooks, scripts, CTAs, rules, brand instructions and
 * example structures. When generating a new video we retrieve the most
 * relevant entries (keyword scoring with light TF-IDF weighting) and inject
 * them into the LLM prompt.
 *
 * HONESTY NOTE: this is prompt/template/RAG augmentation. It does NOT train,
 * fine-tune or modify any AI model. The README and UI state this clearly.
 */

import { tokenize } from '../core/utils.js';
import { listKB as _list, bumpKB as _bumpKB, saveKBEntry as _save, deleteKBEntry as _del } from '../core/storage.js';

/** Re-exports for UI convenience. */
export const listKB = _list;
export const bumpKB = _bumpKB;
export const saveKBEntry = _save;
export const deleteKBEntry = _del;

const KB_TYPES = [
  { id: 'script', label: 'Successful script' },
  { id: 'hook', label: 'Winning hook' },
  { id: 'cta', label: 'CTA' },
  { id: 'structure', label: 'Scene structure' },
  { id: 'product-desc', label: 'Product description' },
  { id: 'brand-instruction', label: 'Brand instruction' },
  { id: 'style', label: 'Writing style' },
  { id: 'example', label: 'Video example' },
  { id: 'campaign', label: 'Campaign instruction' },
  { id: 'rule', label: 'Do / Don’t rule' },
];

export function kbTypeLabel(id) {
  return KB_TYPES.find((t) => t.id === id)?.label || id;
}
export { KB_TYPES };

/** IDF over the current KB corpus. */
function computeIDF(entries) {
  const df = new Map();
  for (const e of entries) {
    const seen = new Set(tokenize(`${e.title} ${e.content} ${(e.tags || []).join(' ')}`));
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = Math.max(1, entries.length);
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log((N + 1) / (d + 0.5)));
  return idf;
}

/**
 * Retrieve top-k KB entries relevant to the query context.
 * query: { script, productName, productInfo, brand, styleId, hookCategory }
 */
export async function retrieveKB(query, { topK = 6 } = {}) {
  const entries = await listKB();
  if (!entries.length) return [];
  const idf = computeIDF(entries);
  const qTokens = tokenize([
    query.script, query.productName, query.productInfo,
    query.brand?.name, query.brand?.description, query.styleId, query.hookCategory,
  ].filter(Boolean).join(' '));

  const scored = entries.map((e) => {
    const eTokens = tokenize(`${e.title} ${e.content} ${(e.tags || []).join(' ')}`);
    const eSet = new Map();
    for (const t of eTokens) eSet.set(t, (eSet.get(t) || 0) + 1);
    let score = 0;
    for (const q of qTokens) {
      const tf = eSet.get(q);
      if (tf) score += (1 + Math.log(tf)) * (idf.get(q) || 1);
    }
    // type affinity: hook entries are extra relevant for hook generation, etc.
    if (query.hookCategory && e.type === 'hook') score *= 1.5;
    if (query.preferType && e.type === query.preferType) score *= 1.6;
    // successful entries (marked as winners) get a small boost
    if (e.stats?.wins > 0) score *= 1.2;
    // gentle recency boost
    const ageDays = (Date.now() - (e.updatedAt || e.createdAt || Date.now())) / 86400000;
    score *= 1 + Math.max(0, 0.15 - ageDays / 3650);
    return { entry: e, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => {
      bumpKB(s.entry.id, 'uses').catch(() => {});
      return s.entry;
    });
}
