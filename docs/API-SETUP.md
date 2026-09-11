# API setup

Everything is "bring your own key". Keys entered in direct mode are stored
locally in `chrome.storage.local` (scoped to the extension, never synced) and
sent only to the origin you configure.

## Option A — fal.ai (images + videos + LLM)

fal hosts image, video and language models behind one queue API.

1. Create an account at <https://fal.ai> and open the Keys page:
   <https://fal.ai/dashboard/keys>.
2. Create a key (restrict/budget it as you like) and copy it.
3. In the extension Settings:
   - Language model → **fal.ai language model** (optional; local templates are
     offline), model e.g. `openai/gpt-4o-mini`.
   - Image provider → **fal.ai**, recommended model
     `fal-ai/flux/kontext/max` (accepts the product photo as a visual reference).
   - Video provider → **fal.ai**, e.g.
     `fal-ai/kling-video/v2/master/image-to-video` (creator image = first frame).
4. Paste the same key into each secret field, **Save Settings**, then use
   **Test Connection**.
5. Approve the host-permission prompt for `https://queue.fal.run` (and fal media
   hosts when a provider returns them).

Notes:

- Images use data URIs, so the product/creator images reach the model without
  public hosting.
- Video generation is billed per generation; Test Connection for video only
  checks authentication (a made-up request id returns 404 for a valid key).

## Option B — OpenAI-compatible APIs

Works with OpenAI and any service exposing compatible routes (OpenRouter,
Groq, Together, local LLM servers, LiteLLM proxies, etc.).

1. Get a key from the service.
2. Set **base URL** appropriately, e.g.
   - OpenAI: `https://api.openai.com/v1`
   - Other providers: their documented `/v1` URL.
3. Pick model names supported by that host (e.g. `gpt-4o-mini`, `gpt-image-1`,
   `sora-2`).
4. Save and use **Test Connection** (calls `GET /models`).

Video via the OpenAI video API is text-to-video; the creator image informs the
written motion prompt. Image-to-video with a first frame uses a fal image-to-video
model instead.

## Option C — Local / offline

Set the language provider to **Local templates**. Hooks and six-section scripts
are generated on-device from your product information. Images and videos still
need an image/video provider (or the backend proxy).

## Option D — Secure backend (teams)

Deploy `reelforge-backend` (see its own README), then in Settings choose
**Secure backend proxy** and enter its HTTPS URL and the proxy key. Provider
secrets stay on the server.

## Permissions you will see

- `storage` — settings, history, drafts (required).
- Optional host permissions, requested only when you trigger an action that
  contacts that host (e.g. `https://queue.fal.run/*`, `https://api.openai.com/*`,
  `http://localhost:*/*`). You can revoke them on the extension details page.
- Nothing else — no tabs, cookies, history, scripting or broad `<all_urls>`.
