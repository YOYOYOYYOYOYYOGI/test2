// Packages the production build into release/order-label-manager-v<ver>.zip
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const release = join(root, 'release');

if (!existsSync(dist)) {
  console.error('dist/ does not exist — run npm run build first');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
const version = manifest.version ?? '1.0.0';
await mkdir(release, { recursive: true });
const outPath = join(release, `order-label-manager-v${version}.zip`);

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) await walk(full);
    else files.push(full);
  }
}
await walk(dist);

await new Promise((resolve, reject) => {
  // use system zip if available for speed
  const { execFile } = require('node:child_process');
  execFile('zip', ['-r', '-q', outPath, '.'], { cwd: dist }, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

// also place a copy at the repository root for easy download
const rootCopy = join(root, `order-label-manager-v${version}.zip`);
await import('node:fs/promises').then(({ copyFile }) => copyFile(outPath, rootCopy));

console.log(`✓ packaged ${outPath} (${files.length} files, v${version})`);
console.log(`✓ copied to ${rootCopy}`);
