// Road layout pass (update 3 stage 4, data only). planRoad(def) runs once per campaign level at module load,
// after the hazards (levels.js), and never moves a beat. It reshapes existing gate rows and adds two kinds of event:
// - 3-LANE STRETCH { type:'lanes3', at, length } (world 2+, 1-2 per level): the road shows two dividers at
//   x = +-1.65 instead of one, and the gate row inside becomes 3 narrower gates (lanes L3 / C3 / R3 at
//   x = -3.3 / 0 / 3.3). The new middle gate is never better than the row's best gate (a compromise or a trap).
// - RAMP GATE: `ramp: true` on a gate (level 3+): the gate stands on a short hump, the squad runs up and over it.
// - CHAIN GATES: `chain: id, link: k` on 2-3 consecutive rows. Row 0 offers an add gate and a x/÷ gate; each
//   following row carries `alt: { add, mul }` (a gate spec per family of the gate picked one row earlier) and shows
//   '?' until that pick is made. Pick + now -> the next row offers x vs ÷ (the x on the far side); pick x now -> it
//   offers + vs - (the + on the far side). Both branches come from the row's own numbers (balance stays put).
// - RESCUE CAGE { type:'cage', at, lane:'L'|'R', count, hp } (level 2+, 4 levels per world): shoot the lock to
//   free `count` (3-12) Raiders. Kept clear of gates, barrels, crates, gaps, blades, hazards and the arena.
// Deterministic (own Rng per level id). Hidden gates (harder.js) are never reshaped.
import { Rng } from '../core/rng.js';
import { START, ARENA, FIX } from './beats.js';

export const LANES3 = { L3: -3.3, C3: 0, R3: 3.3 };
export const DIV3 = 1.65;
export const ROAD_HINTS = {
  lanes3: '3 LANES! Steer into the narrow gates',
  chain: 'CHAIN GATES! Your pick changes the next row',
  cage: 'RESCUE CAGE! Shoot the lock',
  ramp: 'RAMP GATE! Run up and through',
};
/** First level that shows each feature (its first event carries the hint). */
export const FIRST = { cage: 2, ramp: 3, chain: 4, lanes3: 12 };
const BEFORE3 = 20, AFTER3 = 9;               // 3-lane stretch: road before / after its gate row
const RAMP_SPAN = [7, 6];                     // ramp hump: before / after the gate (u)
const CAGE_IDX = new Set([1, 3, 6, 8]);       // level index in its world (0..9) that gets a cage

/** Chain branch of a gate: 'add' = a + gate, 'mul' = anything else (x, ÷ or a - gate: the next row then offers + vs -). */
const fam = (e) => (e.op === 'add' && e.value > 0 ? 'add' : 'mul');
const mixedRow = (row) => row.gates.some((g) => fam(g) === 'add') && row.gates.some((g) => fam(g) === 'mul');
const isPair = (row) => row.gates.length === 2 && row.gates.some((g) => g.lane === 'L') && row.gates.some((g) => g.lane === 'R');
/** A row with a climbing x/÷ ladder: it stays a full-width, unchained gate (a narrow or replaced ladder breaks its shoot-to-climb economy). */
const ladderRow = (row) => row.gates.some((g) => g.op !== 'add' && (g.hitsPerStep ?? 12) < FIX);
const free = (row) => row.gates.every((g) => !g.hidden && !g.chain && !g.ramp && !g.three);
const addSpec = (value, max) => ({ op: 'add', value, max: Math.max(value, max) });
const mulSpec = (rung, moving) => ({ op: rung >= 3 ? 'mul' : 'div', rung, hitsPerStep: FIX, ...(moving ? { moving } : {}) });

function gateRows(def) {
  const by = new Map();
  for (const e of def.events) if (e.type === 'gate') { if (!by.has(e.at)) by.set(e.at, { at: e.at, gates: [] }); by.get(e.at).gates.push(e); }
  return [...by.values()].sort((p, q) => p.at - q.at);
}

/** [from, to] road spans a reshaped row / a cage must keep clear of (hazards except air-only, gaps, blades). */
function blockers(def) {
  const out = [];
  for (const e of def.events) {
    if (e.type === 'hazard' && e.kind !== 'snow') out.push([e.at, e.at + (e.length || 0), e.lane || 'both']);
    else if (e.type === 'gap' || e.type === 'blade') out.push([e.at, e.at + (e.length || 0), e.lane || 'both']);
    else if (e.type === 'crate') out.push([e.at - 12, e.at + 12, e.lane]); // crates keep 12 u clear of every event (levelcrates)
  }
  return out;
}
const hits = (spans, a, b) => spans.some(([s, t]) => a < t && b > s);

/** Up to n rows (picked with r, spread out) that pass ok(). */
function pickRows(rows, n, r, ok) {
  const cand = rows.filter(ok);
  const out = [];
  while (out.length < n && cand.length) {
    const i = r.int(0, cand.length - 1);
    const row = cand.splice(i, 1)[0];
    if (out.every((o) => Math.abs(o.at - row.at) > 60)) out.push(row);
  }
  return out;
}

