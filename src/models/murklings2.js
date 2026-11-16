// Update 3 Murklings (stage 3 "enemies"): BOOMLING, MENDLING, BROODLING HIVE, SPITLING, FLAPLING. Same rules
// as murklings.js: one merged vertex-coloured geometry per type (instanced by game/hordeview.js), faces +Z,
// base at y = 0, low poly, colours per world skin (NEW_SKINS is merged into MURKLING_SKINS). Plus the elite
// material (gold rim on the shared toon shader) and the small shared visuals of game/hordefx.js.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { fxToonMaterial } from './materials.js';

const EYE = '#ffffff', PUPIL = '#1d1033';

export const NEW_SKINS = {
  sky: {
    blaster: { body: '#ffb12e', dark: '#c4620e', crack: '#ff4a1a', brow: '#5a2005' },
    healer: { body: '#4df0a8', dark: '#1fae78', plus: '#ffffff', halo: '#fff3a0' },
    spawner: { body: '#9a5ab8', dark: '#5e2c7a', pod: '#d8ff7a', mouth: '#2a0e3a' },
    sniper: { body: '#a6d82a', dark: '#5a8a12', sac: '#e6ff8a', eye: '#ff3a3a' },
    flyer: { body: '#38c2f2', wing: '#1a5aa8', belly: '#a8ecff', eye: '#ffd23d' },
  },
  forge: {
    blaster: { body: '#ff9a1a', dark: '#3a2420', crack: '#ffe04a', brow: '#2a0e05' },
    healer: { body: '#3fd890', dark: '#1a6a48', plus: '#fff0d0', halo: '#ffd06a' },
    spawner: { body: '#6a3a30', dark: '#3a1a16', pod: '#ffb03a', mouth: '#1a0a06' },
    sniper: { body: '#9a7a2a', dark: '#3a2a10', sac: '#ffd06a', eye: '#ff6a1a' },
    flyer: { body: '#5a3a3a', wing: '#ff6a1a', belly: '#ffb06a', eye: '#ffe04a' },
  },
  frost: {
    blaster: { body: '#ffc04a', dark: '#e8f6ff', crack: '#ff5a3a', brow: '#6a2a05' },
    healer: { body: '#6af5c8', dark: '#2aa88a', plus: '#ffffff', halo: '#e0fbff' },
    spawner: { body: '#5a7ac8', dark: '#2e4a8e', pod: '#e0fbff', mouth: '#0e1a3a' },
    sniper: { body: '#7ad8c8', dark: '#2a8a7a', sac: '#e0fff8', eye: '#ff4a6a' },
    flyer: { body: '#8ad8ff', wing: '#e8f8ff', belly: '#ffffff', eye: '#3a6aff' },
  },
  candy: {
    blaster: { body: '#ffbe3a', dark: '#ff6ab0', crack: '#ff3a6a', brow: '#7a2a05' },
    healer: { body: '#7af0c0', dark: '#ff9ad0', plus: '#ffffff', halo: '#fff36a' },
    spawner: { body: '#c66ad6', dark: '#8a3aa8', pod: '#ffe27a', mouth: '#3a0e3a' },
    sniper: { body: '#b8e84a', dark: '#6aa81a', sac: '#fff0a0', eye: '#ff3a8a' },
    flyer: { body: '#5ad0ff', wing: '#ff7ad1', belly: '#ffffff', eye: '#fff36a' },
  },
  citadel: {
    blaster: { body: '#e8a030', dark: '#3a3450', crack: '#c47aff', brow: '#2a1205' },
    healer: { body: '#4ad6a0', dark: '#2a5a5a', plus: '#e8ffe8', halo: '#d6b8ff' },
    spawner: { body: '#4a3a6a', dark: '#2a2040', pod: '#c47aff', mouth: '#100a20' },
    sniper: { body: '#7a8a3a', dark: '#3a4220', sac: '#c8e07a', eye: '#c47aff' },
    flyer: { body: '#3a3a5a', wing: '#8a5ad8', belly: '#b8a0ff', eye: '#e2c8ff' },
  },
};

/** Per-type glow colour of the shader's aFx.z channel (swell, heal pulse, pod pulse, spit charge). */
export const NEW_GLOW = { blaster: '#ff5a10', healer: '#5dffb0', spawner: '#d8ff7a', sniper: '#c8ff3a', flyer: '#9fe8ff' };

