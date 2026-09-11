/**
 * ReelForge — popup quick actions.
 * Real actions only: opens the studio, starts a new project, lists recent
 * projects and reports provider configuration status honestly.
 */

import { loadSettings, isLLMConfigured, isConfigured } from '../shared/core/storage.js';
import { listProjects } from '../shared/core/idb.js';

const DASHBOARD = chrome.runtime.getURL('src/dashboard/index.html');

document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: DASHBOARD });
  window.close();
});

document.getElementById('new').addEventListener('click', () => {
  chrome.tabs.create({ url: `${DASHBOARD}#/new` });
  window.close();
});

(async () => {
  const settings = await loadSettings();

  // Setup status
  const status = document.getElementById('status');
  if (!isLLMConfigured(settings)) {
    status.className = 'status warn';
    status.innerHTML = '⚠ <b>Setup needed</b> — no AI provider connected. Open Settings to add your LLM key (or use the backend).';
    const s = document.createElement('button');
    s.className = 'btn';
    s.textContent = '⚙ Open Settings';
    s.addEventListener('click', () => { chrome.tabs.create({ url: `${DASHBOARD}#/settings` }); window.close(); });
    status.after(s);
  } else {
    const parts = [
      `✓ LLM: ${settings.llm.provider}`,
      isConfigured('image', settings) ? '✓ Images' : '○ images off',
      isConfigured('tts', settings) ? '✓ Voice' : '○ voice off',
      isConfigured('lipsync', settings) ? '✓ Lip-sync' : '○ lip-sync off',
      isConfigured('video', settings) ? '✓ AI video' : '○ AI video off',
    ];
    status.className = 'status ok';
    status.textContent = parts.join('  ·  ');
  }

  // Recent projects
  try {
    const projects = await listProjects();
    if (projects.length) {
      const h = document.createElement('h4');
      h.textContent = 'Recent projects';
      document.getElementById('projects').before(h);
      const box = document.getElementById('projects');
      for (const p of projects.slice(0, 4)) {
        const row = document.createElement('div');
        row.className = 'proj';
        row.innerHTML = `<span>🎬</span><span>${escape(p.name || 'Untitled')}</span><small>${new Date(p.updatedAt).toLocaleDateString()}</small>`;
        row.addEventListener('click', () => {
          chrome.tabs.create({ url: `${DASHBOARD}#/project/${p.id}` });
          window.close();
        });
        box.append(row);
      }
    }
  } catch { /* popup stays functional */ }
})();
