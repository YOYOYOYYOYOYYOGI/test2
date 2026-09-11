# ReelForge — Architecture

## Overview

Three components, one workflow:

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Chrome Extension (MV3)     │        │  Optional backend (Express)  │
│                             │  HTTPS │                              │
│  popup ── dashboard (SPA) ──┼────────▶  /api/proxy/<provider>/*    │──▶ AI providers
│        │                    │        │  (injects keys from .env)    │
│        ├─ provider layer    │        └──────────────────────────────┘
│        ├─ AI layer          │                 ▲
│        ├─ render engine     │                 │  direct mode (BYO key,
│        └─ storage (IDB +    │                 │  extension → provider,
│           chrome.storage)   │─────────────────┘  needs CORS-open APIs)
└─────────────────────────────┘
```

The **service worker** is intentionally tiny (first-run, badge, message router) so long AI/render jobs are never killed by MV3 idle timeouts — everything heavy runs in the dashboard page.

## Module map

| Layer | Files | Responsibility |
|---|---|---|
| **Core** | `shared/core/utils.js` | Pure helpers (id, JSON extraction, seeded RNG, tokenization) |
| | `shared/core/storage.js` | `chrome.storage.local`: settings, KB, brand kits, style presets |
| | `shared/core/idb.js` | IndexedDB: blobs (images/audio/video) + project records + backup import/export |
| **Providers** (one internal contract per capability) | `shared/providers/config.js` | Provider catalog: labels, default models, key URLs, CORS flags |
| | `shared/providers/transport.js` | Chooses direct vs backend routing, injects auth, normalizes errors |
| | `providers/llm.js` | OpenAI / OpenAI-compatible / Anthropic / Gemini chat + vision + JSON mode |
| | `providers/image.js` | OpenAI images(+edits w/ refs), Stability, Replicate FLUX-Kontext, fal |
| | `providers/video.js` | Replicate & fal image-to-video, configurable model |
| | `providers/tts.js` | OpenAI TTS, ElevenLabs (+ voice list) |
| | `providers/lipsync.js` | fal LatentSync, Replicate LatentSync |
| | `providers/music.js` | fal Stable Audio (local synth is render-side, no network) |
| | `providers/replicate.js` | Prediction create/poll/cancel shared helper |
| | `providers/test.js` | "Test connection" checks (cheap authenticated GETs) |
| **AI layer** | `shared/ai/prompts.js` | All prompts: storyboard schema, hooks (12 categories), creator/scene image prompt builders, style presets (11) |
| | `shared/ai/storyboard.js` | LLM → validated, normalized scene objects |
| | `shared/ai/hooks.js` | Hook generation |
| | `shared/ai/product.js` | Vision analysis of product/creator photos, beauty-mode detection |
| | `shared/ai/kb.js` | Knowledge Base retrieval (IDF-weighted keyword scoring) |
| **Pipeline** | `shared/render/pipeline.js` | Orchestrates analysis → storyboard → per-scene voice/image/video/lipsync → music; resumable; persists after every step |
| **Render engine** (100% local) | `shared/render/compositor.js` | Timeline compositor: Ken Burns camera moves, transitions (cut/crossfade/whip/slide/fade-black), product-focus composition, on-screen text, captions, CTA end-card, WebAudio mixer (music ducking, transition whoosh SFX), MediaRecorder MP4/WebM export |
| | `shared/render/captions.js` | 6 caption styles, word-level timing, animation |
| | `shared/render/music-synth.js` | Offline procedural music (4 styles), WAV encoder |
| **UI** | `dashboard/js/app.js` | Hash router + shell |
| | `dashboard/js/views/*.js` | home, new (wizard), project (storyboard editor + renderer), hooks, knowledge, brandkit, styles, settings |
| | `dashboard/js/ui.js` | DOM builder, toasts, modals, dropzones |
| **Chrome** | `manifest.json`, `popup/`, `background/service-worker.js` | MV3 wiring |

## Data flow (one video)

```
script + photos + brand
   │
   ▼
vision LLM ──▶ productAnalysis {category, packaging, colors, label, summary}
   │
LLM (+KB retrieval, +brand, +style, +hook) ──▶ storyboard { scenes[] normalized }
   │
   ▼ per scene
TTS ──▶ voice blob (duration measured → scene duration adapts)
image AI (+creator ref, +product ref) ──▶ scene still
video AI (optional, still = first frame) ──▶ clip
lipsync AI (optional, creator image + voice) ──▶ talking clip
   │
   ▼
music: local synth / fal / upload (duration = total storyboard)
   │
   ▼
compositor.prepare() ──▶ canvas + WebAudio realtime playback
   ├─ Preview: audio to speakers
   └─ Render:  canvas.captureStream + audio stream → MediaRecorder
               → MP4 (H.264/AAC) or WebM (VP9/Opus) → IndexedDB → Download
```

## Scene resolution order (visuals)

`lipsyncAssetId` → `videoAssetId` → `imageAssetId` → `productImageRef` → honest placeholder. Voice always plays if present; captions always render.

## Storage

- **chrome.storage.local**: settings, provider config, KB entries, brand kits, custom styles (small JSON).
- **IndexedDB** (`reelforge`): every project record + every media blob. Assets are content-addressed by id; deleting a project garbage-collects its assets. Backup = single JSON with base64 assets.

## Why the provider layer looks like this

Each capability exposes **one internal contract** (e.g. `generateImage({prompt, refs, aspect})`). Wire-format differences live inside the adapter. Direct mode and backend mode share the same adapters — only the transport (URL + auth injection) changes, so switching vendors or moving to a hosted backend is a settings change, not a code change.
