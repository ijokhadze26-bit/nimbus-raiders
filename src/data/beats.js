// Level building blocks (data only), shared by the hand-made levels (levels.js), the generated ones
// (levelgen.js), endless (endless.js) and practice (practice.js). A beat is one decision (gate row, barrel
// pair, horde, ...) plus optional side items (coins, power-ups, blades, gaps); level() lays the beats out at an
// even spacing between START and `layout - ARENA`.
// Update 3: a level without a boss ends with a FINAL RUSH - one big last horde past the last beat - and a
// finish arch at `length` (def.finish). Its beats keep the old spacing (def.layout = the old length), the
// road just runs RUSH_TAIL further so the rush is fought out before the line.
import { LANES } from '../config.js';

// ---------------- event builders ----------------
export const gate = (at, lane, op, extra = {}) => ({ type: 'gate', at, lane, op, ...extra });
export const barrel = (at, lane, hp, kind, amount) => ({ type: 'barrel', at, lane, hp, reward: amount == null ? { kind } : { kind, amount } });
export const horde = (at, count, mix, lane = 'both', extra = {}) => ({ type: 'horde', at, count, mix, lane, ...extra });
export const blade = (at, lane, extra = {}) => ({ type: 'blade', at, lane, ...extra });
export const gap = (at, lane, length = 10) => ({ type: 'gap', at, lane, length });
export const powerup = (at, lane, kind) => ({ type: 'powerup', at, lane, kind });
export const coins = (at, lane, count = 8, pattern = 'line') => ({ type: 'coins', at, lane, count, pattern });
/** Weapon crate (lane L or R only): taking it switches to `weapon` (same weapon: +1 Mk). */
export const crate = (at, lane, weapon) => ({ type: 'crate', at, lane, x: LANES[lane] ?? 0, weapon });

// ---------------- gate specs ----------------
// a(+N, max) add gate; x(k, hits) ladder starting at ×k, dv(k, hits) at ÷k (one rung up per `hits` bullets,
// FIX = never climbs)
export const FIX = 99999;
const RUNG = { mul: { 2: 3, 3: 4, 4: 5 }, div: { 4: 0, 3: 1, 2: 2 } };
export const a = (value, max, extra = {}) => ({ op: 'add', value, max, ...extra });
export const x = (k, hitsPerStep = FIX, extra = {}) => ({ op: 'mul', rung: RUNG.mul[k], hitsPerStep, ...extra });
export const dv = (k, hitsPerStep = FIX, extra = {}) => ({ op: 'div', rung: RUNG.div[k], hitsPerStep, ...extra });
export const mv = (range, speed) => ({ moving: { range, speed } });
const strip = ({ op, ...rest }) => rest;

// ---------------- beats: functions of the beat position ----------------
export const P = (l, r) => (at) => [gate(at, 'L', l.op, strip(l)), gate(at, 'R', r.op, strip(r))];
export const C = (s) => (at) => [gate(at, 'C', s.op, strip(s))];
export const B = (l, r) => (at) => [l && barrel(at, 'L', ...l), r && barrel(at, 'R', ...r)];
// hordes charge the squad once it is within ~50 u: placed 18 u past the beat they meet it around the beat
export const H = (count, mix, lane = 'both') => (at) => [horde(at + 18, count, mix, lane)];
export const K = (lane, n = 8, pattern = 'line') => (at) => [coins(at, lane, n, pattern)];
export const U = (lane, kind) => (at) => [powerup(at, lane, kind)];
export const X = (lane, extra = {}) => (at) => [blade(at, lane, extra)];
export const O = (lane, length = 12) => (at) => [gap(at - length / 2, lane, length)];
// staggered variants: a blade / gap `dz` past the beat (after its gate row, or after another hazard), so two
// hazards never share one z and a good gate is never floating over a hole
export const Xd = (lane, dz, extra = {}) => (at) => [blade(at + dz, lane, extra)];
export const Od = (lane, length, dz) => (at) => [gap(at + dz, lane, length)];

export const START = 24, ARENA = 30;
/** Road past the old arena line on a level without a boss: the final rush is fought here, then the finish. */
export const RUSH_TAIL = 24;
/** The final rush stands this far past the old arena line (it meets the squad just before it). */
export const RUSH_AT = 12;
/** Rush enemies have this x the hp of a horde at the arena line (it has to cost troops, not just be shot). */
export const RUSH_TOUGH = 3;

