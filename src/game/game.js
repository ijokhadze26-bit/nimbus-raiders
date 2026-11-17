// Game: owns systems, state machine, run lifecycle, camera, frame/step split, public API.
// Update 2: hero + weapon loadout (loadout.js), status / zones / crates / heroes systems, practice runs,
// procRng (weapon + hero dice; never game.rng), the fixed step order of SPEC2 §6.7.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { CAMERA, QUALITY, START_SQUAD } from '../config.js';
import { World } from './world.js';
import { Squad } from './squad.js';
import { Weapons } from './weapons.js';
import { Bullets } from './bullets.js';
import { Gates } from './gates.js';
import { Autopilot } from './autopilot.js';
import { Horde } from './horde.js';
import { Barrels } from './barrels.js';
import { Helpers } from './helpers.js';
import { Telegraph } from './telegraph.js';
import { Bosses } from './bosses/index.js';
import { Obstacles } from './obstacles.js';
import { Pickups } from './pickups.js';
import { Powers } from './powers.js';
import { Shake } from '../fx/shake.js';
import { Run } from './run.js';
import { createDebug } from './debug.js';
import { getLevel, LEVEL_COUNT } from '../data/levels.js';
import { endlessDef } from '../data/endless.js';
import { Endless } from './endless.js';
import { upgradeEffects } from '../data/shop.js';
import { PRACTICE, practiceDef } from '../data/practice.js';
import { MENU_STATES } from './states.js';
import { Status } from './status.js';
import { Zones } from './zones.js';
import { HeroSystem } from './heroes.js';
import { Crates } from './crates.js';
import { Loadout } from './loadout.js';
import { autoLoadout } from './autopilot2.js';
import { cameraGoal, snapCamera, updateCamera } from './camera.js';
import { createZoneViews } from '../models/weapons/zones.js';
import { Finish } from './finish.js';
import { worldFor } from './worldlook.js';
import { Hazards } from './hazards/index.js';
import { eliteDef } from '../data/elite.js';
import { RunMods } from './runmods.js';
import { SquadTypes } from './squadtypes.js';

const ATTRACT_COUNT = 9;

export class Game {
  constructor({ engine, input, params = {} }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.input = input;
    this.params = params;
    this.events = new Events();
    this.rng = new Rng(1);
    this.procRng = new Rng(1);   // weapon + hero dice only (seeded per run in beginRun)
    this.state = 'boot';
    this.timeScale = 1;
    this.time = 0;
    this.run = null;
    this.save = null;
    this.bank = { coins: 0 };
    // later-stage systems (null until implemented)
    this.obstacles = null; this.pickups = null; this.powers = null; this.boss = null;
    this.resultTimer = -1;
    this.lastResult = null;
    this.idleFrames = 0;
    this.camLook = new THREE.Vector3(0, 0, -14);
    this.camPos = new THREE.Vector3(0, CAMERA.height, CAMERA.back);
    // auto quality: rolling fps monitor for the whole run (see sampleQuality)
    this.quality = { setting: params.quality || (params.test ? 'high' : 'auto'), ema: 60, low: 0, hold: 0 };

    const ev = this.events;
    ev.setRate('weapon:fire', 22); ev.setRate('bullet:hit', 30); ev.setRate('enemy:die', 60);
    ev.setRate('squad:lost', 40); ev.setRate('run:progress', 10);
    ev.setRate('weapon:special', 40); ev.setRate('hero:guard', 10); ev.setRate('turret:drop', 10);
    this.shake = new Shake();
    this.slow = { scale: 1, left: 0 };
    ev.on('fx:shake', (p) => this.shake.add(p.amount || 0));
    ev.on('fx:slowmo', (p) => { this.slow.scale = p.scale ?? 0.2; this.slow.left = p.duration ?? 1; });
    // one-off hitches (spawn bursts, the boss drop) must not count as a slow device
    ev.on('horde:incoming', () => this.holdQuality(0.6));
    ev.on('boss:spawn', () => this.holdQuality(1.5));
    // the death sequence belongs to the explosions: cease fire (beginRun re-enables)
    ev.on('boss:defeated', () => { this.weapons.enabled = false; });
    ev.on('save:changed', () => this.loadout.syncFromSave());
    this.loadout = new Loadout(this);
    this.runOpts = null;

    this.world = new World();
    this.bullets = new Bullets();
    this.squad = new Squad();
    this.weapons = new Weapons();
    this.gates = new Gates();
    this.autopilot = new Autopilot();
    this.horde = new Horde();
    this.barrels = new Barrels();
    this.helpers = new Helpers();
    this.telegraph = new Telegraph();
    this.bosses = new Bosses();
    this.obstacles = new Obstacles();
    this.pickups = new Pickups();
    this.powers = new Powers();
    this.endless = new Endless();
    this.status = new Status();
    this.zones = new Zones();
    this.heroes = new HeroSystem();
    this.crates = new Crates();
    this.hazards = new Hazards(); // update 3 world hazards (mods / danger read by squad, world, obstacles, autopilot)
    this.systems = [this.world, this.bullets, this.squad, this.status, this.zones, this.heroes, this.helpers, this.weapons, this.gates, this.horde, this.barrels, this.telegraph, this.bosses, this.obstacles, this.hazards, this.pickups, this.powers, this.crates, this.autopilot];
    this.runMods = new RunMods(); this.runMods.init(this); this.squadTypes = new SquadTypes(); this.squadTypes.init(this); // stage 5
    for (const s of this.systems) s.init(this);
    this.endless.init(this);
    this.zoneViews = createZoneViews(this);
    this.finish = new Finish(); this.finish.init(this); // update 3 finish arch

    if (this.quality.setting === 'low') this.applyQuality('low');
    this.debug = createDebug(this);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.events.emit('game:state', { state: s });
  }

