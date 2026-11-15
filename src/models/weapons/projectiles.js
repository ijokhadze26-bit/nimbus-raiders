// Projectile geometries per weapon / Mk / part. FOUNDATION STUB (owned by the WEAPONS builder): every weapon
// draws the shipped pistol bolt in its own Mk colours. Contract:
//   buildProjectileGeometry(id, mk, part = 'main' | 'child' | 'tracer') -> BufferGeometry (cached; callers never
//   dispose it). Oriented along -Z, centred on the bullet position, vertex colours (+ alpha) for the shared
//   MeshBasicMaterial (transparent, additive-free). <= 120 triangles per style (SPEC2 §6.9).
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { weaponDef } from '../../data/weapons.js';

const cache = new Map();

function bolt(color, core, L, r) {
  const along = [Math.PI / 2, 0, 0];
  const body = new THREE.Color(color), halo = new THREE.Color(color).offsetHSL(0, 0.05, 0.05);
  return merge([
    part(G.capsule(r * 1.55, L * 1.05, 1, 5), halo, { r: along, a: 0.35 }),
    part(G.capsule(r, L, 1, 5), body, { r: along, a: 1, bright: 1.1 }),
    part(G.capsule(r * 0.45, L * 0.75, 1, 3), new THREE.Color(core), { r: along, a: 1, p: [0, r * 0.3, -L * 0.1] }),
  ]);
}

export function buildProjectileGeometry(id, mk = 1, partName = 'main') {
  const key = id + ':' + mk + ':' + partName;
  if (cache.has(key)) return cache.get(key);
  const def = weaponDef(id);
  const look = def.look.mk[Math.max(1, Math.min(5, mk)) - 1];
  const geo = partName === 'tracer' ? bolt(look.trail, look.core, 0.3, 0.05)
    : partName === 'child' ? bolt(look.color, look.core, 0.35, 0.07)
      : bolt(look.color, look.core, 0.55, 0.1);
  cache.set(key, geo);
  return geo;
}
