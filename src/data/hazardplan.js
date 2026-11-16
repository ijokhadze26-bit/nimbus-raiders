// World hazard placement (update 3, data only). planHazards(def) adds { type:'hazard', kind, at, ...params }
// events to a level of world >= 2 at module load (levels.js calls it for every level after the list is built).
// Rules: deterministic (one Rng per level id); existing beats never move; a hazard never overlaps a gate,
// barrel, crate, gap, blade, power-up or coin line (each keeps its clearance below), so a lethal hazard is never
// where the only good gate is; hazards end before the final rush / boss arena. Kinds that only change the air
// (OVERLAY: the snowstorm) may lie over anything but a weapon crate (crates keep 12 u clear of every event). Intro levels (11, 21, 31, 41) teach the world's kinds one at a
// time, early and gentle, each with a short HUD hint; later levels mix 2-4 kinds with rising density (t = how
// far into the campaign the level is), mini-boss / boss levels have fewer. World 1 keeps blades / gaps only.
// To add a world: list its kinds in WORLD_KINDS, give each a MAKERS entry (+ HINTS text) and register the kind
// module in src/game/hazards/registry.js.
import { Rng } from '../core/rng.js';
import { START, ARENA } from './beats.js';

export const WORLD_KINDS = {
  2: ['lava', 'ember', 'crack', 'geyser'],
  3: ['ice', 'snow', 'icicle', 'avalanche'],
  4: ['jelly', 'syrup', 'choco', 'gumball'],
  5: ['platform', 'lightning', 'collapse', 'wind'],
};

export const HINTS = {
  lava: 'LAVA! Stay on the stones',
  ember: 'FALLING EMBERS! Dodge the red circles',
  crack: 'CRACKED FLOOR! Get off before it falls',
  geyser: 'FIRE GEYSERS! Pass between the blasts',
  ice: 'ICE! Your steering slides',
  snow: 'SNOWSTORM! Gates show up late',
  icicle: 'ICICLES! Dodge the blue shadows',
  avalanche: 'AVALANCHE! Steer against the push',
  jelly: 'JELLY PAD! Hit it to bounce over the gap',
  syrup: 'SYRUP! It slows you down',
  gumball: 'GUMBALLS! Shoot them or dodge',
  choco: 'CHOCOLATE FALLS! Pass between the pours',
  platform: 'MOVING PLATFORM! Stay on it',
  lightning: 'LIGHTNING! Dodge the purple marks',
  wind: 'WIND! Steer against the gusts',
  collapse: 'FALLING BRIDGE! Take the solid side',
};

/** Clearance a hazard keeps from other events: [before the event, after its end] (u). */
export const CLEAR = { gate: [7, 8], barrel: [4, 4], crate: [12, 12], gap: [4, 4], blade: [4, 4], powerup: [2, 2], coins: [1, 1], hazard: [3, 3] };
const SPAN = { coins: 12 };           // road taken by events without a length
export const OVERLAY = new Set(['snow']);
/** Standing hazards that kill on their spot also keep off power-ups and coin lines (no lure into the lava). */
export const LETHAL = new Set(['lava', 'geyser', 'crack', 'jelly', 'choco', 'platform', 'collapse']);
const SOFT_BLOCK = new Set(['powerup', 'coins']);
/** Kinds whose length may shrink (x0.75, x0.55) to fit a tight stretch. */
const SHRINK = new Set(['ember', 'icicle', 'ice', 'snow', 'crack', 'syrup', 'lightning', 'wind', 'platform', 'collapse']);

const lanePick = (r) => (r.chance(0.5) ? 'L' : 'R');
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Params per kind: (r, { t: 0..1 difficulty, gentle, p: 0..1 through the level }) -> { length (road it takes),
 * ...event params }. Jelly / platform / collapse cut a hole across the whole road (their length covers it).
 */
