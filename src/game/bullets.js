// Bullets: one InstancedMesh per registered style (key -> index), pooled bullet objects, swept collision along
// z against a target registry. Other systems register with addTargetSystem({ kind, bit, priority, sweep, hit }):
//   sweep(bullet, x, zHi, zLo) -> nearest target object (must expose .z) with z in [zLo, zHi] not yet hit, or null
//   hit(target, bullet) -> true (consumed) | false (pierce spent) | 'carry' (bundled shots left, keep flying)
// A bullet only sweeps systems whose `bit` is in its `mask` (HIT in config.js). Its owner (a weapon
// behaviour, see weapons/base.js) may override each result in onHit(b, kind, target, res) and returns
// 'bounce' to keep the bullet on a new heading (vx/vz rewritten); onLand(b) fires when a lobbed (air)
// bullet comes down, onExpire(b) at the end of its range. Behaviours set b.dead = true to drop a bullet.
// Styles: registerStyle(key, geometry) at init (all weapons register theirs at boot, hidden until used);
// setStyleGeometry(idx, geo) swaps a style's look (Mk changes; the caller owns and caches geometries). On Low,
// sync() draws geo.userData.low when a geometry carries one (a lighter look; drawing only).
import * as THREE from 'three';
import { BULLETS, HIT } from '../config.js';
import { HELPER_SHOTS } from '../data/weapons.js';
import { part, merge, G } from '../models/util.js';
import { XF, writeXfYawRoll, markInstances } from '../core/pool.js';

const GROUND_Y = 0.55;
// tail cone pointing back (+Z) from the bullet center
const tail = (r, len, color, a, z0 = 0) => part(G.cone(r, len, 5), color, { r: [Math.PI / 2, 0, 0], p: [0, 0, z0 + len / 2], a });

/** Helper shot looks (drone laser, turret shell): unchanged from the shipped game. */
export function helperShotGeometry(w) {
  const st = w.style, L = st.length, r = st.radius;
  const body = new THREE.Color(w.color), core = new THREE.Color(st.core);
  const halo = new THREE.Color(w.color).offsetHSL(0, 0.05, 0.05), trail = new THREE.Color(st.trail || w.color);
  const along = [Math.PI / 2, 0, 0];
  if (st.shape === 'shell') {
    return merge([
      tail(r * 1.3, 1.6, trail, 0.4, r * 0.6),
      part(G.sphere(r * 1.5, 6, 4), halo, { a: 0.35 }),
      part(G.capsule(r, r * 1.6, 1, 6), body, { r: along, a: 1 }),
      part(G.sphere(r * 0.55, 4, 3), core, { a: 1, p: [0, 0, -r * 0.9] }),
    ]);
  }
  return merge([ // thin laser
    part(G.cyl(r * 2.4, r * 2.4, L, 6), halo, { r: along, a: 0.35 }),
    part(G.cyl(r * 1.2, r * 1.2, L * 1.02, 5), body, { r: along, a: 1, bright: 1.1 }),
    part(G.cyl(r * 0.5, r * 0.5, L * 1.03, 4), core, { r: along, a: 1 }),
  ]);
}

export class Bullets {
  init(game) {
    this.game = game;
    this.systems = [];
    this.active = [];
    this.free = [];
    this.meshes = [];
    this.keys = [];
    this.byKey = new Map();
    this.counts = new Int32Array(64);
    this.keep = new Float32Array(64);
    this.lodSeq = 0;
    this.hitPos = { x: 0, y: 0, z: 0 };
    for (const w of HELPER_SHOTS) this.registerStyle(w.id, helperShotGeometry(w));
  }

