/*
 * End-to-end browser test harness (dev tool - NOT shipped).
 *
 * Drives the REAL extension pages and modules in Chromium 131. A test-only
 * window.chrome shim (tests/harness/chrome-shim.js) provides the MV3 APIs;
 * the shim routes rf:fetch through the SAME scripts/net-relay.js the service
 * worker uses, so requests are real HTTPS (mocked fal.ai via TLS + /etc/hosts)
 * and IndexedDB, canvas, downloads and video playback are all the real things.
 *
 *  - DIRECT mode: page -> net-relay -> mock fal.ai queue API (real queue lifecycle)
 *  - PROXY mode : page -> net-relay -> the REAL zero-dependency backend -> mock fal
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/home/user/.devtools/package.json');
const puppeteer = require('puppeteer-core');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DOWNLOADS = '/tmp/reelforge-downloads';
const SHOTS = join(HERE, 'screenshots');
const CHROME = '/home/user/.devtools/chromium-dist/chrome';

const { startStaticServer } = await import('./static-server.mjs');
const { STORAGE_KEYS, defaultSettings } = await import(pathToFileURL(join(ROOT, 'reelforge-ai-ugc', 'scripts', 'config.js')).href);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 300) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  — ${String(detail).slice(0, 220)}`}`);
}
async function truthy(label, fn, { tries = 40, gap = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, gap));
  }
  check(label, false, lastErr?.message || 'timed out');
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- servers ---------- */
let mockProc;
let backendProc;

