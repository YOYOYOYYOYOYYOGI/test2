/*
 * LLM (script / hook / product-copy) provider adapters.
 * Each adapter implements: chat(messages, opts), test().
 *
 * Every provider gets its own credential set (see scripts/config.js); a
 * Gemini key is only sent to Google, an OpenAI key only to the OpenAI base URL,
 * and so on. Authentication failures are reported with a provider-specific
 * instruction that never contains the key itself.
 */

import { httpJson } from '../util.js';
import { ConfigurationError, ProviderError } from '../errors.js';
import { activeLlm, LLM_PROVIDER_LABELS } from '../config.js';

function authMessage(label) {
  return `${label} connection failed — please check your ${label} API key.`;
}

/* Returns true for the status codes providers use for bad/missing credentials. */
function isAuthStatus(status) {
  return status === 401 || status === 403;
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible chat (OpenAI, OpenRouter, Groq, Together)         */
/* ------------------------------------------------------------------ */
class OpenAiChatProvider {
  constructor(cfg, label) {
    this.cfg = cfg;
    this.label = label || 'OpenAI';
  }

  base() {
    return (this.cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  async chat(messages, { json = false, maxTokens = 900, timeoutMs = 90000 } = {}) {
    if (!this.cfg.apiKey) throw new ConfigurationError(`Missing ${this.label} API key.`);
    const payload = {
      model: this.cfg.model || 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: maxTokens,
    };
    if (json) payload.response_format = { type: 'json_object' };
    let response;
    try {
      response = await httpJson({
        method: 'POST',
        url: `${this.base()}/chat/completions`,
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        body: payload,
        timeoutMs,
      });
    } catch (err) {
      if (isAuthStatus(err.status)) throw new ProviderError(authMessage(this.label), { status: err.status });
      throw err;
    }
    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError(`${this.label} returned an empty response.`);
    }
    return content;
  }

  async test() {
    if (!this.cfg.apiKey) throw new ConfigurationError(`Missing ${this.label} API key.`);
    try {
      const { status } = await httpJson({
        method: 'GET',
        url: `${this.base()}/models`,
        headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        timeoutMs: 20000,
      });
      return { ok: true, message: `Connected to ${this.label} (HTTP ${status}). The API key was accepted.` };
    } catch (err) {
      if (isAuthStatus(err.status)) throw new ProviderError(authMessage(this.label), { status: err.status });
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Google Gemini (native generativelanguage API)                       */
/* ------------------------------------------------------------------ */
class GeminiChatProvider {
  constructor(cfg) {
    this.cfg = cfg;
    this.label = 'Gemini';
  }

  base() {
    return (this.cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  }

  model() {
    return this.cfg.model || 'gemini-2.5-flash';
  }

  /* Convert {role, content} chat messages to Gemini contents + systemInstruction. */
  static toGeminiRequest(messages, { json, maxTokens }) {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content).filter(Boolean);
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const generationConfig = { temperature: 0.8, maxOutputTokens: maxTokens };
    if (json) generationConfig.responseMimeType = 'application/json';
    const body = { contents, generationConfig };
    if (systemParts.length) body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
    return body;
  }

  static extractText(data) {
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (text) return text;
    if (candidate?.finishReason === 'SAFETY' || data?.promptFeedback?.blockReason) {
      throw new ProviderError('Gemini blocked the request with a safety filter. Rephrase the product description or script brief.');
    }
    throw new ProviderError('Gemini returned an empty response.');
  }

  async chat(messages, { json = false, maxTokens = 1024, timeoutMs = 90000 } = {}) {
    if (!this.cfg.apiKey) throw new ConfigurationError('Missing Gemini API key.');
    const url = `${this.base()}/models/${encodeURIComponent(this.model())}:generateContent`;
    let response;
    try {
      response = await httpJson({
        method: 'POST',
        url,
        // Google's documented auth method; the key is a header, never a URL parameter.
        headers: { 'x-goog-api-key': this.cfg.apiKey },
        body: GeminiChatProvider.toGeminiRequest(messages, { json, maxTokens }),
        timeoutMs,
      });
    } catch (err) {
      if (isAuthStatus(err.status) || this.looksLikeBadKey(err)) {
        throw new ProviderError(authMessage(this.label), { status: err.status || 401 });
      }
      throw err;
    }
    return GeminiChatProvider.extractText(response.data);
  }

  /* Gemini answers invalid keys with HTTP 400 and API_KEY_INVALID / API_KEY_EXPIRED. */
  looksLikeBadKey(err) {
    const haystack = `${err.details || ''} ${err.message || ''}`;
    return err.status === 400 && /API_KEY_INVALID|API_KEY_EXPIRED|API key not valid|invalid api key/i.test(haystack);
  }

  async test() {
    if (!this.cfg.apiKey) throw new ConfigurationError('Missing Gemini API key.');
    try {
      await httpJson({
        method: 'GET',
        url: `${this.base()}/models?pageSize=1`,
        headers: { 'x-goog-api-key': this.cfg.apiKey },
        timeoutMs: 20000,
      });
      return { ok: true, message: 'Connected to Google Gemini. The Gemini API key was accepted.' };
    } catch (err) {
      if (isAuthStatus(err.status) || this.looksLikeBadKey(err)) {
        throw new ProviderError(authMessage(this.label), { status: err.status || 401 });
      }
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/* fal.ai any-llm                                                        */
/* ------------------------------------------------------------------ */
class FalChatProvider {
  constructor(cfg) {
    this.cfg = cfg;
    this.endpoint = 'fal-ai/any-llm';
  }

  async chat(messages, { json = false, maxTokens = 900, timeoutMs = 120000 } = {}) {
    if (!this.cfg.apiKey) throw new ConfigurationError('Missing fal.ai API key.');
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const convo = messages.filter((m) => m.role !== 'system');
    const payload = {
      model: this.cfg.model || 'openai/gpt-4o-mini',
      messages: convo,
      system_prompt: system || undefined,
      max_tokens: maxTokens,
      temperature: 0.8,
    };
    if (json) payload.response_format = { type: 'json_object' };
    const { data } = await httpJson({
      method: 'POST',
      url: `https://queue.fal.run/${this.endpoint}`,
      headers: { Authorization: `Key ${this.cfg.apiKey}` },
      body: payload,
      timeoutMs,
    });
    if (data?.request_id) {
      const result = await pollFalResult(this.cfg.apiKey, this.endpoint, data.request_id, timeoutMs);
      const content = result?.choices?.[0]?.message?.content || result?.output;
      if (typeof content !== 'string' || !content.trim()) {
        throw new ProviderError('fal.ai returned an empty language response.');
      }
      return content;
    }
    const direct = data?.choices?.[0]?.message?.content || data?.output;
    if (typeof direct === 'string' && direct.trim()) return direct;
    throw new ProviderError('fal.ai returned an unexpected language response.', { details: JSON.stringify(data).slice(0, 300) });
  }

  async test() {
    if (!this.cfg.apiKey) throw new ConfigurationError('Missing fal.ai API key.');
    try {
      const reply = await this.chat(
        [{ role: 'user', content: 'Reply with the single word: ok' }],
        { maxTokens: 5, timeoutMs: 60000 },
      );
      return { ok: true, message: `Connected to fal.ai. Model replied: "${reply.trim().slice(0, 40)}".` };
    } catch (err) {
      if (isAuthStatus(err.status)) throw new ProviderError(authMessage('fal.ai'), { status: err.status });
      throw err;
    }
  }
}

/* Polling helper shared by fal adapters. */
export async function pollFalResult(apiKey, endpoint, requestId, timeoutMs) {
  const started = Date.now();
  const statusUrl = `https://queue.fal.run/${endpoint}/requests/${requestId}/status?logs=1`;
  const resultUrl = `https://queue.fal.run/${endpoint}/requests/${requestId}`;
  while (Date.now() - started < timeoutMs) {
    const { data: status } = await httpJson({
      method: 'GET',
      url: statusUrl,
      headers: { Authorization: `Key ${apiKey}` },
      timeoutMs: 30000,
    });
    if (status.status === 'COMPLETED') {
      const { data } = await httpJson({
        method: 'GET',
        url: resultUrl,
        headers: { Authorization: `Key ${apiKey}` },
        timeoutMs: 60000,
      });
      return data;
    }
    if (status.status === 'FAILED' || status.status === 'ERROR') {
      throw new ProviderError(status.error || 'The fal.ai job failed.', { retryable: false });
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new ProviderError('The fal.ai job timed out.', { retryable: true });
}

export function createLlmProvider(settings) {
  const { id, cfg } = activeLlm(settings);
  switch (id) {
    case 'local':
      return null; // Local templates live in script-generator.js and need no network.
    case 'gemini':
      return new GeminiChatProvider(cfg);
    case 'openai':
    case 'openrouter':
    case 'groq':
    case 'together':
      return new OpenAiChatProvider(cfg, LLM_PROVIDER_LABELS[id]);
    case 'fal':
      return new FalChatProvider(cfg);
    default:
      throw new ConfigurationError(`Unknown language provider: ${id}`);
  }
}