  /** Registers (or returns the existing) style `key`; returns its index. Call at init only (no allocation later). */
  registerStyle(key, geometry, { cap = BULLETS.capacityPerStyle } = {}) {
    if (this.byKey.has(key)) return this.byKey.get(key);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geometry, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = 6;
    mesh.userData.cap = cap;
    mesh.userData.hi = geometry;
    this.game.scene.add(mesh);
    const idx = this.meshes.length;
    this.meshes.push(mesh);
    this.keys.push(key);
    this.byKey.set(key, idx);
    if (this.counts.length <= idx) { const c = new Int32Array(this.counts.length * 2); c.set(this.counts); this.counts = c; this.keep = new Float32Array(c.length); }
    return idx;
  }

  /** Style index of a key (-1 when unknown). */
  styleIndex(key) { return this.byKey.has(key) ? this.byKey.get(key) : -1; }

  /** Swaps the geometry of a style (Mk changes). The caller owns the geometries (nothing is disposed here). */
  setStyleGeometry(idx, geometry) {
    const mesh = this.meshes[idx];
    if (!mesh || !geometry) return;
    mesh.userData.hi = geometry; // on Low, sync() draws its Low look (geometry.userData.low) instead
    const low = this.game.engine && this.game.engine.quality === 'low';
    mesh.geometry = (low && geometry.userData.low) || geometry;
  }

  addTargetSystem(sys) {
    this.systems.push(sys);
    this.systems.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return () => { const i = this.systems.indexOf(sys); if (i >= 0) this.systems.splice(i, 1); };
  }

  reset() {
    for (const b of this.active) this.free.push(b);
    this.active.length = 0;
  }

  get count() { return this.active.length; }

  /**
   * styleIdx from registerStyle (-1 = simulated but never drawn). unit = damage of one real shot. Every
   * per-bullet field is reset here (pooled objects never carry an old shot's state).
   */
  spawn(styleIdx, x, y, z, vx, vz, dmg, pierce, unit = dmg, range = BULLETS.range) {
    if (this.active.length >= BULLETS.maxActive) return null;
    const b = this.free.length ? this.free.pop() : newBullet();
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vz = vz; b.vy = 0; b.dmg = dmg; b.unit = unit; b.pierce = pierce; b.range = range;
    b.style = styleIdx; b.dist = 0; b.nh = 0; b.ang = Math.atan2(-vx, -vz);
    b.owner = null; b.el = 'neutral'; b.mask = HIT.ALL; b.cause = null;
    b.g = 0; b.air = false; b.bounces = 0; b.gen = 0;
    b.sx = 1; b.sy = 1; b.sz = 1; b.spin = 0; b.roll = 0;
    b.bdmg = 0; b.gw = 0; b.show = true; b.t = 0; b.data = 0; b.dead = false; b.z0 = z;
    b.lod = this.lodSeq = (this.lodSeq + 0.6180339887) % 1; // drawing only (Low thinning in sync); never simulated
    this.active.push(b);
    return b;
  }

  /** Helper for target systems: true if this bullet already hit `t` (pierce). */
  static hasHit(b, t) {
    for (let i = 0; i < b.nh; i++) if (b.hits[i] === t) return true;
    return false;
  }

