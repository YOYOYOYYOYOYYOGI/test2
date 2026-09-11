/*
 * Video provider adapters.
 * Interface:
 *   submit({ prompt, imageDataUrl, duration }) -> job descriptor (JSON-serialisable)
 *   poll(job) -> { status, progress, log, videoUrl, error }
 *   download(job) -> { blob, url, contentType }
 *   test() -> { ok, message }
 *
 * status is normalised to: queued | processing | completed | failed
 */

import { httpJson, httpRequest } from '../util.js';
import { ConfigurationError, ProviderError } from '../errors.js';
import { pollFalResult } from './llm.js';

const STATUS = { queued: 'queued', processing: 'processing', completed: 'completed', failed: 'failed' };

function findVideoUrl(data) {
  if (!data) return null;
  if (typeof data.video === 'string') return data.video;
  if (data.video?.url) return data.video.url;
  if (Array.isArray(data.videos) && data.videos[0]) {
    return typeof data.videos[0] === 'string' ? data.videos[0] : data.videos[0].url;
  }
  if (data.output?.video?.url) return data.output.video.url;
  if (data.url) return data.url;
  return null;
}

class FalVideoProvider {
  constructor(config) {
    this.config = config;
    this.endpoint = config.model || 'fal-ai/kling-video/v2/master/image-to-video';
  }

  get imageToVideo() {
    return this.endpoint.includes('image-to-video');
  }

  buildInput({ prompt, imageDataUrl, duration }) {
    const input = { prompt };
    if (this.imageToVideo) {
      input.image_url = imageDataUrl; // data URI; fal runners accept these
      if (this.endpoint.includes('kling')) {
        input.duration = duration <= 5 ? 5 : 10;
        input.cfg_scale = 0.5;
      }
    } else if (this.endpoint.includes('veo')) {
      input.aspect_ratio = '9:16';
      input.duration = String(duration);
    }
    return input;
  }

  async submit({ prompt, imageDataUrl, duration }) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing fal.ai API key for video generation.');
    if (this.imageToVideo && !imageDataUrl) {
      throw new ConfigurationError(`The model ${this.endpoint} requires a creator/first-frame image.`);
    }
    const { data } = await httpJson({
      method: 'POST',
      url: `https://queue.fal.run/${this.endpoint}`,
      headers: { Authorization: `Key ${this.config.apiKey}` },
      body: this.buildInput({ prompt, imageDataUrl, duration }),
      timeoutMs: 60000,
    });
    if (!data?.request_id) throw new ProviderError('fal.ai did not return a request id.', { details: JSON.stringify(data).slice(0, 300) });
    return {
      provider: 'fal',
      model: this.endpoint,
      externalId: data.request_id,
      statusUrl: data.status_url || `https://queue.fal.run/${this.endpoint}/requests/${data.request_id}/status?logs=1`,
      resultUrl: data.response_url || `https://queue.fal.run/${this.endpoint}/requests/${data.request_id}`,
      cancelUrl: data.cancel_url || `https://queue.fal.run/${this.endpoint}/requests/${data.request_id}/cancel`,
      status: STATUS.queued,
    };
  }

  async poll(job) {
    const { data } = await httpJson({
      method: 'GET',
      url: job.statusUrl,
      headers: { Authorization: `Key ${this.config.apiKey}` },
      timeoutMs: 30000,
    });
    if (data.status === 'IN_QUEUE') {
      return { status: STATUS.queued, progress: 0, log: `Queued${typeof data.queue_position === 'number' ? ` (position ${data.queue_position + 1})` : ''}` };
    }
    if (data.status === 'IN_PROGRESS') {
      const lastLog = data.logs && data.logs.length ? data.logs[data.logs.length - 1].message : 'Generating video…';
      return { status: STATUS.processing, progress: 50, log: lastLog };
    }
    if (data.status === 'COMPLETED') {
      const result = await pollFalResult(this.config.apiKey, job.model, job.externalId, 60000).catch(() => null);
      // status COMPLETED already includes response_url; fetch it directly:
      const { data: payload } = await httpJson({
        method: 'GET',
        url: job.resultUrl,
        headers: { Authorization: `Key ${this.config.apiKey}` },
        timeoutMs: 60000,
      });
      const videoUrl = findVideoUrl(payload) || findVideoUrl(result);
      if (!videoUrl) throw new ProviderError('The video job completed but no video URL was returned.', { details: JSON.stringify(payload).slice(0, 300) });
      return { status: STATUS.completed, progress: 100, videoUrl };
    }
    // FAILED / ERROR / CANCELLED
    return { status: STATUS.failed, error: data.error || data.detail || 'The fal.ai video job failed.' };
  }

  async download(job, videoUrl) {
    const url = videoUrl || job.videoUrl;
    const res = await httpRequest({ method: 'GET', url, binary: true, timeoutMs: 180000 });
    if (res.status < 200 || res.status >= 300 || !res.bytes) {
      throw new ProviderError('Could not download the finished video.', { status: res.status });
    }
    return { blob: new Blob([res.bytes], { type: res.contentType || 'video/mp4' }), url, contentType: res.contentType || 'video/mp4' };
  }

  async test() {
    if (!this.config.apiKey) throw new ConfigurationError('Missing fal.ai API key for video generation.');
    // Cheap authentication probe: a made-up request id returns 404 for a valid
    // key but 401/403 for a rejected one, so no paid video job is created.
    const probeUrl = `https://queue.fal.run/${this.endpoint}/requests/auth-probe/status?logs=0`;
    try {
      await httpJson({
        method: 'GET',
        url: probeUrl,
        headers: { Authorization: `Key ${this.config.apiKey}` },
        timeoutMs: 20000,
      });
      return { ok: true, message: 'Connected. fal.ai accepted the API key.' };
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        throw new ProviderError('fal.ai rejected the API key (authentication failed).', { status: err.status });
      }
      if (err.status === 404) {
        return { ok: true, message: 'Connected. fal.ai accepted the API key for this video model.' };
      }
      throw err;
    }
  }
}

