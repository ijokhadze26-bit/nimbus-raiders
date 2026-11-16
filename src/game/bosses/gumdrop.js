// GUMDROP GOLIATH, the Candy Kingdom mini-boss (L35): a huge chewy gumdrop. Attacks (data in data/bosses.js):
//   bounce  crouches, springs into the air and lands on a red warning circle on the squad (phase 2: a second
//           hop where the squad fled to), then bounces back to his spot
//   split   swells up and spits out a wave of small gummy Murklings (summon helper, candy mix)
//   spit    sticky strawberry-syrup globs land on warning circles: members under a glob are lost and a syrup
//           puddle stays behind that makes Pip wade slowly sideways
// Always wobbling (jelly squash and stretch). Mini-boss: no safe-spot step. Death: melts into a sugar puddle.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { summon, volley } from './attacks.js';
import { buildGumdrop, syrupTexture } from '../../models/bosses/gumdrop.js';
import { registerWarm } from '../warmup.js';

const EYE1 = new THREE.Color('#ffffff'), EYE2 = new THREE.Color('#ffd0d0');
const TINT1 = new THREE.Color(1, 1, 1), TINT2 = new THREE.Color(1.08, 0.86, 0.86);
const WHITE = new THREE.Color('#ffffff');
const discGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
const clampX = (x, lim = 4.2) => Math.max(-lim, Math.min(lim, x));

