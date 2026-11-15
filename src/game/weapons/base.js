// WeaponBehaviour: the base every weapon extends (SPEC2 §6.3). The Weapons runtime (game/weapons.js) owns the
// fire accumulator, bundling, tracers and events; a behaviour only decides what one drawn volley does and how
// its bullets react. Default = one straight bullet per pellet with the def's Mk numbers.
//   constructor(sys, def)        sys = Weapons; this.game gives bullets, horde, status, zones, helpers, procRng
//   init()                       once at boot: register bullet styles / zone looks; never allocate later
//   equip(mk) / unequip()        swap in / out (stop loops); emits nothing (Weapons emits)
//   setMk(mk)                    swap geometries / numbers
//   reset()                      run start: clear timers
//   fire(v)                      per drawn volley; v = {x,y,z, lead, dmg, unit, shots, show, mk, range, pierce, idx}
//                                (range / pierce already include hero mods and boss reach)
//   onHit(b, kind, target, res)  -> res override ('bounce' keeps the bullet on its rewritten vx/vz);
//                                game.horde.last holds the {killed, used, blocked} of the enemy hit just applied
//   onLand(b) / onExpire(b)      lob landing / range end
//   update(dt)                   after bullets each step (cadences: turret timer, etc.)
//   crowdFactor(mix)             bot + UI: effective crowd multiplier for {type: share} incl. exposure
//   bossFactor(bossType)         bot estimate (default = bossMul)
// Dice: game.procRng only (never game.rng / Math.random). Damage: horde.applyDamage / boss.damageTyped.
import { HIT } from '../../config.js';
import { MKREF, MK_SCALE, mkRow } from '../../data/weapons.js';
import { SHIELD_HITS, vsMul, bossMul } from '../../data/matchups.js';
import { buildProjectileGeometry } from '../../models/weapons/projectiles.js';

const DEG = Math.PI / 180;

export class WeaponBehaviour {
  constructor(sys, def) {
    this.sys = sys;
    this.game = sys.game;
    this.def = def;
    this.id = def.id;
    this.el = def.element === 'neutral' ? 'neutral' : def.id; // matchup key (data/matchups.js)
    this.shieldHits = SHIELD_HITS[this.el] || 1;
    this.mk = 1;
    this.style = -1;
    this.tracerStyle = -1;
  }

  init() {
    const B = this.game.bullets;
    this.style = B.registerStyle(this.id + ':main', buildProjectileGeometry(this.id, 1, 'main'));
    if (this.def.tracerLook) this.tracerStyle = B.registerStyle(this.id + ':tracer', buildProjectileGeometry(this.id, 1, 'tracer'));
  }

  equip(mk) { this.setMk(mk); }
  unequip() {}

  setMk(mk) {
    this.mk = mk;
    const B = this.game.bullets;
    B.setStyleGeometry(this.style, buildProjectileGeometry(this.id, mk, 'main'));
    if (this.tracerStyle >= 0) B.setStyleGeometry(this.tracerStyle, buildProjectileGeometry(this.id, mk, 'tracer'));
  }

  reset() {}

  /** Mk row (rate, dmg, speed, range, pierce, pellets, spread, specials). */
  row(mk = this.mk) { return mkRow(this.def, mk); }

  /** Damage of one real shot before upgrades / hero mods. */
  unitDamage(mk = this.mk) { return this.row(mk).dmg; }

  /** Single-target sheet DPS per raider before upgrades / hero mods (default MKREF * K). */
  sheetDps(mk = this.mk) { return MKREF[mk] * this.def.K; }

  /** Spawns one main bullet with this behaviour's defaults (owner, element, mask, Mk scale). */
  spawnMain(v, x, y, z, vx, vz, dmg = v.dmg, pierce = v.pierce, range = v.range, style = this.style) {
    const b = this.game.bullets.spawn(style, x, y, z, vx, vz, dmg, pierce, v.unit, range);
    if (!b) return null;
    b.owner = this; b.el = this.el; b.mask = HIT.ALL; b.show = v.show;
    const s = MK_SCALE[v.mk - 1] || 1;
    b.sx = b.sy = b.sz = s;
    return b;
  }

  fire(v) {
    const r = this.row(v.mk);
    const n = r.pellets || 1, sp = r.speed || 60, spread = r.spread || 0;
    for (let k = 0; k < n; k++) {
      const ang = n > 1 ? (k - (n - 1) / 2) * spread * DEG : 0;
      this.spawnMain(v, v.x, v.y, v.z + v.lead, Math.sin(ang) * sp, -Math.cos(ang) * sp);
    }
  }

  onHit(b, kind, target, res) { return res; }
  onLand() {}
  onExpire() {}
  update() {}

  /** Run-phase reach (bot exposure): gameplay range of the current Mk. */
  reach(mk = this.mk) { const r = this.row(mk); return r.throw || r.range || 60; }

  crowdFactor(mix) {
    const exposure = Math.max(0.3, Math.min(1, (this.reach() - 6) / 46));
    let m = 0, w = 0;
    if (mix) for (const k in mix) { m += mix[k] * vsMul(this.el, k); w += mix[k]; }
    return exposure * (w > 0 ? m / w : 1);
  }

  bossFactor(type) { return bossMul(this.el, type); }
}
