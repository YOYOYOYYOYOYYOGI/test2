/**
 * ReelForge — canvas compositor + renderer.
 *
 * THIS IS REAL RENDERING, not a mock: scenes (AI-generated images, product
 * photos, AI video clips, lip-synced talking clips) are composited on a
 * 1080x1920 canvas with camera moves (Ken Burns), transitions, on-screen text,
 * animated captions and a brand CTA end-card, while a WebAudio graph mixes the
 * generated voice-over and background music (with automatic ducking while the
 * creator speaks). The canvas + audio are recorded with MediaRecorder into a
 * real MP4 (or WebM fallback) file.
 *
 * Everything here runs 100% locally in the extension page.
 */

import { clamp } from '../core/utils.js';
import { getAsset, getAssetURL } from '../core/idb.js';
import { timeWords, drawCaptions, drawOnScreenText } from './captions.js';

export const ASPECT_DIMS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

const TRANSITION_DUR = 0.38;

/** Choose the best supported recording container (MP4 preferred — Instagram-ready). */
export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

export class VideoCompositor {
  /**
   * @param {object} opts
   * opts.canvas   - canvas element to draw into (sized internally)
   * opts.project  - full project record
   * opts.settings - app settings
   * opts.onProgress - (0..1) during record/preview
   * opts.onTime   - (elapsedSec, totalSec) while playing
   * opts.silent   - don't route audio to speakers while recording
   */
  constructor({ canvas, project, settings, onProgress, onTime, silent }) {
    this.canvas = canvas;
    this.project = project;
    this.settings = settings;
    this.onProgress = onProgress;
    this.onTime = onTime;
    this.silent = silent;
    this.cancelled = false;
    this.stopped = false;
    this.segments = [];
    this.audioSources = [];
    this.videos = [];
    this.bitmaps = new Map();
    this.total = 0;
    this.recorder = null;
    this.audioCtx = null;
  }

  /* --------------------------------- prepare -------------------------------- */

