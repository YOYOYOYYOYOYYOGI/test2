/*
 * Image provider adapters (AI creator generation).
 * Interface: generateCreator({ prompt, referenceDataUrl }), test().
 * Returned object: { url, dataUrl, model }.
 */

import { httpJson, httpRequest } from '../util.js';
import { ConfigurationError, ProviderError } from '../errors.js';
import { pollFalResult } from './llm.js';

function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: /^data:([^;,]+)/.exec(meta)?.[1] || 'image/jpeg' };
}

class FalImageProvider {
  constructor(config) {
    this.config = config;
    this.endpoint = config.model || 'fal-ai/flux/kontext/max';
  }

  buildInput(prompt, referenceDataUrl) {
    const input = { prompt, num_images: 1 };
    if (referenceDataUrl) {
      if (this.endpoint.includes('seedream')) {
        input.image_urls = [referenceDataUrl]; // data URIs are accepted by fal runners
        input.optimize_prompt = false;
      } else if (this.endpoint.includes('kontext')) {
        input.image_url = referenceDataUrl;
        input.output_format = 'jpeg';
      } else {
        // Plain text-to-image models ignore references; keep the prompt self-contained.
        input.image_size = { width: 768, height: 1344 };
      }
    } else {
      input.image_size = { width: 768, height: 1344 }; // vertical UGC framing
    }
    return input;
  }

  normalizeImage(result) {
    const first = result?.images?.[0] || result?.image;
    const url = typeof first === 'string' ? first : first?.url;
    if (!url) throw new ProviderError('The image provider returned no image.', { details: JSON.stringify(result).slice(0, 300) });
    return url;
  }

  async generateCreator({ prompt, referenceDataUrl }) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing fal.ai API key for image generation.');
    const submit = await httpJson({
      method: 'POST',
      url: `https://queue.fal.run/${this.endpoint}`,
      headers: { Authorization: `Key ${this.config.apiKey}` },
      body: this.buildInput(prompt, referenceDataUrl),
      timeoutMs: 60000,
    });
    let result;
    if (submit.data?.request_id) {
      result = await pollFalResult(this.config.apiKey, this.endpoint, submit.data.request_id, 180000);
    } else {
      result = submit.data;
    }
    const url = this.normalizeImage(result);
    return { url, dataUrl: null, model: this.endpoint };
  }

  async test() {
    if (!this.config.apiKey) throw new ConfigurationError('Missing fal.ai API key for image generation.');
    // A real, minimal generation through the cheap schnell endpoint proves the full queue path.
    const endpoint = 'fal-ai/flux/schnell';
    const submit = await httpJson({
      method: 'POST',
      url: `https://queue.fal.run/${endpoint}`,
      headers: { Authorization: `Key ${this.config.apiKey}` },
      body: { prompt: 'plain white test image', num_inference_steps: 1, image_size: { width: 256, height: 256 } },
      timeoutMs: 30000,
    });
    if (!submit.data?.request_id) throw new ProviderError('Unexpected test response from fal.ai.');
    const result = await pollFalResult(this.config.apiKey, endpoint, submit.data.request_id, 90000);
    this.normalizeImage(result);
    return { ok: true, message: 'Connected. fal.ai accepted the key and generated a test image.' };
  }
}

class OpenAiImageProvider {
  constructor(config) {
    this.config = config;
  }

  base() {
    return (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  async generateCreator({ prompt }) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing OpenAI API key for image generation.');
    const model = this.config.model || 'gpt-image-1';
    const payload = {
      model,
      prompt,
      size: model.startsWith('dall') ? '1024x1792' : '1024x1536',
      n: 1,
    };
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base()}/images/generations`,
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: payload,
      timeoutMs: 180000,
    });
    const item = data?.data?.[0];
    if (!item) throw new ProviderError('The image provider returned no image.');
    if (item.b64_json) {
      return { url: null, dataUrl: `data:image/png;base64,${item.b64_json}`, model };
    }
    return { url: item.url, dataUrl: null, model };
  }

  async test() {
    if (!this.config.apiKey) throw new ConfigurationError('Missing OpenAI API key for image generation.');
    const { status } = await httpJson({
      method: 'GET',
      url: `${this.base()}/models`,
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      timeoutMs: 20000,
    });
    return { ok: true, message: `Connected (HTTP ${status}). The API key was accepted.` };
  }
}

/* Fetch an image URL as a data URL (through the worker) so previews work offline later. */
export async function fetchImageAsDataUrl(url) {
  const res = await httpRequest({ method: 'GET', url, binary: true, timeoutMs: 60000 });
  if (res.status < 200 || res.status >= 300) throw new ProviderError('Could not download the generated image.', { status: res.status });
  let binary = '';
  const chunk = 0x8000;
  const bytes = new Uint8Array(res.bytes);
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return `data:${res.contentType || 'image/jpeg'};base64,${base64}`;
}

export function inlineDataUrl(dataUrl) {
  return dataUrl; // fal runners accept data URIs directly
}

export { dataUrlToBytes };

export function createImageProvider(settings) {
  switch (settings.image.provider) {
    case 'fal':
      return new FalImageProvider(settings.image);
    case 'openai': {
      const imgConfig = { ...settings.image, baseUrl: settings.llm.baseUrl || 'https://api.openai.com/v1' };
      return new OpenAiImageProvider(imgConfig);
    }
    default:
      throw new ConfigurationError(`Unknown image provider: ${settings.image.provider}`);
  }
}
