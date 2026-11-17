// Road shapes (data only): planRoad(def) breaks pieces off the bridge of every campaign level. It adds
// { type:'gap', style:'cliff', ... } events at module load (levels.js calls it for every level, before the
// world hazards are planned, so those keep clear of it). The mechanics are the gap's (game/obstacles.js):
// Raiders who run over the void fall; `inner` is how far from the centre line the void starts.
// Rules: deterministic (one Rng per level id); existing beats never move; a section never overlaps a gate,
// barrel, crate, blade, another gap, a power-up or a coin line (clearances below), so the only good gate is
// never floating over the void; a section keeps off the road where a one-lane horde is met; sections end
// before the final rush / boss arena.
// Sections:
//   bite     the outer strip of one lane breaks away (a squad on the centre line is safe)        L1+
//   narrow   both edges go: squeeze onto the centre strip                                         L3+
//   cliff    one whole lane breaks away                                                           L5+
//   zigzag   one lane goes, then the other, with a stretch of whole road to cross over on         L6+
//   funnel   the bridge tapers step by step to a thin strip and widens again                      L9+
//   slalom   three or four short cliffs on alternating lanes                                      L12+
//   ledge    one lane and most of the other go: a thin ledge along one edge of the divider        L16+
// Difficulty rises with the level id: more sections per level, longer ones, tighter strips, shorter
// crossovers. Up to L4 only bites and one wide narrow bridge (a player who barely steers still wins).
import { Rng } from '../core/rng.js';
import { START, ARENA } from './beats.js';

/** Clearance a section keeps from other events: [before the event, after its end] (u). */
export const ROAD_CLEAR = { gate: [7, 7], barrel: [5, 5], crate: [12, 12], gap: [8, 8], blade: [5, 5], powerup: [3, 3], coins: [1, 1], hazard: [4, 4] };
const SPAN = { coins: 12 };
const other = (lane) => (lane === 'L' ? 'R' : 'L');
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const r2 = (v) => Math.round(v * 100) / 100;

const piece = (dz, lane, length, extra = {}) => ({ dz, lane, length, ...extra });

/** (r, t 0..1, f = length scale for a tight stretch) -> { length, pieces:[{ dz, lane, length, inner?, label?, first?, last? }] } */
export const SECTIONS = {
  bite(r, t, f = 1) {
    const length = even((12 + 6 * t) * f);
    return { length, pieces: [piece(0, r.pick(['L', 'R']), length, { inner: r2(2.6 - 1.0 * t) })] };
  },
  narrow(r, t, f = 1) {
    const length = even((14 + 10 * t) * f), inner = r2(2.8 - 1.0 * t);
    return { length, pieces: ['L', 'R'].map((lane) => piece(0, lane, length, { inner, label: 'NARROW!' })) };
  },
  cliff(r, t, f = 1) {
    const length = even((16 + 12 * t) * f);
    return { length, pieces: [piece(0, r.pick(['L', 'R']), length)] };
  },
  zigzag(r, t) {
    const len = even(10 + 4 * t), between = even(16 - 6 * t), first = r.pick(['L', 'R']);
    return { length: len * 2 + between, pieces: [piece(0, first, len), piece(len + between, other(first), len)] };
  },
  funnel(r, t) {
    // five steps of 6 u: wide, tighter, thin, tighter, wide (drawn as one tapering bridge)
    const steps = [3.7, 2.9, r2(2.2 - 0.5 * t), 2.9, 3.7], seg = 6;
    const pieces = [];
    steps.forEach((inner, i) => {
      for (const lane of ['L', 'R']) pieces.push(piece(i * seg, lane, seg, { inner, label: 'NARROW!', first: i === 0, last: i === steps.length - 1, chain: true }));
    });
    return { length: seg * steps.length, pieces };
  },
  slalom(r, t) {
    const n = t > 0.5 ? 4 : 3, len = 8, between = even(11 - 3 * t);
    let lane = r.pick(['L', 'R']);
    const pieces = [];
    for (let i = 0; i < n; i++) { pieces.push(piece(i * (len + between), lane, len)); lane = other(lane); }
    return { length: n * len + (n - 1) * between, pieces };
  },
  ledge(r, t, f = 1) {
    // one whole lane is gone and the other keeps only a strip along the divider
    const length = even((12 + 6 * t) * f), gone = r.pick(['L', 'R']);
    return { length, pieces: [piece(0, gone, length, { label: 'LEDGE!' }), piece(0, other(gone), length, { inner: r2(3.0 - 0.8 * t), label: 'LEDGE!' })] };
  },
};

