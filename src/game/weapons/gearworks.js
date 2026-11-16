// GEARWORKS (factory, SPEC2 §2.5): spinning saw gears (speed 36, range 42) that bounce. After an enemy hit
// (shield-blocked hits included) the gear retargets the nearest alive enemy it has not hit yet within 7 u and
// not behind the squad (ties -> lower list index), keeps its speed, deals x0.8 per bounce and flies at most
// 9 u more (dist = range - 9). Each gear hit removes 3 shield hits (SHIELD_HITS). A game-time timer drops a
// mini road turret at (leader.x, leader.z - 3) every `turretEvery` s while firing (helpers.addRoad, max 3,
// dps = 0.12 * max(count, 10) * MKREF * shop damage); it fires small gears (no bounce) with element gearworks.
import { WeaponBehaviour } from './base.js';
import { MKREF } from '../../data/weapons.js';
import { vsMul } from '../../data/matchups.js';
import { buildProjectileGeometry } from '../../models/weapons/projectiles.js';
import { buildGearTurret } from '../../models/weapons/gearturret.js';
import { special, fxq, exposure, mixMul } from './common.js';

const TURRET_RATE = 2;

export class Gearworks extends WeaponBehaviour {
  init() {
    super.init();
    this.miniStyle = this.game.bullets.registerStyle(this.id + ':mini', buildProjectileGeometry(this.id, 1, 'child'));
    this.game.helpers.registerVisual('gearturret', buildGearTurret);
  }

  setMk(mk) {
    super.setMk(mk);
    this.game.bullets.setStyleGeometry(this.miniStyle, buildProjectileGeometry(this.id, mk, 'child'));
  }

  reset() { this.tt = 0; this.stats = { gears: 0, bounces: 0, turrets: 0 }; }

  fire(v) {
    const r = this.row(v.mk);
    const b = this.spawnMain(v, v.x, v.y, v.z + v.lead, 0, -r.speed);
    if (!b) return;
    b.bounces = r.bounces; b.spin = r.spin; b.roll = (this.stats ? this.stats.gears : 0) * 0.7;
    if (this.stats) this.stats.gears++;
  }

  onHit(b, kind, t, res) {
    if (kind !== 'enemy' || b.bounces <= 0 || b.nh >= b.hits.length - 1) return res;
    const r = this.row(), g = this.game;
    b.hits[b.nh] = t; // the target just hit (bullets records it after a 'bounce')
    const e = g.horde.nearestUnhit(b.x, t.z, r.bounceR, b.hits, b.nh + 1, g.squad.leader.z);
    b.hits[b.nh] = null;
    if (!e) return res;
    const dx = e.x - b.x, dz = e.z - t.z, d = Math.max(0.001, Math.hypot(dx, dz));
    b.vx = (dx / d) * r.speed; b.vz = (dz / d) * r.speed;
    b.dmg *= r.bounceMul; b.unit *= r.bounceMul;
    b.bounces--;
    b.dist = b.range - r.bounceFly;
    if (this.stats) this.stats.bounces++;
    fxq(this, 'bounce', b.x, b.y, t.z, e.x, b.y, e.z);
    special(this, 'bounce', b.x, b.y, t.z);
    return 'bounce';
  }

  update(dt) {
    const g = this.game, sys = this.sys;
    const st = this.stats || (this.reset(), this.stats);
    // turret-fired small gears spin too (visual)
    const list = g.bullets.active;
    for (let i = 0; i < list.length; i++) if (list[i].style === this.miniStyle && !list[i].spin) list[i].spin = 16;
    if (!sys.enabled || g.squad.count <= 0) return;
    const r = this.row();
    this.tt += dt;
    if (this.tt < r.turretEvery) return;
    this.tt -= r.turretEvery;
    const L = g.squad.leader;
    const x = Math.max(-4.4, Math.min(4.4, L.x));
    const dps = (r.turretDps ?? 0.12) * Math.max(g.squad.count, r.turretMinCount ?? 10) * MKREF[this.mk] * sys.dmgMul;
    g.helpers.addRoad('gearturret', x, L.z - (r.turretAhead ?? 3), {
      life: r.turretLife, dps, rate: TURRET_RATE, el: this.el, cause: 'weapon', style: this.id + ':mini', pierce: 0,
      speed: 40, range: 44, max: r.turretMax ?? 3, scale: 1,
    });
    st.turrets++;
    fxq(this, 'turret', x, 0, L.z - 3);
  }

  crowdFactor(mix) {
    const r = this.row();
    return exposure(r.range) * mixMul(this, mix, vsMul) * (1 + 0.45 * r.bounces);
  }
}
