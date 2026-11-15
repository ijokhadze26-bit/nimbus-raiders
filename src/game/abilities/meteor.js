// Cinder - Meteor Drop (SPEC2 §3.2). A flaming rock falls for `fall` s onto (leader.x, leader.z - ahead), or in
// the boss phase onto the boss front centre, then smashes a circle of `radius`. Damage is a shared budget:
// k * count * MKREF[mk] * shop dmgMul * Hot Hands (1.25), split evenly over every enemy and barrel inside (a
// barrel is one target, broken through barrels.damage so its reward is granted); each enemy then burns for
// burnFrac of its share over burnTime. The boss takes min(budget * bossMul, bossCap * maxHp).
// The ground ring is drawn by fx/heroes.js from `pending` (friendly markers never go into game.telegraph).
import { heroDef } from '../../data/heroes.js';
import { vsMul, bossMul } from '../../data/matchups.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import { applyDamage } from '../hordeops.js';
import { budgetFor, abilitySrc, enemiesInCircle, clampRoad } from './common.js';

const SRC = abilitySrc('emberstorm');
const hits = [];

export const meteor = {
  pending: [],          // { x, z, t, fall, budget, boss } falling rocks (read by fx/heroes.js)
  last: null,           // last impact summary (tests / fx): { x, z, n, barrels, budget, share, boss }
  impacts: 0,

  use(game, hero, mk) {
    const a = heroDef('cinder').ability;
    const L = game.squad.leader, run = game.run, boss = game.boss;
    let x = clampRoad(L.x), z = L.z - a.ahead, onBoss = false;
    if (run && run.phase === 'boss' && boss && boss.alive) { x = boss.x; z = boss.z + boss.def.hitbox.front; onBoss = true; }
    const budget = budgetFor(game, a.k, mk) * (hero.fireMul || 1);
    if (this.pending.length >= 2) this.pending.shift();
    this.pending.push({ x, z, t: 0, fall: a.fall, budget, boss: onBoss, r: a.radius });
    return true;
  },

  update(dt, game) {
    const P = this.pending;
    for (let i = 0; i < P.length; i++) {
      const m = P[i];
      m.t += dt;
      if (m.t >= m.fall) { this.impact(game, m); P.splice(i, 1); i--; }
    }
  },

  impact(game, m) {
    const a = heroDef('cinder').ability;
    const h = game.horde;
    enemiesInCircle(game, m.x, m.z, m.r, hits);
    let nb = 0;
    const bl = game.barrels ? game.barrels.live : [];
    for (const b of bl) if (b.state === 'live' && (b.x - m.x) ** 2 + (b.z - m.z) ** 2 <= m.r * m.r) nb++;
    const n = hits.length + nb;
    const share = n > 0 ? m.budget / n : 0;
    let killed = 0;
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      const r = applyDamage(h, e, share, share, SRC);
      if (r.killed) killed++;
      else if (!r.blocked) game.status.burn(e, share * a.burnFrac * vsMul(a.el, ENEMY_TYPES[e.type]), a.burnTime);
    }
    if (nb) for (const b of bl) if (b.state === 'live' && (b.x - m.x) ** 2 + (b.z - m.z) ** 2 <= m.r * m.r) game.barrels.damage(b, share);
    // boss: the full budget through its matchup, capped per use
    const boss = game.boss;
    let bossDmg = 0;
    if (boss && boss.targetable) {
      const front = boss.z + boss.def.hitbox.front;
      const dx = Math.max(0, Math.abs(m.x - boss.x) - boss.def.hitbox.halfW);
      if (dx * dx + (front - m.z) ** 2 <= (m.r + 1) * (m.r + 1)) {
        bossDmg = Math.min(m.budget * bossMul(a.el, boss.type) * (boss.frozenT > 0 ? 1.25 : 1), a.bossCap * boss.maxHp);
        boss.damage(bossDmg);
      }
    }
    this.impacts++;
    this.last = { x: m.x, z: m.z, n: hits.length, barrels: nb, budget: m.budget, share, killed, boss: bossDmg };
    game.events.emit('ability:impact', { ability: 'meteor', pos: { x: m.x, y: 0, z: m.z }, r: m.r, n: hits.length });
    game.events.emit('fx:shake', { amount: 0.55 });
  },

  reset() { this.pending.length = 0; this.last = null; this.impacts = 0; },
};
