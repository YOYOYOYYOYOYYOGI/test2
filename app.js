/* =====================================================
   AI Agents Chat — app logic
   Agents: edit the AGENTS list to add more.
   Flow: demo mode (no key) OR real AI (key verified first).
   ===================================================== */

// ---------- AGENTS ----------
const AGENTS = [
  {
    id: "claude-opus",
    name: "Claude Opus",
    tag: "Deep thinker · long, thoughtful answers",
    gradient: "linear-gradient(135deg,#8b5cf6,#6366f1)",
    systemPrompt:
      "You are 'Claude Opus', a thoughtful, eloquent AI agent. " +
      "Give well-structured, careful, complete answers. Use short headings or bullet " +
      "lists when helpful. Be polite and precise. You may use markdown (bold, `code`).",
  },
  {
    id: "omni-flash",
    name: "Omni Flash",
    tag: "Speedy · short, punchy answers",
    gradient: "linear-gradient(135deg,#fb923c,#f43f5e)",
    systemPrompt:
      "You are 'Omni Flash', a fast, energetic AI agent. " +
      "Answer in the shortest useful way: 1-4 sentences or a tiny list. " +
      "Be friendly and punchy. Add a fitting emoji now and then. Never ramble.",
  },
  {
    id: "gemini-nova",
    name: "Gemini Nova",
    tag: "Balanced · friendly everyday helper",
    gradient: "linear-gradient(135deg,#3b82f6,#06b6d4)",
    systemPrompt:
      "You are 'Gemini Nova', a friendly, balanced AI assistant. " +
      "Give clear, practical, medium-length answers. Explain simply, like talking to a friend. " +
      "Always end with one short helpful tip when relevant.",
  },
  {
    id: "deepseek-sage",
    name: "DeepSeek Sage",
    tag: "Logical · step-by-step thinker",
    gradient: "linear-gradient(135deg,#14b8a6,#0ea5e9)",
    systemPrompt:
      "You are 'DeepSeek Sage', a logical, methodical AI agent. " +
      "Think in clear numbered steps: 1) what is asked, 2) reasoning, 3) conclusion. " +
      "Be precise and factual. Great at math, logic and coding.",
  },
  {
    id: "llama-legend",
    name: "Llama Legend",
    tag: "Fun · casual chat with jokes",
    gradient: "linear-gradient(135deg,#f59e0b,#d97706)",
    systemPrompt:
      "You are 'Llama Legend', a funny, casual AI buddy. " +
      "Talk like a friendly internet pal — relaxed, light jokes, zero formality. " +
      "Still give correct, useful answers, just with humor. Keep it fun and kind.",
  },
  {
    id: "grok-spark",
    name: "Grok Spark",
    tag: "Bold · witty, straight talk",
    gradient: "linear-gradient(135deg,#e2e8f0,#94a3b8)",
    systemPrompt:
      "You are 'Grok Spark', a bold, witty AI agent with attitude. " +
      "Give straight, no-fluff answers with a spark of humor. " +
      "Be direct and honest — witty, never mean.",
  },
  {
    id: "dream-brush",
    name: "Dream Brush",
    tag: "🎨 CREATES IMAGES from words — free",
    kind: "image",
    gradient: "linear-gradient(135deg,#ec4899,#8b5cf6)",
    systemPrompt:
      "Professional photography and digital art. Enrich the user's idea into a vivid, " +
      "detailed image prompt (lighting, camera, style, composition) and generate it.",
  },
  {
    id: "motion-magic",
    name: "Motion Magic",
    tag: "🎬 CREATES VIDEOS — needs paid key",
    kind: "video",
    gradient: "linear-gradient(135deg,#0f766e,#0ea5e9)",
    systemPrompt:
      "Cinematic short video clips. Enrich the user's idea into a dynamic video prompt " +
      "(camera movement, scene, mood, lighting) and generate it.",
  },
];

// default media models (editable in Setup)
const IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image"; // free ~500/day
const VIDEO_MODEL_DEFAULT = "veo-3.1-fast-generate-001"; // paid tier only