export const MAKERS = {
  lava(r, { t, gentle }) {
    if (gentle) return { lane: 'both', length: 4, paths: [0], pathHalf: 1.35, rate: 10 };
    if (r.chance(0.5)) return { lane: lanePick(r), length: 8 + Math.round(6 * t), rate: r2(12 + 8 * t) };
    const paths = t > 0.45 && r.chance(0.5) ? [-2.6, 2.6] : [r.pick([-2.5, 0, 2.5])];
    return { lane: 'both', length: 4 + Math.round(2 * t), paths, pathHalf: r2(1.25 - 0.15 * t), rate: r2(12 + 8 * t) };
  },
  ember(r, { t, gentle }) {
    return gentle ? { length: 24, every: 1.7, r: 1.3, warn: 1.4 } : { length: 26 + Math.round(12 * t), every: r2(1.3 - 0.45 * t), r: 1.35, warn: r2(1.15 - 0.15 * t) };
  },
  crack(r, { t, gentle }) {
    return { lane: lanePick(r), length: gentle ? 20 : 22 + 2 * Math.round(2 * t), delay: gentle ? 2.6 : r2(2.4 - 0.4 * t) };
  },
  geyser(r, { t, gentle }) {
    const count = gentle ? 1 : r.int(1, 2 + Math.round(t));
    return { lane: lanePick(r), count, spacing: 9, length: (count - 1) * 9 + 4, period: gentle ? 3.8 : r2(3.5 - 0.6 * t), on: r2(1 + 0.2 * t), warn: 1.0, r: 1.5 };
  },
  ice(r, { t, gentle }) {
    return { lane: gentle ? 'both' : r.pick(['both', 'both', 'L', 'R']), length: gentle ? 18 : 18 + Math.round(12 * t), slide: r2(0.8 + 0.1 * t) };
  },
  snow(r, { t, gentle }) {
    return { length: gentle ? 50 : 60 + Math.round(40 * t), fog: gentle ? 0.5 : r2(0.4 - 0.08 * t), wind: r.chance(0.5) ? -3.5 : 3.5 };
  },
  icicle(r, { t, gentle }) {
    return gentle ? { length: 24, every: 1.6, r: 1.2, warn: 1.4 } : { length: 26 + Math.round(12 * t), every: r2(1.25 - 0.4 * t), r: 1.2, warn: r2(1.15 - 0.15 * t) };
  },
  avalanche(r, { t, gentle }) {
    return { from: lanePick(r), length: 18, push: gentle ? 6.5 : r2(8 + 2 * t), dur: 1.5, warn: gentle ? 1.6 : 1.3 };
  },
  jelly(r, { t, gentle }) {
    const pad = 3.5, gap = gentle ? 6 : 6 + 2 * Math.round(2 * t);
    if (gentle) return { side: 'both', pad, gap, length: pad + 3 + gap };
    return { side: lanePick(r), frac: r2(0.72 - 0.14 * t), pad, gap, length: pad + 3 + gap };
  },
  syrup(r, { t, gentle }) {
    if (gentle) return { lane: 'both', length: 14, slow: 0.65, ease: 0.45 };
    return { lane: r.pick(['both', 'L', 'R', 'L', 'R']), length: 14 + Math.round(10 * t), slow: r2(0.62 - 0.1 * t), ease: 0.4 };
  },
  gumball(r, { t, gentle, p = 0.5 }) {
    // length: the road the balls roll down to meet the squad (gumball.js ROLL_LEN + 6 per ball, spacing apart)
    if (gentle) return { lane: lanePick(r), count: 1, spacing: 10, roll: 5, hp: 40, length: 20 };
    const count = r.int(1, 2 + Math.round(t));
    return { lane: lanePick(r), count, spacing: 10, roll: r2(6 + 3 * t), hp: Math.round(60 + 280 * t + 160 * p), zigzag: r.chance(0.5), length: 20 + (count - 1) * 10 };
  },
  choco(r, { t, gentle }) {
    if (gentle) return { lane: lanePick(r), count: 1, spacing: 10, period: 3.6, on: 1.4, warn: 1.0, length: 4 };
    const count = r.int(1, 2 + Math.round(t));
    return { lane: lanePick(r), count, spacing: 10, period: r2(3.4 - 0.5 * t), on: r2(1.3 + 0.3 * t), warn: 0.9, zigzag: r.chance(0.5), length: (count - 1) * 10 + 4 };
  },
  platform(r, { t, gentle }) {
    if (gentle) return { length: 14, w: 7, amp: 0.8, period: 5 };
    return { length: 16 + 2 * Math.round(3 * t), w: r2(6.4 - 1.0 * t), amp: r2(1.3 + 1.1 * t), period: r2(4.6 - 1.0 * t) };
  },
  lightning(r, { t, gentle }) {
    return gentle ? { length: 24, every: 1.6, r: 1.4, warn: 1.5 } : { length: 26 + Math.round(12 * t), every: r2(1.2 - 0.4 * t), r: 1.45, warn: r2(1.3 - 0.15 * t) };
  },
  wind(r, { t, gentle }) {
    const dir = r.chance(0.5) ? 1 : -1;
    return gentle ? { length: 30, dir, push: 4.5, period: 2.6 } : { length: 30 + Math.round(20 * t), dir, push: r2(5.5 + 3 * t), period: r2(2.6 - 0.5 * t) };
  },
  collapse(r, { t, gentle }) {
    if (gentle) return { length: 16, weak: lanePick(r), warn: 1.0, fast: 1.35, slow: 0.8 };
    // the shake warning never drops under 0.9 s (STAGE2 floor); the weak lane's faster fall carries the difficulty
    return { length: 18 + 2 * Math.round(2 * t), weak: lanePick(r), warn: 0.9, fast: r2(1.6 + 0.5 * t), slow: 0.85 };
  },
};

