# API setup

Everything is "bring your own key". Keys entered in direct mode are stored
locally in `chrome.storage.local` (scoped to the extension, never synced).

**Each language provider keeps its own key, model and endpoint.** A key is
ever sent to that provider's own host — a Gemini key only to
`generativelanguage.googleapis.com`, an OpenAI key only to `api.openai.com`,
and so on. Switching providers never reuses or mixes keys.

The language-model selector is, in order:

1. **Local Templates** (offline)
2. **Google Gemini** (native Gemini REST API)
3. **OpenAI**
4. **OpenRouter**
5. **Groq**
6. **Together AI**
7. **fal.ai** (fal-ai/any-llm)

## Option A — Google Gemini for scripts, hooks and briefs

The extension talks Google's **native** Gemini REST API
(`POST {base}/models/{model}:generateContent` with the `x-goog-api-key`
header). It is not sent through an OpenAI-compatible shim.

1. Open Google AI Studio → **Get API key**:
   <https://aistudio.google.com/app/apikey>.
2. Create a key in a Google Cloud project (free tier is fine for testing) and
   copy it.
3. In Settings → **Language model**, choose **Google Gemini**.
4. Paste the key into the **Gemini API key** field (it stays hidden and is
   never printed back).
5. Pick a model, e.g. `gemini-2.5-flash` (other suggested aliases:
   `gemini-2.5-flash-lite`, `gemini-2.5-pro`).
6. **Save Settings**, then click **Test Language Connection** — it calls
   `GET {base}/models` and reports
   "Connected to Google Gemini. The Gemini API key was accepted."
7. Approve the host-permission prompt for
   `https://generativelanguage.googleapis.com/*` the first time you generate.

The endpoint defaults to
`https://generativelanguage.googleapis.com/v1beta`; change it only if you use
a Google-compatible proxy. If the key is wrong or expired Google answers with
HTTP 400 (`API_KEY_INVALID` / `API_KEY_EXPIRED`) and the extension reports
exactly: **"Gemini connection failed — please check your Gemini API key."**
The key itself is never included in any message.

Gemini generates text (marketing brief, six-section script, and six hooks).
Images and videos use the separate image/video provider you configure below
(e.g. fal.ai).

## Option B — fal.ai (images + videos, optionally LLM)

fal hosts image, video and language models behind one queue API.

1. Create an account at <https://fal.ai> and open the Keys page:
   <https://fal.ai/dashboard/keys>.
2. Create a key (restrict/budget it as you like) and copy it.
3. In the extension Settings:
   - Language model → **fal.ai** (if you want fal-written copy; local
     templates and Gemini are offline/other alternatives), model e.g.
     `openai/gpt-4o-mini`.
   - Image provider → **fal.ai**, recommended model
     `fal-ai/flux/kontext/max` (accepts the product photo as a visual reference).
   - Video provider → **fal.ai**, e.g.
     `fal-ai/kling-video/v2/master/image-to-video` (creator image = first frame).
4. Paste the same fal key into the fal fields that use it, **Save Settings**,
   then use the connection tests.
5. Approve the host-permission prompt for `https://queue.fal.run` (and fal
   media hosts when a provider returns them).

Notes:

- The fal language key is stored in the **fal.ai** language slot and sent only
  to fal hosts; it is never shared with the Gemini or OpenAI slots.
- Images use data URIs, so the product/creator images reach the model without
  public hosting.
- Video generation is billed per generation; the video connection test only
  checks authentication (a made-up request id returns 404 for a valid key).

## Option C — OpenAI and other OpenAI-compatible APIs

Works with OpenAI and any service exposing compatible chat routes
(OpenRouter, Groq, Together, local LLM servers, LiteLLM proxies, etc.). Each
of OpenAI / OpenRouter / Groq / Together is its own selector entry with its
own saved key — do not paste a Gemini key here, and do not paste an
OpenRouter key into the OpenAI slot.

1. Get a key from the service.
2. Choose the matching provider; the **base URL** is pre-filled, e.g.
   - OpenAI: `https://api.openai.com/v1`
   - OpenRouter: `https://openrouter.ai/api/v1`
   - Groq: `https://api.groq.com/openai/v1`
   - Together: `https://api.together.xyz/v1`
   - Other providers: their documented `/v1` URL.
3. Pick a chat model supported by that host (e.g. `gpt-4o-mini`,
   `llama-3.3-70b-versatile`).
4. Save and use **Test Language Connection** (calls `GET {base}/models`). An
   auth failure is reported per provider, e.g. **"OpenAI connection failed —
   please check your OpenAI API key."**

Image/video via the OpenAI APIs use the image/video sections' own credentials
and the OpenAI endpoint (`POST /images/generations`, `POST /videos` then
polling). OpenAI video is text-to-video; the creator image informs the
written motion prompt. Image-to-video with a first frame uses a fal
image-to-video model instead.

## Option D — Local / offline

Set the language provider to **Local templates**. Hooks and six-section
scripts are generated on-device from your product information. Images and
videos still need an image/video provider (or the backend proxy).

## Option E — Secure backend (teams)

Deploy `reelforge-backend` (see its own README), then in Settings choose
**Secure backend proxy** and enter its HTTPS URL and the proxy key. Provider
secrets stay on the server. The backend supports
`LLM_PROVIDER=gemini|openai|fal`.

## Permissions you will see

- `storage` — settings, history, drafts (required).
- Optional host permissions, requested only when you trigger an action that
  contacts the selected host (e.g.
  `https://generativelanguage.googleapis.com/*`, `https://queue.fal.run/*`,
  `https://api.openai.com/*`, `http://localhost:*/*`). You can revoke them on
  the extension details page.
- Nothing else — no tabs, cookies, history, scripting or broad `<all_urls>`.