// ---------- PROVIDERS (free tiers) ----------
const PROVIDERS = {
  google: {
    label: "Google AI Studio (Gemini) — 100% free",
    defaultModel: "gemini-3.6-flash",
  },
  openrouter: {
    label: "OpenRouter — free models",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
};

// ---------- state ----------
const LS_SETTINGS = "agentchat.settings";
const LS_CHAT = (id) => "agentchat.chat." + id;

let settings = loadSettings();
let activeAgentId = AGENTS[0].id;
let busy = false;
const chats = {};

// ---------- dom ----------
const $ = (sel) => document.querySelector(sel);
const tabsEl = $("#agentTabs");
const chatEl = $("#chat");
const inputEl = $("#input");
const sendBtn = $("#sendBtn");
const typingEl = $("#typing");
const bannerEl = $("#keyBanner");
const badgeEl = $("#modeBadge");

// ---------- settings ----------
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; } catch { s = {}; }
  // auto-upgrade old/deprecated Google model names (e.g. gemini-2.5-flash)
  if (s.models && /^gemini-(1\.|2\.|3\.[0])/.test(s.models.google || "")) {
    s.models.google = PROVIDERS.google.defaultModel;
  }
  return s;
}
function saveSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}
function loadChat(id) {
  if (!chats[id]) {
    try { chats[id] = JSON.parse(localStorage.getItem(LS_CHAT(id))) || []; }
    catch { chats[id] = []; }
  }
  return chats[id];
}
function persistChat(id) {
  // media (imageSrc/videoSrc) is too big for localStorage — keep text only
  const clean = chats[id].map((m) => ({ role: m.role, text: m.text, error: m.error || undefined }));
  try { localStorage.setItem(LS_CHAT(id), JSON.stringify(clean)); } catch {}
}
function activeAgent() {
  return AGENTS.find((a) => a.id === activeAgentId) || AGENTS[0];
}
function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function avatarEl(agent) {
  const d = document.createElement("div");
  d.className = "avatar";
  d.style.background = agent.gradient;
  d.textContent = initials(agent.name);
  return d;
}