/**
 * First z in base, base +-2, +-4 ... (+-range) where [z, z + len] keeps clear of the blocks that matter, or null.
 * blocks: [from, to, cls] with cls 'hard' | 'soft' (power-ups / coins: only lethal kinds avoid them) | 'crate'
 * (every kind, overlays too).
 */
function fitAt(blocks, base, len, lo, hi, overlay, lethal, range = 60) {
  for (let k = 0; k <= range; k += 2) {
    for (const z of k ? [base + k, base - k] : [base]) {
      if (z < lo || z + len > hi) continue;
      let ok = true;
      for (const [a, b, cls] of blocks) {
        if (overlay ? cls !== 'crate' : cls === 'soft' && !lethal) continue;
        if (z < b && z + len > a) { ok = false; break; }
      }
      if (ok) return z;
    }
  }
  return null;
}

/** Which kinds at which fraction of the level (intro: each kind once, early, gentle, hinted). */
function itemsFor(def, kinds, r, idx) {
  if (def.kind === 'intro') {
    const out = kinds.map((k, i) => ({ k, p: 0.06 + i * 0.16, gentle: true, hint: HINTS[k], range: 140 }));
    // a long intro (L11 keeps its full-length beats) repeats the first kind twice near the end
    if ((def.layout ?? def.length) > 450) out.push({ k: kinds[0], p: 0.78 }, { k: kinds[0], p: 0.92 });
    return out;
  }
  const boss = def.kind === 'boss' || def.kind === 'mini';
  const n = boss ? 2 : 3 + Math.round(3 * idx / 9);
  const size = boss ? 2 : idx <= 3 ? 2 : idx <= 6 ? 3 : 4;
  const pool = kinds.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = r.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const use = pool.slice(0, Math.min(size, pool.length));
  const out = [];
  for (let j = 0; j < n; j++) out.push({ k: use[j % use.length], p: Math.max(0, Math.min(1, (j + 0.5) / n + r.range(-0.04, 0.04))) });
  return out;
}

/** Adds the level's world hazards (idempotent). Returns def. */
export function planHazards(def) {
  if (!def || !(def.world >= 2) || def.events.some((e) => e.type === 'hazard')) return def;
  const kinds = WORLD_KINDS[def.world];
  if (!kinds || !kinds.length) return def;
  const r = new Rng(def.id * 977 + 13);
  const idx = (def.id - 1) % 10;
  const t = Math.max(0, Math.min(1, idx / 9 + 0.12 * (def.world - 2)));
  const span = def.layout ?? def.length;
  const lo = START + 12, hi = span - ARENA - 2;
  const blocks = [];
  for (const e of def.events) {
    const c = CLEAR[e.type];
    if (c) blocks.push([e.at - c[0], e.at + (e.length || SPAN[e.type] || 0) + c[1], e.type === 'crate' ? 'crate' : SOFT_BLOCK.has(e.type) ? 'soft' : 'hard']);
  }
  for (const it of itemsFor(def, kinds, r, idx)) {
    const params = MAKERS[it.k](r, { t, gentle: !!it.gentle, p: it.p });
    const overlay = OVERLAY.has(it.k) && !it.hint, lethal = LETHAL.has(it.k);
    let at = null, len = params.length || 0;
    // a lesson that finds no room near its spot may move anywhere in the level (every kind gets taught)
    for (const range of it.hint ? [it.range, hi - lo] : [it.range]) {
      for (const f of SHRINK.has(it.k) ? [1, 0.75, 0.55] : [1]) {
        len = Math.round((params.length || 0) * f / 2) * 2;
        at = fitAt(blocks, Math.round(lo + it.p * Math.max(0, hi - lo - len)), len, lo, hi, overlay, lethal, range);
        if (at != null) break;
      }
      if (at != null) break;
    }
    if (at == null) continue;
    const ev = { type: 'hazard', kind: it.k, at, ...params, length: len };
    if (it.hint) ev.hint = it.hint;
    def.events.push(ev);
    // taught kinds come one at a time: a lesson keeps the road around it to itself (hints never overlap)
    if (it.hint) blocks.push([at - 30, at + len + 40, 'hard']);
    else if (!overlay) blocks.push([at - CLEAR.hazard[0], at + len + CLEAR.hazard[1], 'hard']);
  }
  return def;
}

/** The hazard events of a level def (tests / tools). */
export const hazardsOf = (def) => def.events.filter((e) => e.type === 'hazard');
