// Helper models: hover drone (body + spinning rotor) and wheeled heavy turret (chassis + barrel).
// Both face -Z. Vertex colored, toon shaded.
import { part, merge, G } from './util.js';

const WHITE = '#f4f8ff', BLUE = '#2f8cff', DARK = '#3a4560', GREEN = '#45ff7a';

export function buildDroneGeometry() {
  return merge([
    part(G.sphere(0.24, 12, 8), '#35d39a', { s: [1.15, 0.72, 1.15] }),
    part(G.cyl(0.25, 0.25, 0.06, 14, true), WHITE, { p: [0, 0.0, 0] }),
    part(G.sphere(0.1, 8, 6), '#123', { p: [0, -0.02, -0.22], s: [1, 1, 0.6] }),
    part(G.sphere(0.065, 8, 6), GREEN, { p: [0, -0.02, -0.255], s: [1, 1, 0.5], bright: 1.3 }),
    // arms to rotor hubs
    part(G.box(0.86, 0.04, 0.07), DARK, { p: [0, 0.07, 0] }),
    part(G.cyl(0.05, 0.05, 0.08, 8), DARK, { p: [-0.43, 0.1, 0] }),
    part(G.cyl(0.05, 0.05, 0.08, 8), DARK, { p: [0.43, 0.1, 0] }),
    // little gun pod + antenna
    part(G.box(0.07, 0.07, 0.22), DARK, { p: [0, -0.16, -0.08] }),
    part(G.cyl(0.012, 0.012, 0.2, 4), DARK, { p: [0.08, 0.24, 0.05] }),
    part(G.sphere(0.035, 6, 4), '#ff3b4e', { p: [0.08, 0.35, 0.05], bright: 1.3 }),
  ]);
}

/** Two rotor blade discs (translucent) centered on the hubs; spun about Y by the helper system. */
export function buildRotorGeometry() {
  const blade = (x) => [
    part(G.box(0.42, 0.012, 0.06), '#ffffff', { p: [x, 0.15, 0], a: 0.9 }),
    part(G.cyl(0.24, 0.24, 0.005, 16), '#d6ecff', { p: [x, 0.15, 0], a: 0.35 }),
  ];
  return merge([...blade(-0.43), ...blade(0.43)]);
}

export function buildTurretGeometry() {
  const wheel = (x, z) => part(G.cyl(0.2, 0.2, 0.14, 10), DARK, { p: [x, 0.2, z], r: [0, 0, Math.PI / 2] });
  const hub = (x, z) => part(G.cyl(0.08, 0.08, 0.16, 6), '#c9d4e6', { p: [x, 0.2, z], r: [0, 0, Math.PI / 2] });
  return merge([
    part(G.box(0.7, 0.24, 1.0), WHITE, { p: [0, 0.38, 0] }),
    part(G.box(0.72, 0.08, 1.02), BLUE, { p: [0, 0.29, 0] }),
    wheel(-0.4, 0.3), wheel(0.4, 0.3), wheel(-0.4, -0.3), wheel(0.4, -0.3),
    hub(-0.41, 0.3), hub(0.41, 0.3), hub(-0.41, -0.3), hub(0.41, -0.3),
    // dome head
    part(G.sphere(0.34, 12, 8), WHITE, { p: [0, 0.56, 0.05], s: [1, 0.8, 1] }),
    part(G.box(0.2, 0.08, 0.06), '#22d3c5', { p: [0, 0.68, -0.22], bright: 1.2 }),
  ]);
}

/** Barrel (cannon) separate so it can recoil. Origin at the pivot, pointing -Z. */
export function buildCannonGeometry() {
  return merge([
    part(G.cyl(0.1, 0.12, 0.9, 10), '#55607a', { p: [0, 0, -0.45], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.15, 0.15, 0.14, 10), '#ff8a2b', { p: [0, 0, -0.88], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.08, 0.08, 0.02, 8), '#1b1f2b', { p: [0, 0, -0.96], r: [Math.PI / 2, 0, 0] }),
    part(G.box(0.24, 0.24, 0.24), '#c9d4e6', { p: [0, 0, 0] }),
  ]);
}

export const DRONE_COLORS = { lens: GREEN };
