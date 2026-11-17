// Sounds of the update-3 stage-4 controls, merged into SFX by sfxdefs.js; bindControls (called by bindings.js)
// maps their events: dodge roll whoosh, the skipped hit "shing", combo tier-up chime, combo lost blip and the
// formation switch shuffle.
import { tone, noise } from './synth.js';

export const CONTROL_SFX = {
  dodge: { fn(c, d, t, p) { // airy whoosh sweeping up then down
    noise(c, d, t, { type: 'bandpass', f: 500 * p, f2: 2600 * p, fT: 0.18, q: 1.6, peak: 0.22, decay: 0.34 });
    return tone(c, d, t, { type: 'triangle', f: 300 * p, f2: 700 * p, glide: 0.16, peak: 0.08, decay: 0.22 });
  }, gap: 0.2, max: 2, pri: 1, vol: 0.75, vary: 1 },
  dodged: { fn(c, d, t, p) { // a hit slides off: bright metallic shing
    tone(c, d, t, { type: 'square', f: 1760 * p, f2: 2400 * p, glide: 0.06, lp: 5200, peak: 0.07, decay: 0.28 });
    return tone(c, d, t + 0.03, { type: 'sine', f: 2640 * p, peak: 0.1, decay: 0.32 });
  }, gap: 0.2, max: 1, pri: 2, vol: 0.7, vary: 0.5 },
  comboUp: { fn(c, d, t, p) { // three rising notes
    tone(c, d, t, { type: 'triangle', f: 660 * p, peak: 0.12, decay: 0.12 });
    tone(c, d, t + 0.07, { type: 'triangle', f: 880 * p, peak: 0.12, decay: 0.12 });
    return tone(c, d, t + 0.14, { type: 'triangle', f: 1320 * p, peak: 0.14, decay: 0.26 });
  }, gap: 0.3, max: 1, pri: 2, vol: 0.7, vary: 0 },
  comboLost: { fn(c, d, t, p) { // falling blip
    return tone(c, d, t, { type: 'square', f: 520 * p, f2: 180 * p, glide: 0.22, lp: 1800, peak: 0.09, decay: 0.26 });
  }, gap: 0.5, max: 1, pri: 1, vol: 0.6, vary: 0 },
  formation: { fn(c, d, t, p) { // boots shuffling into place
    noise(c, d, t, { type: 'bandpass', f: 1400 * p, q: 2, peak: 0.12, decay: 0.06 });
    noise(c, d, t + 0.08, { type: 'bandpass', f: 1100 * p, q: 2, peak: 0.12, decay: 0.06 });
    return tone(c, d, t + 0.12, { type: 'sine', f: 520 * p, f2: 780 * p, glide: 0.08, peak: 0.12, decay: 0.14 });
  }, gap: 0.15, max: 1, pri: 1, vol: 0.7, vary: 0 },
};

export function bindControls(audio, game) {
  const ev = game.events, offs = [];
  const on = (name, snd) => offs.push(ev.on(name, () => audio.fx(snd, null)));
  on('dodge:start', 'dodge');
  on('dodge:skip', 'dodged');
  on('combo:tier', 'comboUp');
  offs.push(ev.on('combo:lost', (p) => { if (p && p.count >= 10) audio.fx('comboLost', null); }));
  on('formation:change', 'formation');
  return offs;
}