const eyes = (x, y, z, r = 0.075) => [
  part(G.sphere(r, 4, 3), EYE, { p: [-x, y, z], s: [1, 1, 0.55] }),
  part(G.sphere(r, 4, 3), EYE, { p: [x, y, z], s: [1, 1, 0.55] }),
  part(G.box(r * 0.7, r * 0.85, 0.03), PUPIL, { p: [-x, y - 0.005, z + r * 0.55] }),
  part(G.box(r * 0.7, r * 0.85, 0.03), PUPIL, { p: [x, y - 0.005, z + r * 0.55] }),
];

/** BOOMLING: spiky orange puffball with a glowing crack belt and an angry grin - it is going to pop. */
function blaster(P) {
  const spikes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    spikes.push(part(G.cone(0.075, 0.22, 4), P.dark, { p: [Math.sin(a) * 0.43, 0.5, Math.cos(a) * 0.43], r: [Math.cos(a) * 1.57, 0, -Math.sin(a) * 1.57] }));
  }
  spikes.push(part(G.cone(0.08, 0.24, 4), P.dark, { p: [0, 0.93, 0] }));
  spikes.push(part(G.cone(0.06, 0.18, 4), P.dark, { p: [-0.2, 0.86, -0.05], r: [0, 0, 0.6] }));
  spikes.push(part(G.cone(0.06, 0.18, 4), P.dark, { p: [0.2, 0.86, -0.05], r: [0, 0, -0.6] }));
  return merge([
    part(G.sphere(0.42, 9, 6), P.body, { p: [0, 0.49, 0] }),
    part(G.torus(0.415, 0.04, 4, 14), P.crack, { p: [0, 0.4, 0], r: [Math.PI / 2, 0, 0], bright: 1.35 }),
    part(G.box(0.05, 0.22, 0.04), P.crack, { p: [-0.25, 0.6, 0.31], r: [0, 0.6, 0.4], bright: 1.35 }),
    part(G.box(0.05, 0.18, 0.04), P.crack, { p: [0.3, 0.3, 0.27], r: [0, -0.7, -0.5], bright: 1.35 }),
    ...spikes,
    ...eyes(0.13, 0.58, 0.36, 0.08),
    part(G.box(0.15, 0.04, 0.04), P.brow, { p: [-0.13, 0.69, 0.38], r: [0, 0, -0.5] }),
    part(G.box(0.15, 0.04, 0.04), P.brow, { p: [0.13, 0.69, 0.38], r: [0, 0, 0.5] }),
    part(G.box(0.24, 0.07, 0.05), '#3a0a05', { p: [0, 0.37, 0.4], r: [0.35, 0, 0] }),
    part(G.box(0.2, 0.025, 0.02), '#fff6e0', { p: [0, 0.39, 0.43], r: [0.35, 0, 0] }),
    part(G.sphere(0.1, 4, 3), P.dark, { p: [-0.18, 0.06, 0.05], s: [1, 0.6, 1.2] }),
    part(G.sphere(0.1, 4, 3), P.dark, { p: [0.18, 0.06, 0.05], s: [1, 0.6, 1.2] }),
  ]);
}

/** MENDLING: soft mint jelly with a glowing plus on its belly, a halo ring and a little sprout. */
function healer(P) {
  return merge([
    part(G.sphere(0.38, 9, 6), P.body, { p: [0, 0.4, 0], s: [1, 1.05, 0.95] }),
    part(G.sphere(0.22, 6, 4), P.plus, { p: [0, 0.34, 0.24], s: [1, 1, 0.45], bright: 0.95 }),
    part(G.box(0.2, 0.06, 0.05), P.dark, { p: [0, 0.34, 0.35] }),
    part(G.box(0.06, 0.2, 0.05), P.dark, { p: [0, 0.34, 0.35] }),
    ...eyes(0.11, 0.56, 0.3, 0.065),
    part(G.box(0.1, 0.03, 0.03), '#1d6a4a', { p: [0, 0.47, 0.35], r: [0.3, 0, 0] }),
    // halo + sprout
    part(G.torus(0.22, 0.035, 4, 14), P.halo, { p: [0, 1.0, -0.02], r: [Math.PI / 2 - 0.25, 0, 0], bright: 1.3 }),
    part(G.cyl(0.025, 0.03, 0.16, 4), P.dark, { p: [0, 0.83, 0] }),
    part(G.sphere(0.08, 4, 3), P.dark, { p: [-0.08, 0.9, 0], s: [1.4, 0.45, 0.8], r: [0, 0, 0.5] }),
    part(G.sphere(0.08, 4, 3), P.dark, { p: [0.08, 0.9, 0], s: [1.4, 0.45, 0.8], r: [0, 0, -0.5] }),
    // little arms up (casting)
    part(G.capsule(0.06, 0.16, 2, 4), P.body, { p: [-0.38, 0.55, 0.06], r: [0, 0, 0.6] }),
    part(G.capsule(0.06, 0.16, 2, 4), P.body, { p: [0.38, 0.55, 0.06], r: [0, 0, -0.6] }),
  ]);
}

