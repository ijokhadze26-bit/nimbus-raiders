// Road-object placement (update 3 stage 4, data only). planProps(def) adds { type:'prop', kind, at, lane?, hp,
// hint? } events to a level at module load (levels.js calls it for every level after the hazards are placed).
// Rules: from level 3 on, 1-2 objects per level (1 on L3-L5, intro and boss / mini-boss levels; 2 elsewhere),
// each tied to a horde (where the enemies come): a crane's drop ring on the horde's blob, a dam just behind
// it (its flood runs down through it), a bell a little before it (rung as the horde closes in), a boulder well
// before it (pushed into it). Deterministic (one Rng per level id), existing events never move, an object
// keeps its CLEAR distance from gates, barrels, crates, gaps, blades, hazards, power-ups, coins, cages and other
// objects (a free spot is searched around the wanted one, else the next horde is tried), and stays before
// the final rush / boss arena. L3-L6 teach the four kinds one at a time with a HUD hint.
import { Rng } from '../core/rng.js';
import { START, ARENA } from './beats.js';

export const PROP_KINDS = ['crane', 'dam', 'bell', 'boulder'];
export const PROP_MIN_LEVEL = 3;
export const PROP_HINTS = {
  boulder: 'BOULDER! Run into it to roll it',
  bell: 'BELL! Shoot it to stun them all',
  crane: 'CRANE! Shoot the hook to drop the crate',
  dam: 'DAM! Shoot the red gate to flood the lane',
};
/** The lessons: which kinds a level teaches (with the hint), in this order. */
export const LESSONS = { 3: ['boulder'], 4: ['bell'], 5: ['crane'], 6: ['dam', 'boulder'] };
/** Level that teaches a kind (its first lesson): only there does the event carry the hint. */
export const TEACH = {};
for (const [id, ks] of Object.entries(LESSONS)) for (const k of ks) if (!(k in TEACH)) TEACH[k] = Number(id);

/** Clearance (u) an object keeps from other events: [before the event, after its end]; others get DEFAULT. */
export const CLEAR = { gate: [6, 6], barrel: [4, 4], crate: [12, 12], gap: [5, 5], blade: [4, 4], hazard: [4, 4], powerup: [2, 2], coins: [1, 1], prop: [12, 12] };
const DEFAULT = [5, 5];
const SPAN = { coins: 12 };
/** Road an object takes around its spot [before, after] (the bell's arch spans the road: gates keep off more). */
export const FOOT = { crane: [3, 3], dam: [2.5, 2.5], bell: [2, 2], boulder: [2, 2] };
const SKIP = new Set(['horde']);

/** Wanted spot for a kind next to a horde event. */
function spotFor(kind, h) {
  switch (kind) {
    // crane: the ring lies on the blob's middle (a light hook breaks at the edge of range, before it charges)
    case 'crane': return h.at - Math.round(0.32 * Math.sqrt(h.count || 1));
    case 'dam': return h.at + 3;
    case 'bell': return h.at - 9;
    default: return h.at - 28;                                          // boulder: run-up before the horde
  }
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** Hit points of a level's shootable objects: under half its typical barrel (they are a tool, not a prize). */
export function propHp(def, kind) {
  const bh = median(def.events.filter((e) => e.type === 'barrel').map((e) => e.hp || 0));
  const base = Math.max(18, Math.min(110, Math.round(bh ? bh * 0.45 : 20 + 4 * def.id)));
  // the crane's hook is light: it should snap while its horde still stands under the ring (barely in range)
  return kind === 'bell' ? Math.round(base * 1.25) : kind === 'crane' ? Math.max(10, Math.round(base * 0.45)) : base;
}

function fits(blocks, kind, at, lo, hi) {
  const [b, a] = FOOT[kind];
  if (at - b < lo || at + a > hi) return false;
  for (const [x0, x1] of blocks) if (at - b < x1 && at + a > x0) return false;
  return true;
}

/** Adds the level's road objects (idempotent). Returns def. */
export function planProps(def) {
  if (!def || !(def.id >= PROP_MIN_LEVEL) || def.events.some((e) => e.type === 'prop')) return def;
  const r = new Rng(def.id * 6007 + 29);
  const span = def.layout ?? def.length;
  const lo = START + 14, hi = span - ARENA - 2;
  const blocks = [];
  for (const e of def.events) {
    if (SKIP.has(e.type)) continue;
    const c = CLEAR[e.type] || DEFAULT;
    blocks.push([e.at - c[0], e.at + (e.length || SPAN[e.type] || 0) + c[1]]);
  }
  const hordes = def.events.filter((e) => e.type === 'horde' && !e.rush && e.at > lo + 6 && e.at < hi + 10).sort((a, b) => a.at - b.at);
  if (!hordes.length) return def;
  let kinds = LESSONS[def.id];
  const lesson = !!kinds;
  if (!kinds) {
    const few = def.kind === 'boss' || def.kind === 'mini' || def.kind === 'intro' || def.id < 6;
    const pool = PROP_KINDS.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = r.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    kinds = pool.slice(0, few ? 1 : 2);
  }
  const used = new Set();
  const place = (kind, j, n, reach) => {
    // the j-th object goes near the horde at fraction (j + 0.5) / n of the level, then its neighbours
    const want = Math.min(hordes.length - 1, Math.floor(((j + 0.5) / n) * hordes.length));
    const order = [];
    for (let k = 0; k < hordes.length; k++) for (const i of k ? [want + k, want - k] : [want]) if (i >= 0 && i < hordes.length && !order.includes(i)) order.push(i);
    for (const i of order) {
      if (used.has(i)) continue;
      const h = hordes[i], base = spotFor(kind, h);
      let at = null;
      for (let d = 0; d <= reach && at == null; d += 1) for (const z of d ? [base - d, base + d] : [base]) if (at == null && fits(blocks, kind, z, lo, hi)) at = z;
      if (at == null) continue;
      used.add(i);
      const ev = { type: 'prop', kind, at };
      if (kind !== 'bell') ev.lane = kind === 'crane' && (h.lane === 'L' || h.lane === 'R') ? h.lane : r.chance(0.5) ? 'L' : 'R';
      if (kind !== 'boulder') ev.hp = propHp(def, kind);
      if (lesson && TEACH[kind] === def.id) ev.hint = PROP_HINTS[kind];
      def.events.push(ev);
      blocks.push([at - CLEAR.prop[0], at + CLEAR.prop[1]]);
      return true;
    }
    return false;
  };
  let placed = 0;
  kinds.forEach((kind, j) => { if (place(kind, j, kinds.length, 8)) placed++; });
  // crowded level (e.g. L24 after the stage-4 road pass): no spot found - try every kind once with a wider search
  if (!placed && !lesson) for (const kind of PROP_KINDS) if (place(kind, 0, 1, 24)) break;
  return def;
}

/** The road-object events of a level def (tests / tools). */
export const propsOf = (def) => def.events.filter((e) => e.type === 'prop');
