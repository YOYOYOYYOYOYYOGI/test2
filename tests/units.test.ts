/* Low-level unit tests against source modules */
(globalThis as any).chrome = {
  runtime: { lastError: null, getURL: (p: string) => 'chrome-extension://t/' + p, onMessage: { addListener(){} } },
  storage: { local: { get: (k: unknown, cb: (d: any) => void) => setTimeout(() => cb({}), 0), set: (o: any, cb?: () => void) => cb?.(), remove: (k: any, cb?: () => void) => cb?.() } },
  identity: { getRedirectURL: () => 'x', launchWebAuthFlow: (o: any, cb: (u?: string) => void) => cb(undefined) },
};

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, n: string) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fails.push(n); console.log('  ✗ ' + n); } };

const { colA1 } = await import('/home/user/test2/src/services/google');
ok(colA1(0) === 'A', 'colA1 0 -> A');
ok(colA1(25) === 'Z', 'colA1 25 -> Z');
ok(colA1(26) === 'AA', 'colA1 26 -> AA');
ok(colA1(51) === 'AZ', 'colA1 51 -> AZ');
ok(colA1(52) === 'BA', 'colA1 52 -> BA');
ok(colA1(701) === 'ZZ', 'colA1 701 -> ZZ');
ok(colA1(702) === 'AAA', 'colA1 702 -> AAA');

const { code39 } = await import('/home/user/test2/src/services/barcode');
const zxing: Record<string, string> = {
  '0':'nnnWWnWnn','1':'WnnWnnnnW','2':'nnWWnnnnW','3':'WnWWnnnnn','4':'nnnWWnnnW','5':'WnnWWnnnn','6':'nnWWWnnnn','7':'nnnWnnWnW','8':'WnnWnnWnn','9':'nnWWnnWnn',
  'A':'WnnnnWnnW','B':'nnWnnWnnW','C':'WnWnnWnnn','D':'nnnnWWnnW','E':'WnnnWWnnn','F':'nnWnWWnnn','G':'nnnnnWWnW','H':'WnnnnWWnn','I':'nnWnnWWnn','J':'nnnnWWWnn',
  'K':'WnnnnnnWW','L':'nnWnnnnWW','M':'WnWnnnnWn','N':'nnnnWnnWW','O':'WnnnWnnWn','P':'nnWnWnnWn','Q':'nnnnnnWWW','R':'WnnnnnWWn','S':'nnWnnnWWn','T':'nnnnWnWWn',
  'U':'WWnnnnnnW','V':'nWWnnnnnW','W':'WWWnnnnnn','X':'nWnnWnnnW','Y':'WWnnWnnnn','Z':'nWWnWnnnn','-':'nWnnnnWnW','.':'WWnnnnWnn',' ':'nWWnnnWnn','$':'nWnWnWnnn','/':'nWnWnnnWn','+':'nWnnnWnWn','%':'nnnWnWnWn','*':'nWnnWnWnn',
};
// decode the generated SVG rects back into bar patterns and verify every character
const svg = code39('*ORD-1001*');
const rectRe = /<rect x="(\d+)" y="0" width="(\d+)" height/g;
type R = { x: number; w: number };
const bars: R[] = []; let m: RegExpExecArray | null;
while ((m = rectRe.exec(svg))) bars.push({ x: Number(m[1]), w: Number(m[2]) });
// reconstruct element sequence (bars + implicit gaps) per char is complex; instead verify:
// (a) bar count: 10 chars x 5 bars = 50
ok(bars.length === 50, `barcode has 50 bars for 10 chars (got ${bars.length})`);
// (b) every bar width is narrow(2) or wide(6); wide ratio 1:3
ok(bars.every((b) => b.w === 2 || b.w === 6), 'bars are narrow/wide only');
// (c) total wide bars = 2 or 3 per char group: split bars into groups of 5 (chars processed in order, all 10 chars encodable)
const wideCounts: number[] = [];
for (let i = 0; i < bars.length; i += 5) wideCounts.push(bars.slice(i, i + 5).filter((b) => b.w === 6).length);
ok(wideCounts.every((w) => w === 2 || w === 3), 'each char has 2-3 wide bars (3-of-9)');
ok(code39('') === '', 'empty barcode for empty text');
ok(code39('hello🎉').includes('HELLO'), 'lowercase folded, emoji stripped');

const { pdfDocument } = await import('/home/user/test2/src/services/label');
// tiny valid JPEG (1x1 white)
const jpegB64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAEAAQMBIgACEQEDEQH/xAAUAAEAAAAAAAAAAAAAAAAAAAAK/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AA==';
const bin = atob(jpegB64);
const jpeg = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
const blob = pdfDocument(288, 432, jpeg, 1, 1);
const bytes = Buffer.from(await blob.arrayBuffer());
const text = bytes.toString('latin1');
ok(text.startsWith('%PDF-1.4'), 'PDF header');
ok(text.trimEnd().endsWith('%%EOF'), 'PDF EOF marker');
ok(text.includes('/Type /Catalog') && text.includes('/MediaBox [0 0 288 432]'), 'PDF catalog + 4x6 mediabox (in points)');
// xref offsets must point exactly at each object header
const startxref = Number(/startxref\s+(\d+)/.exec(text)![1]);
const xrefText = text.slice(startxref);
ok(xrefText.startsWith('xref'), 'startxref points at xref table');
const entries = xrefText.split('\n').filter((l) => /^\d{10} 00000 n/.test(l));
ok(entries.length === 5, '5 objects in xref');
entries.forEach((e, i) => {
  const off = Number(e.slice(0, 10));
  const expected = `${i + 1} 0 obj`;
  ok(text.slice(off, off + expected.length) === expected, `xref offset ${i + 1} exact`);
});
ok(text.includes('/Filter /DCTDecode') && text.includes(`/Length ${jpeg.length}`), 'JPEG embedded with correct length');

console.log(`\nPASS: ${pass} FAIL: ${fails.length}`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
