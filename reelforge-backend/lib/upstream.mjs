/*
 * Upstream provider adapters for the ReelForge proxy.
 * Zero dependencies - uses the global fetch available in Node 18+.
 *
 * Supported upstreams:
 *   - fal.ai queue API (chat via fal-ai/any-llm, Flux images, image-to-video)
 *   - OpenAI-compatible APIs (chat/completions, images/generations, videos)
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Overridable for self-hosting/testing; defaults to the real fal queue API. */
function falRoot(env) {
  return (env.FAL_ROOT_URL || 'https://queue.fal.run').replace(/\/+$/, '');
}

async function jsonFetch(url, options = {}, { timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    throw new Error(`Network error contacting ${new URL(url).host}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Upstream HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.details = typeof data === 'object' ? JSON.stringify(data).slice(0, 500) : text.slice(0, 500);
    throw err;
  }
  return { status: response.status, data, response };
}

/* ---------------- fal.ai ---------------- */

export function falHeaders(env) {
  if (!env.FAL_KEY) throw new Error('FAL_KEY is not configured on the server.');
  return { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' };
}

export async function falSubmit(env, endpoint, input) {
  const { data } = await jsonFetch(`${falRoot(env)}/${endpoint}`, {
    method: 'POST',
    headers: falHeaders(env),
    body: JSON.stringify(input),
  });
  if (!data.request_id) throw new Error('fal.ai did not return a request id.');
  return data.request_id;
}

export async function falStatus(env, endpoint, requestId) {
  const { data } = await jsonFetch(
    `${falRoot(env)}/${endpoint}/requests/${requestId}/status?logs=1`,
    { headers: falHeaders(env) },
  );
  return data;
}

export async function falResult(env, endpoint, requestId) {
  const { data } = await jsonFetch(
    `${falRoot(env)}/${endpoint}/requests/${requestId}`,
    { headers: falHeaders(env) },
  );
  return data;
}

export async function falAwait(env, endpoint, requestId, { timeoutMs = 300000, onLog } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await falStatus(env, endpoint, requestId);
    if (status.status === 'COMPLETED') return falResult(env, endpoint, requestId);
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new Error(status.error || status.detail || 'fal.ai job failed.');
    }
    if (onLog && Array.isArray(status.logs) && status.logs.length) {
      onLog(status.logs[status.logs.length - 1].message);
    }
    await sleep(3000);
  }
  throw new Error('fal.ai job timed out.');
}

export async function falChat(env, messages, { json = false, maxTokens = 900, model } = {}) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = messages.filter((m) => m.role !== 'system');
  const input = {
    model: model || env.LLM_MODEL || 'openai/gpt-4o-mini',
    messages: convo,
    max_tokens: maxTokens,
    temperature: 0.8,
  };
  if (system) input.system_prompt = system;
  if (json) input.response_format = { type: 'json_object' };
  const result = await falAwait(env, 'fal-ai/any-llm', await falSubmit(env, 'fal-ai/any-llm', input), { timeoutMs: 120000 });
  const content = result?.choices?.[0]?.message?.content || result?.output;
  if (typeof content !== 'string' || !content.trim()) throw new Error('fal.ai LLM returned empty content.');
  return content;
}

export async function falImage(env, prompt, referenceDataUrl) {
  const endpoint = env.FAL_IMAGE_MODEL || 'fal-ai/flux/kontext/max';
  const input = { prompt, num_images: 1 };
  if (referenceDataUrl) {
    if (endpoint.includes('seedream')) {
      input.image_urls = [referenceDataUrl];
      input.optimize_prompt = false;
    } else if (endpoint.includes('kontext')) {
      input.image_url = referenceDataUrl;
      input.output_format = 'jpeg';
    }
  } else {
    input.image_size = { width: 768, height: 1344 };
  }
  const result = await falAwait(env, endpoint, await falSubmit(env, endpoint, input), { timeoutMs: 240000 });
  const first = result?.images?.[0] || result?.image;
  const url = typeof first === 'string' ? first : first?.url;
  if (!url) throw new Error('fal.ai returned no image.');
  return url;
}

export function falVideoInput(env, prompt, imageDataUrl, duration) {
  const endpoint = env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v2/master/image-to-video';
  const input = { prompt };
  if (endpoint.includes('image-to-video')) {
    input.image_url = imageDataUrl;
    if (endpoint.includes('kling')) input.duration = duration <= 5 ? 5 : 10;
  } else if (endpoint.includes('veo')) {
    input.aspect_ratio = '9:16';
    input.duration = String(duration);
  }
  return { endpoint, input };
}

export function extractFalVideoUrl(result) {
  if (!result) return null;
  if (typeof result.video === 'string') return result.video;
  if (result.video?.url) return result.video.url;
  if (Array.isArray(result.videos) && result.videos[0]) {
    return typeof result.videos[0] === 'string' ? result.videos[0] : result.videos[0].url;
  }
  if (result.output?.video?.url) return result.output.video.url;
  return result.url || null;
}

/* ---------------- OpenAI-compatible ---------------- */

export function openAiHeaders(env, { json = true } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured on the server.');
  const h = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export function openAiBase(env) {
  return (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

export async function openAiChat(env, messages, { json = false, maxTokens = 900 } = {}) {
  const payload = { model: env.LLM_MODEL || 'gpt-4o-mini', messages, temperature: 0.8, max_tokens: maxTokens };
  if (json) payload.response_format = { type: 'json_object' };
  const { data } = await jsonFetch(`${openAiBase(env)}/chat/completions`, {
    method: 'POST',
    headers: openAiHeaders(env),
    body: JSON.stringify(payload),
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Chat API returned empty content.');
  return content;
}

export async function openAiImage(env, prompt) {
  const model = env.IMAGE_MODEL || 'gpt-image-1';
  const { data } = await jsonFetch(`${openAiBase(env)}/images/generations`, {
    method: 'POST',
    headers: openAiHeaders(env),
    body: JSON.stringify({ model, prompt, n: 1, size: model.startsWith('dall') ? '1024x1792' : '1024x1536' }),
  }, { timeoutMs: 240000 });
  const item = data?.data?.[0];
  if (!item) throw new Error('Image API returned no image.');
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return item.url;
}

export async function openAiSubmitVideo(env, prompt, duration) {
  const { data } = await jsonFetch(`${openAiBase(env)}/videos`, {
    method: 'POST',
    headers: openAiHeaders(env),
    body: JSON.stringify({
      model: env.VIDEO_MODEL || 'sora-2',
      prompt,
      seconds: String(duration),
      size: '720x1280',
    }),
  });
  if (!data.id) throw new Error('Video API returned no id.');
  return data.id;
}

export async function openAiVideoStatus(env, externalId) {
  const { data } = await jsonFetch(`${openAiBase(env)}/videos/${externalId}`, {
    headers: openAiHeaders(env, { json: false }),
  });
  return data;
}

/* ---------------- Shared helpers ---------------- */

export async function downloadAsDataUrl(url, { headers = {}, timeoutMs = 180000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`, contentType, buffer };
}

export async function ping(env, kind) {
  if (kind === 'llm') {
    if (env.LLM_PROVIDER === 'fal') {
      // Cheap auth probe: a fake request id is 404 with a good key and 401 with a bad one.
      try {
        await jsonFetch(`${falRoot(env)}/fal-ai/any-llm/requests/auth-probe/status`, { headers: falHeaders(env) });
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw new Error('fal.ai rejected the API key.');
      }
      return 'fal.ai key accepted (language).';
    }
    const { status } = await jsonFetch(`${openAiBase(env)}/models`, { headers: openAiHeaders(env, { json: false }) });
    return `OpenAI-compatible host reachable, key accepted (HTTP ${status}).`;
  }
  if (kind === 'image') {
    if ((env.IMAGE_PROVIDER || 'fal') === 'fal') {
      try {
        await jsonFetch(`${falRoot(env)}/${env.FAL_IMAGE_MODEL || 'fal-ai/flux/schnell'}/requests/auth-probe/status`, { headers: falHeaders(env) });
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw new Error('fal.ai rejected the API key.');
      }
      return 'fal.ai key accepted (images).';
    }
    const { status } = await jsonFetch(`${openAiBase(env)}/models`, { headers: openAiHeaders(env, { json: false }) });
    return `OpenAI-compatible host reachable, key accepted (HTTP ${status}).`;
  }
  if (kind === 'video') {
    if ((env.VIDEO_PROVIDER || 'fal') === 'fal') {
      try {
        await jsonFetch(`${falRoot(env)}/${env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v2/master/image-to-video'}/requests/auth-probe/status`, { headers: falHeaders(env) });
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw new Error('fal.ai rejected the API key.');
      }
      return 'fal.ai key accepted (video).';
    }
    const { status } = await jsonFetch(`${openAiBase(env)}/models`, { headers: openAiHeaders(env, { json: false }) });
    return `OpenAI-compatible host reachable, key accepted (HTTP ${status}).`;
  }
  throw new Error(`Unknown test kind: ${kind}`);
}