function bestAdd(gates) {
  let v = 0;
  for (const g of gates) if (g.op === 'add' && g.value > v) v = g.value;
  return v;
}

// ---------------- 3-lane stretches ----------------
/** [from, to] of a 3-lane stretch around row: up to BEFORE3 / AFTER3, shrunk to stay off blockers (null = no room). */
function stretch(row, rows, spans) {
  let a = row.at - BEFORE3, b = row.at + AFTER3;
  for (const [s, t] of spans) {
    if (s < row.at + 2 && t > row.at - 2) return null;
    if (t <= row.at && t + 2 > a) a = t + 2;
    if (s >= row.at && s - 2 < b) b = s - 2;
  }
  for (const o of rows) {
    if (o === row) continue;
    if (o.at < row.at && o.at + 8 > a) a = o.at + 8;
    if (o.at > row.at && o.at - 8 < b) b = o.at - 8;
  }
  return row.at - a >= 8 && b - row.at >= 4 ? [a, b] : null;
}

function planLanes3(def, rows, r, spans) {
  if (def.world < 2 || def.id < FIRST.lanes3 || def.kind === 'intro') return [];
  const idx = (def.id - 1) % 10;
  const n = def.kind === 'normal' && idx >= 5 ? 2 : 1;
  const span = def.layout ?? def.length;
  const fits = (row) => isPair(row) && free(row) && row.at > START + 30 && row.at < span - ARENA - 12 && stretch(row, rows, spans);
  // rows with one + and one x gate are left for the chains when another row fits
  const picked = pickRows(rows, n, r, (row) => fits(row) && !mixedRow(row));
  if (picked.length < n) for (const row of pickRows(rows, n, r, fits)) if (picked.length < n && picked.every((o) => Math.abs(o.at - row.at) > 60)) picked.push(row);
  const out = [];
  for (const row of picked) {
    const [l, rt] = row.gates[0].lane === 'L' ? row.gates : [row.gates[1], row.gates[0]];
    l.lane = 'L3'; rt.lane = 'R3';
    // a narrow ladder catches ~3/4.4 of the fire: it climbs that much faster, so its shoot-to-climb economy holds
    for (const g of row.gates) { g.three = true; delete g.moving; if (g.op !== 'add' && (g.hitsPerStep ?? 12) < FIX) g.hitsPerStep = Math.max(1, Math.round((g.hitsPerStep ?? 12) * 3 / 4.4)); }
    const best = bestAdd(row.gates);
    let mid;
    if (best > 0 && r.chance(0.5)) { const v = Math.max(1, Math.round(best * 0.6)); mid = addSpec(v, v + Math.round(best * 0.25)); }
    else if (best > 0) { const v = -Math.max(2, Math.round(best * 0.5)); mid = addSpec(v, Math.round(best * 0.3)); }
    else mid = mulSpec(2);
    def.events.push({ type: 'gate', at: row.at, lane: 'C3', three: true, ...mid });
    const [from, to] = stretch(row, rows, spans);
    out.push({ type: 'lanes3', at: from, length: to - from });
  }
  return out;
}

// ---------------- chain gates ----------------
/** alt specs of a follow-up row: side keys L / R per family of the gate picked one row earlier. */
function chainAlts(prev, row, r, sideA) {
  const orig = row.gates;
  const A = Math.max(2, bestAdd(orig) || Math.round(Math.abs(bestAdd(prev.gates) || prev.gates[0].value || 4)));
  const mulRungs = orig.filter((g) => g.op === 'mul').map((g) => g.rung ?? 3);
  const rung = mulRungs.length ? Math.max(3, ...mulRungs) : 3;
  const moving = mulRungs.length ? null : { range: 1.2, speed: 1.6 }; // a x2 the row didn't have is harder to catch
  const addG = orig.find((g) => g.op === 'add' && g.value === bestAdd(orig));
  const plus = addSpec(A, addG ? addG.max : Math.round(A * 1.6));
  const minus = addSpec(-Math.max(1, Math.round(A * 0.6)), Math.round(A * 0.4));
  const times = mulSpec(rung, moving), div = mulSpec(2);
  const far = sideA === 'L' ? 'R' : 'L';
  // add branch: you stand on sideA -> the x waits on the far side; mul branch: you stand on the far side -> + on sideA
  return { L: { add: far === 'L' ? times : div, mul: sideA === 'L' ? plus : minus }, R: { add: far === 'R' ? times : div, mul: sideA === 'R' ? plus : minus } };
}

