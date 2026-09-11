/**
 * ReelForge — LLM adapter (script understanding, storyboard, hooks, product vision).
 *
 * Supported providers: openai, anthropic, gemini, and any OpenAI-compatible API
 * (Groq, OpenRouter, LM Studio, Ollama-openai, …) via a custom base URL.
 *
 * Internal contract (provider-independent):
 *   chat({ system, messages, json, images, temperature, maxTokens }) -> { text }
 *   chatJSON({...}) -> parsed JSON (throws a readable error when the model returns invalid JSON)
 *
 * `images` attaches images to the LAST user message (vision): array of data URLs.
 */

import { providerFetch, resolveTransport } from './transport.js';
import { extractJson } from '../core/utils.js';

function toOpenAIMessages({ system, messages, images }) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  const msgs = messages || [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const isLast = i === msgs.length - 1;
    if (isLast && images?.length && m.role === 'user') {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function toAnthropicBody({ system, messages, images, maxTokens, temperature }) {
  const msgs = (messages || []).map((m, i) => {
    const isLast = i === (messages.length - 1);
    if (isLast && images?.length && m.role === 'user') {
      return {
        role: 'user',
        content: [
          ...images.map((url) => {
            const [head, b64] = String(url).split(',');
            const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
            return { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
          }),
          { type: 'text', text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
  return {
    model: undefined, // filled by caller
    max_tokens: maxTokens || 4096,
    temperature,
    system: system || undefined,
    messages: msgs,
  };
}

function toGeminiBody({ system, messages, images }) {
  const contents = [];
  const msgs = messages || [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    const isLast = i === msgs.length - 1;
    if (isLast && images?.length && role === 'user') {
      for (const url of images) {
        const [head, b64] = String(url).split(',');
        const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
        parts.push({ inline_data: { mime_type: mime, data: b64 } });
      }
    }
    parts.push({ text: m.content });
    contents.push({ role, parts });
  }
  return {
    system_instruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: undefined, // filled by caller
  };
}

/**
 * Main entry. opts: { system, messages:[{role,content}], json:boolean,
 * images:[dataURL], temperature, maxTokens, signal }
 * Returns { text, usage? }.
 */
export async function chat(opts) {
  const t = await resolveTransport('llm');
  const cfg = t.settings.llm;
  const model = cfg.model || undefined;
  if (!model) throw new Error('No LLM model set. Open Settings → Providers → LLM.');
  const provider = t.provider;

  if (provider === 'openai' || provider === 'openai-compat') {
    const body = {
      model,
      messages: toOpenAIMessages(opts),
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens || 4096,
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    const res = await providerFetch('llm', 'chat/completions', { body, signal: opts.signal });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('LLM returned an unexpected response shape (openai).');
    return { text, usage: data.usage };
  }

  if (provider === 'anthropic') {
    const body = toAnthropicBody(opts);
    body.model = model;
    if (opts.json) {
      // Instruct + prefill assistant brace for reliable JSON.
      body.messages.push({ role: 'assistant', content: '{' });
    }
    const res = await providerFetch('llm', 'messages', { body, signal: opts.signal });
    const data = await res.json();
    const text = (data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (!text) throw new Error('LLM returned an unexpected response shape (anthropic).');
    return { text: opts.json ? '{' + text : text, usage: data.usage };
  }

  if (provider === 'gemini') {
    const body = toGeminiBody(opts);
    body.generationConfig = {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxTokens || 8192,
      ...(opts.json ? { response_mime_type: 'application/json' } : {}),
    };
    const url = `models/${encodeURIComponent(model)}:generateContent`;
    const res = await providerFetch('llm', url, { body, signal: opts.signal });
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error('LLM returned an unexpected response shape (gemini).');
    return { text, usage: data.usageMetadata };
  }

  throw new Error(`Unknown LLM provider "${provider}"`);
}

/** chat + robust JSON parsing. Throws with the raw text attached when invalid. */
export async function chatJSON(opts) {
  let result;
  try {
    result = await chat({ ...opts, json: true });
  } catch (err) {
    // Some providers reject response_format; retry without it.
    if (opts.allowNoJsonFallback !== false) {
      result = await chat({ ...opts, json: false });
    } else throw err;
  }
  const parsed = extractJson(result.text);
  if (parsed == null) {
    const err = new Error('The AI response was not valid JSON. Try again or switch model.');
    err.raw = result.text?.slice(0, 1000);
    throw err;
  }
  return parsed;
}

/** Quick connectivity test used by Settings → "Test connection". */
export async function testLLM() {
  const t = await resolveTransport('llm');
  if (t.provider === 'gemini') {
    const res = await providerFetch('llm', 'models', { method: 'GET' });
    const data = await res.json();
    return { ok: true, info: `${(data.models || []).length} models available` };
  }
  const { text } = await chat({
    system: 'Reply with exactly: OK',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 16, temperature: 0,
  });
  return { ok: true, info: `Model replied: ${text.trim().slice(0, 40)}` };
}
