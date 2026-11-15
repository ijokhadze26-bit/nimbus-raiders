// SPECTRA PRISM (light, SPEC2 §2.4): a fast rainbow beam (speed 95, range 60, stretched to beamLen). On its
// first enemy or boss hit it splits into `splits` child beams fanned evenly across +-16 degrees, each with
// 35% of the beam's damage, gen 1 (children never split), the parent's show flag, no gate credit and
// mask ENEMY | BOSS. Children start with the parent's target in hits[] so they never re-hit it; after a boss
// hit they get mask ENEMY only (minions), so the boss takes exactly one beam per beam. Children are dropped
// silently when the bullet cap is full.
import { WeaponBehaviour } from './base.js';
import { HIT } from '../../config.js';
import { MK_SCALE } from '../../data/weapons.js';
import { vsMul } from '../../data/matchups.js';
import { buildProjectileGeometry } from '../../models/weapons/projectiles.js';
import { special, fxq, exposure, mixMul } from './common.js';

const DEG = Math.PI / 180;

export class SpectraPrism extends WeaponBehaviour {
  init() {
    super.init();
    this.childStyle = this.game.bullets.registerStyle(this.id + ':child', buildProjectileGeometry(this.id, 1, 'child'));
  }

  setMk(mk) {
    super.setMk(mk);
    this.game.bullets.setStyleGeometry(this.childStyle, buildProjectileGeometry(this.id, mk, 'child'));
  }

  reset() { this.stats = { beams: 0, splits: 0, children: 0, childHits: 0, childOnParent: 0 }; }

  fire(v) {
    const r = this.row(v.mk);
    const b = this.spawnMain(v, v.x, v.y, v.z + v.lead, 0, -r.speed);
    if (!b) return;
    b.sz *= r.beamLen; b.data = v.dmg; b.bounces = 0; b.gen = 0;
    if (this.stats) this.stats.beams++;
  }

  onHit(b, kind, t, res) {
    const st = this.stats || (this.reset(), this.stats);
    if (b.gen !== 0) {
      if (kind === 'enemy') { st.childHits++; if (b.hits[0] === t) st.childOnParent++; }
      return res;
    }
    if (b.bounces || (kind !== 'enemy' && kind !== 'boss')) return res;
    b.bounces = 1; // a beam splits once (Rime's pierce never adds more splits)
    this.split(b, kind, t);
    return res;
  }

  split(parent, kind, t) {
    const r = this.row(), B = this.game.bullets, st = this.stats;
    const n = r.splits, fan = r.fan * DEG, sp = r.speed;
    const head = Math.atan2(parent.vx, -parent.vz);
    const z = t.z, x = parent.x;
    const dmg = parent.data * r.splitDmg, unit = parent.unit * r.splitDmg;
    const mask = kind === 'boss' ? HIT.ENEMY : HIT.ENEMY | HIT.BOSS;
    const s = MK_SCALE[this.mk - 1] * 0.6;
    st.splits++;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const a = head + (n > 1 ? (i / (n - 1) - 0.5) * 2 * fan : 0);
      const c = B.spawn(this.childStyle, x, parent.y, z, Math.sin(a) * sp, -Math.cos(a) * sp, dmg, 0, unit, r.splitRange);
      if (!c) break;
      c.owner = this; c.el = this.el; c.gen = 1; c.show = parent.show; c.gw = 0; c.bdmg = 0; c.mask = mask;
      c.hits[0] = t; c.nh = 1;
      c.sx = c.sy = s; c.sz = s * r.beamLen;
      made++;
    }
    st.children += made;
    fxq(this, 'split', x, parent.y, z, x, parent.y, z, made);
    special(this, 'split', x, parent.y, z, made);
  }

  crowdFactor(mix) {
    const r = this.row();
    return exposure(r.range || 60) * mixMul(this, mix, vsMul) * (1 + r.splits * r.splitDmg * 0.5);
  }
}
