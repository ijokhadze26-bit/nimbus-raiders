// Raider: small sky-cadet squad member. One merged vertex-colored geometry (body) + a separate gun geometry
// so the gun can be tinted with the weapon tier color. Faces -Z. Height ~0.8u.
import { part, merge, G } from './util.js';

export const RAIDER_SCALE = 1.22;

export const RAIDER_COLORS = {
  suit: '#2f7bff', suitDark: '#2353c4', helmet: '#f2f7ff', visor: '#22d3c5', pack: '#2a6ff0',
  packDark: '#3d4a66', glove: '#ffffff', belt: '#1c3a8c', scarf: '#ff8a2b',
};

export function buildRaiderGeometry(colors = RAIDER_COLORS) {
  const c = colors;
  const parts = [
    // legs + boots (open cylinders / low-poly)
    part(G.cyl(0.058, 0.05, 0.17, 6, true), c.suitDark, { p: [-0.075, 0.09, 0] }),
    part(G.cyl(0.058, 0.05, 0.17, 6, true), c.suitDark, { p: [0.075, 0.09, 0] }),
    part(G.box(0.1, 0.06, 0.15), c.glove, { p: [-0.075, 0.03, -0.02] }),
    part(G.box(0.1, 0.06, 0.15), c.glove, { p: [0.075, 0.03, -0.02] }),
    // body
    part(G.capsule(0.165, 0.11, 2, 8), c.suit, { p: [0, 0.31, 0] }),
    part(G.cyl(0.172, 0.172, 0.05, 8, true), c.belt, { p: [0, 0.24, 0] }),
    // scarf ring + tail flap (pops from behind)
    part(G.cyl(0.115, 0.13, 0.06, 8, true), c.scarf, { p: [0, 0.44, 0] }),
    part(G.box(0.08, 0.16, 0.035), c.scarf, { p: [0.05, 0.39, 0.14], r: [0.35, 0, 0.15] }),
    // helmet + crest + visor band
    part(G.sphere(0.165, 10, 7), c.helmet, { p: [0, 0.6, 0] }),
    part(G.box(0.07, 0.06, 0.2), '#2f8cff', { p: [0, 0.755, 0.0] }),
    part(G.cyl(0.155, 0.162, 0.07, 10, true), c.visor, { p: [0, 0.585, -0.012], s: [1.04, 1, 1] }),
    // backpack (blue, chunky)
    part(G.box(0.24, 0.22, 0.13), c.pack, { p: [0, 0.35, 0.17] }),
    part(G.box(0.245, 0.045, 0.135), '#ffffff', { p: [0, 0.41, 0.17] }),
    // arms: left hangs, right holds gun forward
    part(G.capsule(0.045, 0.1, 1, 5), c.suit, { p: [-0.17, 0.3, 0], r: [0, 0, -0.25] }),
    part(G.sphere(0.05, 5, 3), c.glove, { p: [-0.2, 0.22, 0] }),
    part(G.capsule(0.045, 0.12, 1, 5), c.suit, { p: [0.15, 0.32, -0.09], r: [1.35, 0, 0] }),
    part(G.sphere(0.052, 5, 3), c.glove, { p: [0.15, 0.31, -0.18] }),
  ];
  return merge(parts).scale(RAIDER_SCALE, RAIDER_SCALE, RAIDER_SCALE);
}

/** Cheap silhouette used only for the shadow pass (shares the raiders' instance matrices). */
export function buildRaiderShadowGeometry() {
  return merge([
    part(G.cyl(0.15, 0.12, 0.42, 6), '#ffffff', { p: [0, 0.22, 0.02] }),
    part(G.sphere(0.165, 6, 4), '#ffffff', { p: [0, 0.6, 0] }),
  ]).scale(RAIDER_SCALE, RAIDER_SCALE, RAIDER_SCALE);
}

/**
 * Gun parts per weapon tier, built along -Z with the grip at the origin. White parts are tinted by the
 * gun material (tier color); dark parts stay dark. Each tier has its own silhouette.
 */
