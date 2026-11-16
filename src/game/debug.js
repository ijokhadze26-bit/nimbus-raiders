// Debug / test API (window.__game.debug). Balance + smoke tests depend on these names (SPEC2 §6.11 is binding).
import { Loop } from '../core/loop.js';
import { MAX_MK, WEAPON_IDS } from '../data/weapons.js';
import { HERO_IDS } from '../data/heroes.js';
import { UPGRADES } from '../data/shop.js';
import { bossTest } from './bosses/test.js';
import { selectHero, selectWeapon } from '../save/unlocks.js';

export function createDebug(game) {
  const debug = {
    state() {
      const run = game.run;
      const boss = game.boss;
      const H = game.heroes;
      return {
        state: game.state,
        phase: run ? run.phase : null,
        levelId: run ? run.levelId : null,
        mode: run ? run.mode : null,
        dist: run ? Math.round(run.dist * 10) / 10 : Math.round(-game.squad.leader.z * 10) / 10, // menus: the attract run
        length: run ? run.length : 0,
        squad: game.squad.count,
        tier: game.weapons.mk,
        mk: game.weapons.mk,
        weapon: game.weapons.id,
        hero: H ? H.id : 'pip',
        ability: H ? { id: H.ability.id, ready: H.ability.ready, left: Math.round(H.ability.left * 100) / 100 } : null,
        guard: H ? H.guard : 0,
        crates: game.crates ? game.crates.upcoming().map((c) => ({ at: c.at, lane: c.lane, weapon: c.weapon })) : [],
        killsBy: run && run.killsBy ? { ...run.killsBy } : { weapon: 0, ability: 0, helper: 0, other: 0 },
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
        helpers: { drones: game.helpers ? game.helpers.drones : 0, turrets: game.helpers ? game.helpers.turrets : 0, road: game.helpers ? game.helpers.roadList.length : 0 },
        bullets: game.bullets.count,
        gates: game.gates.live.length,
        timeScale: game.timeScale,
        result: game.lastResult,
      };
    },
    startLevel(id) { game.startLevel(id); return debug.state(); },
    startEndless(seed) { game.startEndless(seed); return debug.state(); },
    toTitle() { game.toTitle(); return debug.state(); },
    /**
     * on: true | 'pro' | 'casual' | 'novice' (bot skill profile) | false. seed varies the bot's own dice.
     * opts: { crates: 'never'|'favoured'|'always'|'auto', ability: bool, loadout: 'keep'|'auto' } (SPEC2 §6.10).
     */
    setAutopilot(on = true, seed, opts) {
      const ap = game.autopilot;
      ap.enabled = !!on;
      if (on) {
        ap.setProfile(typeof on === 'string' ? on : 'pro');
        if (seed != null) { ap.seedBase = seed | 0; ap.runs = 0; }
        if (opts !== undefined) ap.setOptions(opts || {});
        ap.reset();
      }
      return ap.enabled ? ap.profileName : false;
    },
    simulate(seconds = 10, dt = 1 / 60) {
      Loop.simulate((d) => game.step(d), seconds, dt, () => game.state !== 'playing' && game.state !== 'title');
      game.sync(0);
      return debug.state();
    },
    give(kind, n = 1) {
      switch (kind) {
        case 'troops': game.squad.add(n, 'barrel'); return game.squad.count;
        case 'mk': case 'tier': return game.weapons.setMk(Math.min(MAX_MK, game.weapons.mk + n));
        case 'coins': if (game.run) game.run.coins += n; else game.bank.coins += n; return n;
        case 'drone': case 'turret':
          return game.helpers ? game.helpers.add(kind, n) : false;
        default:
          return game.powers ? game.powers.start(kind) : false;
      }
    },
    /** Loadout for the next run. Ignores locks; writes the save only with { save: true }. weapon 'ref' = test weapon. */
    setLoadout(hero = 'pip', weapon = 'thunderclap', opts = {}) {
      if (opts && opts.save && game.save) {
        game.save.update((d) => {
          if (HERO_IDS.includes(hero) && !d.heroes.owned.includes(hero)) d.heroes.owned.push(hero);
          if (WEAPON_IDS.includes(weapon) && !d.arsenal.owned.includes(weapon)) d.arsenal.owned.push(weapon);
        });
        selectHero(game.save, hero);
        selectWeapon(game.save, weapon);
      }
      return game.loadout.set(hero, weapon);
    },
    getLoadout() { return { hero: game.loadout.hero, weapon: game.loadout.weapon }; },
    useAbility() { return game.heroes.useAbility(); },
    abilityState() { return game.heroes.state(); },
    setMk(n) { return game.weapons.setMk(n); },
    /** Shop upgrade levels (sanitized to 0..max) written into the save. */
    setUpgrades(u = {}) {
      if (!game.save) return null;
      game.save.update((d) => {
        for (const up of UPGRADES) if (u[up.id] != null) d.upgrades[up.id] = Math.max(0, Math.min(up.max, Math.floor(Number(u[up.id]) || 0)));
      });
      return { ...game.save.data.upgrades };
    },
    /** Screenshots only: owns every hero + weapon. */
    unlockAll() {
      if (!game.save) return false;
      game.save.update((d) => {
        for (const id of HERO_IDS) if (!d.heroes.owned.includes(id)) d.heroes.owned.push(id);
        for (const id of WEAPON_IDS) if (!d.arsenal.owned.includes(id)) d.arsenal.owned.push(id);
      });
      return true;
    },
    startPractice(o = {}) { game.startPractice(o); return debug.state(); },
    zones() {
      const z = game.zones;
      const r2 = (v) => Math.round(v * 100) / 100;
      return {
        puddles: z.puddles.map((p) => ({ x: r2(p.x), z: r2(p.z), r: p.r, left: r2(p.dur - p.t), pct: p.pct })),
        holes: z.holes.map((h) => ({ x: r2(h.x), z: r2(h.z), r: r2(z.holeR(h)), core: r2(z.holeCore(h)), left: r2(h.dur - h.t), pool: r2(h.pool), merges: h.merges, boss: h.boss })),
        roadTurrets: game.helpers.roadInfo(),
      };
    },
    skipToBoss() {
      const run = game.run;
      if (!run) return debug.state();
      game.squad.leader.z = -(run.length - 3);
      for (const m of game.squad.members) m.z = game.squad.leader.z + 1;
      game.gates.skipAll();
      game.horde.skipAll();
      game.barrels.skipAll();
      if (game.obstacles) game.obstacles.skipAll();
      if (game.hazards) game.hazards.skipAll();
      if (game.pickups) game.pickups.skipAll();
      if (game.crates) game.crates.skipAll();
      game.snapCamera();
      return debug.state();
    },
    /** Starts a run from an ad-hoc level def (tests / balance scratch levels); missing fields get defaults. */
    startCustom(def = {}) {
      const d = { id: 99, name: 'Test Run', theme: 'noon', length: 300, speed: 9, stars: [10, 30], reward: 0, boss: null, events: [], ...def };
      game.beginRun(d, 'level', 1, { hero: game.loadout.hero, weapon: game.loadout.weapon });
      return debug.state();
    },
    /** Live hazards / pickups near the squad (tests). */
    hazards() {
      const o = game.obstacles, p = game.pickups;
      return {
        blades: o ? o.blades.map((b) => ({ x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 10) / 10, moving: !!b.range })) : [],
        gaps: o ? o.gaps.map((g) => ({ lane: g.lane, from: g.from, to: g.to })) : [],
        tokens: p ? p.tokens.length : 0,
        coins: p ? p.coins.length : 0,
        pipGone: game.squad.pipGone,
      };
    },
    /** Update 3 world hazards: live objects, current mods, danger zone count, spawn / kill tallies. */
    worldHazards() { return game.hazards ? game.hazards.state() : null; },
    killBoss() { if (game.boss && game.boss.kill) game.boss.kill(); return debug.state(); },
    /** Throwaway arena run against one boss: bossTest('oculon', { weapon: id | mk, mk, hero, squad, hp, tier }). */
    bossTest(type, opts) { return bossTest(game, type, opts); },
    /** Frame profiler (harness): perfStart() then perfStop() -> per-phase JS ms, draw calls, heap growth. */
    perfStart() { game.perf?.start(); return true; },
    perfStop() { return game.perf ? game.perf.stop() : null; },
    setTimeScale(s = 1) { game.timeScale = Math.max(0, Math.min(4, s)); return game.timeScale; },
  };
  return debug;
}
