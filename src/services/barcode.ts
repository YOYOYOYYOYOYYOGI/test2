// Code 39 barcode rendered as inline SVG. Encoding table per ISO/IEC 16388
// (verified against the ZXing reference implementation): 9 elements per
// character (5 bars, 4 spaces), exactly 3 wide, separated by a narrow gap.
// Pattern string: n=narrow, W=wide; alternating bar,space,bar,space... (bars first).
const PATTERNS: Record<string, string> = {
  '0': 'nnnWWnWnn', '1': 'WnnWnnnnW', '2': 'nnWWnnnnW', '3': 'WnWWnnnnn', '4': 'nnnWWnnnW',
  '5': 'WnnWWnnnn', '6': 'nnWWWnnnn', '7': 'nnnWnnWnW', '8': 'WnnWnnWnn', '9': 'nnWWnnWnn',
  'A': 'WnnnnWnnW', 'B': 'nnWnnWnnW', 'C': 'WnWnnWnnn', 'D': 'nnnnWWnnW', 'E': 'WnnnWWnnn',
  'F': 'nnWnWWnnn', 'G': 'nnnnnWWnW', 'H': 'WnnnnWWnn', 'I': 'nnWnnWWnn', 'J': 'nnnnWWWnn',
  'K': 'WnnnnnnWW', 'L': 'nnWnnnnWW', 'M': 'WnWnnnnWn', 'N': 'nnnnWnnWW', 'O': 'WnnnWnnWn',
  'P': 'nnWnWnnWn', 'Q': 'nnnnnnWWW', 'R': 'WnnnnnWWn', 'S': 'nnWnnnWWn', 'T': 'nnnnWnWWn',
  'U': 'WWnnnnnnW', 'V': 'nWWnnnnnW', 'W': 'WWWnnnnnn', 'X': 'nWnnWnnnW', 'Y': 'WWnnWnnnn',
  'Z': 'nWWnWnnnn', '-': 'nWnnnnWnW', '.': 'WWnnnnWnn', ' ': 'nWWnnnWnn', '$': 'nWnWnWnnn',
  '/': 'nWnWnnnWn', '+': 'nWnnnWnWn', '%': 'nnnWnWnWn', '*': 'nWnnWnWnn',
};

/** Render text as a Code 39 SVG string. Returns '' for empty or non-encodable text. */
export function code39(text: string, height = 40, narrow = 2, gap = 4): string {
  const clean = text.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
  if (!clean) return '';
  let x = 0;
  let bars = '';
  const chars = '*' + clean + '*';
  for (const ch of chars) {
    const pat = PATTERNS[ch];
    if (!pat) continue;
    for (let i = 0; i < 9; i++) {
      const wide = pat[i] === 'W';
      const w = wide ? narrow * 3 : narrow;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      x += w;
    }
    x += gap; // inter-character space
  }
  return `<svg class="barcode" viewBox="0 0 ${x - gap} ${height}" width="${x - gap}" height="${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="barcode ${escAttr(clean)}">${bars}</svg>`;
}

function escAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
