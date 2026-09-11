/**
 * ReelForge — video generation adapter.
 *
 * Optional capability: turns a scene image (creator portrait, product shot)
 * into a short AI video clip with natural motion. The scene image becomes the
 * first frame, which is how character + product consistency is preserved.
 *
 * Providers: replicate, fal. Model is configurable (Settings → Video).
 *
 * Internal contract:
 *   generateVideoClip({ prompt, imageDataURL, durationSec, aspect, model, signal, onStatus })
 *     -> { blob, mime, provider, model }
 */

import { providerFetch, ProviderError, resolveTransport } from './transport.js';
import { createReplicatePrediction, pollReplicatePrediction } from './replicate.js';

const clampDur = (d) => Math.max(3, Math.min(10, Math.round(d)));

export async function generateVideoClip({ prompt, imageDataURL, durationSec = 5, aspect = '9:16', model, signal, onStatus }) {
  const t = await resolveTransport('video');
  const cfg = t.settings.video;
  const useModel = model || cfg.model || undefined;

  if (t.provider === 'replicate') {
    const m = useModel || 'wan-video/wan-2.1-i2v-480p';
    const input = { prompt, image: imageDataURL };
    // Common optional knobs — extra keys are ignored by most models.
    if (/kling|i2v|wan/.test(m)) input.duration = clampDur(durationSec) >= 8 ? 8 : 5;
    const pred = await createReplicatePrediction(m, input, 'video', signal);
    const final = await pollReplicatePrediction(pred, 'video', signal, { onStatus, timeoutMs: 900000 });
    const url = Array.isArray(final.output) ? final.output[final.output.length - 1] : final.output;
    if (!url) throw new ProviderError('Replicate video model returned no output.');
    const vRes = await fetch(url, { signal });
    return { blob: await vRes.blob(), mime: 'video/mp4', provider: 'replicate', model: m };
  }

  if (t.provider === 'fal') {
    const m = useModel || 'fal-ai/kling-video/v1.6/standard/image-to-video';
    const body = { prompt, image_url: imageDataURL, duration: String(clampDur(durationSec) >= 8 ? 8 : 5) };
    const res = await providerFetch('video', m, { body, signal });
    const data = await res.json();
    const url = data?.video?.url || data?.videos?.[0]?.url || data?.url;
    if (!url) throw new ProviderError('fal.ai video model returned no output.', { detail: JSON.stringify(data).slice(0, 300) });
    const vRes = await fetch(url, { signal });
    return { blob: await vRes.blob(), mime: 'video/mp4', provider: 'fal', model: m };
  }

  throw new ProviderError(`Unknown video provider "${t.provider}"`);
}
