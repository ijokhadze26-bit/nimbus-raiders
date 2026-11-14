// Murklings: goo creatures from storm clouds. Each type is one merged vertex-colored geometry
// (instanced by game/horde.js). Models face +Z (toward the squad), base at y = 0.
// Kept low-poly (~150-280 tris) so 600 alive enemies stay inside the triangle budget.
import * as THREE from 'three';
import { part, merge, G } from './util.js';

const EYE_WHITE = '#ffffff', PUPIL = '#1d1033', MOUTH = '#2c0f55';

/** Squat purple blob, one big yellow eye, two little nub horns. */
function grunt() {
  const body = '#8a4dff', dark = '#5b2cc4';
  return merge([
    part(G.sphere(0.42, 8, 5), body, { p: [0, 0.36, 0], s: [1, 0.86, 0.95] }),
    // eye
    part(G.sphere(0.17, 6, 4), '#ffd23d', { p: [0, 0.47, 0.3], s: [1, 1, 0.62], bright: 1.15 }),
    part(G.sphere(0.075, 4, 3), PUPIL, { p: [0, 0.46, 0.4], s: [1, 1.15, 0.5] }),
    part(G.box(0.04, 0.04, 0.02), EYE_WHITE, { p: [-0.045, 0.515, 0.43], bright: 1.4 }),
    // horns
    part(G.cone(0.08, 0.18, 3), dark, { p: [-0.18, 0.72, 0.02], r: [0.1, 0, 0.45] }),
    part(G.cone(0.08, 0.18, 3), dark, { p: [0.18, 0.72, 0.02], r: [0.1, 0, -0.45] }),
    // grin + tooth
    part(G.box(0.18, 0.045, 0.05), MOUTH, { p: [0, 0.25, 0.375], r: [0.3, 0, 0] }),
  ]);
}

/** Lean orange blob leaning forward, swept-back streak ears. Smaller and fast. */
function runner() {
  const body = '#ff8a2b', dark = '#d95a12';
  return merge([
    part(G.capsule(0.24, 0.26, 2, 6), body, { p: [0, 0.4, 0.04], r: [0.42, 0, 0] }),
    // streak ears (swept back)
    part(G.cone(0.07, 0.42, 4), dark, { p: [-0.13, 0.66, -0.16], r: [-1.05, 0, 0.25] }),
    part(G.cone(0.07, 0.42, 4), dark, { p: [0.13, 0.66, -0.16], r: [-1.05, 0, -0.25] }),
    // two focused eyes + brow
    part(G.sphere(0.085, 4, 3), EYE_WHITE, { p: [-0.09, 0.56, 0.24], s: [1, 1, 0.6] }),
    part(G.sphere(0.085, 4, 3), EYE_WHITE, { p: [0.09, 0.56, 0.24], s: [1, 1, 0.6] }),
    part(G.box(0.06, 0.07, 0.03), PUPIL, { p: [-0.085, 0.555, 0.29] }),
    part(G.box(0.06, 0.07, 0.03), PUPIL, { p: [0.085, 0.555, 0.29] }),
    part(G.box(0.26, 0.04, 0.05), '#7a2a05', { p: [0, 0.645, 0.25], r: [0.3, 0, 0] }),
  ]);
}

/** Big slate blob in a steel helmet with shoulder plates, a glowing red visor eye and an underbite with tusks. */
function tank() {
  const body = '#5b6a8e', dark = '#3e4964', steel = '#cfd8e6', steelDark = '#8f9bb2', tusk = '#fff6e0';
  return merge([
    part(G.sphere(0.72, 9, 6), body, { p: [0, 0.66, 0], s: [1, 0.9, 0.95] }),
    part(G.sphere(0.4, 5, 3), '#7484a8', { p: [0, 0.45, 0.38], s: [1.2, 0.8, 0.6] }),
    // helmet dome + brim + crest
    part(new THREE.SphereGeometry(0.66, 9, 3, 0, Math.PI * 2, 0, Math.PI * 0.42), steel, { p: [0, 0.88, -0.02] }),
    part(G.cyl(0.67, 0.7, 0.1, 9, true), steelDark, { p: [0, 1.06, -0.02] }),
    part(G.box(0.12, 0.18, 0.9), steelDark, { p: [0, 1.5, -0.04] }),
    // shoulder plates
    part(new THREE.SphereGeometry(0.3, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.5), steel, { p: [-0.62, 0.78, 0.05], r: [0, 0, 0.6] }),
    part(new THREE.SphereGeometry(0.3, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.5), steel, { p: [0.62, 0.78, 0.05], r: [0, 0, -0.6] }),
    // red visor eye under the brim
    part(G.box(0.62, 0.17, 0.12), '#26202e', { p: [0, 0.9, 0.6], r: [-0.2, 0, 0] }),
    part(G.sphere(0.12, 5, 3), '#ff2a3a', { p: [0, 0.9, 0.66], s: [1.9, 0.62, 0.5], bright: 1.4 }),
    // grumpy underbite with tusks
    part(G.box(0.46, 0.08, 0.06), '#2a1f36', { p: [0, 0.5, 0.66], r: [-0.25, 0, 0] }),
    part(G.cone(0.06, 0.18, 3), tusk, { p: [-0.17, 0.6, 0.66], r: [0.15, 0, 0] }),
    part(G.cone(0.06, 0.18, 3), tusk, { p: [0.17, 0.6, 0.66], r: [0.15, 0, 0] }),
  ]);
}

