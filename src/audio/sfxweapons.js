// Weapon sounds (SPEC2 §2). FOUNDATION STUB (owned by the WEAPONS builder): every name each weapon's def.sfx
// lists exists, mostly re-using the shipped fire1..5 recipes, so the game plays and sounds like today.
// Entry format = sfxdefs.js: { fn(ctx, dest, t, pitch, opts) -> end time, loop?(ctx, dest, t) -> {stop(at)},
// gap, max, pri, vol, vary }. Fire sounds: gap >= 0.06, pri 0. Hit sounds: max <= 3.
import { tone, noise, bell } from './synth.js';

const fire = (fn, gap = 0.085, vol = 0.75) => ({ fn, gap, max: 3, pri: 0, vol, vary: 0.8 });
const blip = (f, f2, type = 'sine', decay = 0.08) => ({ fn(c, d, t, p) { return tone(c, d, t, { type, f: f * p, f2: f2 * p, glide: decay, peak: 0.18, decay }); }, gap: 0.08, max: 3, pri: 0, vol: 0.6, vary: 0.5 });

export const WEAPON_SFX = {
  wpn_storm_fire: fire((c, d, t, p) => { // shipped pistol "pop"
    tone(c, d, t, { type: 'square', f: 880 * p, f2: 240 * p, glide: 0.05, lp: 3000, lp2: 900, lpT: 0.05, peak: 0.16, decay: 0.06 });
    tone(c, d, t, { type: 'sine', f: 320 * p, f2: 110 * p, glide: 0.06, peak: 0.3, decay: 0.08 });
    return noise(c, d, t, { type: 'bandpass', f: 2600, q: 1.3, peak: 0.1, decay: 0.022 });
  }),
  wpn_storm_arc: blip(60, 120, 'sawtooth', 0.06),
  wpn_ember_ignite: fire((c, d, t, p) => { // shipped rifle "crack"
    noise(c, d, t, { type: 'highpass', f: 2000 * p, f2: 900, fT: 0.06, peak: 0.3, decay: 0.065 });
    return tone(c, d, t, { type: 'triangle', f: 200 * p, f2: 62, glide: 0.08, peak: 0.34, decay: 0.1 });
  }, 0.09, 0.7),
  wpn_ember_loop: { fn(c, d, t) { return noise(c, d, t, { pink: true, type: 'bandpass', f: 800, q: 1, peak: 0.1, decay: 0.2 }); },
    loop(c, d, t) {
      const src = c.createBufferSource(), buf = c.createBuffer(1, c.sampleRate, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15);
      src.connect(f); f.connect(g); g.connect(d); src.start(t);
      return { stop(at) { src.stop(at); } };
    }, gap: 0.2, max: 1, pri: 0, vol: 0.6, vary: 0 },
  wpn_ice_fire: fire((c, d, t, p) => { // shipped laser "pew"
    tone(c, d, t, { type: 'square', f: 1650 * p, f2: 360 * p, glide: 0.1, lp: 4200, lp2: 1300, lpT: 0.1, peak: 0.13, decay: 0.11 });
    return tone(c, d, t, { type: 'sine', f: 2300 * p, f2: 520 * p, glide: 0.09, peak: 0.14, decay: 0.1, detune: 8 });
  }, 0.06, 1.0),
  wpn_ice_hit: blip(2400, 1800, 'sine', 0.04),
  wpn_ice_freeze: { fn(c, d, t) { noise(c, d, t, { type: 'highpass', f: 5200, peak: 0.2, decay: 0.1 }); return bell(c, d, t, { f: 1900, ratio: 3.5, peak: 0.08, decay: 0.3 }); }, gap: 0.12, max: 2, pri: 1, vol: 0.6, vary: 0.3 },
  wpn_ice_shatter: { fn(c, d, t) { return noise(c, d, t, { type: 'highpass', f: 4200, peak: 0.2, decay: 0.12 }); }, gap: 0.1, max: 2, pri: 1, vol: 0.6, vary: 0.4 },
  wpn_sugar_fire: fire((c, d, t, p) => tone(c, d, t, { type: 'sine', f: 300 * p, f2: 650 * p, glide: 0.09, peak: 0.24, decay: 0.12 }), 0.1, 0.9),
  wpn_sugar_pop: blip(220, 90, 'triangle', 0.1),
  wpn_sugar_goo: { fn(c, d, t) { return noise(c, d, t, { type: 'lowpass', f: 500, peak: 0.12, decay: 0.2 }); }, gap: 0.4, max: 1, pri: 0, vol: 0.5, vary: 0.3 },
  wpn_prism_fire: fire((c, d, t, p) => tone(c, d, t, { type: 'sawtooth', f: 880 * p, f2: 860 * p, glide: 0.07, lp: 2400, peak: 0.12, decay: 0.07 }), 0.08, 0.7),
  wpn_prism_split: { fn(c, d, t) { return bell(c, d, t, { f: 1760, ratio: 3, peak: 0.07, decay: 0.2 }); }, gap: 0.06, max: 2, pri: 0, vol: 0.6, vary: 0 },
  wpn_gear_fire: fire((c, d, t, p) => { tone(c, d, t, { type: 'square', f: 120 * p, lp: 900, peak: 0.12, decay: 0.08 }); return noise(c, d, t, { type: 'bandpass', f: 3000, q: 8, peak: 0.1, decay: 0.06 }); }, 0.09, 0.7),
  wpn_gear_ting: { fn(c, d, t) { return bell(c, d, t, { f: 1500, ratio: 2.76, peak: 0.07, decay: 0.2 }); }, gap: 0.06, max: 3, pri: 0, vol: 0.6, vary: 0.3 },
  wpn_gear_turret: { fn(c, d, t) { return tone(c, d, t, { type: 'square', f: 90, f2: 60, glide: 0.1, lp: 600, peak: 0.2, decay: 0.15 }); }, gap: 0.2, max: 1, pri: 1, vol: 0.7, vary: 0 },
  wpn_void_fire: fire((c, d, t, p) => tone(c, d, t, { type: 'sine', f: 70 * p, f2: 40, glide: 0.3, a: 0.15, peak: 0.4, decay: 0.3 }), 0.2, 0.6),
  wpn_void_hole: { fn(c, d, t) { return noise(c, d, t, { type: 'lowpass', f: 800, f2: 120, fT: 0.5, peak: 0.12, decay: 0.5 }); }, gap: 0.3, max: 2, pri: 0, vol: 0.6, vary: 0.2 },
  wpn_void_pop: blip(300, 80, 'sine', 0.08),
};
