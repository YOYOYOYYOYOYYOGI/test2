/**
 * ReelForge — Replicate job helpers (shared by image / video / lipsync adapters).
 *
 * Replicate is asynchronous: create a prediction, then poll it. Polling goes
 * through the same transport as creation (direct: Authorization header;
 * backend: /api/proxy/replicate/... passthrough) so it works in both modes.
 */

import { providerFetch, ProviderError } from './transport.js';

export async function createReplicatePrediction(model, input, category, signal) {
  const res = await providerFetch(category, `models/${model}/predictions`, {
    body: { input }, signal,
  });
  return res.json();
}

export async function getReplicatePrediction(id, category, signal) {
  const res = await providerFetch(category, `predictions/${id}`, { method: 'GET', signal });
  return res.json();
}

export async function cancelReplicatePrediction(id, category) {
  try {
    await providerFetch(category, `predictions/${id}/cancel`, { method: 'POST', body: {} });
  } catch { /* best-effort */ }
}

/** Poll a prediction until it succeeds/fails. Returns the final prediction object. */
export async function pollReplicatePrediction(prediction, category, signal, {
  timeoutMs = 600000, intervalMs = 2000, onStatus, shouldStop,
} = {}) {
  let current = prediction;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shouldStop?.()) throw new ProviderError('Job cancelled by user.');
    if (current.status === 'succeeded') return current;
    if (current.status === 'failed' || current.status === 'canceled') {
      throw new ProviderError(
        `Replicate job ${current.status}. ${current.error || ''}`.trim(),
        { detail: typeof current.error === 'object' ? JSON.stringify(current.error).slice(0, 500) : String(current.error || '') }
      );
    }
    onStatus?.(current.status);
    await new Promise((r) => setTimeout(r, intervalMs));
    const id = current.id;
    current = await getReplicatePrediction(id, category, signal);
  }
  throw new ProviderError('Replicate job timed out. Try a faster model or check the provider dashboard.');
}