/** Purple blob peeking over its shield (the shield is a separate instanced mesh). */
function shieldbearer() {
  const body = '#7a3fe8', dark = '#4d22a8';
  return merge([
    part(G.sphere(0.45, 8, 5), body, { p: [0, 0.42, -0.05], s: [1, 0.95, 0.95] }),
    // eye peeking above the shield + helmet band
    part(G.sphere(0.15, 6, 4), '#ffd23d', { p: [0, 0.66, 0.26], s: [1, 0.9, 0.6], bright: 1.15 }),
    part(G.sphere(0.066, 4, 3), PUPIL, { p: [0, 0.65, 0.35], s: [1, 1.1, 0.5] }),
    part(G.cyl(0.36, 0.42, 0.12, 8, true), '#2bd4e8', { p: [0, 0.82, -0.05] }),
    // hands holding the shield
    part(G.box(0.14, 0.14, 0.14), dark, { p: [-0.38, 0.4, 0.38] }),
    part(G.box(0.14, 0.14, 0.14), dark, { p: [0.38, 0.4, 0.38] }),
  ]);
}

/** Round red blob with a sparking fuse and angry eyes (spark is a separate instanced mesh). */
function bomber() {
  const body = '#ff3b4e', dark = '#c21d34', light = '#ff8a95';
  return merge([
    part(G.sphere(0.43, 8, 6), body, { p: [0, 0.43, 0] }),
    part(G.sphere(0.13, 4, 2), light, { p: [-0.18, 0.62, 0.24], s: [1, 0.7, 0.5], bright: 1.15 }),
    part(G.cyl(0.13, 0.15, 0.1, 5), '#3d3446', { p: [0, 0.86, 0] }),
    part(G.cyl(0.03, 0.035, 0.22, 4), '#5a4430', { p: [0.03, 1.0, 0.02], r: [0.15, 0, -0.3] }),
    // angry eyes + brows
    part(G.sphere(0.085, 4, 3), EYE_WHITE, { p: [-0.13, 0.48, 0.36], s: [1, 1, 0.55] }),
    part(G.sphere(0.085, 4, 3), EYE_WHITE, { p: [0.13, 0.48, 0.36], s: [1, 1, 0.55] }),
    part(G.box(0.06, 0.07, 0.03), PUPIL, { p: [-0.12, 0.47, 0.405] }),
    part(G.box(0.06, 0.07, 0.03), PUPIL, { p: [0.12, 0.47, 0.405] }),
    part(G.box(0.14, 0.04, 0.04), '#5c0612', { p: [-0.13, 0.585, 0.37], r: [0, 0, -0.45] }),
    part(G.box(0.14, 0.04, 0.04), '#5c0612', { p: [0.13, 0.585, 0.37], r: [0, 0, 0.45] }),
      ]);
}

const BUILDERS = { grunt, runner, tank, shield: shieldbearer, bomber };

export function buildMurklingGeometry(type) {
  return BUILDERS[type]();
}

/** Curved cyan energy shield held in front of a Shieldbearer (vertex RGBA, faces +Z). */
export function buildShieldGeometry() {
  const arc = 1.75, start = -arc / 2;
  const panel = new THREE.CylinderGeometry(0.62, 0.62, 0.74, 7, 1, true, start, arc);
  const inner = new THREE.CylinderGeometry(0.625, 0.625, 0.44, 7, 1, true, start + 0.25, arc - 0.5);
  const rimTop = new THREE.CylinderGeometry(0.64, 0.64, 0.09, 7, 1, true, start, arc);
  const rimBot = new THREE.CylinderGeometry(0.64, 0.64, 0.09, 7, 1, true, start, arc);
  const sideL = new THREE.BoxGeometry(0.08, 0.8, 0.08);
  const sideR = new THREE.BoxGeometry(0.08, 0.8, 0.08);
  const ex = Math.sin(arc / 2) * 0.63, ez = Math.cos(arc / 2) * 0.63;
  return merge([
    part(panel, '#38d9ff', { p: [0, 0.48, -0.08], a: 0.42 }),
    part(inner, '#9ff4ff', { p: [0, 0.48, -0.08], a: 0.35 }),
    part(rimTop, '#e9feff', { p: [0, 0.86, -0.08], a: 1 }),
    part(rimBot, '#e9feff', { p: [0, 0.1, -0.08], a: 1 }),
    part(sideL, '#e9feff', { p: [-ex, 0.48, ez - 0.08], a: 1 }),
    part(sideR, '#e9feff', { p: [ex, 0.48, ez - 0.08], a: 1 }),
  ]);
}

/** Small star spark for the Fizzbomb fuse. */
export function buildSparkGeometry() {
  return merge([
    part(new THREE.OctahedronGeometry(0.11, 0), '#fff3a0', { s: [1, 1, 1] }),
    part(new THREE.OctahedronGeometry(0.07, 0), '#ffffff', { r: [0.6, 0.6, 0], s: [1.6, 0.5, 1.6] }),
  ]);
}
