# ReelForge Backend

A tiny secure proxy that keeps AI provider API keys **out of the Chrome extension**.

```
extension ──▶ POST http://localhost:8787/api/proxy/openai/chat/completions
                    │  injects OPENAI_API_KEY from .env
                    ▼
             https://api.openai.com/v1/chat/completions
```

## Setup

```bash
cd backend
cp .env.example .env      # then edit .env — add the provider keys you use
npm install
npm start                 # → http://localhost:8787  (npm run dev for auto-reload)
```

Open `http://localhost:8787` in a browser to see the status page (lists which provider keys are loaded — booleans only, never values).

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | `{ ok, service, version, keys: {openai: true, …}, tokenRequired }` |
| `ANY /api/proxy/:provider/*` | Authenticated streaming passthrough to the provider |
| `GET /` | Status page |

Supported `:provider` keys: `openai`, `openai-compat`, `anthropic`, `gemini`, `stability`, `replicate`, `fal`, `elevenlabs`.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default 8787) |
| `EXTENSION_TOKEN` | Optional shared secret; extension must send it as `x-ugc-token` |
| `EXTRA_ORIGIN` | Optional extra allowed CORS origin |
| `OPENAI_API_KEY` | OpenAI (LLM, images, TTS) |
| `ANTHROPIC_API_KEY` | Claude |
| `GEMINI_API_KEY` | Google Gemini |
| `OPENAI_COMPAT_BASE_URL` / `OPENAI_COMPAT_API_KEY` | Groq / OpenRouter / local OpenAI-compatible |
| `STABILITY_API_KEY` | Stability AI |
| `REPLICATE_API_TOKEN` | Replicate |
| `FAL_KEY` | fal.ai |
| `ELEVENLABS_API_KEY` | ElevenLabs |

**Never commit `.env`** (it is git-ignored).

## Connecting the extension

1. Extension → **Settings → Connection → Backend mode**.
2. Backend URL: `http://localhost:8787` (or your deployed URL).
3. Access token: same value as `EXTENSION_TOKEN` (leave empty if unset).
4. Pick providers per capability — no keys needed in the extension anymore.
5. Use **Test connection** — it reports whether the backend has each key.

## Production notes

- Put the backend behind TLS if it is reachable beyond localhost, and **always** set `EXTENSION_TOKEN`.
- The proxy streams bodies (multipart image uploads and large data-URL JSON included) and stores nothing.
- No rate limiting is included — put it behind your existing gateway if you expose it publicly.
