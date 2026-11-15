// Gun geometries per weapon and Mk. FOUNDATION STUB (owned by the WEAPONS builder): every weapon uses the
// shipped pistol shape; the gun material tints the white parts (gun paint / weapon colour, game/loadout.js).
// Contract:
//   buildGunGeometry(id, mk, lod = 'high') -> squad / display gun: grip at the origin, pointing -Z, vertex
//     colours (white = tinted). Raider budget <= 60 triangles High, <= 36 Low (drawn up to 320 times).
//   buildHeroGunGeometry(id, mk) -> the leader's gun, pointing down the arm (-Y), <= 160 triangles.
// Both are cached; callers never dispose them. Registering with raider.js makes the squad guns follow.
import { buildGunGeometry as legacyGun, registerGunBuilder } from '../raider.js';

const cache = new Map();

export function buildGunGeometry(id, mk = 1, lod = 'high') {
  const key = 'g' + id + mk + lod;
  if (!cache.has(key)) cache.set(key, legacyGun(1, lod === 'low'));
  return cache.get(key);
}

export function buildHeroGunGeometry(id, mk = 1) {
  const key = 'h' + id + mk;
  if (!cache.has(key)) {
    const g = legacyGun(1).clone();
    g.scale(1.45, 1.45, 1.45);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    g.translate(0, -0.22, -0.02);
    cache.set(key, g);
  }
  return cache.get(key);
}

registerGunBuilder(buildGunGeometry);
