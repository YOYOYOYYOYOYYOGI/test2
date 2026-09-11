/**
 * ReelForge — caption engine.
 *
 * Word-level caption timing (estimated from the voice duration and word
 * length — the same approach used by major short-form editors when word-level
 * transcription is unavailable), plus several Instagram-ready caption styles
 * with animated highlighting and custom look controls.
 */

import { clamp } from '../core/utils.js';

export const CAPTION_STYLES = [
  { id: 'bold-pop', label: 'Bold Pop', hint: 'Big uppercase words, active-word pop — classic Reels' },
  { id: 'karaoke', label: 'Karaoke Highlight', hint: 'White text, active word fills with accent color' },
  { id: 'clean', label: 'Clean White', hint: 'Minimal white text with soft shadow' },
  { id: 'boxed', label: 'Pill Box', hint: 'Dark rounded pill behind text' },
  { id: 'neon', label: 'Neon Glow', hint: 'Glowing accent text, night energy' },
  { id: 'minimal', label: 'Minimal Bottom', hint: 'Small quiet text at the very bottom' },
];

export const CAPTION_DEFAULTS = {
  style: 'bold-pop',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 54, // relative to 1080px-wide canvas
  color: '#ffffff',
  highlightColor: '#facc15',
  positionY: 0.78, // 0..1 of canvas height
  uppercase: true,
  background: 'rgba(0,0,0,0)',
  animation: 'pop', // pop | fade | slide | none
  maxWordsPerLine: 3,
};

/**
 * Split a caption into timed words.
 * @param {string} caption
 * @param {number} sceneDuration actual spoken window in seconds
 * @param {number} voiceDuration duration of the voice audio (or null)
 */
export function timeWords(caption, sceneDuration, voiceDuration) {
  const words = String(caption || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const window = clamp(voiceDuration || sceneDuration * 0.9, 0.5, sceneDuration);
  const totalChars = words.reduce((a, w) => a + w.length + 1, 0);
  let t = Math.max(0, (sceneDuration - window) / 2 * 0.5); // small lead-in
  return words.map((w) => {
    const d = ((w.length + 1) / totalChars) * window;
    const item = { word: w, start: t, end: t + d };
    t += d;
    return item;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapWords(ctx, words, maxW) {
  const lines = [[]];
  let lineW = 0;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width;
    if (lineW + ww > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push(w);
    lineW += ww + ctx.measureText(' ').width;
  }
  return lines.filter((l) => l.length);
}

/**
 * Draw captions for a scene.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts { words, time, style, W, H, settings }
 */
export function drawCaptions(ctx, { words, time, style = CAPTION_DEFAULTS, W, H }) {
  if (!words?.length) return;
  const cfg = { ...CAPTION_DEFAULTS, ...style };
  const fs = (cfg.fontSize / 1080) * W;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fs}px ${cfg.fontFamily}`;
  const maxW = W * 0.86;

  const visible = words.map((w) => ({
    ...w,
    shown: w.word.toUpperCase(),
  }));
  if (!cfg.uppercase) for (const v of visible) v.shown = v.word;

  const lines = wrapWords(ctx, visible, maxW);
  const lineH = fs * 1.22;
  const baseY = H * cfg.positionY - ((lines.length - 1) * lineH) / 2;

  const anim = cfg.animation;
  lines.forEach((line, li) => {
    const y = baseY + li * lineH;
    const lineTextW = line.reduce((a, w) => a + ctx.measureText(w.shown).width + fs * 0.28, -fs * 0.28);
    let x = W / 2 - lineTextW / 2;
    for (const w of line) {
      const active = time >= w.start && time <= w.end;
      const before = time < w.start;
      let a = active ? 1 : before ? 0.35 : 0.92;
      let scale = 1;
      let dy = 0;
      if (active && anim === 'pop') {
        const p = clamp((time - w.start) / 0.12, 0, 1);
        scale = 1 + 0.14 * Math.sin(p * Math.PI);
        a = 1;
      } else if (active && anim === 'slide') {
        const p = clamp((time - w.start) / 0.15, 0, 1);
        dy = (1 - p) * fs * 0.35;
      } else if (anim === 'fade' && active) {
        const p = clamp((time - w.start) / 0.2, 0, 1);
        a = 0.35 + 0.65 * p;
      }

      ctx.save();
      ctx.globalAlpha = a;
      const cx = x + ctx.measureText(w.shown).width / 2;
      ctx.translate(cx, y + dy);
      ctx.scale(scale, scale);

      if (cfg.style === 'boxed' && active) {
        const pw = ctx.measureText(w.shown).width + fs * 0.4;
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        roundRect(ctx, -pw / 2, -fs * 0.62, pw, fs * 1.24, fs * 0.24);
        ctx.fill();
      }
      if (cfg.style === 'neon') {
        ctx.shadowColor = cfg.highlightColor;
        ctx.shadowBlur = active ? fs * 0.5 : fs * 0.18;
      } else if (cfg.style === 'clean' || cfg.style === 'minimal') {
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = fs * 0.16;
        ctx.shadowOffsetY = fs * 0.03;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = fs * 0.22;
        ctx.shadowOffsetY = fs * 0.05;
      }

      if (cfg.style === 'karaoke') {
        ctx.fillStyle = active ? cfg.highlightColor : cfg.color;
      } else if (cfg.style === 'bold-pop') {
        ctx.fillStyle = active ? cfg.highlightColor : cfg.color;
        if (active) {
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.lineWidth = fs * 0.08;
          ctx.strokeText(w.shown, 0, 0);
        }
      } else {
        ctx.fillStyle = cfg.color;
      }

      ctx.fillText(w.shown, 0, 0);
      ctx.restore();
      x += ctx.measureText(w.shown).width + fs * 0.28;
    }
  });
  ctx.restore();
}

/** Draw the big on-screen text overlay (top third). */
export function drawOnScreenText(ctx, { text, time, sceneDur, W, H, brand }) {
  if (!text) return;
  const fs = (72 / 1080) * W;
  const inP = clamp(time / 0.35, 0, 1);
  const outP = clamp((sceneDur - time) / 0.3, 0, 1);
  const a = Math.min(inP, outP);
  const pop = 1 + 0.08 * (1 - inP);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H * 0.16);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fs}px Poppins, Inter, system-ui, sans-serif`;
  const grad = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  grad.addColorStop(0, brand?.colors?.primary || '#8b5cf6');
  grad.addColorStop(1, brand?.colors?.secondary || '#ec4899');
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = fs * 0.1;
  const words = String(text).toUpperCase().split(/\s+/);
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].join(' ');
    if (ctx.measureText(test).width > W * 0.82 && cur.length) { lines.push(cur.join(' ')); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur.join(' '));
  lines.forEach((ln, i) => {
    const y = (i - (lines.length - 1) / 2) * fs * 1.15;
    ctx.strokeText(ln, 0, y);
    ctx.fillText(ln, 0, y);
  });
  void grad;
  ctx.restore();
}
