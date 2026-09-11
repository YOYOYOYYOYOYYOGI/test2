/*
 * LLM (script / hook / product-copy) provider adapters.
 * Each adapter implements: chat(messages, opts), test().
 */

import { httpJson } from '../util.js';
import { ConfigurationError, ProviderError } from '../errors.js';

class OpenAiChatProvider {
  constructor(config) {
    this.config = config;
  }

  base() {
    return (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  async chat(messages, { json = false, maxTokens = 900, timeoutMs = 90000 } = {}) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing API key for the language model.');
    const payload = {
      model: this.config.model || 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: maxTokens,
    };
    if (json) payload.response_format = { type: 'json_object' };
    const { data } = await httpJson({
      method: 'POST',
      url: `${this.base()}/chat/completions`,
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: payload,
      timeoutMs,
    });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError('The language model returned an empty response.');
    }
    return content;
  }

  async test() {
    if (!this.config.apiKey) throw new ConfigurationError('Missing API key for the language model.');
    const { status } = await httpJson({
      method: 'GET',
      url: `${this.base()}/models`,
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      timeoutMs: 20000,
    });
    return { ok: true, message: `Connected (HTTP ${status}). Models endpoint accepted the API key.` };
  }
}

class FalChatProvider {
  constructor(config) {
    this.config = config;
    this.endpoint = 'fal-ai/any-llm';
  }

  async chat(messages, { json = false, maxTokens = 900, timeoutMs = 120000 } = {}) {
    if (!this.config.apiKey) throw new ConfigurationError('Missing fal.ai API key.');
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const convo = messages.filter((m) => m.role !== 'system');
    const payload = {
      model: this.config.model || 'openai/gpt-4o-mini',
      messages: convo,
      system_prompt: system || undefined,
      max_tokens: maxTokens,
      temperature: 0.8,
    };
    if (json) payload.response_format = { type: 'json_object' };
    const { data } = await httpJson({
      method: 'POST',
      url: `https://queue.fal.run/${this.endpoint}`,
      headers: { Authorization: `Key ${this.config.apiKey}` },
      body: payload,
      timeoutMs,
    });
    // fal queue: submit returns request_id; run-mode (used by some gateways) returns the result directly.
    if (data?.request_id) {
      const result = await pollFalResult(this.config.apiKey, this.endpoint, data.request_id, timeoutMs);
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
    const reply = await this.chat(
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { maxTokens: 5, timeoutMs: 60000 },
    );
    return { ok: true, message: `Connected. Model replied: "${reply.trim().slice(0, 40)}".` };
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
  switch (settings.llm.provider) {
    case 'openai':
      return new OpenAiChatProvider(settings.llm);
    case 'fal':
      return new FalChatProvider(settings.llm);
    case 'local':
      return null; // Local templates live in script-generator.js and need no network.
    default:
      throw new ConfigurationError(`Unknown language provider: ${settings.llm.provider}`);
  }
}
