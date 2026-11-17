// FX director: subscribes to game events and drives particles, debris, flashes, popups, screen pulses and
// confetti. Runs on GAME time (game.time deltas: slow-mo aware, frozen while paused, still ticking on the
// result screen); screen flashes decay on real time. install(game) -> fx; game.sync() calls fx.update().
import './fx.css';
import { Particles } from './particles.js';
import { Debris } from './debris.js';
import { Bursts, hexInt } from './bursts.js';
import { Flashes } from './flashes.js';
import { Popups } from './popups.js';
import { Screen } from './screen.js';
import { Confetti } from './confetti.js';
import { installWeaponFx } from './weapons/index.js';
import { installHeroFx } from './heroes.js';
import { MENU_STATES } from '../game/states.js';
import { weaponDef } from '../data/weapons.js';

const BOSS_DEBRIS = {
  grawlstone: [0x8d8576, 0x6f8f4a], oculon: [0x6d7aa8, 0xd9e4ff], mothermurk: [0x6a3fb0, 0x9d6bff],
  ironhorn: [0x8e99ab, 0x5b6474], tempestking: [0x5d6487, 0xfff27a],
};
const ATTACK_COLORS = { orbs: 0x7fe9ff, orb: 0x7fe9ff, summon: 0x7dff6a, puddle: 0x7dff6a, lightning: 0xfff27a, charge: 0xffb35a };
const POWER_COLORS = { shield: 0x59c1ff, rapid: 0xffc531, magnet: 0xff5a8a, freeze: 0x9feeff };
const REWARD_TEXT = {
  troops: ['RAIDERS', '#7fe0ff', '#12408f'], drone: ['DRONE', '#8dff9a', '#11602a'], turret: ['TURRET', '#ffb36b', '#7a3300'],
  shield: ['SHIELD', '#7fe0ff', '#12408f'], rapid: ['RAPID FIRE', '#ffd84a', '#8a4a00'], magnet: ['MAGNET', '#ff8ab0', '#7a1037'],
  freeze: ['FREEZE', '#b8f4ff', '#1b5a8a'],
};
// boss death: explosion stages on game time (the first ~0.28 s play out inside the 0.2x slow-mo)
const DEATH_STAGES = [0, 0.045, 0.09, 0.14, 0.2, 0.27, 0.38, 0.52, 0.7, 0.92, 1.18];
const DEATH_FINAL = 1.42;
const rnd = (a, b) => a + Math.random() * (b - a);

export function installFx(game) {
  const fx = new Fx(game);
  game.fx = fx;
  return fx;
}

export class Fx {
  constructor(game) {
    this.game = game;
    const app = document.getElementById('app') || document.body;
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    const ui = document.getElementById('ui');
    if (ui && ui.parentElement === app) app.insertBefore(this.layer, ui); else app.appendChild(this.layer);

    this.P = new Particles(game.scene, 1500);
    this.D = new Debris(game.scene, 200);
    this.B = new Bursts(this.P, this.D);
    this.flashes = new Flashes(game, this.B);
    this.popups = new Popups(this.layer, game);
    this.screen = new Screen(this.layer);
    this.confetti = new Confetti(app);
    this.quality = '';
    this.lastTime = game.time;
    this.lastReal = performance.now();
    this.now = 0;          // fx clock (game seconds)
    this.dustAcc = 0; this.lineAcc = 0; this.lineSide = 1;
    this.gateRec = new Map();
    this.coinAcc = 0; this.coinT = 0; this.coinPos = { x: 0, y: 0, z: 0 };
    this.bossHp = -1; this.dmgAcc = 0; this.dmgT = 0; this.bossHitPos = { x: 0, y: 3, z: 0 };
    this.lastBlastShake = -1;
    this.death = { on: false, t: 0, stage: 0, x: 0, z: 0, debris: BOSS_DEBRIS.grawlstone, final: false };
    this.syncQuality();
    this.bind();
    // update 2: per-weapon and per-hero effects (WEAPONS / HEROES builders own these modules)
    this.weaponFx = installWeaponFx(this) || null;
    this.heroFx = installHeroFx(this) || null;
  }

