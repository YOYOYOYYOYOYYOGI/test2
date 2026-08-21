const $ = s => document.querySelector(s);
const keyPanel = $('#keyPanel'), chat = $('#chat'), error = $('#connectError'), status = $('#connectionStatus');
const modelPicker = $('#modelPicker'), modelWrap = $('#modelPickerWrap');
let history = [];
async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch {
    throw new Error('The app server returned a web page instead of the agent API. Start it with “npm start” and open the URL shown by that command — do not open public/index.html directly or deploy only the public folder.');
  }
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function setConnected(data) {
  keyPanel.classList.add('hidden'); chat.classList.remove('hidden'); modelWrap.classList.remove('hidden');
  $('#disconnectBtn').classList.remove('hidden'); status.textContent = 'Connected';
  $('.dot').classList.add('online'); $('#modelHint').textContent = `Using ${data.model}`;
  modelPicker.innerHTML = data.models.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.label)}</option>`).join('');
  modelPicker.value = data.model;
  $('#message').focus();
}
function setDisconnected() {
  keyPanel.classList.remove('hidden'); chat.classList.add('hidden'); modelWrap.classList.add('hidden');
  $('#disconnectBtn').classList.add('hidden'); status.textContent = 'Not connected'; $('.dot').classList.remove('online');
  $('#modelHint').textContent = 'Add your Google AI Studio key to begin.'; history = []; $('#messages').innerHTML = '';
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function addMessage(text, role, pending = false) {
  const article = document.createElement('article'); article.className = `message ${role}`;
  article.innerHTML = role === 'assistant' ? `<div class="avatar">✦</div><div class="bubble ${pending ? 'thinking' : ''}">${pending ? '<i></i><i></i><i></i>' : escapeHtml(text).replace(/\n/g, '<br>')}</div>` : `<div class="bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
  $('#messages').append(article); article.scrollIntoView({ behavior: 'smooth', block: 'end' }); return article;
}
$('#connectForm').addEventListener('submit', async event => {
  event.preventDefault(); error.classList.add('hidden'); const button = event.currentTarget.querySelector('button');
  button.disabled = true; button.innerHTML = 'Verifying…';
  try { setConnected(await request('/api/connect', { method: 'POST', body: JSON.stringify({ apiKey: $('#apiKey').value }) })); $('#apiKey').value = ''; }
  catch (e) { error.textContent = e.message; error.classList.remove('hidden'); }
  finally { button.disabled = false; button.innerHTML = 'Verify & start <span>→</span>'; }
});
$('#disconnectBtn').addEventListener('click', async () => { await request('/api/disconnect', { method: 'POST' }); setDisconnected(); });
$('#chatForm').addEventListener('submit', async event => {
  event.preventDefault(); const input = $('#message'), text = input.value.trim(); if (!text) return;
  input.value = ''; input.style.height = ''; addMessage(text, 'user'); const pending = addMessage('', 'assistant', true); $('#sendBtn').disabled = true;
  try { const result = await request('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, history, model: modelPicker.value }) }); pending.remove(); addMessage(result.text, 'assistant'); history.push({ role: 'user', text }, { role: 'model', text: result.text }); }
  catch (e) { pending.remove(); addMessage(`Sorry, ${e.message}`, 'assistant'); }
  finally { $('#sendBtn').disabled = false; input.focus(); }
});
$('#message').addEventListener('input', event => { event.target.style.height = 'auto'; event.target.style.height = Math.min(event.target.scrollHeight, 160) + 'px'; });
request('/api/session').then(data => { if (data.connected) setConnected(data); }).catch(() => {});
