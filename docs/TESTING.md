# Testing

There are two zero-install dev suites (Node 18+; the browser used here is
Chromium 131). The Chromium binary used in this environment is **chrome-headless-shell**,
which does not implement Chrome's extension subsystem, so the MV3 tests run the
real extension pages/modules in a real browser with a small **test-only**
`chrome.*` shim. The shim routes every network request through the same
`scripts/net-relay.js` the service worker uses, so the requests are real HTTPS
(verified with a TLS mock provider and the real backend).

## Suites

### 1. `node tests/unit-node.mjs` (~370 assertions)

- Six-section offline script and hook generation, labelling/parsing round trips,
  JSON extraction from LLM output, prompt builders.
- v2 settings shape: catalogue order
  (local, gemini, openai, openrouter, groq, together, fal), per-provider
  credential slots, v1→v2 migration (legacy shared `llm.apiKey/baseUrl/model`
  moves into the selected provider slot only), idempotency, key masking.
- Native Gemini adapter against an HTTP mock implementing
  `models/:model:generateContent` and `models` listing: `x-goog-api-key`
  header (never Bearer), `systemInstruction`, role mapping,
  `responseMimeType`, exact "Gemini connection failed…" error on
  `API_KEY_INVALID`, safety-block and empty-response handling; OpenAI/Groq
  adapters use Bearer and their own exact error strings; cross-host key
  isolation is asserted on captured traffic.
- Backend parity: `geminiChat` and the gemini `ping` branch.
- Service worker message wiring through the real relay against a local HTTP mock
  (allow/deny checks).
- The real `reelforge-backend` against a fal-shaped localhost mock: health,
  proxy-key 401, `/api/test`, chat, image (data URL), video submit → poll →
  server-side MP4 streaming, 404 for unknown jobs.
- Manifest v3 validation, referenced assets, CSP, minimal permissions.
- Full source security audit (see SECURITY-AUDIT.md).

### 2. `node tests/run-e2e.mjs` (~64 browser checks)

Starts: a TLS mock of the fal queue API (mapped via `/etc/hosts` to
`queue.fal.run`, self-signed cert + `--ignore-certificate-errors`), a plain
HTTP mock of the native Gemini API on `127.0.0.1:8812` (`tests/mock-gemini.mjs`),
the real backend, and a static server that injects a test-only `chrome.*` shim
into the real popup/settings pages. It then drives the actual UI:

- First-run config warning; invalid image rejection; product & creator upload
  previews; creator removal.
- Offline script/hooks; hook insertion; script editing; clear error when the
  brief action is used with no LLM configured.
- Settings page: opens from the gear, test-one and Test-All connections, key
  masking after save.
- Direct mode: AI brief → product image → LLM script → auto AI creator →
  **submit/poll/fetch video lifecycle** → metadata/duration (incl. WebM
  seekable-range fallback) → real file download → history → reopen after a full
  page reload (IndexedDB cache) → edit-script focus → create-another reset.
- Uploaded-creator workflow records `creatorSource: 'upload'`.
- Gemini scenario: bad key shows the exact
  "Gemini connection failed — please check your Gemini API key." banner and
  never echoes the key; good key passes Test Language Connection; marketing
  brief, six hooks and the six-section script are all generated through the
  native `:generateContent` endpoint; mock telemetry proves every request used
  `x-goog-api-key` (no Authorization header), the selected model path,
  `responseMimeType` and `systemInstruction`.
- Proxy mode: configure via the real settings UI → backend test → brief →
  image → script → auto-creator and video completed server-side → download
  through the backend content route.
- Failures: bad key surfaces a clear 403 (no fake success), dead endpoint
  surfaces a network error, no result card appears on failure.
- History retains script + creator thumbnail + video reference.
- No uncaught page errors across the run (expected 4xx network responses used
  by the negative tests are filtered from console errors).

Fixtures: `tests/fixtures/{product.png,creator.png,invalid.txt,sample.webm}`.
The WebM is a real VP8 clip recorded in headless Chromium with MediaRecorder.
Regenerate icons/fixtures with `node tools/make-icons.mjs` and
`node tools/make-fixtures.mjs` (dev-only, requires the test Chromium).

## Manual checklist for a full Chrome build

Because packed/loadable-extension behaviour lives outside chrome-headless-shell,
verify the following once in a normal Chrome / Chromium desktop:

1. `chrome://extensions` → Developer mode → **Load unpacked** → select
   `reelforge-ai-ugc/`; no manifest errors.
2. Open the popup; first-run warning appears until providers are configured.
3. Settings → enter keys → approve the host-permission prompt → Test Connection.
4. Product image upload validation (each accepted type + a rejected `.txt`).
5. Creator image optional workflow, both branches (upload and AI-created).
6. Generate script/hooks/brief; edit text.
7. Generate UGC video; watch queue progress; preview + download.
8. Close the popup mid-generation; reopen → Resume tracking finishes the job.
9. History open/delete; Settings clear-data; download works.
10. DevTools console for the popup, settings and the service worker is clean.

These manual steps are also the exact acceptance list requested for the
release; everything except the extension-host and permission-prompt mechanics is
already covered automatically in the headless suites.