// ---------- tiny markdown ----------
function md(text) {
  let out = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pres = [];
  out = out.replace(/```\w*\n?([\s\S]*?)```/g, (m, code) => {
    pres.push(code.replace(/\n+$/, ""));
    return "__PRE" + (pres.length - 1) + "__";
  });
  out = out
    .replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");
  out = out.replace(/__PRE(\d+)__/g, (m, i) => `<pre><code>${pres[Number(i)]}</code></pre>`);
  return out;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- tabs & chat render ----------
function renderTabs() {
  tabsEl.innerHTML = "";
  AGENTS.forEach((agent) => {
    const tab = document.createElement("button");
    tab.className = "agent-tab" + (agent.id === activeAgentId ? " active" : "");
    tab.appendChild(avatarEl(agent));
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="name"></div><div class="tag"></div>`;
    meta.querySelector(".name").textContent = agent.name;
    meta.querySelector(".tag").textContent = agent.tag;
    tab.appendChild(meta);
    tab.addEventListener("click", () => {
      activeAgentId = agent.id;
      renderTabs();
      renderChat();
      inputEl.focus();
    });
    tabsEl.appendChild(tab);
  });
}

function renderChat() {
  chatEl.innerHTML = "";
  const msgs = loadChat(activeAgentId);
  if (msgs.length === 0) {
    const hello = document.createElement("div");
    hello.className = "msg agent";
    const a = activeAgent();
    hello.appendChild(avatarEl(a));
    const b = document.createElement("div");
    b.className = "bubble";
    let helloText;
    if (a.kind === "image") {
      helloText = `🎨 I'm <b></b> — I <b>CREATE images</b>! Describe anything:<br><i>"luxury night cream jar on black marble, gold lid, studio lighting"</i><br>and I'll paint it (~500 free images/day with your free key).`;
    } else if (a.kind === "video") {
      helloText = `🎬 I'm <b></b> — I <b>CREATE short videos</b>!<br>⚠️ Video needs a <b>paid</b> Gemini key. Free videos instead → <a href="https://labs.google/flow" target="_blank" rel="noopener">labs.google/flow</a>`;
    } else {
      helloText = `👋 Hi, I'm <b></b> — ${a.tag.toLowerCase()}.<br>Ask me anything!`;
    }
    b.innerHTML = helloText;
    const nameEl = b.querySelector("b");
    if (nameEl) nameEl.textContent = a.name;
    hello.appendChild(b);
    chatEl.appendChild(hello);
  }
  msgs.forEach((m) => chatEl.appendChild(messageEl(m)));
  scrollDown();
}

function messageEl(m) {
  const agent = activeAgent();
  const row = document.createElement("div");
  row.className =
    "msg " + (m.role === "user" ? "user" : "agent") + (m.error ? " error" : "");
  if (m.role !== "user") row.appendChild(avatarEl(agent));
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (m.role === "user") bubble.textContent = m.text;
  else bubble.innerHTML = m.error ? escapeHtml(m.text) : md(m.text);
  if (m.imageSrc) {
    const img = document.createElement("img");
    img.src = m.imageSrc; img.alt = "AI generated image";
    bubble.appendChild(document.createElement("br"));
    bubble.appendChild(img);
    bubble.appendChild(saveLink(m.imageSrc, "image.png", "⬇ Save image"));
  }
  if (m.videoSrc) {
    const v = document.createElement("video");
    v.src = m.videoSrc; v.controls = true; v.playsInline = true;
    bubble.appendChild(v);
    bubble.appendChild(saveLink(m.videoSrc, "video.mp4", "⬇ Save video"));
  }
  row.appendChild(bubble);
  return row;
}
function saveLink(href, name, label) {
  const a = document.createElement("a");
  a.href = href; a.download = name; a.textContent = label;
  a.className = "save-link";
  return a;
}
function appendMessage(m) {
  loadChat(activeAgentId).push(m);
  persistChat(activeAgentId);
  chatEl.appendChild(messageEl(m));
  scrollDown();
}
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }

// ---------- mode ui ----------
function refreshMode() {
  const inDemo = Boolean(settings.demo);
  badgeEl.classList.toggle("hidden", !inDemo);
  if (inDemo) {
    bannerEl.className = "banner demo";
    bannerEl.innerHTML =
      "🎭 <b>Demo mode</b> — answers are simulated, not real AI. " +
      'Click <b>🔑 Setup</b> → <b>Verify &amp; Start</b> to get real answers (still free).';
  } else if (settings.verified && settings.apiKey) {
    const model = (settings.models && settings.models[settings.provider]) || PROVIDERS[settings.provider].defaultModel;
    bannerEl.className = "banner ok hidden";
    bannerEl.innerHTML = "✓";
  } else {
    bannerEl.className = "banner hidden";
  }
}

// =====================================================
// REAL AI — API calls
// =====================================================
function ensureAlternating(history) {
  const out = [];
  for (const m of history) {
    const role = m.role === "user" ? "user" : "assistant";
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].text += "\n\n" + m.text;
    } else out.push({ role, text: m.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function googleCall({ apiKey, model, systemPrompt, history, signal }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
  const contents = history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Google API error " + res.status);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) throw new Error("Empty answer from Google API. Try another model.");
  return text;
}

async function openrouterCall({ apiKey, model, systemPrompt, history, signal }) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.text })),
  ];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
      "X-Title": "AI Agents Chat",
    },
    signal,
    body: JSON.stringify({ model, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "OpenRouter error " + res.status);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty answer from OpenRouter. Try another model.");
  return text;
}

function apiCall({ provider, apiKey, model, systemPrompt, history, signal }) {
  const opts = { apiKey, model, systemPrompt, history, signal };
  return provider === "openrouter" ? openrouterCall(opts) : googleCall(opts);
}

