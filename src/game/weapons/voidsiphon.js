// VOID SIPHON (dark, SPEC2 §2.7): slow orbs (speed 16, range 26, visualCap 12 so they are heavily bundled).
// An orb deals 20% of its damage directly and collapses into a black hole on its first enemy or boss contact
// or at the end of its range: zones.addHole(x, z, pullR, coreR, pullSpeed, holeTime, pool = 80%). Holes pull
// enemies (Bulwarks x0.3), crush the core (ignores shields), merge (cap 6) and outlive a weapon swap. Boss
// phase: orbs fly to the boss front and the hole there crushes the boss. Orbs pass gates and barrels.
import { WeaponBehaviour } from './base.js';
import { HIT } from '../../config.js';
import { vsMul } from '../../data/matchups.js';
import { bossPhase, bossFront, special, fxq, exposure, mixMul } from './common.js';

const MASK = HIT.ENEMY | HIT.BOSS;
const P = { x: 0, z: 0 };

export class VoidSiphon extends WeaponBehaviour {
  reset() { this.stats = { orbs: 0, holes: 0 }; }

  fire(v) {
    const g = this.game, r = this.row(v.mk);
    const direct = this.def.direct ?? 0.2;
    let vx = 0, vz = -r.speed;
    const z0 = v.z + v.lead;
    if (bossPhase(g) && bossFront(g, P)) {
      const dx = P.x - v.x, dz = P.z - z0, d = Math.max(0.001, Math.hypot(dx, dz));
      vx = (dx / d) * r.speed; vz = (dz / d) * r.speed;
    }
    const b = this.spawnMain(v, v.x, v.y, z0, vx, vz, v.dmg * direct);
    if (!b) return;
    b.mask = MASK;
    b.unit = v.unit * direct;
    b.data = v.dmg * (1 - direct);
    b.spin = 2.2;
    if (this.stats) this.stats.orbs++;
  }

  onHit(b, kind, t, res) {
    if (kind === 'boss') { this.collapse(b, b.x, t.z, true); return true; }
    if (kind === 'enemy') { this.collapse(b, t.x, t.z, false); return true; }
    return res;
  }

  onExpire(b) { this.collapse(b, b.x, b.z, false); }

  collapse(b, x, z, boss) {
    if (!(b.data > 0)) return;
    const r = this.row(), g = this.game;
    const before = g.zones.holes.length;
    const h = g.zones.addHole(x, z, r.pullR, r.coreR, r.pullSpeed, r.holeTime, b.data, this.el, { boss });
    if (boss) h.boss = true; // a boss collapse that merged into an earlier hole still crushes the boss
    b.data = 0;
    if (this.stats) this.stats.holes++;
    fxq(this, 'hole', h.x, 0.1, h.z, h.x, r.pullR, h.z, g.zones.holes.length > before ? 0 : 1);
    special(this, 'hole', h.x, 0.5, h.z);
  }

  crowdFactor(mix) {
    const r = this.row();
    return exposure(r.range) * mixMul(this, mix, vsMul) * (1.3 + 0.12 * r.pullR);
  }
}
