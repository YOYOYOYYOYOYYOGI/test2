/*
 * config.js - Static configuration, provider catalogue and default settings.
 * No secrets live here. This file only describes which providers exist and
 * what settings they need.
 */

export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'reelforge:settings:v1',
  HISTORY: 'reelforge:history:v1',
  DRAFT: 'reelforge:draft:v1',
  JOBS: 'reelforge:jobs:v1',
  ONBOARDED: 'reelforge:onboarded:v1',
});

export const IMAGE_DB_NAME = 'reelforge-media';
export const IMAGE_DB_STORE = 'videos';
export const STORED_VIDEO_LIMIT = 5;
export const MAX_STORED_VIDEO_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1024;

export const UGC_STYLES = [
  'Natural selfie / talking head',
  'Unboxing and first reaction',
  'Day-in-the-life testimonial',
  'Problem-solution demo',
  'Before vs after results',
  'Funny / relatable skit',
];

export const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese',
  'Italian', 'Dutch', 'Polish', 'Romanian', 'Hindi',
  'Arabic', 'Indonesian', 'Japanese',
];

export const CREATOR_STYLES = [
  'Friendly female creator, age 22-30, natural makeup',
  'Energetic male creator, age 22-35',
  'Calm, trustworthy female creator, age 30-45',
  'Young Gen-Z female creator, trendy style',
  'Fitness-focused creator, athletic look',
  'Beauty / skincare creator, soft lighting aesthetic',
  'Tech reviewer creator, clean casual style',
];

export const VIDEO_DURATIONS = [5, 8, 10, 15];

export const DEFAULT_CTA = 'Tap the link and grab yours before the offer ends.';

export function defaultSettings() {
  return {
    version: 1,
    mode: 'direct', // 'direct' | 'proxy'
    proxyUrl: '',
    proxyKey: '',
    llm: { provider: 'local', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    image: { provider: 'fal', apiKey: '', model: 'fal-ai/flux/kontext/max' },
    video: { provider: 'fal', apiKey: '', model: 'fal-ai/kling-video/v2/master/image-to-video', pollInterval: 5 },
    defaults: {
      duration: 8,
      ugcStyle: UGC_STYLES[0],
      language: 'English',
      creatorStyle: CREATOR_STYLES[0],
      cta: DEFAULT_CTA,
    },
  };
}

/*
 * Provider catalogue. The UI renders credentials/fields from this list and the
 * provider layer (scripts/providers/*) looks these ids up. Adding a provider =
 * adding an entry here + an adapter in the matching providers module.
 */
export const PROVIDERS = Object.freeze({
  llm: [
    {
      id: 'local',
      label: 'Local templates (offline, text only)',
      secret: false,
      docs: 'No network calls. Builds scripts and hooks from templates on your device.',
    },
    {
      id: 'openai',
      label: 'OpenAI-compatible Chat API (OpenAI, OpenRouter, Groq, Together, local servers)',
      secret: true,
      docs: 'Uses POST {baseUrl}/chat/completions. Your key is stored locally and sent directly to the API origin you choose.',
    },
    {
      id: 'fal',
      label: 'fal.ai language model (fal-ai/any-llm)',
      secret: true,
      docs: 'Uses the fal.ai queue API with any chat model you specify, e.g. fal-ai/any-llm.',
    },
  ],
  image: [
    {
      id: 'fal',
      label: 'fal.ai image models (Flux Kontext / Flux Dev / Flux Schnell)',
      secret: true,
      supportsReferenceImage: true,
      models: [
        'fal-ai/flux/kontext/max',
        'fal-ai/flux/dev',
        'fal-ai/flux/schnell',
        'fal-ai/bytedance/seedream/v4/edit',
      ],
      docs: 'Kontext and Seedream accept the product image as a visual reference so the generated creator matches the product.',
    },
    {
      id: 'openai',
      label: 'OpenAI image API (gpt-image-1 / dall-e-3)',
      secret: true,
      supportsReferenceImage: false,
      models: ['gpt-image-1', 'dall-e-3'],
      docs: 'Text-to-image through POST {baseUrl}/images/generations. The creator is generated from the product description.',
    },
  ],
  video: [
    {
      id: 'fal',
      label: 'fal.ai image-to-video models (Kling, MiniMax, Wan, Veo)',
      secret: true,
      models: [
        'fal-ai/kling-video/v2/master/image-to-video',
        'fal-ai/minimax/video-01/image-to-video',
        'fal-ai/wan/v2.2/image-to-video',
        'fal-ai/veo3/fast',
        'fal-ai/veo3',
      ],
      docs: 'The creator image is sent as the first frame / reference. Output MP4 URLs are returned by the fal queue API.',
    },
    {
      id: 'openai',
      label: 'OpenAI video API (Sora)',
      secret: true,
      models: ['sora-2'],
      docs: 'POST {baseUrl}/videos, poll GET /videos/{id}, download GET /videos/{id}/content. Text-to-video; the creator image informs the written prompt.',
    },
  ],
});

export const PRODUCT_FIELDS = [
  { key: 'name', label: 'Product Name', required: true, placeholder: 'e.g. GlowDrop Hydrating Serum', multiline: false },
  { key: 'description', label: 'Product Description', required: true, placeholder: 'What the product is and what it does.', multiline: true },
  { key: 'benefits', label: 'Product Benefits', required: false, placeholder: 'Key benefits, one per line.', multiline: true },
  { key: 'audience', label: 'Target Audience', required: false, placeholder: 'e.g. women 25-40 with dry skin.', multiline: false },
  { key: 'problem', label: 'Main Problem', required: false, placeholder: 'The pain point your product solves.', multiline: true },
  { key: 'solution', label: 'Main Solution', required: false, placeholder: 'How the product solves it.', multiline: true },
  { key: 'offer', label: 'Offer / Price', required: false, placeholder: 'e.g. 20% off first order, $19.99.', multiline: false },
  { key: 'cta', label: 'Call To Action', required: false, placeholder: 'What should the viewer do?', multiline: false },
];

export const SCRIPT_SECTIONS = ['HOOK', 'PROBLEM', 'SOLUTION', 'PRODUCT', 'BENEFIT', 'CTA'];
