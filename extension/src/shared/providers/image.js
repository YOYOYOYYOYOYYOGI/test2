/**
 * ReelForge — image generation adapter.
 *
 * Generates photorealistic UGC scene stills. When the provider supports
 * reference images (OpenAI gpt-image-1 edits, Replicate/fal FLUX-Kontext) the
 * uploaded product photos and the creator reference are passed in so the
 * product packaging and the person's identity stay CONSISTENT across scenes.
 *
 * Internal contract:
 *   generateImage({ prompt, refs:[dataURL], aspect, model }) -> { blob, mime, provider, model }
 */

import { providerFetch, ProviderError, resolveTransport } from './transport.js';
import { createReplicatePrediction, pollReplicatePrediction } from './replicate.js';

const OPENAI_SIZES = { '9:16': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024' };
const FAL_RATIOS = { '9:16': '9:16', '1:1': '1:1', '16:9': '16:9' };

function dataURLtoBlob(dataURL) {
  const [head, b64] = String(dataURL).split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Download a produced image URL into a blob. */
async function fetchImageBlob(url, signal) {
  const imgRes = await fetch(url, { signal });
  if (!imgRes.ok) throw new ProviderError(`Failed to download generated image (HTTP ${imgRes.status}).`);
  return { blob: await imgRes.blob(), mime: imgRes.headers.get('content-type') || 'image/jpeg' };
}

export async function generateImage({ prompt, refs = [], aspect = '9:16', model, signal, onStatus }) {
  const t = await resolveTransportOnce('image');
  const cfg = t.settings.image;
  const useModel = model || cfg.model || undefined;
  const provider = t.provider;

  if (provider === 'openai') {
    const m = useModel || 'gpt-image-1';
    if (refs.length) {
      const fd = new FormData();
      fd.append('model', m);
      fd.append('prompt', prompt);
      fd.append('size', OPENAI_SIZES[aspect] || '1024x1536');
      fd.append('n', '1');
      refs.slice(0, 4).forEach((r) => fd.append('image[]', dataURLtoBlob(r), 'ref.png'));
      const res = await providerFetch('image', 'images/edits', { formData: fd, signal });
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('OpenAI image edit returned no image data.');
      return { blob: dataURLtoBlob(`data:image/png;base64,${b64}`), mime: 'image/png', provider, model: m };
    }
    const body = { model: m, prompt, n: 1, size: OPENAI_SIZES[aspect] || '1024x1536' };
    const res = await providerFetch('image', 'images/generations', { body, signal });
    const data = await res.json();
    const item = data?.data?.[0];
    if (item?.b64_json) return { blob: dataURLtoBlob(`data:image/png;base64,${item.b64_json}`), mime: 'image/png', provider, model: m };
    if (item?.url) {
      const out = await fetchImageBlob(item.url, signal);
      return { ...out, provider, model: m };
    }
    throw new ProviderError('OpenAI images returned no image data.');
  }

  if (provider === 'stability') {
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('output_format', 'png');
    fd.append('aspect_ratio', aspect === '16:9' ? '16:9' : aspect === '1:1' ? '1:1' : '9:16');
    const m = useModel || 'core';
    const res = await providerFetch('image', `v2beta/stable-image/generate/${m}`, {
      formData: fd, headers: { Accept: 'image/*' }, signal,
    });
    const ct = res.headers.get('content-type') || 'image/png';
    if (ct.includes('json')) {
      const data = await res.json();
      const b64 = data?.image;
      if (!b64) throw new ProviderError('Stability returned no image data.');
      return { blob: dataURLtoBlob(`data:image/png;base64,${b64}`), mime: 'image/png', provider, model: m };
    }
    return { blob: await res.blob(), mime: ct, provider, model: m };
  }

  if (provider === 'replicate') {
    const m = useModel || 'black-forest-labs/flux-kontext-pro';
    const input = { prompt, output_format: 'jpg', aspect_ratio: aspect };
    if (refs.length) input.input_image = refs[0];
    const pred = await createReplicatePrediction(m, input, 'image', signal);
    const final = await pollReplicatePrediction(pred, 'image', signal, { onStatus });
    const url = Array.isArray(final.output) ? final.output[0] : final.output;
    if (!url) throw new ProviderError('Replicate image model returned no output.');
    const out = await fetchImageBlob(url, signal);
    return { ...out, provider, model: m };
  }

  if (provider === 'fal') {
    const m = useModel || 'fal-ai/flux-pro/v1.1/kontext';
    const input = { prompt };
    if (refs.length) input.image_url = refs[0];
    else input.aspect_ratio = FAL_RATIOS[aspect] || '9:16';
    const res = await providerFetch('image', m, { body: input, signal });
    const data = await res.json();
    const url = data?.images?.[0]?.url || data?.image?.url || data?.url;
    if (!url) throw new ProviderError('fal.ai image model returned no output.', { detail: JSON.stringify(data).slice(0, 300) });
    const out = await fetchImageBlob(url, signal);
    return { ...out, provider, model: m };
  }

  throw new ProviderError(`Unknown image provider "${provider}"`);
}

async function resolveTransportOnce(category) {
  return resolveTransport(category);
}
