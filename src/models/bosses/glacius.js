// GLACIUS: a frost giant in deep-blue plate armour over a body of faceted glacier ice. Crystal crown, icicle
// beard under a heavy angry brow, glowing ice-blue eyes and chest rune, spiked pauldrons, ice shards jutting
// from his back and two huge fists of solid ice. Separate meshes for legs / torso / head / arms (posed by the
// boss class), one glow material (eyes, rune, knuckles: animated) and one crystal material (crown + spikes).
// Also the attack props: ice wall slab, falling icicle, frozen-lane spike cluster. Faces +Z. ~9.4u tall.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { contactShadow, glowSprite } from './common.js';
import { rock } from './grawlstone.js';

const ARMOR = '#2c4a86', ARMOR_DARK = '#1b2f5c', SILVER = '#d4e8ff', ICE = '#8fd2ff', ICE_DEEP = '#3f86d0';
const SNOW = '#f4fbff', SKIN = '#86b8ea', SKIN_DARK = '#5a8cc4', CRYSTAL = '#ffffff';

/** Upper half sphere (helmet / pauldron shell). */
const dome = (r, color, opts) => part(new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI * 0.5), color, opts);

/** Curved armour plate: open cylinder segment facing +Z (arc in radians), centred at its height. */
const curved = (r, h, arc, color, opts) => part(new THREE.CylinderGeometry(r, r * 0.97, h, 20, 1, true, -arc / 2, arc), color, opts);

/** Hexagonal ice crystal (prism with a pointed cap), base at the origin pointing +Y, then placed. */
function crystal(r, h, color, opts = {}) {
  const tip = h * 0.32;
  const g = merge([
    part(G.cyl(r, r * 0.92, h - tip, 6), color, { p: [0, (h - tip) / 2, 0], bright: opts.bright }),
    part(G.cone(r, tip, 6), color, { p: [0, h - tip / 2, 0], bright: (opts.bright || 1) * 1.08 }),
  ]);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(opts.p || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.r || [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1),
  );
  return g.applyMatrix4(m);
}