/** Section kinds open to a level id, weighted (later kinds are the harder ones). */
function poolFor(id) {
  if (id <= 2) return ['bite'];
  if (id <= 4) return ['bite', 'bite', 'narrow'];
  const pool = ['cliff', 'cliff', 'narrow', 'bite'];
  if (id >= 6) pool.push('zigzag', 'zigzag');
  if (id >= 9) pool.push('funnel', 'funnel');
  if (id >= 12) pool.push('slalom', 'slalom');
  if (id >= 16) pool.push('ledge', 'ledge');
  return pool;
}

/** How many sections a level asks for (it gets as many as fit). */
export function roadCount(def) {
  const id = def.id;
  let n = id <= 2 ? 1 : id <= 4 ? 2 : Math.min(8, 3 + Math.floor(id / 6));
  if (def.kind === 'boss' || def.kind === 'mini') n = Math.max(1, n - 1);
  return n;
}

function fitAt(blocks, base, len, lo, hi, range = 50) {
  range = Math.max(range, hi - lo);
  for (let k = 0; k <= range; k += 2) {
    for (const z of k ? [base + k, base - k] : [base]) {
      if (z < lo || z + len > hi) continue;
      let ok = true;
      for (const [a, b] of blocks) if (z < b && z + len > a) { ok = false; break; }
      if (ok) return z;
    }
  }
  return null;
}

/** Adds the level's road sections (idempotent). Returns def. */
export function planRoad(def) {
  if (!def || def.road) return def;
  def.road = [];
  const r = new Rng(def.id * 7919 + 101);
  const id = def.id;
  // t: 0 on the first levels, 1 around L40; the first four levels stay at their gentlest
  const t = id <= 4 ? 0 : Math.max(0, Math.min(1, (id - 4) / 36));
  const span = def.layout ?? def.length;
  const lo = START + 14, hi = span - ARENA - 4;
  const blocks = [];
  for (const e of def.events) {
    const c = ROAD_CLEAR[e.type];
    if (c) blocks.push([e.at - c[0], e.at + (e.length || SPAN[e.type] || 0) + c[1]]);
    // a horde meets the squad ~18 u before the spot it starts from. One that comes down a single lane must
    // not find the squad pinned on the far side of a cliff (its fire would miss the pack until it arrives),
    // and early in a level, while the squad is a handful, no horde is fought on a broken bridge at all.
    else if (e.type === 'horde' && !e.rush) {
      if (e.lane === 'L' || e.lane === 'R') blocks.push([e.at - 30, e.at + 4]);
      else if (e.at < lo + (hi - lo) * 0.35) blocks.push([e.at - 24, e.at + 2]);
    }
  }
  const pool = poolFor(id), n = roadCount(def);
  let last = '';
  for (let j = 0; j < n; j++) {
    let kind = r.pick(pool);
    if (kind === last && pool.length > 1) kind = r.pick(pool); // fewer repeats
    last = kind;
    const p = Math.max(0, Math.min(1, (j + 0.5) / n + r.range(-0.05, 0.05)));
    // a section that finds no room is tried again as one of the short kinds
    // (a level's beats are dense: the section slides along the level to the nearest free stretch, then shrinks)
    let placed = false;
    const fb = id < 5 ? 'bite' : ['cliff', 'narrow', 'bite'][j % 3]; // the short kinds, in turn
    for (const [k, f] of [[kind, 1], [kind, 0.75], [fb, 0.75], [fb, 0.55]]) {
      if (placed) break;
      const sec = SECTIONS[k](r, t, f);
      const at = fitAt(blocks, even(lo + p * Math.max(0, hi - lo - sec.length)), sec.length, lo, hi);
      if (at == null) continue;
      placed = true;
      for (const pc of sec.pieces) {
        const { dz, lane, length, ...extra } = pc;
        def.events.push({ type: 'gap', at: at + dz, lane, length, style: 'cliff', road: k, ...extra });
      }
      def.road.push({ kind: k, at, length: sec.length });
      blocks.push([at - ROAD_CLEAR.gap[0], at + sec.length + ROAD_CLEAR.gap[1]]);
    }
  }
  return def;
}

/** The road sections of a level def (tests / tools). */
export const roadOf = (def) => def.road || [];
