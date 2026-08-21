# AI Agents Chat ⚡

A self-hosted mini "arena" — chat with AI agents **Claude Opus** (deep thinker) and **Omni Flash** (fast & punchy), 100% free, using free-tier API keys.

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
| Google AI Studio | https://aistudio.google.com/apikey | `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash` |
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
