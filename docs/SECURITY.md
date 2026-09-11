# Security

## Threat model & key handling

**Rule: secret API keys never live in frontend JavaScript.**

| Mode | Where the provider key is stored | Who sees it |
|---|---|---|
| **Backend mode (default recommendation)** | Backend server **environment variables** (`backend/.env`, git-ignored) | Only the backend. The extension sends requests to `/api/proxy/<provider>/…` and the backend injects `Authorization` server-side. |
| **Direct mode (explicit user choice)** | `chrome.storage.local` of the user's own browser profile. Never synced (`storage.local`, not `storage.sync`), never embedded in code, manifest or content scripts, sent only to the provider endpoint the user configured. | The user's own machine — acceptable for a personal BYO-key tool, and the Settings UI says so. |

The extension ships with **no keys anywhere**: not in `manifest.json`, not in any JS file, not in the ZIP. Verify with `grep -r "sk-" extension/src` → 0 hits.

## Backend hardening

- **Shared-secret auth** — set `EXTENSION_TOKEN` in `backend/.env`; every proxied request must carry the same value in the `x-ugc-token` header. Configure the same token in extension Settings → Connection. 401 otherwise.
- **Strict CORS** — only `chrome-extension://` origins, `localhost`/`127.0.0.1`, and an optional `EXTRA_ORIGIN` receive `Access-Control-Allow-Origin`. No wildcard `*`.
- **No persistence** — proxied bodies are streamed end-to-end and never logged or stored; `GET /api/health` reports only *booleans* about which keys are present, never values.
- **Local by default** — the backend binds localhost in normal use; if you expose it publicly, put it behind TLS (reverse proxy) and set `EXTENSION_TOKEN`.
- Dependencies: `express` + `dotenv` only (minimal supply-chain surface).

## Extension data

- Projects, media, knowledge base and brand kits live in **IndexedDB + `chrome.storage.local`** on the user's machine. Nothing is telemetry-ed; there is no analytics.
- Uploaded photos and generated media leave the machine **only** as inputs to the provider APIs the user explicitly configured.
- Host permissions: `https://*/*` is requested so direct mode can reach any OpenAI-compatible endpoint the user configures; requests are only made to provider hosts the user selected (or their backend).
- Export backup files contain everything (projects + media + KB) in plain JSON — treat them as sensitive.

## Content Security

- **100% local code** — no remote JavaScript, no `eval`/`new Function`, no dynamic code loading (MV3 compliant), no content scripts, no web-accessible resources, default MV3 content-security-policy.
- **Zero third-party runtime resources** — no CDN scripts, no webfonts, no analytics/telemetry. Even the icons are deterministic local PNGs with no metadata chunks.
- All HTML interpolation goes through the DOM builder (`textContent` semantics); `escapeHtml` used for any string interpolation.
