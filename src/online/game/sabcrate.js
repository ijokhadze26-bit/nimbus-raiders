// Sabotage crates of an online match (STAGE2 "Sabotage crates"): one purple crate per zone from zone 1, at the same
// spot on every player's road. Placement is pure: ONE Rng(seed * 53 + 7) per match, drawn zone by zone (zone 1 at
// the match start, zone n+1 when boss n falls, before any sabotage can touch that zone), from the zone's generated
// rows only (a red gate a sabotage added, `sab: true`, never counts). Taking one gives a sabotage charge
// (src/game/crates.js emits crate:take { kind: 'sabotage' }; sabotage.js listens): no weapon swap, no coins.
import { Rng } from '../../core/rng.js';
import { LANES } from '../../config.js';
import { ENDLESS } from '../../data/endless.js';
import { SAB } from './sabdata.js';

const BLOCK = { gate: 1, barrel: 1, crate: 1 };

/**
 * The crate for one zone's generated rows: a row at least SAB.crate.clear u from every gate, barrel and crate row
 * (the rule of src/game/endless.js endlessCrate), lane and row from rng (always 2 draws). null = no room.
 */
export function sabCrate(rng, events) {
  const C = SAB.crate, rows = [];
  for (const e of events) {
    if (e.sab || BLOCK[e.type] || rows.includes(e.at)) continue;
    let ok = true;
    for (const o of events) if (!o.sab && BLOCK[o.type] && Math.abs(o.at - e.at) < C.clear) { ok = false; break; }
    if (ok) rows.push(e.at);
  }
  rows.sort((a, b) => a - b);
  const lane = rng.chance(0.5) ? 'L' : 'R';
  const at = rows.length ? rows[Math.floor(rng.next() * rows.length)] : null;
  return at == null ? null : { type: 'crate', at, lane, x: LANES[lane], weapon: C.weapon, kind: 'sabotage' };
}

/** Every generated event of zone `zone` (1-based) of the run, in a fixed order (type name, then road order). */
export function zoneEvents(run, zone) {
  const from = (zone - 1) * ENDLESS.bossEvery, to = zone * ENDLESS.bossEvery, out = [];
  for (const type of Object.keys(run.byType).sort()) {
    for (const e of run.byType[type]) if (e.at >= from && e.at < to && !e.sab && e.kind !== 'sabotage') out.push(e);
  }
  return out;
}

/** Inserts event e into the sorted list at an index >= cursor; returns the index. */
export function spliceSorted(list, e, cursor = 0) {
  let i = Math.max(0, cursor);
  while (i < list.length && list[i].at <= e.at) i++;
  list.splice(i, 0, e);
  return i;
}

export class SabCrates {
  constructor(game) { this.game = game; this.rng = null; this.placed = []; }

  begin(seed) { this.rng = new Rng(seed * SAB.crate.mul + SAB.crate.add); this.placed = []; }

  /** Places the crate of the zone the run is in now (call once per zone, in zone order). */
  place() {
    const g = this.game, run = g.run;
    if (!run || !this.rng) return null;
    const zone = g.endless.zone;
    const c = sabCrate(this.rng, zoneEvents(run, zone));
    if (!c) return null;
    spliceSorted(run.eventsOf('crate'), c, g.crates.cursor);
    this.placed.push({ zone, at: c.at, lane: c.lane });
    return c;
  }
}
