// Ironhorn: armored mech-rhino. CHARGE — it sidesteps into one half of the road, which glows with a red
// striped warning for 1.4 s, then thunders down that half past the squad, skids, turns and trots home
// (members in that half die as it passes). STOMP — rears up and slams its hooves: a quake crest races
// down a striped strip at the squad. Phase 2: DOUBLE charge (one half, then the other) and FEINT (the
// warning jumps to the other half mid-way; the real one still gets >= 0.9 s). Death: sparks, topples.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { sequence, clampX } from './attacks.js';
import { buildIronhorn } from '../../models/bosses/ironhorn.js';

const GLOW1 = new THREE.Color('#ffb43a'), GLOW2 = new THREE.Color('#ff3020'), WHITE = new THREE.Color('#ffffff');
const TINT1 = new THREE.Color(1, 1, 1), TINT2 = new THREE.Color(1.0, 0.86, 0.84);
const FRONT = 5.6;      // horn tip ahead of the body origin (scaled model)
const EDGE = 5.05, OVER = 0.6; // a charge covers one half of the road plus the centre: x in [-0.6, 5.05] (or mirrored)
const HALF = (EDGE + OVER) / 2, CX = (EDGE - OVER) / 2;

export class Ironhorn extends BaseBoss {
  static preload(game) { game.bosses.model('ironhorn', buildIronhorn); }