  // ---------------- public API ----------------
  /**
   * Starts a defined level with the current loadout; false (and nothing happens) for an id without data.
   * opts.elite: the ELITE version (data/elite.js eliteDef; the loadout only offers it after a 3-star clear).
   * opts.mods: run modifier ids (data/modifiers.js; RETRY keeps them).
   */
  startLevel(levelId, opts = {}) {
    const base = getLevel(Number(levelId));
    if (!base) return false;
    const def = opts && opts.elite ? eliteDef(base) : base;
    this.beginRun(def, 'level', 1, { hero: this.loadout.hero, weapon: this.loadout.weapon, mods: opts && opts.mods });
    return true;
  }

  /** Endless run on a fresh seeded bridge (fixed seed under ?test=1 or ?seed=N so runs are reproducible). */
  startEndless(seed) {
    const s = seed ?? (this.params.seed != null ? Number(this.params.seed) : this.params.test ? 4242 : Math.floor(Math.random() * 1e9));
    this.beginRun(endlessDef(), 'endless', s >>> 0, { hero: this.loadout.hero, weapon: this.loadout.weapon });
  }

  /**
   * TRY IT practice (SPEC2 §5): a fixed short course at the chosen Mk; no shop upgrades, squad = 60 + the
   * hero's start bonus, ability charged, never pays out. Locked heroes / weapons are allowed here.
   */
  startPractice({ hero = this.loadout.hero, weapon = this.loadout.weapon, mk = 3 } = {}) {
    const m = Math.max(1, Math.min(5, mk | 0 || 3));
    this.beginRun(practiceDef(weapon, m), 'practice', 1, { hero, weapon, mk: m, practice: true });
    return true;
  }

  /** @deprecated (update 1 name): looks now follow the loadout + save (game/loadout.js). */
  applySkins() { this.loadout.applyLook(); }

  /** Gun colour of a Mk under the equipped gun paint (old callers). */
  tierColor(mk) { return this.loadout.gunColor(mk); }

  /** Squad is untouchable: the shield power-up or a hero's invulnerability (Sugar Shield). */
  shielded() { return (this.powers && this.powers.has('shield')) || (this.heroes && this.heroes.invulnT > 0); }