export function buildGlacius() {
  const mat = toonMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', toneMapped: false, fog: false });
  // crystals: lit toon ice with a cold inner glow (emissive animated by the boss class)
  const crystalMat = toonMaterial({ emissive: new THREE.Color('#2c6ea8') });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // ---- legs (static): armoured thighs, ice knee caps, glacier boots ----
  const legs = [];
  for (const s of [-1, 1]) {
    legs.push(
      rock(0.95, ICE, 41 + s, { p: [1.25 * s, 0.55, 0.25], s: [1.25, 0.7, 1.45], top: SNOW, jitter: 0.14 }),
      part(G.cyl(0.62, 0.7, 1.6, 10), ARMOR_DARK, { p: [1.2 * s, 1.75, 0] }),
      part(G.box(1.35, 1.05, 0.32), ARMOR, { p: [1.2 * s, 2.05, 0.6], r: [-0.12, 0, 0] }),
      rock(0.48, ICE, 43 + s, { p: [1.2 * s, 1.25, 0.62], s: [1.1, 0.9, 0.8], jitter: 0.1 }),
      part(G.box(1.45, 0.12, 0.36), SILVER, { p: [1.2 * s, 2.55, 0.66], r: [-0.12, 0, 0] }),
    );
  }
  mk(merge(legs), body);

  // ---- torso: glacier-ice core under a breastplate, belt, abdomen bands, back shards ----
  const torso = new THREE.Group();
  torso.position.set(0, 4.25, 0);
  body.add(torso);
  const plateZ = 1.95; // chest front (rune sits just outside the curved plate)
  mk(merge([
    rock(1.95, ICE_DEEP, 51, { s: [1.3, 1.08, 0.95], top: SNOW, jitter: 0.1 }),
    // curved breastplate wrapping the chest + silver rims, two abdomen bands, belt with a buckle frame
    curved(2.12, 1.95, 2.2, ARMOR, { p: [0, 0.55, 0.05], s: [1.2, 1, 1.02] }),
    curved(2.16, 0.16, 2.24, SILVER, { p: [0, 1.52, 0.05], s: [1.2, 1, 1.02] }),
    curved(2.16, 0.16, 2.24, SILVER, { p: [0, -0.42, 0.05], s: [1.2, 1, 1.02] }),
    curved(2.02, 0.4, 2.0, ARMOR_DARK, { p: [0, -0.8, 0.05], s: [1.2, 1, 1.0] }),
    curved(1.98, 0.4, 1.8, ARMOR, { p: [0, -1.22, 0.05], s: [1.18, 1, 0.98] }),
    part(G.torus(1.95, 0.24, 6, 26), ARMOR_DARK, { p: [0, -1.6, 0.05], r: [Math.PI / 2, 0, 0], s: [1.18, 0.95, 1] }),
    part(G.box(0.9, 0.62, 0.3), SILVER, { p: [0, -1.6, 2.25] }),
    // silver chevron over the rune
    part(G.box(0.16, 1.15, 0.12), SILVER, { p: [-0.52, 0.85, 2.2], r: [0, 0, 0.62] }),
    part(G.box(0.16, 1.15, 0.12), SILVER, { p: [0.52, 0.85, 2.2], r: [0, 0, -0.62] }),
    // icy fur collar
    rock(0.75, SNOW, 52, { p: [-1.0, 1.75, 0.45], s: [1.5, 0.6, 1.2], jitter: 0.2 }),
    rock(0.75, SNOW, 53, { p: [1.0, 1.75, 0.45], s: [1.5, 0.6, 1.2], jitter: 0.2 }),
    rock(0.7, SNOW, 54, { p: [0, 1.9, -0.25], s: [2.0, 0.6, 1.4], jitter: 0.2 }),
  ]), torso);

  // ---- glow: eyes / chest rune / buckle (one material) ----
  const rune = [
    part(new THREE.OctahedronGeometry(0.42), '#ffffff', { p: [0, 0.55, plateZ + 0.3], s: [0.85, 1.3, 0.45] }),
    part(G.box(0.1, 1.25, 0.06), '#ffffff', { p: [0, 0.55, plateZ + 0.3], r: [-0.14, 0, 0] }),
    part(G.box(0.08, 0.7, 0.06), '#ffffff', { p: [-0.4, 0.75, plateZ + 0.3], r: [-0.14, 0, 0.75] }),
    part(G.box(0.08, 0.7, 0.06), '#ffffff', { p: [0.4, 0.75, plateZ + 0.3], r: [-0.14, 0, -0.75] }),
    part(G.box(0.08, 0.55, 0.06), '#ffffff', { p: [-0.36, 0.2, plateZ + 0.33], r: [-0.14, 0, -0.75] }),
    part(G.box(0.08, 0.55, 0.06), '#ffffff', { p: [0.36, 0.2, plateZ + 0.33], r: [-0.14, 0, 0.75] }),
    part(new THREE.OctahedronGeometry(0.24), '#ffffff', { p: [0, -1.6, 2.42], s: [1.2, 0.9, 0.5] }),
  ];
  const runeMesh = mk(merge(rune), torso, glowMat, false);
  const core = glowSprite('#7fe8ff', 2.6, 0.85);
  core.position.set(0, 0.55, plateZ + 0.5);
  torso.add(core);

  // ---- back shards + pauldrons with ice spikes (crystal material) ----
  const shards = [
    crystal(0.42, 2.6, '#cfefff', { p: [0, 1.2, -1.5], r: [-0.55, 0, 0] }),
    crystal(0.34, 2.0, '#b4e4ff', { p: [-0.95, 1.0, -1.35], r: [-0.5, 0, 0.35] }),
    crystal(0.34, 2.1, '#b4e4ff', { p: [0.95, 1.0, -1.35], r: [-0.5, 0, -0.35] }),
    crystal(0.26, 1.4, '#9fdcff', { p: [-0.5, 0.3, -1.65], r: [-0.9, 0, 0.2] }),
    crystal(0.26, 1.5, '#9fdcff', { p: [0.55, 0.25, -1.65], r: [-0.9, 0, -0.2] }),
  ];
  const plates = [];
  for (const s of [-1, 1]) {
    const x = 2.35 * s;
    plates.push(
      dome(1.25, ARMOR, { p: [x, 1.15, 0], s: [1.15, 0.85, 1.1] }),
      part(G.torus(1.25, 0.12, 6, 24), SILVER, { p: [x, 1.15, 0], r: [Math.PI / 2, 0, 0], s: [1.15, 1.1, 1] }),
      part(G.box(1.5, 0.5, 1.6), ARMOR_DARK, { p: [x * 1.05, 0.55, 0], r: [0, 0, 0.25 * s] }),
    );
    shards.push(
      crystal(0.3, 1.45, '#d8f4ff', { p: [x + 0.15 * s, 1.85, 0.25], r: [0.15, 0, -0.45 * s] }),
      crystal(0.24, 1.1, '#bde8ff', { p: [x + 0.65 * s, 1.55, -0.2], r: [-0.1, 0, -0.95 * s] }),
      crystal(0.22, 0.95, '#bde8ff', { p: [x - 0.35 * s, 1.95, -0.45], r: [-0.35, 0, -0.15 * s] }),
    );
  }
  mk(merge(plates), torso);
  const shardMesh = mk(merge(shards), torso, crystalMat);

  // ---- head: pale-blue face, helmet, dark visor with glowing eyes, frost brows, icicle beard, crystal crown ----
  const head = new THREE.Group();
  head.position.set(0, 6.95, 0.75);
  head.scale.setScalar(1.3);
  body.add(head);
  const beard = [];
  [-0.78, -0.52, -0.26, 0, 0.26, 0.52, 0.78].forEach((x, i) => {
    const len = 1.75 - Math.abs(x) * 0.9 + (i % 2) * 0.25;
    beard.push(part(G.cone(0.19 + (i % 2) * 0.04, len, 6), i % 2 ? '#eaf8ff' : '#bfe6ff', { p: [x, -0.95 - len / 2, 0.95 - Math.abs(x) * 0.3], r: [Math.PI + 0.22, 0, x * 0.25], bright: 1.05 }));
  });
  mk(merge([
    part(G.sphere(0.95, 18, 14), SKIN, { s: [1.08, 1.05, 1.0] }),
    dome(1.02, ARMOR, { p: [0, 0.18, -0.05], s: [1.1, 0.9, 1.08] }),
    part(G.torus(1.02, 0.1, 5, 24), SILVER, { p: [0, 0.2, -0.05], r: [Math.PI / 2, 0, 0], s: [1.1, 1.08, 1] }),
    // dark visor band the eyes glow out of
    part(G.box(1.55, 0.42, 0.5), ARMOR_DARK, { p: [0, -0.02, 0.72] }),
    // cheek guards
    part(G.box(0.3, 0.9, 0.9), ARMOR, { p: [-0.98, -0.3, 0.25], r: [0, 0.25, 0.1] }),
    part(G.box(0.3, 0.9, 0.9), ARMOR, { p: [0.98, -0.3, 0.25], r: [0, -0.25, -0.1] }),
    // bushy frost brows (angry V), nose
    rock(0.3, SNOW, 62, { p: [-0.45, 0.32, 0.95], s: [1.7, 0.55, 0.7], r: [0, 0, -0.32], jitter: 0.25 }),
    rock(0.3, SNOW, 63, { p: [0.45, 0.32, 0.95], s: [1.7, 0.55, 0.7], r: [0, 0, 0.32], jitter: 0.25 }),
    part(G.cone(0.17, 0.45, 5), SKIN_DARK, { p: [0, -0.3, 1.02], r: [Math.PI / 2 - 0.25, 0, 0] }),
    // big snowy beard hanging over the chest, moustache, icicles
    rock(0.7, SNOW, 61, { p: [0, -0.85, 0.75], s: [1.5, 0.95, 0.75], jitter: 0.2 }),
    part(G.capsule(0.15, 0.6, 3, 8), SNOW, { p: [-0.36, -0.5, 1.05], r: [0, 0, 1.2] }),
    part(G.capsule(0.15, 0.6, 3, 8), SNOW, { p: [0.36, -0.5, 1.05], r: [0, 0, -1.2] }),
    ...beard,
  ]), head);
  const eyes = mk(merge([
    part(G.box(0.46, 0.17, 0.1), '#ffffff', { p: [-0.36, 0.0, 0.98], r: [0, 0.15, -0.22] }),
    part(G.box(0.46, 0.17, 0.1), '#ffffff', { p: [0.36, 0.0, 0.98], r: [0, -0.15, 0.22] }),
  ]), head, glowMat, false);
  // crown: silver band + seven crystal spires (tallest at the front)
  const crown = new THREE.Group();
  crown.position.set(0, 0.62, -0.05);
  head.add(crown);
  const spires = [];
  for (let i = 0; i < 9; i++) {
    const a = ((i - 4) / 4) * 1.75;
    const x = Math.sin(a) * 0.98, z = Math.cos(a) * 0.98;
    const h = 1.45 - Math.abs(i - 4) * 0.2;
    spires.push(crystal(0.17 + (i === 4 ? 0.06 : 0), h, i % 2 ? '#dff8ff' : '#a6e8ff', { p: [x, 0.05, z], r: [z * 0.18, 0, -x * 0.22] }));
  }
  mk(merge([
    part(G.cyl(1.04, 1.0, 0.32, 20, true), SILVER, { p: [0, 0.02, 0] }),
    part(G.torus(1.04, 0.07, 5, 24), '#9ab8e0', { p: [0, 0.17, 0], r: [Math.PI / 2, 0, 0] }),
  ]), crown);
  const crownMesh = mk(merge(spires), crown, crystalMat);

  // ---- arms: shoulder pivot; ice upper arm, armoured bracer, huge ice fist with crystal knuckles ----
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(2.55 * s, 5.3, 0);
    body.add(g);
    mk(merge([
      rock(0.72, ICE_DEEP, 71 + s, { p: [0.12 * s, -0.95, 0], s: [1.0, 1.35, 1.0], top: SNOW }),
      part(G.cyl(0.66, 0.74, 1.05, 10), ARMOR, { p: [0.22 * s, -2.0, 0.05] }),
      part(G.torus(0.7, 0.09, 5, 16), SILVER, { p: [0.22 * s, -1.5, 0.05], r: [Math.PI / 2, 0, 0] }),
      part(G.torus(0.76, 0.09, 5, 16), SILVER, { p: [0.22 * s, -2.5, 0.05], r: [Math.PI / 2, 0, 0] }),
      rock(1.1, ICE, 73 + s, { p: [0.28 * s, -3.15, 0.2], s: [1.12, 1.0, 1.12], top: SNOW, jitter: 0.12 }),
    ]), g);
    const knuck = mk(merge([-0.45, 0, 0.45].map((dx) => crystal(0.15, 0.6, '#e4f9ff', { p: [0.28 * s + dx, -2.75, 1.25], r: [1.25, 0, 0] }))), g, crystalMat);
    knuck.castShadow = false;
    const line = mk(merge([part(G.box(1.2, 0.09, 0.08), '#ffffff', { p: [0.28 * s, -3.2, 1.33] })]), g, glowMat, false);
    line.castShadow = false;
    return g;
  });

  const aura = glowSprite('#8fe8ff', 13, 0);
  aura.position.set(0, 3.2, 0.5);
  root.add(aura);
  const shadow = contactShadow(9, 6.5, 0.45);
  root.add(shadow);
  root.scale.setScalar(1.12);
  return { root, body, torso, head, crown, arms, mat, glowMat, crystalMat, eyes, runeMesh, shardMesh, crownMesh, core, aura, shadow };
}

