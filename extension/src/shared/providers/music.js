/**
 * ReelForge — music adapter.
 *
 * Two sources of background music:
 *  - "local": procedural royalty-free-style track synthesized offline with the
 *    Web Audio API (render/music-synth.js). Works with zero API keys.
 *  - "upload": the user's own licensed audio file (project.music.uploadedAssetId).
 *  - "fal": fal.ai Stable Audio text-to-music (premium).
 *
 * Internal contract:
 *   generateMusic({ prompt, durationSec, model, signal }) -> { blob, mime }
 */

import { providerFetch, ProviderError } from './transport.js';

export async function generateMusic({ prompt, durationSec = 30, model, signal }) {
  const { resolveTransport } = await import('./transport.js');
  const t = await resolveTransport('music');
  const cfg = t.settings.music;
  const useModel = model || cfg.model || undefined;

  if (t.provider === 'fal') {
    const m = useModel || 'fal-ai/stable-audio';
    const body = {
      prompt: prompt || 'Upbeat modern pop advertising instrumental, catchy, energetic, social media',
      seconds: Math.max(5, Math.min(120, Math.round(durationSec))),
    };
    const res = await providerFetch('music', m, { body, signal });
    const data = await res.json();
    const url = data?.audio?.url || data?.audio_url || data?.url;
    if (!url) throw new ProviderError('fal.ai music model returned no audio.', { detail: JSON.stringify(data).slice(0, 300) });
    const aRes = await fetch(url, { signal });
    return { blob: await aRes.blob(), mime: aRes.headers.get('content-type') || 'audio/mpeg' };
  }

  // "local" never goes through the network — see render/music-synth.js.
  throw new ProviderError(`Use the local generator or upload audio for music (provider "${t.provider}" not usable here).`);
}
