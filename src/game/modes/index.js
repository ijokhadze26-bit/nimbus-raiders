// Game modes controller (stage 5, game.modes): BOSS RUSH, DAILY CHALLENGE and CHAOS MODE runs (ENDLESS per world
// stays in game/endless.js + data/endless.js). game.js only calls in through one-line hooks:
//   beginRun -> begin(mode)      (clears the run effects of the last mode run)
//   step     -> update(dt)       (fog twist), steer(x) (mirror twist)
//   win      -> onWin()          (true = the run goes on: next Boss Rush fight)
//   retry    -> retry()          (same mode again; Chaos rolls new modifiers)
// Run modes: 'bossrush' | 'daily' | 'chaos' (mode payouts + bests: save/modes.js; result: ui/screens/moderesult.js).
import { getLevel } from '../../data/levels.js';
import { worldOf } from '../../data/worlds.js';
import { upgradeEffects } from '../../data/shop.js';
import { bossRushDef, rushNext, rushTheme, rushBoss, BOSS_RUSH, RUSH_COUNT } from './bossrush.js';
import { dailyPlan } from './daily.js';
import { rollChaos } from './chaos.js';
import { applyDef, applyRun, twistsText, SHARED_IN_BEGINRUN } from './twists.js';

export const MODE_IDS = ['bossrush', 'daily', 'chaos'];

export class Modes {
  init(game) {
    this.game = game;
    this.kind = null;          // mode of the current run (null = not a mode run)
    this.fx = { fogMul: 1, mirror: false, giant: 0, oneLife: false };
    this.rush = null;          // { index, beaten, startSquad }
    this.plan = null;          // daily plan / chaos roll of the current run
    this.twists = [];
    this.rolls = 0;            // chaos rolls under ?test=1 (deterministic)
    const ev = game.events;
    // giant enemies twist: every new horde is drawn bigger (event-driven, no per-frame work)
    ev.on('horde:incoming', () => {
      const s = this.fx.giant;
      if (!s || !game.horde) return;
      for (const e of game.horde.list) if (!e.giant) { e.giant = true; e.size = (e.size || 1) * s; }
    });
    // Boss Rush: the next fight's world sky swaps in under the boss death flash (like endless zones)
    ev.on('boss:defeated', () => {
      const run = game.run;
      if (this.kind !== 'bossrush' || !this.rush || !run || run.mode !== 'bossrush') return;
      const next = this.rush.index + 1;
      if (next >= RUSH_COUNT) return;
      run.theme = rushTheme(next);
      game.world.setTheme(run.theme);
    });
  }

  owns(mode) { return MODE_IDS.includes(mode); }

  /** game.beginRun hook: a run that is not this controller's own start drops every mode effect. */
  begin(mode) {
    this.fx.fogMul = 1; this.fx.mirror = false; this.fx.giant = 0; this.fx.oneLife = false;
    if (!this.starting) { this.kind = null; this.rush = null; this.plan = null; this.twists = []; }
  }

  /** Mode start. opts: { roll } (chaos: the roll shown on the loadout), { date } (daily: 'YYYY-MM-DD'). */
  start(kind, opts = {}) {
    const g = this.game, save = g.save && g.save.data;
    const lo = { hero: g.loadout.hero, weapon: g.loadout.weapon };
    let def = null, twists = [], plan = null;
    let ctx = null;
    if (kind === 'bossrush') {
      const up = upgradeEffects(save && save.upgrades);
      ctx = { startSquad: BOSS_RUSH.squad + up.startSquad, startMk: up.startTier, damageMul: up.damageMul, rateMul: up.rateMul };
      def = bossRushDef(ctx);
    }
    else if (kind === 'daily') {
      plan = dailyPlan(save, opts.date || undefined);
      twists = [plan.twist];
      const L = getLevel(plan.levelId);
      if (!L) return false;
      def = { ...applyDef(twists, L), name: `DAILY · ${L.name}`, daily: plan.date, modeLevel: true, ai: L.world };
    } else if (kind === 'chaos') {
      plan = opts.roll || this.roll();
      twists = plan.twists.slice();
      const L = getLevel(plan.levelId);
      if (!L) return false;
      def = { ...applyDef(twists, L), name: `CHAOS · ${L.name}`, chaos: twists.slice(), modeLevel: true, ai: L.world };
    } else return false;
    this.starting = true;
    try {
      this.kind = kind; this.plan = plan; this.twists = twists;
      g.beginRun(def, kind, 1, { ...lo, modifiers: SHARED_IN_BEGINRUN ? twists.slice() : undefined });
    } finally { this.starting = false; }
    if (kind === 'bossrush') {
      const start = ctx.startSquad + (g.heroes.startBonus || 0); // the hero's start bonus is known after beginRun
      ctx.startSquad = start;
      g.squad.reset(start, 0);
      this.rush = { index: 0, beaten: 0, startSquad: start, ctx };
    }
    if (twists.length) applyRun(twists, g);
    g.events.emit('mode:start', { mode: kind, twists: twists.slice(), text: twistsText(twists), plan, levelId: def.id, name: def.name });
    return true;
  }

  /** A fresh chaos roll (Math.random seed; fixed counter under ?test=1). */
  roll(seed) {
    const g = this.game;
    const s = seed ?? (g.params.test ? 9001 + 7919 * this.rolls++ : Math.floor(Math.random() * 1e9));
    return rollChaos(g.save && g.save.data, s);
  }

  /** game.win hook: true when the run goes on (a Boss Rush fight that was not the last). */
  onWin() {
    const g = this.game, run = g.run;
    if (this.kind !== 'bossrush' || !run || run.mode !== 'bossrush' || !this.rush) return false;
    return rushNext(g, this.rush);
  }

  /** Same mode again (RETRY): Boss Rush from fight 1, today's Daily, a new Chaos roll. */
  retry() {
    const k = this.kind || (this.game.run && this.game.run.mode);
    return this.start(k, k === 'daily' && this.plan ? { date: this.plan.date } : {});
  }

  update() {
    const g = this.game, hz = g.hazards;
    if (this.fx.fogMul < 1 && hz && hz.mods) hz.mods.fogMul = Math.min(hz.mods.fogMul, this.fx.fogMul);
    // one life: the run ends the moment the squad drops below half its peak
    if (this.fx.oneLife && g.run && g.run.active && g.squad.count * 2 < g.run.stats.maxSquad) g.onSquadEmpty('oneLife');
  }

  /** Steering target through the mirror twist. */
  steer(x) { return this.fx.mirror ? -x : x; }

  /** Live info for the HUD / tests. */
  info() {
    const run = this.game.run;
    return {
      kind: this.kind, twists: this.twists.slice(), plan: this.plan,
      rush: this.rush ? { index: this.rush.index, beaten: this.rush.beaten, of: RUSH_COUNT, boss: run && run.boss ? run.boss.type : null } : null,
      time: run ? run.time : 0, fx: { ...this.fx },
    };
  }
}

export { rushBoss, worldOf };
