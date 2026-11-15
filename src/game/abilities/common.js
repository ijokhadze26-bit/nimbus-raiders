// Shared ability helpers (SPEC2 §3): squad-scaled budgets, target collection in deterministic list order,
// and the damage sources abilities use. Gameplay only: no Math.random, no quality reads, no allocation per
// use beyond the reused scratch arrays.
import { MKREF } from '../../data/weapons.js';
import { ALIVE } from '../hordeops.js';

/** Squad-scaled ability budget: k * count * MKREF[mk] * shop dmgMul (shared by everything it hits). */
export function budgetFor(game, k, mk, count = game.squad.count) {
  const m = Math.max(1, Math.min(5, mk | 0 || 1));
  return k * count * MKREF[m] * (game.weapons.dmgMul || 1);
}

/** Damage source for ability hits (applyDamage src): cause 'ability' feeds run.killsBy.ability. */
export function abilitySrc(el = 'neutral', shieldHits = 1) {
  return { el, shieldHits, bypassShield: false, cause: 'ability', events: true, weapon: 'ability' };
}

/** Alive enemies whose z lies between `near` and `far` u ahead of the leader (list order). Reuses `out`. */
export function enemiesAhead(game, near, far, out) {
  out.length = 0;
  const L = game.squad.leader, list = game.horde.list;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.state !== ALIVE) continue;
    const d = L.z - e.z;
    if (d >= near && d <= far) out.push(e);
  }
  return out;
}

/** Alive enemies within r of (x, z), list order. Reuses `out`. */
export function enemiesInCircle(game, x, z, r, out) {
  out.length = 0;
  const r2 = r * r, list = game.horde.list;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.state !== ALIVE) continue;
    const dx = e.x - x, dz = e.z - z;
    if (dx * dx + dz * dz <= r2) out.push(e);
  }
  return out;
}

export const clampRoad = (x) => Math.max(-4.3, Math.min(4.3, x));
