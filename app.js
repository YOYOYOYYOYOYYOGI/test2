/* =====================================================
   AI Agents Chat — app logic
   Add a new agent: copy an object into AGENTS below. Done.
   ===================================================== */

// ---------- AGENTS (edit / add more here) ----------
const AGENTS = [
  {
    id: "claude-opus",
    name: "Claude Opus",
    tag: "Deep thinker · long, thoughtful answers",
    gradient: "linear-gradient(135deg,#8b5cf6,#6366f1)",
    systemPrompt:
      "You are 'Claude Opus', a thoughtful, eloquent AI agent in a chat app. " +
      "Give well-structured, careful, complete answers. Use short headings or bullet " +
      "lists when helpful. Be polite and precise. You may use markdown (bold, `code`).",
  },
  {
    id: "omni-flash",
    name: "Omni Flash",
    tag: "Speedy · short, punchy answers",
    gradient: "linear-gradient(135deg,#fb923c,#f43f5e)",
    systemPrompt:
      "You are 'Omni Flash', a fast, energetic AI agent in a chat app. " +
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
      "Use examples from daily life. Always end with one short helpful tip when relevant.",
  },
  {
    id: "deepseek-sage",
    name: "DeepSeek Sage",
    tag: "Logical · step-by-step thinker",
    gradient: "linear-gradient(135deg,#14b8a6,#0ea5e9)",
    systemPrompt:
      "You are 'DeepSeek Sage', a logical, methodical AI agent. " +
      "For every question, think in clear numbered steps: 1) what is being asked, 2) the reasoning, 3) the conclusion. " +
      "Be precise and factual. Show your reasoning briefly. Great at math, logic and coding.",
  },
  {
    id: "llama-legend",
    name: "Llama Legend",
    tag: "Fun · casual chat with jokes",
    gradient: "linear-gradient(135deg,#f59e0b,#d97706)",
    systemPrompt:
      "You are 'Llama Legend', a funny, casual AI buddy. " +
      "Talk like a friendly internet pal — relaxed language, light jokes, zero formality. " +
      "Still give correct, useful answers, just with personality and humor. Keep it fun and kind.",
  },
  {
    id: "grok-spark",
    name: "Grok Spark",
    tag: "Bold · witty, straight talk",
    gradient: "linear-gradient(135deg,#e2e8f0,#94a3b8)",
    systemPrompt:
      "You are 'Grok Spark', a bold, witty AI agent with attitude. " +
      "Give straight, no-fluff answers with a spark of humor and cleverness. " +
      "Be direct and honest, never boring. Do not be rude or offensive — witty, not mean.",
  },
];

// ---------- PROVIDERS (free tiers) ----------
const PROVIDERS = {
  google: {
    label: "Google AI Studio (Gemini) — 100% free",
    defaultModel: "gemini-3.6-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    label: "OpenRouter — free models available",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    keyUrl: "https://openrouter.ai/keys",
  },
};

// ---------- state ----------
const LS_SETTINGS = "agentchat.settings";
const LS_CHAT = (id) => "agentchat.chat." + id;

let settings = loadSettings();
let activeAgentId = AGENTS[0].id;
let busy = false;

const chats = {}; // agentId -> [{role:'user'|'agent', text, error?}]

// ---------- dom ----------
const $ = (sel) => document.querySelector(sel);
const tabsEl = $("#agentTabs");
const chatEl = $("#chat");
const inputEl = $("#input");
const sendBtn = $("#sendBtn");
const typingEl = $("#typing");
const bannerEl = $("#keyBanner");

// ---------- helpers ----------
function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(LS_SETTINGS)) || {};
  } catch {
    s = {};
  }
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
    try {
      chats[id] = JSON.parse(localStorage.getItem(LS_CHAT(id))) || [];
    } catch {
      chats[id] = [];
    }
  }
  return chats[id];
}
function persistChat(id) {
  localStorage.setItem(LS_CHAT(id), JSON.stringify(chats[id]));
}
function activeAgent() {
  return AGENTS.find((a) => a.id === activeAgentId) || AGENTS[0];
}
function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function avatarEl(agent, small) {
  const d = document.createElement("div");
  d.className = "avatar" + (small ? " small" : "");
  d.style.background = agent.gradient;
  d.textContent = initials(agent.name);
  return d;
}

// tiny markdown renderer (safe: escapes HTML first)
function md(text) {
  let out = String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pres = [];
  out = out.replace(/```\w*\n?([\s\S]*?)```/g, (m, code) => {
    pres.push(code.replace(/\n+$/, ""));
    return "__PRE" + (pres.length - 1) + "__";
  });
  out = out
    .replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  out = out.replace(/__PRE(\d+)__/g, (m, i) =>
    `<pre><code>${pres[Number(i)]}</code></pre>`
  );
  return out;
}

