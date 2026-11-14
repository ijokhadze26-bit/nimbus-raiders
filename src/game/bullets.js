// Bullets: one InstancedMesh per weapon style, pooled objects, swept collision along z against a
// target registry. Other systems register with addTargetSystem({ kind, priority, sweep, hit }):
//   sweep(bullet, x, z0, z1) -> nearest target object (must expose .z) with z in [z1, z0] not yet hit, or null
//   hit(target, bullet) -> true if the bullet is consumed (otherwise pierce is spent)
import * as THREE from 'three';
import { BULLETS } from '../config.js';
import { WEAPONS, HELPER_SHOTS } from '../data/weapons.js';
import { part, merge, G } from '../models/util.js';
import { writeYawMatrix, markInstances } from '../core/pool.js';
import { tierLook, isPrism, prismColor } from './skins.js';

// tail cone pointing back (+Z) from the bullet center
const tail = (r, len, color, a, z0 = 0) => part(G.cone(r, len, 5), color, { r: [Math.PI / 2, 0, 0], p: [0, 0, z0 + len / 2], a });

function styleGeometry(w) {
  const st = w.style, L = st.length, r = st.radius;
  // solid saturated body + soft halo + small white-hot core: reads on the bright road and on the sky
  const body = new THREE.Color(w.color);
  const core = new THREE.Color(st.core);
  const halo = new THREE.Color(w.color).offsetHSL(0, 0.05, 0.05);
  const trail = new THREE.Color(st.trail || w.color);
  const along = [Math.PI / 2, 0, 0];
  // Low segment counts on purpose: ~200 bullets are alive at the visual budget, all alpha-blended,
  // so each style stays near 80 triangles (Nova ~130); at bullet size the facets don't read.
  switch (st.shape) {
    case 'bolt': // short fat pistol bolt
      return merge([
        part(G.capsule(r * 1.55, L * 1.05, 1, 5), halo, { r: along, a: 0.35 }),
        part(G.capsule(r, L, 1, 5), body, { r: along, a: 1, bright: 1.1 }),
        part(G.capsule(r * 0.45, L * 0.75, 1, 3), core, { r: along, a: 1, p: [0, r * 0.3, -L * 0.1] }),
      ]);
    case 'tracer': // rifle tracer with a long fading streak
      return merge([
        tail(r * 1.6, L * 1.6, trail, 0.3, L * 0.3),
        part(G.capsule(r * 1.7, L, 1, 5), halo, { r: along, a: 0.3 }),
        part(G.capsule(r, L * 0.95, 1, 5), body, { r: along, a: 1, bright: 1.1 }),
        part(G.sphere(r * 1.6, 4, 2), core, { p: [0, 0, -L * 0.5], a: 1 }),
      ]);
    case 'laser': // thin, very long rapid laser
      return merge([
        part(G.cyl(r * 2.4, r * 2.4, L, 6), halo, { r: along, a: 0.35 }),
        part(G.cyl(r * 1.2, r * 1.2, L * 1.02, 5), body, { r: along, a: 1, bright: 1.1 }),
        part(G.cyl(r * 0.5, r * 0.5, L * 1.03, 4), core, { r: along, a: 1 }),
      ]);
    case 'beam': // thick glowing beam with a wide afterglow
      return merge([
        tail(r * 2.2, L * 1.3, trail, 0.22, L * 0.35),
        part(G.capsule(r * 1.9, L, 1, 5), halo, { r: along, a: 0.35 }),
        part(G.capsule(r, L, 1, 5), body, { r: along, a: 1 }),
        part(G.capsule(r * 0.45, L, 1, 3), core, { r: along, a: 1 }),
      ]);
    case 'orb': // plasma orb with a short comet tail (fired as a 3-way fan)
      return merge([
        tail(r * 1.1, r * 5, trail, 0.35, r * 0.4),
        part(G.sphere(r * 1.6, 6, 4), halo, { a: 0.35, s: [1, 1, 1.3] }),
        part(G.sphere(r, 6, 4), body, { a: 1 }),
        part(G.sphere(r * 0.5, 4, 3), core, { a: 1, p: [0, r * 0.3, 0] }),
      ]);
    case 'shell': // turret cannon shell
      return merge([
        tail(r * 1.3, 1.6, trail, 0.4, r * 0.6),
        part(G.sphere(r * 1.5, 6, 4), halo, { a: 0.35 }),
        part(G.capsule(r, r * 1.6, 1, 6), body, { r: along, a: 1 }),
        part(G.sphere(r * 0.55, 4, 3), core, { a: 1, p: [0, 0, -r * 0.9] }),
      ]);
    case 'nova':
    default: // big piercing nova orb with a long golden trail
      return merge([
        part(G.cone(r * 1.2, 2.6, 6), trail, { r: [-Math.PI / 2, 0, 0], p: [0, 0, 1.3], a: 0.55 }),
        part(G.sphere(r * 1.7, 6, 4), halo, { a: 0.4 }),
        part(G.sphere(r, 8, 5), body, { a: 1 }),
        part(G.sphere(r * 0.6, 5, 3), core, { a: 1 }),
      ]);
  }
}