  bind() {
    const ev = this.game.events, B = this.B, g = this.game;
    const on = (n, f) => ev.on(n, f);
    on('run:start', () => this.clear());
    on('game:state', (p) => { if (MENU_STATES.has(p.state)) this.clear(); });
    on('weapon:fire', (p) => this.flashes.fire(p, this.now));
    on('bullet:hit', (p) => {
      this.flashes.hit(p);
      if (p.kind === 'boss') { this.bossHitPos.x = p.pos.x; this.bossHitPos.y = p.pos.y; this.bossHitPos.z = p.pos.z; }
    });
    on('enemy:die', (p) => B.enemyDeath(p.type, p.pos.x, p.pos.y, p.pos.z, hexInt(p.color || '#8a4dff')));
    on('enemy:explode', (p) => {
      B.bomber(p.pos.x, p.pos.y, p.pos.z, p.radius || 2.2);
      if (this.now - this.lastBlastShake > 0.12) { this.lastBlastShake = this.now; g.shake.add(0.3); }
    });
    on('squad:lost', (p) => {
      if (p.reason !== 'gap') B.memberLost(p.pos.x, p.pos.y, p.pos.z, -g.squad.speed);
      this.screen.pulse(p.reason === 'gate' ? 0.08 : 0.16);
    });
    on('gate:hit', (p) => this.gateTick(p));
    on('gate:pass', (p) => this.gatePass(p));
    on('coin:collect', (p) => {
      B.coin(p.pos.x, p.pos.y + 0.3, p.pos.z, 0);
      this.coinAcc += p.amount || 1;
      this.coinPos.x = p.pos.x; this.coinPos.y = (p.pos.y || 0) + 1.4; this.coinPos.z = p.pos.z;
    });
    on('barrel:break', (p) => this.barrelBreak(p));
    const mkUp = (p) => {
      const L = g.squad.leader, col = weaponColor(p.weapon || p.to, p.mk || p.tier), c = hexInt(col);
      B.sparkle(L.x, 0.6, L.z + 0.8, c, 22, 2.2, -g.squad.speed, 1.4);
      B.gatePass(L.x, L.z - 1.5, L.x, L.z, true, -g.squad.speed);
      this.screen.flash(col, 0.28, 2.5);
    };
    on('weapon:tier', mkUp);
    on('weapon:swap', mkUp);
    on('cliff:collapse', (p) => {
      // the road breaks away: dust bursts along the edge, a rumble in the camera
      const n = Math.max(2, Math.min(6, Math.round((p.to - p.from) / 6)));
      for (let i = 0; i < n; i++) B.landing(p.pos.x, -(p.from + ((i + 0.5) / n) * (p.to - p.from)), 1.6);
      g.shake.add(0.35);
    });
    on('helper:add', (p) => B.sparkle(p.pos.x, p.pos.y || 1.5, p.pos.z, p.kind === 'turret' ? 0xffb36b : 0x8dff9a, 14, 1.2, -g.squad.speed));
    on('pickup:collect', (p) => B.sparkle(p.pos.x, (p.pos.y || 0) + 0.6, p.pos.z, POWER_COLORS[p.kind] || 0xffffff, 12, 1.2, -g.squad.speed));
    on('power:start', (p) => {
      const L = g.squad.leader;
      B.sparkle(L.x, 0.8, L.z + 0.8, POWER_COLORS[p.kind] || 0xffffff, 18, 2, -g.squad.speed, 1.3);
    });
    on('boss:spawn', () => {
      const b = g.boss; this.bossHp = -1; this.dmgAcc = 0;
      if (b) B.landing(b.x, b.z + 1.2, 4.2);
    });
    on('boss:hp', (p) => {
      if (this.bossHp >= 0 && p.hp < this.bossHp && p.hp > 0) this.dmgAcc += this.bossHp - p.hp;
      this.bossHp = p.hp;
    });
    on('boss:phase', () => { const b = g.boss; if (b) B.impact(b.x, b.z + 2, 0xff6a3a); this.screen.flash('#ff6a3a', 0.25, 2); });
    on('boss:attack', (p) => {
      if (p.attack === 'slam') B.slam(p.pos.x, p.pos.z, 2.3);
      else if (p.attack === 'roll' || p.attack === 'charge') B.landing(p.pos.x, p.pos.z, 1.8);
      else B.impact(p.pos.x, p.pos.z, ATTACK_COLORS[p.attack] || 0xffd36b);
    });
    on('boss:defeated', (p) => this.bossDeath(p));
    on('run:win', () => {
      this.confetti.burst(2.8);
      const L = g.squad.leader;
      B.sparkle(L.x, 1, L.z + 0.8, 0xffd84a, 26, 2.4, 0, 1.6);
    });
  }

