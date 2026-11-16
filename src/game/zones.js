// Gameplay zones (SPEC2 §6.4): caramel puddles (slow + sticky) and black holes (pull + crush). Simulated
// identically on every quality; views (models/weapons/zones.js) only read zones.list. Updated inside
// status.tickHorde (before enemies move), expire on game time. Zones survive a weapon swap (Void -> Sugar combo);
// resetCombat clears them.
//   addPuddle(x, z, r, dur, pct, stickyTime = 0.8)        cap 5, replaces the oldest
//   addHole(x, z, r, coreR, pull, dur, pool, el, opts)   cap 6; a collapse within 3 u of a hole, or any while 6
//     exist, merges into the nearest (pools add, timer resets, radius x1.08 up to x1.3); opts.boss = crush the boss
import { applyDamage, forEachInRadius } from './hordeops.js';
import { weaponDef } from '../data/weapons.js';

const PUDDLE_MAX = 5, HOLE_MAX = 6;
const CRUSH = { el: 'voidsiphon', shieldHits: 1, bypassShield: true, cause: 'weapon', events: false };

export class Zones {
  init(game) {
    this.game = game;
    this.puddles = [];
    this.holes = [];
    this.list = { puddles: this.puddles, holes: this.holes };
    this.freeP = []; this.freeH = [];
    const vd = weaponDef('voidsiphon').mk[0];
    this.merge = { r: vd.mergeR ?? 3, grow: vd.mergeGrow ?? 1.08, cap: vd.mergeCap ?? 1.3, tank: vd.tankPull ?? 0.3 };
  }

  clear() {
    for (const p of this.puddles) this.freeP.push(p);
    for (const h of this.holes) this.freeH.push(h);
    this.puddles.length = 0; this.holes.length = 0;
  }

  reset() { this.clear(); }

  addPuddle(x, z, r, dur, pct, stickyTime = 0.8) {
    if (this.puddles.length >= PUDDLE_MAX) this.freeP.push(this.puddles.shift());
    const p = this.freeP.length ? this.freeP.pop() : {};
    p.x = x; p.z = z; p.r = r; p.dur = dur; p.t = 0; p.pct = pct; p.sticky = stickyTime; p.id = (this.pid = (this.pid || 0) + 1);
    this.puddles.push(p);
    return p;
  }

  addHole(x, z, r, coreR, pull, dur, pool, el = 'voidsiphon', opts = {}) {
    const hs = this.holes, M = this.merge;
    let near = -1, nd = Infinity;
    for (let i = 0; i < hs.length; i++) {
      const dx = hs[i].x - x, dz = hs[i].z - z, d2 = dx * dx + dz * dz;
      if (d2 < nd) { nd = d2; near = i; }
    }
    if (near >= 0 && (nd <= M.r * M.r || hs.length >= HOLE_MAX)) {
      const h = hs[near];
      h.pool += pool;
      h.t = 0; h.dur = dur;
      h.grow = Math.min(M.cap, h.grow * M.grow);
      h.merges++;
      if (opts.boss) h.boss = true;
      return h;
    }
    const h = this.freeH.length ? this.freeH.pop() : {};
    h.x = x; h.z = z; h.r0 = r; h.core0 = coreR; h.pull = pull; h.dur = dur; h.t = 0; h.pool = pool; h.el = el;
    h.grow = 1; h.merges = 0; h.boss = !!opts.boss; h.id = (this.hid = (this.hid || 0) + 1);
    hs.push(h);
    return h;
  }

  /** Radius / core radius of a hole now (merges grow it). */
  holeR(h) { return h.r0 * h.grow; }
  holeCore(h) { return h.core0 * h.grow; }

  update(dt) {
    const game = this.game, horde = game.horde;
    // puddles: membership this step (status reads e.pud) + sticky refresh
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t += dt;
      if (p.t >= p.dur) { this.freeP.push(p); this.puddles.splice(i, 1); continue; }
      this._p = p;
      forEachInRadius(horde, p.x, p.z, p.r, this.inPuddle || (this.inPuddle = (e) => {
        const q = this._p;
        if (q.pct > e.pud) e.pud = q.pct;
        game.status.sticky(e, q.pct, q.sticky);
      }));
    }
    // holes: pull everything within r toward the centre, crush what sits in the core
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      // drain the pool over the time left: a merge adds to what is left (it never re-deals what was crushed)
      const d = h.pool * Math.min(1, dt / Math.max(dt, h.dur - h.t));
      h.pool -= d;
      h.t += dt;
      if (h.t >= h.dur - 1e-9) {
        this.freeH.push(h); this.holes.splice(i, 1);
        if (game.events.wants('weapon:special')) game.events.emit('weapon:special', { weapon: 'voidsiphon', kind: 'hole:end', pos: { x: h.x, y: 0.5, z: h.z }, n: 0 });
      }
      if (h.boss) {
        const b = game.boss;
        if (b && b.targetable) b.damageTyped(d, h.el);
        continue;
      }
      this._h = h; this._dt = dt; this._crush = d; this._core = this.holeCore(h);
      forEachInRadius(horde, h.x, h.z, this.holeR(h), this.inHole || (this.inHole = (e) => {
        const H = this._h;
        const dx = H.x - e.x, dz = H.z - e.z, d = Math.hypot(dx, dz);
        if (d > 1e-4) {
          const sp = Math.min(H.pull * (e.def.contactKills ? this.merge.tank : 1), d / this._dt);
          e.px += (dx / d) * sp; e.pz += (dz / d) * sp;
        }
        if (d <= this._core) { CRUSH.el = H.el; applyDamage(horde, e, this._crush, this._crush, CRUSH); }
      }));
    }
  }
}
