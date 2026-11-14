// Mother Murk: huge goo queen. SUMMON — she swells with a green burst, then a wave of 20-60 Murklings
// pours out of her body and charges (phase 2 mixes in bombers, tanks, shields). GOO PUDDLE — goo blobs
// arc out of her crown onto red warning circles: members under a blob die, and a sticky green puddle
// stays behind that slows the squad's sideways movement. Entrance: rises out of a goo pool. Death: melts.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { volley, summon } from './attacks.js';
import { buildMotherMurk } from '../../models/bosses/mothermurk.js';

const EYE1 = new THREE.Color('#ffd84a'), EYE2 = new THREE.Color('#ff3b2b');
const GEM1 = new THREE.Color('#59e8ff'), GEM2 = new THREE.Color('#ff3b4e');
const TINT1 = new THREE.Color(1, 1, 1), TINT2 = new THREE.Color(1.06, 0.82, 0.92);
const WHITE = new THREE.Color('#ffffff');

export class MotherMurk extends BaseBoss {
  static preload(game) { game.bosses.model('mothermurk', buildMotherMurk); }

  buildModel() {
    const m = this.game.bosses.model('mothermurk', buildMotherMurk);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.setScalar(1);
    m.skirt.scale.setScalar(1);
    m.crown.position.set(0, 6.35, -0.2); m.crown.rotation.set(0, 0, 0);
    m.eyes.visible = true;
    this.pose = { swell: 0, squash: 0, throw: 0, throwSide: 1, blink: 0, nextBlink: 2 };
    this.tint = TINT1.clone();
    this.eyeCol = EYE1.clone();
    this.gemCol = GEM1.clone();
    this.prevLX = null;
    return m;
  }

  enterUpdate(f) {
    // rises out of a goo pool with a jelly overshoot
    const e = 1 - f;
    this.y = -9.5 * e * e * e;
    if (this.t < 0.02 && !this.pooled) {
      this.pooled = true;
      this.effects.puddle(this.x, this.z + 0.5, 6.5, 2.2);
    }
  }

  onLanded() {
    this.pose.squash = 1;
    this.game.events.emit('fx:shake', { amount: 0.6 });
    this.effects.ring(this.x, this.z + 1, 9, { color: '#9dff7a', life: 0.6 });
    this.game.gates.burst(this.x, 0.5, this.z + 3, 7, 2, '#a77bff', 22);
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    if (id === 'puddle') return this.puddleAttack(spec);
    return this.summonAttack(spec);
  }

  summonAttack(spec) {
    const p2 = this.phase === 2;
    const base = p2 ? spec.count2 : spec.count;
    const count = Math.min(spec.max, base + spec.perTier * (this.tier - 1));
    const self = this;
    return summon(this, {
      count, mix: p2 ? spec.mix2 : spec.mix, windup: this.warnTime(spec.windup), width: 8.4, ahead: 5,
      hpMul: 1 + (this.tier - 1) * (spec.hpPerTier || 0) + (p2 ? 0.5 : 0),
      onWindup(f) { self.pose.swell = f; },
      onSpawn() { self.pose.swell = 0; self.pose.squash = 1; },
    });
  }

  puddleAttack(spec) {
    const p2 = this.phase === 2;
    const n = this.tierCount(p2 ? spec.count2 : spec.count, 0.5);
    const self = this, fx = this.effects;
    return volley(this, {
      count: n, radius: spec.radius, telegraph: this.warnTime(spec.telegraph), flight: spec.flight, stagger: 0.28, spread: 2.6,
      attack: 'puddle', orbColor: '#9dff7a', core: '#62d63e', ringColor: '#c8ff7a', arc: 5, size: 0.95,
      from: (i) => ({ x: self.x + (i % 2 ? 1.6 : -1.6), y: 7.4, z: self.z + 1 }),
      onLaunch(i) { self.pose.throw = 1; self.pose.throwSide = i % 2 ? 1 : -1; },
      onImpact(i, kills, h) { fx.puddle(h.x, h.z, spec.radius * 1.2, spec.life); },
    });
  }

  update(dt) {
    super.update(dt);
    // goo puddles: the leader wades slowly through them (members follow the leader's slots)
    const L = this.game.squad.leader;
    if (this.prevLX !== null && this.state === 'fight') {
      const k = this.effects.slowAt(L.x, L.z);
      if (k < 1) L.x = this.prevLX + (L.x - this.prevLX) * k;
    }
    this.prevLX = L.x;
    // puddles are dodge-worthy for the autopilot (they slow, they don't kill)
    const zones = this.dangerZones, pool = this.zonePool || (this.zonePool = []);
    zones.length = 0;
    for (const p of this.effects.puddles) {
      if (!p.active || this.state !== 'fight') continue;
      const z = pool[zones.length] || (pool[zones.length] = { kind: 'circle', x: 0, z: 0, r: 0 });
      z.x = p.x; z.z = p.z; z.r = p.r * 0.9;
      zones.push(z);
    }
  }