  // ---------------- gates ----------------
  gateTick(p) {
    let r = this.gateRec.get(p.id);
    if (!r) {
      r = { shown: p.op === 'add' ? p.value - 1 : 0, op: p.op, k: p.value, t: -1 };
      this.gateRec.set(p.id, r);
    }
    if (p.op === 'add') {
      if (p.value > r.shown && this.now - r.t >= 0.13) {
        const d = p.value - r.shown;
        r.shown = p.value; r.t = this.now;
        this.popups.show('tick', '+' + d, p.pos.x + rnd(-0.3, 0.3), p.pos.y + 1.4, p.pos.z, { color: '#bff0ff', outline: '#12408f', dx: rnd(-14, 14) });
      }
    } else if (p.op !== r.op || p.value !== r.k) {
      r.op = p.op; r.k = p.value; r.t = this.now;
      const good = p.op === 'mul';
      this.popups.show('tick', (good ? '×' : '÷') + p.value, p.pos.x, p.pos.y + 1.6, p.pos.z, { color: good ? '#bff0ff' : '#ff9aa4', outline: good ? '#12408f' : '#6b0d1c', scale: 1.5 });
    }
  }

  gatePass(p) {
    const g = this.game, L = g.squad.leader;
    const good = p.after >= p.before && !(p.op === 'add' && p.value < 0) && p.op !== 'div';
    let txt;
    if (p.op === 'mul') txt = '×' + p.value;
    else if (p.op === 'div') txt = '÷' + p.value;
    else txt = (p.value < 0 ? '−' : '+') + Math.abs(p.value);
    this.popups.show('big', txt, 0, 3.4, -0.4, {
      follow: true, color: good ? '#7fe0ff' : '#ff5468', outline: good ? '#12408f' : '#6b0d1c',
    });
    this.B.gatePass(p.pos.x, p.pos.z, L.x, L.z, good, -g.squad.speed);
    this.screen.flash(good ? '#c8eeff' : '#ff6070', good ? 0.3 : 0.32, 3);
    this.gateRec.clear();
  }

  // ---------------- barrels ----------------
  barrelBreak(p) {
    const x = p.pos.x, y = p.pos.y, z = p.pos.z;
    this.B.barrel(x, y, z);
    const r = p.reward || {};
    if (r.granted === false || !r.kind) return;
    const info = REWARD_TEXT[r.kind];
    if (!info) return; // weapon -> HUD banner, coins -> coin:collect popup
    const amount = r.amount || 1;
    const main = r.kind === 'troops' || r.kind === 'drone' || r.kind === 'turret' ? '+' + amount : info[0] + '!';
    const html = main === info[0] + '!' ? main : `${main}<small>${info[0]}</small>`;
    this.popups.show('reward', html, x, y + 1.6, z, { color: info[1], outline: info[2] });
  }

  // ---------------- boss ----------------
  bossDeath(p) {
    const d = this.death;
    d.on = true; d.t = 0; d.stage = 0; d.final = false;
    d.x = p.pos.x; d.z = p.pos.z;
    d.debris = BOSS_DEBRIS[p.type] || BOSS_DEBRIS.grawlstone;
    this.dmgAcc = 0;
    this.screen.flash('#ffffff', 1, 1.7);
  }

