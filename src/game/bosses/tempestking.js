// Tempest King (final boss): crowned thunder-cloud titan with lightning arms. Rotates through four
// attacks — LIGHTNING lane strikes, THUNDER SLAM (bolts crash onto red circles), ORB VOLLEY hurled from
// his fists, SUMMON (a Murkling wave pours out of the storm) — with more strikes/orbs and a much faster
// cadence below 50% hp, when his lightning turns violet. Entrance: descends in a lightning storm.
// Death: the storm shrinks away in a burst of bolts while the crown tumbles down.
// Update 3 (final boss of the Storm Citadel, L50): THREE PHASES (def.phases [0.66, 0.33]), each opened by the
// shared safe-spot step: 1 = storm (lightning, bolt slam, orbs, summon); 2 adds the Volcanic Forge EMBER RAIN and
// the Frozen Peaks FREEZE LANE (violet storm); 3 adds the Candy Kingdom ROLLING GUMBALL and the Sky Bridge
// GRAWLSTONE ROCK SLAM, two frozen lanes at once (crimson storm); RAGE at 25% on top. During each safe-spot step
// a storm shield (pale aura) cuts the damage he takes to def.safeGuard, so every phase gets played out.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { volley, strikes, summon } from './attacks.js';
import { emberRain, freezeLane, gumballRoll, rockSlam } from './worldattacks.js';
import { buildTempestKing } from '../../models/bosses/tempestking.js';
const COL_KEYS = ['bolt', 'face', 'gem', 'aura', 'tint']; // this.col keys (animate lerps them every frame)

const P1 = { bolt: new THREE.Color('#fff27a'), face: new THREE.Color('#fff6b0'), gem: new THREE.Color('#59e8ff'), aura: new THREE.Color('#8a9cff'), tint: new THREE.Color(1, 1, 1) };
const P2 = { bolt: new THREE.Color('#e070ff'), face: new THREE.Color('#ff6a3a'), gem: new THREE.Color('#ff3b4e'), aura: new THREE.Color('#c04dff'), tint: new THREE.Color(0.74, 0.7, 0.9) };
const P3 = { bolt: new THREE.Color('#ff5a8a'), face: new THREE.Color('#ff2a2a'), gem: new THREE.Color('#ff3b4e'), aura: new THREE.Color('#ff3a6a'), tint: new THREE.Color(0.62, 0.55, 0.74) };
const PALETTES = [P1, P2, P3];
const BOLTS = ['#fff27a', '#e070ff', '#ff5a8a'];
const WHITE = new THREE.Color('#ffffff');

export class TempestKing extends BaseBoss {
  static preload(game) { game.bosses.model('tempestking', buildTempestKing); }

  buildModel() {
    const m = this.game.bosses.model('tempestking', buildTempestKing);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.setScalar(1);
    m.crown.position.set(0, 1.85, -0.1); m.crown.rotation.set(0, 0, 0);
    for (const a of m.arms) a.g.rotation.set(0, 0, 0);
    this.pose = { raise: 0, slam: 0, throwArm: 0, throw: 0, flick: 0 };
    this.col = { bolt: P1.bolt.clone(), face: P1.face.clone(), gem: P1.gem.clone(), aura: P1.aura.clone(), tint: P1.tint.clone() };
    this.turn = 0;
    return m;
  }

  /** Storm shield: while his safe-spot step runs he takes def.safeGuard of the damage (pale aura). */
  update(dt) {
    super.update(dt);
    this.guardMul = this.attack && this.attack.safe && this.alive ? this.def.safeGuard ?? 1 : 1;
  }

  get boltColor() { return BOLTS[Math.min(3, this.phase) - 1]; }

  /** Attacks rotate in a fixed order per phase (def.rotate / rotate2 / rotate3), never random. */
  pickAttack() {
    const d = this.def;
    const order = (this.phase >= 3 && d.rotate3) || (this.phase === 2 && d.rotate2) || d.rotate;
    const id = order[this.turn++ % order.length];
    return this.def.attacks.find((a) => a.id === id) || this.def.attacks[0];
  }

  fistPos(i) {
    const s = i % 2 ? 1 : -1;
    return { x: this.x + 4.2 * s, y: (4.3 + this.model.body.position.y) * 0.82, z: this.z + 1.2 };
  }

  enterUpdate(f) {
    const e = 1 - f;
    this.y = 34 * e * e;
    // a storm of bolts heralds him
    if (Math.random() < 0.18) this.effects.bolt(this.x + (Math.random() - 0.5) * 12, this.z + 2 + Math.random() * 4, 22, { color: '#fff27a', width: 0.9, life: 0.25 });
  }

