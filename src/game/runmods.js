// Run modifiers at run time (update 3 stage 5; the list + apply() are in data/modifiers.js).
// game.beginRun calls begin(run, ids) right after the hero reset: applyMods() fills run.mods and edits the run's event
// copies, then this sets the squad cap. The rest is read where it matters:
// - startSquad(n): HALF SQUAD halves the start (min 1), TINY SQUAD caps it; game.beginRun skips the shop upgrades
//   for NO UPGRADES (run.mods.noUpgrades).
// - update(dt) (end of game.step): FOG multiplies the hazard fog (hazards reset mods every step), ONE LIFE (no Guard,
//   run over when the squad falls below half of its peak), GIANT ENEMIES (bigger Murklings; hp is in the events).
// - steer(x): MIRROR STEERING flips the player's target (never the autopilot's).
import { FORMATION } from '../config.js';
import { applyMods, freshMods, GIANT } from '../data/modifiers.js';

export class RunMods {
  init(game) {
    this.game = game; this.mods = freshMods();
    this.ext = [];      // online versus (src/online/game): fn(dt, rawDt) run at the end of every playing step
    this.holdFn = null; // steering override (frozen steering): fn(target) -> x, covers the autopilot too
  }

  /** The final steering target of a step (game.step): the override when one is set, else x unchanged. */
  hold(x) { return this.holdFn ? this.holdFn(x) : x; }

  /** Run start (run null = menus): applies `ids`, resets the squad cap and the ONE LIFE Guard. */
  begin(run, ids) {
    const g = this.game;
    this.mods = run ? applyMods(run.mode === 'practice' ? [] : ids, run.def, run, g) : freshMods();
    if (run && g.modes && g.modes.owns(run.mode)) this.mods.bonus = 0; // mode twists: the mode pays its own bonus
    g.squad.capMax = this.mods.cap ? Math.min(FORMATION.cap, this.mods.cap) : FORMATION.cap;
    if (this.mods.oneLife && g.heroes) { g.heroes.guard = 0; g.heroes.guardMax = 0; }
  }

  /** Start squad after the modifiers (HALF SQUAD halves, TINY SQUAD caps). */
  startSquad(n) {
    const m = this.mods;
    let s = Math.max(1, Math.floor(n * m.startMul));
    if (m.cap) s = Math.min(s, m.cap);
    return s;
  }

  steer(x) { return this.mods.mirror ? -x : x; }

  update(dt, rawDt) {
    const g = this.game, run = g.run, m = this.mods;
    for (let i = 0; i < this.ext.length; i++) this.ext[i](dt, rawDt);
    if (!run || !m.ids.length) return;
    if (m.fogMul !== 1 && g.hazards) g.hazards.mods.fogMul *= m.fogMul;
    if (m.giant) {
      const list = g.horde.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.gStamp !== e.ph) { e.gStamp = e.ph; e.size = (e.size || 1) * GIANT.size; }
      }
    }
    if (m.oneLife && run.active) {
      const sq = g.squad, peak = run.stats.maxSquad;
      if (g.heroes && g.heroes.guardMax) { g.heroes.guard = 0; g.heroes.guardMax = 0; }
      if (sq.count > 0 && peak >= 2 && sq.count < peak / 2) {
        run.failReason = 'oneLife';
        sq.setCount(0, 'oneLife');
      }
    }
  }
}