// ---------- KEY VERIFICATION ----------
async function verifyKey(provider, apiKey, model) {
  const result = await apiCall({
    provider, apiKey, model,
    systemPrompt: "You are a key tester.",
    history: [{ role: "user", text: "Reply with exactly: OK" }],
    signal: AbortSignal.timeout(20000),
  });
  return (result || "").trim().slice(0, 40);
}

// =====================================================
// IMAGE GENERATION (free: gemini-2.5-flash-image, ~500/day)
// =====================================================
async function googleImageCall({ apiKey, model, prompt, signal }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Image API error " + res.status);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData);
  const txt = parts.find((p) => p.text)?.text || "";
  if (!imgPart) throw new Error("No image returned (prompt may have been blocked). " + txt);
  const src = "data:" + (imgPart.inlineData.mimeType || "image/png") + ";base64," + imgPart.inlineData.data;
  return { src, text: txt };
}

// =====================================================
// VIDEO GENERATION (Veo — PAID API tier only)
// =====================================================
async function veoGenerate({ apiKey, model, prompt, onStatus }) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const start = await fetch(base + "/models/" + encodeURIComponent(model) + ":predictLongRunning?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio: "16:9" },
    }),
  });
  const startData = await start.json().catch(() => ({}));
  if (!start.ok) throw new Error(startData?.error?.message || "Veo start failed " + start.status);
  if (!startData.name) throw new Error("Veo did not return a job id.");
  for (let i = 0; i < 26; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    if (onStatus) onStatus("🎬 Rendering video… ~" + ((i + 1) * 10) + "s (Veo usually takes 1–3 minutes)");
    const poll = await fetch(base + "/" + startData.name + "?key=" + encodeURIComponent(apiKey));
    const pd = await poll.json().catch(() => ({}));
    if (pd.error) throw new Error(pd.error.message);
    if (pd.done) {
      const uri = pd.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        || pd.response?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error("Video finished but no file was returned (prompt may have been filtered).");
      const fileRes = await fetch(uri.includes("?") ? uri + "&key=" + apiKey : uri + "?key=" + apiKey);
      if (!fileRes.ok) throw new Error("Could not download the video (" + fileRes.status + ").");
      const blob = await fileRes.blob();
      return URL.createObjectURL(blob);
    }
  }
  throw new Error("Video took longer than 4 minutes. Try a shorter, simpler prompt.");
}

// demo-mode "image": fun generated SVG art (works offline, no key)
function demoImageSvg(prompt) {
  const h1 = Math.floor(Math.random() * 360), h2 = (h1 + 60 + Math.floor(Math.random() * 160)) % 360;
  const esc = escapeHtml(prompt || "demo art").replace(/'/g, "");
  const words = esc.split(/\s+/); const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 34) { lines.push(line.trim()); line = w; if (lines.length >= 3) break; }
    else line += " " + w;
  }
  if (lines.length < 3 && line.trim()) lines.push(line.trim());
  const textSvg = lines.map((l, i) =>
    `<text x='384' y='${560 + i * 44}' font-family='Segoe UI,sans-serif' font-size='30' fill='rgba(255,255,255,.92)' text-anchor='middle'>${l}</text>`
  ).join("");
  const circles = Array.from({ length: 6 }, (_, i) => {
    const cx = 100 + Math.random() * 568, cy = 100 + Math.random() * 300, r = 40 + Math.random() * 110;
    return `<circle cx='${cx.toFixed(0)}' cy='${cy.toFixed(0)}' r='${r.toFixed(0)}' fill='rgba(255,255,255,0.06)'/>`;
  }).join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='768' height='960'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0%' stop-color='hsl(${h1},70%,45%)'/><stop offset='100%' stop-color='hsl(${h2},70%,30%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='768' height='960' fill='url(#g)'/>${circles}` +
    `<text x='384' y='500' font-family='Segoe UI,sans-serif' font-size='34' font-weight='bold' fill='white' text-anchor='middle'>🎭 DEMO ART</text>` +
    textSvg +
    `<text x='384' y='760' font-family='Segoe UI,sans-serif' font-size='22' fill='rgba(255,255,255,.75)' text-anchor='middle'>Add a free API key in 🔑 Setup for REAL AI images</text>` +
    `</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

// =====================================================
// DEMO MODE — simulated answers, no key needed
// =====================================================
const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
  "I told my computer I needed a break… it said 'no problem, I'll crash in 5 minutes.' 💻",
  "Why did the AI go to school? To improve its *neural* network! 🧠",
  "There are 10 types of people: those who understand binary and those who don't. 🔢",
];

