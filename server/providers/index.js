import { ElevenLabsProvider } from './elevenlabs.js';
import { OpenAICompatibleProvider, OpenAIImageProvider } from './openai-compatible.js';
import { ReplicateVideoProvider } from './replicate-video.js';
import { generateHooksLocally, generateScriptLocally, planLocally } from './local-planner.js';

function env(name, fallback = '') { return process.env[name] || fallback; }
function optionalNumber(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }

export function providerRegistry() {
  const llm = env('OPENAI_API_KEY') ? new OpenAICompatibleProvider({ apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), model: env('LLM_MODEL', 'gpt-4o-mini') }) : null;
  let voices = {}; try { voices = JSON.parse(env('ELEVENLABS_VOICES_JSON', '{}')); } catch { voices = {}; }
  const tts = env('ELEVENLABS_API_KEY') && env('ELEVENLABS_VOICE_ID') ? new ElevenLabsProvider({ apiKey: env('ELEVENLABS_API_KEY'), voiceId: env('ELEVENLABS_VOICE_ID'), voices, model: env('ELEVENLABS_MODEL', 'eleven_multilingual_v2') }) : null;
  const image = env('OPENAI_API_KEY') ? new OpenAIImageProvider({ apiKey: env('OPENAI_API_KEY'), baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), model: env('IMAGE_MODEL', 'gpt-image-1') }) : null;
  const video = env('REPLICATE_API_TOKEN') && (env('REPLICATE_VIDEO_MODEL') || env('REPLICATE_VIDEO_VERSION')) ? new ReplicateVideoProvider({ token: env('REPLICATE_API_TOKEN'), model: env('REPLICATE_VIDEO_MODEL'), version: env('REPLICATE_VIDEO_VERSION'), promptField: env('VIDEO_PROMPT_FIELD', 'prompt'), imageField: env('VIDEO_IMAGE_FIELD', 'image'), referenceImagesField: env('VIDEO_REFERENCE_IMAGES_FIELD', ''), audioField: env('VIDEO_AUDIO_FIELD', 'audio'), negativePromptField: env('VIDEO_NEGATIVE_PROMPT_FIELD', 'negative_prompt'), baseUrl: env('VIDEO_PROVIDER_BASE_URL', 'https://api.replicate.com') }) : null;
  return { llm, tts, image, video };
}

export function publicProviderStatus() {
  const { llm, tts, image, video } = providerRegistry();
  return { llm: llm?.name || 'Local planner', llmConfigured: Boolean(llm), tts: tts?.name || 'Not configured', ttsConfigured: Boolean(tts), image: image?.name || 'Required for photo-real creator generation', imageConfigured: Boolean(image), video: video?.name || 'Required for AI scene video', videoConfigured: Boolean(video), hooks: Boolean(llm) ? 'LLM hook generator' : 'Local hook library' };
}

export async function analyzeWithProviders(payload) {
  const { llm } = providerRegistry();
  if (!llm) return { provider: 'local', scenes: planLocally(payload) };
  try { return { provider: llm.name, scenes: await llm.analyze(payload) }; } catch (error) { error.provider = llm.name; throw error; }
}

export async function understandAssetsWithProviders(payload) {
  const { llm } = providerRegistry();
  if (!llm) return { provider: 'local', productDescription: payload.productContext || '', visualFeatures: payload.images?.length ? ['Reference image supplied; configure an LLM vision provider for automatic product reading.'] : [], packagingText: [], usageIdeas: [], safetyNotes: [] };
  return { provider: llm.name, ...(await llm.understandAssets(payload)) };
}

export async function generateHooksWithProviders(payload) {
  const { llm } = providerRegistry();
  if (!llm) return { provider: 'local', hooks: generateHooksLocally(payload) };
  return { provider: llm.name, hooks: await llm.generateHooks(payload) };
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
  const result = await llm.analyze({ script: prompt, style: 'Instagram Reel scriptwriter', ratio: '9:16', brandKit: payload.brandKit, knowledge: payload.knowledge, productName: payload.productName, productContext: payload.productContext, template: ['Hook', 'Problem', 'Product', 'Benefits', 'Proof / Result', 'CTA'] });
  return { provider: llm.name, script: result.map(scene => scene.script).join(' ') };
}

export async function generateCreatorWithProvider(payload) {
  const { image } = providerRegistry();
  if (!image) { const error = new Error('Photo-real creator generation requires an image provider. Configure OPENAI_API_KEY and IMAGE_MODEL on the secure gateway, or upload a real creator image.'); error.status = 503; throw error; }
  return image.generateCreator(payload);
}

export function getVideoProvider() { return providerRegistry().video; }
export async function generateSceneWithProvider(payload) {
  const video = getVideoProvider();
  if (!video) { const error = new Error('AI scene video requires a configured Replicate video model. Set REPLICATE_API_TOKEN and REPLICATE_VIDEO_MODEL in the secure gateway.'); error.status = 503; throw error; }
  return video.start(payload);
}
export async function pollSceneWithProvider(providerJobId) {
  const video = getVideoProvider();
  if (!video) { const error = new Error('The configured video provider is unavailable.'); error.status = 503; throw error; }
  return video.poll(providerJobId);
}
