// Shared rig kit for the five update-2 heroes (SPEC2 §3.7). Every rig is built from merged, vertex-coloured
// parts on ONE toon material (+ one gun material, + optional additive glow / flames), so a hero costs at most
// 12 draw objects and never adds a shader program (toonMaterial, additive MeshBasic and Sprite only).
//   kit(lod)          -> { mat, meshes, low, seg(n), mk(geo, parent, shadow=true), group(parent, x, y, z) }
//   gunFor(kit, arm, socketY)  -> { gun, gunMat, ownGeo } the leader gun (geometry swapped by leader.js)
//   stripes(geo, fn)  re-colours a geometry per vertex: fn(x, y, z) -> '#hex' | THREE.Color
//   gradient(geo, axis, c0, c1)  vertex colour ramp along an axis (bottom c0 -> top c1)
//   finish(rig, kit, extra)    fills the contract fields (muzzle from the real pose, abilityDuration, dispose)
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial, glowTexture } from '../materials.js';
import { heroDef } from '../../data/heroes.js';

export { part, merge, G };
export const BASE_SCALE = 1.25;   // Pip's world scale; a hero's scale = BASE_SCALE * its height factor
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function kit(lod = 'high') {
  const low = lod === 'low';
  const mat = toonMaterial();
  const meshes = [];
  const k = {
    mat, meshes, low,
    /** Segment count for the LOD (Low keeps ~60%). */
    seg(n) { return low ? Math.max(4, Math.round(n * 0.6)) : n; },
    mk(geo, parent, shadow = true) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      parent.add(m); meshes.push(m);
      return m;
    },
    group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; },
  };
  return k;
}

/** Sphere / capsule / cylinder with LOD-aware segments. */
export function S(k, r, w = 12, h = 9) { return G.sphere(r, k.seg(w), k.seg(h)); }
export function CAP(k, r, len, rad = 8) { return G.capsule(r, len, 2, k.seg(rad)); }
export function CYL(k, rt, rb, h, rad = 10, open = false) { return G.cyl(rt, rb, h, k.seg(rad), open); }

/**
 * Leader gun on the right arm. socketY = local y of the hand (the gun geometry from models/weapons/guns.js
 * already sits 0.22 below its origin, tuned for Pip's 0.23 arm), so arms of other lengths shift the socket.
 */
export function gunFor(k, arm, handY = -0.23) {
  const socket = new THREE.Group();
  socket.position.set(0, handY + 0.23, 0);
  arm.add(socket);
  const gunMat = new THREE.MeshToonMaterial({ gradientMap: k.mat.gradientMap, color: '#ffd34d', vertexColors: true });
  const ownGeo = merge([
    part(G.box(0.1, 0.32, 0.12), '#ffffff', { p: [0, -0.3, -0.02] }),
    part(G.box(0.06, 0.16, 0.06), '#ffffff', { p: [0, -0.5, -0.02], bright: 1.2 }),
    part(G.box(0.07, 0.08, 0.1), '#4b5672', { p: [0, -0.24, 0.07] }),
  ]);
  const gun = new THREE.Mesh(ownGeo, gunMat);
  gun.castShadow = true;
  socket.add(gun);
  return { gun, gunMat, ownGeo, socket };
}

/** Per-vertex recolour: fn(x, y, z) returns a colour for that vertex (positions in the geometry's space). */
export function stripes(geo, fn) {
  const pos = geo.attributes.position, n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (c && c.isColor) _c.copy(c); else _c.set(c);
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Vertex colour ramp along an axis: lowest vertex c0 -> highest c1 (k = brightness). */
export function gradient(geo, axis, c0, c1, k = 1) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, lo = bb.min[axis], hi = bb.max[axis];
  const a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
  return stripes(geo, (x, y, z) => {
    const v = axis === 'x' ? x : axis === 'y' ? y : z;
    const u = hi > lo ? (v - lo) / (hi - lo) : 0;
    return t.copy(a).lerp(b, u).multiplyScalar(k);
  });
}

/** Additive glow material (flames, lamps, visors); one per rig, disposed with it. */
export function additive(color, opacity = 0.9, vertexColors = false) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors });
}

export function glowSprite(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** Smooth 0..1..0 pose envelope: rises over `a` s, holds, falls over the last `r` s of `len`. */
export function envelope(el, len, a = 0.12, r = 0.2) {
  if (el <= 0 || el >= len) return 0;
  const up = Math.min(1, el / a), down = Math.min(1, (len - el) / r);
  const v = Math.min(up, down);
  return v * v * (3 - 2 * v);
}

/**
 * Completes a rig: world scale, muzzle measured from the real aiming pose (gun tip = arm-local point `tip`,
 * averaged over the run cycle, in root-local units), the ability pose length (abilityDuration, seconds that
 * `ability` 0..1 spans: the data duration), and dispose() for everything this rig created.
 */
export function finish(rig, k, { id, scale, arm, tip = [0, -0.6, -0.02], extraGeo = [], extraMat = [] }) {
  const def = heroDef(id);
  rig.id = id;
  rig.meshes = k.meshes;
  rig.mat = k.mat;
  rig.scale = scale;
  rig.root.scale.setScalar(scale);
  rig.abilityDuration = def.ability.duration || 0.6;
  // muzzle: average gun-tip position over one stride of the run pose
  let sx = 0, sy = 0, sz = 0;
  const N = 8;
  for (let i = 0; i < N; i++) {
    rig.animate(i / N * (Math.PI * 2 / (def.run.freq || 11)), 1, 0, 0, 0);
    rig.root.updateMatrixWorld(true);
    _v.set(tip[0], tip[1], tip[2]).applyMatrix4(arm.matrixWorld);
    _m.copy(rig.root.matrixWorld).invert();
    _v.applyMatrix4(_m);
    sx += _v.x; sy += _v.y; sz += _v.z;
  }
  rig.muzzle = { x: sx / N, y: sy / N, z: sz / N };
  rig.animate(0, 1, 0, 0, 0);
  const ownGeo = rig.ownGunGeo;
  rig.dispose = () => {
    for (const m of k.meshes) m.geometry.dispose();
    if (ownGeo) ownGeo.dispose();
    for (const g of extraGeo) g.dispose();
    k.mat.dispose(); rig.gunMat.dispose();
    for (const m of extraMat) { if (m.map && m.isSpriteMaterial) { /* shared glow texture stays */ } m.dispose(); }
  };
  return rig;
}
