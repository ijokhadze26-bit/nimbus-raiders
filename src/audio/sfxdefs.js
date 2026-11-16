// Synthesized sound effects. Each entry: fn(ctx, dest, t, pitch, opts) -> end time, plus engine
// hints: gap (min s between starts), max (voices of this sound), pri (0 spam .. 2 key moment),
// vol, vary (random pitch +-semitones), steal (false = skip instead of stealing when capped).
import { tone, noise, bell, mtof } from './synth.js';
import { BOSS_SFX } from './sfxboss.js';
import { NEW_BOSS_SFX } from './sfxbossnew.js';
import { WEAPON_SFX } from './sfxweapons.js';
import { HERO_SFX } from './sfxheroes.js';
import { winStinger, loseStinger } from './instruments.js';

const fire = (fn, gap, vol) => ({ fn, gap, max: 3, pri: 0, vol, vary: 0.8 });

export const SFX = {
  // ---------------- weapons (one per tier, clearly different) ----------------
  fire1: fire((c, d, t, p) => { // Blaster Pistol: round little "pop"
    tone(c, d, t, { type: 'square', f: 880 * p, f2: 240 * p, glide: 0.05, lp: 3000, lp2: 900, lpT: 0.05, peak: 0.16, decay: 0.06 });
    tone(c, d, t, { type: 'sine', f: 320 * p, f2: 110 * p, glide: 0.06, peak: 0.3, decay: 0.08 });
    return noise(c, d, t, { type: 'bandpass', f: 2600, q: 1.3, peak: 0.1, decay: 0.022 });
  }, 0.085, 0.75),
  fire2: fire((c, d, t, p) => { // Storm Rifle: dry "crack" with a thump
    noise(c, d, t, { type: 'highpass', f: 2000 * p, f2: 900, fT: 0.06, peak: 0.3, decay: 0.065 });
    noise(c, d, t, { pink: true, type: 'lowpass', f: 1100, peak: 0.22, decay: 0.11 });
    return tone(c, d, t, { type: 'triangle', f: 200 * p, f2: 62, glide: 0.08, peak: 0.34, decay: 0.1 });
  }, 0.09, 0.7),
  fire3: fire((c, d, t, p) => { // Rapid Laser: classic falling "pew"
    tone(c, d, t, { type: 'square', f: 1650 * p, f2: 360 * p, glide: 0.1, lp: 4200, lp2: 1300, lpT: 0.1, peak: 0.13, decay: 0.11 });
    return tone(c, d, t, { type: 'sine', f: 2300 * p, f2: 520 * p, glide: 0.09, peak: 0.14, decay: 0.1, detune: 8 });
  }, 0.06, 1.0),
  fire4: fire((c, d, t, p) => { // Beam Cannon: resonant "whum"
    tone(c, d, t, { type: 'sawtooth', f: 150 * p, f2: 72 * p, glide: 0.24, lp: 2400, lp2: 220, lpT: 0.24, q: 5, peak: 0.2, decay: 0.26 });
    tone(c, d, t, { type: 'sawtooth', f: 151.5 * p, f2: 73 * p, glide: 0.24, lp: 2000, lp2: 220, lpT: 0.24, q: 5, peak: 0.14, decay: 0.26, detune: 14 });
    return tone(c, d, t, { type: 'sine', f: 80 * p, f2: 46, glide: 0.28, peak: 0.34, decay: 0.3 });
  }, 0.14, 0.62),
  fire5: fire((c, d, t, p) => { // Plasma Scatter: bubbly rising "blip"
    tone(c, d, t, { type: 'sine', f: 520 * p, f2: 1250 * p, glide: 0.07, peak: 0.24, decay: 0.12 });
    tone(c, d, t, { type: 'triangle', f: 780 * p, f2: 1870 * p, glide: 0.07, peak: 0.08, decay: 0.09, pan: 0.2 });
    return noise(c, d, t, { type: 'bandpass', f: 4200, q: 2, peak: 0.05, decay: 0.03 });
  }, 0.1, 0.95),
  fire6: fire((c, d, t, p) => { // Nova Lance: deep "boom" with a shimmering ring
    tone(c, d, t, { type: 'sine', f: 170 * p, f2: 40, glide: 0.32, peak: 0.5, decay: 0.38 });
    noise(c, d, t, { pink: true, type: 'lowpass', f: 1900, f2: 160, fT: 0.35, peak: 0.3, decay: 0.38 });
    tone(c, d, t, { type: 'square', f: 330 * p, f2: 85, glide: 0.12, lp: 1300, peak: 0.08, decay: 0.14 });
    return bell(c, d, t + 0.01, { f: 1560 * p, ratio: 1.5, index: 1.1, peak: 0.06, decay: 0.45 });
  }, 0.2, 0.5),

  // ---------------- horde ----------------
  pop: { fn(c, d, t, p) { // squishy goo pop
    tone(c, d, t, { type: 'sine', f: 190 * p, f2: 560 * p, glide: 0.055, peak: 0.34, decay: 0.09 });
    noise(c, d, t, { type: 'bandpass', f: 950 * p, f2: 320, fT: 0.07, q: 3.5, peak: 0.16, decay: 0.07 });
    return tone(c, d, t + 0.01, { type: 'triangle', f: 720 * p, f2: 300 * p, glide: 0.05, peak: 0.07, decay: 0.05 });
  }, gap: 0.035, max: 5, pri: 0, vol: 0.7, vary: 3 },
  explode: { fn(c, d, t, p) { // fizzbomb blast
    noise(c, d, t, { pink: true, type: 'lowpass', f: 2600 * p, f2: 120, fT: 0.55, peak: 0.6, decay: 0.6 });
    tone(c, d, t, { type: 'sine', f: 115 * p, f2: 32, glide: 0.45, peak: 0.65, decay: 0.5 });
    return noise(c, d, t, { type: 'highpass', f: 3200, peak: 0.16, decay: 0.07 });
  }, gap: 0.07, max: 3, pri: 1, vol: 0.8, vary: 2 },
  horde: { fn(c, d, t) { // distant goo rumble when a horde comes into view
    noise(c, d, t, { pink: true, type: 'bandpass', f: 260, f2: 700, fT: 0.7, q: 1.2, a: 0.35, peak: 0.25, decay: 0.5 });
    tone(c, d, t, { type: 'sawtooth', f: 58, f2: 70, glide: 0.8, lp: 300, a: 0.3, peak: 0.12, decay: 0.6 });
    return tone(c, d, t + 0.1, { type: 'sine', f: 140, f2: 95, glide: 0.6, vib: { rate: 9, depth: 60, delay: 0.05 }, a: 0.2, peak: 0.1, decay: 0.5 });
  }, gap: 2.5, max: 1, pri: 1, vol: 0.7, vary: 1 },

  // ---------------- gates ----------------
  gateTick: { fn(c, d, t, p, o) { // pitch climbs with the gate value
    const f = tickFreq(o);
    tone(c, d, t, { type: 'triangle', f, peak: 0.22, decay: 0.055 });
    return tone(c, d, t, { type: 'sine', f: f * 2, peak: 0.06, decay: 0.035 });
  }, gap: 0.045, max: 4, pri: 0, vol: 0.7, vary: 0 },
  gateGood: { fn(c, d, t, p, o) { // bright rising arpeggio (bigger gain = longer run)
    const notes = o.big ? [72, 76, 79, 84, 88] : [72, 76, 79, 84];
    const s = 0.05;
    notes.forEach((m, i) => {
      tone(c, d, t + i * s, { type: 'square', f: mtof(m), lp: 3400, peak: 0.15, decay: 0.16 });
      tone(c, d, t + i * s, { type: 'triangle', f: mtof(m + 12), peak: 0.12, decay: 0.12 });
    });
    noise(c, d, t, { type: 'bandpass', f: 2500, f2: 8000, fT: 0.25, q: 1.5, peak: 0.05, a: 0.1, decay: 0.12 });
    return bell(c, d, t + notes.length * s, { f: mtof(notes[notes.length - 1] + 12), ratio: 2, index: 1, peak: 0.16, decay: 0.5 });
  }, gap: 0.15, max: 2, pri: 2, vol: 1.0, vary: 0 },
  gateBad: { fn(c, d, t) { // descending wobbly buzz
    tone(c, d, t, { type: 'sawtooth', f: 330, f2: 105, glide: 0.42, lp: 1500, lp2: 500, lpT: 0.4, peak: 0.16, decay: 0.15, sus: 0.7, dur: 0.38, rel: 0.08, vib: { rate: 12, depth: 50, delay: 0.02 } });
    tone(c, d, t, { type: 'sawtooth', f: 326, f2: 103, glide: 0.42, lp: 1500, lp2: 500, lpT: 0.4, peak: 0.12, decay: 0.15, sus: 0.7, dur: 0.38, rel: 0.08, detune: -22 });
    return tone(c, d, t, { type: 'square', f: 150, f2: 70, glide: 0.2, lp: 700, peak: 0.12, decay: 0.2 });
  }, gap: 0.15, max: 2, pri: 2, vol: 0.7, vary: 0 },

  // ---------------- barrels ----------------
  clank: { fn(c, d, t, p) { // metal barrel hit
    tone(c, d, t, { type: 'square', f: 520 * p, lp: 2600, peak: 0.08, decay: 0.07 });
    tone(c, d, t, { type: 'square', f: 1368 * p, lp: 5200, peak: 0.045, decay: 0.05 });
    tone(c, d, t, { type: 'sine', f: 215 * p, f2: 165 * p, glide: 0.06, peak: 0.15, decay: 0.09 });
    return noise(c, d, t, { type: 'bandpass', f: 3300, q: 4, peak: 0.13, decay: 0.03 });
  }, gap: 0.045, max: 4, pri: 0, vol: 0.6, vary: 1.5 },
  barrelBreak: { fn(c, d, t, p, o) { // boom + debris + reward chime
    noise(c, d, t, { pink: true, type: 'lowpass', f: 3000, f2: 150, fT: 0.45, peak: 0.55, decay: 0.5 });
    tone(c, d, t, { type: 'sine', f: 130, f2: 38, glide: 0.35, peak: 0.6, decay: 0.42 });
    noise(c, d, t + 0.02, { type: 'bandpass', f: 1800, q: 6, peak: 0.12, decay: 0.2 });
    tone(c, d, t, { type: 'square', f: 610, f2: 420, glide: 0.2, lp: 2400, peak: 0.05, decay: 0.2 });
    const kind = o.kind || 'troops';
    const base = kind === 'weapon' ? 79 : kind === 'coins' ? 84 : 76;
    [0, 4, 7, 12].forEach((iv, i) => bell(c, d, t + 0.16 + i * 0.065, { f: mtof(base + iv), ratio: 2, index: 0.8, peak: 0.09, decay: 0.45, pan: (i - 1.5) * 0.2 }));
    return t + 0.9;
  }, gap: 0.1, max: 2, pri: 2, vol: 0.85, vary: 0.5 },

  // ---------------- squad ----------------
  oof: { fn(c, d, t, p) { // soft little "oof" when a raider is lost
    tone(c, d, t, { type: 'sine', f: 430 * p, f2: 170 * p, glide: 0.12, peak: 0.2, decay: 0.13 });
    tone(c, d, t, { type: 'triangle', f: 860 * p, f2: 330 * p, glide: 0.08, peak: 0.05, decay: 0.08 });
    return noise(c, d, t, { type: 'bandpass', f: 720 * p, f2: 420, fT: 0.08, q: 5, peak: 0.08, decay: 0.08 });
  }, gap: 0.05, max: 3, pri: 0, vol: 0.7, vary: 2.5 },
  troops: { fn(c, d, t) { // "+N" troops reward: cheerful double chirp
    tone(c, d, t, { type: 'square', f: mtof(79), lp: 3500, peak: 0.16, decay: 0.08 });
    tone(c, d, t + 0.07, { type: 'square', f: mtof(84), lp: 3500, peak: 0.16, decay: 0.14 });
    return bell(c, d, t + 0.07, { f: mtof(91), ratio: 2, index: 0.7, peak: 0.12, decay: 0.4 });
  }, gap: 0.12, max: 2, pri: 1, vol: 0.8, vary: 0 },
  slice: { fn(c, d, t, p) { // blade swish
    noise(c, d, t, { type: 'bandpass', f: 1500 * p, f2: 5200, fT: 0.12, q: 2, a: 0.03, peak: 0.45, decay: 0.12 });
    return tone(c, d, t, { type: 'sawtooth', f: 900 * p, f2: 1500 * p, glide: 0.08, lp: 3000, peak: 0.04, decay: 0.1 });
  }, gap: 0.12, max: 2, pri: 0, vol: 0.7, vary: 2 },
  fall: { fn(c, d, t, p) { // falling whistle into the clouds
    return tone(c, d, t, { type: 'sine', f: 1300 * p, f2: 320 * p, glide: 0.6, lin: true, peak: 0.12, decay: 0.2, sus: 0.8, dur: 0.5, rel: 0.15 });
  }, gap: 0.2, max: 2, pri: 0, vol: 0.7, vary: 1.5 },

  // ---------------- pickups / powers / helpers ----------------
  coin: { fn(c, d, t, p, o) { // bright two-note ding; o.chain raises it for streaks
    const up = Math.pow(2, Math.min(8, o.chain || 0) / 12);
    const f1 = 988 * up * p, f2 = 1319 * up * p;
    tone(c, d, t, { type: 'square', f: f1, lp: 6000, peak: 0.06, decay: 0.06 });
    tone(c, d, t, { type: 'sine', f: f1, peak: 0.1, decay: 0.06 });
    tone(c, d, t + 0.055, { type: 'square', f: f2, lp: 6000, peak: 0.055, decay: 0.22 });
    return tone(c, d, t + 0.055, { type: 'sine', f: f2, peak: 0.12, decay: 0.28 });
  }, gap: 0.045, max: 4, pri: 0, vol: 0.85, vary: 0 },
  coins: { fn(c, d, t, p, o) { // a little cascade for a pile
    const n = Math.max(3, Math.min(7, Math.round((o.amount || 10) / 6)));
    let end = t;
    for (let i = 0; i < n; i++) {
      const f = mtof(83 + [0, 5, 9, 12, 7, 12, 16][i]);
      tone(c, d, t + i * 0.055, { type: 'square', f, lp: 6000, peak: 0.05, decay: 0.08 });
      end = tone(c, d, t + i * 0.055, { type: 'sine', f: f * 1.335, peak: 0.08, decay: 0.2 });
    }
    return end;
  }, gap: 0.15, max: 2, pri: 1, vol: 0.7, vary: 0 },
  powerUp: { fn(c, d, t) { // sweep + sparkle arpeggio
    tone(c, d, t, { type: 'sine', f: 420, f2: 1680, glide: 0.24, peak: 0.16, decay: 0.26 });
    tone(c, d, t, { type: 'triangle', f: 630, f2: 2520, glide: 0.24, peak: 0.06, decay: 0.22, pan: 0.3 });
    [84, 88, 91, 96].forEach((m, i) => bell(c, d, t + 0.12 + i * 0.05, { f: mtof(m), ratio: 3, index: 0.7, peak: 0.07, decay: 0.35, pan: (i - 1.5) * 0.25 }));
    return t + 0.7;
  }, gap: 0.12, max: 2, pri: 1, vol: 0.8, vary: 0 },
  shield: { fn(c, d, t) { // bubble forms: soft whoosh into a warm chord
    noise(c, d, t, { type: 'bandpass', f: 500, f2: 3000, fT: 0.35, q: 1.5, a: 0.2, peak: 0.12, decay: 0.3 });
    [55, 62, 67, 74].forEach((m, i) => tone(c, d, t + i * 0.03, { type: 'triangle', f: mtof(m), a: 0.08, peak: 0.07, decay: 0.3, sus: 0.6, dur: 0.6, rel: 0.4, vib: { rate: 4, depth: 12 } }));
    return t + 1.3;
  }, loop(c, d, t) { // quiet shimmering hum while the shield lasts
    const a = c.createOscillator(), b = c.createOscillator(), trem = c.createOscillator(), tg = c.createGain(), g = c.createGain();
    a.type = 'sine'; a.frequency.value = 196; b.type = 'triangle'; b.frequency.value = 294.5;
    trem.frequency.value = 3.2; tg.gain.value = 0.015;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6);
    trem.connect(tg); tg.connect(g.gain); a.connect(g); b.connect(g); g.connect(d);
    a.start(t); b.start(t); trem.start(t);
    return { stop(at) { a.stop(at); b.stop(at); trem.stop(at); } };
  }, gap: 0.3, max: 1, pri: 1, vol: 0.85, vary: 0 },
  freeze: { fn(c, d, t) { // icy crack + glassy tinkles
    noise(c, d, t, { type: 'highpass', f: 5200, peak: 0.28, decay: 0.12 });
    noise(c, d, t + 0.02, { type: 'bandpass', f: 1400, f2: 7000, fT: 0.3, q: 4, peak: 0.1, decay: 0.3 });
    tone(c, d, t, { type: 'sine', f: 1900, f2: 620, glide: 0.4, peak: 0.07, decay: 0.42 });
    [2637, 3520, 2093, 3136].forEach((f, i) => bell(c, d, t + 0.04 + i * 0.06, { f, ratio: 2.76, index: 0.9, peak: 0.06, decay: 0.3, pan: (i % 2 ? 0.4 : -0.4) }));
    return t + 0.75;
  }, gap: 0.3, max: 1, pri: 1, vol: 0.8, vary: 0 },
  rapid: { fn(c, d, t) { // rapid fire: quick ascending zips
    for (let i = 0; i < 4; i++) tone(c, d, t + i * 0.06, { type: 'square', f: 500 + i * 220, f2: 1400 + i * 300, glide: 0.05, lp: 4000, peak: 0.06, decay: 0.06 });
    return t + 0.35;
  }, gap: 0.3, max: 1, pri: 1, vol: 0.8, vary: 0 },
  magnet: { fn(c, d, t) { // wobbly magnetic sweep
    return tone(c, d, t, { type: 'sine', f: 300, f2: 900, glide: 0.4, peak: 0.13, decay: 0.15, sus: 0.7, dur: 0.4, rel: 0.15, vib: { rate: 14, depth: 90, delay: 0.01 } });
  }, gap: 0.3, max: 1, pri: 1, vol: 0.8, vary: 0 },
  powerDown: { fn(c, d, t) {
    tone(c, d, t, { type: 'triangle', f: 990, f2: 440, glide: 0.18, peak: 0.08, decay: 0.2 });
    return tone(c, d, t + 0.09, { type: 'triangle', f: 660, f2: 330, glide: 0.18, peak: 0.07, decay: 0.22 });
  }, gap: 0.2, max: 2, pri: 1, vol: 0.7, vary: 0 },
  helper: { fn(c, d, t) { // drone/turret joins: servo whirr + two robot chirps
    tone(c, d, t, { type: 'sawtooth', f: 180, f2: 420, glide: 0.2, lp: 1200, peak: 0.06, decay: 0.22 });
    tone(c, d, t + 0.16, { type: 'square', f: 1180, lp: 4000, peak: 0.06, decay: 0.05 });
    return tone(c, d, t + 0.24, { type: 'square', f: 1570, lp: 4000, peak: 0.06, decay: 0.08 });
  }, gap: 0.2, max: 2, pri: 1, vol: 0.8, vary: 0 },
  tierUp: { fn(c, d, t, p, o) { // weapon upgrade: power chord swell + rising run
    const root = 60 + Math.min(6, o.tier || 2) * 2;
    noise(c, d, t, { type: 'bandpass', f: 800, f2: 9000, fT: 0.35, q: 1.2, a: 0.3, peak: 0.1, decay: 0.1 });
    [0, 7, 12].forEach((iv) => tone(c, d, t + 0.05, { type: 'sawtooth', f: mtof(root + iv - 12), lp: 900, lp2: 3200, lpT: 0.3, a: 0.02, peak: 0.112, decay: 0.2, sus: 0.6, dur: 0.45, rel: 0.2 }));
    [0, 4, 7, 12, 16].forEach((iv, i) => tone(c, d, t + 0.05 + i * 0.045, { type: 'square', f: mtof(root + iv + 12), lp: 4500, peak: 0.096, decay: 0.12 }));
    return bell(c, d, t + 0.3, { f: mtof(root + 24), ratio: 2, index: 1, peak: 0.08, decay: 0.6 });
  }, gap: 0.2, max: 1, pri: 2, vol: 1.0, vary: 0 },

  // ---------------- UI ----------------
  click: { fn(c, d, t) {
    tone(c, d, t, { type: 'sine', f: 1250, f2: 620, glide: 0.035, peak: 0.24, decay: 0.05 });
    return tone(c, d, t, { type: 'triangle', f: 2500, peak: 0.04, decay: 0.02 });
  }, gap: 0.04, max: 2, pri: 2, vol: 0.8, vary: 0.4 },
  hover: { fn(c, d, t) { return tone(c, d, t, { type: 'sine', f: 1800, peak: 0.06, decay: 0.03 }); }, gap: 0.05, max: 1, pri: 0, vol: 0.6, vary: 0.3 },
  back: { fn(c, d, t) { return tone(c, d, t, { type: 'sine', f: 700, f2: 420, glide: 0.06, peak: 0.2, decay: 0.07 }); }, gap: 0.05, max: 1, pri: 2, vol: 0.8, vary: 0 },
  star: { fn(c, d, t, p, o) { // rising per star (index 0,1,2)
    const i = Math.max(0, Math.min(2, o.index || 0));
    const m = [84, 88, 91][i];
    noise(c, d, t, { type: 'bandpass', f: 3000, f2: 9000, fT: 0.2, q: 1.5, peak: 0.06, decay: 0.15 });
    bell(c, d, t, { f: mtof(m), ratio: 2, index: 1.2, peak: 0.16, decay: 0.9 });
    bell(c, d, t + 0.04, { f: mtof(m + 12), ratio: 3, index: 0.6, peak: 0.07, decay: 0.6 });
    tone(c, d, t, { type: 'triangle', f: mtof(m - 12), peak: 0.1, decay: 0.4 });
    return t + 1;
  }, gap: 0.08, max: 3, pri: 2, vol: 0.9, vary: 0 },
  purchase: { fn(c, d, t) { // "ka-ching" + happy chord
    noise(c, d, t, { type: 'bandpass', f: 5200, q: 2, peak: 0.12, decay: 0.06 });
    bell(c, d, t + 0.02, { f: 2637, ratio: 1.41, index: 1.5, peak: 0.1, decay: 0.5 });
    bell(c, d, t + 0.09, { f: 3520, ratio: 1.41, index: 1.2, peak: 0.08, decay: 0.6 });
    [72, 76, 79].forEach((m) => tone(c, d, t + 0.12, { type: 'triangle', f: mtof(m), peak: 0.08, decay: 0.3, sus: 0.4, dur: 0.3, rel: 0.25 }));
    return t + 0.9;
  }, gap: 0.12, max: 2, pri: 2, vol: 0.85, vary: 0 },
  deny: { fn(c, d, t) { return tone(c, d, t, { type: 'square', f: 180, lp: 900, peak: 0.12, decay: 0.08, sus: 0.6, dur: 0.15, rel: 0.05 }); }, gap: 0.12, max: 1, pri: 2, vol: 0.8, vary: 0 },
  daily: { fn(c, d, t) { // daily reward claim: sparkly fanfare
    [72, 76, 79, 84, 88, 91].forEach((m, i) => bell(c, d, t + i * 0.06, { f: mtof(m), ratio: 2, index: 0.9, peak: 0.08, decay: 0.5, pan: (i - 2.5) * 0.15 }));
    return t + 1;
  }, gap: 0.3, max: 1, pri: 2, vol: 0.85, vary: 0 },

  // ---------------- stingers ----------------
  win: { fn(c, d, t) { return winStinger(c, d, t); }, gap: 1, max: 1, pri: 2, vol: 0.7, vary: 0 },
  lose: { fn(c, d, t) { return loseStinger(c, d, t); }, gap: 1, max: 1, pri: 2, vol: 0.75, vary: 0 },

  ...BOSS_SFX,
  ...NEW_BOSS_SFX,
  ...WEAPON_SFX,
  ...HERO_SFX,
};

/** Gate tick pitch: add gates climb with value (-24..+40), x/÷ rungs map to a step ladder. */
function tickFreq(o) {
  let st;
  if (o.op === 'mul') st = 8 + (o.value || 2) * 3;
  else if (o.op === 'div') st = -2 - (o.value || 2) * 3;
  else st = Math.max(-24, Math.min(40, o.value || 0)) * 0.5;
  return 660 * Math.pow(2, st / 12);
}
