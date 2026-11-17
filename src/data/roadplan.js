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
//   fork     the middle falls out: a wide safe strip on one rail, a thin one with coins and a
//            power-up on the other                                                                L7+
//   bridge   the whole road is out but a thin plank; break the BRIDGE barrel before it to lay
//            the planks back (shoot-to-build)                                                     L8+
//   pad      a hole right across the road with a bounce pad before it (the Candy jelly pad)       L7+
//   gust     a cliff with a side wind that shoves the squad toward the drop                       L10+
//   deck     a hole right across the road with a deck sliding from side to side over it           L13+
// Thin strips carry coins (risk for reward). The last three borrow world hazards (hazards/candy.js,
// hazards/citadel.js) and are left out in those hazards' own worlds, which already have plenty.
// Difficulty rises with the level id: more sections per level, longer ones, tighter strips, shorter
// crossovers. Up to L4 only bites and one wide narrow bridge (a player who barely steers still wins).
import { Rng } from '../core/rng.js';
import { START, ARENA } from './beats.js';
import { MAKERS, HINTS } from './hazardplan.js';
import { worldOf } from './worlds.js';

/** Clearance a section keeps from other events: [before the event, after its end] (u). */
export const ROAD_CLEAR = { gate: [7, 7], barrel: [5, 5], crate: [12, 12], gap: [8, 8], blade: [5, 5], powerup: [3, 3], coins: [1, 1], hazard: [4, 4] };
const SPAN = { coins: 12 };
const other = (lane) => (lane === 'L' ? 'R' : 'L');
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const r2 = (v) => Math.round(v * 100) / 100;

const piece = (dz, lane, length, extra = {}) => ({ dz, lane, length, ...extra });
const EDGE_X = 4.75;   // outermost x a Raider can stand on (config MEMBER_CLAMP)
// a short coin line down a thin strip (x = its middle), a little in from both ends
const coinLine = (dz, x, length) => ({ type: 'coins', dz: dz + 2, x: r2(x), count: Math.max(3, Math.floor((length - 4) / 1.5)), pattern: 'line' });

