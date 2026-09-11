# UGC Video Creator

A production-minded Chrome Extension (Manifest V3) for turning a script and product assets into UGC-style short-form videos. The UI is intentionally dependency-free so it can be loaded unpacked without a build step. The secure provider gateway is a small Node server with replaceable LLM/TTS adapters.

## Architecture

```text
extension/
  manifest.json             Chrome MV3 configuration
  popup.html                small action popup that opens the studio
  dashboard.html            full extension application shell
  src/
    app.js                  state, workflow, UI event wiring
    api.js                  backend client (never contains provider secrets)
    storage.js              project/asset persistence (chrome.storage + IndexedDB)
    renderer.js             browser Canvas/MediaRecorder renderer
    styles.css              premium responsive UI
server/
  server.js                 static host + JSON API gateway
  providers/
    index.js                provider registry and routing
    openai-compatible.js     multimodal LLM, vision, hooks and creator-image adapter
    elevenlabs.js            ElevenLabs TTS adapter
    replicate-video.js       replaceable image/video/lip-sync job adapter
    local-planner.js         deterministic, honest offline storyboard and hook planner
  rendering/
    index.js                 renderer contract and server capability reporting
.env.example                server-side provider configuration
```

The dashboard can be opened in a browser while developing (`http://localhost:8787`) or from Chrome via **Load unpacked** (`extension/`). The extension defaults to `http://localhost:8787/api`; change this in Settings if the gateway is hosted elsewhere.

The creator pipeline accepts a user-uploaded model/creator image. If none is supplied, it requests a photoreal creator portrait from the configured secure image provider; it never substitutes a cartoon, SVG, CGI avatar or fake “AI” placeholder. Creator imagery is used for hook/problem/benefit/proof/CTA scenes while product imagery is used for product/demo scenes. A product brief plus images can generate a Reel script automatically using the six-beat `Hook → Problem → Product → Benefits → Proof / Result → CTA` structure.

## Run locally

```bash
npm run dev
# open http://localhost:8787
```

For AI providers, copy `.env.example` to `.env` and set keys in the **server environment only**. The browser never receives secret keys. Without a provider key, script analysis and hooks use transparent local planners; photoreal creator generation and AI scene video report a provider requirement instead of pretending to create realistic media.

## Load in Chrome

1. Run the server above.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select this repository's `extension/` folder.
4. Click the extension icon, open the studio, and verify **Settings → API connection**.
5. Configure server-side keys in `.env`, restart the server, then use the workflow.

## Provider setup

- `OPENAI_API_KEY` + optional `OPENAI_BASE_URL`, `LLM_MODEL` and `IMAGE_MODEL` enable multimodal scene planning, product-image understanding, hook generation and photoreal creator generation.
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` enable server-side MP3 voice generation.
- `REPLICATE_API_TOKEN` + `REPLICATE_VIDEO_MODEL` or `REPLICATE_VIDEO_VERSION` enable scene-level image/video generation. Configure the model-specific input field names in `.env`; this adapter can pass creator/product reference images and generated voice audio to a model that supports them.
- Use a provider/model that explicitly supports reference-image consistency and audio/lip-sync when those features are required. The app does not claim lip-sync for a model that does not support it.
- `ffmpeg` is used for MP4 delivery when installed. The extension always renders a browser WebM from Canvas first; when `/api/capabilities` reports `serverMp4: true`, the same one-click render transcodes that output to H.264/AAC MP4. Without FFmpeg, the honest fallback is a downloadable WebM.

## Security notes

- Never put provider keys into extension JavaScript or `chrome.storage`.
- The local server has no user authentication because it is a single-user local development gateway. For deployment, put it behind HTTPS, authentication, rate limiting, encrypted secret storage, and a real job queue.
- Uploaded images stay in the browser's IndexedDB unless an explicit provider/API upload is added.

## Product behavior

The workflow is connected end-to-end: add product/person references → generate a Reel script or paste one → use the Hook Generator → analyze product images and plan Hook/Problem/Product/Demo/Benefits/Result/CTA scenes → edit the storyboard → generate or regenerate individual AI scenes → generate voice → render a Canvas/video-backed Reel with captions, transitions, zooms and audio ducking → preview/download WebM or MP4 → save the project. TTS, LLM, image and video providers are modular and fail clearly when not configured.
