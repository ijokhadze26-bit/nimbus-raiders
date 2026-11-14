// Squad: count, leader (Pip), phyllotaxis formation of instanced Raiders, pop-in, removal with death pops.
// Logic (update) is render-free so debug.simulate() is fast; sync() writes instance matrices once per frame.
import * as THREE from 'three';
import { FORMATION, MEMBER_CLAMP, MOVE } from '../config.js';
import { buildPip } from '../models/pip.js';
import { buildRaiderGeometry, buildRaiderGunGeometry, buildRaiderShadowGeometry, RAIDER_MUZZLE } from '../models/raider.js';
import { toonMaterial, toonGradient } from '../models/materials.js';
import { weaponForTier } from '../data/weapons.js';

const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const C = FORMATION.spacing * 0.525;     // phyllotaxis scale for ~spacing neighbor distance
const MAX_DYING = 64;
export const SHADOW_LAYER = 1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// unit slot offsets (precomputed)
const SLOT_X = new Float32Array(FORMATION.maxRendered);
const SLOT_Z = new Float32Array(FORMATION.maxRendered);
for (let i = 0; i < FORMATION.maxRendered; i++) {
  const r = C * Math.sqrt(i + 0.5), a = i * GA;
  SLOT_X[i] = Math.cos(a) * r;
  SLOT_Z[i] = Math.sin(a) * r;
}

