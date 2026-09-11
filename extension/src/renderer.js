const PALETTES = [
  ['#1d2630', '#70504d', '#d9f565'], ['#1e263e', '#625779', '#d5d5ff'], ['#1b312e', '#5d856b', '#dcf6c5'], ['#2b1e2f', '#8b5159', '#ffd7bd'], ['#2b3022', '#7e8052', '#f0e8bc']
];

function fitCanvas(canvas, ratio) {
  const sizes = { '9:16': [540, 960], '1:1': [720, 720], '16:9': [960, 540] };
  const [w, h] = sizes[ratio] || sizes['9:16'];
  canvas.width = w; canvas.height = h;
}
function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius); ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
}
function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = '';
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
  if (line) lines.push(line); const shown = lines.slice(0, maxLines); if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1].replace(/[,.!?\s]+$/, '')}…`;
  shown.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight)); return shown.length;
}
function drawImageCover(ctx, image, box, zoom = 1) {
  const { x, y, w, h } = box; const ratio = Math.max(w / image.width, h / image.height) * zoom; const dw = image.width * ratio; const dh = image.height * ratio;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function loadImage(dataUrl) {
  return new Promise((resolve) => { if (!dataUrl) return resolve(null); const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = dataUrl; });
}
function textForScene(scene) { return scene.caption || scene.script || scene.text || ''; }

export async function renderProjectToWebm(project, assets = [], onProgress = () => {}, options = {}) {
  const canvas = document.createElement('canvas'); fitCanvas(canvas, project.ratio || '9:16');
  const ctx = canvas.getContext('2d', { alpha: false }); const width = canvas.width; const height = canvas.height;
  const assetMap = new Map(assets.map(asset => [asset.id, asset]));
  const imageMap = new Map();
  for (const scene of project.scenes || []) { const asset = assetMap.get(scene.imageAssetId); if (asset?.dataUrl && !imageMap.has(asset.id)) imageMap.set(asset.id, await loadImage(asset.dataUrl)); }
  const scenes = project.scenes?.length ? project.scenes : [{ type: 'Hook', script: project.script || 'Your story starts here.', duration: 4 }];
  const durations = scenes.map(s => Math.max(1.6, Number(s.duration) || 3)); const total = durations.reduce((sum, value) => sum + value, 0);
  const recorderStream = canvas.captureStream(30);
  let audioContext, audioDestination, voiceAnalyser, musicGainNode; const audioElements = [];
  if ((options.audioUrl || options.musicUrl) && typeof Audio !== 'undefined') {
    try {
      audioContext = new AudioContext(); audioDestination = audioContext.createMediaStreamDestination();
      const addTrack = (url, volume, loop = false, kind = 'music') => { if (!url) return; const element = new Audio(url); element.crossOrigin = 'anonymous'; element.loop = loop; const source = audioContext.createMediaElementSource(element); const gain = audioContext.createGain(); gain.gain.value = volume; source.connect(gain); gain.connect(audioDestination); gain.connect(audioContext.destination); if (kind === 'voice') { voiceAnalyser = audioContext.createAnalyser(); voiceAnalyser.fftSize = 256; source.connect(voiceAnalyser); } else musicGainNode = gain; audioElements.push(element); };
      addTrack(options.audioUrl, 1, false, 'voice'); addTrack(options.musicUrl, options.musicVolume ?? .16, true, 'music'); audioDestination.stream.getAudioTracks().forEach(track => recorderStream.addTrack(track));
    } catch { audioContext = null; }
  }
  const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
  const chunks = []; const recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : undefined);
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise((resolve, reject) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' })); recorder.onerror = event => reject(event.error || new Error('Browser video recorder failed')); });
  recorder.start(250); if (audioElements.length) { await audioContext.resume(); audioElements.forEach(element => { element.currentTime = 0; element.play().catch(() => {}); }); }
  const started = performance.now(); let lastTime = started; let raf;
  const draw = (now) => {
    const elapsed = (now - started) / 1000; let cursor = 0; let index = 0; while (index < durations.length - 1 && elapsed >= cursor + durations[index]) { cursor += durations[index]; index += 1; }
    const sceneElapsed = elapsed - cursor; const progress = Math.min(1, elapsed / total); const scene = scenes[index]; const sceneProgress = Math.min(1, sceneElapsed / durations[index]); const fade = Math.min(1, sceneProgress / .32, (1 - sceneProgress) / .32); const palette = PALETTES[index % PALETTES.length];
    const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .7, height * .23, 0, width * .7, height * .23, width * .8); glow.addColorStop(0, `${palette[2]}35`); glow.addColorStop(1, `${palette[2]}00`); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    const selected = imageMap.get(scene.imageAssetId); if (selected) { ctx.save(); ctx.globalAlpha = .83 * Math.max(.4, fade); const scale = 1 + sceneProgress * .045; drawImageCover(ctx, selected, { x: width * .07, y: height * .12, w: width * .86, h: height * .66 }, scale); ctx.restore(); ctx.fillStyle = 'rgba(8,10,12,.32)'; ctx.fillRect(0, 0, width, height); }
    else { drawProductPlaceholder(ctx, width, height, palette, sceneProgress); }
    ctx.fillStyle = 'rgba(8,10,12,.20)'; ctx.fillRect(0, 0, width, height);
    const pad = width * .075; ctx.fillStyle = '#d9f565'; ctx.font = `700 ${Math.max(10, width * .022)}px DM Mono, monospace`; ctx.letterSpacing = '2px'; ctx.fillText((project.brandName || 'UGC STUDIO').toUpperCase(), pad, pad * 1.45); ctx.letterSpacing = '0px';
    const content = textForScene(scene); const captionStyle = project.captionStyle || 'Bold highlight'; const fontSize = Math.max(22, width * (project.ratio === '16:9' ? .043 : .064)) * (captionStyle === 'Minimal' ? .78 : 1); const captionY = captionStyle === 'Minimal' ? height * .81 : height * .76; ctx.font = `800 ${fontSize}px Manrope, sans-serif`; ctx.textAlign = 'center'; const maxTextWidth = width * .82; if (captionStyle === 'Karaoke highlight') { ctx.fillStyle = 'rgba(8,10,12,.52)'; roundedRect(ctx, width * .08, captionY - fontSize * .9, width * .84, fontSize * 2.45, 12); ctx.fill(); } ctx.fillStyle = captionStyle === 'Karaoke highlight' ? '#d9f565' : '#f8faf6'; const lines = drawWrapped(ctx, content, width / 2, captionY, maxTextWidth, fontSize * 1.12, 3);
    const cta = scene.type?.toLowerCase().includes('call') || index === scenes.length - 1 ? (project.cta || 'Shop now') : ''; if (cta) { const buttonWidth = Math.min(width * .48, 190); const by = captionY + lines * fontSize * 1.12 + 17; ctx.fillStyle = '#d9f565'; roundedRect(ctx, width / 2 - buttonWidth / 2, by, buttonWidth, 35, 17); ctx.fill(); ctx.fillStyle = '#12170e'; ctx.font = `800 ${Math.max(11, width * .024)}px DM Sans, sans-serif`; ctx.fillText(cta, width / 2, by + 23); }
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.46)'; ctx.font = `500 ${Math.max(9, width * .019)}px DM Mono, monospace`; ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`, pad, height - pad * .7);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; roundedRect(ctx, pad, height - pad * .42, width - pad * 2, 3, 2); ctx.fill(); ctx.fillStyle = '#d9f565'; roundedRect(ctx, pad, height - pad * .42, (width - pad * 2) * progress, 3, 2); ctx.fill();
    if (voiceAnalyser && musicGainNode && audioContext) { const levels = new Uint8Array(voiceAnalyser.frequencyBinCount); voiceAnalyser.getByteFrequencyData(levels); const average = levels.reduce((sum, value) => sum + value, 0) / levels.length / 255; musicGainNode.gain.setTargetAtTime((options.musicVolume ?? .16) * (1 - Math.min(.72, average)), audioContext.currentTime, .04); }
    onProgress(Math.round(progress * 100), index, scenes.length); if (elapsed < total) raf = requestAnimationFrame(draw); else { cancelAnimationFrame(raf); recorder.stop(); audioElements.forEach(element => element.pause()); audioContext?.close(); }
    lastTime = now;
  };
  raf = requestAnimationFrame(draw); void lastTime;
  return { blob: await finished, duration: total, width, height };
}

function drawProductPlaceholder(ctx, width, height, palette, progress) {
  const cx = width * .5; const cy = height * .42; const size = Math.min(width, height) * .16; ctx.save(); ctx.translate(cx, cy); ctx.rotate((progress - .5) * .04); ctx.shadowColor = 'rgba(0,0,0,.32)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 17; ctx.fillStyle = '#ead6b9'; roundedRect(ctx, -size * .5, -size * .78, size, size * 1.55, size * .09); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.fillStyle = '#bd9873'; roundedRect(ctx, -size * .3, -size * .98, size * .6, size * .2, size * .04); ctx.fill(); ctx.fillStyle = palette[2]; ctx.font = `900 ${size * .23}px Manrope, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('RN', 0, size * .1); ctx.fillStyle = '#5c5545'; ctx.font = `500 ${size * .105}px DM Mono, monospace`; ctx.fillText('NATURALS', 0, size * .31); ctx.restore();
}

export function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return url; }
