// Synth instruments for the music tracks and the win/lose stingers.
// Each takes (ctx, dest, t, ...) and schedules one note/hit at context time t.
import { tone, noise, mtof } from './synth.js';

// ---------------- drums ----------------
export function kick(ctx, d, t, v = 1, heavy = false) {
  tone(ctx, d, t, { type: 'sine', f: heavy ? 170 : 150, f2: heavy ? 40 : 46, glide: heavy ? 0.12 : 0.09, peak: 0.95 * v, decay: heavy ? 0.36 : 0.28 });
  noise(ctx, d, t, { type: 'lowpass', f: 3200, peak: 0.12 * v, decay: 0.012 });
  if (heavy) tone(ctx, d, t, { type: 'triangle', f: 95, f2: 50, glide: 0.1, peak: 0.25 * v, decay: 0.2 });
}

export function snare(ctx, d, t, v = 1, fat = false) {
  noise(ctx, d, t, { type: 'highpass', f: fat ? 900 : 1400, q: 0.6, peak: 0.42 * v, decay: fat ? 0.22 : 0.15 });
  noise(ctx, d, t, { type: 'bandpass', f: 4200, q: 0.9, peak: 0.12 * v, decay: 0.08 });
  tone(ctx, d, t, { type: 'triangle', f: fat ? 200 : 230, f2: 150, glide: 0.06, peak: 0.32 * v, decay: 0.09 });
}

export function clap(ctx, d, t, v = 1) {
  for (let i = 0; i < 3; i++) noise(ctx, d, t + i * 0.011, { type: 'bandpass', f: 1300, q: 1.4, peak: 0.3 * v, decay: 0.018 });
  noise(ctx, d, t + 0.033, { type: 'bandpass', f: 1200, q: 1.1, peak: 0.3 * v, decay: 0.16 });
}

export function rim(ctx, d, t, v = 1) {
  tone(ctx, d, t, { type: 'triangle', f: 1750, peak: 0.16 * v, decay: 0.025 });
  noise(ctx, d, t, { type: 'bandpass', f: 2600, q: 3, peak: 0.12 * v, decay: 0.02 });
}

export function hat(ctx, d, t, v = 1, open = false) {
  noise(ctx, d, t, { type: 'highpass', f: 7600, q: 0.7, peak: (open ? 0.12 : 0.14) * v, decay: open ? 0.2 : 0.035 });
}

export function shaker(ctx, d, t, v = 1) {
  noise(ctx, d, t, { type: 'bandpass', f: 6500, q: 1.1, a: 0.012, peak: 0.12 * v, decay: 0.05 });
}

export function tom(ctx, d, t, v = 1, f = 140) {
  tone(ctx, d, t, { type: 'sine', f, f2: f * 0.55, glide: 0.22, peak: 0.55 * v, decay: 0.28 });
  noise(ctx, d, t, { type: 'lowpass', f: 1400, peak: 0.08 * v, decay: 0.05 });
}

export function crash(ctx, d, t, v = 1) {
  noise(ctx, d, t, { type: 'highpass', f: 4200, q: 0.5, peak: 0.2 * v, decay: 1.3 });
  noise(ctx, d, t, { type: 'bandpass', f: 7800, q: 1.5, peak: 0.08 * v, decay: 0.7 });
}

/** Rising white-noise sweep (pre-chorus riser / stinger lead-in). */
export function riser(ctx, d, t, dur = 1, v = 1) {
  noise(ctx, d, t, { type: 'bandpass', f: 600, f2: 7000, fT: dur, q: 2, a: dur * 0.9, peak: 0.12 * v, decay: 0.08 });
}

// ---------------- tonal ----------------
/** Punchy synth bass: saw through a plucky lowpass + a sine sub. */
export function bass(ctx, d, t, m, len, v = 1, bright = 1) {
  const f = mtof(m);
  tone(ctx, d, t, { type: 'sawtooth', f, lp: 380 + 1500 * bright, lp2: 260 + 260 * bright, lpT: 0.16, q: 3, a: 0.004, peak: 0.22 * v, decay: 0.12, sus: 0.55, dur: len * 0.88, rel: 0.05 });
  tone(ctx, d, t, { type: 'sine', f, a: 0.004, peak: 0.36 * v, decay: 0.1, sus: 0.8, dur: len * 0.88, rel: 0.05 });
}

/** Bright plucky arpeggio note (square + triangle, quick filter decay). */
export function pluck(ctx, d, t, m, v = 1, pan = 0) {
  const f = mtof(m);
  tone(ctx, d, t, { type: 'square', f, lp: 3600, lp2: 700, lpT: 0.16, q: 1.5, peak: 0.07 * v, decay: 0.2, pan });
  tone(ctx, d, t, { type: 'triangle', f: f * 2, peak: 0.05 * v, decay: 0.12, pan: -pan });
}

/** Mellow marimba-ish mallet (title melody). */
export function mallet(ctx, d, t, m, v = 1, pan = 0) {
  const f = mtof(m);
  tone(ctx, d, t, { type: 'sine', f, peak: 0.26 * v, decay: 0.55, pan });
  tone(ctx, d, t, { type: 'sine', f: f * 3.98, peak: 0.06 * v, decay: 0.08, pan });
  tone(ctx, d, t, { type: 'triangle', f: f * 2, peak: 0.05 * v, decay: 0.25, pan });
}