  update(dt) {
    const list = this.active;
    const sys = this.systems;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      let z0 = b.z;
      b.t += dt;
      if (b.g) b.vy -= b.g * dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (b.spin) b.roll += b.spin * dt;
      if (b.vy) {
        b.y += b.vy * dt;
        if (!b.air && b.y < GROUND_Y) { b.y = GROUND_Y; b.vy = 0; }
      }
      if (b.air && b.y <= GROUND_Y) {
        b.air = false; b.y = GROUND_Y; b.vy = 0;
        if (b.owner) b.owner.onLand(b);
      }
      const step = Math.hypot(b.vx * dt, b.vz * dt);
      b.dist += step;
      const z1 = b.z;
      let dead = b.dead;
      if (!dead && b.dist > b.range) { dead = true; if (b.owner) b.owner.onExpire(b); }
      // swept collision: repeatedly take the nearest hit along travel (largest z), pierce as allowed
      for (let guard = 0; !dead && !b.air && guard < 8; guard++) {
        let best = null, bestSys = null, bestZ = -Infinity;
        const hi = z0 > z1 ? z0 : z1, lo = z0 > z1 ? z1 : z0;
        for (let s = 0; s < sys.length; s++) {
          const bit = sys[s].bit || 0;
          if (bit && !(bit & b.mask)) continue;
          const t = sys[s].sweep(b, b.x, hi, lo);
          if (t && t.z > bestZ) { best = t; bestSys = sys[s]; bestZ = t.z; }
        }
        if (!best) break;
        let res = bestSys.hit(best, b);
        if (b.owner) res = b.owner.onHit(b, bestSys.kind, best, res);
        if (b.dead) { dead = true; break; }
        if (res === 'carry') { // bundled shots left over: keep flying without spending pierce
          if (b.nh < b.hits.length) b.hits[b.nh++] = best;
          z0 = bestZ;
          continue;
        }
        if (res === 'bounce') { // new heading (owner rewrote vx/vz): restart from the hit point next step
          if (b.nh < b.hits.length) b.hits[b.nh++] = best;
          b.z = bestZ; b.z0 = bestZ;
          b.ang = Math.atan2(-b.vx, -b.vz);
          break;
        }
        if (res === true || b.pierce <= 0) { dead = true; break; }
        b.pierce--;
        if (b.nh < b.hits.length) b.hits[b.nh++] = best;
        z0 = bestZ;
      }
      if (dead) {
        list[i] = list[list.length - 1];
        list.pop();
        this.free.push(b);
      }
    }
  }

  sync() {
    const counts = this.counts;
    counts.fill(0);
    const list = this.active;
    const meshes = this.meshes;
    // low quality: draw only the volleys flagged `show` (~budgetLow/budgetHigh), and of those only the share
    // lowKeep of the style's geometry (big translucent styles); all bullets still simulate
    const low = this.game.engine && this.game.engine.quality === 'low';
    const keep = this.keep;
    for (let s = 0; s < meshes.length; s++) keep[s] = low ? (meshes[s].userData.hi.userData.lowKeep || 1) : 1;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.style < 0 || (low && (!b.show || b.lod >= keep[b.style]))) continue;
      const mesh = meshes[b.style];
      const n = counts[b.style]++;
      if (n >= mesh.userData.cap) continue;
      // grow-in over the first 0.6u so bullets don't pop out of the guns
      const g = b.dist < 0.6 ? 0.4 + b.dist : 1;
      XF[0] = b.x; XF[1] = b.y; XF[2] = b.z; XF[3] = b.ang; XF[4] = b.roll; XF[5] = b.sx * g; XF[6] = b.sy * g; XF[7] = b.sz * g;
      writeXfYawRoll(mesh.instanceMatrix.array, n);
    }
    for (let s = 0; s < meshes.length; s++) {
      const mesh = meshes[s], hi = mesh.userData.hi;
      const geo = (low && hi.userData.low) || hi;
      if (mesh.geometry !== geo) mesh.geometry = geo;
      mesh.count = Math.min(counts[s], mesh.userData.cap);
      mesh.visible = mesh.count > 0;
      if (mesh.visible) markInstances(mesh.instanceMatrix, mesh.count);
    }
  }

  dispose() {}
}

function newBullet() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dmg: 1, unit: 1, pierce: 0, style: 0, dist: 0, range: 60, nh: 0, ang: 0,
    hits: [null, null, null, null, null, null, null, null],
    owner: null, el: 'neutral', mask: HIT.ALL, cause: null, g: 0, air: false, bounces: 0, gen: 0,
    sx: 1, sy: 1, sz: 1, spin: 0, roll: 0, bdmg: 0, gw: 0, show: true, t: 0, data: 0, dead: false, z0: 0, lod: 0,
  };
}

export const hasHit = Bullets.hasHit;