/** BROODLING HIVE: big lumpy sack covered in glowing egg pods, a gaping front mouth, root feet. */
function spawner(P) {
  const pods = [[-0.42, 0.95, 0.32, 0.17], [0.38, 1.05, 0.28, 0.15], [0.55, 0.62, 0.2, 0.16], [-0.58, 0.58, 0.05, 0.15], [0.05, 1.32, 0.12, 0.14], [-0.2, 1.18, -0.38, 0.15], [0.42, 0.8, -0.45, 0.14]];
  return merge([
    part(G.sphere(0.76, 10, 7), P.body, { p: [0, 0.74, 0], s: [1, 0.92, 1] }),
    part(G.sphere(0.44, 7, 5), P.body, { p: [0.08, 1.28, -0.1] }),
    part(G.sphere(0.4, 6, 4), P.dark, { p: [0, 0.5, -0.1], s: [1.6, 0.6, 1.5] }),
    ...pods.map(([x, y, z, r]) => part(G.sphere(r, 5, 4), P.pod, { p: [x, y, z], bright: 1.25 })),
    // mouth + three beady eyes
    part(G.sphere(0.26, 7, 5), P.mouth, { p: [0, 0.6, 0.62], s: [1.25, 0.8, 0.5] }),
    part(G.cone(0.05, 0.12, 3), '#fff6e0', { p: [-0.14, 0.75, 0.68], r: [Math.PI, 0, 0] }),
    part(G.cone(0.05, 0.12, 3), '#fff6e0', { p: [0.14, 0.75, 0.68], r: [Math.PI, 0, 0] }),
    part(G.sphere(0.07, 4, 3), '#ffe03a', { p: [-0.2, 1.0, 0.6], bright: 1.2 }),
    part(G.sphere(0.08, 4, 3), '#ffe03a', { p: [0, 1.06, 0.64], bright: 1.2 }),
    part(G.sphere(0.07, 4, 3), '#ffe03a', { p: [0.2, 1.0, 0.6], bright: 1.2 }),
    // root feet
    part(G.cone(0.12, 0.3, 4), P.dark, { p: [-0.45, 0.12, 0.3], r: [Math.PI - 0.3, 0, 0.3] }),
    part(G.cone(0.12, 0.3, 4), P.dark, { p: [0.45, 0.12, 0.3], r: [Math.PI - 0.3, 0, -0.3] }),
    part(G.cone(0.12, 0.3, 4), P.dark, { p: [-0.4, 0.12, -0.4], r: [Math.PI + 0.3, 0, 0.3] }),
    part(G.cone(0.12, 0.3, 4), P.dark, { p: [0.4, 0.12, -0.4], r: [Math.PI + 0.3, 0, -0.3] }),
  ]);
}

/** SPITLING: lean lime spitter with a goo sac on its back, a long spit snout and one red scope eye. */
function sniper(P) {
  return merge([
    part(G.capsule(0.25, 0.26, 2, 7), P.body, { p: [0, 0.46, 0], r: [0.25, 0, 0] }),
    part(G.sphere(0.27, 7, 5), P.sac, { p: [0, 0.66, -0.26], s: [1, 1.05, 0.95], bright: 1.08 }),
    part(G.sphere(0.09, 4, 3), P.dark, { p: [-0.12, 0.8, -0.38] }),
    part(G.sphere(0.07, 4, 3), P.dark, { p: [0.14, 0.58, -0.46] }),
    // snout (tilted up, aimed forward) + muzzle ring
    part(G.cyl(0.075, 0.11, 0.46, 6), P.dark, { p: [0, 0.66, 0.34], r: [1.15, 0, 0] }),
    part(G.torus(0.085, 0.03, 4, 8), P.sac, { p: [0, 0.755, 0.55], r: [-0.42, 0, 0], bright: 1.2 }),
    // scope eye
    part(G.sphere(0.11, 5, 4), P.eye, { p: [0.15, 0.82, 0.16], bright: 1.3 }),
    part(G.torus(0.12, 0.03, 4, 8), '#2a2a2a', { p: [0.15, 0.82, 0.2] }),
    part(G.box(0.05, 0.05, 0.03), PUPIL, { p: [0.15, 0.82, 0.26] }),
    // legs
    part(G.cone(0.08, 0.26, 4), P.dark, { p: [-0.15, 0.12, 0.04], r: [Math.PI, 0, 0] }),
    part(G.cone(0.08, 0.26, 4), P.dark, { p: [0.15, 0.12, 0.04], r: [Math.PI, 0, 0] }),
  ]);
}