  onPhase2() {
    this.pose.squash = 1;
    this.effects.ring(this.x, this.z + 1, 10, { color: '#ff7a5a', life: 0.7 });
    this.game.gates.burst(this.x, 4, this.z + 3, 6, 4, '#b98cff', 20);
  }

  onDeath() { this.clearMinions(); }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model, p = this.pose;
    const dying = this.state === 'dying' || this.state === 'dead';
    p.squash = Math.max(0, p.squash - dt * 2.5);
    p.throw = Math.max(0, p.throw - dt * 3);
    // jelly wobble + summon swell + landing squash (damped spring look)
    const w = Math.sin(t * 2.3) * 0.035;
    const sq = Math.sin(p.squash * Math.PI * 3) * p.squash * 0.16;
    const swell = p.swell * p.swell * 0.14 + Math.sin(t * 30) * 0.012 * p.swell;
    m.body.scale.set(1 + w + sq + swell, 1 - w - sq + swell * 0.6, 1 + w + sq + swell);
    m.skirt.scale.set(1 + w * 0.6 + p.swell * 0.06, 1, 1 + w * 0.6 + p.swell * 0.06);
    m.body.rotation.z = Math.sin(t * 1.1) * 0.03;
    m.crown.rotation.z = Math.sin(t * 1.7 + 0.5) * 0.06;
    m.crown.position.y = 6.35 + Math.sin(t * 2.3 + 0.6) * 0.08;
    // arms: idle sway, raised during the summon, flung forward on a throw
    m.arms.forEach((a, i) => {
      const side = i ? 1 : -1;
      const thr = p.throwSide === side ? p.throw : 0;
      a.rotation.z = side * (0.15 + Math.sin(t * 2 + i) * 0.1 + p.swell * 1.2);
      a.rotation.x = -thr * 1.4 - p.swell * 0.3;
    });
    // eyes blink
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = 1; p.nextBlink = 2 + Math.random() * 3; }
    p.blink = Math.max(0, p.blink - dt * 7);
    m.eyes.scale.y = 1 - Math.sin(p.blink * Math.PI) * 0.85;
    m.eyes.position.y = (1 - m.eyes.scale.y) * 4.6;
    // colours: phase-2 eyes + gems, green summon glow, hit flash
    const k = Math.min(1, dt * 3);
    const p2 = this.phase === 2;
    this.eyeCol.lerp(p2 ? EYE2 : EYE1, k);
    this.gemCol.lerp(p2 ? GEM2 : GEM1, k);
    this.tint.lerp(p2 ? TINT2 : TINT1, k);
    const pulse = 0.85 + 0.15 * Math.sin(t * (p2 ? 10 : 4));
    m.eyeMat.color.copy(this.eyeCol).multiplyScalar(pulse + 0.15).lerp(WHITE, this.flash * 0.4);
    m.gemMat.color.copy(this.gemCol).multiplyScalar(pulse);
    m.mat.color.copy(this.tint);
    const fl = this.flash;
    m.mat.emissive.setRGB(fl * 0.25 + p.swell * 0.05, fl * 0.22 + p.swell * 0.18, fl * 0.28);
    m.aura.material.opacity = p.swell * 0.6 + (p2 ? 0.1 + 0.05 * Math.sin(t * 6) : 0);
    m.aura.material.color.set(p.swell > 0.05 ? '#7dff6a' : '#ff6a5a');
    m.aura.scale.setScalar(10 + p.swell * 6);
    // death: shudder, then melt into a spreading puddle while the crown topples off
    if (dying) {
      const f = Math.min(1, this.t / 1.55);
      const melt = f * f;
      m.body.scale.set(1 + melt * 0.6, Math.max(0.05, 1 - melt * 0.95), 1 + melt * 0.5);
      m.body.position.x = Math.sin(t * 50) * 0.25 * (1 - f);
      m.skirt.scale.set(1 + melt * 0.7, 1, 1 + melt * 0.6);
      m.crown.position.set(f * 3.5, 6.35 + Math.sin(f * Math.PI) * 3 - melt * 4, f * 2);
      m.crown.rotation.z = -f * 2.4;
      m.root.position.y = this.y - melt * 1.5;
      m.mat.emissive.setRGB(0.4 * (1 - f), 0.35 * (1 - f), 0.45 * (1 - f));
      if (f > 0.5) m.eyes.visible = false;
      if (Math.random() < 0.3) this.game.gates.burst(this.x + (Math.random() - 0.5) * 7, 1 + Math.random() * 4, this.z + 2.5, 1.5, 1.5, '#a77bff', 6);
    } else {
      m.body.position.x = 0;
    }
  }
}