const DARK = '#4b5672';
function gunParts(tier) {
  const W = '#ffffff';
  switch (tier) {
    case 2: return [ // Storm Rifle: long barrel + stock + scope
      part(G.box(0.07, 0.08, 0.3), W, { p: [0, 0, -0.08] }),
      part(G.box(0.035, 0.035, 0.2), W, { p: [0, 0.015, -0.32], bright: 1.25 }),
      part(G.box(0.05, 0.07, 0.12), DARK, { p: [0, -0.01, 0.1] }),
      part(G.box(0.04, 0.04, 0.1), DARK, { p: [0, 0.065, -0.1] }),
    ];
    case 3: return [ // Rapid Laser: slim emitter with glowing rings
      part(G.box(0.06, 0.07, 0.24), DARK, { p: [0, 0, -0.06] }),
      part(G.cyl(0.026, 0.026, 0.3, 6), W, { p: [0, 0.01, -0.3], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
      part(G.cyl(0.045, 0.045, 0.03, 8), W, { p: [0, 0.01, -0.24], r: [Math.PI / 2, 0, 0], bright: 1.4 }),
      part(G.cyl(0.045, 0.045, 0.03, 8), W, { p: [0, 0.01, -0.36], r: [Math.PI / 2, 0, 0], bright: 1.4 }),
    ];
    case 4: return [ // Beam Cannon: chunky body + wide muzzle
      part(G.box(0.1, 0.11, 0.28), W, { p: [0, 0.01, -0.08] }),
      part(G.cyl(0.07, 0.055, 0.16, 8), W, { p: [0, 0.015, -0.3], r: [Math.PI / 2, 0, 0], bright: 1.2 }),
      part(G.cyl(0.04, 0.04, 0.02, 8), '#ffffff', { p: [0, 0.015, -0.385], r: [Math.PI / 2, 0, 0], bright: 1.6 }),
      part(G.box(0.12, 0.04, 0.16), DARK, { p: [0, 0.075, -0.06] }),
    ];
    case 5: return [ // Plasma Scatter: wide triple barrel
      part(G.box(0.12, 0.08, 0.22), W, { p: [0, 0, -0.08] }),
      part(G.cyl(0.024, 0.024, 0.18, 6), W, { p: [-0.045, 0.01, -0.27], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
      part(G.cyl(0.024, 0.024, 0.2, 6), W, { p: [0, 0.01, -0.28], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
      part(G.cyl(0.024, 0.024, 0.18, 6), W, { p: [0.045, 0.01, -0.27], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
      part(G.box(0.08, 0.05, 0.08), DARK, { p: [0, 0.06, -0.02] }),
    ];
    case 6: return [ // Nova Lance: long lance with an orb tip
      part(G.box(0.08, 0.09, 0.26), DARK, { p: [0, 0, -0.06] }),
      part(G.cyl(0.03, 0.05, 0.3, 6), W, { p: [0, 0.01, -0.3], r: [Math.PI / 2, 0, 0] }),
      part(G.sphere(0.065, 8, 6), W, { p: [0, 0.01, -0.48], bright: 1.5 }),
      part(G.box(0.16, 0.025, 0.06), W, { p: [0, 0.01, -0.16] }),
    ];
    default: return [ // Blaster Pistol
      part(G.box(0.07, 0.08, 0.2), W, { p: [0, 0, -0.05] }),
      part(G.box(0.04, 0.04, 0.12), W, { p: [0, 0.02, -0.19], bright: 1.25 }),
      part(G.box(0.05, 0.06, 0.06), DARK, { p: [0, 0.06, -0.02] }),
    ];
  }
}

const gunCache = new Map();
/** Gun for a tier centered on its grip, pointing -Z (reward displays). */
export function buildGunGeometry(tier = 1) { return merge(gunParts(tier)); }

/** Raider gun for a tier (cached). */
export function buildRaiderGunGeometry(tier = 1) {
  const key = 'r' + tier;
  if (!gunCache.has(key)) {
    const g = merge(gunParts(tier));
    g.translate(0.15, 0.33, -0.2);
    g.scale(RAIDER_SCALE, RAIDER_SCALE, RAIDER_SCALE);
    gunCache.set(key, g);
  }
  return gunCache.get(key);
}

/** Pip's gun for a tier: same silhouette pointing down the arm (-Y), bigger. */
export function buildPipGunGeometry(tier = 1) {
  const key = 'p' + tier;
  if (!gunCache.has(key)) {
    const g = merge(gunParts(tier));
    g.scale(1.45, 1.45, 1.45);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI);
    g.translate(0, -0.22, -0.02);
    gunCache.set(key, g);
  }
  return gunCache.get(key);
}

export const RAIDER_MUZZLE = { x: 0.15 * RAIDER_SCALE, y: 0.35 * RAIDER_SCALE, z: -0.45 * RAIDER_SCALE };
