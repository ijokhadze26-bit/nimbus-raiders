// Shared helpers of the world-hazard system (update 3). COMMON is mixed into the Hazards system (sys.*), so
// every kind module (forge.js, frost.js, candy.js, citadel.js) uses the same rules:
//   sys.killIn(test(x, z) -> bool, maxPerSec, reason, key?)  kills squad members inside an area, rate-limited
//     (budget per key, refills at maxPerSec, holds at most max(1, 12% of a second's worth)); every loss goes
//     through squad.killMember (Guard / Sugar Shield absorb as usual), shielded() = no losses, Pip only goes
//     when he is the last one standing (a touch on Pip takes the raider nearest to him, like blades). A big squad
//     draws at most 320 Raiders, so each one drawn stands for count / drawn members: the unseen reserves go with
//     it (squad.remove, carried as a fraction), and a hazard costs a 900 squad the same share as a 90 squad.
//   sys.laneRange(lane, out) -> {x0, x1}; sys.tele(kind, ...) telegraphs flagged `hazard` (the autopilot reads
//     the matching sys.danger zones instead of dodging the paint); sys.sfx(name) / sys.fxB() / sys.shake(a).
// FALLER: the shared falling-object hazard (embers, icicles; later lightning): a telegraphed circle lands
// on where the squad will be, the object drops during the last `fallT` seconds and kills inside on impact.
import * as THREE from 'three';
import { ROAD_HALF, DIVIDER } from '../../config.js';

const SIDE = DIVIDER.width / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export const TMP = { m: _m, q: _q, p: _p, s: _s };
const _c = { x: 0, z: 0, r: 0 };

export const COMMON = {
  get low() { return this.game.engine.quality === 'low'; },
  get dist() { return -this.game.squad.leader.z; },
  get speed() { return this.run ? this.run.speed : 9; },
  get live() { const r = this.game.run; return !!(r && r.active && this.game.squad.count > 0); },

  /** x range of a lane: 'L' | 'R' | 'C' / 'both' (whole road). */
  laneRange(lane, out = {}) {
    if (lane === 'L') { out.x0 = -ROAD_HALF; out.x1 = -SIDE; } else if (lane === 'R') { out.x0 = SIDE; out.x1 = ROAD_HALF; } else { out.x0 = -ROAD_HALF; out.x1 = ROAD_HALF; }
    return out;
  },

  killIn(test, maxPerSec, reason, key = reason) {
    const g = this.game, sq = g.squad;
    if (!this.live) return 0;
    const cap = Math.max(1, maxPerSec * 0.12);
    let b = Math.min(cap, (this.budget.has(key) ? this.budget.get(key) : cap) + maxPerSec * this.dt);
    if (b < 1 || g.shielded()) { this.budget.set(key, b); return 0; }
    const ms = sq.members;
    const w = Math.max(1, sq.count / (ms.length + (sq.pipGone ? 0 : 1)));
    let n = 0;
    for (let i = ms.length - 1; i >= 0 && b >= 1 && sq.count > 0; i--) {
      if (i >= ms.length) continue;
      const m = ms[i];
      if (!test(m.x, m.z)) continue;
      sq.killMember(i, reason); b -= 1; n++;
    }
    const L = sq.leader;
    if (b >= 1 && sq.count > 0 && !sq.pipGone && test(L.x, L.z)) {
      let k = -1, kd = Infinity;
      for (let i = 0; i < ms.length; i++) { const dx = ms[i].x - L.x, dz = ms[i].z - L.z, d2 = dx * dx + dz * dz; if (d2 < kd) { kd = d2; k = i; } }
      if (k >= 0) sq.killMember(k, reason); else sq.remove(1, reason);
      b -= 1; n++;
    }
    this.budget.set(key, b);
    if (n && w > 1) {
      this.carry += n * (w - 1);
      const k = Math.floor(this.carry);
      if (k > 0 && sq.count > k) { this.carry -= k; sq.remove(k, reason); n += k; }
    }
    if (n) this.stats.kills[reason] = (this.stats.kills[reason] || 0) + n;
    return n;
  },

  /** Telegraph from game.telegraph, flagged as a hazard (min 0.9 s warning is enforced by telegraph.js). */
  tele(kind, a, b, c, d, e, color) {
    const T = this.game.telegraph;
    const h = kind === 'circle' ? T.circle(a, b, c, d, { color, attack: 'hazard' }) : T.lane(a, b, c, d, e, { color, attack: 'hazard' });
    h.hazard = true;
    return h;
  },

  sfx(name, opts) { const ev = this.game.events; if (ev.wants('hazard:sfx')) ev.emit('hazard:sfx', { sfx: name, opts }); },
  fxB() { const fx = this.game.fx; return fx && fx.B ? fx.B : null; },
  shake(a) { this.game.events.emit('fx:shake', { amount: a }); },

  /** Shared lazily built visuals of a kind (one set per kind per session). */
  view(key, make) { return this.views[key] || (this.views[key] = make(this)); },
};

