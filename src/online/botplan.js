// The plan of one scripted Quick Match rival (STAGE3 "The bot"): everything it will do, deterministic from the match
// seed and its pick (bot.js pickBot). Pure: no DOM, no clock, no game state (the lane steering below takes the gate
// rows as an argument; bot.js reads them from my road). Numbers: botdata.js (hand) and botcurves.js (generated).
//
//   streams(seed)         the Rng sub-streams of one bot, all forked in a fixed order from Rng(seed ^ BOT.salt)
//   makePlan(seed, pick)  -> plan:
//     T                   its fall time (s, whole tenths): lognormal around BOT_CURVES.casual.fall.median x the level's
//                         median factor, clamped to [25, 300]; my landed sabotage takes slices of it (bot.js)
//     at(t) -> { dist, zone, arena, hp }   the road: endlessSpeed(zone) x vsPace(t) integrated; arena z (1-based,
//                         0 = on the road) holds 700 z - 2 for arena[z].dur x U(0.85, 1.15) s, boss hp 1 -> 0
//     squad(t)            the calibrated squad curve (casual / pro blend of its level) x a per-bot factor, 1..999,
//                         with a dip across each arena (to 1 - loss of its start) that recovers after it
//     collapse            seconds over which the squad falls to 0 before T
//     normals             its normal sabotage: [{ due, code }] (first at U(28, 40) s, then every U(18, 35) s)
//     arenas              [{ z, a, b, loss }] start / end of every arena on its road up to 330 s
//     forms               [{ t, form }] formation changes
//     react(code, recvAt) -> { at, code, dip, slice, road }  what one sabotage of mine does to it, and when
//     roll(at)            0..1, one per gate row (the wrongGate dice)
//   laneStep(lane, t, dist, row)  one 0.1 s step of its lane x (see below)
import { Rng } from '../core/rng.js';
import { LANES } from '../config.js';
import { ENDLESS, endlessSpeed } from '../data/endless.js';
import { vsPace } from './game/vsdata.js';
import { sabRoad } from './game/sabdata.js';
import { Ramp } from './game/ramp.js';
import { X_LIMIT } from './codec.js';
import { BOT } from './botdata.js';
import { BOT_CURVES } from './botcurves.js';

export const MAX_T = 330;           // nothing is planned past the storm wall's end
const K = MAX_T * 10 + 1;           // timeline entries, one per tenth
const STEP = BOT.stream.sample;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const tenth = (t) => Math.round(t * 10) / 10;
const worth = (e, E) => Ramp.prototype.worth.call(null, e, E); // ramp.js's rule: bigger = the better side

const STREAMS = ['id', 'name', 'fall', 'squad', 'arena', 'gate', 'wob', 'sab', 'form', 'lag', 'weave'];

/** The Rng sub-streams of the bot of `seed` (forked in a fixed order, so adding a draw never moves another). */
export function streams(seed) {
  const root = new Rng(((seed >>> 0) ^ BOT.salt) >>> 0);
  const s = {};
  for (const n of STREAMS) s[n] = root.fork();
  return s;
}

/** Level -3..3 -> index into the BOT.level tables. */
export const levelIndex = (lv) => clamp(Math.round(Number(lv) || 0), BOT.levels.min, BOT.levels.max) - BOT.levels.min;