  onLanded() {
    this.game.events.emit('fx:shake', { amount: 0.9 });
    for (const dx of [-3.5, 0, 3.5]) this.effects.bolt(this.x + dx, this.z + 3, 24, { color: '#fff27a', width: 1.4, life: 0.4 });
    this.effects.ring(this.x, this.z + 2, 10, { color: '#fff6b0', life: 0.6 });
    this.game.events.emit('boss:attack', { attack: 'lightning', pos: { x: this.x, y: 0, z: this.z + 3 } });
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    const p2 = this.phase >= 2, p3 = this.phase >= 3;
    const self = this;
    const raise = () => { self.pose.raise = 1; };
    const slam = () => { self.pose.raise = 0; self.pose.slam = 1; };
    switch (id) {
      case 'lightning':
        this.pose.raise = 1;
        return strikes(this, { count: this.tierCount(p2 ? spec.count2 : spec.count, 0.34), halfW: spec.halfW, telegraph: this.warnTime(spec.telegraph, 0.1),
          stagger: p2 ? spec.stagger * 0.75 : spec.stagger, attack: 'lightning', boltColor: this.boltColor, onImpact: slam });
      case 'slam':
        this.pose.raise = 1;
        return volley(this, { count: p2 ? spec.count2 : spec.count, radius: spec.radius, telegraph: this.warnTime(spec.telegraph, 0.1), stagger: spec.stagger,
          spread: 1.6, attack: 'slam', projectile: 'bolt', orbColor: this.boltColor, ringColor: '#fff6b0', onLaunch: raise, onImpact: slam });
      case 'summon': {
        const count = Math.min(spec.max, (p2 ? spec.count2 : spec.count) + spec.perTier * (this.tier - 1));
        return summon(this, { count, mix: p2 ? spec.mix2 : spec.mix, windup: this.warnTime(spec.windup), ahead: 4, width: 8.6, color: '#b8c4ff',
          hpMul: 1 + (this.tier - 1) * (spec.hpPerTier || 0) + (p2 ? 0.5 : 0),
          onWindup(f) { self.pose.raise = f; }, onSpawn() { self.pose.raise = 0; self.pose.slam = 1; } });
      }
      case 'embers':
        this.pose.raise = 1;
        return emberRain(this, { count: this.tierCount(p3 ? spec.count2 : spec.count, 0.34), radius: spec.radius, telegraph: this.warnTime(spec.telegraph, 0.05),
          stagger: spec.stagger, spread: spec.spread, onImpact: slam });
      case 'freeze':
        this.pose.raise = 1;
        return freezeLane(this, { halfW: spec.halfW, telegraph: this.warnTime(spec.telegraph, 0.05), life: spec.life, rate: spec.rate, count: p3 ? 2 : 1, stagger: 0.55 });
      case 'gumball':
        this.pose.throw = 1; this.pose.throwArm = this.turn % 2;
        return gumballRoll(this, { halfW: spec.halfW, telegraph: spec.telegraph, launch: spec.launch });
      case 'grawl':
        this.pose.raise = 1;
        return rockSlam(this, { count: spec.count + (this.rage ? 1 : 0), radius: spec.radius, telegraph: this.warnTime(spec.telegraph, 0.05), gap: spec.gap, onImpact: slam });
      default:
        return volley(this, { count: this.tierCount(p2 ? spec.count2 : spec.count, 0.5), radius: spec.radius, telegraph: this.warnTime(spec.telegraph, 0.1),
          flight: spec.flight, stagger: p2 ? spec.stagger * 0.8 : spec.stagger, spread: spec.spread, from: (i) => this.fistPos(i),
          orbColor: this.boltColor, core: '#ffffff', ringColor: '#fff6b0', arc: 4.5, size: 0.8,
          onLaunch(i) { self.pose.throw = 1; self.pose.throwArm = i % 2; } });
    }
  }

  /** Phase 2 / 3: a burst of bolts in the new colour; the rotation restarts with the new world attacks. */
  onPhase(n) {
    this.turn = 0;
    const col = BOLTS[Math.min(3, n) - 1];
    for (const dx of [-4, -1.5, 1.5, 4]) this.effects.bolt(this.x + dx, this.z + 2, 24, { color: col, width: 1.2 + (n - 2) * 0.3, life: 0.45 });
    this.effects.ring(this.x, this.z + 2, 11 + n, { color: n >= 3 ? '#ff9ab8' : '#e9a8ff', life: 0.7 });
    this.pose.raise = 1;
  }

