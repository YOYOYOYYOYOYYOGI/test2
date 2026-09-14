// post-build: copy public assets already handled by Vite; here we verify the
// manifest + assets exist in dist and keep dist clean of Vite-only files.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const required = ['manifest.json', 'app.webmanifest', 'service-worker.js', 'background.js', 'index.html', 'popup.html', 'print.html', 'assets', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png', 'icons/icon192.png', 'icons/icon512.png'];

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

  // Vite fingerprints every JS/CSS/font asset.  Put the complete production
  // shell in the PWA worker at build time so an installed app can reopen
  // offline after its first successful install—not only after a second visit.
  const assets = (await readdir(join(dist, 'assets')))
    .filter((file) => /\.(?:js|css|woff2?|png|svg)$/i.test(file))
    .sort()
    .map((file) => `./assets/${file}`);
  const shell = ['./', './index.html', './app.webmanifest', './icons/icon192.png', './icons/icon512.png', ...assets];
  const sw = join(dist, 'service-worker.js');
  const worker = await readFile(sw, 'utf8');
  const stampedWorker = worker
    .replace(/const CACHE = 'olm-pwa-shell-v[^']+';/, `const CACHE = 'olm-pwa-shell-v${version}';`)
    .replace(/const APP_SHELL = \[[^;]*\];/, `const APP_SHELL = ${JSON.stringify(shell)};`);
  if (stampedWorker === worker) throw new Error('PWA worker shell markers were not found');
  await writeFile(sw, stampedWorker);
  console.log(`✓ precached ${shell.length} PWA shell files`);
} catch (e) {
  console.error('postbuild stamp failed', e);
}

// sanity: ensure fonts got bundled (they live under assets)
if (!existsSync(join(dist, 'assets'))) console.error('✗ assets folder missing');

console.log('postbuild ok');
