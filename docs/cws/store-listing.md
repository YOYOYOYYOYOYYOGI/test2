# Chrome Web Store — submission kit (ReelForge / UGC Video Generator)

Everything below is copy-paste ready for the developer dashboard
(https://chrome.google.com/webstore/devconsole). One-time fee: US $5.
Upload file: **ReelForge-ChromeWebStore-v1.0.0.zip** (manifest.json is at the
ZIP root, as the store requires).

## Store listing fields

| Field | Value |
|---|---|
| Name | ReelForge — AI UGC Video Generator |
| Summary (max 132) | Turn your script and product photos into AI UGC Reels: storyboard, photorealistic creators, voice, captions, music and MP4 export. |
| Category | Productivity → Tools (or "Creativity" if preferred) |
| Language | English (US) |

### Detailed description

Create realistic AI UGC-style advertisement videos for Instagram Reels,
TikTok and YouTube Shorts — entirely from your own script and product photos.

• Script → storyboard → finished MP4 in one guided flow
• Photorealistic AI creators (person images stay consistent across scenes)
• Reference-reel style matching: upload any reel link/file and ReelForge
  extracts pacing, camera and editing style — without copying its content
  (anti-copy guard included)
• Hook Studio: generating scroll-stopping first-3-second variants
• Brand Kit + Knowledge Base: your colors, fonts, product facts reused everywhere
• 11 content presets, beauty mode, caption styling, background music with
  automatic voice ducking
• Export MP4 in 9:16, 1:1 and 16:9, with retry on any failed asset

Bring your own AI key: connect OpenAI, Google Gemini, Anthropic, Stability,
Replicate, fal.ai or ElevenLabs in Settings. Your key stays in your browser
(chrome.storage.local) and is used only for the calls you trigger.
The extension renders and exports everything locally. An optional local
key-proxy backend is available in the project repository.

## Permissions justifications (paste into the review form)

- `storage` — Saves your projects, brand kit, knowledge base and settings locally.
- `unlimitedStorage` — Projects include generated images, audio and video renders that exceed the default local-storage quota.
- `downloads` (optional) — Requests only when you click "Download MP4/PNG" to save the finished video to your disk.
- Host permissions (OpenAI, Anthropic, Google generativelanguage, Stability, Replicate, replicate.delivery, fal.run, fal.media, ElevenLabs) — Used only to call the AI provider you selected in Settings, directly from your browser, over HTTPS. No other network traffic.
- `http://localhost/*` — Optional developer mode: lets the extension talk to a local key-proxy backend you run yourself.
- `https://*/*` (optional host permission) — Only used if you enter a custom self-hosted provider endpoint in Settings; never requested at install time.

## Data usage disclosures (dashboard "Privacy" tab)

- Does not collect or sell user data: **No**
- Does not use data for advertising, creditworthiness or lending: **No**
- API keys, projects and media are stored locally in the browser.
- Content the user creates (script, images) is sent only to the AI provider the
  user explicitly configured, to fulfill the user's own generation request.
- Privacy policy URL: https://yoyoyoyyoyoyyogi.github.io/test2/privacy.html
  (host this file anywhere you control and update the URL if you move it)

## Submission steps

1. Pay the one-time $5 registration fee at the developer console.
2. "New item" → upload **ReelForge-ChromeWebStore-v1.0.0.zip**.
3. Store listing tab → paste the fields above; upload at least one 1280×800
   screenshot (open the dashboard, screenshot the New-project and Editor views)
   and a 440×280 tile.
4. Privacy tab → paste the disclosures + justification texts above; add the
   privacy policy URL.
5. Distribution tab → Public (or Unlisted for testing first — Unlisted still
   installs normally, no Developer-mode warning).
6. Submit for review. Typical review for a permission-light MV3 extension:
   a few hours to a few days.
7. After approval, install happens from the store with one click — Chrome's
   download "Virus detected" warnings no longer apply because installation is
   store-signed and verified.

## Why the store fixes the download problem

Chrome's "Virus detected" download warning is reputation-based scoring of
unsigned archive downloads; it can never be fully retired for direct file
downloads. Chrome Web Store distribution removes it definitively: the package
is reviewed by Google, served and signature-verified by Chrome itself.