  async prepare() {
    const p = this.project;
    const aspect = p.input?.aspect || '9:16';
    const dims = ASPECT_DIMS[aspect] || ASPECT_DIMS['9:16'];
    const quality = Number(this.settings?.defaults?.quality) || 1080;
    const scale = clamp(quality / dims.w, 0.4, 1);
    this.W = Math.round(dims.w * scale);
    this.H = Math.round(dims.h * scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingQuality = 'high';

    // Brand logo (optional)
    this.logoBitmap = null;
    if (p.brand?.logoAssetId) {
      try { this.logoBitmap = await this.loadImage(p.brand.logoAssetId); } catch { /* optional */ }
    }

    // Build timeline segments
    const scenes = (p.storyboard?.scenes || []).filter((s) => s !== null);
    let t = 0;
    this.segments = [];
    for (const scene of scenes) {
      const dur = Math.max(0.8, Number(scene.durationSec) || 3);
      const seg = { scene, start: t, end: t + dur, dur };
      // scene visual: lipsync/video asset > image asset > product image > placeholder
      const videoAssetId = scene.assets?.lipsyncAssetId || scene.assets?.videoAssetId;
      if (videoAssetId) {
        seg.video = await this.loadVideo(videoAssetId);
      } else if (scene.assets?.imageAssetId) {
        seg.bitmap = await this.loadImage(scene.assets.imageAssetId);
      } else if (scene.productImageRef) {
        seg.bitmap = await this.loadImage(scene.productImageRef).catch(() => null);
      }
      // voice
      if (scene.assets?.audioAssetId) {
        try {
          seg.voiceBuffer = await this.loadAudio(scene.assets.audioAssetId);
          seg.words = timeWords(scene.caption || scene.dialog, dur, seg.voiceBuffer.duration);
        } catch { seg.words = timeWords(scene.caption || scene.dialog, dur, null); }
      } else {
        seg.words = timeWords(scene.caption || scene.dialog, dur, null);
      }
      this.segments.push(seg);
      t += dur;
    }

    // CTA end card
    const brand = p.brand || {};
    const includeCTA = this.settings?.defaults?.includeCTA !== false;
    if (includeCTA && (brand.cta || brand.name)) {
      this.ctaSegment = {
        cta: true, start: t, end: t + 2.6, dur: 2.6,
        scene: { role: 'cta', caption: '', onScreenText: '', transition: 'fade-black' },
        words: [],
      };
      t += 2.6;
    }

    this.total = t;

    // Music buffer
    this.musicBuffer = null;
    if (p.music?.assetId) {
      try { this.musicBuffer = await this.loadAudio(p.music.assetId); } catch { /* optional */ }
    }
  }

  async loadImage(assetId) {
    if (this.bitmaps.has(assetId)) return this.bitmaps.get(assetId);
    const rec = await getAsset(assetId);
    if (!rec) throw new Error(`Asset ${assetId} missing`);
    const bmp = await createImageBitmap(rec.blob);
    this.bitmaps.set(assetId, bmp);
    return bmp;
  }

  async loadAudio(assetId) {
    const rec = await getAsset(assetId);
    if (!rec) throw new Error(`Audio asset ${assetId} missing`);
    const buf = await rec.blob.arrayBuffer();
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return await this.audioCtx.decodeAudioData(buf);
  }

  async loadVideo(assetId) {
    const url = await getAssetURL(assetId);
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    await new Promise((resolve, reject) => {
      v.oncanplay = resolve;
      v.onerror = () => reject(new Error('Failed to load scene video asset'));
      setTimeout(resolve, 8000); // don't hang forever
    });
    this.videos.push(v);
    return v;
  }

  /* ------------------------------ audio graph ------------------------------- */

  buildAudioGraph(destination) {
    const ac = this.audioCtx;
    this.audioDestination = destination;
    const master = ac.createGain();
    master.gain.value = 1;
    master.connect(destination);

    const musicGain = ac.createGain();
    const musicVol = clamp(Number(this.settings?.defaults?.musicVolume ?? 0.18), 0, 1);
    musicGain.gain.value = musicVol;
    musicGain.connect(master);

    const voiceGain = ac.createGain();
    const voiceVol = clamp(Number(this.settings?.defaults?.voiceVolume ?? 1.0), 0, 1.5);
    voiceGain.gain.value = voiceVol;
    voiceGain.connect(master);

    // Music bed with ducking under each voiced segment
    if (this.musicBuffer) {
      const src = ac.createBufferSource();
      src.buffer = this.musicBuffer;
      src.loop = true;
      src.connect(musicGain);
      this.trackSource(src);
      const t0 = this.t0;
      const duck = this.settings?.defaults?.autoDucking === false ? 1 : 0.28;
      const g = musicGain.gain;
      g.setValueAtTime(musicVol * 0.4, t0);
      g.linearRampToValueAtTime(musicVol, t0 + 0.8);
      src.start(t0);
      src.stop(t0 + this.total + 0.5);
      if (duck < 1) {
        for (const seg of this.segments) {
          if (!seg.voiceBuffer) continue;
          const s = t0 + seg.start;
          g.setValueAtTime(musicVol, Math.max(t0, s - 0.25));
          g.linearRampToValueAtTime(musicVol * duck, s + 0.05);
          g.setValueAtTime(musicVol * duck, s + seg.dur);
          g.linearRampToValueAtTime(musicVol, s + seg.dur + 0.4);
        }
      }
      this.musicSrc = src;
    }

    // Voice per segment
    for (const seg of this.segments) {
      if (!seg.voiceBuffer) continue;
      const src = ac.createBufferSource();
      src.buffer = seg.voiceBuffer;
      src.connect(voiceGain);
      this.trackSource(src);
      src.start(this.t0 + seg.start + 0.06);
    }

    // Transition whoosh SFX (procedural noise sweep)
    if (this.settings?.defaults?.sfx !== false) {
      for (const seg of this.segments) {
        const tr = seg.scene?.transition;
        if (!tr || tr === 'cut' || tr === 'crossfade') continue;
        this.whoosh(this.t0 + seg.start, tr === 'whip' ? 0.5 : 0.3);
      }
    }

    return { master, musicGain, voiceGain };
  }

  trackSource(src) { this.audioSources.push(src); }

  whoosh(at, vol) {
    const ac = this.audioCtx;
    const dur = 0.28;
    const buf = ac.createBuffer(1, Math.floor(dur * ac.sampleRate), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, at);
    f.frequency.exponentialRampToValueAtTime(3500, at + dur);
    f.Q.value = 1.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol * 0.25, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master || this.audioCtx.destination);
    this.trackSource(src);
    src.start(at);
  }