// ---------------- attack props (shared geometry, built once) ----------------
let wallGeo = null, icicleGeo = null, spikeGeo = null;

/** Ice wall slab: a row of crystal pillars, 1u wide (scaled to the lane width), ~3.2u tall, base at y = 0. */
export function iceWallGeometry() {
  if (wallGeo) return wallGeo;
  // a clear slab silhouette: blue ice blocks (staggered, slightly tilted), a frosty cap, crystals on top
  const parts = [
    part(G.box(0.98, 1.3, 0.5), '#2f78d0', { p: [0, 0.65, 0] }),
    part(G.box(0.5, 1.1, 0.48), '#3f8ee0', { p: [-0.25, 1.85, 0.01], r: [0, 0, 0.03] }),
    part(G.box(0.48, 1.25, 0.47), '#2a6cc4', { p: [0.25, 1.9, -0.01], r: [0, 0, -0.03] }),
    part(G.box(1.04, 0.16, 0.56), '#cfeeff', { p: [0, 1.32, 0] }),
    part(G.box(0.56, 0.14, 0.54), '#e6f7ff', { p: [-0.25, 2.45, 0] }),
    part(G.box(0.54, 0.14, 0.53), '#e6f7ff', { p: [0.25, 2.56, 0] }),
    rock(0.3, '#7fc4f8', 82, { p: [-0.36, 0.15, 0.25], s: [0.8, 0.6, 0.9], jitter: 0.2 }),
    rock(0.3, '#7fc4f8', 83, { p: [0.38, 0.12, 0.22], s: [0.8, 0.5, 0.9], jitter: 0.2 }),
  ];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = -0.4 + (i / (n - 1)) * 0.8;
    const h = 0.6 + ((i * 5) % 3) * 0.28;
    parts.push(crystal(0.08, h, i % 2 ? '#bfe8ff' : '#6fb8f8', { p: [x, 2.5, 0], r: [0, 0, (i - 2) * 0.16] }));
  }
  wallGeo = merge(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  return wallGeo;
}

/** Falling icicle: long crystal pointing down (tip at y = 0), ~2.4u. */
export function icicleGeometry() {
  if (icicleGeo) return icicleGeo;
  icicleGeo = merge([
    crystal(0.3, 2.4, '#d6f3ff', { p: [0, 2.4, 0], r: [Math.PI, 0, 0] }),
    crystal(0.14, 1.1, '#9fdcff', { p: [0.24, 2.3, 0.05], r: [Math.PI - 0.25, 0, 0] }),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  return icicleGeo;
}

/** Ice spike cluster for frozen lanes (1u footprint, ~0.9u tall). */
export function frostSpikeGeometry() {
  if (spikeGeo) return spikeGeo;
  spikeGeo = merge([
    crystal(0.13, 0.85, '#e8f8ff', { p: [0, 0, 0], r: [0.1, 0, 0.12] }),
    crystal(0.1, 0.6, '#b8e6ff', { p: [0.22, 0, 0.1], r: [0.2, 0, -0.45] }),
    crystal(0.09, 0.5, '#b8e6ff', { p: [-0.2, 0, -0.08], r: [-0.25, 0, 0.5] }),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  return spikeGeo;
}