function gauss(r) {
  const u = Math.max(1e-9, r.next()), v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shuffled(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function makePlan(seed, pick = {}, curves = BOT_CURVES) {
  const S = streams(seed), L = BOT.level, li = levelIndex(pick.level), w = L.curve[li];
  const C = curves.casual, P = curves.pro, F = BOT.fall;
  const mix = (a, b) => a + (b - a) * w;
  const median = C.fall.median * L.median[li];
  const sigma = mix(C.fall.sigma, P.fall.sigma);
  const T = tenth(clamp(median * Math.exp(sigma * gauss(S.fall)), F.min, F.max));
  const collapse = S.fall.range(F.collapse[0], F.collapse[1]);
  const factor = S.squad.range(0.85, 1.15);
  const sliceK = Math.max(mix(C.sliceK, P.sliceK), BOT.react.sliceMin) * L.slice[li];
  const arenaOf = (z) => { const i = Math.min(z, C.arena.length) - 1; return { dur: mix(C.arena[i].dur, P.arena[i].dur), loss: clamp(mix(C.arena[i].loss, P.arena[i].loss), 0, 0.95) }; };

  // ---- the road, one entry per tenth ----
  const dist = new Float64Array(K), zone = new Uint8Array(K), arena = new Uint8Array(K), hp = new Float32Array(K);
  const arenas = [];
  let d = 0, z = 1, cur = null;
  for (let k = 0; k < K; k++) {
    const t = k / 10;
    if (cur && k >= cur.kb) { cur = null; z++; }   // the boss is down: the next zone starts at its end time
    dist[k] = d; zone[k] = Math.min(35, z);
    if (cur) { arena[k] = cur.z; hp[k] = Math.max(0, 1 - (k - cur.ka) / (cur.kb - cur.ka)); continue; }
    d += endlessSpeed(z) * vsPace(t + STEP / 2) * STEP;
    const wall = z * ENDLESS.bossEvery - 2;
    if (d >= wall) {
      d = wall;
      const A = arenaOf(z), ka = k + 1, kb = ka + Math.max(10, Math.round(A.dur * S.arena.range(0.85, 1.15) * 10));
      cur = { z, ka, kb };
      arenas.push({ z, a: ka / 10, b: kb / 10, loss: A.loss });
    }
  }

  // ---- squad: the calibrated curve x the factor (eased to 1 near the cap), a dip across each arena, and the whole
  // timeline growing no faster than gate rows can (BOT.grow: the medians of the few runs still standing late, and the
  // climb back after an arena, would otherwise leap 8 -> 600 in 5 s) ----
  const G = BOT.grow, REC = BOT.arenaRecover;
  const raw = (t) => {
    const x = clamp(t / 5, 0, C.n.length - 1), i = Math.floor(x), f = x - i, j = Math.min(C.n.length - 1, i + 1);
    const c = mix(C.n[i], P.n[i]) * (1 - f) + mix(C.n[j], P.n[j]) * f;
    return clamp(c * (factor + (1 - factor) * clamp((c - G.capFrom) / (990 - G.capFrom), 0, 1)), 1, 999);
  };
  const shaped = (t) => {
    for (const A of arenas) {
      if (t < A.a) break;
      if (t < A.b) return raw(A.a) * (1 - A.loss * (t - A.a) / (A.b - A.a));
      if (t < A.b + REC) { const end = raw(A.a) * (1 - A.loss); return end + (raw(t) - end) * (t - A.b) / REC; }
    }
    return raw(t);
  };
  const limited = (fn) => {
    const a = new Float32Array(K);
    for (let k = 0; k < K; k++) a[k] = k ? Math.min(fn(k / 10), a[k - 1] * G.mul + G.add) : fn(0);
    return (t) => { const x = clamp(t * 10, 0, K - 1), i = Math.floor(x), j = Math.min(K - 1, i + 1); return a[i] + (a[j] - a[i]) * (x - i); };
  };
  const curve = limited(raw), squad = limited(shaped);

  // ---- its sabotage: a shuffled cycle of the normal kinds ----
  const normals = [];
  let cycle = shuffled(S.sab, [1, 2, 3, 4, 5]), ci = 0;
  for (let due = S.sab.range(BOT.sab.first[0], BOT.sab.first[1]); due < MAX_T; due += S.sab.range(BOT.sab.every[0], BOT.sab.every[1])) {
    normals.push({ due: tenth(due), code: cycle[ci++] });
    if (ci >= cycle.length) { cycle = shuffled(S.sab, [1, 2, 3, 4, 5]); ci = 0; }
  }
  const forms = [{ t: 0, form: 0 }];
  for (let t = S.form.range(BOT.formEvery[0], BOT.formEvery[1]); t < MAX_T; t += S.form.range(BOT.formEvery[0], BOT.formEvery[1])) forms.push({ t: tenth(t), form: S.form.int(0, 2) });
  const gateSeed = Math.floor(S.gate.next() * 4294967296) >>> 0;

  const at = (t) => {
    const k = clamp(Math.floor(t * 10 + 1e-6), 0, K - 1);
    return { dist: dist[k], zone: zone[k], arena: arena[k], hp: hp[k] };
  };
  const arenaAt = (t) => { for (const A of arenas) if (t >= A.a - 1e-9 && t < A.b - 1e-9) return A; return null; };

  return {
    seed: seed >>> 0, level: li + BOT.levels.min, li, w, T, T0: T, median, sigma, collapse, factor, sliceK,
    wrongGate: L.wrongGate[li], arenas, normals, forms, streams: S,
    at, arenaAt, squad, curve,
    /** What a sabotage of mine (received at recvAt) does: when it lands on the bot and how hard. */
    react(code, recvAt) {
      const R = BOT.react;
      let land = recvAt + R.delay;
      const road = sabRoad(code);
      if (road) { const A = arenaAt(recvAt) || arenaAt(land); if (A) land = Math.max(land, A.b); } // waits out its arena
      return { at: land, code, road, dip: R.dip[code] || 0, slice: (R.slice[code] || 0) * sliceK };
    },
    /** 0..1, the same for every look at one gate row (one wrongGate roll per row). */
    roll(rowAt) {
      let h = (gateSeed ^ Math.imul(Math.round(rowAt * 10) | 0, 0x9e3779b1)) >>> 0;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    },
    formAt(t) { let f = 0; for (const x of forms) { if (x.t > t + 1e-9) break; f = x.form; } return f; },
  };
}

/**
 * The gate row it aims at: `rows` is my road's gate events (sorted by `at`), `lane.cursor` its place in them. Rows a
 * sabotage spliced onto MY road (`sab: true`) are not its road and are skipped. -> { at, best, worst } or null when
 * no row is within BOT.steer.look u ahead; `lane.past` = my road has no row ahead of it at all (it is a zone ahead).
 */
export function nextRow(lane, rows, d, knobs) {
  if (!rows) { lane.past = true; return null; }
  let c = Math.min(lane.cursor, rows.length);
  while (c > 0 && rows[c - 1].at > d) c--;     // (an insertion before the cursor moved it)
  while (c < rows.length && rows[c].at <= d) c++;
  lane.cursor = c;
  let i = c;
  while (i < rows.length && rows[i].sab) i++;
  if (i >= rows.length) { lane.past = true; return null; }
  lane.past = false;
  const at = rows[i].at;
  if (at - d > BOT.steer.look) return null;
  const E = knobs ? knobs(at) : 50;
  let best = null, worst = null, top = -Infinity, low = Infinity;
  for (let j = i; j < rows.length && rows[j].at === at; j++) {
    const e = rows[j];
    if (e.sab || !(e.lane in LANES)) continue;
    const v = worth(e, E);
    if (v > top) { top = v; best = e; }
    if (v < low) { low = v; worst = e; }
  }
  if (!best) return null;
  return { at, best, worst: worst !== best ? worst : null };
}

/** A fresh lane state for laneStep. */
export const newLane = () => ({ x: 0, target: 0, wob: 0, goal: 0, wobAt: 0, cursor: 0, past: false, frozen: 0, chosen: null });

/**
 * One 0.1 s step of its lane x at played time t and distance d. `row` from nextRow (or null); `plan` for the dice,
 * `inArena` its boss arena. Steers at <= BOT.steer.speed u/s toward the row's chosen side (the better one, the worse
 * one on a wrongGate roll), plus a slow wobble; in an arena a weave around the middle; past my road a gentle weave.
 * FREEZE (lane.frozen > t) holds x where it is.
 */
export function laneStep(lane, plan, t, row, inArena) {
  const St = BOT.steer, r = plan.streams.wob;
  if (t < lane.frozen - 1e-9) return lane.x;
  if (inArena) lane.target = 1.1 * Math.sin(0.8 * t + plan.factor * 7);
  else if (row) {
    const wrong = plan.roll(row.at) < plan.wrongGate;
    const x = !wrong ? LANES[row.best.lane] : row.worst ? LANES[row.worst.lane] : -LANES[row.best.lane]; // (one gate: the other side)
    lane.chosen = { at: row.at, x, best: LANES[row.best.lane], wrong };
    lane.target = x;
  } else if (lane.past) lane.target = 2.2 * Math.sin(0.35 * t + plan.factor * 3);
  if (t >= lane.wobAt) { lane.goal = r.range(-St.wobble, St.wobble); lane.wobAt = t + r.range(0.6, 1.6); }
  lane.wob += (lane.goal - lane.wob) * 0.3;
  const goal = clamp(lane.target + lane.wob, -X_LIMIT, X_LIMIT), step = St.speed * STEP;
  lane.x = clamp(lane.x + clamp(goal - lane.x, -step, step), -X_LIMIT, X_LIMIT);
  return lane.x;
}