/** FLAPLING: round little bat-goo with big swept wings, ear points, one big eye and two fangs. */
function flyer(P) {
  const wing = (s) => [
    part(G.cone(0.3, 0.8, 3), P.wing, { p: [s * 0.52, 0.46, -0.04], r: [0, 0, -s * 1.27], s: [1, 1, 0.25] }),
    part(G.box(0.62, 0.035, 0.05), P.belly, { p: [s * 0.46, 0.52, 0.0], r: [0, 0, s * 0.3] }),
  ];
  return merge([
    part(G.sphere(0.3, 8, 6), P.body, { p: [0, 0.34, 0] }),
    part(G.sphere(0.2, 5, 4), P.belly, { p: [0, 0.27, 0.13], s: [1, 0.9, 0.6] }),
    ...wing(-1), ...wing(1),
    part(G.cone(0.07, 0.2, 3), P.wing, { p: [-0.14, 0.64, 0], r: [0, 0, 0.35] }),
    part(G.cone(0.07, 0.2, 3), P.wing, { p: [0.14, 0.64, 0], r: [0, 0, -0.35] }),
    part(G.sphere(0.12, 6, 4), P.eye, { p: [0, 0.4, 0.24], s: [1, 1, 0.6], bright: 1.15 }),
    part(G.sphere(0.055, 4, 3), PUPIL, { p: [0, 0.39, 0.31], s: [1, 1.2, 0.5] }),
    part(G.cone(0.03, 0.08, 3), '#ffffff', { p: [-0.06, 0.2, 0.26], r: [Math.PI, 0, 0] }),
    part(G.cone(0.03, 0.08, 3), '#ffffff', { p: [0.06, 0.2, 0.26], r: [Math.PI, 0, 0] }),
    part(G.cone(0.06, 0.28, 3), P.wing, { p: [0, 0.3, -0.36], r: [-1.6, 0, 0] }),
  ]);
}

export const NEW_BUILDERS = { blaster, healer, spawner, sniper, flyer };

/**
 * Horde material: the shared fx toon shader (flash / ice / glow / burn in aFx) plus an `aElite` instance
 * attribute that paints a pulsing gold rim (elite Murklings; works on every quality, no extra draw).
 */
export function murklingMaterial(glow = '#ffffff') {
  const m = fxToonMaterial(glow);
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('attribute vec4 aFx;', 'attribute vec4 aFx;\nattribute float aElite;\nvarying float vElite;')
      .replace('vFx = aFx;', 'vFx = aFx;\nvElite = aElite;');
    sh.fragmentShader = sh.fragmentShader
      .replace('varying vec4 vFx;', 'varying vec4 vFx;\nvarying float vElite;')
      .replace('#include <opaque_fragment>',
        'if (vElite > 0.0) {\n' +
        '  float eRim = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\n' +
        '  outgoingLight += vec3(1.0, 0.7, 0.1) * vElite * 0.07;\n' +
        '  outgoingLight = mix(outgoingLight, vec3(1.0, 0.74, 0.12) * 1.35, clamp(vElite * (0.04 + 1.25 * eRim * eRim * eRim), 0.0, 0.8));\n' +
        '}\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'fxtoonElite';
  return m;
}

/** Flat ground ring (radius 1, dark outer edge for bright roads) for swell / spit markers and pulses (vertex RGBA). */
export function buildRingGeometry() {
  return merge([
    part(new THREE.RingGeometry(0.99, 1.07, 28, 1).rotateX(-Math.PI / 2), '#202020', { a: 0.75, p: [0, -0.002, 0] }),
    part(new THREE.RingGeometry(0.84, 1, 28, 1).rotateX(-Math.PI / 2), '#ffffff', { a: 1 }),
    part(new THREE.CircleGeometry(0.84, 28).rotateX(-Math.PI / 2), '#ffffff', { a: 0.3, p: [0, -0.004, 0] }),
  ]);
}

/** Spit glob in flight: lumpy goo ball. */
export function buildGooGeometry() {
  return merge([
    part(G.sphere(0.22, 6, 4), '#c8ff3a', { bright: 1.1 }),
    part(G.sphere(0.13, 4, 3), '#f2ffb0', { p: [0.06, 0.07, 0.08] }),
    part(G.sphere(0.12, 4, 3), '#9ad81a', { p: [-0.05, -0.04, -0.16] }),
  ]);
}

/** Soft radial glow texture for the elite halo sprites (canvas, cached). */
let haloTex = null;
export function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