function demoReply(agent, userText) {
  const t = userText.toLowerCase().trim();
  const name = agent.name;

  if (/^(hi+|hello|hey+|yo|namaste|salam|good (morning|evening|afternoon))\b/.test(t)) {
    return `Hey! 👋 I'm **${name}** (demo mode). Ask me something — try "25*48", "tell me a joke", or "what can you do?"`;
  }
  if (/how are you/.test(t)) {
    return `I'm running smoothly — 100% free and zero keys required! 😄 (Demo mode, by the way.)`;
  }
  if (/who are you|your name|what are you/.test(t)) {
    return `I'm **${name}** — ${agent.tag.toLowerCase()}. Right now I'm in demo mode, so my brain is simple. Add a free API key (🔑 Setup) and I get much smarter! 🧠`;
  }
  if (/what can you do|help me|abilities|features/.test(t)) {
    return `In demo mode I can:\n- Chat and say hi 👋\n- Do math (try **12*34+5**)\n- Tell jokes 😄\n- Tell time & date 🕒\n\nFor real answers about anything, press **🔑 Setup** → verify a free Google key — still $0.`;
  }
  if (/joke|funny|laugh/.test(t)) {
    return JOKES[Math.floor(Math.random() * JOKES.length)];
  }
  if (/time|date|today|day is it/.test(t)) {
    return `🕒 It's **${new Date().toLocaleString()}** right now (your device's time).`;
  }
  // simple safe math
  const mathExpr = userText.replace(/[^0-9+\-*/().%\s]/g, "").trim();
  if (mathExpr && /\d/.test(mathExpr) && /[+\-*/%]/.test(mathExpr)) {
    try {
      const val = Function('"use strict";return (' + mathExpr + ")")();
      if (Number.isFinite(val)) return `🧮 **${mathExpr.trim()} = ${val}**\n\n(Quick demo-math. For bigger brainpower, verify a free key in 🔑 Setup.)`;
    } catch { /* not math, fall through */ }
  }
  if (/thank|thanks|thx/.test(t)) {
    return `You're very welcome! 😊 ${name} at your service.`;
  }
  // generic
  return `Good question! 🤔 I hear you asking: _"${userText.slice(0, 120)}"_\n\nBut in **demo mode** I only give simple answers (math, jokes, time, chat). For real AI answers:\n\n🔑 Click **Setup** → paste a **free** key from aistudio.google.com/apikey → **Verify & Start**\n\nIt costs nothing — Google gives free keys to everyone.`;
}