/**
 * Falling-object hazard. cfg: { reason, color (telegraph), fallT, height, killRate, land(sys, d), aim? }.
 * Event: { at, length, every (s), r, warn }. Object fields used by the kind's sync: drops [{x, z, r, t, warn,
 * landed, u (0..1 fall progress)}].
 */
export const FALLER = {
  create(sys, ev, cfg) {
    return { cfg, from: ev.at, to: ev.at + (ev.length || 30), every: ev.every || 1.2, r: ev.r || 1.3, warn: ev.warn || 1.1, timer: 0.35, drops: [], z: -ev.at };
  },
  update(sys, o, dt) {
    const dist = sys.dist, run = sys.game.run;
    // drops land inside [from, to]: spawn while the landing point (the squad's spot `warn` s ahead) is in it
    const land = dist + sys.speed * o.warn;
    if (run && run.phase === 'run' && land >= o.from && land <= o.to) {
      o.timer -= dt;
      if (o.timer <= 0) { o.timer = o.every * sys.rng.range(0.8, 1.2); FALLER.spawn(sys, o); }
    }
    for (let i = o.drops.length - 1; i >= 0; i--) {
      const d = o.drops[i];
      d.t += dt;
      d.u = Math.max(0, Math.min(1, 1 - (d.warn - d.t) / o.cfg.fallT));
      if (!d.landed) {
        if (d.t >= d.warn) {
          d.landed = true;
          const r2 = d.r * d.r;
          sys.killIn((x, z) => { const dx = x - d.x, dz = z - d.z; return dx * dx + dz * dz < r2; }, o.cfg.killRate || 45, o.cfg.reason, d);
          sys.budget.delete(d);
          o.cfg.land(sys, d);
        } else sys.danger.push(d.zone);
      } else if (d.t >= d.warn + 0.5) o.drops.splice(i, 1);
    }
    return dist <= o.to + 20 || o.drops.length > 0;
  },
  spawn(sys, o) {
    const sq = sys.game.squad, rng = sys.rng;
    const warn = o.warn;
    const lead = sys.speed * warn;
    // aim: somewhere on the blob where it will be when the drop lands (a big squad cannot step out entirely)
    const c = sq.center(_c), spread = Math.max(1.2, c.r * 0.75);
    const x = Math.max(-4.3, Math.min(4.3, c.x + rng.range(-spread, spread)));
    const z = c.z - lead + rng.range(-spread, spread * 0.6);
    const h = sys.tele('circle', x, z, o.r, warn, 0, o.cfg.color);
    o.drops.push({ x, z, r: o.r, t: 0, warn: h.duration, u: 0, landed: false, h, zone: { kind: 'circle', x, z, r: o.r, pad: 0.35 } });
  },
  release(sys, o) { for (const d of o.drops) if (d.h && !d.landed) sys.game.telegraph.cancel(d.h); o.drops.length = 0; },
};
