// EMBERSTORM (fire, SPEC2 §2.1): a short flamethrower cone. Each volley throws `pellets` flames (speed 30)
// across the Mk's cone; flames pierce, pass through gates and barrels (mask ENEMY | BOSS) and every hit adds
// to the enemy's burn pool (pool += b.dmg * vsMul * burnMul, timer = burnTime). Shields block flame and burn.
// Gameplay range comes from exposure (22-30 u); the puff grows 0.6 -> 1.4 and shrinks away over the last 40%
// of its flight, so the visible cone stays short. Boss phase: the same pellets as an 8 degree jet, range 40.
import { WeaponBehaviour } from './base.js';
import { HIT } from '../../config.js';
import { MK_SCALE } from '../../data/weapons.js';
import { vsMul, bossMul } from '../../data/matchups.js';
import { bossPhase, special, fxq, exposure, mixMul, isAlive } from './common.js';

const DEG = Math.PI / 180;
const PHI = 0.6180339887498949;
const MASK = HIT.ENEMY | HIT.BOSS;

export class Emberstorm extends WeaponBehaviour {
  reset() { this.k = 0; this.ignites = 0; }

  fire(v) {
    const r = this.row(v.mk);
    const boss = bossPhase(this.game);
    const cone = (boss ? r.bossJetSpread : r.cone) * DEG;
    const n = r.pellets || 3, sp = r.speed;
    // the reach the player sees: the visible-cone column (x hero range), or the whole jet on a boss
    const vis = boss ? v.range : r.visRange * (v.range / r.range);
    const k0 = (this.k = ((this.k || 0) + 1) % 1000003) * PHI;
    for (let i = 0; i < n; i++) {
      // deterministic low-discrepancy spread (no dice): fills the cone evenly volley after volley
      const a = ((((k0 + i / n) % 1) + 1) % 1 - 0.5) * cone;
      const b = this.spawnMain(v, v.x, v.y, v.z + v.lead, Math.sin(a) * sp, -Math.cos(a) * sp);
      if (!b) return;
      b.mask = MASK;
      b.data = vis;
      b.vy = 0.9; // flames lift a little (visual: sweeps use x / z only)
      const s = MK_SCALE[v.mk - 1] * 0.6;
      b.sx = b.sy = b.sz = s;
    }
  }

  onHit(b, kind, t, res) {
    const r = this.row();
    if (kind === 'enemy') {
      if (this.game.horde.last.blocked || !isAlive(t)) return res; // shields block flame and burn
      const fresh = !(t.burnT > 0);
      this.game.status.burn(t, b.dmg * vsMul(this.el, t.def.id) * (this.def.burnMul ?? 1), r.burnTime);
      if (fresh) {
        this.ignites++;
        fxq(this, 'ignite', t.x, 0.7, t.z);
        special(this, 'ignite', t.x, 0.7, t.z);
      }
    } else if (kind === 'boss') {
      const boss = this.game.boss;
      if (boss) this.game.status.bossBurn(b.dmg * bossMul(this.el, boss.type) * (this.def.burnMul ?? 1), r.burnTime);
    }
    return res;
  }

  /** Visual only: the flame puff grows along its flight and shrinks out over the last 40% of the visible cone. */
  update() {
    const base = MK_SCALE[this.mk - 1], list = this.game.bullets.active;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.owner !== this) continue;
      const vis = b.data || 15, f = b.dist / vis;
      const grow = 0.6 + 0.8 * Math.min(1, f);
      const fade = f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4);
      const s = base * grow * (0.05 + 0.95 * fade);
      b.sx = s; b.sy = s; b.sz = s * (1 + 0.3 * Math.min(1, f));
    }
  }

  crowdFactor(mix) {
    const r = this.row();
    return exposure(r.range) * mixMul(this, mix, vsMul) * (1 + 0.35 * Math.min(4, r.pierce || 0));
  }
}