  beginRun(def, mode, seed = 1, opts = {}) {
    this.engine.flushQuality(); // a deferred shadow switch recompiles here, under the screen transition
    this.rng.seed(def.id * 7919 + (mode === 'endless' ? seed : 0));
    this.procRng.seed(def.id * 104729 + seed + 17);
    let hero = opts.hero || this.loadout.hero, weapon = opts.weapon || this.loadout.weapon;
    if (mode === 'level' && this.autopilot.enabled && this.autopilot.opts.loadout === 'auto') ({ hero, weapon } = autoLoadout(this, def));
    this.runOpts = { ...opts, hero, weapon };
    this.run = new Run(def, mode, this.events);
    this.run.hero = hero; this.run.weapon = weapon;
    const world = worldFor(def, mode); this.run.world = world.key; this.run.worldId = world.id; // update 3 looks
    this.run.killsBy = { weapon: 0, ability: 0, helper: 0, other: 0 };
    if (mode === 'endless') this.endless.start(this.run, seed); else this.endless.stop();
    this.timeScale = 1;
    this.resultTimer = -1;
    this.lastResult = null;
    this.world.setTheme(def.theme);
    this.world.setGaps([]);
    this.world.reset();
    this.finish.reset(this.run);
    this.bullets.reset();
    this.heroes.reset(this.run, hero);
    this.runMods.begin(this.run, opts.mods); this.squadTypes.begin(this.run); // stage 5 modifiers + squad types
    this.loadout.applyLook(hero);
    this.squad.pip.root.visible = true;
    const practice = mode === 'practice';
    const up = upgradeEffects(practice || this.run.mods.noUpgrades ? {} : this.save?.data?.upgrades);
    const start = this.runMods.startSquad((practice ? PRACTICE.squad : START_SQUAD + up.startSquad) + this.heroes.startBonus);
    this.squad.reset(start, 0);
    this.weapons.reset(this.run, { weapon, mk: opts.mk ?? up.startTier, dmgMul: up.damageMul, rateMul: up.rateMul });
    this.weapons.enabled = true;
    this.gates.reset(this.run);
    this.resetCombat(this.run);
    this.bosses.preload(this.run.boss);
    this.input.reset(0);
    this.autopilot.reset();
    this.snapCamera();
    this.setState('playing');
    this.events.emit('run:start', { levelId: def.id, mode, theme: def.theme, hero, weapon });
    this.events.emit('run:phase', { phase: 'run' });
    if (this.quality.setting === 'auto') Object.assign(this.quality, { ema: 60, low: 0, hold: 1.2 });
  }

  resetCombat(run) {
    this.horde.reset(run);
    this.barrels.reset(run);
    this.helpers.reset();
    this.obstacles.reset(run);
    this.hazards.reset(run);
    this.pickups.reset(run);
    this.powers.reset();
    this.status.reset();
    this.zones.clear();
    this.crates.reset(run);
    this.telegraph.reset();
    this.bosses.reset();
    this.shake.reset();
    this.slow.left = 0;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.input.cancel(); // a drag in progress must not keep steering while paused
    this.setState('paused');
    this.events.emit('game:pause', {});
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.events.emit('game:resume', {});
  }

  quitToMenu() { this.settleEndless(); this.toTitle(); }
  /** Same run again with the same loadout (RETRY never goes through the loadout screen). */
  retry() {
    this.settleEndless();
    const o = this.runOpts || {};
    if (this.run && this.run.mode === 'endless') this.startEndless();
    else if (this.run && this.run.mode === 'practice') this.startPractice(o);
    else if (this.run) this.beginRun(this.run.def, this.run.mode, 1, o);
    else this.startLevel(1);
  }
  /** Starts the level after the current one; false when it doesn't exist (yet). */
  nextLevel() {
    const id = this.run ? this.run.levelId + 1 : 1;
    return this.startLevel(id);
  }
  getProgress() {
    const d = this.save?.data;
    return d ? { coins: d.coins, unlockedLevel: d.unlockedLevel, stars: d.stars } : { coins: this.bank.coins, unlockedLevel: 1, stars: {}, levels: LEVEL_COUNT };
  }

  toTitle() {
    this.engine.flushQuality();
    this.run = null;
    this.endless.stop();
    this.timeScale = 1;
    this.bullets.reset();
    this.gates.reset(null);
    this.resetCombat(null);
    this.squad.pip.root.visible = true;
    this.heroes.reset(null, this.loadout.hero);
    this.runMods.begin(null); this.squadTypes.begin(null);
    this.squad.reset(ATTRACT_COUNT, 0);
    this.weapons.setWeapon(this.loadout.weapon, { silent: true });
    this.weapons.setMk(1, { silent: true });
    this.loadout.applyLook(this.loadout.hero);
    this.weapons.enabled = false;
    this.world.setTheme('noon');
    this.world.reset();
    this.finish.reset(null);
    this.snapCamera();
    this.setState('title');
  }

  // ---------------- run outcome ----------------
  /**
   * Endless has no win: an endless run abandoned from pause (HOME / RETRY) still pays out and records its
   * distance, exactly like a wipe-out (run:lose with quit:true so audio skips the lose stinger).
   */
  settleEndless() {
    const run = this.run;
    if (!run || run.mode !== 'endless' || !run.active) return;
    run.setPhase('lost');
    run.coinsEarned = run.coins;
    this.bank.coins += run.coinsEarned;
    const p = { levelId: run.levelId, mode: run.mode, dist: Math.round(run.dist), coins: run.coinsEarned, kills: run.kills, quit: true };
    this.lastResult = { win: false, ...p };
    this.events.emit('run:lose', p);
  }

