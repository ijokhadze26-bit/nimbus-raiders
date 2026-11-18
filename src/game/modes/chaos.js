// CHAOS MODE (stage 5 mode): a random open campaign level (not a boss level) with 2-3 random modifiers rolled
// for every run, shown before the start ("CHAOS: x2 SPEED + TINY SQUAD"). Score of a clear = squad at the finish
// x stars; save.modes.chaosBest keeps the best. Coins: the level payout x (1 + CHAOS.bonus per modifier).
// Rolls use their own Rng (never game.rng): Math.random seeds them, a fixed counter under ?test=1.
import { Rng } from '../../core/rng.js';
import { levelKind } from '../../data/worlds.js';
import { LAST_LEVEL } from '../../data/levels.js';

export const CHAOS = {
  pool: ['doubleSpeed', 'tinySquad', 'onlyRed', 'giantEnemies', 'noGuns', 'fog', 'mirror'],
  bonus: 0.25,         // +25% coins per modifier
  unlockLevel: 20,     // open after beating L20
};

/** Chaos open? (L20 beaten) */
export const chaosOpen = (save) => !!save && ((save.stars && save.stars[CHAOS.unlockLevel]) > 0 || (save.unlockedLevel | 0) > CHAOS.unlockLevel);

/** { seed, levelId, twists[2..3] } */
export function rollChaos(save, seed) {
  const r = new Rng((seed >>> 0) || 1);
  const open = Math.max(1, Math.min(LAST_LEVEL, (save && save.unlockedLevel) || 1));
  const ids = [];
  for (let id = 1; id <= open; id++) { const k = levelKind(id); if (k !== 'boss' && k !== 'mini') ids.push(id); }
  const levelId = ids.length ? ids[r.int(0, ids.length - 1)] : 1;
  const pool = CHAOS.pool.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = r.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const twists = pool.slice(0, r.chance(0.5) ? 3 : 2);
  return { seed: seed >>> 0, levelId, twists };
}

export const chaosCoinMul = (twists) => 1 + CHAOS.bonus * ((twists && twists.length) || 0);