  updateDeath(dt) {
    const d = this.death;
    if (!d.on) return;
    d.t += dt;
    const B = this.B, g = this.game;
    while (d.stage < DEATH_STAGES.length && d.t >= DEATH_STAGES[d.stage]) {
      const first = d.stage === 0;
      const s = first ? 1.7 : rnd(1.0, 1.5);
      B.explosion(d.x + (first ? 0 : rnd(-2.7, 2.7)), first ? 3.2 : rnd(1.2, 5.6), d.z + 1.6 + rnd(0, 0.8), s, d.debris[d.stage & 1]);
      g.shake.add(first ? 0.4 : 0.22);
      d.stage++;
    }
    if (!d.final && d.t >= DEATH_FINAL) {
      d.final = true;
      B.explosion(d.x, 1.2, d.z + 1.8, 2.6, d.debris[0]);
      B.landing(d.x, d.z + 1.5, 5);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(3, 8);
        this.D.spawn(d.x + Math.cos(a), 1.5, d.z + 1.5 + Math.sin(a), Math.cos(a) * sp, rnd(6, 12), Math.sin(a) * sp * 0.7 + 2, rnd(1.1, 1.6), rnd(0.3, 0.55), d.debris[i & 1]);
      }
      this.screen.flash('#fff6d8', 0.75, 2.2);
      g.shake.add(0.8);
      d.on = false;
    }
  }

  flushDamage() {
    if (this.dmgAcc < 1 || this.now - this.dmgT < 0.3) return;
    const b = this.game.boss;
    if (!b || !b.alive) { this.dmgAcc = 0; return; }
    const v = Math.round(this.dmgAcc);
    this.dmgAcc = 0; this.dmgT = this.now;
    const hp = this.bossHitPos;
    const sc = 0.85 + Math.min(0.75, Math.log10(Math.max(1, v)) * 0.22);
    this.popups.show('dmg', String(v), hp.x + rnd(-1.2, 1.2), hp.y + rnd(0.8, 2.2), hp.z + 0.5, { scale: sc, dx: rnd(-30, 30) });
  }

  flushCoins() {
    if (this.coinAcc <= 0 || this.now - this.coinT < 0.16) return;
    const c = this.coinPos;
    this.popups.show('coin', '+' + this.coinAcc + '<i></i>', c.x, c.y, c.z, {});
    this.coinAcc = 0; this.coinT = this.now;
  }

  // ---------------- ambient: dust trail + speed lines ----------------
  ambient(dt) {
    const g = this.game, sq = g.squad, run = g.run;
    const low = this.quality === 'low';
    const running = (g.state === 'playing' || MENU_STATES.has(g.state)) && sq.speed > 1;
    if (running && sq.count > 0) {
      const n = sq.members.length;
      const rate = Math.min(low ? 14 : 30, 10 + n * 0.5);
      const vz = -sq.speed;
      this.dustAcc += dt * rate;
      while (this.dustAcc >= 1) {
        this.dustAcc -= 1;
        if (n === 0 || Math.random() < 0.25) this.B.dust(sq.leader.x, sq.leader.z, vz);
        else { const m = sq.members[(Math.random() * n) | 0]; this.B.dust(m.x, m.z, vz); }
      }
    } else this.dustAcc = 0;
    if (g.state === 'playing' && run && run.phase === 'run' && sq.speed > 1) {
      this.lineAcc += dt * (low ? 5 : 11);
      const cam = g.camera.position;
      while (this.lineAcc >= 1) {
        this.lineAcc -= 1;
        this.lineSide = -this.lineSide;
        const side = this.lineSide;
        this.B.speedLine(cam.x + side * rnd(3.2, 6.2), cam.y - rnd(1.5, 7), cam.z - rnd(11, 20), 30 + sq.speed * 2);
      }
    } else this.lineAcc = 0;
  }

  syncQuality() {
    const q = this.game.engine.quality === 'low' ? 'low' : 'high';
    if (q === this.quality) return;
    this.quality = q;
    this.P.setQuality(q); this.D.setQuality(q); this.confetti.setQuality(q);
    this.B.q = q === 'low' ? 0.5 : 1;
  }

  clear() {
    this.P.clear(); this.D.clear(); this.popups.clear(); this.screen.clear(); this.confetti.clear();
    this.flashes.reset();
    this.gateRec.clear();
    this.coinAcc = 0; this.dmgAcc = 0; this.bossHp = -1;
    this.death.on = false;
  }

  /** Called by game.sync() every frame (after the camera moved, before render). */
  update() {
    const g = this.game;
    const realNow = performance.now();
    const real = Math.min(0.1, Math.max(0, (realNow - this.lastReal) / 1000));
    this.lastReal = realNow;
    let dt = g.time - this.lastTime;
    this.lastTime = g.time;
    if (dt < 0 || dt > 0.25) {
      // debug.simulate() jumped the clock: anything spawned meanwhile is stale
      this.P.clear(); this.D.clear(); this.popups.clear(); this.death.on = false;
      dt = 0;
    }
    this.now += dt;
    this.syncQuality();
    if (dt > 0) {
      this.updateDeath(dt);
      this.ambient(dt);
      this.flushDamage();
      this.flushCoins();
      if (this.weaponFx && this.weaponFx.update) this.weaponFx.update(dt);
      if (this.heroFx && this.heroFx.update) this.heroFx.update(dt);
      this.P.update(dt);
      this.D.update(dt);
    }
    this.popups.update(dt);
    this.confetti.update(g.state === 'paused' ? 0 : Math.max(dt, g.state === 'result' ? real : 0));
    this.screen.update(Math.max(real, dt));
  }

  dispose() {
    this.P.dispose(); this.D.dispose();
    this.layer.remove(); this.confetti.canvas.remove();
  }
}

/** A weapon's own colour at a Mk (fx identity; gun paint never changes it). */
function weaponColor(id, mk) {
  const def = weaponDef(id);
  return def.look.mk[Math.max(1, Math.min(5, mk | 0 || 1)) - 1].color;
}
