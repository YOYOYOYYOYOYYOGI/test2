# Supported AI Providers

ReelForge is **not hard-coded to any vendor**. Each capability below accepts several interchangeable providers; model IDs are configurable in **Settings → Providers**.

> ⚠️ **Quality depends on the providers you connect.** The local renderer always produces a real video, but photorealistic humans, lip-sync and animated clips come from the AI providers. Without them you get clearly-labeled still-image scenes with cinematic motion, captions and music — never a fake simulation.

## LLM — script understanding, storyboard, hooks, vision analysis

| Provider | Direct mode | Backend env var | Notes |
|---|---|---|---|
| OpenAI GPT-4o / 4o-mini | ✅ | `OPENAI_API_KEY` | Vision-capable → product photo analysis. JSON mode. |
| Anthropic Claude | ✅ | `ANTHROPIC_API_KEY` | Vision-capable. JSON via prefill. |
| Google Gemini (2.0 Flash recommended) | ✅ | `GEMINI_API_KEY` | Vision-capable, generous free tier. |
| OpenAI-compatible (Groq, OpenRouter, LM Studio, Ollama-openai…) | ✅ custom base URL | `OPENAI_COMPAT_API_KEY` + `OPENAI_COMPAT_BASE_URL` | Vision only if the model supports it. |

**Recommended:** `gpt-4o-mini` (cheap, vision, JSON) or `gemini-2.0-flash`.

## Image generation — scene stills, creator portraits

| Provider | Default model | Reference images (product/creator consistency) |
|---|---|---|
| OpenAI Images | `gpt-image-1` | ✅ edits endpoint, up to 4 refs |
| Stability | `core` | ❌ prompt-only (weaker product consistency) |
| Replicate | `black-forest-labs/flux-kontext-pro` | ✅ primary ref (creator) + prompt product description |
| fal.ai | `fal-ai/flux-pro/v1.1/kontext` | ✅ primary ref |

**Recommended for UGC:** FLUX-Kontext (Replicate or fal) or gpt-image-1 — they accept your actual product photo so the label/packaging stays consistent.

## Video generation — optional animated clips

| Provider | Default model (configurable) |
|---|---|
| Replicate | `wan-video/wan-2.1-i2v-480p` (works with Kling / LTX / Hunyuan model ids too) |
| fal.ai | `fal-ai/kling-video/v1.6/standard/image-to-video` |

The scene still is passed as the first frame — that's how character/product consistency is preserved into the clip.

## Text-to-speech — the creator's voice

| Provider | Details |
|---|---|
| OpenAI TTS | 10 voices, `gpt-4o-mini-tts`, style instructions (casual-friendly / hype / calm / playful), speed 0.25–4× |
| ElevenLabs | Your account's voice list (multilingual v2), clone/custom voices, style & speed settings |

Languages & accents follow the chosen provider/voice — ElevenLabs multilingual covers 29+ languages; dialog written in Spanish/Hindi/etc. is spoken natively.

## Lip-sync — talking creator (optional)

| Provider | Default model | Input |
|---|---|---|
| fal.ai | `fal-ai/latentsync` | creator image + voice audio (data URLs, no hosting needed) |
| Replicate | `bytedance/latentsync` | same |

Identity is preserved because the source image **is** the reference face.

## Music

| Source | Cost | Notes |
|---|---|---|
| **Local procedural generator** | free, offline | Web Audio synth: Upbeat Pop / Chill Lo-fi / Cinematic / Corporate. Royalty-free-style, generated fresh per project. |
| fal.ai Stable Audio | provider pricing | text-to-music |
| Your upload | free | You must hold the license. |

Transition **whoosh SFX** are synthesized locally (noise sweep) — no assets needed.

## Cost expectations (rough)

A 30s reel with all optional features ≈ 1 LLM storyboard (~2k tokens) + 8 images + 8 TTS lines + 8 video clips + 8 lipsync runs. Video/lip-sync dominate the cost. Skip them for text-and-motion reels (still fully Instagram-ready).

## Adding a provider

1. Add an entry to `PROVIDERS.<capability>` in `extension/src/shared/providers/config.js` (label, key URL, default model, base URL).
2. Add an adapter branch in the capability module (`shared/providers/<capability>.js`).
3. (Backend mode) add the passthrough mapping in `backend/src/server.js` `PROVIDERS` with its env var.
4. Add a connectivity test in `shared/providers/test.js` if the API has a cheap GET.

No other file needs to change — views and pipeline only use the capability contracts.
