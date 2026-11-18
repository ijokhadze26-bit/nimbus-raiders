// Endless run controller: fills the run zone by zone from the seeded generator (data/endless.js), arms a boss
// arena every ENDLESS.bossEvery units, and turns a boss kill into a reward + the next zone instead of a win.
// The run only ends when the squad is wiped out (game.onSquadEmpty -> run:lose with the distance as score).
// Update 2: from zone 2 on, one weapon crate per zone at a row with no gate or barrel; lane and weapon come
// from a separate Rng(seed * 31 + 7), so EndlessGen's own draw sequence (every row) is unchanged.
import { ENDLESS, EndlessGen, endlessBoss, endlessReward, endlessSpeed, endlessTheme } from '../data/endless.js';
import { crate } from '../data/levels.js';
import { WEAPON_IDS } from '../data/weapons.js';
import { Rng } from '../core/rng.js';

const CRATE_CLEAR = 12;

/** Crate for a generated zone (zone >= 2): a row clear of gates / barrels, lane + weapon from rng. null = none. */
export function endlessCrate(rng, events) {
  const rows = [];
  for (const e of events) {
    if (e.type === 'gate' || e.type === 'barrel' || rows.includes(e.at)) continue;
    let ok = true;
    for (const o of events) if ((o.type === 'gate' || o.type === 'barrel') && Math.abs(o.at - e.at) < CRATE_CLEAR) { ok = false; break; }
    if (ok) rows.push(e.at);
  }
  const lane = rng.chance(0.5) ? 'L' : 'R';
  const weapon = rng.pick(WEAPON_IDS);
  const at = rows.length ? rows[Math.floor(rng.next() * rows.length)] : null;
  return at == null ? null : crate(at, lane, weapon);
}
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
      const theme = endlessTheme(this.zone + 1, this.world);
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
    this.world = (run.def && run.def.world) || 1; // stage 5: endless per world (data/endless.js endlessDef)
    this.gen = new EndlessGen(seed, this.world);
    this.crateRng = new Rng(seed * 31 + 7);
    run.seed = seed;
    run.segStart = 0;
    run.length = ENDLESS.bossEvery;
    run.boss = endlessBoss(1, this.world);
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
    run.boss = endlessBoss(this.zone, this.world);
    run.speed = endlessSpeed(this.zone);
    const rows = this.gen.fill(from + ENDLESS.postBoss, run.length - ENDLESS.preBoss);
    run.append(rows);
    const c = endlessCrate(this.crateRng, rows);
    if (c) run.append([c]);
    game.bosses.preload(run.boss);
    run.setPhase('run');
    game.events.emit('endless:boss', { n, coins: rw.coins, troops: rw.troops, drone: rw.drone, next: run.length });
    if (game.fx && game.fx.confetti && game.fx.confetti.burst) game.fx.confetti.burst(1.6);
    if (game.audio && game.audio.fx) game.audio.fx('daily', null);
  }
}