  onSquadEmpty(reason) {
    const run = this.run;
    if (!run || !run.active || this.state !== 'playing') return;
    this.squad.pip.root.visible = false;
    if (!this.squad.pipFall.on) { // a gap fall already shows Pip tumbling into the hole
      this.squad.startDeath(this.squad.alloc(), reason);
      const d = this.squad.dying[this.squad.dying.length - 1];
      if (d) { d.x = this.squad.leader.x; d.z = this.squad.leader.z; }
    }
    // wiped out in an arena: the result screen shows how close the boss was to dying ('so close, retry!')
    const boss = run.phase === 'boss' && this.boss && this.boss.alive ? this.boss : null;
    const bossInfo = boss ? { bossName: boss.name, bossHp: Math.max(1, Math.ceil(boss.hp)), bossMax: boss.maxHp } : {};
    // Endless scores distance, which stops at the arena: the damage dealt adds up to 30 m there (< the 34 m of
    // empty road after a kill), so a better boss attempt still beats the best without outranking a kill
    let dist = Math.round(run.dist);
    if (boss && run.mode === 'endless') dist += Math.floor(30 * (1 - boss.hp / boss.maxHp));
    run.setPhase('lost');
    run.coinsEarned = Math.round(run.coins * (run.def.coinMul || 1)); // ELITE: +50% on collected coins
    this.bank.coins += run.coinsEarned;
    const p = { levelId: run.levelId, mode: run.mode, dist, coins: run.coinsEarned, kills: run.kills, ...bossInfo, ...(run.def.elite ? { elite: true } : {}) };
    this.lastResult = { win: false, ...p };
    this.events.emit('run:lose', p);
    this.resultTimer = 1.4;
  }

  win() {
    const run = this.run;
    if (!run || !run.active) return;
    if (run.mode === 'endless' && this.endless.active) { this.endless.bossDown(); return; } // the run goes on
    const squad = this.squad.count;
    run.stars = run.starsFor(squad);
    // ELITE (data/elite.js): reward x2 is in the def, collected coins x def.coinMul
    run.coinsEarned = Math.round(run.coins * (run.def.coinMul || 1) + (run.def.reward || 0) + 15 * run.stars);
    this.bank.coins += run.coinsEarned;
    run.setPhase('won');
    const elite = run.def.elite ? { elite: true } : {};
    this.lastResult = { win: true, levelId: run.levelId, mode: run.mode, stars: run.stars, coins: run.coinsEarned, squad, kills: run.kills, time: run.time, ...elite };
    this.events.emit('run:win', { levelId: run.levelId, mode: run.mode, stars: run.stars, coins: run.coinsEarned, squad, kills: run.kills, time: Math.round(run.time * 10) / 10, ...elite });
    this.resultTimer = 1.6;
  }

  // ---------------- simulation ----------------
  forwardSpeed(dt) {
    const run = this.run;
    if (!run) return 0;
    if (run.phase === 'run') return run.speed * this.hazards.mods.speedMul;
    if (run.phase === 'won') return Math.max(0, this.squad.speed - 10 * dt);
    return 0;
  }

  /** One logic step (no rendering). */
  step(rawDt) {
    let scale = this.timeScale;
    if (this.slow.left > 0) { scale *= this.slow.scale; this.slow.left -= rawDt; }
    const dt = rawDt * scale;
    this.time += dt;
    this.events.now = this.time;
    if (this.state === 'playing') {
      const run = this.run;
      this.input.update(dt);
      const target = this.autopilot.enabled ? this.autopilot.update(dt) : this.runMods.steer(this.input.targetX);
      this.squad.update(dt, target, this.forwardSpeed(dt));
      run.update(dt, -this.squad.leader.z);
      run.stats.maxSquad = Math.max(run.stats.maxSquad, this.squad.count);
      this.gates.update(dt);
      this.obstacles.update(dt);
      this.hazards.update(dt);
      this.pickups.update(dt);
      this.powers.update(dt);
      this.heroes.update(dt);
      this.crates.update(dt);
      this.barrels.update(dt);
      this.horde.update(dt);
      this.helpers.update(dt);
      if (run.active) this.weapons.update(dt);
      this.bullets.update(dt);
      this.weapons.updateBehaviour(dt);
      this.telegraph.update(dt);
      this.bosses.update(dt);
      this.runMods.update(dt); this.squadTypes.update(dt);
      if (run.phase === 'run' && run.dist >= run.length - (run.boss ? 2 : 0)) {
        if (run.boss) { run.setPhase('boss'); this.bosses.spawn(run.boss); }
        else this.win();
      }
      if (this.resultTimer > 0) {
        this.resultTimer -= rawDt;
        if (this.resultTimer <= 0) { this.resultTimer = -1; this.setState('result'); }
      }
    } else if (MENU_STATES.has(this.state) || this.state === 'result') {
      const t = this.time;
      const menu = this.state !== 'result';
      const tx = menu ? Math.sin(t * 0.35) * 1.6 : this.squad.leader.x;
      this.squad.update(dt, tx, menu ? 4.5 : 0);
      this.bullets.update(dt);
      this.gates.update(dt);
      if (this.state === 'result') { this.horde.update(dt); this.telegraph.update(dt); this.bosses.update(dt); }
    }
  }

