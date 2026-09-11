import { ElevenLabsProvider } from './elevenlabs.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { planLocally } from './local-planner.js';

function env(name, fallback = '') { return process.env[name] || fallback; }

export function providerRegistry() {
  const llm = env('OPENAI_API_KEY') ? new OpenAICompatibleProvider({ apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), model: env('LLM_MODEL', 'gpt-4o-mini') }) : null;
  let voices = {}; try { voices = JSON.parse(env('ELEVENLABS_VOICES_JSON', '{}')); } catch { voices = {}; }
  const tts = env('ELEVENLABS_API_KEY') && env('ELEVENLABS_VOICE_ID') ? new ElevenLabsProvider({ apiKey: env('ELEVENLABS_API_KEY'), voiceId: env('ELEVENLABS_VOICE_ID'), voices, model: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2') }) : null;
  return { llm, tts };
}

export function publicProviderStatus() {
  const { llm, tts } = providerRegistry();
  return { llm: llm?.name || 'Local planner', llmConfigured: Boolean(llm), tts: tts?.name || 'Not configured', ttsConfigured: Boolean(tts) };
}

export async function analyzeWithProviders(payload) {
  const { llm } = providerRegistry();
  if (!llm) return { provider: 'local', scenes: planLocally(payload) };
  try { return { provider: llm.name, scenes: await llm.analyze(payload) }; } catch (error) { error.provider = llm.name; throw error; }
}

export async function synthesizeWithProvider(payload) {
  const { tts } = providerRegistry();
  if (!tts) { const error = new Error('No TTS provider is configured on the server. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to .env, then restart the gateway.'); error.status = 503; throw error; }
  return tts.synthesize(payload);
}
