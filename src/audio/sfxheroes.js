// Hero sounds (SPEC2 §3.8): four synthesized sounds per hero, named in data/heroes.js def.sfx.
//   _ability (pri 2, <= 1.2 s) on ability:use, _ready on ability:ready, _guard on hero:guard,
//   _select when the hero is chosen / a run starts (pri 1, <= 0.5 s). Every recipe is original.
import { tone, noise, bell } from './synth.js';

const ab = (fn) => ({ fn, gap: 0.3, max: 1, pri: 2, vol: 0.85, vary: 0 });
const s1 = (fn, gap = 0.2, max = 1, vary = 0) => ({ fn, gap, max, pri: 1, vol: 0.75, vary });

export const HERO_SFX = {
  // ---------------- Pip: whistle + crowd cheer ----------------
  hero_pip_ability: ab((c, d, t) => {
    tone(c, d, t, { type: 'sine', f: 1800, f2: 2400, glide: 0.09, peak: 0.16, decay: 0.12, sus: 0.6, dur: 0.1, vib: { rate: 14, depth: 25 } });
    tone(c, d, t + 0.15, { type: 'sine', f: 1800, f2: 2400, glide: 0.09, peak: 0.16, decay: 0.12, sus: 0.6, dur: 0.12, vib: { rate: 14, depth: 25 } });
    noise(c, d, t + 0.3, { pink: true, type: 'bandpass', f: 900, f2: 1500, fT: 0.4, q: 0.9, a: 0.12, peak: 0.22, decay: 0.3, sus: 0.5, dur: 0.3, rel: 0.2 });
    return noise(c, d, t + 0.32, { type: 'bandpass', f: 2400, q: 1.6, a: 0.1, peak: 0.08, decay: 0.3, sus: 0.4, dur: 0.25, rel: 0.2 });
  }),
  hero_pip_ready: s1((c, d, t) => { tone(c, d, t, { type: 'triangle', f: 1046.5, peak: 0.16, decay: 0.12 }); return tone(c, d, t + 0.09, { type: 'triangle', f: 1318.5, peak: 0.16, decay: 0.2 }); }),
  hero_pip_guard: s1((c, d, t) => tone(c, d, t, { type: 'triangle', f: 520, f2: 380, glide: 0.08, peak: 0.22, decay: 0.12 }), 0.1, 2, 0.3),
  hero_pip_select: s1((c, d, t) => tone(c, d, t, { type: 'sine', f: 1700, f2: 2300, glide: 0.08, peak: 0.13, decay: 0.16, vib: { rate: 12, depth: 20 } })),

  // ---------------- Cinder: whoosh + low boom ----------------
  hero_cinder_ability: ab((c, d, t) => {
    noise(c, d, t, { pink: true, type: 'lowpass', f: 300, f2: 3000, fT: 0.6, q: 1.2, a: 0.35, peak: 0.32, decay: 0.3, sus: 0.6, dur: 0.5, rel: 0.08 });
    tone(c, d, t + 0.6, { type: 'sine', f: 60, f2: 35, glide: 0.45, peak: 0.7, decay: 0.5 });
    return noise(c, d, t + 0.6, { pink: true, type: 'lowpass', f: 1800, f2: 140, fT: 0.45, peak: 0.45, decay: 0.5 });
  }),
  hero_cinder_ready: s1((c, d, t) => {
    noise(c, d, t, { type: 'highpass', f: 3500, peak: 0.12, decay: 0.2, sus: 0.3, dur: 0.15 });
    return tone(c, d, t, { type: 'sawtooth', f: 220, f2: 330, glide: 0.2, lp: 1800, peak: 0.12, decay: 0.28 });
  }),
  hero_cinder_guard: s1((c, d, t) => { tone(c, d, t, { type: 'sine', f: 110, f2: 70, glide: 0.08, peak: 0.45, decay: 0.12 }); return noise(c, d, t, { type: 'highpass', f: 2500, peak: 0.12, decay: 0.03 }); }, 0.1, 2, 0.3),
  hero_cinder_select: s1((c, d, t) => noise(c, d, t, { pink: true, type: 'bandpass', f: 500, f2: 1400, fT: 0.3, q: 1.5, a: 0.06, peak: 0.3, decay: 0.32 })),

  // ---------------- Rime: wind gust + crystal crack ----------------
  hero_rime_ability: ab((c, d, t) => {
    noise(c, d, t, { pink: true, type: 'bandpass', f: 600, f2: 2200, fT: 0.9, q: 2.5, a: 0.4, peak: 0.3, decay: 0.4, sus: 0.7, dur: 0.6, rel: 0.25 });
    noise(c, d, t + 0.2, { pink: true, type: 'bandpass', f: 1800, f2: 700, fT: 0.6, q: 3, a: 0.2, peak: 0.12, decay: 0.4, sus: 0.5, dur: 0.4 });
    bell(c, d, t + 0.75, { f: 2400, ratio: 5.1, index: 2.5, peak: 0.22, decay: 0.45 });
    return noise(c, d, t + 0.75, { type: 'highpass', f: 5000, peak: 0.2, decay: 0.06 });
  }),
  hero_rime_ready: s1((c, d, t) => { bell(c, d, t, { f: 2093, ratio: 3, index: 1, peak: 0.12, decay: 0.45 }); return bell(c, d, t, { f: 3136, ratio: 3, index: 1, peak: 0.08, decay: 0.45 }); }),
  hero_rime_guard: s1((c, d, t) => bell(c, d, t, { f: 3400, ratio: 4.2, index: 1.5, peak: 0.12, decay: 0.12 }), 0.1, 2, 0.4),
  hero_rime_select: s1((c, d, t) => { bell(c, d, t, { f: 1568, ratio: 3, index: 1, peak: 0.12, decay: 0.25 }); return bell(c, d, t + 0.12, { f: 2349, ratio: 3, index: 1, peak: 0.12, decay: 0.3 }); }),

  // ---------------- Bonbon: bubble chime + major arpeggio ----------------
  hero_bonbon_ability: ab((c, d, t) => {
    tone(c, d, t, { type: 'sine', f: 400, f2: 1200, glide: 0.35, peak: 0.2, decay: 0.38 });
    for (let i = 0; i < 3; i++) tone(c, d, t + 0.1 + i * 0.09, { type: 'sine', f: 700 + i * 260, f2: 1500 + i * 300, glide: 0.04, peak: 0.16, decay: 0.05 });
    const notes = [523.25, 659.25, 783.99, 1046.5];
    let end = t;
    notes.forEach((f, i) => { end = bell(c, d, t + 0.42 + i * 0.08, { f, ratio: 2, index: 0.8, peak: 0.14, decay: 0.3 }); });
    return end;
  }),
  hero_bonbon_ready: s1((c, d, t) => tone(c, d, t, { type: 'sine', f: 300, f2: 700, glide: 0.18, peak: 0.2, decay: 0.25, vib: { rate: 9, depth: 60 } })),
  hero_bonbon_guard: s1((c, d, t) => tone(c, d, t, { type: 'square', f: 900, f2: 1300, glide: 0.07, lp: 2500, peak: 0.08, decay: 0.09 }), 0.1, 2, 0.3),
  hero_bonbon_select: s1((c, d, t) => { let e = t; [880, 1108.7, 1318.5].forEach((f, i) => { e = tone(c, d, t + i * 0.06, { type: 'sine', f, f2: f * 1.4, glide: 0.04, peak: 0.13, decay: 0.06 }); }); return e; }),

  // ---------------- Bolt: heavy thunk + servo whirr ----------------
  hero_bolt_ability: ab((c, d, t) => {
    tone(c, d, t, { type: 'square', f: 90, f2: 55, glide: 0.1, lp: 900, peak: 0.35, decay: 0.15 });
    noise(c, d, t, { type: 'bandpass', f: 1500, q: 2, peak: 0.3, decay: 0.08 });
    return tone(c, d, t + 0.25, { type: 'sawtooth', f: 200, f2: 600, glide: 0.55, lp: 2000, peak: 0.12, decay: 0.3, sus: 0.7, dur: 0.55, vib: { rate: 30, depth: 70, delay: 0.01 } });
  }),
  hero_bolt_ready: s1((c, d, t) => { tone(c, d, t, { type: 'square', f: 1320, lp: 4000, peak: 0.08, decay: 0.06 }); return tone(c, d, t + 0.1, { type: 'square', f: 1320, lp: 4000, peak: 0.08, decay: 0.06 }); }),
  hero_bolt_guard: s1((c, d, t) => { noise(c, d, t, { type: 'bandpass', f: 3000, q: 6, peak: 0.25, decay: 0.12 }); return bell(c, d, t, { f: 1250, ratio: 2.76, index: 1.2, peak: 0.07, decay: 0.15 }); }, 0.1, 2, 0.3),
  hero_bolt_select: s1((c, d, t) => { let e = t; for (let i = 0; i < 4; i++) e = noise(c, d, t + i * 0.045, { type: 'bandpass', f: 4200, q: 4, peak: 0.16, decay: 0.02 }); return e; }),

  // ---------------- Titan Vex: sub-bass slam + gravel ----------------
  hero_vex_ability: ab((c, d, t) => {
    tone(c, d, t, { type: 'sine', f: 45, f2: 32, glide: 0.6, peak: 0.85, decay: 0.6 });
    tone(c, d, t, { type: 'triangle', f: 90, f2: 40, glide: 0.2, peak: 0.3, decay: 0.2 });
    return noise(c, d, t + 0.02, { pink: true, type: 'lowpass', f: 900, f2: 200, fT: 0.6, q: 0.7, rate: 0.6, peak: 0.45, decay: 0.6 });
  }),
  hero_vex_ready: s1((c, d, t) => tone(c, d, t, { type: 'sawtooth', f: 110, lp: 600, a: 0.04, peak: 0.22, decay: 0.3, sus: 0.6, dur: 0.25 })),
  hero_vex_guard: s1((c, d, t) => bell(c, d, t, { f: 300, ratio: 1.4, index: 2, peak: 0.25, decay: 0.35 }), 0.1, 2, 0.3),
  hero_vex_select: s1((c, d, t) => { tone(c, d, t, { type: 'sine', f: 70, f2: 40, glide: 0.15, peak: 0.5, decay: 0.2 }); return noise(c, d, t, { pink: true, type: 'lowpass', f: 500, peak: 0.25, decay: 0.12 }); }),
};
