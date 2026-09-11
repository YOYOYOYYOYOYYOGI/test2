/**
 * ReelForge — provider catalog & metadata.
 *
 * Everything that talks to an external AI service goes through the provider
 * layer (see providers/*). Nothing is hard-coded to a single vendor: each
 * capability (LLM, image, video, tts, lipsync, music) exposes a list of
 * interchangeable providers, and the adapters in this folder normalize their
 * wire formats behind one internal API.
 *
 * Add a new provider by adding an entry here + an adapter branch in the
 * relevant capability module. No other code needs to change.
 */

export const CAPABILITIES = [
  { id: 'llm', label: 'Script / Storyboard AI (LLM)', required: true, hint: 'Understands the script, builds the storyboard, generates hooks. Vision-capable models also analyze product images.' },
  { id: 'image', label: 'Image Generation', required: false, hint: 'Generates photorealistic UGC scene stills, creator portraits and product shots.' },
  { id: 'video', label: 'Video Generation', required: false, hint: 'Optional: animates scenes into real AI video clips. Without it, ReelForge renders cinematic motion from scene images locally.' },
  { id: 'tts', label: 'Text-to-Speech (Voice)', required: false, hint: 'Generates the creator voice. Without it the video renders with captions + music only.' },
  { id: 'lipsync', label: 'Lip Sync', required: false, hint: 'Optional: animates the creator image with the generated voice for talking scenes.' },
  { id: 'music', label: 'Background Music', required: false, hint: 'Local procedural music generator works offline with no API key; premium tracks via provider or your own upload.' },
];

export const PROVIDERS = {
  llm: {
    openai: { label: 'OpenAI (GPT-4o / GPT-4o-mini)', keyLabel: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini', vision: true, baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], keyUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { label: 'Anthropic (Claude)', keyLabel: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-20250514', vision: true, baseUrl: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'], keyUrl: 'https://console.anthropic.com/settings/keys' },
    gemini: { label: 'Google Gemini', keyLabel: 'GEMINI_API_KEY', defaultModel: 'gemini-2.0-flash', vision: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'], keyUrl: 'https://aistudio.google.com/apikey' },
    'openai-compat': { label: 'OpenAI-compatible (Groq / OpenRouter / local)', keyLabel: 'API_KEY', defaultModel: '', vision: false, baseUrl: '', models: [], keyUrl: '' },
  },
  image: {
    openai: { label: 'OpenAI Images (gpt-image-1)', keyLabel: 'OPENAI_API_KEY', defaultModel: 'gpt-image-1', baseUrl: 'https://api.openai.com/v1', supportsRefs: true, keyUrl: 'https://platform.openai.com/api-keys' },
    stability: { label: 'Stability AI (SD 3.5 / Core)', keyLabel: 'STABILITY_API_KEY', defaultModel: 'core', baseUrl: 'https://api.stability.ai', supportsRefs: false, keyUrl: 'https://platform.stability.ai/account/keys' },
    replicate: { label: 'Replicate (FLUX Kontext — supports reference images)', keyLabel: 'REPLICATE_API_TOKEN', defaultModel: 'black-forest-labs/flux-kontext-pro', baseUrl: 'https://api.replicate.com/v1', supportsRefs: true, keyUrl: 'https://replicate.com/account/api-tokens' },
    fal: { label: 'fal.ai (FLUX — supports reference images)', keyLabel: 'FAL_KEY', defaultModel: 'fal-ai/flux-pro/v1.1/kontext', baseUrl: 'https://fal.run', supportsRefs: true, keyUrl: 'https://fal.ai/dashboard/keys' },
  },
  video: {
    replicate: { label: 'Replicate (image-to-video models)', keyLabel: 'REPLICATE_API_TOKEN', defaultModel: 'wan-video/wan-2.1-i2v-480p', baseUrl: 'https://api.replicate.com/v1', keyUrl: 'https://replicate.com/account/api-tokens' },
    fal: { label: 'fal.ai (image-to-video models)', keyLabel: 'FAL_KEY', defaultModel: 'fal-ai/kling-video/v1.6/standard/image-to-video', baseUrl: 'https://fal.run', keyUrl: 'https://fal.ai/dashboard/keys' },
  },
  tts: {
    openai: { label: 'OpenAI TTS', keyLabel: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini-tts', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
    elevenlabs: { label: 'ElevenLabs (multilingual, voice cloning)', keyLabel: 'ELEVENLABS_API_KEY', defaultModel: 'eleven_multilingual_v2', baseUrl: 'https://api.elevenlabs.io', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  },
  lipsync: {
    fal: { label: 'fal.ai (LatentSync / Sync lipsync)', keyLabel: 'FAL_KEY', defaultModel: 'fal-ai/latentsync', baseUrl: 'https://fal.run', keyUrl: 'https://fal.ai/dashboard/keys' },
    replicate: { label: 'Replicate (LatentSync)', keyLabel: 'REPLICATE_API_TOKEN', defaultModel: 'bytedance/latentsync', baseUrl: 'https://api.replicate.com/v1', keyUrl: 'https://replicate.com/account/api-tokens' },
  },
  music: {
    local: { label: 'Local Procedural Generator (offline, free)', keyLabel: null, defaultModel: '', baseUrl: '', keyUrl: '' },
    fal: { label: 'fal.ai Stable Audio', keyLabel: 'FAL_KEY', defaultModel: 'fal-ai/stable-audio', baseUrl: 'https://fal.run', keyUrl: 'https://fal.ai/dashboard/keys' },
  },
};

/** Providers whose API supports CORS from a browser (direct mode). Others should use backend mode. */
export const DIRECT_CORS_OK = new Set([
  'openai', 'anthropic', 'gemini', 'openai-compat', 'replicate', 'fal', 'elevenlabs',
]);

/** Map capability+provider → backend passthrough key (backend/src/lib/providers.js). */
export const BACKEND_PROXY_KEY = {
  openai: 'openai', 'openai-compat': 'openai-compat', anthropic: 'anthropic', gemini: 'gemini',
  stability: 'stability', replicate: 'replicate', fal: 'fal', elevenlabs: 'elevenlabs',
};

export function providerMeta(category, provider) {
  return PROVIDERS[category]?.[provider] || null;
}