const buildCached = () => { const m = buildGumdrop(); m.syrup = []; return m; };
const syrupMat = () => new THREE.MeshBasicMaterial({ map: syrupTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const rimMat = () => new THREE.MeshBasicMaterial({ color: '#ffd0e4', transparent: true, depthWrite: false, toneMapped: false });
// shader warm-up at boot (the first syrup puddle never hitches)
registerWarm(() => [new THREE.Mesh(discGeo, syrupMat()), new THREE.Mesh(ringGeo, rimMat())]);

export class GumdropGoliath extends BaseBoss {
  static preload(game) { game.bosses.model('gumdrop', buildCached); }

  buildModel() {
    const m = this.game.bosses.model('gumdrop', buildCached);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.setScalar(1);
    m.eyes.visible = true;
    this.syrup = m.syrup;
    for (const s of this.syrup) s.active = false;
    this.pose = { crouch: 0, squash: 0, swell: 0, spit: 0, air: 0, blink: 0, nextBlink: 1.5, wob: 0 };
    this.eyeCol = EYE1.clone();
    this.tint = TINT1.clone();
    this.prevLX = null;
    this.zonePool = [];
    this.hop = null; // { x0, z0, x1, z1, t, dur, h } while airborne
    return m;
  }

  enterUpdate(f) {
    // drops in with a big jelly splat (the squash happens on landing)
    this.y = 30 * (1 - f) * (1 - f);
  }

  onLanded() {
    const g = this.game, low = g.engine.quality === 'low';
    this.pose.squash = 1;
    g.events.emit('fx:shake', { amount: 0.8 });
    this.effects.ring(this.x, this.z + 1.5, 8, { color: '#ffd0a0', life: 0.55 });
    g.gates.burst(this.x, 0.6, this.z + 2.5, 6, 2.2, '#ffe9d6', low ? 12 : 26);
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    if (id === 'split') return this.splitAttack(spec);
    if (id === 'spit') return this.spitAttack(spec);
    return this.bounceAttack(spec);
  }

  /** One hop: crouch, fly to the warning circle (lands as it fills), crush, then hop home. */
  bounceAttack(spec) {
    const game = this.game, T = game.telegraph, rng = game.rng, self = this;
    const p2 = this.phase === 2;
    const n = p2 ? spec.count2 : spec.count, r = p2 ? spec.radius2 : spec.radius;
    const dur = this.warnTime(spec.telegraph);
    let k = 0, t = 0, mark = null, stage = 'warn';
    const startHop = () => {
      const c = self.squadCenter();
      const off = k === 0 ? rng.range(-0.4, 0.4) : rng.range(-0.8, 0.8);
      mark = T.circle(clampX(c.x + off, 4.4 - r * 0.4), c.z + rng.range(-0.6, 0.2), r, dur, { attack: 'bounce' });
      t = 0; stage = 'warn';
    };
    startHop();
    this.lockX = null;
    return {
      update(dt) {
        t += dt;
        const p = self.pose;
        if (stage === 'warn') {
          const air = Math.min(spec.air, dur - 0.25);
          if (t < dur - air) p.crouch = Math.min(1, t / Math.max(0.2, dur - air));
          else if (!self.hop) {
            p.crouch = 0; p.squash = 0.6;
            self.hop = { x0: self.x, z0: self.z, x1: mark.x, z1: mark.z - spec.ahead, t: 0, dur: dur - t, h: spec.height };
            game.events.emit('boss:attack', { attack: 'gumjump', pos: { x: self.x, y: 0, z: self.z } });
          }
          if (t >= dur) {
            self.hop = null;
            self.x = mark.x; self.z = mark.z - spec.ahead; self.y = 0;
            p.squash = 1;
            const kills = self.killInCircle(mark.x, mark.z, mark.r);
            self.effects.ring(mark.x, mark.z, r * 1.6, { color: '#ffd0a0' });
            game.gates.burst(mark.x, 0.4, mark.z, r * 1.3, 1.6, '#ffb15c', game.engine.quality === 'low' ? 8 : 18);
            game.events.emit('boss:attack', { attack: 'bounce', pos: { x: mark.x, y: 0, z: mark.z } });
            game.events.emit('fx:shake', { amount: kills > 0 ? 0.85 : 0.6 });
            stage = 'land'; t = 0; k++;
          }
        } else if (stage === 'land') {
          if (t >= spec.hold) {
            if (k < n) startHop();
            else { stage = 'home'; t = 0; self.hop = { x0: self.x, z0: self.z, x1: self.x * 0.3, z1: self.homeZ, t: 0, dur: spec.back, h: spec.height * 0.6 }; }
          }
        } else if (stage === 'home') {
          if (t >= spec.back) { self.hop = null; self.z = self.homeZ; self.y = 0; p.squash = 0.7; return true; }
        }
        return false;
      },
      cancel() {
        if (mark) T.cancel(mark);
        self.hop = null; self.y = 0; // killed mid-hop: he melts where he is
      },
    };
  }

  splitAttack(spec) {
    const p2 = this.phase === 2;
    const count = Math.min(spec.max, (p2 ? spec.count2 : spec.count) + Math.round(spec.perTier * (this.tier - 1)));
    const self = this;
    return summon(this, {
      count, mix: p2 ? spec.mix2 : spec.mix, windup: this.warnTime(spec.windup), width: 7.6, ahead: 3.5, color: '#ff9ad6',
      hpMul: 1 + (this.tier - 1) * (spec.hpPerTier || 0),
      onWindup(f) { self.pose.swell = f; },
      onSpawn() { self.pose.swell = 0; self.pose.squash = 1; self.pose.spit = 1; },
    });
  }

  spitAttack(spec) {
    const p2 = this.phase === 2;
    const n = this.tierCount(p2 ? spec.count2 : spec.count, 0.2);
    const self = this;
    return volley(this, {
      count: n, radius: spec.radius, telegraph: this.warnTime(spec.telegraph), flight: spec.flight, stagger: 0.3, spread: 2.4,
      attack: 'spit', orbColor: '#ff4a8a', core: '#ffd0e4', ringColor: '#ffb0d0', arc: 4.5, size: 0.9,
      from: () => ({ x: self.x, y: 3.2, z: self.z + 3.2 }),
      onLaunch() { self.pose.spit = 1; },
      onImpact(i, kills, h) { self.puddle(h.x, h.z, spec.radius * 1.25, spec.life); },
    });
  }

  // ---------------- syrup puddles (slow zones) ----------------
  puddle(x, z, r, life) {
    let s = this.syrup.find((o) => !o.active);
    if (!s) {
      const mesh = new THREE.Mesh(discGeo, syrupMat()), rim = new THREE.Mesh(ringGeo, rimMat());
      mesh.renderOrder = 1; rim.renderOrder = 2;
      s = { mesh, rim };
      this.syrup.push(s);
    }
    Object.assign(s, { active: true, x, z, r, life, t: 0, spin: (x * 1.7 + z * 0.3) % 6 });
    this.game.scene.add(s.mesh); this.game.scene.add(s.rim);
  }

  slowAt(x, z) {
    for (const s of this.syrup) {
      if (!s.active || s.t < 0.15 || s.t > s.life - 0.3) continue;
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r * 0.85) return this.def.syrupSlow;
    }
    return 1;
  }

  update(dt) {
    super.update(dt);
    for (const s of this.syrup) if (s.active && (s.t += dt) >= s.life) s.active = false;
    // airborne hop arc (logic: the hitbox follows the body)
    const h = this.hop;
    if (h && this.state === 'fight') {
      h.t += dt;
      const f = Math.min(1, h.t / Math.max(0.05, h.dur));
      this.lockX = h.x0 + (h.x1 - h.x0) * f;
      this.x = this.lockX;
      this.z = h.z0 + (h.z1 - h.z0) * f;
      this.y = Math.sin(f * Math.PI) * h.h;
      this.root.position.set(this.x, this.y, this.z);
    } else if (!h && this.lockX !== null && this.state === 'fight' && !this.attack) this.lockX = null;
    // syrup: Pip wades slowly sideways through it (members follow the leader's slots)
    const L = this.game.squad.leader;
    if (this.prevLX !== null && this.state === 'fight') {
      const k = this.slowAt(L.x, L.z);
      if (k < 1) L.x = this.prevLX + (L.x - this.prevLX) * k;
    }
    this.prevLX = L.x;
    const zones = this.dangerZones, pool = this.zonePool;
    zones.length = 0;
    if (this.state === 'fight') for (const s of this.syrup) {
      if (!s.active) continue;
      const z = pool[zones.length] || (pool[zones.length] = { kind: 'circle', x: 0, z: 0, r: 0 });
      z.x = s.x; z.z = s.z; z.r = s.r * 0.9;
      zones.push(z);
    }
  }

  onPhase2() {
    this.pose.squash = 1;
    const g = this.game;
    this.effects.ring(this.x, this.z + 1, 9, { color: '#ff7ad1', life: 0.7 });
    g.gates.burst(this.x, 3.5, this.z + 2.5, 5, 3.5, '#ffe9d6', g.engine.quality === 'low' ? 10 : 22);
  }

  onDeath() {
    this.hop = null; this.y = 0;
    this.clearMinions();
  }

  disposeExtra() {
    for (const s of this.syrup) { s.active = false; this.game.scene.remove(s.mesh); this.game.scene.remove(s.rim); }
  }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model, p = this.pose, low = this.game.engine.quality === 'low';
    const dying = this.state === 'dying' || this.state === 'dead';
    p.squash = Math.max(0, p.squash - dt * 2.2);
    p.spit = Math.max(0, p.spit - dt * 3);
    // jelly wobble: idle jiggle + landing spring + crouch + summon swell; stretched tall while airborne
    const air = this.hop ? Math.sin(Math.min(1, this.hop.t / this.hop.dur) * Math.PI) : 0;
    const wob = Math.sin(t * 3.1) * 0.035 + Math.sin(t * 5.3) * 0.015;
    const spring = Math.cos((1 - p.squash) * Math.PI * 3.5) * p.squash * 0.24; // lands flat, then jiggles
    const sw = p.swell * p.swell * 0.16 + Math.sin(t * 28) * 0.015 * p.swell;
    const sx = 1 + wob + spring + p.crouch * 0.2 + sw - air * 0.12;
    const sy = 1 - wob - spring - p.crouch * 0.28 + sw * 0.5 + air * 0.18 - p.spit * 0.06;
    m.body.scale.set(sx, Math.max(0.3, sy), sx);
    m.body.rotation.z = Math.sin(t * 1.7) * 0.04;
    m.body.rotation.x = -p.spit * 0.18 + air * 0.08;
    m.crown.rotation.z = -0.22 + Math.sin(t * 3.1 + 0.6) * 0.08 + spring * 0.3;
    m.arms.forEach((a, i) => {
      const side = i ? 1 : -1;
      a.rotation.z = side * (0.2 + Math.sin(t * 4 + i * 1.3) * 0.15 + p.swell * 0.8 + air * 1.1 + p.crouch * -0.3);
      a.rotation.x = -p.spit * 0.8;
    });
    // blink
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = 1; p.nextBlink = 1.8 + Math.random() * 2.5; }
    p.blink = Math.max(0, p.blink - dt * 8);
    const b = 1 - Math.sin(p.blink * Math.PI) * 0.85;
    m.eyes.scale.y = b;
    m.eyes.position.y = (1 - b) * 3.2;
    // colours: angrier tint in phase 2, flash white on hits; glints twinkle (High only)
    const k = Math.min(1, dt * 3), p2 = this.phase === 2;
    this.eyeCol.lerp(p2 ? EYE2 : EYE1, k);
    this.tint.lerp(p2 ? TINT2 : TINT1, k);
    m.eyeMat.color.copy(this.eyeCol).lerp(WHITE, this.flash * 0.5);
    m.mat.color.copy(this.tint);
    const fl = this.flash;
    m.mat.emissive.setRGB(fl * 0.3 + p.swell * 0.12, fl * 0.24 + p.swell * 0.05, fl * 0.2 + p.swell * 0.1);
    m.glints.visible = !low;
    if (!low) {
      m.glintMat.opacity = 0.5 + 0.5 * Math.sin(t * 6.3);
      m.glints.rotation.y = Math.sin(t * 0.7) * 0.05;
    }
    m.aura.visible = !low;
    m.aura.material.opacity = p.swell * 0.55 + (p2 ? 0.08 + 0.05 * Math.sin(t * 6) : 0);
    m.aura.scale.setScalar(9 + p.swell * 5);
    if (dying) {
      const f = Math.min(1, this.t / 1.55), melt = f * f;
      m.body.scale.set(1 + melt * 0.7, Math.max(0.05, 1 - melt * 0.95), 1 + melt * 0.6);
      m.body.position.x = Math.sin(t * 50) * 0.2 * (1 - f);
      m.crown.position.set(0.25 + f * 2.5, 5.54 + Math.sin(f * Math.PI) * 2.5, 0.1 + f * 1.5);
      m.mat.emissive.setRGB(0.35 * (1 - f), 0.25 * (1 - f), 0.2 * (1 - f));
      if (f > 0.5) m.eyes.visible = false;
      if (Math.random() < (low ? 0.12 : 0.3)) this.game.gates.burst(this.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 4, this.z + 2.2, 1.5, 1.5, '#ffb15c', 6);
    } else {
      m.body.position.x = 0;
      m.crown.position.set(0.25, 5.54, 0.1);
    }
    // syrup puddles
    const time = this.game.time;
    for (const s of this.syrup) {
      s.mesh.visible = s.rim.visible = s.active;
      if (!s.active) continue;
      const grow = Math.min(1, s.t / 0.25), fade = Math.min(1, (s.life - s.t) / 0.4);
      const w = 1 + Math.sin(time * 2.6 + s.spin) * 0.035;
      s.mesh.position.set(s.x, 0.05, s.z);
      s.mesh.scale.set(s.r * grow * w, 1, s.r * grow / w);
      s.mesh.rotation.y = s.spin + time * 0.15;
      s.mesh.material.opacity = 0.95 * fade;
      s.rim.position.set(s.x, 0.07, s.z);
      s.rim.scale.setScalar(s.r * grow * (1.02 + Math.sin(time * 5) * 0.03));
      s.rim.material.opacity = (0.35 + 0.25 * Math.sin(time * 5 + s.spin)) * fade;
    }
  }
}
