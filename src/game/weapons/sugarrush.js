// SUGAR RUSH (candy, SPEC2 §2.3): lobbed candy bombs. A bomb flies `lobTime` s on an arc (apex 3.5 u, air =
// true: it touches nothing while airborne), splashes every enemy within r (hp directly: splash ignores
// shields), then hops 5 u forward and splashes again at 50% damage / 0.75 r once per bounce. The first landing
// leaves a caramel puddle (>= 0.5 s apart, at most 5 alive: zones.addPuddle). Boss phase: bombs land on the
// boss front, splash it, hop onto it and splash it again (exactly one bounce, no puddle).
// Aim (no dead zone): the nearest enemy ahead in the shooter's lane band, predicted to landing time:
//   ahead = (shooter.z - e.z) - T * (run.speed + approach); land = clamp(ahead, 0.5, throw)
//   target z = shooter.z - T * run.speed - land, and never closer than minLand to the firing point.
// The band search runs once per step per lane band (L / C / R) and is cached.
import { WeaponBehaviour } from './base.js';
import { HORDE } from '../../config.js';
import { vsMul } from '../../data/matchups.js';
import { bossPhase, bossFront, special, fxq, exposure, mixMul } from './common.js';

const GROUND = 0.55, HOP_APEX = 1.7;
const BANDS = [-3, 0, 3];
const SPLASH = { el: 'sugarrush', shieldHits: 1, bypassShield: true, cause: 'weapon', events: false };
const P = { x: 0, z: 0 };

export class SugarRush extends WeaponBehaviour {
  init() {
    super.init();
    this.cacheT = -1;
    this.cache = [null, null, null];
    this.seen = [false, false, false];
    this.splashFn = (e) => { this.game.horde.applyDamage(e, this.sd, this.sd, SPLASH); this.sn++; };
  }

  reset() { this.k = 0; this.lastPuddle = -1e9; this.stats = { bombs: 0, landings: 0, splashHits: 0, bossHits: 0, puddles: 0, airHits: 0 }; }

  /** Nearest alive enemy ahead in the band of x (cached per step and band). */
  target(x) {
    const g = this.game;
    if (this.cacheT !== g.time) { this.cacheT = g.time; this.seen[0] = this.seen[1] = this.seen[2] = false; }
    const i = x < -1.5 ? 0 : x > 1.5 ? 2 : 1;
    if (!this.seen[i]) {
      this.seen[i] = true;
      this.cache[i] = g.horde.nearestAheadBand(BANDS[i], g.squad.leader.z + 0.5, this.row().band ?? 2.5, 90);
    }
    return this.cache[i];
  }

  fire(v) {
    const g = this.game, r = this.row(v.mk), run = g.run;
    const T = r.lobTime, st = this.stats || (this.reset(), this.stats);
    const boss = bossPhase(g);
    const jit = (g.procRng.next() * 2 - 1) * r.jitter;
    const x0 = v.x, y0 = v.y, z0 = v.z + v.lead;
    let tx, tz;
    if (boss && bossFront(g, P)) { tx = P.x + jit; tz = P.z; }
    else {
      const speed = run ? run.speed : 0;
      const reach = r.throw * (g.heroes ? g.heroes.rangeMul : 1);
      const e = this.target(v.x);
      let land = reach;
      if (e) {
        const appr = e.charging && e.freezeT <= 0 ? HORDE.baseSpeed * e.def.speed * e.spd : 0;
        land = Math.max(0.5, Math.min(reach, (z0 - e.z) - T * (speed + appr)));
      }
      tx = (e ? e.x : x0) + jit;
      tz = Math.min(z0 - T * speed - land, z0 - r.minLand);
    }
    if (tx > 4.75) tx = 4.75; else if (tx < -4.75) tx = -4.75;
    const gr = (8 * (r.apex - GROUND)) / (T * T);
    const b = this.spawnMain(v, x0, y0, z0, (tx - x0) / T, (tz - z0) / T, v.dmg, 0, 1e4);
    if (!b) return;
    b.mask = 0; b.air = true; b.g = gr; b.vy = (gr * T) / 2 + (GROUND - y0) / T;
    b.bounces = boss ? 1 : r.bounces; b.gen = 0; b.data = boss ? 1 : 0;
    this.k = (this.k + 1) & 3;
    b.roll = this.k * Math.PI * 0.5; b.spin = 7; // the four candy colours face the camera in turn
    st.bombs++;
  }

  onHit(b, kind, t, res) { if (b.air) this.stats.airHits++; return res; }

  onLand(b) {
    const g = this.game, r = this.row(), st = this.stats;
    const first = b.gen === 0;
    const dmg = first ? b.dmg : b.dmg * r.bounceDmg;
    const rad = first ? r.splashR : r.splashR * r.bounceR;
    st.landings++;
    this.sd = dmg; this.sn = 0;
    g.horde.forEachInRadius(b.x, b.z, rad, this.splashFn);
    st.splashHits += this.sn;
    if (b.data === 1 && g.boss && g.boss.targetable) { g.boss.damageTyped(dmg, this.el); st.bossHits++; }
    fxq(this, 'splash', b.x, GROUND, b.z, b.x, rad, b.z, b.gen);
    special(this, 'land', b.x, GROUND, b.z, b.gen);
    if (first && b.data !== 1 && g.time - this.lastPuddle >= r.puddleGap) {
      this.lastPuddle = g.time;
      g.zones.addPuddle(b.x, b.z, r.puddleR, r.puddleTime, r.puddleSlow, r.stickyTime);
      st.puddles++;
      fxq(this, 'puddle', b.x, 0.05, b.z, b.x, r.puddleR, b.z, 0);
      special(this, 'puddle', b.x, 0.05, b.z);
    }
    if (b.bounces > 0) {
      b.bounces--; b.gen++;
      const T = r.hopTime, gr = (8 * (HOP_APEX - GROUND)) / (T * T);
      b.air = true; b.g = gr; b.vy = (gr * T) / 2; b.vx = 0;
      b.vz = b.data === 1 ? 0 : -r.hop / T;
      b.spin = 11;
    } else b.dead = true;
  }

  bossFactor(type) { return super.bossFactor(type) * ((this.def.bossK || this.def.K) / this.def.K); }

  crowdFactor(mix) {
    const r = this.row();
    // splash on a packed crowd hits several enemies; the lob delay and throw distance price the reach
    return exposure(r.throw) * mixMul(this, mix, vsMul) * (1.4 + 0.5 * r.splashR);
  }
}