// enemy mixes. A Fizzbomb blast (r 2.2) wipes ~25 packed Murklings whatever their hp, so above ~5% bombers
// one pop chains through a whole horde; the share written in the mixes below is scaled by BOMB so a pop
// cracks a horde open (a reward for aiming) instead of erasing it.
export const BOMB = 0.4;
export const G = { grunt: 1 };
export const GR = (r = 0.25) => ({ grunt: 1 - r, runner: r });
export const GRS = (r = 0.2, s = 0.15) => ({ grunt: 1 - r - s, runner: r, shield: s });
export const M5 = (r = 0.2, s = 0.14, b = 0.12) => ({ grunt: 1 - r - s - b * BOMB, runner: r, shield: s, bomber: b * BOMB });
export const M6 = (r = 0.2, s = 0.14, b = 0.12, t = 0.07) => ({ grunt: 1 - r - s - b * BOMB - t, runner: r, shield: s, bomber: b * BOMB, tank: t });
// tank walls (L13+): Bulwarks packed with Fizzbombs - pop a bomber inside and the wall cracks open
export const TW = (t = 0.25, b = 0.22) => ({ grunt: 1 - t - b * BOMB - 0.1, runner: 0.1, tank: t, bomber: b * BOMB });

// Horde toughness follows the gun the squad should be holding and how far into the level it is: a horde's
// hp multiplier is the relative crowd damage of the tier reached by breaking every weapon barrel before it
// (pistol = 1) times a toughness that ramps from 1 at the start (a small squad meets small hordes) to the
// level's `tough` at the arena (the squad has snowballed by then). Miss a gun barrel and the hordes after it
// feel tougher; buy damage / fire rate / a better starting gun and they melt faster. Anything spawned
// without its own multiplier (boss broods) uses def.enemyHp = BROOD x the arena toughness.
export const TIER_CROWD = [1, 2.05, 3.2, 6.1, 9.3, 9.8];
export const TIER_EXP = 0.7, RAMP_EXP = 1.5, BROOD = 0.35;
export const toughFor = (tough, tier) => Math.round(tough * Math.pow(TIER_CROWD[Math.min(5, tier) - 1], TIER_EXP) * 100) / 100;

function toughen(def, events) {
  const tough = def.tough ?? 1;
  const span = def.layout ?? def.length;
  let tier = 1;
  for (const e of events.slice().sort((p, q) => p.at - q.at)) {
    if (e.type === 'barrel' && e.reward.kind === 'weapon') tier = Math.min(5, tier + (e.reward.amount || 1));
    else if (e.type === 'horde' && (e.hpMul == null || e.autoHp)) {
      const p = Math.max(0, Math.min(1, e.at / span));
      e.hpMul = toughFor(1 + (tough - 1) * Math.pow(p, RAMP_EXP), tier) * (e.tough ?? 1);
      e.autoHp = true;
    }
  }
  return Math.round(Math.max(1, BROOD * toughFor(tough, tier)) * 100) / 100;
}

/** Re-derives the horde toughness of a level def after its `tough` changed (balance tests). */
export function retough(def) { def.enemyHp = toughen(def, def.events); return def; }

/**
 * The final rush of a level without a boss: `rush.mul` x the level's biggest horde (default 1.2, at most
 * 600), with the mix of its last horde (or `rush.mix`), across both lanes, at full toughness x `rush.tough` (default RUSH_TOUGH).
 */
export function finalRush(def, events) {
  const hordes = events.filter((e) => e.type === 'horde');
  if (!hordes.length) return null;
  const o = def.rush || {};
  const last = hordes.reduce((m, e) => (e.at > m.at ? e : m), hordes[0]);
  const big = hordes.reduce((m, e) => Math.max(m, e.count), 0);
  const count = Math.min(600, Math.round(o.count ?? big * (o.mul ?? 1.2)));
  return horde(def.layout - ARENA + RUSH_AT + 18, count, o.mix || last.mix, 'both', { rush: true, tough: o.tough ?? RUSH_TOUGH });
}

/**
 * Spreads the beats evenly between START and `length - ARENA` (the boss arena opens at `length`). A level
 * with `boss: null` keeps that spacing (layout = the given length), gets the final rush and the finish arch
 * RUSH_TAIL further on (def.finish).
 */
export function level(def, beats) {
  const bossless = !def.boss;
  const layout = def.length;
  const step = (layout - ARENA - START) / Math.max(1, beats.length - 1);
  const events = [];
  beats.forEach((beat, i) => {
    const at = Math.round(START + i * step);
    for (const fn of [].concat(beat)) for (const e of fn(at)) if (e) events.push(e);
  });
  const out = { ...def, boss: def.boss || null, layout, events };
  if (bossless) {
    out.length = layout + RUSH_TAIL;
    out.finish = true;
    const rush = finalRush(out, events);
    if (rush) events.push(rush);
  }
  out.enemyHp = toughen(out, events);
  return out;
}
