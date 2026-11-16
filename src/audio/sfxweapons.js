// Weapon sounds (SPEC2 §2 "Sound" lines; WEAPONS builder). All synthesized with the shared helpers; every
// weapon has its own timbre so it is recognisable by ear:
//   ember   pink-noise roar loop (bandpass 700 Hz -> 1.2 kHz wobble + crackle clicks, +8% centre per Mk) + 4 kHz sizzle
//   ice     bright FM bell (1800 Hz, ratio 3.5) + 6 kHz "shhk"; hit tick; brittle freeze crack; glassy shatter
//   sugar   sine "bloop" 300 -> 650 Hz; triangle pop + noise splat (major-key pitch rise per bounce); goo wobble
//   prism   two detuned saws 880 / 1320 Hz with fast vibrato; split = quick major arpeggio of bells
//   gear    square 120 Hz + metallic bandpassed noise whirr-clank; ting bell (ratio 2.76); turret thunk + ratchet
//   storm   highpassed noise crack + saw 180 -> 60 Hz; chain arc buzz (60 Hz saw) rising per jump
//   void    sine 70 Hz + sub glide with a slow 0.15 s swell; hole sweep 800 -> 120 Hz + 55 Hz; implosion pop
// Entry format = sfxdefs.js: { fn(ctx, dest, t, pitch, opts) -> end time, loop?(ctx, dest, t, opts) -> {stop(at)},
// gap, max, pri, vol, vary }. Fire sounds: gap >= 0.06, pri 0. Hit sounds: max <= 3.
import { tone, noise, bell, noiseBuffers } from './synth.js';

const fire = (fn, gap = 0.085, vol = 0.75, vary = 0.6) => ({ fn, gap, max: 3, pri: 0, vol, vary });
const mkOf = (o) => Math.max(1, Math.min(5, (o && o.mk) | 0 || 1));
const MAJOR = [1, 1.26, 1.5, 2, 2.52]; // do mi so do' mi' (happy candy pitches)

/** Ember roar: looping pink noise through a wobbling bandpass + sparse highpassed crackle. */
function emberLoop(c, d, t, opts) {
  const nb = noiseBuffers(c), mk = mkOf(opts);
  const centre = 900 * (1 + 0.08 * (mk - 1));
  const src = c.createBufferSource(); src.buffer = nb.pink; src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = centre; bp.Q.value = 0.9;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
  const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.12);
  const lfo = c.createOscillator(); lfo.frequency.value = 0.9; const lg = c.createGain(); lg.gain.value = 250;
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.37; const lg2 = c.createGain(); lg2.gain.value = 900;
  lfo.connect(lg); lg.connect(bp.frequency); lfo2.connect(lg2); lg2.connect(lp.frequency);
  src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(d);
  // crackle: white noise, highpassed, gated by two detuned square LFOs (irregular clicks)
  const cr = c.createBufferSource(); cr.buffer = nb.white; cr.loop = true;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
  const cg = c.createGain(); cg.gain.value = 0;
  const q1 = c.createOscillator(); q1.type = 'square'; q1.frequency.value = 7.3; const qg1 = c.createGain(); qg1.gain.value = 0.03;
  const q2 = c.createOscillator(); q2.type = 'square'; q2.frequency.value = 11.9; const qg2 = c.createGain(); qg2.gain.value = 0.03;
  q1.connect(qg1); qg1.connect(cg.gain); q2.connect(qg2); qg2.connect(cg.gain);
  cr.connect(hp); hp.connect(cg); cg.connect(d);
  const srcs = [src, lfo, lfo2, cr, q1, q2];
  for (const s of srcs) s.start(t, s === src || s === cr ? Math.random() : 0);
  const nodes = [bp, lp, g, lg, lg2, hp, cg, qg1, qg2];
  return {
    stop(at) {
      for (const s of srcs) { try { s.stop(at); } catch { /* stopped */ } }
      setTimeout(() => { for (const n of [...srcs, ...nodes]) { try { n.disconnect(); } catch { /* gone */ } } }, Math.max(0, (at - c.currentTime) * 1000) + 200);
    },
  };
}