/** Singing lead: two detuned squares, gentle lowpass, delayed vibrato. */
export function lead(ctx, d, t, m, len, v = 1, wave = 'square') {
  const f = mtof(m);
  const common = { type: wave, f, lp: wave === 'square' ? 2600 : 2000, q: 0.8, a: 0.012, peak: 0.075 * v, decay: 0.12, sus: 0.75, dur: len * 0.92, rel: 0.09, vib: { rate: 5.6, depth: 14, delay: Math.min(0.3, len * 0.6) } };
  tone(ctx, d, t, { ...common, detune: -7, pan: -0.25 });
  tone(ctx, d, t, { ...common, detune: 7, pan: 0.25 });
  tone(ctx, d, t, { type: 'sine', f: f / 2, a: 0.012, peak: 0.05 * v, decay: 0.1, sus: 0.7, dur: len * 0.92, rel: 0.09 });
}

/** Soft pad chord (triangles with slow attack). */
export function pad(ctx, d, t, notes, len, v = 1) {
  for (let i = 0; i < notes.length; i++) {
    const f = mtof(notes[i]);
    tone(ctx, d, t, { type: 'triangle', f, a: 0.28, peak: 0.045 * v, decay: 0.3, sus: 0.85, dur: len, rel: 0.5, detune: (i % 2 ? 5 : -5), pan: (i - (notes.length - 1) / 2) * 0.25 });
  }
}

/** Short brassy stab chord (boss / fanfare). */
export function stab(ctx, d, t, notes, v = 1, len = 0.12) {
  for (let i = 0; i < notes.length; i++) {
    const f = mtof(notes[i]);
    tone(ctx, d, t, { type: 'sawtooth', f, lp: 2400, lp2: 500, lpT: 0.25, q: 1.2, a: 0.006, peak: 0.06 * v, decay: 0.1, sus: 0.5, dur: len, rel: 0.12, detune: i % 2 ? 6 : -6, pan: (i - 1) * 0.3 });
  }
}

/** Brass-like swelling note for fanfares. */
export function brass(ctx, d, t, m, len, v = 1) {
  const f = mtof(m);
  tone(ctx, d, t, { type: 'sawtooth', f, lp: 900, lp2: 3200, lpT: 0.08, q: 1, a: 0.02, peak: 0.09 * v, decay: 0.15, sus: 0.7, dur: len, rel: 0.15, detune: -5, vib: { rate: 5, depth: 10, delay: 0.15 } });
  tone(ctx, d, t, { type: 'sawtooth', f, lp: 900, lp2: 3200, lpT: 0.08, q: 1, a: 0.02, peak: 0.09 * v, decay: 0.15, sus: 0.7, dur: len, rel: 0.15, detune: 5 });
}

// ---------------- chords ----------------
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10],
  sus: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
};
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** 'Am7' -> { root: pitch class 0..11, iv: [intervals] }. */
export function parseChord(name) {
  const m = /^([A-G][b#]?)(.*)$/.exec(name);
  const root = NOTE[m[1]];
  return { root, iv: QUAL[m[2]] || QUAL[''] };
}

// ---------------- stingers (one-shot jingles on the sfx bus) ----------------
export function winStinger(ctx, d, t) {
  const s = 0.11;
  // da-da-da-DAAA fanfare in C major
  const run = [67, 72, 76, 79];
  run.forEach((m, i) => { brass(ctx, d, t + i * s, m, s * 0.9, 0.9); pluck(ctx, d, t + i * s, m + 12, 0.8); });
  const t2 = t + run.length * s;
  [72, 76, 79, 84].forEach((m) => brass(ctx, d, t2, m, 0.9, 0.75));
  kick(ctx, d, t2, 0.7); crash(ctx, d, t2, 0.9);
  snare(ctx, d, t2 - 0.11, 0.35); snare(ctx, d, t2 - 0.055, 0.45);
  // sparkle tail
  [88, 91, 96, 100].forEach((m, i) => mallet(ctx, d, t2 + 0.25 + i * 0.07, m, 0.45, (i - 1.5) * 0.3));
  bass(ctx, d, t2, 48, 0.9, 0.9);
  return t2 + 1.4;
}

export function loseStinger(ctx, d, t) {
  // wah-wah-wah-waaah: muted trombone (saw through a slow "wah" lowpass), falling semitones
  const notes = [55, 54, 53, 52];
  const lens = [0.32, 0.32, 0.32, 1.0];
  let tt = t;
  for (let i = 0; i < notes.length; i++) {
    const f = mtof(notes[i]);
    const last = i === notes.length - 1;
    tone(ctx, d, tt, { type: 'sawtooth', f, f2: last ? f * 0.94 : undefined, glide: lens[i], lp: 380, lp2: 1100, lpT: 0.12, q: 4, a: 0.03, peak: 0.16, decay: 0.12, sus: 0.8, dur: lens[i] * 0.85, rel: 0.12, vib: last ? { rate: 6.5, depth: 45, delay: 0.25 } : undefined });
    tone(ctx, d, tt, { type: 'triangle', f: f / 2, a: 0.03, peak: 0.12, decay: 0.1, sus: 0.8, dur: lens[i] * 0.85, rel: 0.12 });
    tt += lens[i];
  }
  tom(ctx, d, tt - 0.95, 0.5, 90);
  return tt + 0.3;
}