  onRage() { for (const dx of [-5, -2.5, 0, 2.5, 5]) this.effects.bolt(this.x + dx, this.z + 1, 26, { color: '#ff3a3a', width: 1.4, life: 0.5 }); }

  safeSpotOpts() { return { bolts: this.boltColor, blast: this.phase >= 3 ? '#ff7aa8' : '#e9a8ff' }; }

  onDeath() { this.clearMinions(); }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model, p = this.pose;
    const dying = this.state === 'dying' || this.state === 'dead';
    const p2 = this.phase >= 2;
    p.slam = Math.max(0, p.slam - dt * 2.5);
    p.throw = Math.max(0, p.throw - dt * 3.5);
    if (!this.attack) p.raise = Math.max(0, p.raise - dt * 2);
    // hover, breathe, lean into slams
    m.body.position.y = -1.3 + Math.sin(t * 1.2) * 0.3 + p.raise * 0.4 - p.slam * 0.5;
    m.body.rotation.x = p.slam * 0.12 - p.raise * 0.06;
    m.body.rotation.z = Math.sin(t * 0.6) * 0.03;
    m.head.rotation.y = Math.sin(t * 0.5) * 0.1;
    m.head.rotation.x = -p.raise * 0.15 + p.slam * 0.15;
    // arms: idle drift, raised overhead (charging), slammed down, thrown forward
    m.arms.forEach((a, i) => {
      const side = i ? 1 : -1;
      const thr = p.throwArm === i ? p.throw : 0;
      a.g.rotation.z = side * (0.1 + Math.sin(t * 1.4 + i) * 0.08 + p.raise * 1.9 - p.slam * 0.4);
      a.g.rotation.x = -thr * 1.3 + p.slam * 0.3 - p.raise * 0.2;
      // crackle: swap the zigzag variant, flicker the glow shell
      if (Math.random() < dt * (p2 ? 22 : 12)) a.bolt.geometry = a.variants[(Math.random() * 3) | 0];
      a.shell.material.opacity = 0.25 + Math.random() * 0.25;
      a.spark.scale.setScalar(2.2 + Math.random() * 0.8 + p.raise * 1.5);
    });
    // colours: phase-2 violet lightning, red face, darker cloud; hit flash
    const k = Math.min(1, dt * 3);
    const P = PALETTES[Math.min(3, this.phase) - 1];
    for (let i = 0; i < COL_KEYS.length; i++) this.col[COL_KEYS[i]].lerp(P[COL_KEYS[i]], k);
    const fl = this.flash;
    m.boltMat.color.copy(this.col.bolt).lerp(WHITE, 0.25 + 0.2 * Math.sin(t * 40));
    for (const a of m.arms) { a.shell.material.color.copy(this.col.bolt); a.spark.material.color.copy(this.col.bolt); }
    m.faceMat.color.copy(this.col.face).multiplyScalar(0.85 + 0.15 * Math.sin(t * 6) + p.raise * 0.2);
    m.gemMat.color.copy(this.col.gem);
    m.aura.material.color.copy(this.col.aura);
    m.aura.material.opacity = 0.2 + p.raise * 0.15 + (p2 ? 0.08 : 0);
    m.mat.color.copy(this.col.tint);
    m.mat.emissive.setRGB(fl * 0.28, fl * 0.28, fl * 0.32);
    // ambient sky bolts in phase 2
    if (p2 && !dying && Math.random() < dt * (this.phase >= 3 ? 1.4 : 0.8)) this.effects.bolt(this.x + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4), this.z - 2 - Math.random() * 6, 26, { color: this.boltColor, width: 0.8, life: 0.25 });
    // death: the storm shrinks and rises away crackling, the crown tumbles down
    if (dying) {
      const f = Math.min(1, this.t / 1.55);
      const e = f * f;
      m.body.scale.setScalar(Math.max(0.05, 1 - e * 0.95));
      m.body.position.y += e * 6;
      m.body.position.x = Math.sin(t * 50) * 0.25 * (1 - f);
      m.crown.position.set(f * 1.5, 1.85 + Math.sin(f * Math.PI) * 2 - e * 9 / Math.max(0.2, m.body.scale.x), f * 1.5);
      m.crown.rotation.set(f * 2.5, 0, -f * 3);
      m.mat.emissive.setRGB(0.5 * (1 - f), 0.5 * (1 - f), 0.6 * (1 - f));
      if (Math.random() < 0.4) this.effects.bolt(this.x + (Math.random() - 0.5) * 9, this.z + Math.random() * 4, 20, { color: '#fff27a', width: 1, life: 0.2 });
    } else {
      m.body.position.x = 0;
    }
  }
}
