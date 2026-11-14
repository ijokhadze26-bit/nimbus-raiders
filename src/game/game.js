// Game: owns systems, state machine, run lifecycle, camera, frame/step split, public API.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { CAMERA, FORMATION, QUALITY, START_SQUAD } from '../config.js';
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
import { Shake } from '../fx/shake.js';
import { Run } from './run.js';
import { createDebug } from './debug.js';
import { getLevel, LEVELS, LEVEL_COUNT } from '../data/levels.js';

const ATTRACT_COUNT = 9;
// stage3-ui hook: menu screens keep the live attract scene running behind them
const MENU_STATES = new Set(['title', 'map', 'shop', 'settings', 'endless']);

export class Game {
  constructor({ engine, input, params = {} }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.input = input;
    this.params = params;
    this.events = new Events();
    this.rng = new Rng(1);
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
    this.camLook = new THREE.Vector3(0, 0, -14);
    this.camPos = new THREE.Vector3(0, CAMERA.height, CAMERA.back);
    // auto quality: rolling fps monitor for the whole run (see sampleQuality)
    this.quality = { setting: params.quality || (params.test ? 'high' : 'auto'), ema: 60, low: 0, hold: 0 };

    const ev = this.events;
    ev.setRate('weapon:fire', 22); ev.setRate('bullet:hit', 30); ev.setRate('enemy:die', 60);
    ev.setRate('squad:lost', 40); ev.setRate('run:progress', 10);
    this.shake = new Shake();
    this.slow = { scale: 1, left: 0 };
    ev.on('fx:shake', (p) => this.shake.add(p.amount || 0));
    ev.on('fx:slowmo', (p) => { this.slow.scale = p.scale ?? 0.2; this.slow.left = p.duration ?? 1; });
    // one-off hitches (spawn bursts, the boss drop) must not count as a slow device
    ev.on('horde:incoming', () => this.holdQuality(0.6));
    ev.on('boss:spawn', () => this.holdQuality(1.5));

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
    this.systems = [this.world, this.bullets, this.squad, this.weapons, this.gates, this.horde, this.barrels, this.helpers, this.telegraph, this.bosses, this.autopilot];
    for (const s of this.systems) s.init(this);

    if (this.quality.setting === 'low') this.applyQuality('low');
    this.debug = createDebug(this);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.events.emit('game:state', { state: s });
  }

  // ---------------- public API ----------------
  startLevel(levelId) {
    const def = getLevel(levelId) || LEVELS[0];
    this.beginRun(def, 'level');
  }

  startEndless() {
    // Endless generator arrives in a later stage; until then it reuses level 1 in endless mode.
    this.beginRun(LEVELS[0], 'endless');
  }

  beginRun(def, mode) {
    this.rng.seed(def.id * 7919 + (mode === 'endless' ? 1 : 0));
    this.run = new Run(def, mode, this.events);
    this.timeScale = 1;
    this.resultTimer = -1;
    this.lastResult = null;
    this.world.setTheme(def.theme);
    this.world.setGaps([]);
    this.world.reset();
    this.bullets.reset();
    this.squad.pip.root.visible = true;
    const start = START_SQUAD + (this.save?.data?.upgrades?.squad || 0);
    this.squad.reset(start, 0);
    this.weapons.reset(this.run, 1 + (this.save?.data?.upgrades?.tier || 0));
    this.weapons.enabled = true;
    this.gates.reset(this.run);
    this.resetCombat(this.run);
    this.bosses.preload(def.boss);
    this.input.reset(0);
    this.autopilot.reset();
    this.snapCamera();
    this.setState('playing');
    this.events.emit('run:start', { levelId: def.id, mode, theme: def.theme });
    this.events.emit('run:phase', { phase: 'run' });
    if (this.quality.setting === 'auto') Object.assign(this.quality, { ema: 60, low: 0, hold: 1.2 });
  }

  resetCombat(run) {
    this.horde.reset(run);
    this.barrels.reset(run);
    this.helpers.reset();
    this.telegraph.reset();
    this.bosses.reset();
    this.shake.reset();
    this.slow.left = 0;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.events.emit('game:pause', {});
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.events.emit('game:resume', {});
  }

  quitToMenu() { this.toTitle(); }
  retry() { if (this.run) this.beginRun(this.run.def, this.run.mode); else this.startLevel(1); }
  nextLevel() {
    const id = this.run ? this.run.levelId + 1 : 1;
    this.startLevel(getLevel(id) ? id : 1);
  }
  getProgress() {
    const d = this.save?.data;
    return d ? { coins: d.coins, unlockedLevel: d.unlockedLevel, stars: d.stars } : { coins: this.bank.coins, unlockedLevel: 1, stars: {}, levels: LEVEL_COUNT };
  }

  toTitle() {
    this.run = null;
    this.timeScale = 1;
    this.bullets.reset();
    this.gates.reset(null);
    this.resetCombat(null);
    this.squad.pip.root.visible = true;
    this.squad.reset(ATTRACT_COUNT, 0);
    this.weapons.enabled = false;
    this.world.setTheme('noon');
    this.world.reset();
    this.snapCamera();
    this.setState('title');
  }

