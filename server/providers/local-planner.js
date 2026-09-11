const LABELS = ['Hook', 'Problem', 'Product intro', 'Demo', 'Benefits', 'Social proof', 'Call to action'];

function splitSentences(script) {
  return script.replace(/\r/g, '').split(/\n+/).flatMap(block => block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(item => item.trim()).filter(Boolean);
}
function cleanCaption(text) {
  const words = text.replace(/[.!?]+$/, '').split(/\s+/).slice(0, 7).join(' ');
  return words ? `${words}${text.length > words.length ? '…' : ''}` : 'Your next easy routine';
}
export function generateScriptLocally({ brandName = 'your brand', productName = 'your product', productContext = '', cta = 'Shop now' } = {}) {
  const context = productContext ? ` It is ${productContext.replace(/[.]+$/, '')}.` : ' It is made for a simple everyday routine.';
  return `Still searching for an easy way to upgrade your routine? Meet ${brandName} ${productName}.${context} I love how simple it is to use and how naturally it fits into my day. Add it after cleansing, keep the routine consistent, and notice how much easier your reset feels. Save this for your next restock and ${cta.toLowerCase()}.`;
}

export function generateHooksLocally({ brandName = 'the brand', productName = 'the product', productContext = '', count = 8 } = {}) {
  const facts = productContext ? ` about ${productContext.replace(/[.]+$/, '')}` : '';
  const pool = [
    { text: `I stopped skipping this one step in my routine.`, angle: 'confession', visual: 'Selfie close-up, creator reaches for the product.' },
    { text: `If your skin feels tired by evening, watch this.`, angle: 'problem', visual: 'Creator points to a relatable before-routine expression.' },
    { text: `Here is how I use ${productName} without overcomplicating it.`, angle: 'demo', visual: 'Product enters frame beside the creator.' },
    { text: `The easiest reset I added to my routine lately.`, angle: 'curiosity', visual: 'Quick product reveal on a bathroom shelf.' },
    { text: `I wanted a routine that felt simple, not heavy.`, angle: 'problem', visual: 'Creator shows a small amount on fingertips.' },
    { text: `Three seconds to see why this lives on my shelf.`, angle: 'curiosity', visual: 'Fast macro product turn toward camera.' },
    { text: `No ten-step routine — just this and consistency.`, angle: 'myth', visual: 'Creator shakes head, then demonstrates one step.' },
    { text: `This is the finish I look for after cleansing.`, angle: 'result', visual: 'Natural window-light close-up with product in hand.' }
  ];
  return pool.slice(0, Math.max(1, Math.min(count, pool.length))).map(hook => ({ ...hook, text: `${hook.text}${facts && hook.text.length < 70 ? '' : ''}` }));
}

export function planLocally({ script = '', style = 'Voice-over ad', ratio = '9:16', productName = 'the product' } = {}) {
  const sentences = splitSentences(script);
  if (!sentences.length) throw new Error('A non-empty script is required.');
  const buckets = [];
  const bucketCount = Math.min(7, Math.max(3, Math.ceil(sentences.length / 2)));
  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor(index * sentences.length / bucketCount); const end = Math.floor((index + 1) * sentences.length / bucketCount);
    const text = sentences.slice(start, Math.max(start + 1, end)).join(' '); if (text) buckets.push(text);
  }
  return buckets.map((text, index) => ({
    id: `scene-${index + 1}`,
    order: index,
    type: LABELS[Math.min(index, LABELS.length - 1)],
    script: text,
    caption: cleanCaption(text),
    duration: Math.max(2, Math.min(8, Math.round(text.split(/\s+/).length / 2.5 * 10) / 10)),
    visualDirection: index === 0 ? 'Start with a natural selfie close-up and a relatable expression.' : /product|demo|intro/i.test(LABELS[Math.min(index, LABELS.length - 1)]) ? 'Use a close product shot with a deliberate hand movement that matches the spoken line.' : 'Use a human talking-head shot with one clear gesture and a real home setting.',
    camera: index === 0 ? 'selfie close-up' : /product|demo|intro/i.test(LABELS[Math.min(index, LABELS.length - 1)]) ? 'macro product' : 'medium talking head',
    performance: index === 0 ? 'Curious, direct eye contact and a small natural pause.' : 'Warm, conversational expression with restrained hand gestures.',
    productAction: /product|demo|intro/i.test(LABELS[Math.min(index, LABELS.length - 1)]) ? 'Show or apply the product naturally.' : 'none',
    creatorNeeded: !/product|demo|intro/i.test(LABELS[Math.min(index, LABELS.length - 1)]),
    imageRole: /product|demo|intro/i.test(LABELS[Math.min(index, LABELS.length - 1)]) ? 'product' : 'creator',
    videoPrompt: `Photorealistic vertical UGC ad scene: ${text}. Natural human performance, real smartphone camera, authentic lighting, no text overlays, no logos added.`,
    imageAssetId: null
  }));
}