  /* -------------------------------- playback -------------------------------- */

  /**
   * Play the timeline as a live preview (audio to speakers).
   * Resolves when playback finishes or stop() is called.
   */
  async play() {
    await this.startPlayback({ record: false });
  }

  /**
   * Render the timeline to a real video file.
   * @returns {Promise<{blob: Blob, mime: string, durationSec: number, ext: string}>}
   */
  async record({ onStatus } = {}) {
    onStatus?.('Recording — playing the timeline in real time…');
    return this.startPlayback({ record: true });
  }

  async startPlayback({ record }) {
    if (!this.segments.length && !this.ctaSegment) throw new Error('Nothing to render — the storyboard is empty.');
    if (this.audioCtx) { try { await this.audioCtx.close(); } catch { /* noop */ } }
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await this.audioCtx.resume();

    const ac = this.audioCtx;
    let blob = null;
    let mime = '';

    if (record) {
      mime = pickMimeType();
      if (!mime) throw new Error('This browser cannot record video (MediaRecorder unsupported).');
    }

    return await new Promise((resolve, reject) => {
      const finish = async (err) => {
        try { for (const s of this.audioSources) { try { s.stop(); } catch { /* noop */ } } } catch { /* noop */ }
        for (const v of this.videos) { try { v.pause(); } catch { /* noop */ } }
        if (this.recorder && this.recorder.state !== 'inactive') {
          // Chain onto the existing onstop (which assembles the blob) instead of
          // replacing it — otherwise the recorded data would be lost.
          const blobHandler = this.recorder.onstop;
          await new Promise((r) => {
            this.recorder.onstop = () => {
              try { blobHandler?.(); } finally { r(); }
            };
            try { this.recorder.stop(); } catch { r(); }
          }).catch(() => {});
        }
        if (err) {
          try { await ac.close(); } catch { /* noop */ }
          reject(err);
          return;
        }
        if (record) {
          resolve({ blob, mime, durationSec: this.total, ext: mime.includes('mp4') ? 'mp4' : 'webm' });
        } else {
          try { await ac.close(); } catch { /* noop */ }
          resolve({ previewDone: true });
        }
      };

      // Recording setup
      let streamDest = null;
      if (record) {
        streamDest = ac.createMediaStreamDestination();
        this.master = null;
        const videoStream = this.canvas.captureStream(Number(this.settings?.defaults?.fps) || 30);
        const tracks = [...videoStream.getVideoTracks(), ...streamDest.stream.getAudioTracks()];
        const stream = new MediaStream(tracks);
        const q = (Number(this.settings?.defaults?.quality) || 1080) >= 1080 ? 12_000_000 : 6_000_000;
        try {
          this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: q, audioBitsPerSecond: 192000 });
        } catch (e) {
          finish(new Error(`Failed to start recorder: ${e.message}`));
          return;
        }
        const chunks = [];
        this.recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        this.recorder.onstop = () => { blob = new Blob(chunks, { type: mime }); };
        this.recorder.start(1000);
      }

      // Start clock + audio graph
      this.t0 = ac.currentTime + 0.18;
      const dest = record ? streamDest : ac.destination;
      const graph = this.buildAudioGraph(dest);
      this.master = graph.master;

      let lastSegIdx = -1;
      const tick = () => {
        if (this.stopped || this.cancelled) {
          finish(this.cancelled ? new Error('Rendering cancelled.') : undefined);
          return;
        }
        const t = ac.currentTime - this.t0;
        const clampedT = clamp(t, 0, this.total);

        // trigger/pause scene videos
        const idx = this.segmentIndexAt(clampedT);
        if (idx !== lastSegIdx) {
          this.videos.forEach((v) => { try { v.pause(); } catch { /* noop */ } });
          const seg = this.segments[idx];
          if (seg?.video) {
            try { seg.video.currentTime = 0; seg.video.play().catch(() => {}); } catch { /* noop */ }
          }
          lastSegIdx = idx;
        }

        this.drawFrame(clampedT);
        this.onTime?.(clampedT, this.total);
        this.onProgress?.(clamp(t / this.total, 0, 1));

        if (t >= this.total + 0.25) {
          if (record && this.recorder?.state === 'recording') {
            setTimeout(() => finish(undefined), 250); // let the last chunks flush
          } else {
            finish(undefined);
          }
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  stop() { this.stopped = true; }
  cancel() { this.cancelled = true; this.stop(); }

  /* --------------------------------- drawing -------------------------------- */

  segmentIndexAt(t) {
    const segs = this.ctaSegment ? [...this.segments, this.ctaSegment] : this.segments;
    for (let i = 0; i < segs.length; i++) {
      if (t >= segs[i].start && t < segs[i].end) return i;
    }
    return segs.length - 1;
  }

  drawFrame(t) {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const segs = this.ctaSegment ? [...this.segments, this.ctaSegment] : this.segments;
    const idx = this.segmentIndexAt(t);
    const seg = segs[idx];
    if (!seg) return;
    const progress = clamp((t - seg.start) / seg.dur, 0, 1);
    const localT = t - seg.start;

    // Transition window at the start of a scene
    const trans = seg.scene?.transition || 'crossfade';
    const transDur = trans === 'cut' ? 0 : TRANSITION_DUR;
    const prev = segs[idx - 1];
    if (transDur > 0 && prev && localT < transDur) {
      const k = easeInOut(localT / transDur);
      switch (trans) {
        case 'crossfade':
          this.drawSegment(prev, 1, t);
          ctx.save(); ctx.globalAlpha = k; this.drawSegment(seg, progress, t); ctx.restore();
          break;
        case 'whip': {
          ctx.save();
          ctx.filter = `blur(${Math.round(6 * Math.sin(k * Math.PI))}px)`;
          ctx.save(); ctx.translate(-W * 1.05 * k, 0); this.drawSegment(prev, 1, t); ctx.restore();
          ctx.save(); ctx.translate(W * 1.05 * (1 - k), 0); this.drawSegment(seg, progress, t); ctx.restore();
          ctx.restore();
          break;
        }
        case 'slide':
          this.drawSegment(prev, 1, t);
          ctx.save(); ctx.translate(0, H * (1 - easeOut(k))); this.drawSegment(seg, progress, t); ctx.restore();
          break;
        case 'fade-black':
          if (k < 0.5) this.drawSegment(prev, 1, t);
          ctx.fillStyle = `rgba(0,0,0,${k < 0.5 ? k * 2 : (1 - k) * 2})`;
          ctx.fillRect(0, 0, W, H);
          if (k >= 0.5) { ctx.save(); ctx.globalAlpha = (k - 0.5) * 2; this.drawSegment(seg, progress, t); ctx.restore(); }
          break;
        default:
          this.drawSegment(seg, progress, t);
      }
    } else {
      this.drawSegment(seg, progress, t);
    }

    // Overlays: on-screen text + captions
    if (!seg.cta) {
      drawOnScreenText(ctx, {
        text: seg.scene.onScreenText, time: localT, sceneDur: seg.dur, W, H,
        brand: this.project.brand,
      });
      drawCaptions(ctx, { words: seg.words, time: localT, style: this.captionStyle(), W, H });
    } else {
      this.drawCTACard(seg, localT);
    }
  }

  captionStyle() {
    const d = this.settings?.defaults || {};
    return {
      ...(this.project.input?.captions || {}),
      style: d.captionStyle || this.project.input?.captions?.style || 'bold-pop',
    };
  }

  /** Ken Burns / camera-move transform for a still image. */
  drawCover(ctx, src, progress, move) {
    const { W, H } = this;
    const iw = src.width || src.videoWidth;
    const ih = src.height || src.videoHeight;
    if (!iw || !ih) return;
    const base = Math.max(W / iw, H / ih);

    let scale = 1.04, dx = 0, dy = 0, rot = 0;
    const e = easeInOut(progress);
    switch (move) {
      case 'push-in': scale = 1.02 + 0.12 * e; break;
      case 'pull-out': scale = 1.16 - 0.12 * e; break;
      case 'pan-left': scale = 1.12; dx = (0.5 - e) * W * 0.1; break;
      case 'pan-right': scale = 1.12; dx = (e - 0.5) * W * 0.1; break;
      case 'tilt-up': scale = 1.12; dy = (0.5 - e) * H * 0.06; break;
      case 'handheld': {
        const w = t0(progress);
        scale = 1.08;
        dx = Math.sin(w * 2.1) * W * 0.006 + Math.sin(w * 5.3) * W * 0.002;
        dy = Math.cos(w * 1.7) * H * 0.005;
        rot = Math.sin(w * 1.3) * 0.004;
        break;
      }
      case 'orbit': scale = 1.1 + 0.03 * e; rot = 0.02 * Math.sin(e * Math.PI); break;
      default: scale = 1.05;
    }
    const dw = iw * base * scale;
    const dh = ih * base * scale;

    ctx.save();
    if (rot) {
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.rotate(rot);
      ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(src, (W - dw) / 2 + dx, (H - dh) / 2 + dy, dw, dh);
    }
    ctx.restore();
  }

  drawSegment(seg, progress, globalT) {
    const ctx = this.ctx;
    const { W, H } = this;
    if (seg.cta) return; // drawn by drawCTACard

    const move = seg.video ? 'static' : (seg.scene?.cameraMove || 'push-in');
    if (seg.video) {
      const v = seg.video;
      if (v.videoWidth) this.drawCover(ctx, v, progress, 'static');
      else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); }
    } else if (seg.bitmap) {
      // Product-focus scenes: blurred product backdrop + contained product shot
      if (seg.scene?.focus === 'product') {
        ctx.save();
        ctx.filter = 'blur(28px) brightness(0.75)';
        this.drawCover(ctx, seg.bitmap, progress, move);
        ctx.restore();
        const iw = seg.bitmap.width, ih = seg.bitmap.height;
        const targetH = H * 0.72;
        const scale = Math.min((W * 0.9) / iw, targetH / ih);
        const dw = iw * scale, dh = ih * scale;
        // soft shadow card
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 60;
        ctx.shadowOffsetY = 18;
        ctx.drawImage(seg.bitmap, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        this.drawCover(ctx, seg.bitmap, progress, move);
      }
    } else {
      // No asset yet — dark placeholder with scene label (honest state)
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `600 ${Math.round(W * 0.04)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Scene image not generated', W / 2, H / 2);
    }
  }

  drawCTACard(seg, localT) {
    const ctx = this.ctx;
    const { W, H } = this;
    const brand = this.project.brand || {};
    const c1 = brand.colors?.primary || '#8b5cf6';
    const c2 = brand.colors?.secondary || '#ec4899';
    const a = clamp(localT / 0.5, 0, 1);

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = a;
    // decorative circles
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.2, W * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.12, H * 0.8, W * 0.22, 0, Math.PI * 2); ctx.fill();

    let y = H * 0.34;
    if (this.logoBitmap) {
      const iw = this.logoBitmap.width, ih = this.logoBitmap.height;
      const lh = H * 0.14;
      const lw = (iw / ih) * lh;
      ctx.drawImage(this.logoBitmap, (W - lw) / 2, y - lh / 2, lw, lh);
      y += lh * 1.3;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const fs = W * 0.085;
    ctx.font = `900 ${fs}px Poppins, Inter, sans-serif`;
    const text = brand.cta || 'Shop Now';
    const words = text.split(/\s+/);
    const lines = [];
    let cur = [];
    for (const w of words) {
      const test = [...cur, w].join(' ');
      if (ctx.measureText(test).width > W * 0.8 && cur.length) { lines.push(cur.join(' ')); cur = [w]; }
      else cur.push(w);
    }
    if (cur.length) lines.push(cur.join(' '));
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, y + i * fs * 1.2 + Math.sin(Math.min(localT * 2, Math.PI)) * 6));
    y += lines.length * fs * 1.2 + fs;

    if (brand.website || brand.name) {
      ctx.font = `600 ${W * 0.035}px Inter, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(brand.website || `@${String(brand.name).replace(/\s+/g, '')}`, W / 2, H * 0.8);
    }
    ctx.restore();
  }

  destroy() {
    this.cancel();
    for (const v of this.videos) { try { v.pause(); v.src = ''; } catch { /* noop */ } }
    for (const bmp of this.bitmaps.values()) { try { bmp.close?.(); } catch { /* noop */ } }
    this.bitmaps.clear();
  }
}

function t0(p) { return p * 6.283; }
