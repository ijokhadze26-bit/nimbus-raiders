// Hero sounds (SPEC2 §3.8). FOUNDATION STUB (owned by the HEROES builder): every hero has its four named
// sounds (ability, ready, guard, select) as simple placeholder tones, pitched per hero. Ability pri 2
// (<= 1.2 s), the rest pri 1 (<= 0.5 s).
import { tone, bell } from './synth.js';

const HEROES = ['pip', 'cinder', 'rime', 'bonbon', 'bolt', 'vex'];
export const HERO_SFX = {};
HEROES.forEach((id, i) => {
  const k = Math.pow(2, (i - 2) / 6);
  HERO_SFX[`hero_${id}_ability`] = { fn(c, d, t) { tone(c, d, t, { type: 'triangle', f: 520 * k, f2: 1040 * k, glide: 0.25, peak: 0.2, decay: 0.35 }); return t + 0.5; }, gap: 0.3, max: 1, pri: 2, vol: 0.8, vary: 0 };
  HERO_SFX[`hero_${id}_ready`] = { fn(c, d, t) { return bell(c, d, t, { f: 1046 * k, ratio: 3, peak: 0.1, decay: 0.3 }); }, gap: 0.3, max: 1, pri: 1, vol: 0.7, vary: 0 };
  HERO_SFX[`hero_${id}_guard`] = { fn(c, d, t) { return tone(c, d, t, { type: 'triangle', f: 520 * k, peak: 0.16, decay: 0.08 }); }, gap: 0.1, max: 2, pri: 1, vol: 0.7, vary: 0.2 };
  HERO_SFX[`hero_${id}_select`] = { fn(c, d, t) { return tone(c, d, t, { type: 'sine', f: 880 * k, f2: 1320 * k, glide: 0.08, peak: 0.14, decay: 0.12 }); }, gap: 0.2, max: 1, pri: 1, vol: 0.7, vary: 0 };
});
