// Grawlstone boss: GROUND SLAM (red circles at/near the squad, boulders crash down on them, shockwave ring)
// and in phase 2 BOULDER ROLL (striped lane warning, a huge boulder rolls down it). Cracks go red-hot below 50%.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import { buildGrawlstone, boulderGeometry } from '../../models/bosses/grawlstone.js';
import { toonMaterial } from '../../models/materials.js';

const FALL_TIME = 0.45;
const RING_TIME = 0.42;
const AMBER = new THREE.Color('#ffb43a'), HOT = new THREE.Color('#ff3b2b'), WHITE = new THREE.Color('#ffffff');
const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);

export class Grawlstone extends BaseBoss {
  buildModel() {
    const m = buildGrawlstone();
    this.boulderMat = toonMaterial();
    this.boulders = [];   // { mesh, active, x, y, z, vy, r, spin, mode }
    this.rings = [];      // { mesh, t, r, active }
    this.pose = { raise: 0, slam: 0, lean: 0, roar: 0 };
    this.glowColor = AMBER.clone();
    return m;
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    if (id === 'roll') return this.rollAttack(spec);
    return this.slamAttack(spec);
  }

  /** Phase 1: one circle on the squad. Phase 2: a follow-up circle lands where the squad fled to. */
  slamAttack(spec) {
    const game = this.game;
    const p2 = this.phase === 2;
    const waves = p2 ? spec.count2 : spec.count;
    const r = p2 ? spec.radius2 : spec.radius;
    const dur = Math.max(0.9, spec.telegraph - (p2 ? 0.1 : 0) - 0.03 * (this.tier - 1));
    const gap = spec.gap || 0.6;
    const rng = game.rng;
    const slams = []; // { at, mark, boulder, hit }
    let t = 0;
    const self = this;
    const place = () => {
      const c = self.squadCenter();
      const mark = game.telegraph.circle(clampX(c.x + rng.range(-0.5, 0.5)), c.z + rng.range(-0.8, 0.4), r, dur, { attack: 'slam' });
      slams.push({ start: t, mark, boulder: null, hit: false });
    };
    place();
    return {
      update(dt) {
        t += dt;
        if (slams.length < waves && t >= slams.length * gap) place();
        let pending = false;
        for (const s of slams) {
          const lt = t - s.start;
          if (!s.boulder && lt >= dur - FALL_TIME) s.boulder = self.spawnBoulder(s.mark.x, s.mark.z, r * 0.62, 'fall');
          if (!s.hit && lt >= dur) {
            s.hit = true;
            self.pose.slam = 1;
            const h = s.mark;
            const kills = self.killInCircle(h.x, h.z, h.r);
            self.spawnRing(h.x, h.z, h.r * 1.5);
            game.gates.burst(h.x, 0.1, h.z, h.r * 1.4, 0.8, '#a39c8f', 9);
            game.events.emit('boss:attack', { attack: 'slam', pos: { x: h.x, y: 0, z: h.z } });
            game.events.emit('fx:shake', { amount: kills > 0 ? 0.75 : 0.55 });
          }
          if (!s.hit) pending = true;
        }
        const last = slams[slams.length - 1];
        self.pose.raise = pending ? Math.min(1, (t - last.start) / (dur * 0.7)) : 0;
        return slams.length >= waves && !pending && t - last.start >= dur + 0.5;
      },
      cancel() { for (const s of slams) game.telegraph.cancel(s.mark); },
    };
  }

  rollAttack(spec) {
    const game = this.game;
    const c = this.squadCenter();
    const cx = clampX(c.x, 3.4);
    const hw = spec.halfW;
    const zNear = c.z + c.r + 1.5, zFar = this.z + 2.5;
    const dur = Math.max(0.9, spec.telegraph - 0.03 * (this.tier - 1));
    const mark = game.telegraph.lane(cx - hw, cx + hw, zNear, zFar, dur, { attack: 'roll' });
    const launch = spec.launch;
    const speed = (c.z - zFar) / Math.max(0.3, dur - launch); // arrives at the blob center as the warning ends
    let t = 0, boulder = null, lastZ = zFar;
    const self = this;
    return {
      update(dt) {
        t += dt;
        self.pose.lean = Math.min(1, t / launch);
        if (!boulder && t >= launch) {
          boulder = self.spawnBoulder(cx, zFar, hw * 0.95, 'roll');
          boulder.vz = speed;
          game.events.emit('boss:attack', { attack: 'roll', pos: { x: cx, y: 0, z: zFar } });
        }
        if (boulder && boulder.active) {
          const z = boulder.z;
          if (z > lastZ) self.killInBox(cx, hw, lastZ - boulder.r * 0.6, z + boulder.r * 0.6);
          lastZ = z;
          if (z > zNear + 6) boulder.active = false;
        }
        if (t >= launch) self.pose.lean = Math.max(0, 1 - (t - launch) * 3);
        return boulder && !boulder.active;
      },
      cancel() { game.telegraph.cancel(mark); if (boulder) boulder.active = false; },
    };
  }

  spawnBoulder(x, z, r, mode) {
    let b = this.boulders.find((o) => !o.active);
    if (!b) {
      const mesh = new THREE.Mesh(boulderGeometry(), this.boulderMat);
      mesh.castShadow = true;
      b = { mesh };
      this.boulders.push(b);
    }
    this.game.scene.add(b.mesh);
    Object.assign(b, { active: true, x, z, r, mode, t: 0, y: mode === 'fall' ? 14 : r, vy: 0, vz: 0, spin: 0 });
    b.mesh.visible = true;
    return b;
  }

