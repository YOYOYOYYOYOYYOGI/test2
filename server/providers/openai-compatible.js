function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : content.slice(content.indexOf('{') >= 0 ? content.indexOf('{') : 0);
  return JSON.parse(candidate);
}

export class OpenAIImageProvider {
  constructor({ apiKey, baseUrl, model }) { this.apiKey = apiKey; this.baseUrl = baseUrl.replace(/\/$/, ''); this.model = model; }
  get name() { return `Image · ${this.model}`; }
  async generateCreator({ brandName = 'the brand', style = 'natural Indian UGC creator' } = {}) {
    const response = await fetch(`${this.baseUrl}/images/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, prompt: `A vertical, realistic UGC beauty creator portrait for ${brandName}: a friendly adult woman, natural skin texture, approachable expression, softly lit home setting, phone-camera framing, no text, no logos, no product, ${style}.` , size: '1024x1536', n: 1, response_format: 'b64_json' }) });
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
  async analyze({ script, style, ratio, brandKit, knowledge }) {
    const context = (knowledge || []).slice(0, 30).map(item => `- ${item.type}: ${item.title}\n  ${item.content}`).join('\n');
    const system = `You are a senior short-form UGC creative director. Return only valid JSON with this exact shape: {"scenes":[{"type":"Hook|Problem|Product intro|Demo|Benefits|Social proof|Call to action","script":"spoken line","caption":"short on-screen caption","duration":3.2,"visualDirection":"one practical shot direction"}]}. Build 3-8 scenes from the supplied script. Preserve claims; do not invent clinical outcomes. Keep scene text faithful to the input, use ${ratio} timing, and make the visual direction possible with product photos. Brand: ${brandKit?.brandName || 'unknown'}; style: ${style || 'UGC'}. Brand rules: ${brandKit?.rules || 'clear, specific, human'}. Knowledge context:\n${context || 'none'}`;
    const response = await fetch(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, temperature: .45, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: script }] }) });
    if (!response.ok) { const detail = await response.text(); throw new Error(`LLM provider returned ${response.status}: ${detail.slice(0, 240)}`); }
    const data = await response.json(); const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM provider returned no scene plan.');
    const parsed = extractJson(content); if (!Array.isArray(parsed.scenes)) throw new Error('LLM response did not contain scenes.');
    return parsed.scenes;
  }
}
