// Boss + telegraph sound effects (merged into SFX by sfxdefs.js).
import { tone, noise, bell, mtof, softClipCurve } from './synth.js';
import { brass, crash, kick, riser } from './instruments.js';

/** Detuned-saw growl with pitch/filter arcs through a soft clipper. */
function roar(c, d, t, p, len = 1.5, f0 = 78) {
  const shaper = c.createWaveShaper();
  shaper.curve = softClipCurve(2.2);
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass'; flt.Q.value = 5;
  flt.frequency.setValueAtTime(320, t);
  flt.frequency.linearRampToValueAtTime(1700, t + len * 0.25);
  flt.frequency.exponentialRampToValueAtTime(380, t + len);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32, t + 0.12);
  g.gain.setTargetAtTime(0.22, t + 0.3, 0.3);
  g.gain.setTargetAtTime(0, t + len * 0.8, len * 0.08);
  shaper.connect(flt); flt.connect(g); g.connect(d);
  const oscs = [];
  for (const det of [-0.012, 0, 0.011, 0.5]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const f = f0 * p * (1 + det);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.3, t + len * 0.25);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + len);
    const og = c.createGain(); og.gain.value = det === 0.5 ? 0.12 : 0.28;
    o.connect(og); og.connect(shaper);
    o.start(t); o.stop(t + len + 0.1);
    oscs.push(o, og);
  }
  oscs[0].onended = () => { for (const n of [...oscs, shaper, flt, g]) { try { n.disconnect(); } catch { /* */ } } };
  noise(c, d, t, { pink: true, type: 'bandpass', f: 600, f2: 1400, fT: len * 0.3, q: 2, a: 0.1, peak: 0.16, decay: 0.3, sus: 0.6, dur: len * 0.7, rel: 0.3 });
  return t + len + 0.1;
}

function rumble(c, d, t, p, len = 1) {
  tone(c, d, t, { type: 'sine', f: 68 * p, f2: 28, glide: len * 0.85, peak: 0.75, decay: len * 0.9 });
  noise(c, d, t, { pink: true, type: 'lowpass', f: 650, f2: 80, fT: len, peak: 0.55, decay: len * 1.1 });
  return tone(c, d, t, { type: 'triangle', f: 140 * p, f2: 48, glide: 0.3, peak: 0.28, decay: 0.32 });
}