export class Bullets {
  init(game) {
    this.game = game;
    this.systems = [];
    this.active = [];
    this.free = [];
    this.meshes = [];
    const styles = WEAPONS.concat(HELPER_SHOTS);
    this.counts = new Int32Array(styles.length);
    const cap = BULLETS.capacityPerStyle;
    for (const w of styles) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
      const mesh = new THREE.InstancedMesh(styleGeometry(w), mat, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.renderOrder = 6;
      game.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.hitPos = { x: 0, y: 0, z: 0 };
    this.skin = 'factory';
    this.prism = false;
  }

  /** Weapon skin: rebuilds the six weapon-tier bullet geometries in the skin colors (helpers keep theirs). */
  setSkin(skinId = 'factory') {
    if (skinId === this.skin) return;
    this.skin = skinId;
    this.prism = isPrism(skinId);
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      // prism: white geometry, tinted per frame by the material color (see sync)
      const look = this.prism ? { color: '#ffffff', core: '#ffffff', trail: '#ffffff' } : tierLook(skinId, w.tier);
      const mesh = this.meshes[i];
      const old = mesh.geometry;
      mesh.geometry = styleGeometry({ ...w, color: look.color, style: { ...w.style, core: look.core, trail: look.trail } });
      old.dispose();
      if (!this.prism) mesh.material.color.setRGB(1, 1, 1);
    }
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

  /** tier 1..6 = weapon styles, 7 = drone laser, 8 = turret shell. unit = damage of one real shot. */
  spawn(tier, x, y, z, vx, vz, dmg, pierce, unit = dmg, range = BULLETS.range) {
    if (this.active.length >= BULLETS.capacityPerStyle * 2) return null;
    const b = this.free.length ? this.free.pop() : { x: 0, y: 0, z: 0, vx: 0, vz: 0, dmg: 1, unit: 1, pierce: 0, style: 0, dist: 0, range: 60, nh: 0, hits: [null, null, null, null, null, null, null, null] };
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vz = vz; b.dmg = dmg; b.unit = unit; b.pierce = pierce; b.range = range; b.vy = 0;
    b.style = tier - 1; b.dist = 0; b.nh = 0; b.ang = Math.atan2(-vx, -vz);
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
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (b.vy) { b.y += b.vy * dt; if (b.y < 0.55) { b.y = 0.55; b.vy = 0; } }
      const step = Math.hypot(b.vx * dt, b.vz * dt);
      b.dist += step;
      const z1 = b.z;
      let dead = b.dist > b.range;
      // swept collision: repeatedly take the nearest hit along travel (largest z), pierce as allowed
      for (let guard = 0; !dead && guard < 8; guard++) {
        let best = null, bestSys = null, bestZ = -Infinity;
        for (let s = 0; s < sys.length; s++) {
          const t = sys[s].sweep(b, b.x, z0, z1);
          if (t && t.z > bestZ) { best = t; bestSys = sys[s]; bestZ = t.z; }
        }
        if (!best) break;
        const res = bestSys.hit(best, b);
        if (res === 'carry') { // bundled shots left over: keep flying without spending pierce
          if (b.nh < b.hits.length) b.hits[b.nh++] = best;
          z0 = bestZ;
          continue;
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
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const mesh = this.meshes[b.style];
      const n = counts[b.style]++;
      if (n >= BULLETS.capacityPerStyle) continue;
      // grow-in over the first 0.6u so bullets don't pop out of the guns
      const g = b.dist < 0.6 ? 0.4 + b.dist : 1;
      writeYawMatrix(mesh.instanceMatrix.array, n, b.x, b.y, b.z, b.ang, g, g, g);
    }
    for (let s = 0; s < this.meshes.length; s++) {
      const mesh = this.meshes[s];
      mesh.count = Math.min(counts[s], BULLETS.capacityPerStyle);
      mesh.visible = mesh.count > 0;
      if (mesh.visible) markInstances(mesh.instanceMatrix, mesh.count);
    }
    if (this.prism) for (let s = 0; s < WEAPONS.length; s++) prismColor(this.meshes[s].material.color, this.game.time, s + 1);
  }

  dispose() {}
}

export const hasHit = Bullets.hasHit;
