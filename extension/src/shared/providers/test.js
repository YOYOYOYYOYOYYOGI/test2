/**
 * ReelForge — provider connectivity tests used by Settings → "Test".
 * Uses cheap authenticated GET endpoints where the provider offers one; the
 * result is honest: a green check means the credential was accepted.
 */

import { providerFetch, resolveTransport } from './transport.js';

export async function testProvider(category) {
  const t = await resolveTransport(category);
  const p = t.provider;

  if (t.kind === 'backend') {
    // Backend mode: the extension cannot see keys; ask the backend to verify.
    const res = await fetch(`${t.base.replace(/\/proxy\/.*$/, '')}/api/health`, {
      headers: { 'x-ugc-token': t.settings.backend.token || '' },
    });
    if (!res.ok) throw new Error(`Backend health check failed (HTTP ${res.status}).`);
    const data = await res.json().catch(() => ({}));
    const hasKey = data.keys?.[p];
    return { ok: !!hasKey, info: hasKey ? `Backend online · key for ${p} present` : `Backend online but NO key configured for ${p} — set it in the backend .env` };
  }

  switch (p) {
    case 'openai':
    case 'openai-compat': {
      const res = await providerFetch(category, 'models', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Key accepted · ${(data.data || []).length} models visible` };
    }
    case 'anthropic': {
      const res = await providerFetch(category, 'models', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Key accepted · ${(data.data || []).length} models` };
    }
    case 'gemini': {
      const res = await providerFetch(category, 'models', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Key accepted · ${(data.models || []).length} models` };
    }
    case 'replicate': {
      const res = await providerFetch(category, 'account', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Token accepted · account: ${data.username || 'ok'}` };
    }
    case 'elevenlabs': {
      const res = await providerFetch(category, 'voices', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Key accepted · ${(data.voices || []).length} voices` };
    }
    case 'stability': {
      const res = await providerFetch(category, 'v1/user/account', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      return { ok: true, info: `Key accepted · ${data.email || 'account ok'}` };
    }
    case 'fal': {
      // fal has no free GET endpoint; a billing-free validation is not possible.
      return { ok: false, info: 'fal.ai keys are validated on first real request. Run a small generation to verify.' };
    }
    case 'local':
      return { ok: true, info: 'Local generator — always available, no key needed.' };
    default:
      return { ok: false, info: 'Select a provider to test.' };
  }
}
