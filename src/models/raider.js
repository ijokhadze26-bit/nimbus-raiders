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

/** Gun geometry (white vertex colors; tinted by material color = tier color). */
export function buildRaiderGunGeometry() {
  return merge([
    part(G.box(0.07, 0.08, 0.2), '#ffffff', { p: [0.15, 0.33, -0.25] }),
    part(G.box(0.04, 0.04, 0.12), '#ffffff', { p: [0.15, 0.35, -0.39], bright: 1.25 }),
    part(G.box(0.05, 0.06, 0.06), '#55607a', { p: [0.15, 0.39, -0.22] }),
  ]).scale(RAIDER_SCALE, RAIDER_SCALE, RAIDER_SCALE);
}

export const RAIDER_MUZZLE = { x: 0.15 * RAIDER_SCALE, y: 0.35 * RAIDER_SCALE, z: -0.45 * RAIDER_SCALE };
