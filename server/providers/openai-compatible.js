function extractJson(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text.slice(Math.min(...['{', '['].map(token => { const index = text.indexOf(token); return index < 0 ? text.length : index; })));
  return JSON.parse(candidate);
}

function imageParts(images = []) {
  return images.filter(Boolean).slice(0, 6).map(url => ({ type: 'image_url', image_url: { url, detail: 'high' } }));
}

export class OpenAIImageProvider {
  constructor({ apiKey, baseUrl, model }) { this.apiKey = apiKey; this.baseUrl = baseUrl.replace(/\/$/, ''); this.model = model; }
  get name() { return `Image · ${this.model}`; }
  async generateCreator({ brandName = 'the brand', style = 'natural Indian UGC creator', productName = '' } = {}) {
    const response = await fetch(`${this.baseUrl}/images/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, prompt: `Photorealistic vertical smartphone UGC creator for ${brandName}. An approachable adult woman with natural skin texture, authentic asymmetry, relaxed eyes, subtle expression and believable everyday styling. She is in a softly lit real home setting, framed like an Instagram Reel selfie camera. She should look like a real human creator, not a cartoon, CGI render, 3D avatar, illustration or glossy fashion campaign. No text, no logos, no watermark, no product in hand. Beauty/cosmetics UGC, ${style}, product context: ${productName || 'skincare'}.`, size: '1024x1536', quality: 'high', n: 1, response_format: 'b64_json' }) });
    if (!response.ok) { const detail = await response.text(); throw new Error(`Image provider returned ${response.status}: ${detail.slice(0, 240)}`); }
    const data = await response.json(); const image = data.data?.[0]; if (!image) throw new Error('Image provider returned no creator image.');
    if (image.b64_json) return { dataUrl: `data:image/png;base64,${image.b64_json}`, provider: this.name };
    if (image.url) { const asset = await fetch(image.url); if (!asset.ok) throw new Error('Generated creator image could not be downloaded.'); const buffer = Buffer.from(await asset.arrayBuffer()); return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}`, provider: this.name }; }
    throw new Error('Image provider returned an unsupported image format.');
  }
}

export class OpenAICompatibleProvider {
  constructor({ apiKey, baseUrl, model }) { this.apiKey = apiKey; this.baseUrl = baseUrl.replace(/\/$/, ''); this.model = model; }
  get name() { return `LLM · ${this.model}`; }
  async chat(messages, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, temperature: options.temperature ?? .45, response_format: options.json === false ? undefined : { type: 'json_object' }, messages }) });
    if (!response.ok) { const detail = await response.text(); throw new Error(`LLM provider returned ${response.status}: ${detail.slice(0, 240)}`); }
    const data = await response.json(); const content = data.choices?.[0]?.message?.content; if (!content) throw new Error('LLM provider returned no content.'); return content;
  }
  async analyze({ script, style, ratio, brandKit, knowledge, productName, productContext, productImages = [], template = [] }) {
    const context = (knowledge || []).slice(0, 30).map(item => `- ${item.type}: ${item.title}\n  ${item.content}`).join('\n');
    const system = `You are a senior Instagram Reels UGC creative director and product cinematographer. Return only valid JSON with this exact shape: {"scenes":[{"type":"Hook|Problem|Product intro|Demo|Benefits|Social proof|Call to action","script":"spoken line","caption":"short on-screen caption","duration":3.2,"visualDirection":"specific shot that matches the line","camera":"selfie close-up|medium talking head|macro product|over-shoulder demo|top-down|end card","performance":"natural expression, gesture and eye-line","productAction":"exact product interaction or none","creatorNeeded":true,"imageRole":"creator|product|both|none","videoPrompt":"one concise photorealistic image-to-video prompt"}]}. Build 3-8 scenes and preserve every factual claim from the supplied script. Never invent clinical outcomes. Use the requested structure ${template.join(' → ') || 'Hook → Problem → Product → Benefits → Proof / Result → CTA'}. The first 2-3 seconds must earn attention. Every scene must explicitly match its spoken line, use the reference product naturally, and be possible as a short vertical ad. Brand: ${brandKit?.brandName || 'unknown'}; product: ${productName || 'unknown'}; product facts: ${productContext || 'not provided'}; style: ${style || 'UGC'}; ratio: ${ratio}. Brand rules: ${brandKit?.rules || 'clear, specific, human'}. Knowledge context:\n${context || 'none'}`;
    const userContent = [{ type: 'text', text: script }, ...imageParts(productImages)];
    const content = await this.chat([{ role: 'system', content: system }, { role: 'user', content: userContent }]);
    const parsed = extractJson(content); if (!Array.isArray(parsed.scenes)) throw new Error('LLM response did not contain scenes.'); return parsed.scenes;
  }
  async understandAssets({ images = [], productName = '', productContext = '' }) {
    if (!images.length) return { productName, productDescription: productContext, visualFeatures: [], usageIdeas: [] };
    const content = await this.chat([{ role: 'system', content: 'You are a product-visual analyst. Return only JSON: {"productName":"","productDescription":"","visualFeatures":[""],"packagingText":[""],"usageIdeas":[""],"safetyNotes":[""]}. Inspect the reference images accurately. Never invent ingredients or claims not visible in the image or supplied context.' }, { role: 'user', content: [{ type: 'text', text: `Product name: ${productName || 'unknown'}\nKnown context: ${productContext || 'none'}` }, ...imageParts(images)] }], { temperature: .2 });
    return extractJson(content);
  }
  async generateHooks({ brandName, productName, productContext, style, count = 8, knowledge = [] }) {
    const knowledgeText = knowledge.slice(0, 10).map(item => `${item.type}: ${item.content}`).join('\n');
    const content = await this.chat([{ role: 'system', content: `Write ${count} distinct, strong Instagram Reel opening hooks for a ${style || 'beauty'} UGC ad. Return only JSON: {"hooks":[{"text":"","angle":"problem|curiosity|confession|demo|myth|result","visual":"what viewers see in the first 2 seconds"}]}. Hooks must sound like a real creator, be specific to the product, avoid unsupported medical claims and never use clickbait that the product cannot deliver. Use short spoken lines under 14 words. Brand rules:\n${knowledgeText}` }, { role: 'user', content: `Brand: ${brandName || 'the brand'}\nProduct: ${productName || 'the product'}\nFacts: ${productContext || 'not provided'}` }], { temperature: .85 });
    const parsed = extractJson(content); return Array.isArray(parsed.hooks) ? parsed.hooks : [];
  }
}