  spawnRing(x, z, r) {
    let g = this.rings.find((o) => !o.active);
    if (!g) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, depthWrite: false, toneMapped: false }));
      mesh.renderOrder = 3;
      g = { mesh };
      this.rings.push(g);
    }
    this.game.scene.add(g.mesh);
    Object.assign(g, { active: true, x, z, r, t: 0 });
  }

  // logic for boulders/rings happens in update so kills stay deterministic
  update(dt) {
    super.update(dt);
    for (const b of this.boulders) {
      if (!b.active) continue;
      b.t += dt;
      if (b.mode === 'fall') {
        const f = Math.min(1, b.t / FALL_TIME);
        b.y = b.r + (14 - b.r) * (1 - f * f);
        if (b.t > FALL_TIME + 0.35) b.active = false;
      } else {
        b.z += b.vz * dt;
        b.spin += (b.vz / b.r) * dt;
      }
    }
    for (const g of this.rings) if (g.active) { g.t += dt; if (g.t > RING_TIME) g.active = false; }
  }

  onPhase2() { this.game.gates.burst(this.x, 3, this.z + 1.8, 4, 4, '#ff6a3a', 18); }

  onDeath() {
    for (const b of this.boulders) b.active = false;
  }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model;
    const p = this.pose;
    p.slam = Math.max(0, p.slam - dt * 2.2);
    const intro = this.state === 'intro' ? Math.sin(Math.min(1, this.t / 1.25) * Math.PI) : 0;
    p.roar += (intro - p.roar) * Math.min(1, dt * 8);
    const breathe = Math.sin(t * 1.6);
    // body bob + lean
    m.body.position.y = breathe * 0.06 - p.slam * 0.35;
    m.body.rotation.x = p.lean * -0.25 + p.slam * 0.18 - p.raise * 0.1;
    m.body.rotation.z = Math.sin(t * 0.8) * 0.03;
    m.head.rotation.x = -p.roar * 0.35 + p.slam * 0.2;
    m.head.rotation.y = Math.sin(t * 0.6) * 0.12;
    // arms: hang (0) -> raised overhead (-2.7) -> slammed forward (-1.15)
    for (let i = 0; i < 2; i++) {
      const arm = m.arms[i];
      const side = i === 0 ? -1 : 1;
      const raise = Math.max(p.raise, p.roar * 0.8);
      let rx = -0.12 + breathe * 0.04 - raise * 2.6;
      rx = rx * (1 - p.slam) + -1.15 * p.slam;
      if (p.lean > 0 && i === 1) rx = rx * (1 - p.lean) + -1.6 * p.lean;
      arm.rotation.x = rx;
      arm.rotation.z = side * (0.12 + raise * 0.22 + p.roar * 0.3);
    }
    // glow colour: amber -> red-hot in phase 2; flash white when hit; flicker
    const target = this.phase === 2 ? HOT : AMBER;
    this.glowColor.lerp(target, Math.min(1, dt * 3));
    const fl = this.flash;
    const pulse = this.phase === 2 ? 0.75 + 0.25 * Math.sin(t * 12) : 0.9 + 0.1 * Math.sin(t * 5);
    m.glowMat.color.copy(this.glowColor).multiplyScalar(pulse).lerp(WHITE, fl * 0.3);
    m.core.material.color.copy(m.glowMat.color);
    m.core.material.opacity = 0.55 + 0.3 * pulse;
    m.mat.emissive.setRGB(fl * 0.16, fl * 0.14, fl * 0.12);
    if (this.phase === 2) m.mat.color.setRGB(1, 0.88, 0.82); else m.mat.color.setRGB(1, 1, 1);
    // death: shudder, flare, crumble into the clouds
    if (this.state === 'dying' || this.state === 'dead') {
      const f = Math.min(1, this.t / 1.55);
      m.body.position.x = Math.sin(t * 60) * 0.18 * (1 - f);
      m.root.position.y = this.y - f * f * 7;
      m.root.rotation.x = -f * 0.5;
      m.root.rotation.z = f * 0.25;
      m.glowMat.color.copy(WHITE);
      m.mat.emissive.setRGB(0.5 * (1 - f), 0.45 * (1 - f), 0.4 * (1 - f));
      if (Math.random() < 0.25) this.game.gates.burst(this.x + (Math.random() - 0.5) * 5, 1 + Math.random() * 5, this.z + 1.6, 1.5, 1.5, '#9a958a', 6);
      if (this.game.horde && Math.random() < 0.12) this.game.horde.view.blast(this.x + (Math.random() - 0.5) * 5, this.z + 1.8, 1.4 + Math.random());
    } else {
      m.root.rotation.set(0, 0, 0);
    }
    // boulders + rings
    for (const b of this.boulders) {
      b.mesh.visible = b.active;
      if (!b.active) continue;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.setScalar(b.r);
      if (b.mode === 'roll') b.mesh.rotation.set(b.spin, 0, 0); else b.mesh.rotation.set(b.t * 3, b.t * 2, 0);
    }
    for (const g of this.rings) {
      g.mesh.visible = g.active;
      if (!g.active) continue;
      const f = g.t / RING_TIME;
      g.mesh.position.set(g.x, 0.08, g.z);
      g.mesh.scale.setScalar(g.r * (0.35 + 0.65 * (1 - (1 - f) * (1 - f))));
      g.mesh.material.opacity = 0.9 * (1 - f);
    }
  }

  disposeExtra() {
    for (const b of this.boulders) this.game.scene.remove(b.mesh);
    for (const g of this.rings) this.game.scene.remove(g.mesh);
  }
}

function clampX(x, lim = 4.2) { return Math.max(-lim, Math.min(lim, x)); }