export const WEAPON_SFX = {
  // ---------------- Emberstorm ----------------
  wpn_ember_loop: { fn(c, d, t) { return noise(c, d, t, { pink: true, type: 'bandpass', f: 900, q: 0.9, peak: 0.12, decay: 0.25 }); },
    loop: emberLoop, gap: 0.2, max: 1, pri: 0, vol: 0.55, vary: 0 },
  wpn_ember_ignite: fire((c, d, t, p, o) => {
    const mk = mkOf(o);
    noise(c, d, t, { type: 'highpass', f: 4000 * p, f2: 6500, fT: 0.05, q: 1.2, peak: 0.12 + mk * 0.01, decay: 0.06 });
    return noise(c, d, t + 0.005, { type: 'bandpass', f: 1400, q: 2, peak: 0.05, decay: 0.05 });
  }, 0.08, 0.6, 0.9),

  // ---------------- Glacier Lance ----------------
  wpn_ice_fire: fire((c, d, t, p, o) => {
    const mk = mkOf(o);
    bell(c, d, t, { f: 1800 * p * (1 + mk * 0.03), ratio: 3.5, index: 2.2, peak: 0.12, decay: 0.16 });
    return noise(c, d, t, { type: 'highpass', f: 6000, q: 0.8, peak: 0.07, decay: 0.05 });
  }, 0.07, 0.8, 0.7),
  wpn_ice_hit: { fn(c, d, t, p) { return bell(c, d, t, { f: 3100 * p, ratio: 2.1, index: 1, peak: 0.05, decay: 0.06 }); }, gap: 0.05, max: 3, pri: 0, vol: 0.5, vary: 1.2 },
  wpn_ice_freeze: { fn(c, d, t, p) {
    noise(c, d, t, { type: 'highpass', f: 3500, f2: 7000, fT: 0.05, peak: 0.2, decay: 0.08 });
    tone(c, d, t + 0.01, { type: 'sine', f: 2600 * p, f2: 900 * p, glide: 0.22, peak: 0.08, decay: 0.24 });
    return bell(c, d, t + 0.01, { f: 1500 * p, ratio: 3.5, index: 1.5, peak: 0.06, decay: 0.3 });
  }, gap: 0.12, max: 2, pri: 1, vol: 0.6, vary: 0.4 },
  wpn_ice_shatter: { fn(c, d, t, p) {
    noise(c, d, t, { type: 'highpass', f: 5200, peak: 0.18, decay: 0.12 });
    bell(c, d, t, { f: 2700 * p, ratio: 4.1, index: 1.2, peak: 0.05, decay: 0.12 });
    return bell(c, d, t + 0.03, { f: 4100 * p, ratio: 2.9, index: 1, peak: 0.04, decay: 0.1 });
  }, gap: 0.1, max: 2, pri: 1, vol: 0.6, vary: 0.6 },

  // ---------------- Sugar Rush ----------------
  wpn_sugar_fire: fire((c, d, t, p, o) => {
    const k = 1 + (mkOf(o) - 1) * 0.04;
    tone(c, d, t, { type: 'sine', f: 300 * p * k, f2: 650 * p * k, glide: 0.09, peak: 0.22, decay: 0.12 });
    return tone(c, d, t, { type: 'triangle', f: 600 * p * k, f2: 1300 * p * k, glide: 0.09, peak: 0.05, decay: 0.08 });
  }, 0.1, 0.9, 0.5),
  wpn_sugar_pop: { fn(c, d, t, p, o) {
    const k = MAJOR[Math.max(0, Math.min(4, (o && o.n) | 0))] * p;
    tone(c, d, t, { type: 'triangle', f: 220 * k, f2: 90 * k, glide: 0.1, peak: 0.24, decay: 0.12 });
    return noise(c, d, t, { type: 'bandpass', f: 1200 * k, q: 1.5, peak: 0.12, decay: 0.08 });
  }, gap: 0.06, max: 3, pri: 0, vol: 0.7, vary: 0.2 },
  wpn_sugar_goo: { fn(c, d, t, p) {
    tone(c, d, t, { type: 'sine', f: 150 * p, f2: 110 * p, glide: 0.3, peak: 0.1, decay: 0.32, vib: { rate: 9, depth: 60 } });
    return noise(c, d, t, { type: 'lowpass', f: 380, f2: 900, fT: 0.12, q: 4, peak: 0.1, decay: 0.3 });
  }, gap: 0.4, max: 1, pri: 0, vol: 0.55, vary: 0.4 },

  // ---------------- Spectra Prism ----------------
  wpn_prism_fire: fire((c, d, t, p, o) => {
    const k = 1 + (mkOf(o) - 1) * 0.03;
    tone(c, d, t, { type: 'sawtooth', f: 880 * p * k, lp: 3000, peak: 0.07, decay: 0.07, vib: { rate: 38, depth: 45, delay: 0.005 } });
    return tone(c, d, t, { type: 'sawtooth', f: 1320 * p * k, lp: 3400, peak: 0.05, decay: 0.07, detune: 12, vib: { rate: 41, depth: 45, delay: 0.005 } });
  }, 0.07, 0.7, 0.4),
  wpn_prism_split: { fn(c, d, t, p) {
    bell(c, d, t, { f: 1047 * p, ratio: 3, index: 1.2, peak: 0.05, decay: 0.12 });
    bell(c, d, t + 0.04, { f: 1319 * p, ratio: 3, index: 1.2, peak: 0.05, decay: 0.12 });
    return bell(c, d, t + 0.08, { f: 1568 * p, ratio: 3, index: 1.2, peak: 0.05, decay: 0.16 });
  }, gap: 0.06, max: 2, pri: 0, vol: 0.6, vary: 0 },

  // ---------------- Gearworks ----------------
  wpn_gear_fire: fire((c, d, t, p) => {
    tone(c, d, t, { type: 'square', f: 120 * p, f2: 95 * p, glide: 0.08, lp: 900, peak: 0.1, decay: 0.09 });
    noise(c, d, t, { type: 'bandpass', f: 3000, q: 8, peak: 0.12, decay: 0.07 });
    return noise(c, d, t + 0.05, { type: 'bandpass', f: 1800, q: 6, peak: 0.08, decay: 0.03 });
  }, 0.09, 0.75, 0.6),
  wpn_gear_ting: { fn(c, d, t, p) { return bell(c, d, t, { f: 1500 * p, ratio: 2.76, index: 1.6, peak: 0.07, decay: 0.2 }); }, gap: 0.06, max: 3, pri: 0, vol: 0.6, vary: 0.6 },
  wpn_gear_turret: { fn(c, d, t) {
    tone(c, d, t, { type: 'square', f: 90, f2: 55, glide: 0.1, lp: 600, peak: 0.2, decay: 0.15 });
    noise(c, d, t, { type: 'lowpass', f: 500, peak: 0.18, decay: 0.08 });
    let end = t;
    for (let i = 0; i < 4; i++) end = noise(c, d, t + 0.14 + i * 0.055, { type: 'bandpass', f: 2600 + i * 200, q: 6, peak: 0.12, decay: 0.02 });
    return end;
  }, gap: 0.2, max: 1, pri: 1, vol: 0.7, vary: 0 },

  // ---------------- Thunderclap ----------------
  wpn_storm_fire: fire((c, d, t, p, o) => {
    const mk = mkOf(o);
    noise(c, d, t, { type: 'highpass', f: 2600, q: 0.7, peak: 0.16 + mk * 0.01, decay: 0.035 });
    return tone(c, d, t, { type: 'sawtooth', f: 180 * p, f2: 60 * p, glide: 0.09, lp: 2200, lp2: 400, lpT: 0.09, peak: 0.14, decay: 0.1 });
  }, 0.075, 0.75, 0.6),
  wpn_storm_arc: { fn(c, d, t, p, o) {
    const k = 1 + 0.18 * Math.max(0, ((o && o.n) | 0) - 1);
    return tone(c, d, t, { type: 'sawtooth', f: 60 * p * k, f2: 75 * p * k, glide: 0.06, lp: 1400, q: 3, peak: 0.12, decay: 0.06, vib: { rate: 55, depth: 120, delay: 0.002 } });
  }, gap: 0.05, max: 3, pri: 0, vol: 0.6, vary: 0.4 },

  // ---------------- Void Siphon ----------------
  wpn_void_fire: fire((c, d, t, p, o) => {
    const k = 1 - (mkOf(o) - 1) * 0.03;
    tone(c, d, t, { type: 'sine', f: 70 * p * k, a: 0.15, peak: 0.32, decay: 0.28 });
    return tone(c, d, t, { type: 'sine', f: 140 * p * k, f2: 38, glide: 0.35, a: 0.15, peak: 0.16, decay: 0.3, lp: 600 });
  }, 0.2, 0.65, 0.3),
  wpn_void_hole: { fn(c, d, t, p) {
    tone(c, d, t, { type: 'sine', f: 55 * p, peak: 0.16, decay: 0.45 });
    return noise(c, d, t, { type: 'lowpass', f: 800, f2: 120, fT: 0.45, q: 3, peak: 0.13, decay: 0.48 });
  }, gap: 0.3, max: 2, pri: 0, vol: 0.6, vary: 0.3 },
  wpn_void_pop: { fn(c, d, t, p) {
    tone(c, d, t, { type: 'sine', f: 420 * p, f2: 60 * p, glide: 0.08, peak: 0.16, decay: 0.09 });
    return noise(c, d, t, { type: 'lowpass', f: 1600, f2: 200, fT: 0.07, peak: 0.08, decay: 0.07 });
  }, gap: 0.12, max: 2, pri: 0, vol: 0.55, vary: 0.4 },
};