// =====================================================
// SEND FLOW
// =====================================================
async function send() {
  const text = inputEl.value.trim();
  if (!text || busy) return;

  const agent = activeAgent();

  if (!settings.demo && !(settings.verified && settings.apiKey)) {
    openWizard();
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  autoGrow();
  appendMessage({ role: "user", text });
  typingEl.classList.remove("hidden");
  setTyping("");
  scrollDown();

  try {
    if (settings.demo) {
      if (agent.kind === "image") {
        setTyping("🎭 Painting demo art…");
        await new Promise((r) => setTimeout(r, 900));
        appendMessage({
          role: "agent",
          text: "🎭 Demo art (not real AI). **\u201C" + text.slice(0, 80) + "\u201D**",
          imageSrc: demoImageSvg(text),
        });
      } else if (agent.kind === "video") {
        await new Promise((r) => setTimeout(r, 700));
        appendMessage({
          role: "agent",
          text: "🎬 Demo mode cannot render video.\n\n**Good news — Veo 3.1 is FREE for everyone** on Google's website (no API key needed):\n👉 labs.google/flow (~50 free credits every day)\n\nFor video *inside this app* you need a paid Gemini API key with Veo enabled — then I render real videos here.",
        });
      } else {
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 900));
        appendMessage({ role: "agent", text: demoReply(agent, text) });
      }
    } else if (agent.kind === "image" || agent.kind === "video") {
      if (settings.provider === "openrouter") {
        throw new Error("Image/video creation needs the Google provider. Open 🔑 Setup → choose 'Google AI Studio' → Verify again.");
      }
      const model = (settings.models && settings.models[agent.kind]) ||
        (agent.kind === "image" ? IMAGE_MODEL_DEFAULT : VIDEO_MODEL_DEFAULT);

      if (agent.kind === "image") {
        setTyping("🎨 Painting your image… (10–30 seconds)");
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 120000);
        try {
          const out = await googleImageCall({
            apiKey: settings.apiKey, model,
            prompt: agent.systemPrompt + "\n\nCreate this image: " + text,
            signal: controller.signal,
          });
          appendMessage({ role: "agent", text: out.text || "🖼️ Here's your image!", imageSrc: out.src });
        } finally { clearTimeout(t); }
      } else {
        setTyping("🎬 Starting video job…");
        const src = await veoGenerate({
          apiKey: settings.apiKey, model,
          prompt: agent.systemPrompt + "\n\nCreate this video: " + text,
          onStatus: setTyping,
        });
        appendMessage({ role: "agent", text: "🎬 Your video is ready — press play!", videoSrc: src });
      }
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      try {
        const model = (settings.models && settings.models[settings.provider]) ||
          PROVIDERS[settings.provider].defaultModel;
        const history = loadChat(activeAgentId)
          .filter((m) => !m.error)
          .slice(-20)
          .map((m) => ({ role: m.role, text: m.text }));
        const answer = await apiCall({
          provider: settings.provider,
          apiKey: settings.apiKey,
          model,
          systemPrompt: agent.systemPrompt,
          history,
          signal: controller.signal,
        });
        appendMessage({ role: "agent", text: answer });
      } finally { clearTimeout(timeout); }
    }
  } catch (err) {
    const m = (err.message || "").toLowerCase();
    let extra = "";
    if (activeAgent().kind === "video" && (m.includes("billing") || m.includes("paid") || m.includes("permission") || m.includes("403") || m.includes("429"))) {
      extra = "\n\n💡 Remember: Veo video API is **paid-only** (no free tier). Free video → labs.google/flow";
    }
    const msg = err.name === "AbortError"
      ? "⏱ Took too long — try again or pick another model in Setup."
      : "⚠️ " + (err.message || "Something went wrong.");
    appendMessage({
      role: "agent", error: true,
      text: msg + extra + "\nOpen 🔑 Setup to re-verify your key, change the model, or switch to Demo Mode.",
    });
  } finally {
    typingEl.classList.add("hidden");
    busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function setTyping(text) {
  $("#typingText").textContent = text || "";
}

// =====================================================
// WIZARD UI
// =====================================================
const wizard = $("#wizardModal");
const providerSelect = $("#providerSelect");
const apiKeyInput = $("#apiKeyInput");
const modelInput = $("#modelInput");
const verifyStatus = $("#verifyStatus");
const verifyBtn = $("#verifyBtn");

function openWizard() {
  providerSelect.value = settings.provider || "google";
  apiKeyInput.value = settings.apiKey || "";
  modelInput.value =
    (settings.models && settings.models[providerSelect.value]) ||
    PROVIDERS[providerSelect.value].defaultModel;
  $("#imageModelInput").value =
    (settings.models && settings.models.image) || IMAGE_MODEL_DEFAULT;
  $("#videoModelInput").value =
    (settings.models && settings.models.video) || VIDEO_MODEL_DEFAULT;
  updateHelp();
  verifyStatus.className = "verify-status hidden";
  wizard.classList.remove("hidden");
}
function closeWizard() { wizard.classList.add("hidden"); }

function updateHelp() {
  $("#helpGoogle").classList.toggle("hidden", providerSelect.value !== "google");
  $("#helpOpenrouter").classList.toggle("hidden", providerSelect.value !== "openrouter");
  modelInput.placeholder = PROVIDERS[providerSelect.value].defaultModel;
}

function setVerifyStatus(kind, html) {
  verifyStatus.className = "verify-status " + kind;
  verifyStatus.innerHTML = html;
}

$("#settingsBtn").addEventListener("click", openWizard);
$("#closeWizard").addEventListener("click", closeWizard);
wizard.addEventListener("click", (e) => { if (e.target === wizard) closeWizard(); });

providerSelect.addEventListener("change", () => {
  modelInput.value = PROVIDERS[providerSelect.value].defaultModel;
  updateHelp();
});

// ---- demo mode ----
$("#startDemoBtn").addEventListener("click", () => {
  settings.demo = true;
  saveSettings();
  refreshMode();
  closeWizard();
  inputEl.focus();
});

// ---- verify & start ----
verifyBtn.addEventListener("click", async () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || PROVIDERS[provider].defaultModel;

  if (!apiKey) {
    setVerifyStatus("err", "❗ Please paste your API key first.");
    apiKeyInput.focus();
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = "⏳ Checking key…";
  setVerifyStatus("wait", "Contacting " + (provider === "google" ? "Google" : "OpenRouter") + "… this takes a few seconds.");

  try {
    await verifyKey(provider, apiKey, model);
    settings = {
      provider,
      apiKey,
      demo: false,
      verified: true,
      models: {
        ...(settings.models || {}),
        [provider]: model,
        image: ($("#imageModelInput").value.trim()) || IMAGE_MODEL_DEFAULT,
        video: ($("#videoModelInput").value.trim()) || VIDEO_MODEL_DEFAULT,
      },
    };
    saveSettings();
    refreshMode();
    setVerifyStatus("ok", "✅ <b>Key works!</b> Chat is starting…");
    setTimeout(closeWizard, 900);
    inputEl.focus();
  } catch (err) {
    let hint = "";
    const m = (err.message || "").toLowerCase();
    if (m.includes("api key not valid") || m.includes("unauthorized") || m.includes("invalid api key") || m.includes("incorrect api key"))
      hint = "<br>→ The key looks wrong. Copy it again from " +
        (provider === "google"
          ? '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>'
          : '<a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>') + " and paste it fresh.";
    else if (m.includes("no longer available") || m.includes("not found") || m.includes("not supported"))
      hint = "<br>→ That model name is old. Click the Model box and pick <b>" + PROVIDERS[provider].defaultModel + "</b>.";
    else if (m.includes("quota") || m.includes("rate") || m.includes("429"))
      hint = "<br>→ Free daily limit reached. Wait a bit, or try again tomorrow — still free.";
    else if (err.name === "TimeoutError")
      hint = "<br>→ Network too slow. Check your internet and try again.";
    setVerifyStatus("err", "❌ <b>Key check failed:</b> " + escapeHtml(err.message || "Unknown error") + hint);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "✅ Verify & Start";
  }
});
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); verifyBtn.click(); }
});

// ---- remove key ----
$("#removeKeyBtn").addEventListener("click", () => {
  settings = {};
  saveSettings();
  refreshMode();
  apiKeyInput.value = "";
  setVerifyStatus("wait", "Key removed. You can start Demo Mode instead, or paste a new key.");
});

// ---------- misc ----------
$("#clearChatBtn").addEventListener("click", () => {
  chats[activeAgentId] = [];
  persistChat(activeAgentId);
  renderChat();
});

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.addEventListener("click", send);

// ---------- start ----------
renderTabs();
renderChat();
refreshMode();
autoGrow();

// first visit without setup → open wizard automatically
if (!settings.demo && !(settings.verified && settings.apiKey)) openWizard();
else inputEl.focus();