  /** Called every animation frame by the loop (dt clamped, real = wall-clock frame time). */
  frame(dt, real = dt) {
    // paused: the picture can't change, so after a couple of frames stop re-rendering it (battery, heat);
    // a resize / context restore asks for a fresh frame (engine.needsFrame)
    if (this.state === 'paused') {
      if (this.idleFrames > 2 && !this.engine.needsFrame) return;
      this.idleFrames++;
    } else this.idleFrames = 0;
    this.engine.needsFrame = false;
    const perf = this.perf && this.perf.on ? this.perf.cur : null; // debug.perfStart() harness only
    let t = perf ? performance.now() : 0;
    if (this.state === 'playing' || MENU_STATES.has(this.state) || this.state === 'result') this.step(dt);
    if (perf) { const t1 = performance.now(); perf.step = t1 - t; t = t1; }
    this.sync(dt);
    if (perf) { const t1 = performance.now(); perf.sync = t1 - t; t = t1; }
    this.engine.render();
    if (perf) perf.render = performance.now() - t;
    this.sampleQuality(real);
  }

  /**
   * 'high' | 'low': renderer settings, the geometry that dominates the frame (squad mesh + gun LOD) and the
   * sky (cloud count, cloud-sea octaves). defer: keep the shadow shader rebuild for the next safe point.
   */
  applyQuality(q, opts) {
    if (q === 'high' && this.engine.dprScale !== 1) this.engine.dprScale = 1; // explicit High = full resolution
    this.engine.applyQuality(q, opts);
    this.squad.setLod(q);
    this.world.setQuality(q);
  }

  holdQuality(s) { this.quality.hold = Math.max(this.quality.hold, s); }

  sync(dt) {
    const L = this.squad.leader;
    this.squad.sync(dt, this.run ? this.run.phase : 'title');
    this.gates.sync(dt);
    this.barrels.sync(dt);
    this.horde.sync(dt);
    this.helpers.sync(dt);
    this.obstacles.sync(dt);
    this.hazards.sync(dt);
    this.pickups.sync(dt);
    this.powers.sync(dt);
    this.telegraph.sync(dt);
    this.bosses.sync(dt);
    this.crates.sync(dt);
    this.zoneViews.sync(dt);
    this.bullets.sync();
    this.loadout.sync(this.time);
    this.updateCamera(dt);
    this.world.sync(dt, L.x, L.z, this.camera.position.z);
    if (this.fx) this.fx.update(); // stage3-fx
  }

  cameraGoal(outPos, outLook) { cameraGoal(this, outPos, outLook); }
  snapCamera() { snapCamera(this); }
  updateCamera(dt) { updateCamera(this, dt); }

  /**
   * Auto quality: exponential moving average of the loop fps over the whole run (not just the cheap
   * first seconds). Downgrades once to low when it stays under autoMinFps for autoLowSeconds.
   */
  sampleQuality(real) {
    const q = this.quality;
    if (q.setting !== 'auto' || this.engine.quality === 'low' || this.state !== 'playing') return;
    if (real > 0.25) this.holdQuality(1.5); // tab switch / stall: ignore the next windows
    if (q.hold > 0) { q.hold -= real; q.low = 0; return; }
    const fps = this.loopFps || 60;
    q.ema += (fps - q.ema) * (1 - Math.exp(-real / QUALITY.autoTau));
    q.low = q.ema < QUALITY.autoMinFps ? q.low + real : 0;
    if (q.low < QUALITY.autoLowSeconds) return;
    // step 1: same look at 75% resolution (fill rate is the usual phone bottleneck); step 2: low quality.
    // Both apply without a shader rebuild (see Engine.applyQuality), so the switch itself never hitches.
    const e = this.engine;
    if (e.dprScale === 1 && e.pixelRatioFor('high') > 1.2) e.setDprScale(0.75);
    else this.applyQuality('low', { defer: true });
    Object.assign(q, { ema: 60, low: 0, hold: 1.5 });
  }
}