function planChain(def, rows, r) {
  if (def.id < FIRST.chain) return 0;
  const idx = (def.id - 1) % 10;
  const span = def.layout ?? def.length;
  const mixed = (row) => isPair(row) && free(row) && mixedRow(row);
  const cand = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1];
    if (mixed(a) && isPair(b) && free(b) && !ladderRow(b) && a.at > START + 20 && b.at - a.at < 150 && b.at < span - ARENA - 6) cand.push(i);
  }
  if (!cand.length) return 0;
  const i = cand[r.int(0, cand.length - 1)];
  const len = def.world >= 3 && def.kind === 'normal' && idx >= 5 && rows[i + 2] && isPair(rows[i + 2]) && free(rows[i + 2]) && !ladderRow(rows[i + 2]) && rows[i + 2].at < span - ARENA - 6 ? 3 : 2;
  const id = def.id * 10 + 1;
  const first = rows[i];
  const sideA = first.gates.find((g) => fam(g) === 'add').lane;
  for (const g of first.gates) { g.chain = id; g.link = 0; }
  for (let k = 1; k < len; k++) {
    const row = rows[i + k];
    // row 2+ of a 3-chain: the previous row was all one family, so its side is a coin flip here
    const alts = chainAlts(rows[i + k - 1], row, r, k === 1 ? sideA : (r.chance(0.5) ? 'L' : 'R'));
    for (const g of row.gates) { g.chain = id; g.link = k; g.alt = alts[g.lane]; delete g.moving; }
  }
  return len;
}

// ---------------- ramps ----------------
function planRamps(def, rows, r, spans) {
  if (def.id < FIRST.ramp) return 0;
  const n = def.id >= 16 && def.kind === 'normal' ? 2 : 1;
  const span = def.layout ?? def.length;
  const picked = pickRows(rows, n, r, (row) => free(row) && row.at > START + 20 && row.at < span - ARENA - 8
    && !hits(spans, row.at - RAMP_SPAN[0], row.at + RAMP_SPAN[1]));
  for (const row of picked) {
    const g = row.gates.length === 1 ? row.gates[0] : row.gates[r.int(0, row.gates.length - 1)];
    g.ramp = true;
  }
  return picked.length;
}

// ---------------- rescue cages ----------------
function planCage(def, r, spans) {
  const idx = (def.id - 1) % 10;
  if (def.id < FIRST.cage || !CAGE_IDX.has(idx) || def.kind !== 'normal') return null;
  const span = def.layout ?? def.length;
  const clear = { gate: 16, barrel: 8, crate: 12, powerup: 4, lanes3: 6 };
  const blocks = spans.map(([s, t]) => [s - 8, t + 8]);
  for (const e of def.events) {
    const c = clear[e.type];
    if (c != null) blocks.push([e.at - c, e.at + (e.length || 0) + c]);
  }
  const base = Math.round(START + r.range(0.3, 0.7) * (span - ARENA - START));
  for (let k = 0; k <= 120; k += 2) {
    for (const z of k ? [base + k, base - k] : [base]) {
      if (z < START + 40 || z > span - ARENA - 14 || hits(blocks, z - 2, z + 2)) continue;
      const near = def.events.filter((e) => e.type === 'barrel' && e.at <= z + 40).sort((p, q) => Math.abs(p.at - z) - Math.abs(q.at - z))[0];
      const hp = Math.max(8, Math.round((near ? near.hp : 20) * 0.5));
      const count = Math.min(12, 3 + def.world + (idx >= 6 ? 2 : 0) + r.int(0, 2));
      return { type: 'cage', at: z, lane: r.chance(0.5) ? 'L' : 'R', count, hp };
    }
  }
  return null;
}

/** Reshapes gate rows and adds 3-lane stretches + rescue cages (idempotent). Returns def. */
export function planRoad(def) {
  if (!def || def.events.some((e) => e.type === 'lanes3' || e.type === 'cage' || (e.type === 'gate' && (e.ramp || e.chain)))) return def;
  const r = new Rng(def.id * 7919 + 101);
  const spans = blockers(def);
  const rows = gateRows(def);
  const l3 = planLanes3(def, rows, r, spans);
  def.events.push(...l3);
  planChain(def, rows, r);
  planRamps(def, rows, r, spans);
  const cage = planCage(def, r, spans);
  if (cage) def.events.push(cage);
  // the first level showing a feature names it once (HUD hint line)
  const first = (t) => def.events.filter(t).sort((p, q) => p.at - q.at)[0];
  const mark = (key, e) => { if (e && def.id === FIRST[key]) e.hint = ROAD_HINTS[key]; };
  mark('lanes3', first((e) => e.type === 'lanes3'));
  mark('cage', cage);
  mark('ramp', first((e) => e.type === 'gate' && e.ramp));
  mark('chain', first((e) => e.type === 'gate' && e.chain && e.link === 0));
  return def;
}

/** Road features of a def (tests / tools). */
export function roadOf(def) {
  const ev = def.events;
  return {
    lanes3: ev.filter((e) => e.type === 'lanes3'), cages: ev.filter((e) => e.type === 'cage'),
    ramps: ev.filter((e) => e.type === 'gate' && e.ramp), chains: ev.filter((e) => e.type === 'gate' && e.chain),
  };
}
