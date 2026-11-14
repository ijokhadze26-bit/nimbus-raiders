// Endless run controller: fills the run zone by zone from the seeded generator (data/endless.js), arms a boss
// arena every ENDLESS.bossEvery units, and turns a boss kill into a reward + the next zone instead of a win.
// The run only ends when the squad is wiped out (game.onSquadEmpty -> run:lose with the distance as score).
import { ENDLESS, EndlessGen, endlessBoss, endlessReward, endlessSpeed, endlessTheme } from '../data/endless.js';

export class Endless {
  init(game) {
    this.game = game;
    this.active = false;
    this.run = null;
    this.zone = 1;
    this.bosses = 0;
    // the boss death flash is fully white for a moment: swap the sky there so the new zone feels new
    game.events.on('boss:defeated', () => {
      if (!this.active || !this.run || this.run !== game.run) return;
      const theme = endlessTheme(this.zone + 1);
      this.run.theme = theme;
      game.world.setTheme(theme);
    });
  }

  /** Called by game.beginRun right after the Run exists (before systems take their event lists). */
  start(run, seed) {
    this.active = true;
    this.run = run;
    this.zone = 1;
    this.bosses = 0;
    this.gen = new EndlessGen(seed);
    run.seed = seed;
    run.segStart = 0;
    run.length = ENDLESS.bossEvery;
    run.boss = endlessBoss(1);
    run.speed = endlessSpeed(1);
    run.stats.bosses = 0;
    run.append(this.gen.fill(ENDLESS.startClear, run.length - ENDLESS.preBoss));
  }

  stop() { this.active = false; this.run = null; }

  /** game.win() in endless: pay the arena reward, open the next zone and keep running. */
  bossDown() {
    const game = this.game, run = this.run;
    if (!this.active || !run || run !== game.run || !run.active) return;
    const n = this.zone;
    const rw = endlessReward(n);
    this.bosses = n;
    run.stats.bosses = n;
    run.coins += rw.coins;
    game.bosses.clear();
    game.weapons.enabled = true; // cease-fire from boss:defeated ends
    game.telegraph.reset();
    const L = game.squad.leader;
    const pos = { x: L.x, y: 1.2, z: L.z };
    game.events.emit('coin:collect', { amount: rw.coins, pos });
    if (rw.troops) game.squad.add(rw.troops, 'barrel');
    if (rw.drone && game.helpers) game.helpers.add('drone', rw.drone);
    // next zone
    this.zone = n + 1;
    const from = Math.max(run.dist, run.length);
    run.segStart = run.dist;
    run.length = this.zone * ENDLESS.bossEvery;
    run.boss = endlessBoss(this.zone);
    run.speed = endlessSpeed(this.zone);
    run.append(this.gen.fill(from + ENDLESS.postBoss, run.length - ENDLESS.preBoss));
    game.bosses.preload(run.boss);
    run.setPhase('run');
    game.events.emit('endless:boss', { n, coins: rw.coins, troops: rw.troops, drone: rw.drone, next: run.length });
    if (game.fx && game.fx.confetti && game.fx.confetti.burst) game.fx.confetti.burst(1.6);
    if (game.audio && game.audio.fx) game.audio.fx('daily', null);
  }
}
