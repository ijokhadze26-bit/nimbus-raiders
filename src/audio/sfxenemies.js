// Sounds of the update-3 Murklings (stage 3 "enemies"), merged into SFX by sfxdefs.js; bindEnemies (called by
// bindings.js) maps their events: Boomling swell (the burst itself is the shared 'explode'), Mendling heal
// pulse, Broodling Hive pop, Spitling spit + splat, Flapling dive, and the horde wave rush roar.
import { tone, noise } from './synth.js';

export const ENEMY_SFX = {
  swell: { fn(c, d, t, p) { // Boomling puffing up: rising rubbery squeak + hiss
    tone(c, d, t, { type: 'triangle', f: 220 * p, f2: 880 * p, glide: 0.36, peak: 0.22, decay: 0.38, vib: { rate: 30, depth: 40, delay: 0.05 } });
    return noise(c, d, t, { type: 'highpass', f: 2200, f2: 5200, fT: 0.35, peak: 0.08, decay: 0.38 });
  }, gap: 0.08, max: 3, pri: 1, vol: 0.7, vary: 2 },
  heal: { fn(c, d, t, p) { // Mendling pulse: soft rising chime
    tone(c, d, t, { type: 'sine', f: 660 * p, f2: 990 * p, glide: 0.18, peak: 0.12, decay: 0.32 });
    return tone(c, d, t + 0.06, { type: 'sine', f: 1320 * p, peak: 0.06, decay: 0.28 });
  }, gap: 0.35, max: 2, pri: 0, vol: 0.55, vary: 1 },
  brood: { fn(c, d, t, p) { // Hive pops a Murkling out: wet plop
    tone(c, d, t, { type: 'sine', f: 320 * p, f2: 120 * p, glide: 0.09, peak: 0.28, decay: 0.12 });
    return noise(c, d, t, { type: 'bandpass', f: 600 * p, q: 4, peak: 0.12, decay: 0.08 });
  }, gap: 0.12, max: 3, pri: 0, vol: 0.6, vary: 2 },
  spit: { fn(c, d, t, p) { // Spitling lobs goo: throaty "ptoo"
    noise(c, d, t, { type: 'bandpass', f: 900 * p, f2: 400, fT: 0.12, q: 2.5, peak: 0.22, decay: 0.14 });
    return tone(c, d, t, { type: 'sine', f: 260 * p, f2: 520 * p, glide: 0.08, peak: 0.18, decay: 0.12 });
  }, gap: 0.12, max: 3, pri: 1, vol: 0.7, vary: 2 },
  splat: { fn(c, d, t, p) { // goo lands
    noise(c, d, t, { pink: true, type: 'lowpass', f: 1600 * p, f2: 200, fT: 0.2, peak: 0.32, decay: 0.22 });
    return tone(c, d, t, { type: 'sine', f: 140 * p, f2: 60, glide: 0.15, peak: 0.25, decay: 0.18 });
  }, gap: 0.1, max: 3, pri: 1, vol: 0.75, vary: 2 },
  dive: { fn(c, d, t, p) { // Flapling dives: falling whistle
    return tone(c, d, t, { type: 'triangle', f: 1400 * p, f2: 500 * p, glide: 0.3, peak: 0.1, decay: 0.3 });
  }, gap: 0.15, max: 2, pri: 0, vol: 0.55, vary: 2 },
  rush: { fn(c, d, t) { // a held wave charges: low roar + war-drum thump
    noise(c, d, t, { pink: true, type: 'bandpass', f: 300, f2: 900, fT: 0.5, q: 1.1, peak: 0.3, decay: 0.7 });
    tone(c, d, t, { type: 'sawtooth', f: 70, f2: 55, glide: 0.6, lp: 380, peak: 0.16, decay: 0.7 });
    return tone(c, d, t, { type: 'sine', f: 90, f2: 40, glide: 0.25, peak: 0.45, decay: 0.3 });
  }, gap: 1.2, max: 1, pri: 2, vol: 0.75, vary: 1 },
};

export function bindEnemies(audio, game) {
  const ev = game.events, offs = [];
  const on = (name, snd, opts) => offs.push(ev.on(name, () => audio.fx(snd, opts)));
  on('enemy:swell', 'swell');
  on('enemy:heal', 'heal');
  on('enemy:spawn', 'brood');
  on('enemy:spit', 'spit');
  on('enemy:splat', 'splat');
  on('enemy:dive', 'dive');
  offs.push(ev.on('horde:rush', (p) => { if (p && p.count >= 10) audio.fx('rush', null); }));
  return offs;
}
