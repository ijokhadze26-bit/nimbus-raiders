// Oculon: floating storm-cloud eyeball. ORB VOLLEY (target circles, glowing orbs arc out of the eye) and
// ORB RAIN on a striped lane; phase 2 adds SPIRAL volleys and an EYE LASER that sweeps across a striped
// half of the road. Entrance: sinks out of the sky with the eye shut, then snaps open. Death: the eye
// rolls up, rings fly off and the cloud spirals down into the sea of clouds.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { volley, strikes, clampX } from './attacks.js';
import { buildOculon } from '../../models/bosses/oculon.js';

const WHITE = new THREE.Color('#ffffff');
const P1 = { iris: new THREE.Color('#25d4e8'), irisE: new THREE.Color('#0a5a70'), ringA: new THREE.Color('#ffc531'), ringB: new THREE.Color('#59e8ff'), spark: new THREE.Color('#fff27a'), aura: new THREE.Color('#7fe9ff'), cloud: new THREE.Color(1, 1, 1) };
const P2 = { iris: new THREE.Color('#ff2b4a'), irisE: new THREE.Color('#7a0518'), ringA: new THREE.Color('#ff8a3d'), ringB: new THREE.Color('#ff3b6a'), spark: new THREE.Color('#ff7a8a'), aura: new THREE.Color('#ff4a6a'), cloud: new THREE.Color(0.72, 0.7, 0.88) };
const ORB1 = '#7fe9ff', ORB2 = '#ff5a7a';

export class Oculon extends BaseBoss {
  static preload(game) { game.bosses.model('oculon', buildOculon); }