function startMockFal() {
  mockProc = spawn('sudo', ['-n', '-E', process.execPath, join(HERE, 'mock-fal.mjs')], {
    env: { ...process.env, MOCK_FAL_KEY: 'test-fal-key' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  mockProc.stdout.on('data', (d) => console.log('[mock-fal]', d.toString().trim()));
  mockProc.stderr.on('data', (d) => console.log('[mock-fal-err]', d.toString().trim()));
  return sleep(1000);
}
function startBackend() {
  backendProc = spawn(process.execPath, [join(ROOT, 'reelforge-backend', 'server.mjs')], {
    env: {
      ...process.env, PORT: '8787', PROXY_KEY: 'test-key',
      LLM_PROVIDER: 'fal', IMAGE_PROVIDER: 'fal', VIDEO_PROVIDER: 'fal', FAL_KEY: 'test-fal-key',
      FAL_IMAGE_MODEL: 'fal-ai/flux/kontext/max', FAL_VIDEO_MODEL: 'fal-ai/kling-video/v2/master/image-to-video',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendProc.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProc.stderr.on('data', (d) => console.log('[backend-err]', d.toString().trim()));
  return sleep(1000);
}

async function main() {
  // Clean up any leftover dev servers from previous (debug) runs.
  spawnSync('sudo', ['-n', 'pkill', '-f', 'mock-fal.mjs']);
  spawnSync('pkill', ['-f', 'reelforge-backend/server.mjs']);
  await sleep(600);

  rmSync(DOWNLOADS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(DOWNLOADS, { recursive: true });

  await startMockFal();
  await startBackend();
  const staticServer = await startStaticServer();

  const cleanup = () => {
    try { staticServer.close(); } catch {}
    backendProc?.kill();
    // Bracket trick so the pkill pattern doesn't match the command itself.
    spawnSync('sudo', ['-n', 'pkill', '-f', 'mock-fal[.]mjs']);
  };
  if (!(await truthy('Backend /health reachable', async () => {
    try { return (await fetch('http://127.0.0.1:8787/health')).ok; } catch { return false; }
  }, { tries: 20 }))) throw new Error('backend did not start');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 90000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
      '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required',
      '--window-size=1180,900',
    ],
    defaultViewport: { width: 1100, height: 860 },
  });

  const pageErrors = [];
  browser.on('targetcreated', async (t) => {
    if (t.type() !== 'page') return;
    const p = await t.page().catch(() => null);
    p?.on('pageerror', (e) => pageErrors.push(`${t.url()}: ${e.stack || e.message}`));
    p?.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // Expected negative-path network outcomes (auth probes return 404, bad-key tests 403,
      // dead-port tests refuse) are real responses the UI handles, not JS failures.
      if (/Failed to load resource|status of 40[0-9]|net::ERR/i.test(text)) return;
      pageErrors.push(`${t.url()}: ${text}`);
    });
  });

  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS, eventsEnabled: true });

  const POPUP = 'http://127.0.0.1:8999/ext/popup/popup.html';
  const SETTINGS = 'http://127.0.0.1:8999/ext/settings/settings.html';
  const openPopup = async () => {
    const p = await browser.newPage();
    await p.goto(POPUP, { waitUntil: 'domcontentloaded' });
    await sleep(400);
    return p;
  };
  const openSettings = async () => {
    const p = await browser.newPage();
    await p.goto(SETTINGS, { waitUntil: 'domcontentloaded' });
    await sleep(300);
    return p;
  };

  async function seedSettings(page, patch) {
    await page.evaluate(([KEY, defs, patch]) => {
      const deep = (a, b) => {
        for (const k of Object.keys(b || {})) {
          if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = deep(a[k] || {}, b[k]);
          else a[k] = b[k];
        }
        return a;
      };
      return chrome.storage.local.set({ [KEY]: deep(structuredClone(defs), patch) });
    }, [STORAGE_KEYS.SETTINGS, defaultSettings(), patch]);
  }
  const getStorage = (page, key) => page.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key);
  const clearAll = (page) => page.evaluate(async () => chrome.storage.local.clear());
  // Reset workflow state (draft/in-flight jobs) but preserve settings + history.
  const resetWorkflow = (page) => page.evaluate(async () => {
    await chrome.storage.local.remove(['reelforge:draft:v1', 'reelforge:jobs:v1']);
  });
  const bannerText = (page, id) => page.$eval(`#${id}`, (el) => el.textContent.trim()).catch(() => '');

  /* ============================================================= */
  /* S0: network chokepoint safety rules (real net-relay module)     */
  /* ============================================================= */
  {
    const page = await openPopup();
    check('Shim loaded and real modules booted', await page.evaluate(() => window.__reelforgeShim === true && !!window.__reelforge));
    check('Popup renders product card', await page.$('#card-product') !== null);

    const ask = (req) => page.evaluate((req) => new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'rf:fetch', request: req }, resolve);
    }), req);

    const httpBlock = await ask({ method: 'GET', url: 'http://example.com/file', timeoutMs: 5000 });
    check('Relay blocks plain http:// for non-localhost', httpBlock?.ok === false && /localhost/i.test(httpBlock?.error?.message || ''), JSON.stringify(httpBlock?.error));
    const fileBlock = await ask({ method: 'GET', url: 'file:///etc/passwd', timeoutMs: 5000 });
    check('Relay blocks file:// URLs', fileBlock?.ok === false && /protocol|Disallowed/i.test(fileBlock?.error?.message || ''));
    const bodyBlock = await ask({ method: 'POST', url: 'https://queue.fal.run/x', body: { not: 'a string' }, timeoutMs: 5000 });
    check('Relay rejects non-string request bodies', bodyBlock?.ok === false && /string/i.test(bodyBlock?.error?.message || ''));
    const methodBlock = await ask({ method: 'PATCH', url: 'https://queue.fal.run/x', timeoutMs: 5000 });
    check('Relay rejects disallowed HTTP methods', methodBlock?.ok === false && /method/i.test(methodBlock?.error?.message || ''));
    const mediaSummary = await page.evaluate((req) => new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'rf:fetch', request: req }, (res) => resolve({
        ok: res?.ok,
        status: res?.data?.status,
        contentType: res?.data?.contentType,
        byteLength: res?.data?.bytes?.byteLength ?? null,
        error: res?.error,
      }));
    }), { method: 'GET', url: 'https://queue.fal.run/media/creator.png', binary: true, timeoutMs: 15000 });
    check('Relay performs valid HTTPS and returns bytes', mediaSummary.ok === true && mediaSummary.byteLength > 1000, JSON.stringify(mediaSummary));
    const badAuth = await ask({ method: 'GET', url: 'https://queue.fal.run/fal-ai/flux/schnell/requests/x/status', timeoutMs: 15000, headers: { Authorization: 'Key nope' } });
    check('Provider rejects bad credentials (403)', badAuth?.data?.status === 403, `status=${badAuth?.data?.status}`);
    await page.close();
  }

  /* ============================================================= */
  /* S1: first run, image validation, offline content               */
  /* ============================================================= */
  {
    const page = await openPopup();
    await truthy('Popup renders product card (S1)', () => page.$('#card-product'));
    check('Config warning shown before setup', await page.$eval('#config-warning', (el) => !el.classList.contains('hidden')));
    await page.screenshot({ path: join(SHOTS, '01-popup-fresh.png') });

    const fileInput = await page.$('#product-image-slot input[type=file]');
    await fileInput.uploadFile(join(HERE, 'fixtures', 'invalid.txt'));
    await sleep(300);
    const invalidErr = await truthy('Invalid image rejected with clear error', () => page.$eval('#product-image-slot', (el) => {
      const b = el.querySelector('.status-banner');
      return b && /Unsupported image format/i.test(b.textContent);
    }), { tries: 10 });
    check('Invalid image error mentions allowed formats', !!invalidErr);

    await fileInput.uploadFile(join(HERE, 'fixtures', 'product.png'));
    await truthy('Product image preview appears', () => page.$eval('#product-image-slot', (el) => !!el.querySelector('img') && el.querySelector('img').naturalWidth > 0), { tries: 20 });

    const creatorInput = await page.$('#creator-image-slot input[type=file]');
    await creatorInput.uploadFile(join(HERE, 'fixtures', 'creator.png'));
    await truthy('Creator image preview appears', () => page.$eval('#creator-image-slot', (el) => !!el.querySelector('img') && el.querySelector('img').naturalWidth > 0), { tries: 20 });
    check('State hook reports creator upload', (await page.evaluate(() => window.__reelforge.state())).hasCreatorUpload === true);
    await page.$eval('#creator-image-slot', (el) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove')?.click());
    await sleep(300);
    check('Creator removal clears state', (await page.evaluate(() => window.__reelforge.state())).hasCreatorUpload === false);

    await page.$eval('#field-name', (el) => { el.value = 'GlowDrop Hydrating Serum'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-description', (el) => { el.value = 'A hydrating face serum with hyaluronic acid.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-problem', (el) => { el.value = 'Dry skin that gets tight by midday.'; el.dispatchEvent(new Event('input', { bubbles: true })); });

    await page.click('#btn-generate-script');
    const localScript = await truthy('Offline template script generated with all six labels', () => page.$eval('#script', (t) => {
      const v = t.value;
      return ['HOOK', 'PROBLEM', 'SOLUTION', 'PRODUCT', 'BENEFIT', 'CTA'].every((s) => v.includes(s)) ? v : null;
    }), { tries: 20 });
    check('Offline script sounds human (first person)', /\bI\b|my /i.test(localScript || ''));

    await page.click('#btn-generate-hooks');
    await truthy('Offline hooks render as clickable chips', () => page.$$eval('.hook-chip', (els) => els.length >= 6), { tries: 20 });
    await page.click('.hook-chip');
    await sleep(200);
    const hookInserted = await page.$eval('#script', (t) => /I wish I knew|finally found|stop scrolling|today years old|your sign/i.test(t.value));
    check('Clicking a hook inserts it into the script', hookInserted);

    const before = await page.$eval('#script', (t) => t.value);
    await page.focus('#script');
    await page.keyboard.press('End');
    await page.keyboard.type('  [edited by test]');
    await sleep(100);
    const edited = await page.$eval('#script', (t) => t.value);
    check('Script is editable before generation', edited.includes('[edited by test]') && edited !== before,
      `tail=${JSON.stringify(edited.slice(-60))}`);

    await page.$eval('#field-name', (el) => { el.value = 'GlowDrop Hydrating Serum'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-description', (el) => { el.value = 'A hydrating face serum.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btn-generate-brief');
    await sleep(800);
    const briefNeedsLlm = await bannerText(page, 'brief-status');
    check('"Generate For Me" shows a clear configuration error offline', /language model|LLM/i.test(briefNeedsLlm), briefNeedsLlm);
    await page.screenshot({ path: join(SHOTS, '02-popup-local-script.png') });
    await page.close();
  }

  /* ============================================================= */
  /* S2: direct fal provider through the real network relay          */
  /* ============================================================= */
  {
    const page = await openPopup();
    await clearAll(page);
    await seedSettings(page, {
      mode: 'direct',
      llm: { provider: 'fal', apiKey: 'test-fal-key', model: 'openai/gpt-4o-mini' },
      image: { provider: 'fal', apiKey: 'test-fal-key', model: 'fal-ai/flux/kontext/max' },
      video: { provider: 'fal', apiKey: 'test-fal-key', model: 'fal-ai/kling-video/v2/master/image-to-video', pollInterval: 1 },
    });
    await page.reload();
    await sleep(400);
    check('Config warning hidden once keys are set', await page.$eval('#config-warning', (el) => el.classList.contains('hidden')));

    // Settings gear opens the options page
    const settingsTarget = browser.waitForTarget((t) => t.type() === 'page' && t.url().includes('settings.html'), { timeout: 8000 });
    await page.click('#btn-settings');
    const settingsPage = await (await settingsTarget).page();
    await sleep(300);
    check('Settings gear opens the settings page', !!settingsPage);
    await settingsPage.screenshot({ path: join(SHOTS, '03-settings-direct.png') });
    await settingsPage.click('#btn-test-llm');
    const llmOk = await truthy('Settings: language connection test passes', () => settingsPage.$eval('#save-status', (el) => /accepted|Connected/i.test(el.textContent)), { tries: 30 });
    check('Language connection success message', !!llmOk);
    await settingsPage.click('#btn-test-all');
    const allOk = await truthy('Settings: Test All Connections passes', () => settingsPage.$eval('#save-status', (el) => /All connection tests passed/i.test(el.textContent)), { tries: 40 });
    check('Test All Connections passes against the provider', !!allOk);
    const masked = await settingsPage.$eval('#llm-key', (el) => el.value === '' && /Saved/.test(el.placeholder));
    check('Saved API keys are not echoed back into the form', masked);
    await settingsPage.close();

    // Brief + script via real fal queue
    await page.$eval('#field-name', (el) => { el.value = 'GlowDrop Hydrating Serum'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btn-generate-brief');
    await truthy('"Generate For Me" fills product fields via the LLM', () => page.$eval('#field-audience', (el) => el.value.length > 5), { tries: 40 });
    const offer = await page.$eval('#field-offer', (el) => el.value);
    check('Brief generation filled the offer field', /20/.test(offer), offer);

    const fileInput = await page.$('#product-image-slot input[type=file]');
    await fileInput.uploadFile(join(HERE, 'fixtures', 'product.png'));
    await truthy('Product image ready', () => page.$eval('#product-image-slot', (el) => !!el.querySelector('img')), { tries: 20 });

    await page.click('#btn-generate-script');
    await truthy('LLM script generated through the queue', () => page.$eval('#script', (t) => /CTA/.test(t.value) && /GlowDrop|hydrating/i.test(t.value)), { tries: 40 });

    // Auto-creator (no upload) then full video flow
    await page.click('#btn-generate-creator');
    await truthy('AI creator generated from product image (DIRECT)', () => page.$eval('#creator-image-slot', (el) => !!el.querySelector('img') && /AI-generated/i.test(el.textContent)), { tries: 60 });

    await page.click('#btn-generate-video');
    await truthy('Progress UI becomes visible', () => page.$eval('#progress', (el) => !el.classList.contains('hidden')), { tries: 10 });
    const done = await truthy('DIRECT video result card appears (queue submit -> poll -> fetch)', () => page.$eval('#card-result', (el) => !el.classList.contains('hidden')), { tries: 120, gap: 1000 });
    check('Video completed end-to-end via the fal queue lifecycle', !!done);
    await truthy('Result video reaches HAVE_METADATA', () => page.$eval('#result-video', (v) => v.readyState >= 1 && v.videoWidth > 0), { tries: 60 });
    await truthy('Result duration populates (including WebM seekable-range fallback)', () => page.$eval('#result-duration', (el) => /\d/.test(el.textContent)), { tries: 40 });

    const meta = await page.evaluate(() => ({
      state: document.getElementById('result-state').textContent,
      provider: document.getElementById('result-provider').textContent,
      size: document.getElementById('result-size').textContent,
      duration: document.getElementById('result-duration').textContent,
      ready: document.getElementById('result-video').readyState,
      w: document.getElementById('result-video').videoWidth,
    }));
    check('Result status Completed', /completed/i.test(meta.state), JSON.stringify(meta));
    check('Result shows provider/model', /fal/i.test(meta.provider), meta.provider);
    check('Result shows file size', /KB|MB|B/.test(meta.size), meta.size);
    check('Result video loaded metadata', meta.ready >= 1 && meta.w > 0, JSON.stringify(meta));
    check('Result duration displayed', /\d/.test(meta.duration), meta.duration);
    await page.screenshot({ path: join(SHOTS, '04-result-direct.png') });

    const beforeFiles = new Set(readdirSync(DOWNLOADS));
    await page.click('#btn-download');
    const downloaded = await truthy('Download writes a video file to disk', () => {
      const files = readdirSync(DOWNLOADS).filter((f) => !f.endsWith('.crdownload') && !beforeFiles.has(f));
      return files.find((f) => statSync(join(DOWNLOADS, f)).size > 1000) || null;
    }, { tries: 60, gap: 500 });
    check('Downloaded bytes match the generated media', !!downloaded && statSync(join(DOWNLOADS, downloaded)).size === readFileSync(join(HERE, 'fixtures', 'sample.webm')).length, downloaded || 'none');

    // History
    await page.click('#btn-history');
    const historyItem = await truthy('History lists the completed project', () => page.$eval('#history-list', (el) => /GlowDrop/.test(el.textContent) && /completed/i.test(el.textContent)), { tries: 20 });
    check('History shows product name + completed badge', !!historyItem);
    await page.screenshot({ path: join(SHOTS, '05-history.png') });
    await page.$$eval('#history-list button', (els) => els.find((b) => b.textContent.trim() === 'Open')?.click());
    const reopenedSameView = await truthy('History Open restores the result view', () => page.$eval('#card-result', (el) => !el.classList.contains('hidden')), { tries: 40 });
    check('History Open restores the result view', !!reopenedSameView);
    await page.$eval('#history-modal', (el) => el.classList.add('hidden'));

    // Reload the page (all in-memory blob URLs vanish) and reopen the same project:
    // playback must then come from the IndexedDB video cache.
    await page.reload();
    await sleep(500);
    await page.click('#btn-history');
    await truthy('History modal populated after reload', () => page.$('#history-list .history-item'), { tries: 20 });
    await page.$$eval('#history-list button', (els) => els.find((b) => b.textContent.trim() === 'Open')?.click());
    const reopened = await truthy('Reopening after reload restores the video from IndexedDB', () => page.$eval('#result-video', (v) => v.readyState >= 1 && v.videoWidth > 0), { tries: 40 });
    check('Reopened project video plays from local cache after reload', !!reopened);
    await truthy('Reopened project shows duration after reload', () => page.$eval('#result-duration', (el) => /\d/.test(el.textContent)), { tries: 30 });

    await page.click('#btn-edit-script');
    await sleep(400);
    check('Edit Script focuses the script textarea', await page.evaluate(() => document.activeElement?.id === 'script'));

    await page.click('#btn-new');
    await sleep(600);
    const fresh = await page.evaluate(() => ({
      name: document.getElementById('field-name').value,
      img: !!document.querySelector('#product-image-slot img'),
      resultHidden: document.getElementById('card-result').classList.contains('hidden'),
      s: window.__reelforge.state(),
    }));
    check('Create Another Video resets product, images and result', fresh.name === '' && !fresh.img && fresh.resultHidden && !fresh.s.hasProductImage, JSON.stringify(fresh));
    await page.close();
  }

  /* ============================================================= */
  /* S2b: uploaded-creator workflow (branch A of the creator feature) */
  /* ============================================================= */
  {
    const page = await openPopup();
    await resetWorkflow(page);
    await seedSettings(page, {
      mode: 'direct',
      llm: { provider: 'local' },
      image: { provider: 'fal', apiKey: 'test-fal-key', model: 'fal-ai/flux/kontext/max' },
      video: { provider: 'fal', apiKey: 'test-fal-key', model: 'fal-ai/kling-video/v2/master/image-to-video', pollInterval: 1 },
    });
    await page.reload();
    await sleep(300);
    await page.$eval('#field-name', (el) => { el.value = 'Creator Upload Test'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-description', (el) => { el.value = 'A product demo with an uploaded creator image.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const productInput = await page.$('#product-image-slot input[type=file]');
    await productInput.uploadFile(join(HERE, 'fixtures', 'product.png'));
    await sleep(500);
    const creatorInput = await page.$('#creator-image-slot input[type=file]');
    await creatorInput.uploadFile(join(HERE, 'fixtures', 'creator.png'));
    await sleep(500);
    await page.click('#btn-generate-script');
    await truthy('Script present (uploaded creator branch)', () => page.$eval('#script', (t) => /HOOK/.test(t.value)), { tries: 20 });
    await page.click('#btn-generate-video');
    const done = await truthy('Video completes with an UPLOADED creator (no AI image call)', () => page.$eval('#card-result', (el) => !el.classList.contains('hidden')), { tries: 90, gap: 1000 });
    check('Uploaded creator used successfully end-to-end', !!done);
    // The video job payload should carry the uploaded creator data URI and the project should record source=upload
    const projects = await getStorage(page, STORAGE_KEYS.HISTORY);
    const project = projects.find((p) => p.productName === 'Creator Upload Test');
    check('Project records that the creator image was user-uploaded', project?.creatorSource === 'upload', project?.creatorSource);
    await page.close();
  }

  /* ============================================================= */
  /* S3: secure backend proxy mode through the REAL backend          */
  /* ============================================================= */
  {
    const settings = await openSettings();
    await settings.click('input[name="mode"][value="proxy"]');
    await settings.$eval('#proxy-url', (el) => { el.value = 'http://127.0.0.1:8787'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await settings.$eval('#proxy-key', (el) => { el.value = 'test-key'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await settings.click('#btn-save');
    const saved = await truthy('Proxy settings saved through the real settings UI', () => settings.$eval('#save-status', (el) => /Settings saved/i.test(el.textContent)), { tries: 20 });
    check('Proxy mode saved', !!saved);
    await settings.click('#btn-test-proxy');
    const probe = await truthy('Backend connection test passes from the settings page', () => settings.$eval('#save-status', (el) => /accepted|Connected/i.test(el.textContent)), { tries: 30 });
    check('Proxy connection test successful', !!probe);
    await settings.screenshot({ path: join(SHOTS, '06-settings-proxy.png') });
    await settings.close();

    const page = await openPopup();
    await resetWorkflow(page);
    await page.reload();
    await sleep(300);
    check('No config warning in proxy mode', await page.$eval('#config-warning', (el) => el.classList.contains('hidden')));
    await page.$eval('#field-name', (el) => { el.value = 'NovaBlend Coffee Maker'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-description', (el) => { el.value = 'A single-serve coffee maker that brews in 60 seconds.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btn-generate-brief');
    await truthy('Proxy brief generation fills fields', () => page.$eval('#field-audience', (el) => el.value.length > 3), { tries: 40 });
    const fileInput = await page.$('#product-image-slot input[type=file]');
    await fileInput.uploadFile(join(HERE, 'fixtures', 'product.png'));
    await truthy('Product image uploaded (proxy mode)', () => page.$eval('#product-image-slot', (el) => !!el.querySelector('img')), { tries: 20 });
    await page.click('#btn-generate-script');
    await truthy('Proxy script generated', () => page.$eval('#script', (t) => /HOOK/.test(t.value)), { tries: 60 });

    // No creator uploaded -> the backend generates the creator, then the video
    await page.click('#btn-generate-video');
    const done = await truthy('PROXY video completes (auto creator + server-side polling)', () => page.$eval('#card-result', (el) => !el.classList.contains('hidden')), { tries: 180, gap: 1000 });
    check('Proxy video result card shown', !!done);
    await truthy('Proxy result video reaches HAVE_METADATA', () => page.$eval('#result-video', (v) => v.readyState >= 1 && v.videoWidth > 0), { tries: 80 });
    const videoState = await page.evaluate(() => ({
      ready: document.getElementById('result-video').readyState,
      provider: document.getElementById('result-provider').textContent,
      duration: document.getElementById('result-duration').textContent,
    }));
    check('Proxy result video is playable', videoState.ready >= 1, JSON.stringify(videoState));
    check('Proxy result provider label is the backend', /backend/i.test(videoState.provider), videoState.provider);
    await page.screenshot({ path: join(SHOTS, '07-result-proxy.png') });

    const before = new Set(readdirSync(DOWNLOADS));
    await page.click('#btn-download');
    const dl = await truthy('Proxy download streams bytes through the backend content route', () => {
      const files = readdirSync(DOWNLOADS).filter((f) => !f.endsWith('.crdownload') && !before.has(f));
      return files.find((f) => statSync(join(DOWNLOADS, f)).size > 1000) || null;
    }, { tries: 60, gap: 500 });
    check('Proxy-downloaded file matches the media', !!dl && statSync(join(DOWNLOADS, dl)).size === readFileSync(join(HERE, 'fixtures', 'sample.webm')).length, dl);
    await page.close();
  }

  /* ============================================================= */
  /* S4: failure handling                                            */
  /* ============================================================= */
  {
    const page = await openPopup();
    await resetWorkflow(page);
    await seedSettings(page, {
      mode: 'direct',
      llm: { provider: 'local' },
      image: { provider: 'fal', apiKey: 'wrong-key', model: 'fal-ai/flux/kontext/max' },
      video: { provider: 'fal', apiKey: 'test-fal-key', model: 'fal-ai/kling-video/v2/master/image-to-video', pollInterval: 1 },
    });
    await page.reload();
    await sleep(300);
    await page.$eval('#field-name', (el) => { el.value = 'Bad Key Product'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#field-description', (el) => { el.value = 'Something.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const fileInput = await page.$('#product-image-slot input[type=file]');
    await fileInput.uploadFile(join(HERE, 'fixtures', 'product.png'));
    await truthy('Product image uploaded (failure test)', () => page.$eval('#product-image-slot', (el) => !!el.querySelector('img')), { tries: 20 });
    await page.click('#btn-generate-creator');
    const authErr = await truthy('Bad API key yields a clear error (no fake success)', () => page.$eval('#creator-status', (el) => /rejected|403|key|auth/i.test(el.textContent)), { tries: 40 });
    check('Authentication failure surfaced honestly', !!authErr);
    check('No result card after failure', await page.$eval('#card-result', (el) => el.classList.contains('hidden')));
    await page.screenshot({ path: join(SHOTS, '08-error-bad-key.png') });
    await page.close();
  }
  {
    const page = await openPopup();
    await resetWorkflow(page);
    await seedSettings(page, {
      mode: 'direct',
      llm: { provider: 'openai', apiKey: 'whatever', baseUrl: 'http://127.0.0.1:8799/v1', model: 'gpt-4o-mini' },
      image: { provider: 'fal', apiKey: 'test-fal-key' },
      video: { provider: 'fal', apiKey: 'test-fal-key' },
    });
    await page.reload();
    await sleep(300);
    await page.$eval('#field-name', (el) => { el.value = 'Dead Port Product'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#btn-generate-brief');
    const netErr = await truthy('Dead network endpoint shows a graceful network error', () => page.$eval('#brief-status', (el) => /timed out|network|ECONN|failed|connect|fetch/i.test(el.textContent)), { tries: 40 });
    check('Network failure handled without fake success or crash', !!netErr);
    await page.close();
  }

  /* ============================================================= */
  /* S5: storage assertions                                          */
  /* ============================================================= */
  {
    const page = await openPopup();
    const history = await getStorage(page, STORAGE_KEYS.HISTORY);
    check('History stored in chrome.storage.local', Array.isArray(history) && history.length >= 3, `count=${history?.length}`);
    const completed = history.filter((p) => p.status === 'completed');
    const complete = completed.every((p) => p.script && p.creatorThumb && (p.videoUrl || p.videoCached));
    check('Completed projects retain script, creator thumb and video reference', complete,
      JSON.stringify(completed.map((p) => ({ name: p.productName, src: p.creatorSource, hasScript: !!p.script, thumb: !!p.creatorThumb, url: !!p.videoUrl, cached: p.videoCached }))));
    await page.close();
  }

  check('No uncaught page errors during the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join('\n---\n'));
  if (pageErrors.length) console.log('PAGE ERRORS:\n' + pageErrors.join('\n---\n'));

  await browser.close();
  cleanup();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    for (const f of failed) console.log(`FAILED - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
  console.log('E2E OK');
}

main().catch((err) => {
  console.error('HARNESS ERROR', err);
  try {
    spawnSync('sudo', ['-n', 'pkill', '-f', 'mock-fal[.]mjs']);
  } catch {}
  process.exit(2);
});
