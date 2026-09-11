/*
 * Dev-only build tool: generates the extension PNG icons without any
 * third-party image libraries. Uses Node's built-in zlib.
 * Run: node tools/make-icons.mjs
 * This file is NOT shipped inside the extension package.
 */
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'reelforge-ai-ugc', 'assets', 'icons');

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
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function roundedRectContains(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = x < r ? r : x >= w - r ? w - 1 - r : x;
  const cy = y < r ? r : y >= h - r ? h - 1 - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  // Vertical gradient stops (indigo -> violet -> fuchsia)
  const stops = [
    { t: 0.0, c: [79, 70, 229] },
    { t: 0.55, c: [124, 58, 237] },
    { t: 1.0, c: [190, 24, 168] },
  ];
  const radius = Math.round(size * 0.22);
  // Play triangle geometry (pointing right), centred slightly left for optical balance
  const tri = [
    [0.36 * size, 0.27 * size],
    [0.36 * size, 0.73 * size],
    [0.76 * size, 0.50 * size],
  ];
  // Small spark dot in the top-right corner, only on larger sizes
  const spark = size >= 48 ? { x: 0.78 * size, y: 0.24 * size, r: 0.07 * size } : null;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!roundedRectContains(x, y, size, size, radius)) {
        buf[i + 3] = 0; // transparent outside rounded square
        continue;
      }
      const t = y / (size - 1);
      let c;
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s].t && t <= stops[s + 1].t) {
          const lt = (t - stops[s].t) / (stops[s + 1].t - stops[s].t);
          c = [0, 1, 2].map((k) => mix(stops[s].c[k], stops[s + 1].c[k], lt));
          break;
        }
      }
      let [r, g, b] = c;
      const a = 255;

      if (pointInTri(x + 0.5, y + 0.5, tri)) {
        r = 255; g = 255; b = 255;
      }
      if (spark) {
        const dx = x + 0.5 - spark.x;
        const dy = y + 0.5 - spark.y;
        if (dx * dx + dy * dy <= spark.r * spark.r) {
          r = 255; g = 255; b = 255;
        }
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return encodePng(size, size, buf);
}

function sign(px, py, a, b) {
  return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
}
function pointInTri(px, py, t) {
  const d1 = sign(px, py, t[0], t[1]);
  const d2 = sign(px, py, t[1], t[2]);
  const d3 = sign(px, py, t[2], t[0]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = drawIcon(size);
  writeFileSync(join(OUT_DIR, `icon${size}.png`), png);
  console.log(`wrote icon${size}.png (${png.length} bytes)`);
}
