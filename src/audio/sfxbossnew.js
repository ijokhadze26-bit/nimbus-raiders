// Sounds of the update-3 bosses GLACIUS (frost giant) and GUMDROP GOLIATH (chewy gumdrop), merged into SFX by
// sfxdefs.js. NEW_BOSS_ATTACK_SFX maps their 'boss:attack' names to these sounds (bindings.js merges it into
// its attack table), so unknown attacks keep falling back to the old slam.
import { tone, noise, bell } from './synth.js';
import { kick } from './instruments.js';

/** Glassy ice tinkle: a little cascade of high FM bells. */
function tinkle(c, d, t, n = 5, f0 = 2600, spread = 0.045) {
  let end = t;
  for (let i = 0; i < n; i++) {
    const f = f0 * (1 + ((i * 7) % 5) * 0.13);
    end = bell(c, d, t + i * spread, { f, ratio: 2.76, index: 0.9, peak: 0.07, decay: 0.32, pan: ((i % 3) - 1) * 0.35 });
  }
  return end;
}

export const NEW_BOSS_SFX = {
  // ---------------- Glacius ----------------
  frostFreeze: { fn(c, d, t, p) { // a lane freezes solid: icy hiss sweeping down + crystal shimmer + crackle
    noise(c, d, t, { type: 'highpass', f: 7000, f2: 1800, fT: 0.5, peak: 0.22, decay: 0.55 });
    noise(c, d, t + 0.05, { type: 'bandpass', f: 3200, q: 6, peak: 0.12, decay: 0.4 });
    tone(c, d, t, { type: 'sine', f: 110 * p, f2: 55, glide: 0.4, peak: 0.35, decay: 0.45 });
    return tinkle(c, d, t + 0.06, 6, 2400 * p, 0.05);
  }, gap: 0.2, max: 2, pri: 2, vol: 0.8, vary: 1 },
  iceWall: { fn(c, d, t, p) { // a slab of ice slams down: heavy crack, thud, glassy ring
    noise(c, d, t, { type: 'lowpass', f: 4200, f2: 260, fT: 0.18, peak: 0.42, decay: 0.25 });
    noise(c, d, t + 0.02, { type: 'bandpass', f: 1800, q: 4, peak: 0.16, decay: 0.12 });
    tone(c, d, t, { type: 'sine', f: 82 * p, f2: 34, glide: 0.5, peak: 0.6, decay: 0.55 });
    kick(c, d, t, 0.7, true);
    return tinkle(c, d, t + 0.08, 4, 1700 * p, 0.06);
  }, gap: 0.2, max: 2, pri: 2, vol: 0.85, vary: 1 },
  iceBreak: { fn(c, d, t, p) { // an ice wall shot to pieces
    noise(c, d, t, { type: 'highpass', f: 2600, peak: 0.32, decay: 0.22 });
    noise(c, d, t, { type: 'lowpass', f: 1400, f2: 300, fT: 0.2, peak: 0.2, decay: 0.2 });
    return tinkle(c, d, t, 7, 2000 * p, 0.03);
  }, gap: 0.12, max: 2, pri: 1, vol: 0.8, vary: 1.5 },
  icicle: { fn(c, d, t, p) { // icicle shatters on the road
    noise(c, d, t, { type: 'highpass', f: 3800, peak: 0.28, decay: 0.14 });
    tone(c, d, t, { type: 'triangle', f: 180 * p, f2: 70, glide: 0.12, peak: 0.22, decay: 0.16 });
    return tinkle(c, d, t + 0.01, 3, 3000 * p, 0.035);
  }, gap: 0.07, max: 3, pri: 1, vol: 0.75, vary: 2 },
  frostPound: { fn(c, d, t, p) { // two fists hit the ice: deep boom + rolling crack
    kick(c, d, t, 1, true);
    tone(c, d, t, { type: 'sine', f: 62 * p, f2: 26, glide: 0.8, peak: 0.8, decay: 0.9 });
    noise(c, d, t, { pink: true, type: 'lowpass', f: 900, f2: 90, fT: 0.9, peak: 0.5, decay: 1.0 });
    noise(c, d, t + 0.1, { type: 'bandpass', f: 2400, f2: 900, fT: 0.6, q: 3, peak: 0.12, decay: 0.6 });
    return t + 1.0;
  }, gap: 0.3, max: 1, pri: 2, vol: 0.9, vary: 1 },

  // ---------------- Gumdrop Goliath ----------------
  gumJump: { fn(c, d, t, p) { // springy take-off "boing"
    tone(c, d, t, { type: 'sine', f: 140 * p, f2: 520 * p, glide: 0.28, peak: 0.32, decay: 0.32, vib: { rate: 22, depth: 90, delay: 0.02 } });
    return tone(c, d, t, { type: 'triangle', f: 70 * p, f2: 210 * p, glide: 0.25, peak: 0.18, decay: 0.28 });
  }, gap: 0.25, max: 1, pri: 1, vol: 0.85, vary: 1 },
  gumSlam: { fn(c, d, t, p) { // lands: squelchy thud + wobble
    kick(c, d, t, 1, true);
    noise(c, d, t, { pink: true, type: 'lowpass', f: 1200, f2: 120, fT: 0.4, peak: 0.45, decay: 0.45 });
    tone(c, d, t + 0.04, { type: 'sine', f: 220 * p, f2: 90, glide: 0.35, peak: 0.25, decay: 0.4, vib: { rate: 14, depth: 120, delay: 0.01 } });
    return tone(c, d, t, { type: 'sine', f: 58 * p, f2: 30, glide: 0.5, peak: 0.6, decay: 0.6 });
  }, gap: 0.25, max: 1, pri: 2, vol: 0.9, vary: 1 },
  gumSpit: { fn(c, d, t, p) { // sticky syrup glob: wet pop + splat
    tone(c, d, t, { type: 'sine', f: 520 * p, f2: 160, glide: 0.08, peak: 0.25, decay: 0.1 });
    noise(c, d, t + 0.03, { type: 'bandpass', f: 700, f2: 300, fT: 0.2, q: 2.5, peak: 0.3, decay: 0.25 });
    return noise(c, d, t + 0.05, { pink: true, type: 'lowpass', f: 600, peak: 0.18, decay: 0.3 });
  }, gap: 0.12, max: 2, pri: 1, vol: 0.85, vary: 2 },
};

/** 'boss:attack' name -> sound (merged into bindings.js BOSS_ATTACK). */
export const NEW_BOSS_ATTACK_SFX = {
  frostlane: 'frostFreeze', icewall: 'iceWall', iceBreak: 'iceBreak', icicle: 'icicle', pound: 'frostPound',
  bounce: 'gumSlam', gumjump: 'gumJump', spit: 'gumSpit',
};