// ---------- render tabs ----------
function renderTabs() {
  tabsEl.innerHTML = "";
  AGENTS.forEach((agent) => {
    const tab = document.createElement("button");
    tab.className = "agent-tab" + (agent.id === activeAgentId ? " active" : "");
    tab.style.setProperty("--tab-color", agent.id === activeAgentId ? "" : "");
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

// ---------- render chat ----------
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
    b.innerHTML =
      `👋 Hi, I'm <b></b> — ${a.tag.toLowerCase()}.<br>Ask me anything!`;
    b.querySelector("b").textContent = a.name;
    hello.appendChild(b);
    chatEl.appendChild(hello);
  }
  msgs.forEach((m) => chatEl.appendChild(messageEl(m)));
  scrollDown();
}

function messageEl(m) {
  const agent = activeAgent();
  const row = document.createElement("div");
  row.className = "msg " + (m.role === "user" ? "user" : "agent") + (m.error ? " error" : "");
  if (m.role !== "user") row.appendChild(avatarEl(agent));
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (m.role === "user") bubble.textContent = m.text;
  else bubble.innerHTML = m.error ? escapeHtml(m.text) : md(m.text);
  row.appendChild(bubble);
  return row;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function appendMessage(m) {
  loadChat(activeAgentId).push(m);
  persistChat(activeAgentId);
  chatEl.appendChild(messageEl(m));
  scrollDown();
}
function scrollDown() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ---------- API calls ----------
function ensureAlternating(history) {
  // providers want user/assistant strictly alternating, starting with user
  const out = [];
  for (const m of history) {
    const role = m.role === "user" ? "user" : "assistant";
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].text += "\n\n" + m.text;
    } else {
      out.push({ role, text: m.text });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function callGoogle(agent, history, signal) {
  const model = settings.models?.google || PROVIDERS.google.defaultModel;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(settings.apiKey);
  const contents = ensureAlternating(history).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: agent.systemPrompt }] },
      contents,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Google API error " + res.status);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) throw new Error("Empty answer from Google API (model may be blocked). Try another model.");
  return text;
}

async function callOpenRouter(agent, history, signal) {
  const model = settings.models?.openrouter || PROVIDERS.openrouter.defaultModel;
  const messages = [
    { role: "system", content: agent.systemPrompt },
    ...ensureAlternating(history).map((m) => ({ role: m.role, content: m.text })),
  ];
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + settings.apiKey,
      "X-Title": "AI Agents Chat",
    },
    signal,
    body: JSON.stringify({ model, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "OpenRouter API error " + res.status);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty answer from OpenRouter. Try another model.");
  return text;
}

async function askAgent(agent, history, signal) {
  if (settings.provider === "openrouter") return callOpenRouter(agent, history, signal);
  return callGoogle(agent, history, signal);
}

// ---------- send flow ----------
async function send() {
  const text = inputEl.value.trim();
  if (!text || busy) return;

  if (!settings.apiKey) {
    appendMessage({
      role: "agent", error: true,
      text: "🔑 No API key found. Click ⚙️ API key above, paste a FREE key from aistudio.google.com/apikey or openrouter.ai/keys, then ask me again.",
    });
    openSettings();
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  inputEl.value = "";
  autoGrow();
  appendMessage({ role: "user", text });

  typingEl.classList.remove("hidden");
  scrollDown();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const history = loadChat(activeAgentId)
      .filter((m) => !m.error)
      .slice(-20)
      .map((m) => ({ role: m.role, text: m.text }));
    const answer = await askAgent(activeAgent(), history, controller.signal);
    appendMessage({ role: "agent", text: answer });
  } catch (err) {
    const msg = err.name === "AbortError"
      ? "⏱ Took too long — try again or use a faster model."
      : "⚠️ " + (err.message || "Something went wrong.");
    appendMessage({ role: "agent", error: true, text: msg + "\nCheck your API key, model name and free-tier limits in ⚙️ Settings." });
  } finally {
    clearTimeout(timeout);
    typingEl.classList.add("hidden");
    busy = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ---------- settings ui ----------
const modal = $("#settingsModal");
const providerSelect = $("#providerSelect");
const apiKeyInput = $("#apiKeyInput");
const modelInput = $("#modelInput");

function openSettings() {
  providerSelect.value = settings.provider || "google";
  apiKeyInput.value = settings.apiKey || "";
  modelInput.value =
    (settings.models && settings.models[providerSelect.value]) ||
    PROVIDERS[providerSelect.value].defaultModel;
  updateHelp();
  modal.classList.remove("hidden");
}
function updateHelp() {
  $("#helpGoogle").classList.toggle("hidden", providerSelect.value !== "google");
  $("#helpOpenrouter").classList.toggle("hidden", providerSelect.value !== "openrouter");
  modelInput.placeholder = PROVIDERS[providerSelect.value].defaultModel;
}

$("#settingsBtn").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
providerSelect.addEventListener("change", () => {
  modelInput.value = PROVIDERS[providerSelect.value].defaultModel;
  updateHelp();
});

$("#saveKeyBtn").addEventListener("click", () => {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || PROVIDERS[provider].defaultModel;
  if (!key) { apiKeyInput.focus(); return; }
  settings = {
    provider,
    apiKey: key,
    models: { ...(settings.models || {}), [provider]: model },
  };
  saveSettings();
  refreshBanner();
  modal.classList.add("hidden");
});

$("#removeKeyBtn").addEventListener("click", () => {
  settings = { provider: settings.provider || "google" };
  saveSettings();
  apiKeyInput.value = "";
  refreshBanner();
});

function refreshBanner() {
  bannerEl.classList.toggle("hidden", Boolean(settings.apiKey));
}

$("#clearChatBtn").addEventListener("click", () => {
  chats[activeAgentId] = [];
  persistChat(activeAgentId);
  renderChat();
});

// ---------- composer ----------
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
sendBtn.addEventListener("click", send);

// ---------- start ----------
renderTabs();
renderChat();
refreshBanner();
autoGrow();
inputEl.focus();
