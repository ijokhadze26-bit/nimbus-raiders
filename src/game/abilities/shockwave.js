// Titan Vex - Shockwave (SPEC2 §3.6). Every alive enemy within `range` u ahead is pushed back by
// push + pushFar * (1 - d / range) u (Bulwarks x tankMul) and stunned (status.slow stunPct for stunTime).
// Damage is a shared budget k * count * MKREF[mk] * shop dmgMul (element neutral) split over the pushed
// enemies, each share capped so no enemy loses more than enemyCap of its max hp; the boss takes
// min(budget, bossCap * maxHp) and is not pushed. It knocks back; it does not wipe.
import { heroDef } from '../../data/heroes.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { vsMul } from '../../data/matchups.js';
import { applyDamage } from '../hordeops.js';
import { budgetFor, abilitySrc, enemiesAhead } from './common.js';

const SRC = abilitySrc('neutral');
const BEHIND = 1.5;
const list = [];

export const shockwave = {
  last: null,       // { pushed, budget, share, boss, push } (tests / fx)

  use(game, hero, mk) {
    const a = heroDef('vex').ability;
    const L = game.squad.leader, h = game.horde, st = game.status;
    enemiesAhead(game, -BEHIND, a.range, list);
    const budget = budgetFor(game, a.k, mk);
    const n = list.length;
    const share = n ? budget / n : 0;
    let pushSum = 0;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const d = Math.max(0, L.z - e.z);
      const tank = ENEMY_TYPES[e.type] === 'tank';
      const push = (a.push + a.pushFar * (1 - Math.min(1, d / a.range))) * (tank ? a.tankMul : 1);
      e.z -= push;
      pushSum += push;
      st.slow(e, a.stunPct, a.stunTime);
      const m = vsMul('neutral', ENEMY_TYPES[e.type]) * (e.freezeT > 0 ? 1.25 : 1);
      const dmg = Math.min(share, (a.enemyCap * e.maxHp) / m);
      applyDamage(h, e, dmg, dmg, SRC);
    }
    const boss = game.boss;
    let bossDmg = 0;
    if (boss && boss.targetable) { bossDmg = Math.min(budget, a.bossCap * boss.maxHp); boss.damage(bossDmg); }
    game.events.emit('fx:shake', { amount: a.shake });
    game.events.emit('ability:impact', { ability: 'shockwave', pos: { x: L.x, y: 0, z: L.z }, r: a.range, n });
    this.last = { pushed: n, budget, share, boss: bossDmg, push: n ? pushSum / n : 0 };
    return true;
  },
  update() {},
  reset() { this.last = null; },
};
