/**
 * ReelForge — local procedural music generator.
 *
 * Synthesizes royalty-free-style background tracks OFFLINE with the Web Audio
 * API (OfflineAudioContext). No API key, no network, deterministic per seed.
 * This is a real generator (oscillators + envelopes + noise percussion), not a
 * sample pack — used when the user has no premium music provider configured
 * or wants a quick draft track.
 */

import { seededRandom, hashString } from '../core/utils.js';

export const MUSIC_STYLES = [
  { id: 'upbeat-pop', label: 'Upbeat Pop', bpm: 124, hint: 'Bright, energetic, mainstream ad feel' },
  { id: 'chill-lofi', label: 'Chill Lo-fi', bpm: 82, bpmNote: true, hint: 'Soft, cozy, vlog-style' },
  { id: 'cinematic', label: 'Cinematic Swell', bpm: 70, hint: 'Emotional build, premium feel' },
  { id: 'corporate', label: 'Clean Corporate', bpm: 104, hint: 'Light plucks, positive, neutral' },
];

// Chord progressions (semitone offsets from root, as chord arrays)
const PROGRESSIONS = {
  'upbeat-pop': [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  'chill-lofi': [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]],
  'cinematic': [[0, 7, 12], [8, 12, 15], [5, 12, 16], [3, 10, 15]],
  'corporate': [[0, 4, 7], [5, 9, 12], [7, 11, 14], [2, 5, 9]],
};

const ROOTS = { 'upbeat-pop': 57 /* A3 */, 'chill-lofi': 53 /* F3 */, cinematic: 45 /* A2 */, corporate: 55 /* G3 */ };
const ROOT_MULTIPLIER = { 'upbeat-pop': 1, 'chill-lofi': 1, cinematic: 0.75, corporate: 1 };

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Render a music track.
 * @returns {Promise<AudioBuffer>}
 */
export async function renderMusic(styleId, durationSec, seed = 'reelforge', sampleRate = 44100) {
  const style = MUSIC_STYLES.find((s) => s.id === styleId) || MUSIC_STYLES[0];
  const rng = seededRandom(hashString(`${styleId}:${seed}`));
  const bpm = style.bpm;
  const beat = 60 / bpm;
  const barLen = beat * 4;
  const total = Math.max(4, Math.min(180, durationSec));

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(2, Math.ceil(total * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.9;

  // Gentle bus compression-ish: use a DynamicsCompressor for glue.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const prog = PROGRESSIONS[styleId] || PROGRESSIONS['upbeat-pop'];
  const root = ROOTS[styleId];
  const bars = Math.ceil(total / barLen);

  const pluckFreq = { 'upbeat-pop': 0.5, 'chill-lofi': 0.6, cinematic: 1, corporate: 0.5 }[styleId];

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    if (t0 > total) break;
    const chord = prog[bar % prog.length];

    // Pad / chord bed
    for (const semi of chord) {
      pad(ctx, master, midiToFreq(root + semi + 12), t0, barLen * 0.98,
        styleId === 'cinematic' ? 0.10 : 0.045, styleId);
    }
    // Bass on chord root
    bassNote(ctx, master, midiToFreq(root - 12 + chord[0]), t0, beat * 3.2, 0.16);
    if (styleId !== 'cinematic' && rng() > 0.35) {
      bassNote(ctx, master, midiToFreq(root - 12 + chord[0]), t0 + beat * 2.5, beat * 1.2, 0.10);
    }

    // Arpeggio pluck
    if (styleId !== 'chill-lofi' || rng() > 0.4) {
      const notes = 4;
      for (let i = 0; i < notes; i++) {
        if (rng() < pluckFreq * 0.8) continue;
        const semi = chord[Math.floor(rng() * chord.length)] + (rng() > 0.6 ? 12 : 0);
        pluck(ctx, master, midiToFreq(root + 12 + semi), t0 + i * beat, beat * 0.9, 0.09);
      }
    }

    // Drums (skip first 2 bars for a build-in feel; cinematic stays drum-light)
    if (bar >= 1 && styleId !== 'cinematic') {
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        if (b === 0 || b === 2 || (styleId === 'corporate' && b === 2.5)) kick(ctx, master, t, styleId === 'chill-lofi' ? 0.5 : 0.75);
        if (b === 1 || b === 3) snareish(ctx, master, t, styleId === 'chill-lofi' ? 0.10 : 0.2);
        for (const off of [0, 0.5]) {
          if (rng() > 0.25) hat(ctx, master, t + off * beat, styleId === 'chill-lofi' ? 0.05 : 0.12);
        }
      }
    }
    if (styleId === 'cinematic' && bar >= 2 && bar % 2 === 0) {
      kick(ctx, master, t0, 0.5);
      swell(ctx, master, t0, barLen, 0.06);
    }
  }

  // Fade out the last 1.2s
  const fadeStart = Math.max(0, total - 1.2);
  master.gain.setValueAtTime(0.9, ctx.currentTime + fadeStart);
  master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + total);

  return ctx.startRendering();
}

/* ------------------------------- instruments ------------------------------- */

function env(ctx, node, t, dur, peak, attack = 0.01, release = 0.2) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(peak * 0.6, t + attack, (dur - attack) * 0.4);
  g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur - release), release * 0.5);
  node.connect(g);
  return g;
}

function pad(ctx, out, freq, t, dur, peak, styleId) {
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = styleId === 'cinematic' ? 'sawtooth' : 'sine';
  o2.type = 'triangle';
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.003; // slow beating
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = styleId === 'cinematic' ? 1200 : 2200;
  o1.connect(f); o2.connect(f);
  const g = env(ctx, f, t, dur, peak, dur * 0.3, dur * 0.4);
  g.connect(out);
  o1.start(t); o2.start(t);
  o1.stop(t + dur + 0.5); o2.stop(t + dur + 0.5);
}

function pluck(ctx, out, freq, t, dur, peak) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const g = env(ctx, o, t, dur, peak, 0.005, dur * 0.8);
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.3);
}

function bassNote(ctx, out, freq, t, dur, peak) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = env(ctx, o, t, dur, peak, 0.01, 0.25);
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.3);
}

function kick(ctx, out, t, peak) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = env(ctx, o, t, 0.18, peak, 0.002, 0.15);
  g.connect(out);
  o.start(t); o.stop(t + 0.4);
}

function snareish(ctx, out, t, peak) {
  const noise = makeNoise(ctx, t, 0.15);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 0.8;
  noise.connect(f);
  const g = env(ctx, f, t, 0.15, peak, 0.002, 0.12);
  g.connect(out);
}

function hat(ctx, out, t, peak) {
  const noise = makeNoise(ctx, t, 0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7500;
  noise.connect(f);
  const g = env(ctx, f, t, 0.05, peak, 0.001, 0.04);
  g.connect(out);
}

function swell(ctx, out, t, dur, peak) {
  const noise = makeNoise(ctx, t, dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(4000, t + dur);
  f.Q.value = 1.2;
  noise.connect(f);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(out);
}

function makeNoise(ctx, t, dur) {
  const len = Math.max(1, Math.floor(dur * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.start(t);
  return src;
}

/* ------------------------------ WAV encoding ------------------------------- */

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob. */
export function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeStr = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/** Generate music and return a WAV blob asset payload. */
export async function generateLocalMusic({ styleId = 'upbeat-pop', durationSec = 30, seed = 'seed' }) {
  const buffer = await renderMusic(styleId, durationSec, seed);
  return { blob: audioBufferToWav(buffer), mime: 'audio/wav', buffer };
}
