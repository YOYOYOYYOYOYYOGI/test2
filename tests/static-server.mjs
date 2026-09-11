/*
 * Dev-only static server for the browser test harness (NOT shipped).
 * Serves the real extension directory at /ext and test harness files at
 * /harness, injecting the chrome-shim into extension HTML pages.
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EXT_SRC = process.env.REELFORGE_EXT_ROOT ? process.env.REELFORGE_EXT_ROOT : join(ROOT, 'reelforge-ai-ugc');
const HARNESS_DIR = join(HERE, 'harness');
const PORT = Number(process.env.HARNESS_PORT || 8999);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  let base;
  if (pathname.startsWith('/ext/')) {
    base = EXT_SRC;
    pathname = pathname.slice(4);
  } else if (pathname.startsWith('/harness/')) {
    base = HARNESS_DIR;
    pathname = pathname.slice(8);
  } else if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(302, { Location: '/ext/popup/popup.html' });
    return res.end();
  } else {
    return send(res, 404, 'not found');
  }

  const filePath = normalize(join(base, pathname === '/' ? 'popup/popup.html' : pathname));
  if (!filePath.startsWith(base)) return send(res, 403, 'forbidden');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return send(res, 404, `missing ${pathname}`);

  const ext = extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let html = readFileSync(filePath, 'utf8');
    // Inject the test shim as the FIRST script so window.chrome exists before modules execute.
    html = html.replace('<head>', '<head>\n  <script src="/harness/chrome-shim.js"></script>');
    return send(res, 200, html, type);
  }
  return send(res, 200, readFileSync(filePath), type);
});

export function startStaticServer() {
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStaticServer().then(() => console.log(`harness on http://127.0.0.1:${PORT}`));
}
