import { ElevenLabsProvider } from './elevenlabs.js';
import { OpenAICompatibleProvider, OpenAIImageProvider } from './openai-compatible.js';
import { generateScriptLocally, planLocally } from './local-planner.js';

function env(name, fallback = '') { return process.env[name] || fallback; }

export function providerRegistry() {
  const llm = env('OPENAI_API_KEY') ? new OpenAICompatibleProvider({ apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), model: env('LLM_MODEL', 'gpt-4o-mini') }) : null;
  let voices = {}; try { voices = JSON.parse(env('ELEVENLABS_VOICES_JSON', '{}')); } catch { voices = {}; }
  const tts = env('ELEVENLABS_API_KEY') && env('ELEVENLABS_VOICE_ID') ? new ElevenLabsProvider({ apiKey: env('ELEVENLABS_API_KEY'), voiceId: env('ELEVENLABS_VOICE_ID'), voices, model: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2') }) : null;
  const image = env('OPENAI_API_KEY') ? new OpenAIImageProvider({ apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), model: env('IMAGE_MODEL', 'gpt-image-1') }) : null;
  return { llm, tts, image };
}

export function publicProviderStatus() {
  const { llm, tts, image } = providerRegistry();
  return { llm: llm?.name || 'Local planner', llmConfigured: Boolean(llm), tts: tts?.name || 'Not configured', ttsConfigured: Boolean(tts), image: image?.name || 'Built-in creator fallback', imageConfigured: Boolean(image) };
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

export async function generateScriptWithProviders(payload) {
  const { llm } = providerRegistry();
  if (!llm) return { provider: 'local', script: generateScriptLocally(payload) };
  const prompt = `Write one natural, conversational Instagram Reel UGC script for ${payload.brandName || 'the brand'} ${payload.productName || 'the product'}. Product context: ${payload.productContext || 'not provided'}. Use Hook → Problem → Product → Benefits → Proof/Result → CTA. Keep it 70-120 words, avoid unsupported medical claims, sound like a real creator, and end with this CTA: ${payload.cta || 'Shop now'}. Return only the spoken script.`;
  const result = await llm.analyze({ script: prompt, style: 'Instagram Reel scriptwriter', ratio: '9:16', brandKit: payload.brandKit, knowledge: payload.knowledge });
  return { provider: llm.name, script: result.map(scene => scene.script).join(' ') };
}

export async function generateCreatorWithProvider(payload) {
  const { image } = providerRegistry();
  if (!image) { const error = new Error('No image provider is configured. The extension will use its built-in UGC creator fallback.'); error.status = 503; throw error; }
  return image.generateCreator(payload);
}
