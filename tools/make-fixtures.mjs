/*
 * Dev-only: builds test fixtures (NOT shipped in the extension):
 *   - tests/fixtures/product.png  (simple product shot)
 *   - tests/fixtures/creator.png  (portrait placeholder)
 *   - tests/fixtures/sample.webm  (a real, playable ~1.2s clip recorded in headless Chromium)
 */
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/.devtools/package.json');
const puppeteer = require('puppeteer-core');

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'tests', 'fixtures');
mkdirSync(FIX, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makeImage(width, height, bg) {
  const buf = Buffer.alloc(width * height * 4);
  if (bg) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bg(buf, x, y, width, height);
  const encode = () => {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0;
      buf.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      chunk('IHDR', (() => { const b = Buffer.alloc(13); b.writeUInt32BE(width, 0); b.writeUInt32BE(height, 4); b[8] = 8; b[9] = 6; return b; })()),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  };
  return { buf, w: width, h: height, encode };
}
function setPx(buf, w, x, y, r, g, b, a = 255) {
  const i = (y * w + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}
function rect(buf, w, x0, y0, x1, y1, c) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(buf, w, x, y, ...c);
}
function ellipse(buf, w, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y < cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(buf, w, x, y, ...c);
    }
  }
}

// Product: a serum bottle on a soft backdrop
{
  const img = makeImage(512, 512, (buf, w, x, y) => {
    const t = y / 512;
    setPx(buf, w, x, y, Math.round(238 - t * 14), Math.round(236 - t * 10), 250); // backdrop
  });
  const { buf, w } = img;
  rect(buf, w, 176, 150, 336, 210, [44, 46, 90]);          // cap
  rect(buf, w, 160, 210, 352, 430, [124, 58, 237]);        // bottle
  rect(buf, w, 186, 250, 326, 350, [255, 255, 255]);       // label
  rect(buf, w, 200, 272, 312, 286, [190, 24, 168]);        // label stripe
  ellipse(buf, w, 256, 320, 24, 24, [124, 58, 237]);       // logo dot
  const out = img.encode();
  writeFileSync(join(FIX, 'product.png'), out);
  console.log('product.png', out.length);
}

// Creator: simple stylised portrait
{
  const img = makeImage(512, 640, (buf, w, x, y) => {
    const t = y / 640;
    setPx(buf, w, x, y, Math.round(244 - t * 20), Math.round(235 - t * 10), Math.round(226 + t * 8));
  });
  const { buf, w } = img;
  rect(buf, w, 100, 380, 412, 640, [70, 40, 60]);          // hair behind
  ellipse(buf, w, 256, 250, 120, 140, [240, 200, 168]);    // face
  ellipse(buf, w, 256, 150, 132, 90, [70, 40, 60]);        // hair top
  rect(buf, w, 104, 210, 146, 430, [70, 40, 60]);          // hair left
  rect(buf, w, 366, 210, 408, 430, [70, 40, 60]);          // hair right
  ellipse(buf, w, 216, 252, 11, 11, [40, 30, 30]);         // eyes
  ellipse(buf, w, 296, 252, 11, 11, [40, 30, 30]);
  rect(buf, w, 226, 308, 286, 320, [190, 90, 110]);        // smile
  rect(buf, w, 120, 430, 392, 640, [50, 120, 200]);        // shirt
  rect(buf, w, 330, 470, 392, 560, [124, 58, 237]);        // product in hand
  rect(buf, w, 342, 486, 380, 548, [255, 255, 255]);
  const out = img.encode();
  writeFileSync(join(FIX, 'creator.png'), out);
  console.log('creator.png', out.length);
}

// Invalid file for validation tests
writeFileSync(join(FIX, 'invalid.txt'), Buffer.from('this is definitely not an image\n', 'utf8'));

/* ---- Record a real WebM clip with the browser's MediaRecorder ---- */
const fs = await import('node:fs');
const log = (m) => fs.appendFileSync('/tmp/fixture.log', `${m}\n`);
fs.writeFileSync('/tmp/fixture.log', '');
log('launching');
const CHROME = '/home/user/.devtools/chromium-dist/chrome';
process.env.LD_LIBRARY_PATH = '/home/user/.devtools/chromium-dist/lib:/home/user/.devtools/chromium-dist';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 60000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
});
log('launched');
const page = await browser.newPage();
await page.goto('about:blank');
log('page ready');
const webm = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(10);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 250000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start();
  const start = performance.now();
  await new Promise((res) => {
    const timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      const grad = ctx.createLinearGradient(0, 0, 400, 720);
      grad.addColorStop(0, '#4f46e5'); grad.addColorStop(1, '#be18a8');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 400, 720);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(200 + Math.sin(t * 3) * 80, 300, 46, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('UGC TEST', 200, 520);
      if (t >= 1.4) { clearInterval(timer); rec.stop(); res(); }
    }, 100);
  });
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 10000))]);
  const bufs = await Promise.all(chunks.map((c) => c.arrayBuffer()));
  const bytes = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0));
  let off = 0;
  for (const b of bufs) { bytes.set(new Uint8Array(b), off); off += b.byteLength; }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
});
log(`recorded ${webm.length} b64`);
await browser.close();
log('closed');
const webmBytes = Buffer.from(webm, 'base64');
writeFileSync(join(FIX, 'sample.webm'), webmBytes);
console.log('sample.webm', webmBytes.length);
