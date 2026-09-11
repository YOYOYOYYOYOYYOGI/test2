/**
 * ReelForge — provider transport.
 *
 * Resolves WHERE a provider request goes and HOW it is authenticated:
 *
 *  - "direct" mode: the extension calls the provider API directly with the
 *    key the user pasted into Settings (stored locally, never synced).
 *    Suitable for personal use; some providers may rate-limit browser origins.
 *
 *  - "backend" mode (recommended / production): the extension calls your own
 *    backend (backend/ folder) at /api/proxy/<provider>/... and the backend
 *    injects the real secret keys from ITS environment variables. The extension
 *    never sees a secret key. See docs/SECURITY.md.
 */

import { BACKEND_PROXY_KEY, providerMeta } from './config.js';
import { loadSettings } from '../core/storage.js';

export class ProviderError extends Error {
  constructor(message, { status, provider, detail } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.provider = provider;
    this.detail = detail;
  }
}

/** Build the request context for a capability+provider given current settings. */
export async function resolveTransport(category, providerOverride) {
  const settings = await loadSettings();
  const cfg = settings[category] || {};
  const provider = providerOverride || cfg.provider || 'none';
  const result = { settings, category, provider, mode: settings.mode };

  if (settings.mode === 'backend') {
    const url = (settings.backend.url || '').replace(/\/+$/, '');
    if (!url) throw new ProviderError('Backend URL is not configured. Open Settings → Connection.', { provider });
    const proxyKey = BACKEND_PROXY_KEY[provider] || provider;
    return {
      ...result,
      kind: 'backend',
      base: `${url}/api/proxy/${proxyKey}`,
      headers: { 'x-ugc-token': settings.backend.token || '' },
    };
  }

  // Direct mode
  if (provider === 'none') {
    throw new ProviderError(`No provider is selected for "${category}". Open Settings → Providers to configure it.`, { provider });
  }
  const key = cfg.apiKey || '';
  if (!key && provider !== 'local') {
    throw new ProviderError(`Missing API key for ${category}/${provider}. Open Settings → Providers, or switch to backend mode.`, { provider });
  }
  const meta = providerMeta(category, provider);
  return {
    ...result,
    kind: 'direct',
    base: (cfg.baseUrl || meta?.baseUrl || '').replace(/\/+$/, ''),
    apiKey: key,
    headers: {},
  };
}

/**
 * Perform a request against a provider path, e.g. path 'chat/completions'.
 * `path` is appended to the resolved base URL. In backend mode the same path
 * is forwarded by the backend passthrough, which supplies the secret key.
 */
export async function providerFetch(category, path, { method = 'POST', body, headers = {}, formData, signal } = {}) {
  const t = await resolveTransport(category);
  const url = `${t.base}/${String(path).replace(/^\/+/, '')}`;

  const finalHeaders = { ...t.headers, ...headers };
  let payload;
  if (formData) {
    payload = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  // Direct-mode auth injection per provider family (backend mode injects server-side).
  if (t.kind === 'direct') {
    const p = t.provider;
    if (p === 'openai' || p === 'openai-compat') finalHeaders['Authorization'] = `Bearer ${t.apiKey}`;
    else if (p === 'anthropic') {
      finalHeaders['x-api-key'] = t.apiKey;
      finalHeaders['anthropic-version'] = '2023-06-01';
      finalHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
    } else if (p === 'stability') finalHeaders['Authorization'] = `Bearer ${t.apiKey}`;
    else if (p === 'elevenlabs') finalHeaders['xi-api-key'] = t.apiKey;
    else if (p === 'replicate') finalHeaders['Authorization'] = `Bearer ${t.apiKey}`;
    else if (p === 'gemini') {
      // Gemini uses ?key= query param, handled by callers via withKey().
    }
  }

  let res;
  try {
    let finalUrl = url;
    if (t.kind === 'direct' && t.provider === 'gemini' && !finalUrl.includes('key=')) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(t.apiKey);
    }
    res = await fetch(finalUrl, { method, headers: finalHeaders, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(
      `Could not reach ${category}/${t.provider} (${t.kind === 'backend' ? 'backend' : 'direct'}). ${err.message}`,
      { provider: t.provider }
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const txt = await res.text();
      try { detail = JSON.stringify(JSON.parse(txt)).slice(0, 800); } catch { detail = txt.slice(0, 500); }
    } catch { /* ignore */ }
    throw new ProviderError(
      `${category}/${t.provider} request failed (HTTP ${res.status}). ${detail}`,
      { status: res.status, provider: t.provider, detail }
    );
  }
  res.transport = t;
  return res;
}

/** Gemini authenticates with a query param — helper for callers that build URLs manually. */
export function withGeminiKey(path, apiKey) {
  return `${path}?key=${encodeURIComponent(apiKey)}`;
}
