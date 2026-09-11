# ReelForge secure backend

A tiny, **zero-dependency** Node 18+ HTTPS proxy that keeps secret AI provider
keys server-side for the ReelForge Chrome extension. The extension never sees
the provider keys; it sends a shared secret header (`X-ReelForge-Key`) instead.

## Why

Chrome extensions are distributed as readable client code, so embedding
provider API keys in the extension exposes them to every user. Direct mode
(keys in `chrome.storage.local`) is fine for a single user on their own
machine; use this backend whenever you distribute the extension inside a team
or organisation.

## Run locally

```bash
cd reelforge-backend
cp .env.example .env       # fill in the keys
node server.mjs            # http://127.0.0.1:8787
```

There is no build step and no `node_modules`. `.env` is loaded manually by the
server; environment variables from your host override it.

In the extension's Settings choose **Secure backend proxy**, set
`http://127.0.0.1:8787` as the URL (HTTP is allowed for localhost), set the same
`PROXY_KEY`, save, then **Test backend connection**.

## Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Listening port |
| `PROXY_KEY` | _(empty)_ | Shared secret required in `X-ReelForge-Key`. Generate with `openssl rand -hex 32` |
| `LLM_PROVIDER` | `openai` | `gemini` (native Google API), `openai` (any OpenAI-compatible chat API) or `fal` |
| `GEMINI_API_KEY` | – | Google Gemini key (used when `LLM_PROVIDER=gemini`) |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Native Gemini REST endpoint |
| `OPENAI_API_KEY` | – | Key for the OpenAI-compatible host |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Chat model name (with Gemini: e.g. `gemini-2.5-flash`) |
| `IMAGE_PROVIDER` | `fal` | `fal` or `openai` |
| `IMAGE_MODEL` | `gpt-image-1` | OpenAI image model |
| `VIDEO_PROVIDER` | `fal` | `fal` or `openai` |
| `FAL_KEY` | – | fal.ai key |
| `FAL_IMAGE_MODEL` | `fal-ai/flux/kontext/max` | fal image endpoint |
| `FAL_VIDEO_MODEL` | `fal-ai/kling-video/v2/master/image-to-video` | fal video endpoint |
| `VIDEO_MODEL` | `sora-2` | OpenAI video model |
| `POLL_INTERVAL_MS` | `4000` | How often the server polls providers |
| `FAL_ROOT_URL` | `https://queue.fal.run` | Override for self-hosted testing |

## Deploy

Any Node 18+ host works (a container, a small VPS, Render/Railway/Fly/Google
Cloud Run, etc.):

1. Deploy this folder with `node server.mjs` as the start command.
2. Put it behind HTTPS (the platform's router or your own reverse proxy).
3. Configure the environment variables above.
4. Set a long, random `PROXY_KEY`.
5. In the extension Settings → proxy mode, enter the public HTTPS URL and the key.

Hardening checklist:

- [ ] HTTPS only in production (the extension itself refuses plain HTTP except localhost).
- [ ] Strong unique `PROXY_KEY`; rotate it as needed.
- [ ] Restrict CORS (`Access-Control-Allow-Origin` is currently `*`; lock it to your own origin if you serve anything else).
- [ ] Add rate limiting at the platform/router level.
- [ ] Keep the process updated; this server intentionally stores no data.

## HTTP contract

| Method & path | Body | Returns |
| --- | --- | --- |
| `GET /health` | – | `{ok:true}` (no key) |
| `POST /api/chat` | `{messages, json?, maxTokens?}` | `{text}` |
| `POST /api/image` | `{prompt, referenceDataUrl?}` | `{dataUrl, url?, model}` |
| `POST /api/video` | `{prompt, imageDataUrl?, duration}` | `{jobId, status, model}` |
| `GET /api/video/:jobId` | – | `{status, progress, log, videoUrl, error}` |
| `GET /api/video/:jobId/content` | – | finished MP4 bytes (proxied server-side) |
| `POST /api/test` | `{kind: 'llm'\|'image'\|'video'}` | `{ok, message}` |

Jobs are kept in memory for 90 minutes. Request bodies are capped at 32 MB.
The server never logs keys, request bodies or generated media.