export class Squad {
  init(game) {
    this.game = game;
    this.count = 1;
    this.leader = { x: 0, z: 0, vx: 0 };
    this.members = [];   // rendered raiders (excludes Pip), slot = index
    this.dying = [];
    this.free = [];
    this.time = 0;
    this.speed = 0;
    this.cheer = 0;
    this.runBlend = 1;

    this.pip = buildPip();
    game.scene.add(this.pip.root);

    const cap = FORMATION.maxRendered + MAX_DYING;
    this.raiderMat = toonMaterial();
    this.raiders = new THREE.InstancedMesh(buildRaiderGeometry(), this.raiderMat, cap);
    this.raiders.castShadow = false;
    this.raiders.frustumCulled = false;
    this.raiders.count = 0;
    this.gunMat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, color: '#ffd34d', emissive: '#ffd34d', emissiveIntensity: 0.25 });
    this.guns = new THREE.InstancedMesh(buildRaiderGunGeometry(), this.gunMat, cap);
    this.guns.instanceMatrix = this.raiders.instanceMatrix;
    this.guns.castShadow = false;
    this.guns.frustumCulled = false;
    this.guns.count = 0;
    // Shadow-only proxy on layer SHADOW_LAYER (the main camera never renders it).
    this.shadowProxy = new THREE.InstancedMesh(buildRaiderShadowGeometry(), new THREE.MeshBasicMaterial(), cap);
    this.shadowProxy.instanceMatrix = this.raiders.instanceMatrix;
    this.shadowProxy.castShadow = true;
    this.shadowProxy.frustumCulled = false;
    this.shadowProxy.count = 0;
    this.shadowProxy.layers.set(SHADOW_LAYER);
    game.scene.add(this.raiders, this.guns, this.shadowProxy);
    this.setGunColor(weaponForTier(1).color);
  }

  setGunColor(hex) {
    this.gunMat.color.set(hex);
    this.gunMat.emissive.set(hex);
    this.pip.gunMat.color.set(hex);
  }

  reset(count = 1, x = 0) {
    this.leader.x = x; this.leader.z = 0; this.leader.vx = 0;
    this.time = 0; this.cheer = 0;
    for (const m of this.members) this.free.push(m);
    for (const d of this.dying) this.free.push(d);
    this.members.length = 0;
    this.dying.length = 0;
    this.count = 0;
    this.setCount(Math.max(1, count), 'start', true);
    for (let i = 0; i < this.members.length; i++) { const m = this.members[i]; this.slotTarget(m, i); m.x = m.tx; m.z = m.tz; m.pop = 1; }
  }

  get rendered() { return 1 + this.members.length; }

  alloc() {
    return this.free.length ? this.free.pop() : { x: 0, z: 0, tx: 0, tz: 0, pop: 0, ph: 0, t: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, kind: 0 };
  }

  /** Sets the total count (gate/barrel results). Emits squad:change. */
  setCount(n, reason = 'gate', force = false) {
    n = Math.max(0, Math.min(FORMATION.cap, Math.round(n)));
    const delta = n - this.count;
    if (delta === 0 && !force) return 0;
    this.count = n;
    this.syncMembers(reason);
    this.game.events.emit('squad:change', { count: this.count, delta, reason, pos: this.leaderPos() });
    if (this.count === 0) this.game.onSquadEmpty(reason);
    return delta;
  }

  add(n, reason = 'gate') { return this.setCount(this.count + n, reason); }
  remove(n, reason = 'horde') { return this.setCount(this.count - n, reason); }

  /** Kills one specific rendered member (index into members) — e.g. enemy contact. */
  killMember(i, reason = 'horde') {
    if (i < 0 || i >= this.members.length) { this.remove(1, reason); return; }
    const m = this.members[i];
    for (let k = i; k < this.members.length - 1; k++) this.members[k] = this.members[k + 1];
    this.members.length--;
    this.startDeath(m, reason);
    this.count = Math.max(0, this.count - 1);
    this.syncMembers(reason);
    this.game.events.emit('squad:change', { count: this.count, delta: -1, reason, pos: { x: m.x, y: 0.5, z: m.z } });
    if (this.count === 0) this.game.onSquadEmpty(reason);
  }

  /** Brings rendered raiders in line with count (pop-ins at leader / deaths from the back). */
  syncMembers(reason) {
    const want = Math.min(this.count, FORMATION.maxRendered) - 1;
    while (this.members.length < want) {
      const m = this.alloc();
      const rng = this.game.rng;
      m.x = this.leader.x + (rng.next() - 0.5) * 0.3;
      m.z = this.leader.z + 0.3;
      m.pop = 0;
      m.ph = rng.next() * Math.PI * 2;
      this.members.push(m);
    }
    while (this.members.length > Math.max(0, want)) {
      const m = this.members.pop();
      this.startDeath(m, reason);
    }
  }

  startDeath(m, reason) {
    this.game.events.emit('squad:lost', { pos: { x: m.x, y: 0.5, z: m.z }, reason });
    if (this.dying.length >= MAX_DYING) { this.free.push(m); return; }
    m.t = 0;
    m.y = 0;
    m.vy = 3.2 + Math.random() * 1.5;
    m.vx = (Math.random() - 0.5) * 3;
    m.vz = 1.5 + Math.random() * 2;
    m.spin = (Math.random() - 0.5) * 12;
    m.kind = reason === 'gap' ? 1 : 0;
    this.dying.push(m);
  }

  leaderPos() { return { x: this.leader.x, y: 0, z: this.leader.z }; }

  slotTarget(m, i) {
    const n = this.members.length;
    const R = C * Math.sqrt(n + 0.5);
    const cx = this.leader.x, cz = this.leader.z + FORMATION.leaderGap + R * 0.85;
    let tx = cx + SLOT_X[i], tz = cz + SLOT_Z[i];
    const dx = tx - this.leader.x, dz = tz - this.leader.z;
    const d2 = dx * dx + dz * dz, cl = FORMATION.leaderClear;
    if (d2 < cl * cl) {
      const d = Math.sqrt(d2) || 0.001;
      tx = this.leader.x + (dx / d) * cl; tz = this.leader.z + (dz / d) * cl;
    }
    m.tx = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, tx));
    m.tz = tz;
  }

  /** Logic step. targetX from input/autopilot; forward = u/s forward speed. */
  update(dt, targetX, forward) {
    this.time += dt;
    const L = this.leader;
    const px = L.x;
    L.x += (targetX - L.x) * (1 - Math.exp(-MOVE.ease * dt));
    L.x = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, L.x));
    L.vx = dt > 0 ? (L.x - px) / dt : 0;
    this.speed = forward;
    L.z -= forward * dt;
    const k = 1 - Math.exp(-FORMATION.ease * dt);
    const ms = this.members;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      this.slotTarget(m, i);
      m.x += (m.tx - m.x) * k;
      m.z += (m.tz - m.z) * k - forward * dt * (1 - k);
      if (m.pop < 1) m.pop = Math.min(1, m.pop + dt / 0.32);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      d.x += d.vx * dt; d.z += (d.vz - forward) * dt;
      d.vy -= 14 * dt; d.y += d.vy * dt;
      const life = d.kind === 1 ? 1.2 : 0.55;
      if (d.t >= life) { this.dying[i] = this.dying[this.dying.length - 1]; this.dying.pop(); this.free.push(d); }
    }
  }

  /** Visual sync: Pip rig + raider instance matrices. */
  sync(dt, phase) {
    const t = this.time;
    const running = this.speed > 0.5 ? 1 : 0;
    this.runBlend += (running - this.runBlend) * Math.min(1, dt * 6);
    this.cheer += ((phase === 'won' ? 1 : 0) - this.cheer) * Math.min(1, dt * 4);
    const L = this.leader;
    this.pip.root.position.set(L.x, 0, L.z);
    this.pip.animate(t, Math.max(0.25, this.runBlend), L.vx, this.cheer);
    const arr = this.raiders.instanceMatrix.array;
    let n = 0;
    const rb = Math.max(0.3, this.runBlend);
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const ph = t * 12 + m.ph;
      const sn = Math.sin(ph);
      const bob = Math.abs(sn) * 0.1 * rb + (this.cheer > 0.01 ? Math.max(0, Math.sin(t * 8 + m.ph)) * 0.4 * this.cheer : 0);
      const p = m.pop;
      const sc = p < 1 ? popScale(p) : 1;
      _e.set(-0.16 * rb, (m.tx - m.x) * -0.25, sn * 0.12 * rb);
      _q.setFromEuler(_e);
      _m.compose(_p.set(m.x, bob, m.z), _q, _s.set(sc, sc * (1 - Math.abs(Math.cos(ph)) * 0.05 * rb), sc));
      _m.toArray(arr, n * 16);
      n++;
    }
    for (let i = 0; i < this.dying.length; i++) {
      const d = this.dying[i];
      const life = d.kind === 1 ? 1.2 : 0.55;
      const f = d.t / life;
      const sc = d.kind === 1 ? 1 - f * 0.6 : (f < 0.25 ? 1 + f * 1.2 : Math.max(0.01, 1.3 * (1 - (f - 0.25) / 0.75)));
      _e.set(d.spin * d.t, 0, d.spin * d.t * 0.6);
      _q.setFromEuler(_e);
      _m.compose(_p.set(d.x, Math.max(d.kind === 1 ? -20 : 0, d.y), d.z), _q, _s.set(sc, sc, sc));
      _m.toArray(arr, n * 16);
      n++;
    }
    this.raiders.count = n;
    this.guns.count = n;
    this.shadowProxy.count = n;
    this.raiders.instanceMatrix.needsUpdate = true;
  }

  /** Shooter muzzle position: i=0 -> Pip, i>=1 -> members[i-1]. Writes into out {x,y,z}. */
  muzzle(i, out) {
    if (i === 0 || this.members.length === 0) {
      out.x = this.leader.x + 0.32; out.y = 0.9; out.z = this.leader.z - 0.75;
    } else {
      const m = this.members[(i - 1) % this.members.length];
      out.x = m.x + RAIDER_MUZZLE.x; out.y = RAIDER_MUZZLE.y + 0.1; out.z = m.z + RAIDER_MUZZLE.z;
    }
    return out;
  }

  /** x-extent of the blob (for autopilot / HUD). */
  bounds(out) {
    let a = this.leader.x, b = this.leader.x;
    for (const m of this.members) { if (m.x < a) a = m.x; if (m.x > b) b = m.x; }
    out.min = a; out.max = b;
    return out;
  }

  dispose() {}
}

function popScale(p) {
  // 0 -> 1.15 -> 1
  if (p < 0.6) { const u = p / 0.6; return 1.15 * (1 - (1 - u) * (1 - u)); }
  const u = (p - 0.6) / 0.4;
  return 1.15 - 0.15 * u;
}
