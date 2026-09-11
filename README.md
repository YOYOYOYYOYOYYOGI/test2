# ReelForge AI UGC Video Generator

A clean, from-scratch Manifest V3 Chrome extension that creates short
UGC-style marketing videos from a product, a product photo and an AI script —
plus an optional zero-dependency secure backend so teams don't have to ship
provider API keys inside the extension.

| Path | What it is |
| --- | --- |
| [`reelforge-ai-ugc/`](reelforge-ai-ugc/) | The Chrome extension (load unpacked / Web Store package) |
| [`reelforge-backend/`](reelforge-backend/) | Optional secure proxy that holds provider keys server-side |
| [`docs/`](docs/) | [Architecture](docs/ARCHITECTURE.md) · [API setup](docs/API-SETUP.md) · [Security audit](docs/SECURITY-AUDIT.md) · [Testing](docs/TESTING.md) |
| [`tests/`](tests/) | Node + headless-Chromium suites and fixtures (dev-only) |
| [`tools/`](tools/) | Dev-only icon/fixture generators |

## Quick start

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   choose `reelforge-ai-ugc/`.
2. Open ReelForge, click the gear, configure providers
   ([guide](docs/API-SETUP.md)). Offline templates cover scripts/hooks with no
   key; image/video need fal.ai, an OpenAI-compatible API, or the secure backend.
3. Fill product info, upload a product image, optionally upload a creator image,
   generate/script/hooks, then **Generate UGC Video**.
4. Preview, download, or reuse the workflow from history.

Team deployment (keys kept on a server) → [`reelforge-backend/README.md`](reelforge-backend/README.md).

## Highlights

- Manifest V3, ES modules, **zero runtime dependencies**, one `storage`
  permission; hosts are optional permissions requested on demand.
- Single auditable network chokepoint (`scripts/net-relay.js`), strict CSP,
  secrets stored locally or behind the backend, no analytics or tracking.
- Swappable provider layer (fal.ai, OpenAI-compatible, offline templates,
  custom backend contract).
- Local history with IndexedDB video caching, resumable asynchronous jobs,
  honest error handling (no fake success).

## Test results

- `node tests/unit-node.mjs` — **325 assertions** (content modules, service
  worker relay, full backend lifecycle, manifest & security audit).
- `node tests/run-e2e.mjs` — **49 end-to-end browser checks** against a TLS mock
  of the provider queue API and the real backend (uploads, both creator-image
  branches, scripts/hooks, video lifecycle, downloads, history, error paths).

See [`docs/TESTING.md`](docs/TESTING.md) for the short manual checklist to run
once on a full desktop Chrome build.

## Release

`ReelForge-AI-UGC-Video-Generator-v1.0.0.zip` at the repository root is built
from `reelforge-ai-ugc/` only — no `node_modules`, tests, dev scripts, source
maps, executables or nested archives.
