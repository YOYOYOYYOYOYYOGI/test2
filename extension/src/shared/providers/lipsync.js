/**
 * ReelForge — lip-sync adapter.
 *
 * Optional capability: takes the creator image (or a generated scene clip) plus
 * the generated voice audio and produces a talking video with accurate mouth
 * movement. Facial identity is preserved because the source image IS the
 * reference face.
 *
 * Providers: fal (LatentSync / sync), Replicate (LatentSync). Both accept data
 * URLs as inputs, so no public hosting is needed.
 *
 * Internal contract:
 *   generateLipSync({ imageDataURL, audioDataURL, model, signal, onStatus })
 *     -> { blob, mime, provider, model }
 */

import { providerFetch, ProviderError, resolveTransport } from './transport.js';
import { createReplicatePrediction, pollReplicatePrediction } from './replicate.js';

export async function generateLipSync({ imageDataURL, audioDataURL, model, signal, onStatus, promptNotes }) {
  const t = await resolveTransport('lipsync');
  const cfg = t.settings.lipsync;
  const useModel = model || cfg.model || undefined;

  if (t.provider === 'fal') {
    const m = useModel || 'fal-ai/latentsync';
    const body = {
      image_url: imageDataURL,
      audio_url: audioDataURL,
      ...(promptNotes ? { prompt: promptNotes } : {}),
    };
    const res = await providerFetch('lipsync', m, { body, signal });
    const data = await res.json();
    const url = data?.video?.url || data?.video_url || data?.url;
    if (!url) throw new ProviderError('fal.ai lipsync returned no video.', { detail: JSON.stringify(data).slice(0, 300) });
    const vRes = await fetch(url, { signal });
    return { blob: await vRes.blob(), mime: 'video/mp4', provider: 'fal', model: m };
  }

  if (t.provider === 'replicate') {
    const m = useModel || 'bytedance/latentsync';
    const input = { image: imageDataURL, audio: audioDataURL };
    const pred = await createReplicatePrediction(m, input, 'lipsync', signal);
    const final = await pollReplicatePrediction(pred, 'lipsync', signal, { onStatus, timeoutMs: 900000 });
    const url = Array.isArray(final.output) ? final.output[final.output.length - 1] : final.output;
    if (!url) throw new ProviderError('Replicate lipsync model returned no output.');
    const vRes = await fetch(url, { signal });
    return { blob: await vRes.blob(), mime: 'video/mp4', provider: 'replicate', model: m };
  }

  throw new ProviderError(`Unknown lipsync provider "${t.provider}"`);
}
