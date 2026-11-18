// Rescue cage (stage 4): a stubby iron cage on a stone plinth with a few trapped Raiders inside, a front door of
// bars and a big golden padlock (the shoot target). Merged, vertex-coloured, cached; one visual per live cage
// (pooled by the cage system). Low quality: the low-poly Raider shape inside and no shadow casting.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { buildRaiderGeometry, buildRaiderLowGeometry } from './raider.js';
import { createLabel, labelMesh } from './labels.js';

export const CAGE = { w: 2.6, d: 2.2, h: 2.3, lockZ: 1.25, lockY: 1.05, scale: 1.25 }; // scale: the whole visual (sweep uses lockZ * scale)

const cache = {};
function bodyGeometry() {
  if (cache.body) return cache.body;
  const { w, d, h } = CAGE, hw = w / 2, hd = d / 2;
  const iron = '#4a4f63', ironLite = '#6c7390', stone = '#9b927f', stoneDark = '#7a7262', gold = '#ffc531';
  const parts = [
    part(G.box(w + 0.4, 0.28, d + 0.4), stone, { p: [0, 0.14, 0] }),
    part(G.box(w + 0.5, 0.08, d + 0.5), stoneDark, { p: [0, 0.02, 0] }),
    // roof: a slab + a little dome cap with a gold knob
    part(G.box(w + 0.2, 0.18, d + 0.2), iron, { p: [0, h, 0] }),
    part(G.cyl(0.55, 0.8, 0.3, 8), ironLite, { p: [0, h + 0.24, 0] }),
    part(G.sphere(0.18, 8, 6), gold, { p: [0, h + 0.48, 0], bright: 1.2 }),
    // corner posts
    ...[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([x, z]) => part(G.box(0.2, h, 0.2), iron, { p: [x, h / 2 + 0.1, z] })),
    // a band halfway up on the sides and back
    part(G.box(w, 0.1, 0.12), ironLite, { p: [0, h * 0.55, -hd] }),
    part(G.box(0.12, 0.1, d), ironLite, { p: [-hw, h * 0.55, 0] }),
    part(G.box(0.12, 0.1, d), ironLite, { p: [hw, h * 0.55, 0] }),
  ];
  // side + back bars
  for (let i = 1; i < 6; i++) {
    const f = i / 6;
    parts.push(part(G.cyl(0.045, 0.045, h - 0.1, 5), iron, { p: [-hw + w * f, h / 2 + 0.12, -hd] }));
    if (i < 5) {
      const z = -hd + d * (i / 5);
      parts.push(part(G.cyl(0.045, 0.045, h - 0.1, 5), iron, { p: [-hw, h / 2 + 0.12, z] }));
      parts.push(part(G.cyl(0.045, 0.045, h - 0.1, 5), iron, { p: [hw, h / 2 + 0.12, z] }));
    }
  }
  cache.body = merge(parts);
  return cache.body;
}

/** The front door (bars + frame), pivoting on its left edge: geometry origin at the hinge. */
function doorGeometry() {
  if (cache.door) return cache.door;
  const { w, h } = CAGE, iron = '#4a4f63', lite = '#6c7390';
  const parts = [
    part(G.box(w - 0.1, 0.12, 0.1), lite, { p: [w / 2, 0.22, 0] }),
    part(G.box(w - 0.1, 0.12, 0.1), lite, { p: [w / 2, h - 0.12, 0] }),
    part(G.box(w - 0.1, 0.1, 0.1), lite, { p: [w / 2, h * 0.55, 0] }),
  ];
  for (let i = 1; i < 6; i++) parts.push(part(G.cyl(0.05, 0.05, h - 0.2, 5), iron, { p: [w * i / 6, h / 2 + 0.06, 0] }));
  cache.door = merge(parts);
  return cache.door;
}

function lockGeometry() {
  if (cache.lock) return cache.lock;
  cache.lock = merge([
    part(G.box(0.62, 0.52, 0.22), '#ffc531', { p: [0, 0, 0] }),
    part(G.box(0.5, 0.08, 0.24), '#ffe27a', { p: [0, 0.2, 0], bright: 1.15 }),
    part(G.torus(0.2, 0.06, 6, 12, Math.PI), '#d9dde8', { p: [0, 0.26, 0] }),
    part(G.cyl(0.06, 0.06, 0.06, 6), '#5a3d08', { p: [0, -0.04, 0.11], r: [Math.PI / 2, 0, 0] }),
    part(G.box(0.05, 0.14, 0.04), '#5a3d08', { p: [0, -0.13, 0.12] }),
  ]);
  return cache.lock;
}

/** Up to 5 trapped Raiders standing inside, facing the road (merged; low = the light Raider). */
function prisonersGeometry(low) {
  const key = low ? 'plow' : 'phigh';
  if (cache[key]) return cache[key];
  const spots = [[0, 0.2, 0.25], [-0.65, 0.2, -0.35], [0.65, 0.2, -0.3], [-0.35, 0.2, 0.55], [0.4, 0.2, 0.6]];
  const parts = spots.map(([x, y, z], i) => {
    const g = (low ? buildRaiderLowGeometry() : buildRaiderGeometry()).clone();
    g.rotateY(Math.PI + (i - 2) * 0.25);
    g.translate(x, y + 0.08, z);
    return g;
  });
  cache[key] = merge(parts);
  return cache[key];
}

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    body: new THREE.MeshLambertMaterial({ vertexColors: true }),
    lock: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#b8801a', emissiveIntensity: 0.45 }),
    raider: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1b3a8a', emissiveIntensity: 0.12 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.35, depthWrite: false }),
  };
  return mats;
}

let ringGeo = null;
/** One cage visual: group with body, door (hinged), lock, prisoners, ground glow ring and a "+N" label. */
export function buildCageVisual(low) {
  const m = materials();
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(), m.body);
  body.castShadow = !low; body.receiveShadow = true;
  const door = new THREE.Mesh(doorGeometry(), m.body);
  const hinge = new THREE.Group();
  hinge.position.set(-CAGE.w / 2, 0.1, CAGE.d / 2);
  hinge.add(door);
  const lock = new THREE.Mesh(lockGeometry(), m.lock);
  lock.position.set(0, CAGE.lockY, CAGE.lockZ);
  const prisoners = new THREE.Mesh(prisonersGeometry(low), m.raider);
  if (!ringGeo) ringGeo = new THREE.RingGeometry(1.75, 2.05, 28).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, m.glow);
  ring.position.y = 0.04;
  ring.renderOrder = 1;
  const label = createLabel(256, 128);
  const lmesh = labelMesh(label, 2.8, 1.4);
  lmesh.position.set(0, CAGE.h + 1.2, 0.2);
  group.add(body, hinge, lock, prisoners, ring, lmesh);
  group.scale.setScalar(CAGE.scale);
  return { group, body, hinge, door, lock, prisoners, ring, label, labelMesh: lmesh, low };
}