  buildModel() {
    const m = this.game.bosses.model('ironhorn', buildIronhorn);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0);
    m.head.rotation.set(0, 0, 0);
    for (const l of m.legs) l.rotation.set(0, 0, 0);
    this.pose = { lower: 0, rear: 0, stomp: 0, gallop: 0, gait: 0, yaw: 0, scrape: 0, roar: 0 };
    this.glow = GLOW1.clone();
    this.tint = TINT1.clone();
    return m;
  }

  get fx() { return this.game.fx ? this.game.fx.B : null; }

  enterUpdate(f) {
    // gallops in from far down the bridge and skids to a stop
    const e = 1 - f;
    this.y = 0;
    this.z = this.homeZ - 46 * e * e;
    this.pose.gallop = e > 0.15 ? 1 : e / 0.15;
    if (this.fx && Math.random() < 0.5) this.fx.dust(this.x + (Math.random() - 0.5) * 3, this.z + 1, 2);
  }

  onLanded() {
    this.pose.roar = 1;
    this.game.events.emit('fx:shake', { amount: 0.8 });
    if (this.fx) this.fx.landing(this.x, this.z + 2, 3.5);
  }

  pickSide() {
    const c = this.squadCenter();
    if (c.x > 0.25) return 1;
    if (c.x < -0.25) return -1;
    return this.game.rng.chance(0.5) ? 1 : -1;
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    if (id === 'stomp') return this.stompAttack(spec);
    if (id === 'double') {
      let first = 1;
      return sequence(
        () => { const a = this.chargeAttack(spec); first = a.side; return a; },
        () => this.chargeAttack(spec, { side: -first, warn: 1.0 }),
      );
    }
    if (id === 'feint') return this.chargeAttack(spec, { feint: true });
    return this.chargeAttack(spec);
  }

  /** Charge down one half of the road. o: { side, warn, feint }. */
  chargeAttack(spec, o = {}) {
    const game = this.game, T = game.telegraph, self = this;
    let side = o.side ?? this.pickSide();
    const L = game.squad.leader;
    const zFar = this.homeZ + 2, zNear = L.z + 9;
    // enraged (base.js soft enrage), the charge sweeps past the centre line further each time, so a small blob
    // can no longer wait out the fight on the other half of the road
    const over = OVER + Math.min(3.8, 1.6 * this.enrage());
    const half = (EDGE + over) / 2, cx = (EDGE - over) / 2;
    const lane = (sd, d) => T.lane(sd > 0 ? -over : -EDGE, sd > 0 ? EDGE : over, zNear, zFar, d, { attack: 'charge' });
    const zone = { kind: 'lane', x0: 0, x1: 0, zNear, zFar };
    let warnEnd = this.warnTime(o.warn ?? spec.telegraph);
    let switched = !o.feint;
    if (o.feint) warnEnd = spec.switchAt + this.warnTime(1.0);
    let mark = lane(side, o.feint ? spec.telegraph : warnEnd);
    let t = 0, stage = 'warn', st = 0, endZ = 0, dustT = 0, hit = false;
    this.lockX = side * cx;
    const attack = {
      side,
      update(dt) {
        t += dt; st += dt;
        const p = self.pose;
        if (stage === 'warn') {
          if (!switched && t >= spec.switchAt) {
            switched = true;
            T.cancel(mark);
            side = -side; attack.side = side;
            mark = lane(side, warnEnd - t);
            self.lockX = side * cx;
          }
          p.lower = Math.min(1, t / Math.max(0.3, warnEnd - 0.2));
          p.scrape = 1;
          if (t >= warnEnd) {
            stage = 'run'; st = 0;
            self.x = side * cx;
            zone.x0 = side > 0 ? -over : -EDGE; zone.x1 = side > 0 ? EDGE : over;
            self.dangerZones.push(zone);
            const c = self.squadCenter();
            endZ = Math.max(L.z + 6, c.z + c.r + 2.5) - FRONT;
            game.events.emit('boss:attack', { attack: 'charge', pos: { x: self.x, y: 0, z: self.z + FRONT } });
            game.events.emit('fx:shake', { amount: 0.5 });
          }
        } else if (stage === 'run') {
          self.z = Math.min(endZ, self.z + spec.speed * dt);
          const front = self.z + FRONT;
          // resolve once, as the horn reaches the squad: everyone standing in the warned half is hit
          // (a frame-by-frame sweep would also catch members re-flowing into the gaps behind it)
          if (!hit && front >= L.z - 1) { hit = true; self.killInBox(side * cx, half, L.z - 2, endZ + FRONT + 1); }
          p.gallop = 1; p.lower = 1;
          dustT -= dt;
          if (dustT <= 0 && self.fx) { dustT = 0.05; self.fx.dust(self.x + (Math.random() - 0.5) * 3, self.z, 0); }
          if (self.z >= endZ) { stage = 'skid'; st = 0; self.dropZone(zone); if (self.fx) self.fx.landing(self.x, self.z + 3, 2); game.events.emit('fx:shake', { amount: 0.35 }); }
        } else if (stage === 'skid') {
          p.gallop = Math.max(0, 1 - st * 4); p.lower = Math.max(0, 1 - st * 3);
          if (st >= 0.3) { stage = 'turn'; st = 0; }
        } else if (stage === 'turn') {
          p.yaw = Math.min(1, st / 0.35) * Math.PI;
          p.gallop = 0.5;
          if (st >= 0.35) { stage = 'back'; st = 0; }
        } else if (stage === 'back') {
          self.z = Math.max(self.homeZ, self.z - spec.back * dt);
          p.gallop = 0.8;
          if (self.z <= self.homeZ) { stage = 'turnBack'; st = 0; }
        } else if (stage === 'turnBack') {
          p.yaw = Math.PI * (1 - Math.min(1, st / 0.35));
          p.gallop = 0.4;
          if (st >= 0.35) { p.yaw = 0; p.gallop = 0; self.lockX = null; return true; }
        }
        return false;
      },
      cancel() { T.cancel(mark); self.lockX = null; self.dropZone(zone); },
    };
    return attack;
  }

  /** Rear up, slam down: quake crests race down striped strips (squad x, + a second strip in phase 2). */
  stompAttack(spec) {
    const game = this.game, T = game.telegraph, self = this;
    const c = this.squadCenter();
    const hw = spec.halfW;
    const xs = [clampX(c.x, 5 - hw * 0.6)];
    if (this.phase === 2) xs.push(clampX(xs[0] + (xs[0] > 0 ? -1 : 1) * (hw * 2 + 0.6), 5 - hw * 0.6));
    const zFar = this.homeZ + 5, zNear = c.z + c.r + 2.5;
    const dur = this.warnTime(spec.telegraph);
    const marks = xs.map((x) => T.lane(x - hw, x + hw, zNear, zFar, dur, { attack: 'slam' }));
    const zones = xs.map((x) => ({ kind: 'lane', x0: x - hw, x1: x + hw, zNear, zFar }));
    let t = 0, fired = false, hit = false;
    this.lockX = 0;
    return {
      update(dt) {
        t += dt;
        const p = self.pose;
        if (!fired) {
          p.rear = Math.min(1, t / (dur * 0.8));
          if (t >= dur) {
            fired = true; p.rear = 0; p.stomp = 1;
            for (const x of xs) self.effects.crest(x, hw, zFar, zNear, spec.travel);
            for (const zn of zones) self.dangerZones.push(zn);
            game.events.emit('boss:attack', { attack: 'slam', pos: { x: self.x, y: 0, z: self.z + 3 } });
            game.events.emit('fx:shake', { amount: 0.7 });
            if (self.fx) self.fx.slam(self.x, self.z + 3.5, 2.8);
          }
          return false;
        }
        const f = Math.min(1, (t - dur) / spec.travel);
        const z = zFar + (zNear - zFar) * f;
        // the crest hits the whole strip at once when it reaches the squad's front row
        if (!hit && z >= game.squad.leader.z - 1) { hit = true; for (const x of xs) self.killInBox(x, hw, zFar, zNear); }
        if (self.fx && Math.random() < 0.6) for (const x of xs) self.fx.dust(x + (Math.random() - 0.5) * hw * 2, z, 0);
        if (f >= 1) for (const zn of zones) self.dropZone(zn);
        if (f >= 1 && t >= dur + spec.travel + 0.35) { self.lockX = null; return true; }
        return false;
      },
      cancel() { for (const m of marks) T.cancel(m); for (const zn of zones) self.dropZone(zn); self.lockX = null; },
    };
  }

  onPhase2() {
    this.pose.roar = 1;
    if (this.fx) this.fx.sparkle(this.x, 4, this.z + 3, 0xff6a3a, 24, 2.5);
  }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model, p = this.pose;
    const dying = this.state === 'dying' || this.state === 'dead';
    p.stomp = Math.max(0, p.stomp - dt * 2.5);
    p.roar = Math.max(0, p.roar - dt * 0.9);
    p.scrape = Math.max(0, p.scrape - dt * 2);
    if (!this.attack && this.state !== 'enter') { p.lower = Math.max(0, p.lower - dt * 3); p.gallop = Math.max(0, p.gallop - dt * 3); p.rear = Math.max(0, p.rear - dt * 4); }
    // sidestepping into a charge lane trots the legs too
    const slide = this.lockX !== null && this.state === 'fight' ? Math.min(1, Math.abs(this.lockX - this.x)) * 0.6 : 0;
    const g = Math.max(p.gallop, slide);
    p.gait += dt * (4 + g * 14);
    // body: idle breathing, gallop bounce, rear-up pitch, stomp drop
    const breathe = Math.sin(t * 2) * 0.05;
    m.body.position.y = breathe + Math.abs(Math.sin(p.gait)) * 0.35 * g - p.stomp * 0.25 + p.rear * 0.5;
    m.body.rotation.x = -p.rear * 0.55 + p.stomp * 0.12 + Math.sin(p.gait * 2) * 0.04 * g + p.lower * 0.06;
    m.body.position.z = -p.rear * 1.2;
    m.root.rotation.y = p.yaw;
    // head: lowers for the charge, tosses when roaring, scrapes impatiently while warning
    m.head.rotation.x = p.lower * 0.45 - p.roar * 0.5 * Math.abs(Math.sin(t * 5)) + Math.sin(t * 1.5) * 0.04;
    m.head.rotation.y = Math.sin(t * 0.8) * 0.08 * (1 - p.lower);
    // legs: gallop cycle, rear-up, one front hoof scraping during the warning
    m.legs.forEach((l, i) => {
      const front = i < 2;
      let rx = Math.sin(p.gait + l.userData.phase) * 0.6 * g;
      if (front) rx += -p.rear * 0.9 + p.stomp * 0.3;
      else rx += p.rear * 0.35;
      if (i === 0 && p.scrape > 0 && g < 0.5) rx += Math.sin(t * 14) * 0.45 * p.scrape;
      l.rotation.x = rx;
    });
    // glow: amber -> red-hot in phase 2, flares while charging; hit flash on the steel
    this.glow.lerp(this.phase === 2 ? GLOW2 : GLOW1, Math.min(1, dt * 3));
    this.tint.lerp(this.phase === 2 ? TINT2 : TINT1, Math.min(1, dt * 3));
    const pulse = 0.8 + 0.2 * Math.sin(t * (this.phase === 2 ? 14 : 5)) + p.lower * 0.3;
    m.glowMat.color.copy(this.glow).multiplyScalar(pulse).lerp(WHITE, this.flash * 0.3);
    m.eyeGlow.material.color.copy(this.glow);
    m.eyeGlow.scale.setScalar(2.2 + p.lower * 1.6 + p.roar);
    for (const e of m.exhaust) {
      e.material.color.copy(this.glow);
      e.scale.setScalar(1.4 + Math.random() * 0.5 + g * 1.2 + (this.phase === 2 ? 0.8 : 0));
    }
    m.mat.color.copy(this.tint);
    const fl = this.flash;
    m.mat.emissive.setRGB(fl * 0.25, fl * 0.22, fl * 0.2);
    // death: sparks, shudder, topple onto its side and sink
    if (dying) {
      const f = Math.min(1, this.t / 1.55);
      const e = f * f;
      m.root.rotation.z = e * 1.45;
      m.root.position.y = this.y - e * 3.5;
      m.body.position.x = Math.sin(t * 60) * 0.2 * (1 - f);
      m.glowMat.color.setRGB(1, 1, 1).multiplyScalar(Math.random() < 0.5 ? 1 : 0.2);
      m.mat.emissive.setRGB(0.3 * (1 - f), 0.25 * (1 - f), 0.2 * (1 - f));
      if (this.fx && Math.random() < 0.35) this.fx.sparkle(this.x + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, this.z + Math.random() * 4, 0xffb43a, 4, 1.5);
    } else {
      m.root.rotation.z = 0;
      m.body.position.x = 0;
    }
  }
}
