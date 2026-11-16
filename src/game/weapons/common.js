// Shared helpers for the seven weapon behaviours (WEAPONS builder; SPEC2 §2, §6.3).
//   bossPhase(game)                    true while the run is in its boss phase with a targetable boss
//   bossFront(game, out)               { x, z } of the boss front plane (hit plane) -> out, or null
//   special(beh, kind, x, y, z, n)     weapon:special for audio / fx (per-kind throttle, then the bus rate)
//   fxq(beh, kind, x0, y0, z0, x1, y1, z1, n)   two-endpoint visual into weapons.fxq (never rate limited)
//   chain(beh, x, z, first, jumps, reach, dmg, unit, src, out) -> number of jumps made (deterministic)
//   exposure(reach)                    bot / UI estimate of how much of a horde a reach can engage
//   ownedEach(beh, fn)                 calls fn(b) for every live bullet this behaviour owns (visual tweaks)
// Gameplay rules: only game.procRng dice, nearest-by-squared-distance with list-order ties, no allocation in
// hot paths (scratch objects below), never reads quality or b.show.
import { ALIVE } from '../hordeops.js';

const SPECIAL = { weapon: '', kind: '', pos: { x: 0, y: 0, z: 0 }, n: 0 };
const KIND_GAP = 1 / 14; // s of game time between two sound-worthy specials of the same kind

export function bossPhase(game) {
  const run = game.run, b = game.boss;
  return !!(run && run.phase === 'boss' && b && b.targetable);
}

export function bossFront(game, out) {
  const b = game.boss;
  if (!b || !b.targetable) return null;
  out.x = b.x; out.z = b.z + b.def.hitbox.front;
  return out;
}

/** Sound / fx hook. Throttled per (behaviour, kind) on game time so rare kinds are never starved by common ones. */
export function special(beh, kind, x, y, z, n = 0) {
  const game = beh.game, t = game.time;
  const last = beh._sp || (beh._sp = {});
  if (t - (last[kind] ?? -1) < KIND_GAP && t >= (last[kind] ?? -1)) return false;
  if (!game.events.wants('weapon:special')) return false;
  last[kind] = t;
  SPECIAL.weapon = beh.id; SPECIAL.kind = kind; SPECIAL.pos.x = x; SPECIAL.pos.y = y; SPECIAL.pos.z = z; SPECIAL.n = n;
  return game.events.emit('weapon:special', SPECIAL);
}

/** Visual-only queue entry (arcs, bounce segments, splats, puddles, holes ...). fx/weapons drains it per frame. */
export function fxq(beh, kind, x0, y0, z0, x1 = x0, y1 = y0, z1 = z0, n = 0) {
  const e = beh.sys.fxq.push(kind);
  e.weapon = beh.id; e.mk = beh.sys.mk;
  e.x0 = x0; e.y0 = y0; e.z0 = z0; e.x1 = x1; e.y1 = y1; e.z1 = z1; e.n = n; e.t = beh.game.time;
  return e;
}

const CHAINED = new Array(12).fill(null);
/**
 * Instant chain from (x, z): up to `jumps` hops, each to the nearest alive enemy not yet chained within
 * `reach` of the previous link (ties -> lower list index), dealing dmg * falloff^k. `first` (may be null) is
 * already hit and never re-chained. Every hop queues an 'arc' visual (fxq). Returns the jumps made.
 */
export function chain(beh, x, z, first, jumps, reach, dmg, unit, falloff, src) {
  const h = beh.game.horde;
  let n = 0;
  if (first) CHAINED[n++] = first;
  let px = x, pz = z, made = 0, d = dmg, u = unit;
  for (let k = 1; k <= jumps && n < CHAINED.length; k++) {
    const e = h.nearestUnhit(px, pz, reach, CHAINED, n, Infinity);
    if (!e) break;
    d *= falloff; u *= falloff;
    CHAINED[n++] = e;
    const ex = e.x, ez = e.z;
    h.applyDamage(e, d, u, src);
    fxq(beh, 'arc', px, 0.75, pz, ex, 0.75, ez, k);
    made++;
    px = ex; pz = ez;
  }
  for (let i = 0; i < n; i++) CHAINED[i] = null;
  return made;
}

export function exposure(reach) { return Math.max(0.3, Math.min(1, (reach - 6) / 46)); }

/** Mean matchup multiplier for a mix {type: share}. */
export function mixMul(beh, mix, vsMul) {
  let m = 0, w = 0;
  if (mix) for (const k in mix) { m += mix[k] * vsMul(beh.el, k); w += mix[k]; }
  return w > 0 ? m / w : 1;
}

export function ownedEach(beh, fn) {
  const list = beh.game.bullets.active;
  for (let i = 0; i < list.length; i++) if (list[i].owner === beh) fn(list[i]);
}

/** Alive check that tolerates a target killed during this very hit. */
export const isAlive = (e) => !!e && e.state === ALIVE;

/** Leader z (forward = -z); enemies with z > this are behind the squad. */
export function leaderZ(game) { return game.squad.leader.z; }
