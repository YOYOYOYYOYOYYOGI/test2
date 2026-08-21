# AI Agents Chat ⚡

A self-hosted mini "arena" — 8 free agents (6 chat + image creator + video creator) using free-tier API keys:

| Agent | Style |
|---|---|
| 🟣 Claude Opus | Deep thinker — long, thoughtful answers |
| 🟠 Omni Flash | Speedy — short, punchy answers |
| 🔵 Gemini Nova | Balanced — friendly everyday helper |
| 🩵 DeepSeek Sage | Logical — step-by-step thinker |
| 🟡 Llama Legend | Fun — casual chat with jokes |
| ⚪ Grok Spark | Bold — witty, straight talk |
| 🎨 **Dream Brush** | **CREATES IMAGES** — free (~500/day) via `gemini-2.5-flash-image` |
| 🎬 **Motion Magic** | **CREATES VIDEOS** — Veo API (paid only; free website: labs.google/flow) |

**Flow:** open the site → Setup wizard appears → start **Demo mode** (instant, no key) **or** paste a free API key → **Verify & Start** (the key is tested live) → chat, create images, etc.

> Note: the agent **names are personas**. Real Claude Opus is a paid Anthropic model — here each name is a style/persona running on whichever free model you choose (e.g. Gemini Flash or Llama). Rename or add anything you like.

## Run it

No build step, no install:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

(Any static file server works. Opening `index.html` directly also works in most browsers.)

## Get a FREE API key (2 minutes)

| Provider | Get key | Free models |
|---|---|---|
| Google AI Studio | https://aistudio.google.com/apikey | `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite` |
| OpenRouter | https://openrouter.ai/keys | `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-chat-v3.0324:free`, `google/gemini-2.0-flash-exp:free` |

Paste the key in the app via **⚙️ API key**. It is stored only in your browser's localStorage and sent only to the provider you chose. Free tiers have daily rate limits.

## Add another agent

Open `app.js`, copy an object in `AGENTS`, save, refresh:

```js
{
  id: "night-hawk",
  name: "Night Hawk",
  tag: "Night owl · moody poet answers",
  gradient: "linear-gradient(135deg,#0ea5e9,#22d3ee)",
  systemPrompt: "You are 'Night Hawk', ...",
}
```

A new tab appears automatically.

## Files

- `index.html` — page structure
- `style.css` — dark theme
- `app.js` — agents, providers, chat logic
- `images/` — generated artwork
