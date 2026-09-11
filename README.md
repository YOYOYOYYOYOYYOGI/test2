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
    openai-compatible.js     OpenAI-compatible LLM adapter
    elevenlabs.js            ElevenLabs TTS adapter
    local-planner.js         deterministic, honest offline storyboard planner
  rendering/
    index.js                 renderer contract and server capability reporting
.env.example                server-side provider configuration
```

The dashboard can be opened in a browser while developing (`http://localhost:8787`) or from Chrome via **Load unpacked** (`extension/`). The extension defaults to `http://localhost:8787/api`; change this in Settings if the gateway is hosted elsewhere.

## Run locally

```bash
npm run dev
# open http://localhost:8787
```

For AI providers, copy `.env.example` to `.env` and set keys in the **server environment only**. The browser never receives secret keys. Without a provider key, script analysis uses the transparent local planner; TTS generation reports that a provider must be configured rather than pretending to create audio.

## Load in Chrome

1. Run the server above.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select this repository's `extension/` folder.
4. Click the extension icon, open the studio, and verify **Settings → API connection**.
5. Configure server-side keys in `.env`, restart the server, then use the workflow.

## Provider setup

- `OPENAI_API_KEY` + optional `OPENAI_BASE_URL` and `LLM_MODEL` enable script analysis through an OpenAI-compatible chat completion endpoint.
- `ELEVENLABS_API_KEY` + optional `ELEVENLABS_VOICE_ID` enable server-side MP3 voice generation.
- `ffmpeg` is used for MP4 delivery when installed. The extension always renders a browser WebM from Canvas first; when `/api/capabilities` reports `serverMp4: true`, the same one-click render transcodes that output to H.264/AAC MP4. Without FFmpeg, the honest fallback is a downloadable WebM.

## Security notes

- Never put provider keys into extension JavaScript or `chrome.storage`.
- The local server has no user authentication because it is a single-user local development gateway. For deployment, put it behind HTTPS, authentication, rate limiting, encrypted secret storage, and a real job queue.
- Uploaded images stay in the browser's IndexedDB unless an explicit provider/API upload is added.

## Product behavior

The workflow is connected end-to-end: write or paste a script → analyze into editable scenes → add assets → select a style/ratio → preview storyboard → render a Canvas video with captions, transitions, zooms and image focus → preview/download the WebM → save the project. TTS, LLM and future video providers are modular and fail clearly when not configured.