class OpenAiVideoProvider {
  constructor(config) {
    this.config = config;
    this.base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  auth() {
    return { Authorization: `Bearer ${this.config.apiKey}` };
  }

  async submit({ prompt, duration }) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing OpenAI API key for video generation.');
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base}/videos`,
      headers: this.auth(),
      body: {
        model: this.config.model || 'sora-2',
        prompt,
        seconds: String(duration),
        size: '720x1280',
      },
      timeoutMs: 60000,
    });
    if (!data?.id) throw new ProviderError('The video API did not return a job id.', { details: JSON.stringify(data).slice(0, 300) });
    return {
      provider: 'openai',
      model: this.config.model || 'sora-2',
      externalId: data.id,
      status: mapOpenAiStatus(data.status),
    };
  }

  async poll(job) {
    const { data } = await httpJson({
      method: 'GET',
      url: `${this.base}/videos/${job.externalId}`,
      headers: this.auth(),
      timeoutMs: 30000,
    });
    const status = mapOpenAiStatus(data.status);
    if (status === STATUS.completed) {
      return { status, progress: 100, videoUrl: `${this.base}/videos/${job.externalId}/content` };
    }
    if (status === STATUS.failed) {
      return { status, error: data.error?.message || data.error || 'Video generation failed on the provider side.' };
    }
    return { status, progress: typeof data.progress === 'number' ? data.progress : undefined, log: data.status };
  }

  async download(job) {
    const res = await httpRequest({
      method: 'GET',
      url: `${this.base}/videos/${job.externalId}/content`,
      headers: this.auth(),
      binary: true,
      timeoutMs: 300000,
    });
    if (res.status < 200 || res.status >= 300 || !res.bytes) {
      throw new ProviderError('Could not download the finished video content.', { status: res.status });
    }
    return { blob: new Blob([res.bytes], { type: res.contentType || 'video/mp4' }), url: null, contentType: res.contentType || 'video/mp4' };
  }

  async test() {
    if (!this.config.apiKey) throw new ConfigurationError('Missing OpenAI API key for video generation.');
    const { status } = await httpJson({
      method: 'GET',
      url: `${this.base}/models`,
      headers: this.auth(),
      timeoutMs: 20000,
    });
    return { ok: true, message: `Connected (HTTP ${status}). The API key was accepted (video generation is billed per use).` };
  }
}

function mapOpenAiStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'succeeded':
      return STATUS.completed;
    case 'failed':
    case 'canceled':
    case 'cancelled':
    case 'expired':
      return STATUS.failed;
    case 'in_progress':
    case 'processing':
    case 'running':
      return STATUS.processing;
    default:
      return STATUS.queued;
  }
}

export function createVideoProvider(settings) {
  switch (settings.video.provider) {
    case 'fal':
      return new FalVideoProvider(settings.video);
    case 'openai': {
      const openaiBase = settings.llm.providers?.openai?.baseUrl || 'https://api.openai.com/v1';
      return new OpenAiVideoProvider({ ...settings.video, baseUrl: openaiBase });
    }
    default:
      throw new ConfigurationError(`Unknown video provider: ${settings.video.provider}`);
  }
}

export { STATUS as VIDEO_STATUS };
