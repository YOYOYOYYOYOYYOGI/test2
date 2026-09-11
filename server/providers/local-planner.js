const LABELS = ['Hook', 'Problem', 'Product intro', 'Demo', 'Benefits', 'Social proof', 'Call to action'];

function splitSentences(script) {
  return script.replace(/\r/g, '').split(/\n+/).flatMap(block => block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(item => item.trim()).filter(Boolean);
}
function cleanCaption(text) {
  const words = text.replace(/[.!?]+$/, '').split(/\s+/).slice(0, 7).join(' ');
  return words ? `${words}${text.length > words.length ? '…' : ''}` : 'Your next easy routine';
}
export function planLocally({ script = '', style = 'Voice-over ad', ratio = '9:16' } = {}) {
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
    visualDirection: index === 0 ? 'Start with a human, relatable close-up or product detail.' : 'Use a deliberate product-focused movement with one clear visual idea.',
    imageAssetId: null
  }));
}
