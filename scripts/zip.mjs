// Packages dist/ into order-label-manager.zip (flat, loadable via "Load unpacked" after extract).
import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'order-label-manager.zip');
rmSync(out, { force: true }); // never append to a previous archive
execFileSync('zip', ['-qr', out, '.'], { cwd: join(root, 'dist') });
const kb = (statSync(out).size / 1024).toFixed(1);
console.log(`order-label-manager.zip created (${kb} KB)`);