/** (r, t 0..1, f = length scale for a tight stretch) -> { length, pieces:[{ dz, lane, length, inner?, label?, first?, last? }] } */
export const SECTIONS = {
  bite(r, t, f = 1) {
    const length = even((12 + 6 * t) * f);
    return { length, pieces: [piece(0, r.pick(['L', 'R']), length, { inner: r2(2.6 - 1.0 * t) })] };
  },
  narrow(r, t, f = 1) {
    const length = even((14 + 10 * t) * f), inner = r2(2.8 - 1.0 * t);
    return { length, pieces: ['L', 'R'].map((lane) => piece(0, lane, length, { inner, label: 'NARROW!' })), extras: t > 0.15 ? [coinLine(0, r.pick([-1, 1]) * inner * 0.55, length)] : [] };
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
    return { length, pieces: [piece(0, gone, length, { label: 'LEDGE!' }), piece(0, other(gone), length, { inner: r2(3.0 - 0.8 * t), label: 'LEDGE!' })],
      extras: [coinLine(0, (gone === 'L' ? 1 : -1) * (0.22 + r2(3.0 - 0.8 * t)) / 2, length)] };
  },
  fork(r, t, f = 1) {
    // the middle is gone. Safe side: a wide strip. Risky side: a thin one, with coins and a power-up on it
    const length = even((16 + 8 * t) * f), risky = r.pick(['L', 'R']);
    const thin = r2(1.7 - 0.4 * t), wide = r2(2.7 - 0.5 * t);
    const xa = EDGE_X - (risky === 'L' ? thin : wide), xb = EDGE_X - (risky === 'R' ? thin : wide);
    const rx = (risky === 'L' ? -1 : 1) * (EDGE_X - thin / 2 - 0.1);
    return { length, pieces: [piece(0, 'M', length, { xa: r2(xa), xb: r2(xb) })],
      extras: [coinLine(0, rx, length), { type: 'powerup', dz: even(length / 2), x: r2(rx), kind: r.pick(['shield', 'rapid', 'magnet', 'freeze']) }] };
  },
  bridge(r, t) {
    // 14 u of whole road with the BRIDGE barrel in one lane, then the hole with its plank down the middle
    const lead = 14, length = even(12 + 8 * t), inner = r2(2.0 - 0.6 * t), tag = 'bridge';
    return { length: lead + length,
      pieces: ['L', 'R'].map((lane) => piece(lead, lane, length, { inner, style: 'hole', tag, label: 'SHOOT!', signText: 'BUILD THE BRIDGE' })),
      extras: [{ type: 'barrel', dz: 2, lane: r.pick(['L', 'R']), bridge: true, reward: { kind: 'bridge', tag } }] };
  },
  pad(r, t) {
    const p = MAKERS.jelly(r, { t, gentle: t < 0.2 });
    return { length: p.length, pieces: [], extras: [{ type: 'hazard', kind: 'jelly', dz: 0, hint: HINTS.jelly, ...p }], home: 4 };
  },
  deck(r, t) {
    const p = MAKERS.platform(r, { t: t * 0.7, gentle: t < 0.3 });
    return { length: p.length, pieces: [], extras: [{ type: 'hazard', kind: 'platform', dz: 0, hint: HINTS.platform, ...p }], home: 5 };
  },
  gust(r, t, f = 1) {
    // the wind starts a little before the edge and blows toward the side that is gone
    const length = even((16 + 10 * t) * f), lane = r.pick(['L', 'R']), pre = 8;
    return { length: pre + length + 2, pieces: [piece(pre, lane, length)],
      extras: [{ type: 'hazard', kind: 'wind', dz: 0, length: pre + length + 2, dir: lane === 'L' ? -1 : 1, push: r2(4 + 2.5 * t), period: r2(2.6 - 0.4 * t), hint: 'WIND! It blows toward the cliff' }], home: 5 };
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
  if (id >= 7) pool.push('pad', 'pad');   // (forks are set pieces: one per level, placed early; see planRoad)
  if (id >= 8) pool.push('bridge', 'bridge');
  if (id >= 10) pool.push('gust');
  if (id >= 13) pool.push('deck');
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
  const world = worldOf(id).id;
  const pool = poolFor(id), n = roadCount(def);
  let seq = 0;
  let last = '';
  // the set pieces come first, while the level still has its long free stretches: every level from L8 has a
  // shoot-to-build bridge and every level from L7 a fork (if they fit at all)
  // The fork comes early, while the squad still fits on one of its strips (a blob of hundreds cannot choose
  // a side); the bridge comes later, when there is firepower to build it.
  const must = id >= 8 ? ['fork', 'bridge'] : id >= 7 ? ['fork'] : [];
  for (let j = 0; j < n; j++) {
    let kind = j < must.length ? must[j] : r.pick(pool);
    if (j >= must.length && kind === last && pool.length > 1) kind = r.pick(pool); // fewer repeats
    last = kind;
    // spread along the level (the fork near the start, the bridge past the middle, the rest fill in around them)
    const p = j < must.length ? 0.16 + 0.46 * j + r.range(-0.04, 0.04) : Math.max(0, Math.min(1, (j + 0.5) / n + r.range(-0.05, 0.05)));
    // a section that finds no room is tried again as one of the short kinds
    // (a level's beats are dense: the section slides along the level to the nearest free stretch, then shrinks)
    let placed = false;
    const fb = id < 5 ? 'bite' : ['cliff', 'narrow', 'bite'][j % 3]; // the short kinds, in turn
    for (const [k, f] of [[kind, 1], [kind, 0.75], [fb, 0.75], [fb, 0.55]]) {
      if (placed) break;
      const sec = SECTIONS[k](r, t, f);
      if (sec.home === world) continue; // that world's own hazard: it has plenty already
      // a fork only in the first two fifths of a level: later the squad is a blob that cannot pick a side
      const top = k === 'fork' ? lo + (hi - lo) * 0.4 : hi;
      const at = fitAt(blocks, even(lo + p * Math.max(0, top - lo - sec.length)), sec.length, lo, top);
      if (at == null) continue;
      placed = true;
      const uid = `${k}${++seq}`;
      for (const pc of sec.pieces) {
        const { dz, lane, length, ...extra } = pc;
        if (extra.tag) extra.tag = uid;
        def.events.push({ type: 'gap', at: at + dz, lane, length, style: 'cliff', road: k, ...extra });
      }
      for (const ex of sec.extras || []) {
        const { dz, ...rest } = ex;
        const ev = { ...rest, at: at + dz, road: k };
        if (ev.type === 'barrel') {
          // half as tough as the nearest barrel before it: breakable in the time there is, if you aim at it
          let ref = null;
          for (const b of def.events) if (b.type === 'barrel' && !b.bridge && b.at <= ev.at && (!ref || b.at > ref.at)) ref = b;
          ev.hp = Math.max(8, Math.round((ref ? ref.hp : 12) * 0.5));
          ev.reward = { ...ev.reward, tag: uid };
        }
        def.events.push(ev);
      }
      def.road.push({ kind: k, at, length: sec.length });
      blocks.push([at - ROAD_CLEAR.gap[0], at + sec.length + ROAD_CLEAR.gap[1]]);
    }
  }
  return def;
}

/** The road sections of a level def (tests / tools). */
export const roadOf = (def) => def.road || [];
