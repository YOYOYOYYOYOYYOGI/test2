function firstOutput(output) {
  if (Array.isArray(output)) return output[0] || null;
  if (typeof output === 'string') return output;
  return output?.url || null;
}

export class ReplicateVideoProvider {
  constructor({ token, model, version = '', promptField = 'prompt', imageField = 'image', referenceImagesField = '', audioField = 'audio', negativePromptField = 'negative_prompt', baseUrl = 'https://api.replicate.com' }) {
    this.token = token; this.model = model; this.version = version; this.promptField = promptField; this.imageField = imageField; this.referenceImagesField = referenceImagesField; this.audioField = audioField; this.negativePromptField = negativePromptField; this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  get name() { return `Replicate · ${this.model}`; }
  buildInput({ prompt, imageDataUrl, referenceImageDataUrls = [], audioDataUrl, duration, aspectRatio = '9:16', negativePrompt }) {
    const input = { [this.promptField]: prompt, duration, aspect_ratio: aspectRatio, [this.negativePromptField]: negativePrompt || 'cartoon, CGI, 3D render, plastic skin, deformed hands, text, watermark, random stock footage, product label changes' };
    if (imageDataUrl) input[this.imageField] = imageDataUrl;
    if (this.referenceImagesField && referenceImageDataUrls.length) input[this.referenceImagesField] = referenceImageDataUrls;
    if (audioDataUrl) input[this.audioField] = audioDataUrl;
    return input;
  }
  async start(payload) {
    const body = { input: this.buildInput(payload) }; if (this.version) body.version = this.version;
    const endpoint = this.version ? `${this.baseUrl}/v1/predictions` : `${this.baseUrl}/v1/models/${this.model}/predictions`;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', Prefer: 'wait=0' }, body: JSON.stringify(body) });
    if (!response.ok) { const detail = await response.text(); throw new Error(`Video provider returned ${response.status}: ${detail.slice(0, 300)}`); }
    const prediction = await response.json(); return { providerJobId: prediction.id, status: prediction.status || 'starting', output: firstOutput(prediction.output), provider: this.name };
  }
  async poll(providerJobId) {
    const response = await fetch(`${this.baseUrl}/v1/predictions/${encodeURIComponent(providerJobId)}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) { const detail = await response.text(); throw new Error(`Video job lookup returned ${response.status}: ${detail.slice(0, 240)}`); }
    const prediction = await response.json(); return { providerJobId, status: prediction.status, output: firstOutput(prediction.output), error: prediction.error || null, provider: this.name };
  }
}
