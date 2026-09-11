# Security audit

Performed against the extension source in `reelforge-ai-ugc/` (the folder that
ships). Re-run every check with `node tests/unit-node.mjs` (sections 4–5) and
the manual greps below.

## Permissions (manifest.json)

```json
"permissions": ["storage"],
"optional_host_permissions": [
  "https://*/*",
  "http://localhost:*/*",
  "http://127.0.0.1:*/*"
]
```

- There is **no** `<all_urls>` host permission; host access is optional and is
  requested only for the specific API origin an action needs (and can be
  revoked in `chrome://extensions`).
- No `tabs`, `cookies`, `history`, `webRequest`, `scripting`, `management`
  permissions.

## Content Security Policy

```
script-src 'self'; object-src 'self'; base-uri 'self'
```

- No `remote code` allowances, no `unsafe-eval`, no `unsafe-inline`.
- HTML has no inline event handlers and no inline scripts.
- All JavaScript is local ES modules; there is no third-party JS to ship.

## Network design

- Exactly one network chokepoint: `scripts/net-relay.js`. The automated audit
  verifies **no other file calls `fetch()`** except that module.
- The relay rejects:
  - non-HTTPS URLs (except `http://localhost` / `127.0.0.1`),
  - non-HTTP schemes (`file:`, `chrome:`, etc.),
  - methods outside GET/POST/PUT/DELETE,
  - non-string bodies,
  - responses above a 200 MB ceiling,
- `credentials: 'omit'` — cookies are never sent to providers.
- Responses are read as text/bytes and parsed as data; they are never executed
  (no `eval`, `new Function`, injected `<script>`, document.write).
- Keys travel as HTTPS headers only; in proxy mode keys never leave the server.

## Secrets handling

- Direct-mode keys live only in `chrome.storage.local` (not `sync`): they stay
  on the device and are not uploaded to a Google account.
- Settings forms never write saved keys back into inputs; password fields stay
  blank with a "Saved" placeholder, and a Clear button removes a stored key.
- The settings page exposes a masked view only; nothing logs keys.
- Language credentials are stored per provider
  (`llm.providers.{gemini,openai,openrouter,groq,together,fal}.apiKey`) and the
  adapter for the selected provider only ever sends its own key to its own
  origin (Gemini uses the native `x-goog-api-key` header against
  `generativelanguage.googleapis.com`, never a Bearer token; OpenAI-shaped
  providers use Bearer against their own base URL). Auth-failure messages name
  the provider and never contain key material; automated tests assert the
  isolation on captured request traffic.
- Team distribution is designed around `reelforge-backend`, where keys never
  reach the extension package.

## Data collection / privacy

- No analytics, no telemetry, no remote beacons, no third-party domains.
- Product info, scripts, images, video metadata and history stay in
  `chrome.storage.local`; video blobs stay in an IndexedDB store (capped at 5
  videos / 25 MB per file).
- Product/creator images are resized/re-encoded locally (canvas) before upload.
- Settings offers "Clear history & drafts (keeps keys)".

## Automated code audit results

`node tests/unit-node.mjs` checks, for every shipped JS/HTML/CSS/JSON file:

- no `eval(`, `new Function`, `document.write`, `.innerHTML`/`.outerHTML`
  assignment, `document.cookie`, `chrome.cookies/tabs/webRequest/history`;
- no unexplained long base64 string literals;
- no remote `<script src>` / stylesheet URLs;
- no executable permission bits;
- only an allow-listed set of file extensions and directories;
- every manifest-referenced file exists and every icon is present;
- `fetch()` exists only in `scripts/net-relay.js`.

Latest local run: **325 unit/integration assertions passed**, and
**49 end-to-end browser checks passed** (`node tests/run-e2e.mjs`).

## Dependency audit

- The extension has **zero runtime npm dependencies** — only native browser
  APIs and first-party code.
- The optional backend has **zero npm dependencies** (Node 18 built-ins only).
- Dev/test tooling (puppeteer-core and a downloaded Chromium) is not shipped and
  never placed inside the extension folder.

## Manual greps (evidence on demand)

```
grep -rnE "eval\(|new Function|document\.write|document\.cookie|chrome\.cookies|chrome\.tabs|chrome\.webRequest|innerHTML" reelforge-ai-ugc
grep -rnE "src=['\"]https?://|href=['\"]https?://" reelforge-ai-ugc
find reelforge-ai-ugc -type f -executable
```

All three currently return only an explanatory comment mentioning `innerHTML`.