  buildModel() {
    const m = this.game.bosses.model('oculon', buildOculon);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0); m.root.scale.setScalar(1.25);
    m.body.rotation.set(0, 0, 0); m.body.scale.setScalar(1);
    for (const r of m.rings) { r.pivot.scale.setScalar(1); r.pivot.position.set(0, 0, 0); }
    m.cloudGroup.scale.setScalar(1);
    this.pose = { charge: 0, lid: 0, blink: 0, nextBlink: 2.5, spin: 1, glare: 0, look: 0 };
    this.col = { iris: P1.iris.clone(), irisE: P1.irisE.clone(), ringA: P1.ringA.clone(), ringB: P1.ringB.clone(), spark: P1.spark.clone(), aura: P1.aura.clone(), cloud: P1.cloud.clone() };
    this.model = m;
    this.applyColors(1);
    return m;
  }

  get orbColor() { return this.phase === 2 ? ORB2 : ORB1; }

  /** Launch point: the front of the eye (world). */
  eyeFront() {
    const m = this.model;
    return { x: this.x, y: m.body.position.y * 1.25, z: this.z + 2.9 };
  }

  enterUpdate(f) {
    const e = 1 - f;
    this.y = 32 * e * e * e;
    this.pose.lid = 0; // shut while descending
  }

  onLanded() {
    this.game.events.emit('fx:shake', { amount: 0.55 });
    this.effects.ring(this.x, this.z + 1, 8, { color: '#bfefff', life: 0.6 });
    this.effects.glow(this.x, 6.4, this.z + 2.2, '#7fe9ff', 12, 0.6);
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    const p2 = this.phase === 2;
    const from = () => this.eyeFront();
    const charge = () => { this.pose.charge = 1; };
    switch (id) {
      case 'stripe':
        return strikes(this, { count: p2 ? spec.count2 : spec.count, halfW: spec.halfW, telegraph: this.warnTime(spec.telegraph, 0.1),
          stagger: spec.stagger, attack: 'orb', rain: true, from, boltColor: this.orbColor, color: '#ff2a3a', onImpact: charge });
      case 'spiral':
        this.pose.charge = 1;
        return volley(this, { count: this.tierCount(spec.count, 0.5), radius: spec.radius, telegraph: this.warnTime(spec.telegraph), flight: spec.flight,
          stagger: spec.stagger, pattern: 'spiral', maxR: spec.maxR, turn: 1.25, from, orbColor: this.orbColor, ringColor: '#ffd0da', size: 0.5, arc: 2.5, onLaunch: charge });
      case 'laser': return this.laserAttack(spec);
      default:
        return volley(this, { count: this.tierCount(p2 ? spec.count2 : spec.count, 0.5), radius: spec.radius, telegraph: this.warnTime(spec.telegraph, 0.1),
          flight: spec.flight, stagger: spec.stagger, spread: spec.spread, from, orbColor: this.orbColor, ringColor: '#dffaff', onLaunch: charge });
    }
  }

  /** Striped warning over ~half the road, then the eye beam sweeps across it (move to the other side). */
  laserAttack(spec) {
    const game = this.game, T = game.telegraph, fx = this.effects;
    const c = this.squadCenter();
    const half = spec.width / 2;
    const cx = clampX(c.x, 5 - half);
    const x0 = cx - half, x1 = cx + half;
    const zFar = c.z - c.r - 3, zNear = c.z + c.r + 2.5;
    const dur = this.warnTime(spec.telegraph);
    const mark = T.lane(x0, x1, zNear, zFar, dur, { attack: 'lightning', color: '#ff2a4a' });
    const zone = { kind: 'lane', x0, x1, zNear, zFar };
    const dir = game.rng.chance(0.5) ? 1 : -1;
    const from = dir > 0 ? x0 : x1, to = dir > 0 ? x1 : x0;
    let t = 0, fired = false, prev = from, doomed = [];
    const self = this;
    this.lockX = cx * 0.45;
    return {
      update(dt) {
        t += dt;
        self.pose.charge = Math.min(1, t / dur);
        if (t < dur) return false;
        const b = fx.laser();
        if (!fired) {
          fired = true;
          fx.beamOn(self.orbColor);
          self.dangerZones.push(zone);
          doomed = self.membersInBox((x0 + x1) / 2, (x1 - x0) / 2, zFar, zNear);
          game.events.emit('boss:attack', { attack: 'lightning', pos: { x: from, y: 0, z: (zFar + zNear) / 2 } });
          game.events.emit('fx:shake', { amount: 0.35 });
        }
        const f = Math.min(1, (t - dur) / spec.sweep);
        const bx = from + (to - from) * f;
        // members caught in the stripe when it fired burn as the beam reaches them; members that
        // re-flow into the stripe afterwards are spared
        const lo = Math.min(prev, bx) - 0.45, hi = Math.max(prev, bx) + 0.45;
        for (let i = doomed.length - 1; i >= 0; i--) {
          const m = doomed[i];
          if (m.x >= lo && m.x <= hi) { doomed.splice(i, 1); if (m.x >= x0 - 0.3 && m.x <= x1 + 0.3) self.killMemberObj(m); }
        }
        prev = bx;
        const e = self.eyeFront();
        Object.assign(b, { ax: e.x, ay: e.y, az: e.z, bx, zFar, zNear, w: 0.55 });
        if (Math.random() < 0.7) fx.glow(bx, 0.3, zFar + Math.random() * (zNear - zFar), '#ff4a6a', 2.4, 0.3);
        if (Math.random() < 0.3) fx.glow(e.x, e.y, e.z, '#ff4a6a', 5, 0.2);
        if (f >= 1) { fx.beamOff(); self.lockX = null; self.dropZone(zone); }
        return f >= 1 && t >= dur + spec.sweep + 0.3;
      },
      cancel() { T.cancel(mark); fx.beamOff(); self.lockX = null; self.dropZone(zone); },
    };
  }

  onPhase2() {
    this.effects.glow(this.x, 6.5, this.z + 2, '#ff4a6a', 14, 0.7);
    this.effects.ring(this.x, this.z + 1, 9, { color: '#ff7a8a', life: 0.7 });
  }

  onDeath() { this.effects.beamOff(); }

  // ---------------- visuals ----------------
  applyColors(k) {
    const m = this.model, c = this.col;
    const P = this.phase === 2 ? P2 : P1;
    for (const key of Object.keys(c)) c[key].lerp(P[key], k);
    m.irisMat.color.copy(c.iris);
    m.irisMat.emissive.copy(c.irisE).multiplyScalar(1 + this.pose.charge * 2.5);
    m.ringMats[0].color.copy(c.ringA); m.ringMats[1].color.copy(c.ringB);
    m.sparkMat.color.copy(c.spark);
    m.aura.material.color.copy(c.aura);
  }

  animate(dt, t) {
    const m = this.model, p = this.pose, game = this.game;
    const dying = this.state === 'dying' || this.state === 'dead';
    p.charge = Math.max(0, p.charge - dt * 1.6);
    this.applyColors(Math.min(1, dt * 3));
    // hover + sway
    m.body.position.y = 5.0 + Math.sin(t * 1.4) * 0.25;
    m.body.rotation.z = Math.sin(t * 0.7) * 0.06 + (this.lockX !== null ? (this.lockX - this.x) * -0.05 : 0);
    // lids: shut while entering, snap open during the intro, glare in phase 2, blink now and then
    const want = this.state === 'enter' ? 0 : 1;
    p.lid += (want - p.lid) * Math.min(1, dt * (this.state === 'intro' ? 5 : 10));
    p.glare += ((this.phase === 2 ? 1 : 0) - p.glare) * Math.min(1, dt * 3);
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = 1; p.nextBlink = 2.2 + Math.random() * 2.5; }
    p.blink = Math.max(0, p.blink - dt * 7);
    const blink = Math.sin(p.blink * Math.PI);
    const open = p.lid * (1 - blink) * (dying ? Math.max(0, 1 - this.t * 1.5) : 1);
    m.lidTop.rotation.x = -(1.45 - p.glare * 0.5 + p.charge * 0.1) * open;
    m.lidBot.rotation.x = (1.2 - p.glare * 0.15) * open;
    // eye tracks the squad (and rolls up when dying)
    const L = game.squad.leader;
    const yaw = Math.atan2(L.x - this.x, Math.max(4, L.z - this.z));
    const pitch = Math.atan2(6.5, Math.max(4, L.z - this.z));
    m.eye.rotation.y += (Math.max(-0.5, Math.min(0.5, yaw)) - m.eye.rotation.y) * Math.min(1, dt * 6);
    m.eye.rotation.x += ((dying ? -0.9 : pitch * 0.9) - m.eye.rotation.x) * Math.min(1, dt * 6);
    // pupil: round -> slit in phase 2, dilates while charging
    const slit = p.glare;
    m.pupil.scale.set((1 - slit * 0.6) * (1 + p.charge * 0.25), 1 + p.charge * 0.2, 1);
    // rings
    p.spin += ((this.phase === 2 ? 2.4 : 1) + p.charge * 2 - p.spin) * Math.min(1, dt * 2);
    for (const r of m.rings) {
      r.spin.rotation.z += r.speed * p.spin * dt * (this.state === 'enter' ? 4 : 1);
      r.glow.material.opacity = 0.7 + 0.3 * Math.sin(t * 9 + r.speed);
    }
    m.tendrils.visible = Math.sin(t * 23) > -0.2 || this.phase === 2;
    m.tendrils.scale.y = 1 + Math.sin(t * 17) * 0.08;
    m.aura.scale.setScalar(12 + Math.sin(t * 2) * 0.8 + p.charge * 5);
    m.aura.material.opacity = 0.22 + p.charge * 0.3 + (this.phase === 2 ? 0.08 : 0);
    // hit flash + phase-2 cloud tint
    const fl = this.flash;
    m.mat.color.copy(this.col.cloud);
    m.mat.emissive.setRGB(fl * 0.3, fl * 0.3, fl * 0.34);
    m.irisMat.emissive.lerp(WHITE, fl * 0.25);
    // death: spin, rings fly apart, sink into the clouds
    if (dying) {
      const f = Math.min(1, this.t / 1.55);
      m.body.rotation.z = f * f * 5;
      m.body.position.y -= f * f * 9;
      m.body.position.x = Math.sin(t * 55) * 0.2 * (1 - f);
      m.cloudGroup.scale.setScalar(1 - f * 0.5);
      m.rings.forEach((r, i) => { r.pivot.scale.setScalar(1 + f * 1.8); r.pivot.position.y = (i ? -1 : 1) * f * 3; });
      m.mat.emissive.setRGB(0.5 * (1 - f), 0.5 * (1 - f), 0.55 * (1 - f));
      if (Math.random() < 0.3) this.effects.bolt(this.x + (Math.random() - 0.5) * 6, this.z + 1 + Math.random() * 2, 8 + Math.random() * 4, { color: '#bfefff', width: 0.6, life: 0.2, y0: 2 + Math.random() * 3 });
    } else {
      m.body.position.x = 0;
    }
  }
}
