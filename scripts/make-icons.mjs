// Generates public/icons/icon{16,32,48,128}.png from an SVG master using sharp.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="#F66916"/>
  <rect x="36" y="22" width="56" height="32" rx="5" fill="#ffffff"/>
  <rect x="27" y="50" width="74" height="50" rx="8" fill="#0F172A"/>
  <path d="M43 88V64h14a7 7 0 0 1 0 14h-6v10z" fill="#fff"/>
  <rect x="62" y="64" width="22" height="15" rx="3" fill="#fff"/>
  <rect x="26" y="100" width="76" height="5" rx="2.5" fill="#0F172A"/>
  <circle cx="98" cy="100" r="6" fill="#F66916"/>
</svg>`;

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, `icon${size}.png`));
  console.log(`icon${size}.png`);
}
// A store-display logo used by demo pages
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(join(outDir, 'icon256.png'));
console.log('done');
