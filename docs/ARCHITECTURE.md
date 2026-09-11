# Architecture

```
reelforge-ai-ugc/                 Manifest V3 extension (shipped)
├── manifest.json                 storage permission only; hosts are OPTIONAL permissions
├── popup/                        Main workflow UI (popup.html / .css / .js)
├── settings/                     Options page (provider/key/defaults configuration)
├── background/service-worker.js  Message listener; delegates to net-relay
├── scripts/
│   ├── config.js                 Static catalogue of providers, defaults, field lists
│   ├── errors.js                 Typed errors (validation, configuration, network, provider)
│   ├── util.js                   DOM helpers, image prep, downloads, permissions, HTTP client
│   ├── net-relay.js              THE single network chokepoint (URL/method/body safety + fetch)
│   ├── storage.js                chrome.storage.local (settings/drafts/history) + IndexedDB (video bytes)
│   ├── script-generator.js       LLM prompt builders, parsers and offline template generator
│   ├── workflow.js               Orchestration: brief/script/hooks/creator/video flows + polling
│   └── providers/
│       ├── index.js              Factory selecting direct or proxy adapters from settings
│       ├── llm.js                OpenAI-compatible chat + fal any-llm adapters
│       ├── image.js              fal Flux/Kontext/Seedream + OpenAI image adapters
│       ├── video.js              fal queue video + OpenAI video adapters (submit/poll/download)
│       └── proxy.js              Adapters that call the secure backend contract
└── assets/icons/                 Generated PNG icons (no third-party assets)

reelforge-backend/                Optional zero-dependency Node secure proxy (not shipped)
tests/                            Dev-only: Node + headless-Chromium test suites and fixtures
tools/                            Dev-only: icon/fixture generators
```

## Request flow (direct mode)

```
UI click
  → workflow.js validates inputs
  → optional chrome.permissions.request for the API origin (user gesture)
  → provider adapter builds a JSON request
  → util.httpRequest() posts {type:'rf:fetch', request}
  → background/service-worker.js
  → net-relay.relayFetch()  (scheme/method/body guards, timeout)
  → fetch() with credentials:'omit'
  → provider REST API (queue submit / poll / result)
  → bytes cached in IndexedDB; history written to chrome.storage.local
```

## Request flow (proxy mode)

```
UI → proxy.js adapter → net-relay → HTTPS backend (X-ReelForge-Key)
                                         │  server holds the real provider keys
                                         └→ fal / OpenAI (queue polling server-side)
```

## Real API contracts implemented

- **fal.ai queue** — `POST https://queue.fal.run/{endpoint}` returns
  `request_id/status_url/response_url/cancel_url`; `GET .../status?logs=1`
  returns `IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED`; `GET .../requests/{id}`
  returns the model payload. Image inputs accept `image_url` / `image_urls`
  (data URIs work); videos return `video.url` / `videos[0].url`.
- **OpenAI-compatible chat** — `POST {base}/chat/completions`,
  `GET {base}/models` for key validation, response-format JSON supported.
- **OpenAI-compatible images** — `POST {base}/images/generations`
  (`b64_json` or URL outputs).
- **OpenAI video** — `POST {base}/videos`, poll `GET {base}/videos/{id}`
  (`queued|in_progress|completed|failed`), bytes at `GET {base}/videos/{id}/content`.

## Job lifecycle and resilience

- Video jobs are persisted immediately after submit (`reelforge:jobs:v1`).
- If the popup is closed, a resume banner appears and polling continues from the
  stored job descriptor on reopen.
- Transient polling errors are retried up to a 15-minute ceiling; failed jobs
  surface the provider's error verbatim and never pretend success.
- Finished videos are downloaded as bytes and cached in IndexedDB (max 5
  videos / 25 MB each, oldest evicted). The provider URL is also stored.

## Adding a provider

1. Add catalogue metadata in `scripts/config.js` (`PROVIDERS`).
2. Add an adapter in the matching `scripts/providers/*.js` implementing the same
   interface (LLM: `chat/test`; image: `generateCreator/test`;
   video: `submit/poll/download/test`).
3. Register it in the factory (`providers/index.js`). For the backend, mirror
   the provider in `reelforge-backend/lib/upstream.mjs`.