  // ---------------- run outcome ----------------
  onSquadEmpty(reason) {
    const run = this.run;
    if (!run || !run.active || this.state !== 'playing') return;
    this.squad.pip.root.visible = false;
    this.squad.startDeath(this.squad.alloc(), reason);
    const d = this.squad.dying[this.squad.dying.length - 1];
    if (d) { d.x = this.squad.leader.x; d.z = this.squad.leader.z; }
    run.setPhase('lost');
    run.coinsEarned = run.coins;
    this.bank.coins += run.coinsEarned;
    this.lastResult = { win: false, levelId: run.levelId, mode: run.mode, dist: Math.round(run.dist), coins: run.coinsEarned, kills: run.kills };
    this.events.emit('run:lose', { levelId: run.levelId, mode: run.mode, dist: Math.round(run.dist), coins: run.coinsEarned, kills: run.kills });
    this.resultTimer = 1.4;
  }

  win() {
    const run = this.run;
    if (!run || !run.active) return;
    const squad = this.squad.count;
    run.stars = run.starsFor(squad);
    run.coinsEarned = Math.round(run.coins + (run.def.reward || 0) + 15 * run.stars);
    this.bank.coins += run.coinsEarned;
    run.setPhase('won');
    this.lastResult = { win: true, levelId: run.levelId, mode: run.mode, stars: run.stars, coins: run.coinsEarned, squad, kills: run.kills, time: run.time };
    this.events.emit('run:win', { levelId: run.levelId, mode: run.mode, stars: run.stars, coins: run.coinsEarned, squad, kills: run.kills, time: Math.round(run.time * 10) / 10 });
    this.resultTimer = 1.6;
  }

  // ---------------- simulation ----------------
  forwardSpeed(dt) {
    const run = this.run;
    if (!run) return 0;
    if (run.phase === 'run') return run.speed;
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
      const target = this.autopilot.enabled ? this.autopilot.update(dt) : this.input.targetX;
      this.squad.update(dt, target, this.forwardSpeed(dt));
      run.update(dt, -this.squad.leader.z);
      run.stats.maxSquad = Math.max(run.stats.maxSquad, this.squad.count);
      this.gates.update(dt);
      this.barrels.update(dt);
      this.horde.update(dt);
      this.helpers.update(dt);
      if (run.active) this.weapons.update(dt);
      this.bullets.update(dt);
      this.telegraph.update(dt);
      this.bosses.update(dt);
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
    if (this.state === 'playing' || MENU_STATES.has(this.state) || this.state === 'result') this.step(dt);
    this.sync(dt);
    this.engine.render();
    this.sampleQuality(real);
  }

  /** 'high' | 'low': renderer settings + the geometry that dominates the frame (squad mesh LOD). */
  applyQuality(q) {
    this.engine.applyQuality(q);
    this.squad.setLod(q);
  }

  holdQuality(s) { this.quality.hold = Math.max(this.quality.hold, s); }

  sync(dt) {
    const L = this.squad.leader;
    this.squad.sync(dt, this.run ? this.run.phase : 'title');
    this.gates.sync(dt);
    this.barrels.sync(dt);
    this.horde.sync(dt);
    this.helpers.sync(dt);
    this.telegraph.sync(dt);
    this.bosses.sync(dt);
    this.bullets.sync();
    this.updateCamera(dt);
    this.world.sync(dt, L.x, L.z, this.camera.position.z);
    if (this.fx) this.fx.update(); // stage3-fx
  }

  cameraGoal(outPos, outLook) {
    const L = this.squad.leader;
    if (MENU_STATES.has(this.state)) {
      const t = this.time;
      outPos.set(L.x * 0.3 + Math.sin(t * 0.2) * 1.5, 6.2, L.z + 9.5);
      outLook.set(L.x * 0.2, 0.4, L.z - 3.5); // squad framed between the title logo and the PLAY button
      return;
    }
    const boss = this.run && this.run.phase === 'boss';
    // blob radius from the rendered member count (same formula as squad.center) -> gentle zoom-out
    const r = FORMATION.spacing * 0.525 * Math.sqrt(this.squad.members.length + 0.5);
    const zoom = 1 + CAMERA.crowdZoom * Math.max(0, Math.min(1, (r - 1.2) / 2.5));
    outPos.set(L.x * CAMERA.followX, (boss ? CAMERA.bossHeight : CAMERA.height) * zoom, L.z + (boss ? CAMERA.bossBack : CAMERA.back) * zoom);
    outLook.set(L.x * CAMERA.lookX, 0, L.z - (boss ? CAMERA.bossLook : CAMERA.lookAhead));
  }

  snapCamera() {
    this.cameraGoal(this.camPos, this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  updateCamera(dt) {
    const goalP = _gp, goalL = _gl;
    this.cameraGoal(goalP, goalL);
    const k = 1 - Math.exp(-CAMERA.damping * dt);
    this.camPos.x += (goalP.x - this.camPos.x) * k;
    this.camPos.y += (goalP.y - this.camPos.y) * k;
    this.camPos.z += (goalP.z - this.camPos.z) * Math.max(k, 0.5);
    this.camLook.x += (goalL.x - this.camLook.x) * k;
    this.camLook.y += (goalL.y - this.camLook.y) * k;
    this.camLook.z += (goalL.z - this.camLook.z) * Math.max(k, 0.5);
    this.camera.position.copy(this.camPos);
    if (this.shake) this.shake.apply(this.camera, dt);
    this.camera.lookAt(this.camLook);
  }

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
    if (q.low >= QUALITY.autoLowSeconds) this.applyQuality('low');
  }
}

const _gp = new THREE.Vector3(), _gl = new THREE.Vector3();
