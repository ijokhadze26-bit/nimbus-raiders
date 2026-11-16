// Gun geometries per weapon and Mk (WEAPONS builder, SPEC2 §2 "Gun" lines).
//   buildGunGeometry(id, mk, lod = 'high') -> squad / display gun: grip at the origin, pointing -Z, vertex
//     colours (white parts take the gun tint: gun paint or the weapon's own gunTint, game/loadout.js).
//     Raider budget <= 60 triangles High, <= 36 Low (drawn up to 320 times).
//   buildHeroGunGeometry(id, mk) -> the leader's gun, pointing down the arm (-Y), <= 160 triangles.
// Both are cached; callers never dispose them. Registering with raider.js makes the squad guns follow.
// Mk ladder (every weapon): I plain, II a stripe or fin, III a glowing core part, IV a second barrel or
// element, V a gold halo ring; MK_SCALE grows the whole gun (IV = x1.4, V = x1.6).
import { registerGunBuilder } from '../raider.js';
import { MK_SCALE } from '../../data/weapons.js';
import { gunParts } from './guns2.js';
import { merge } from '../util.js';

const cache = new Map();

function build(id, mk, detail) {
  const m = Math.max(1, Math.min(5, mk | 0));
  const g = merge(gunParts(id, m, detail));
  const s = MK_SCALE[m - 1];
  g.scale(s, s, s);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export function buildGunGeometry(id, mk = 1, lod = 'high') {
  const key = 'g' + id + mk + lod;
  if (!cache.has(key)) cache.set(key, build(id, mk, lod === 'low' ? 0 : 1));
  return cache.get(key);
}

export function buildHeroGunGeometry(id, mk = 1) {
  const key = 'h' + id + mk;
  if (!cache.has(key)) {
    const g = build(id, mk, 2);
    g.scale(1.45, 1.45, 1.45);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    g.translate(0, -0.22, -0.02);
    g.computeBoundingBox(); g.computeBoundingSphere();
    cache.set(key, g);
  }
  return cache.get(key);
}

/** Triangle count (tests / budgets). */
export function gunTris(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

registerGunBuilder(buildGunGeometry);
