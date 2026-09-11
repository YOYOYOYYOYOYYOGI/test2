<div align="center">

# 🎬 ReelForge — AI UGC Video Generator for Chrome

**Turn a script + product photos into a realistic Instagram Reel — storyboard, photorealistic creator, voice-over, lip-sync, captions, music and an MP4 export.**

Chrome Extension (Manifest V3) · Provider-agnostic AI · Local rendering engine · Secure backend included

</div>

---

## What it does

ReelForge is a complete AI UGC (user-generated content) video production studio that runs as a Chrome extension:

1. **You provide:** a video script, product photos, a creator/model photo (or let the AI generate one), product name & info, an optional **reference Instagram Reel**, an optional brand kit, and free-text **Additional Instructions**.
2. **Reference Reel (optional):** ReelForge extracts keyframes locally and a vision model builds a *style profile* — hook technique, scene structure, camera angles/movement, framing, pacing, transitions, speaking style, gestures, expressions, caption look, product presentation, lighting, background, overall visual DNA. **Style only — the output is a brand-new original ad**: no footage, audio, branding, watermarks, caption wording or the reference creator's identity is ever copied (enforced in every prompt and listed as "do not copy" in the UI).
3. **The AI understands the script** and directs a storyboard (hook → problem → demo → CTA…) with per-scene dialog, expressions, gestures, camera moves, lighting, product placement, on-screen text, captions, durations and transitions — blending your script, product, creator, reference style and instructions in that priority order.
4. **Additional Instructions** ("Make her more energetic", "Faster cuts", "Modern bathroom background", "Show the product closer"…) are compiled into real levers — pacing/duration scaling, transition tightening, voice energy, image directives, music mood — and the raw text also reaches the LLM as the highest creative priority.
5. **A dedicated AI Hook Generator** writes scroll-stopping openers across 12 proven categories; you pick one before generating.
6. **Optional Beauty UGC mode** applies skincare/cosmetics scene templates.
7. **The pipeline generates real assets** through your connected AI providers: scene images (with product/creator reference images so packaging and identity stay consistent), voice-over (TTS), optional AI video clips, optional lip-synced talking clips, and background music.
8. **A local rendering engine** composites everything into a vertical 9:16 (also 1:1, 16:9) video — camera moves, transitions, animated word-level captions, music with automatic ducking under the voice, and a brand CTA end-card — and exports a **real MP4 file** (WebM fallback), rendered entirely in your browser.
9. **Everything is editable**: storyboard editor, per-scene regeneration, timeline, captions, music, volumes — plus a **Creative Direction** panel to swap the model image, change the reference reel or update instructions at any time — and re-rendering one edited project never re-generates the whole thing.

### Honesty first (no fake features)

