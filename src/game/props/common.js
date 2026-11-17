// Shared helpers of the road-object system (mixed into Props as sys.*):
//   sys.crush(test(e) -> bool, kind, maxKills?)  kills alive enemies passing the test (horde.kill, cause 'prop'),
//     in list order (deterministic), counted in stats.kills[kind]; returns how many died
//   sys.heavy(e)  Bulwarks, Broodling Hives, elites: tougher to sweep away (dam push-back, boulder momentum)
//   sys.laneX(lane) lane centre; sys.sfx(name) / sys.fxB() / sys.shake(a); sys.view(key, make) lazy shared visuals
//   sys.botGoal(autopilot, gate)  where the bot steers for a road object (push a boulder, line up with a target)
import { LANES, TARGET_CLAMP } from '../../config.js';
import { ALIVE } from '../hordeops.js';

export const COMMON = {
  get low() { return this.game.engine.quality === 'low'; },
  get dist() { return -this.game.squad.leader.z; },
  get live() { const r = this.game.run; return !!(r && r.active && r.phase === 'run'); },

  laneX(lane) { return lane === 'R' ? LANES.R : LANES.L; },
  heavy(e) { return e.elite || e.def.hp >= 8; },

  crush(test, kind, maxKills = Infinity) {
    const h = this.game.horde, list = h.list;
    let n = 0;
    for (let i = 0; i < list.length && n < maxKills; i++) {
      const e = list[i];
      if (e.state !== ALIVE || !test(e)) continue;
      h.kill(e, 'prop');
      n++;
    }
    if (n) this.stats.kills[kind] = (this.stats.kills[kind] || 0) + n;
    return n;
  },

  sfx(name, opts) { const ev = this.game.events; if (ev.wants('hazard:sfx')) ev.emit('hazard:sfx', { sfx: name, opts }); },
  fxB() { const fx = this.game.fx; return fx && fx.B ? fx.B : null; },
  shake(a) { this.game.events.emit('fx:shake', { amount: a }); },
  view(key, make) { return this.views[key] || (this.views[key] = make(this)); },

  /**
   * Autopilot: a boulder resting 2-30 u ahead is pushed (when no gate decision is near); a shootable object
   * 14-50 u ahead with enemies around it is lined up with when the squad's barrel fire can break it in time.
   */
  botGoal(ap, gate) {
    const game = this.game, L = game.squad.leader, run = game.run;
    if (!run || run.phase !== 'run' || (gate && gate.dz < 34)) return null;
    const speed = Math.max(1, run.speed), dps = game.weapons.barrelDps();
    let best = null, bs = Infinity;
    for (const o of this.list) {
      const dz = L.z - o.z;
      let x = null;
      if (o.ev.kind === 'boulder') { if (o.state === 'rest' && dz > 2 && dz < 30) x = o.x; }
      else if (o.shoot && dz > 14 && dz < (o.ev.kind === 'crane' ? 64 : 50) && dps * 0.5 * ((dz - 8) / speed) * 0.75 >= o.hp && game.horde.densityAt(o.tx, 2.5, o.z - 12, o.z + 18) >= 6) x = o.tx;
      if (x === null) continue;
      if (ap.p.barrelSkip && ap.roll(o, 'prop') < ap.p.barrelSkip) continue;
      if (dz < bs) { bs = dz; best = x; }
    }
    return best === null ? null : Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, best));
  },
};
