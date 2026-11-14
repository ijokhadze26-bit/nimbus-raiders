// Debug / test API (window.__game.debug). Balance + smoke tests depend on these names.
import { Loop } from '../core/loop.js';
import { MAX_TIER } from '../data/weapons.js';

export function createDebug(game) {
  const debug = {
    state() {
      const run = game.run;
      const boss = game.boss;
      return {
        state: game.state,
        phase: run ? run.phase : null,
        levelId: run ? run.levelId : null,
        mode: run ? run.mode : null,
        dist: run ? Math.round(run.dist * 10) / 10 : 0,
        length: run ? run.length : 0,
        squad: game.squad.count,
        tier: game.weapons.tier,
        enemies: game.horde ? game.horde.count : 0,
        bossHp: boss ? Math.ceil(boss.hp) : 0,
        bossState: boss ? boss.state : null,
        bossPhase: boss ? boss.phase : 0,
        telegraphs: game.telegraph ? game.telegraph.active.length : 0,
        kills: run ? run.kills : 0,
        bossMax: boss ? boss.maxHp : 0,
        coins: run ? run.coins : 0,
        fps: Math.round(game.loopFps || 0),
        calls: game.engine.stats.calls,
        tris: game.engine.stats.tris,
        quality: game.engine.quality,
        powers: game.powers && game.powers.list ? game.powers.list() : [],
        helpers: { drones: game.helpers ? game.helpers.drones : 0, turrets: game.helpers ? game.helpers.turrets : 0 },
        bullets: game.bullets.count,
        gates: game.gates.live.length,
        timeScale: game.timeScale,
        result: game.lastResult,
      };
    },
    startLevel(id) { game.startLevel(id); return debug.state(); },
    startEndless() { game.startEndless(); return debug.state(); },
    toTitle() { game.toTitle(); return debug.state(); },
    setAutopilot(on = true) { game.autopilot.enabled = !!on; if (on) game.autopilot.reset(); return game.autopilot.enabled; },
    simulate(seconds = 10, dt = 1 / 60) {
      Loop.simulate((d) => game.step(d), seconds, dt, () => game.state !== 'playing' && game.state !== 'title');
      game.sync(0);
      return debug.state();
    },
    give(kind, n = 1) {
      switch (kind) {
        case 'troops': game.squad.add(n, 'barrel'); return game.squad.count;
        case 'tier': return game.weapons.setTier(Math.min(MAX_TIER, game.weapons.tier + n));
        case 'coins': if (game.run) game.run.coins += n; else game.bank.coins += n; return n;
        case 'drone': case 'turret':
          return game.helpers ? game.helpers.add(kind, n) : false;
        default:
          return game.powers ? game.powers.start(kind) : false;
      }
    },
    skipToBoss() {
      const run = game.run;
      if (!run) return debug.state();
      game.squad.leader.z = -(run.length - 3);
      for (const m of game.squad.members) m.z = game.squad.leader.z + 1;
      game.gates.skipAll();
      game.horde.skipAll();
      game.barrels.skipAll();
      game.snapCamera();
      return debug.state();
    },
    killBoss() { if (game.boss && game.boss.kill) game.boss.kill(); return debug.state(); },
    setTimeScale(s = 1) { game.timeScale = Math.max(0, Math.min(4, s)); return game.timeScale; },
  };
  return debug;
}