- ReelForge **never pretends** to generate AI content. Every Generate button performs a real API call to a provider **you** connect. Missing provider → clear setup screen, not a fake result.
- Photorealistic humans, lip-sync and animated clips are **quality features that depend on the external AI providers you connect** (see [Supported providers](#supported-providers)). The local renderer is real but composites stills with cinematic motion when no video provider is connected.
- The **UGC Knowledge Base is a retrieval-augmented prompt (RAG) system**. It does **not** train or fine-tune any AI model — it retrieves your saved winning scripts/hooks/rules into each generation prompt, the standard approach used by production AI tools.

---

## Repository layout

```
UGC-Video-Generator/
├── extension/          ← the Chrome extension (load this folder unpacked)
│   ├── manifest.json   ← MV3 manifest
│   ├── icons/
│   └── src/
│       ├── background/     ← service worker
│       ├── popup/          ← toolbar popup
│       ├── dashboard/      ← the full studio app (vanilla JS, ES modules)
│       └── shared/         ← providers, AI layer, render engine, storage
├── backend/            ← optional secure key-proxy server (recommended)
├── docs/               ← architecture, providers, security
└── scripts/            ← packaging script
```

---

## Installation

> ℹ️ The distribution ZIP contains the extension itself (`extension/` folder) plus README and LICENSE. The optional secure backend (`backend/`) and developer docs (`docs/`) live in this GitHub repository — clone or download the repo if you want to run the key-proxy backend.

### 1. Load the extension in Chrome

1. **Download** `UGC-Video-Generator-CLEAN-v1.0.0.zip` and **extract** it.
2. Open `chrome://extensions` in Chrome (Chrome **126+** required — the extension uses MP4 recording).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the extracted **`extension/`** folder.
6. Click the ReelForge icon in the toolbar → **Open AI UGC Studio**.

### 2. Connect AI providers

ReelForge is **provider-agnostic** — a modular abstraction layer means you can swap vendors at any time. Two connection modes:

| Mode | Where keys live | Best for |
|---|---|---|
| **Backend mode (recommended)** | Server environment variables only — the extension never sees them | Production, teams, publishing to the Chrome Web Store |
| **Direct mode (BYO key)** | Your own `chrome.storage.local` (never synced, never transmitted except to the provider you chose) | Quick personal setup |

**Backend mode setup:**

```bash
cd backend
copy env.example.txt to .env     # add your provider API keys here
npm install
npm start                   # → http://localhost:8787
```

Then in the extension: **Settings → Connection → Backend mode**, set `http://localhost:8787` (and the access token if you set `EXTENSION_TOKEN`).

**Direct mode setup:** open **Settings → Providers** in the studio, pick a provider per capability and paste your key. Use the **Test connection** button to verify.

### 3. Minimum viable configuration

| Capability | Required? | What it unlocks |
|---|---|---|
| **LLM** (OpenAI / Anthropic / Gemini / OpenAI-compatible) | ✅ Required | Script understanding, storyboard, hooks, product photo analysis (vision models) |
| Image AI (OpenAI Images / Stability / Replicate FLUX-Kontext / fal) | Optional | Photorealistic UGC scene stills with consistent product & creator |
| Voice AI (OpenAI TTS / ElevenLabs) | Optional | Realistic creator voice-over with speed & style control |
| Lip-sync AI (fal LatentSync / Replicate) | Optional | Talking creator clips synced to the voice |
| Video AI (Replicate / fal image-to-video) | Optional | Animated AI clips per scene |
| Music | ✅ Works out of the box | Local procedural generator (offline, free) — or fal Stable Audio / your own licensed upload |

---

## How to create a video

1. **New UGC Video** → paste your script (or let the AI write one from product info), product name/info, brand kit.
2. **Media** → upload 1–6 product photos (JPG/PNG/WebP) + an optional creator/model photo (or let the AI generate a photorealistic creator) + an optional **reference Instagram Reel** whose style will be matched.
3. **Format & Style** → 9:16 / 1:1 / 16:9, duration, one of 11 style presets (Realistic UGC, Beauty UGC, Unboxing, Problem→Solution, Viral Reel, Cinematic Ad…), **Additional Instructions** (free-text commands with one-click example chips), voice style, caption style, music.
4. **Hook** → the AI Hook Generator proposes hooks in 12 categories; pick one or skip.
5. **Create** → vision AI analyzes your product photos, then the LLM directs the storyboard.
6. **Storyboard editor** → review/edit every scene (dialog, expression, gesture, camera, background, lighting, product placement, text, caption, duration, transition); reorder, duplicate, delete; regenerate any scene's image/voice/video/lip-sync individually.
7. **Creative direction anytime** → in the project view, swap the model image, replace/re-analyze the reference reel, or edit Additional Instructions and rebuild the storyboard.
8. **Generate missing assets** → runs voice → images → optional video clips → optional lip-sync → music. Failed steps are retried individually (continue from failed scene).
9. **Render video** → the local engine records a real MP4 (progress shown). **Preview** plays it live before/after rendering.
10. **Download video** → Instagram-ready file, or keep editing (captions, music, volumes, scene durations) and **Re-render** — a fast local operation.

---

## Feature map

| Requirement | Where |
|---|---|
| Script understanding → storyboard | `shared/ai/storyboard.js`, `shared/ai/prompts.js` |
| AI Hook Generator (12 categories) | `shared/ai/hooks.js`, Hook Studio view |
| Beauty UGC mode | `shared/ai/product.js` + prompts |
| Product image understanding & consistency | `shared/ai/product.js`, reference-image pass-through in `providers/image.js` |
| Voice generation (male/female, accents, languages, speed, emotion styles) | `shared/providers/tts.js` |
| Lip sync | `shared/providers/lipsync.js` |
| Modular provider system (LLM/image/video/avatar/lip-sync/TTS/music/rendering) | `shared/providers/*` + `docs/ARCHITECTURE.md` |
| UGC Knowledge Base (RAG — *not* model training) | `shared/ai/kb.js`, Knowledge Base view |
| Brand Kit | Brand Kit view, `shared/core/storage.js` |
| 11 video style presets + custom styles | `shared/ai/prompts.js`, Styles view |
| Storyboard editor (edit/delete/duplicate/reorder/regenerate) | Project view, `dashboard/js/views/project.js` |
| Video editor (edit → re-render single project locally) | Project view |
| Animated captions (6 styles, highlight, font/size/position/color/animation) | `shared/render/captions.js` |
| Music & SFX (local synth / provider / upload, volume, auto-ducking) | `shared/render/music-synth.js`, compositor |
| Projects dashboard, templates | Home view, IndexedDB persistence |
| MP4 export 1080×1920, preview + download, progress, error/retry/resume | `shared/render/compositor.js`, Project view |
| Chrome MV3 (manifest, popup, service worker, storage, no unnecessary content scripts) | `extension/manifest.json`, `src/popup`, `src/background` |
| Security: keys never in frontend (backend mode), env-var config | `backend/`, `docs/SECURITY.md` |

---

## Supported providers

| Capability | Providers |
|---|---|
| LLM (script/storyboard/hooks/vision) | OpenAI (GPT-4o family), Anthropic (Claude), Google Gemini, any OpenAI-compatible API (Groq, OpenRouter, LM Studio, Ollama-openai…) |
| Image | OpenAI gpt-image-1, Stability (Core/SD3.5), Replicate (FLUX-Kontext — reference images), fal.ai (FLUX-Kontext — reference images) |
| Video | Replicate (WAN / Kling / any I2V model id), fal.ai (Kling I2V) — model id is configurable |
| TTS | OpenAI TTS (10 voices, style instructions, speed), ElevenLabs (multilingual, voice list from your account) |
| Lip-sync | fal.ai (LatentSync), Replicate (LatentSync) |
| Music | **Local procedural generator** (offline, free, 4 styles), fal.ai Stable Audio, user-uploaded licensed tracks |

Adding a provider = one entry in `shared/providers/config.js` + an adapter branch in the relevant capability module. Nothing else changes.

---

## Environment variables (backend)

See [`backend/env.example.txt`](backend/env.example.txt): `PORT`, `EXTENSION_TOKEN`, `EXTRA_ORIGIN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `STABILITY_API_KEY`, `REPLICATE_API_TOKEN`, `FAL_KEY`, `ELEVENLABS_API_KEY`. **Never commit a real `.env`.**

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Provider not configured" message | That capability has no provider connected — Settings → Providers (or switch to backend mode and add the key to `backend/.env`). This is intentional: ReelForge does not fake generation. |
| "Backend online but NO key configured for X" | Add that provider's key to `backend/.env` and restart the backend. |
| LLM returns invalid JSON | Try a stronger model (e.g. `gpt-4o`), or press Regenerate. |
| Product looks different across scenes | Use a reference-image provider (FLUX-Kontext via Replicate/fal, or gpt-image-1) and keep clear product photos uploaded. |
| No voice in the video | Configure a TTS provider; without it the video renders with captions + music only (clearly labeled). |
| Export is `.webm` instead of `.mp4` | Your Chrome is older than 126 — update Chrome; MP4 (H.264/AAC) is used automatically when supported. |
| Render is slow | Rendering plays the timeline once in real time (a 30s reel renders in ~30s). Quality/FPS adjustable in Settings. |
| CORS errors in direct mode | Some providers restrict browser calls — use backend mode (recommended). |
| Extension console errors | Check `chrome://extensions` → ReelForge → service worker log; see `docs/ARCHITECTURE.md`. |

---

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, data flow, render pipeline
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — every provider, models, costs, how to add your own
- [docs/SECURITY.md](docs/SECURITY.md) — key handling, backend auth, data storage
- [backend/README.md](backend/README.md) — backend setup

## License

MIT — see [LICENSE](LICENSE). ReelForge is original software; it does not include or copy any proprietary UI/code/assets from other products. You are responsible for complying with the terms of the AI providers you connect and for holding licenses to any music you upload.
