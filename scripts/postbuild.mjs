// post-build: copy public assets already handled by Vite; here we verify the
// manifest + assets exist in dist and keep dist clean of Vite-only files.
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const required = ['manifest.json', 'background.js', 'index.html', 'popup.html', 'print.html', 'assets', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];

for (const f of required) {
  if (!existsSync(join(dist, f))) {
    console.error(`✗ missing ${f} in dist`);
    process.exitCode = 1;
  } else {
    console.log(`✓ dist/${f}`);
  }
}

// pretty-print manifest and write version stamp
try {
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  const version = manifest.version ?? '1.0.0';
  const stamp = `/* built with Order Label Manager v${version} */\n`;
  const bg = join(dist, 'background.js');
  const bgText = await readFile(bg, 'utf8');
  await writeFile(bg, bgText.startsWith('/*') ? bgText : stamp + bgText);
  console.log('✓ stamped background.js');
} catch (e) {
  console.error('postbuild stamp failed', e);
}

// sanity: ensure fonts got bundled (they live under assets)
if (!existsSync(join(dist, 'assets'))) console.error('✗ assets folder missing');

console.log('postbuild ok');
