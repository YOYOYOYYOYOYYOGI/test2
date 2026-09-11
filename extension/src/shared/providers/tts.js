/**
 * ReelForge — text-to-speech adapter.
 *
 * Providers: OpenAI TTS, ElevenLabs. Returns an audio Blob; duration is
 * measured after decode so scene timing and voice always stay in sync.
 *
 * Internal contract:
 *   synthesizeSpeech(text, { voiceId, speed, model, signal }) -> { blob, mime }
 *   listVoices() -> [{ id, name, labels, previewUrl? }]
 */

import { providerFetch, ProviderError } from './transport.js';

/** OpenAI's fixed voice catalog (verified against the official API docs). */
export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', labels: { gender: 'neutral', accent: 'American' } },
  { id: 'ash', name: 'Ash', labels: { gender: 'male', accent: 'American' } },
  { id: 'ballad', name: 'Ballad', labels: { gender: 'male', accent: 'American' } },
  { id: 'coral', name: 'Coral', labels: { gender: 'female', accent: 'American' } },
  { id: 'echo', name: 'Echo', labels: { gender: 'male', accent: 'American' } },
  { id: 'fable', name: 'Fable', labels: { gender: 'neutral', accent: 'British' } },
  { id: 'nova', name: 'Nova', labels: { gender: 'female', accent: 'American' } },
  { id: 'sage', name: 'Sage', labels: { gender: 'female', accent: 'American' } },
  { id: 'shimmer', name: 'Shimmer', labels: { gender: 'female', accent: 'American' } },
  { id: 'verse', name: 'Verse', labels: { gender: 'male', accent: 'American' } },
];

export async function synthesizeSpeech(text, { voiceId, speed = 1.0, model, signal, voiceInstructions } = {}) {
  if (!text || !text.trim()) throw new ProviderError('Nothing to speak — the scene has no dialogue.');
  const { resolveTransport } = await import('./transport.js');
  const t = await resolveTransport('tts');
  const cfg = t.settings.tts;

  if (t.provider === 'openai') {
    const body = {
      model: model || cfg.model || 'gpt-4o-mini-tts',
      voice: voiceId || cfg.voiceId || 'coral',
      input: text,
      speed: Math.max(0.25, Math.min(4, Number(speed) || 1)),
      response_format: 'mp3',
    };
    if (voiceInstructions) body.instructions = voiceInstructions;
    const res = await providerFetch('tts', 'audio/speech', { body, signal });
    return { blob: await res.blob(), mime: 'audio/mpeg' };
  }

  if (t.provider === 'elevenlabs') {
    const voice = voiceId || cfg.voiceId;
    if (!voice) throw new ProviderError('Pick an ElevenLabs voice in Settings → Voice.');
    const m = model || cfg.model || 'eleven_multilingual_v2';
    const body = {
      text,
      model_id: m,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.35,
        use_speaker_boost: true,
        speed: Math.max(0.7, Math.min(1.2, Number(speed) || 1)),
      },
    };
    const res = await providerFetch('tts', `text-to-speech/${encodeURIComponent(voice)}`, {
      body,
      headers: { Accept: 'audio/mpeg' },
      signal,
    });
    return { blob: await res.blob(), mime: 'audio/mpeg' };
  }

  throw new ProviderError(`Unknown TTS provider "${t.provider}"`);
}

/** Fetch the selectable voice list for the configured TTS provider. */
export async function listVoices() {
  const { resolveTransport } = await import('./transport.js');
  const t = await resolveTransport('tts');
  if (t.provider === 'openai') return OPENAI_VOICES;
  if (t.provider === 'elevenlabs') {
    const res = await providerFetch('tts', 'voices', { method: 'GET' });
    const data = await res.json();
    return (data?.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      labels: v.labels || {},
      previewUrl: v.preview_url || null,
      category: v.category || '',
    }));
  }
  return [];
}
