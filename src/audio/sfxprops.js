// Sounds of the stage 4 road objects (game/props), merged into SFX by sfxdefs.js and played through the
// 'hazard:sfx' event: crane hook snapping + crate thud, dam gate bursting + flood, the big bell, a boulder
// starting to roll.
import { tone, noise, bell } from './synth.js';
import { kick } from './instruments.js';

export const PROP_SFX = {
  propCreak: { fn(c, d, t, p) { // the hook lets go: metal clank + cable whip
    tone(c, d, t, { type: 'square', f: 420 * p, f2: 180, glide: 0.12, lp: 2200, peak: 0.16, decay: 0.16 });
    noise(c, d, t, { type: 'highpass', f: 3000, f2: 7000, fT: 0.2, peak: 0.16, decay: 0.22 });
    return bell(c, d, t + 0.02, { f: 900 * p, ratio: 2.4, index: 1.2, peak: 0.08, decay: 0.3 });
  }, gap: 0.2, max: 2, pri: 1, vol: 0.8, vary: 1 },
  propThud: { fn(c, d, t, p) { // heavy crate lands: deep boom + splintering wood
    kick(c, d, t, 1, true);
    tone(c, d, t, { type: 'sine', f: 70 * p, f2: 30, glide: 0.5, peak: 0.75, decay: 0.6 });
    noise(c, d, t, { pink: true, type: 'lowpass', f: 1600, f2: 140, fT: 0.4, peak: 0.5, decay: 0.5 });
    return noise(c, d, t + 0.03, { type: 'bandpass', f: 1300, q: 2, peak: 0.22, decay: 0.22 });
  }, gap: 0.25, max: 2, pri: 2, vol: 0.9, vary: 1 },
  propSplash: { fn(c, d, t, p) { // gate bursts, the flood rushes out
    tone(c, d, t, { type: 'triangle', f: 260 * p, f2: 90, glide: 0.15, peak: 0.25, decay: 0.2 });
    noise(c, d, t, { type: 'bandpass', f: 900, f2: 2400, fT: 0.3, q: 1.2, peak: 0.4, decay: 0.45 });
    noise(c, d, t + 0.1, { pink: true, type: 'lowpass', f: 2600, f2: 500, fT: 1.6, peak: 0.3, decay: 1.8 });
    return t + 1.9;
  }, gap: 0.3, max: 1, pri: 2, vol: 0.85, vary: 1 },
  propBell: { fn(c, d, t, p) { // the big bell: low bronze strike with long shimmering partials
    bell(c, d, t, { f: 196 * p, ratio: 2.0, index: 3.2, peak: 0.42, decay: 2.6 });
    bell(c, d, t, { f: 392 * p, ratio: 2.76, index: 1.6, peak: 0.2, decay: 2.0, pan: -0.25 });
    bell(c, d, t + 0.01, { f: 588 * p, ratio: 3.1, index: 1.1, peak: 0.12, decay: 1.6, pan: 0.25 });
    tone(c, d, t, { type: 'sine', f: 98 * p, peak: 0.35, decay: 2.2 });
    noise(c, d, t, { type: 'bandpass', f: 2600, q: 3, peak: 0.12, decay: 0.08 });
    return t + 2.7;
  }, gap: 0.5, max: 1, pri: 2, vol: 0.9, vary: 0.3 },
  propRoll: { fn(c, d, t, p) { // shove + the boulder starts to roll
    kick(c, d, t, 0.6, true);
    noise(c, d, t, { pink: true, type: 'lowpass', f: 500, f2: 260, fT: 1.0, peak: 0.45, decay: 1.2 });
    return tone(c, d, t, { type: 'sine', f: 55 * p, f2: 40, glide: 1.0, peak: 0.4, decay: 1.2 });
  }, gap: 0.4, max: 1, pri: 1, vol: 0.85, vary: 1 },
};
