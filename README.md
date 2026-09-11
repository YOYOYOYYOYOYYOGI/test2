# ReelForge AI UGC Video Generator

A clean, production-oriented Chrome extension (Manifest V3) for creating short
UGC-style marketing videos from a product, a product image and an AI script.

You bring the AI providers (your own accounts/keys). ReelForge orchestrates the
workflow in your browser:

1. Product information (+ optional **Generate For Me** brief).
2. Product image upload (JPG/JPEG/PNG/WEBP, validated and re-encoded on-device).
3. Optional **creator/girl image**. If you do not upload one, the configured
   image provider generates a suitable UGC creator — the workflow never stops
   just because no person photo was supplied.
4. UGC script: write it yourself, or generate one with the labelled sections
   **HOOK · PROBLEM · SOLUTION · PRODUCT · BENEFIT · CTA**. Generate clickable
   hooks and insert any of them. Everything stays editable.
5. Generate the video (asynchronous jobs are polled with live status messages).
6. Preview, download, regenerate, edit the script, or start another video.
7. History is stored locally and projects can be reopened; finished videos are
   cached in IndexedDB (within size/count limits) so previews/downloads keep
   working even if the provider link expires.

## Install (development / unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder — the one that directly contains `manifest.json`.
5. Pin **ReelForge AI** from the extensions puzzle menu and open it.

For the Chrome Web Store, upload the release ZIP (`ReelForge-AI-UGC-Video-Generator-v1.0.0.zip`)
in the Developer Dashboard. The ZIP contains exactly this folder's files.

## Configure providers

Open the extension's **Settings** (gear icon). There are two connection modes:

### Direct provider APIs (default)

Keys are stored only in `chrome.storage.local` for this extension (never synced
to your Google account) and sent straight to the API origins you choose. Host
permission is requested per origin, on demand.

- **Language model (scripts, hooks, brief):** **Google Gemini** through
  Google's native API (`models/{model}:generateContent` with the
  `x-goog-api-key` header), offline templates (no key), OpenAI-compatible chat
  APIs (`/chat/completions` — OpenAI, OpenRouter, Groq, Together, local LLM
  servers), or fal.ai `fal-ai/any-llm`. Each provider stores its own key,
  which is sent only to that provider's host; use the per-section **Test
  Language Connection** button to verify.
- **Image (AI creator):** fal.ai Flux Kontext/Seedream (the product image is
  passed as a visual reference) or an OpenAI-compatible images API.
- **Video:** fal.ai image-to-video models (Kling, MiniMax, Wan, Veo) or the
  OpenAI video API (Sora).

Use **Test Connection** for each section before generating.

### Secure backend proxy (recommended for teams/distribution)

Secret provider keys should never be distributed inside an extension. The
companion, zero-dependency Node backend in `../reelforge-backend` keeps the
provider keys server-side; the extension only stores a shared proxy key
(`X-ReelForge-Key`). Set the backend HTTPS URL in proxy mode. Deployment
instructions: see `../reelforge-backend/README.md`.

## Privacy & security summary

- One permission: `storage`. Network hosts are optional permissions requested
  only when you use an action that needs them.
- All network calls are funnelled through the service worker
  (`scripts/net-relay.js`), which enforces HTTPS (localhost excepted), a method
  allow-list and string-only bodies, and never executes responses.
- No analytics, telemetry, cookies, tab/history access, remote scripts, or
  remote executable code. The content security policy is
  `script-src 'self'; object-src 'self'; base-uri 'self'`.
- Product/creator images are processed locally (canvas) before upload.
- Full details: see `../docs/SECURITY-AUDIT.md`.

## Offline behaviour

With the language provider set to **Local templates**, scripts and hooks are
generated entirely on your device. Image and video generation always require a
configured image/video provider (or the backend proxy).
