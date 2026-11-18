// Stage 4 road layout rules for gates (kept out of gates.js): 3-lane positions / widths, ramp heights, chain gates.
// Data comes from src/data/roadplan.js. A chain follow-up gate waits (dim '?', no raise hits) until the row before
// it is passed; then it takes the gate spec `alt[family]` for the family ('add' | 'mul') of the gate picked there.
import { GATE, LANES } from '../config.js';
import { LANES3 } from '../data/roadplan.js';
import { rampHeight, RAMP } from '../models/gateramp.js';
import { applyGate } from './gates.js';

/** Narrow gate width of a 3-lane row (lanes L3 / C3 / R3 at x -3.3 / 0 / 3.3: a 0.3 u gap between them). */
export const WIDTH3 = 3.0;

export const laneX = (lane) => LANES[lane] ?? LANES3[lane] ?? 0;
export const laneWidth = (lane) => (lane === 'C' ? GATE.widthCenter : LANES3[lane] != null ? WIDTH3 : GATE.width);
/** Chain branch of a gate as passed: 'add' = a + gate, 'mul' = x, ÷ or a - gate (data/roadplan.js fam). */
export const family = (g) => (g.op === 'add' && g.value > 0 ? 'add' : 'mul');

/** Rewrites a live gate to a gate spec { op:'add'|'mul'|'div', value, max, rung, hitsPerStep, moving }. */
export function setSpec(g, s) {
  if (s.op === 'add') {
    g.op = 'add'; g.value = s.value | 0; g.max = s.max ?? ((s.value | 0) + GATE.maxExtra); g.rung = 0;
  } else {
    g.op = 'ladder'; g.value = 0;
    g.rung = Math.max(0, Math.min(GATE.rungs.length - 1, s.rung ?? (s.op === 'mul' ? 3 : 2)));
  }
  g.hitsPerStep = s.hitsPerStep ?? GATE.hitsPerStep;
  g.hits = 0; g.credit = 0;
  g.moving = s.moving || null;
}

const _tmp = { op: 'add', value: 0, rung: 0 };
/** Count after passing a gate spec (autopilot look-ahead). */
export function applySpec(s, before) {
  _tmp.op = s.op === 'add' ? 'add' : 'ladder'; _tmp.value = s.value | 0;
  _tmp.rung = s.op === 'add' ? 0 : (s.rung ?? (s.op === 'mul' ? 3 : 2));
  return applyGate(_tmp, before);
}

/** Groups a run's chain gate events: chainId -> [[events of link 0], [link 1], ...]. */
export function chainIndex(events) {
  const map = new Map();
  for (const e of events) {
    if (!e.chain) continue;
    let rows = map.get(e.chain);
    if (!rows) map.set(e.chain, (rows = []));
    (rows[e.link | 0] ||= []).push(e);
  }
  return map;
}

/**
 * Autopilot look-ahead: the count after gate g (`after`) followed by the best gate of the next chain row it
 * unlocks. Gates without a follow-up row return `after` unchanged.
 */
export function chainLook(gates, g, after) {
  if (!g.chain || !gates.chainMap) return after;
  const rows = gates.chainMap.get(g.chain);
  const next = rows && rows[(g.link | 0) + 1];
  if (!next) return after;
  const f = family(g);
  let best = 0;
  for (const e of next) { const s = e.alt && e.alt[f]; if (s) best = Math.max(best, applySpec(s, after)); }
  return best || after;
}

/** Called when a chain row resolves: reveals the next row's gates with the picked family's offers. */
export function resolveChain(gates, row, chosen) {
  const g0 = row.gates[0];
  if (!g0 || !g0.chain) return;
  const f = chosen ? family(chosen) : 'add';
  const link = (g0.link | 0) + 1;
  const id = g0.chain;
  gates.chainPick.set(id + ':' + link, f);
  for (const g of gates.live) if (g.chain === id && g.link === link && g.chainWait) revealChain(gates, g, f);
}

/** A spawned chain follow-up gate whose earlier row was already picked takes its offer at once. */
export function chainSpawn(gates, g) {
  if (!g.chain || !(g.link > 0)) return;
  const f = gates.chainPick.get(g.chain + ':' + g.link);
  g.chainWait = true; g.hidden = true;
  if (f) revealChain(gates, g, f, true);
}

function revealChain(gates, g, f, quiet = false) {
  const s = g.alt && g.alt[f];
  g.chainWait = false;
  if (s) { setSpec(g, s); g.baseX = laneX(g.lane); }
  g.colorT = gates.targetColorT(g);
  if (quiet) { g.hidden = false; g.dirty = true; } else gates.reveal(g);
}

/** Ground height of the ramps under (x, z) (0 off every ramp). */
export function rampY(gates, x, z) {
  const list = gates.ramps;
  if (!list.length) return 0;
  let y = 0;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    const dz = z - g.z;
    if (dz > RAMP.up0 || dz < RAMP.down1 || Math.abs(x - g.x) > g.halfW + 0.05) continue;
    const h = rampHeight(dz);
    if (h > y) y = h;
  }
  return y;
}
