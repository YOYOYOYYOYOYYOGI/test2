// Packages dist/ into order-label-manager.zip (flat, loadable via "Load unpacked" after extract).
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('zip', ['-qr', join(root, 'order-label-manager.zip'), '.'], { cwd: join(root, 'dist') });
const kb = (statSync(join(root, 'order-label-manager.zip')).size / 1024).toFixed(1);
console.log(`order-label-manager.zip created (${kb} KB)`);