export const BOSS_SFX = {
  bossHit: { fn(c, d, t, p) { // dull stony thud on boss hits
    tone(c, d, t, { type: 'sine', f: 150 * p, f2: 92, glide: 0.05, peak: 0.22, decay: 0.07 });
    return noise(c, d, t, { pink: true, type: 'lowpass', f: 900, peak: 0.1, decay: 0.05 });
  }, gap: 0.075, max: 3, pri: 0, vol: 0.6, vary: 2 },
  shieldHit: { fn(c, d, t, p) { // energy shield absorbs a bullet
    return bell(c, d, t, { f: 2200 * p, ratio: 2.3, index: 0.8, peak: 0.12, decay: 0.12 });
  }, gap: 0.06, max: 3, pri: 0, vol: 0.8, vary: 1.5 },
  shieldBreak: { fn(c, d, t) {
    noise(c, d, t, { type: 'highpass', f: 3000, peak: 0.25, decay: 0.2 });
    [3136, 2349, 2794].forEach((f, i) => bell(c, d, t + i * 0.035, { f, ratio: 2.4, index: 1, peak: 0.06, decay: 0.25 }));
    return t + 0.45;
  }, gap: 0.08, max: 2, pri: 1, vol: 0.7, vary: 1 },
  warn: { fn(c, d, t, p, o) { // telegraph: accelerating, rising beeps across the warning time
    const dur = Math.max(0.6, Math.min(2, o.duration || 1.1));
    const fr = [0, 0.42, 0.68, 0.86];
    let end = t;
    fr.forEach((k, i) => {
      const f = 880 * Math.pow(2, i * 2 / 12);
      tone(c, d, t + k * dur, { type: 'square', f, lp: 2600, peak: 0.25, decay: 0.07 });
      end = tone(c, d, t + k * dur, { type: 'sine', f: f * 2, peak: 0.15, decay: 0.05 });
    });
    return end;
  }, gap: 0.25, max: 2, pri: 1, vol: 1.0, vary: 0 },
  slam: { fn(c, d, t, p) { // rock impact + ground rumble
    noise(c, d, t, { type: 'lowpass', f: 3500, f2: 300, fT: 0.12, peak: 0.3, decay: 0.15 });
    noise(c, d, t + 0.03, { type: 'bandpass', f: 900, q: 3, peak: 0.1, decay: 0.35 });
    return rumble(c, d, t, p, 0.95);
  }, gap: 0.12, max: 2, pri: 2, vol: 0.85, vary: 1 },
  rumble: { fn(c, d, t, p) { // rolling boulder
    noise(c, d, t, { pink: true, type: 'lowpass', f: 300, f2: 900, fT: 1.2, a: 0.4, peak: 0.4, decay: 0.3, sus: 0.8, dur: 1.2, rel: 0.4 });
    return tone(c, d, t, { type: 'sine', f: 45 * p, a: 0.3, peak: 0.45, decay: 0.3, sus: 0.8, dur: 1.2, rel: 0.4, vib: { rate: 7, depth: 70, delay: 0.1 } });
  }, gap: 0.5, max: 1, pri: 2, vol: 0.6, vary: 1 },
  orb: { fn(c, d, t, p) { // orb volley launch: sci-fi whoosh
    tone(c, d, t, { type: 'sine', f: 300 * p, f2: 1200 * p, glide: 0.2, peak: 0.14, decay: 0.25, vib: { rate: 18, depth: 60, delay: 0.01 } });
    return noise(c, d, t, { type: 'bandpass', f: 800, f2: 3500, fT: 0.25, q: 2, peak: 0.12, decay: 0.25 });
  }, gap: 0.15, max: 2, pri: 1, vol: 0.8, vary: 1.5 },
  summon: { fn(c, d, t) { // goo burst
    noise(c, d, t, { pink: true, type: 'bandpass', f: 300, f2: 1200, fT: 0.4, q: 4, a: 0.05, peak: 0.35, decay: 0.45 });
    for (let i = 0; i < 5; i++) tone(c, d, t + i * 0.05, { type: 'sine', f: 160 + i * 40, f2: 500 + i * 80, glide: 0.06, peak: 0.12, decay: 0.08 });
    return t + 0.7;
  }, gap: 0.3, max: 1, pri: 2, vol: 0.85, vary: 1 },
  charge: { fn(c, d, t, p) { // mech-rhino charge: engine rev + stomps
    tone(c, d, t, { type: 'sawtooth', f: 60 * p, f2: 140 * p, glide: 0.6, lp: 600, lp2: 2000, lpT: 0.6, q: 3, peak: 0.18, decay: 0.2, sus: 0.8, dur: 0.8, rel: 0.25 });
    for (let i = 0; i < 4; i++) kick(c, d, t + i * 0.18, 0.5, true);
    return t + 1.1;
  }, gap: 0.4, max: 1, pri: 2, vol: 0.85, vary: 1 },
  lightning: { fn(c, d, t, p) { // lightning lane strike
    noise(c, d, t, { type: 'highpass', f: 2500, peak: 0.45, decay: 0.08 });
    noise(c, d, t + 0.05, { type: 'lowpass', f: 5000, f2: 200, fT: 0.6, peak: 0.4, decay: 0.7 });
    return tone(c, d, t + 0.04, { type: 'sine', f: 90 * p, f2: 30, glide: 0.6, peak: 0.5, decay: 0.7 });
  }, gap: 0.12, max: 2, pri: 2, vol: 0.85, vary: 1.5 },
  roar: { fn(c, d, t, p, o) { return roar(c, d, t, p, o.len || 1.5, o.f0 || 78); }, gap: 0.8, max: 1, pri: 2, vol: 0.9, vary: 1 },
  bossLand: { fn(c, d, t, p, o) { // boss drops onto the bridge, then roars
    noise(c, d, t, { type: 'lowpass', f: 4000, f2: 200, fT: 0.25, peak: 0.45, decay: 0.3 });
    rumble(c, d, t, 0.85, 1.3);
    crash(c, d, t, 0.6);
    return roar(c, d, t + 0.45, p, 1.6, o.f0 || 74);
  }, gap: 1, max: 1, pri: 2, vol: 0.85, vary: 0.5 },
  bossDie: { fn(c, d, t, p) { // chain of explosions + triumphant brass hit
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.22;
      noise(c, d, tt, { pink: true, type: 'lowpass', f: 3500 - i * 600, f2: 110, fT: 0.6, peak: 0.55, decay: 0.7 });
      tone(c, d, tt, { type: 'sine', f: (120 - i * 15) * p, f2: 30, glide: 0.55, peak: 0.6, decay: 0.6 });
    }
    noise(c, d, t, { type: 'highpass', f: 3000, peak: 0.25, decay: 0.12 });
    crash(c, d, t + 0.66, 0.9);
    const tb = t + 0.7;
    [60, 67, 72, 76].forEach((m) => brass(c, d, tb, m, 0.75, 0.85));
    [84, 88, 91, 96].forEach((m, i) => bell(c, d, tb + 0.15 + i * 0.07, { f: mtof(m), ratio: 2, index: 1, peak: 0.07, decay: 0.6, pan: (i - 1.5) * 0.3 }));
    return tb + 1.4;
  }, gap: 1, max: 1, pri: 2, vol: 0.95, vary: 0 },
  // ---------------- update 3 ----------------
  rage: { fn(c, d, t, p) { // RAGE at 25%: deep roar over a sub boom and a hissing heat burst
    tone(c, d, t, { type: 'sine', f: 55 * p, f2: 32, glide: 0.8, peak: 0.7, decay: 0.9 });
    noise(c, d, t, { type: 'highpass', f: 1800, f2: 600, fT: 0.6, peak: 0.18, decay: 0.6 });
    crash(c, d, t + 0.05, 0.5);
    return roar(c, d, t + 0.08, p, 1.5, 58);
  }, gap: 1.2, max: 1, pri: 3, vol: 0.95, vary: 0.5 },
  safeAlarm: { fn(c, d, t, p, o) { // SAFE SPOT warning: two-tone siren + riser across the warning time
    const dur = Math.max(1.2, Math.min(3, o.duration || 2));
    riser(c, d, t, dur, 0.6);
    let end = t;
    for (let i = 0; i < 4; i++) {
      const tt = t + i * dur / 4.4;
      tone(c, d, tt, { type: 'square', f: 660 * p, lp: 2400, peak: 0.16, decay: 0.12, sus: 0.6, dur: dur / 9, rel: 0.04 });
      end = tone(c, d, tt + dur / 8.8, { type: 'square', f: 880 * p, lp: 2400, peak: 0.16, decay: 0.12, sus: 0.6, dur: dur / 9, rel: 0.04 });
    }
    return end;
  }, gap: 1, max: 1, pri: 2, vol: 0.85, vary: 0 },
  safeBlast: { fn(c, d, t, p) { // the arena blast around the safe spot
    noise(c, d, t, { type: 'lowpass', f: 6000, f2: 250, fT: 0.5, peak: 0.55, decay: 0.6 });
    crash(c, d, t, 0.7);
    return rumble(c, d, t, p * 0.9, 1.1);
  }, gap: 0.5, max: 1, pri: 3, vol: 0.9, vary: 0.5 },
  embers: { fn(c, d, t, p) { // ember / magma impact: crackling sizzle + thump
    noise(c, d, t, { type: 'bandpass', f: 2600, q: 1.5, peak: 0.22, decay: 0.35 });
    noise(c, d, t + 0.02, { pink: true, type: 'lowpass', f: 1200, f2: 200, fT: 0.3, peak: 0.3, decay: 0.3 });
    return tone(c, d, t, { type: 'sine', f: 110 * p, f2: 50, glide: 0.25, peak: 0.35, decay: 0.3 });
  }, gap: 0.09, max: 3, pri: 1, vol: 0.75, vary: 1.5 },
  freeze: { fn(c, d, t, p) { // freeze lane: glassy crack + shimmering bells
    noise(c, d, t, { type: 'highpass', f: 4000, peak: 0.35, decay: 0.12 });
    [2637, 3136, 3951].forEach((f, i) => bell(c, d, t + 0.03 + i * 0.04, { f: f * p, ratio: 2.76, index: 1.2, peak: 0.07, decay: 0.5, pan: (i - 1) * 0.4 }));
    return tone(c, d, t, { type: 'sine', f: 160 * p, f2: 70, glide: 0.3, peak: 0.25, decay: 0.35 });
  }, gap: 0.15, max: 2, pri: 2, vol: 0.85, vary: 1 },
  cane: { fn(c, d, t, p) { // candy cane lands: sugary crack + boing
    noise(c, d, t, { type: 'bandpass', f: 3000, q: 3, peak: 0.18, decay: 0.08 });
    return tone(c, d, t, { type: 'triangle', f: 520 * p, f2: 260 * p, glide: 0.18, peak: 0.2, decay: 0.22, vib: { rate: 22, depth: 30, delay: 0 } });
  }, gap: 0.08, max: 3, pri: 1, vol: 0.8, vary: 1.5 },
};
