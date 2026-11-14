// Grawlstone: a giant mossy stone golem with glowing cracks. Faceted rocks (jittered icosahedra, flat normals,
// per-face tone variation), moss caps, teal crystals, and a separate glow mesh (eyes + cracks) that shifts
// from amber to red-hot in phase 2. Faces +Z (toward the squad). ~8.5u tall.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial, blobShadowTexture, glowTexture } from '../materials.js';

const _c = new THREE.Color();

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** Faceted rock: jittered icosahedron, non-indexed with flat normals and per-face color variation. */
export function rock(r, color, seed = 1, opts = {}) {
  const geo = new THREE.IcosahedronGeometry(r, opts.detail ?? 1);
  const pos = geo.attributes.position;
  const jit = opts.jitter ?? 0.16;
  // jitter shared vertices consistently: key by rounded position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 1000) * 0.73 + Math.round(y * 1000) * 1.31 + Math.round(z * 1000) * 2.17 + seed * 17.3;
    const s = 1 + (hash(k) - 0.5) * 2 * jit;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const sc = opts.s || [1, 1, 1];
  g.scale(sc[0], sc[1], sc[2]);
  if (opts.r) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.r)));
  const p = opts.p || [0, 0, 0];
  g.translate(p[0], p[1], p[2]);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(color);
  const top = opts.top ? new THREE.Color(opts.top) : null;
  for (let f = 0; f < n / 3; f++) {
    const v = 0.86 + hash(f * 3.7 + seed) * 0.24;
    _c.copy(base).multiplyScalar(v);
    // faces pointing up get the "top" color (moss)
    if (top && g.attributes.normal.getY(f * 3) > 0.45) _c.copy(top).multiplyScalar(0.9 + hash(f + seed * 9) * 0.2);
    for (let k = 0; k < 3; k++) { col[(f * 3 + k) * 3] = _c.r; col[(f * 3 + k) * 3 + 1] = _c.g; col[(f * 3 + k) * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const STONE = '#8a7c6c', STONE_DARK = '#62574c', MOSS = '#58c447', MOSS_DARK = '#3f9c3c', CRYSTAL = '#5fe8ff';
// front surface of the torso ellipsoid (radius 2.05, scale 1.28 x 1 x 0.92), pushed out past the rock jitter
const surfZ = (x, y) => 0.92 * Math.sqrt(Math.max(0, 2.05 * 2.05 - (x / 1.28) ** 2 - y * y)) + 0.3;
const cp = (x, y) => [x, y, surfZ(x, y)];

/** Jagged crack strip: chain of thin boxes. pts: [[x,y,z], ...] on the rock surface. */
function crack(pts, w = 0.2) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const box = new THREE.BoxGeometry(w, len + w * 0.6, 0.06);
    const ang = Math.atan2(b.x - a.x, b.y - a.y);
    parts.push(part(box, '#ffffff', { p: [mid.x, mid.y, mid.z], r: [0, 0, -ang] }));
  }
  return parts;
}

export function buildGrawlstone() {
  const mat = toonMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffb43a', toneMapped: false, fog: false });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, parent, m = mat) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; parent.add(mesh); return mesh; };

  // legs (static)
  mk(merge([
    rock(0.95, STONE_DARK, 3, { p: [-1.2, 0.95, 0], s: [1, 1.15, 1] }),
    rock(0.95, STONE_DARK, 4, { p: [1.2, 0.95, 0], s: [1, 1.15, 1] }),
    rock(0.6, STONE, 5, { p: [-1.25, 0.35, 0.45], s: [1.3, 0.6, 1.2] }),
    rock(0.6, STONE, 6, { p: [1.25, 0.35, 0.45], s: [1.3, 0.6, 1.2] }),
  ]), root);

  // torso + moss + crystals
  const torso = new THREE.Group();
  torso.position.set(0, 3.4, 0);
  body.add(torso);
  mk(merge([
    rock(2.05, STONE, 11, { s: [1.28, 1.0, 0.92], top: MOSS, jitter: 0.12 }),
    rock(1.1, STONE_DARK, 12, { p: [0, -1.25, 0.2], s: [1.4, 0.7, 1] }),
    rock(0.9, MOSS_DARK, 13, { p: [0, 1.55, -0.4], s: [1.9, 0.5, 1.3], top: MOSS }),
    part(G.cone(0.32, 1.3, 5), CRYSTAL, { p: [-0.9, 1.9, -1.0], r: [-0.4, 0, 0.35], bright: 1.2 }),
    part(G.cone(0.25, 1.0, 5), CRYSTAL, { p: [-0.4, 2.0, -1.3], r: [-0.6, 0, -0.1], bright: 1.2 }),
    part(G.cone(0.28, 1.15, 5), CRYSTAL, { p: [0.9, 1.85, -1.05], r: [-0.45, 0, -0.4], bright: 1.2 }),
  ]), torso);
  // glowing chest cracks (on the front surface, z ~ 1.85)
  const cracks = mk(merge([
    ...crack([cp(-0.05, 1.15), cp(-0.4, 0.55), cp(-0.1, 0.0), cp(-0.55, -0.6), cp(-0.35, -1.1)]),
    ...crack([cp(-0.4, 0.55), cp(-1.1, 0.3), cp(-1.5, 0.55)], 0.15),
    ...crack([cp(0.55, 1.0), cp(0.9, 0.3), cp(0.5, -0.35), cp(0.85, -0.9)], 0.18),
    ...crack([cp(0.9, 0.3), cp(1.5, 0.05)], 0.14),
    part(G.sphere(0.42, 10, 8), '#ffffff', { p: [0.2, 0.05, surfZ(0.2, 0.05) - 0.12], s: [1, 1, 0.5] }),
  ]), torso, glowMat);
  cracks.castShadow = false;
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb43a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  core.scale.set(2.4, 2.4, 1);
  core.position.set(0.2, 0.05, surfZ(0.2, 0.05) + 0.1);
  torso.add(core);

  // head with brow + glowing eyes
  const head = new THREE.Group();
  head.position.set(0, 5.75, 0.35);
  body.add(head);
  mk(merge([
    rock(0.95, STONE, 21, { s: [1.15, 0.9, 1], top: MOSS, jitter: 0.14 }),
    rock(0.55, STONE_DARK, 22, { p: [0, 0.32, 0.6], s: [1.9, 0.45, 0.7] }),
    rock(0.45, STONE_DARK, 23, { p: [0, -0.55, 0.45], s: [1.5, 0.6, 0.9] }),
  ]), head);
  const eyes = mk(merge([
    part(G.box(0.44, 0.2, 0.12), '#ffffff', { p: [-0.36, 0.04, 1.04], r: [0, 0.2, 0.2] }),
    part(G.box(0.44, 0.2, 0.12), '#ffffff', { p: [0.36, 0.04, 1.04], r: [0, -0.2, -0.2] }),
    part(G.box(0.6, 0.09, 0.1), '#ffffff', { p: [0, -0.46, 0.98] }),
  ]), head, glowMat);
  eyes.castShadow = false;

  // arms: pivot at the shoulder; hanging fists by default
  const arms = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(2.45 * side, 4.55, 0);
    body.add(g);
    mk(merge([
      rock(0.85, STONE, 31 + side, { s: [1.1, 0.9, 1.0], top: MOSS }),
      rock(0.62, STONE_DARK, 33 + side, { p: [0.25 * side, -1.2, 0], s: [0.9, 1.3, 0.9] }),
      rock(0.98, STONE, 35 + side, { p: [0.3 * side, -2.55, 0.15], s: [1.1, 1.0, 1.05], top: MOSS }),
    ]), g);
    const knuckles = mk(merge(crack([[0.3 * side - 0.45, -2.35, 1.22], [0.3 * side, -2.8, 1.28], [0.3 * side + 0.45, -2.35, 1.22]], 0.14)), g, glowMat);
    knuckles.castShadow = false;
    return g;
  });

  // soft contact shadow (the boss stands outside the squad's shadow-map frustum)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1f2f5a', alphaMap: blobShadowTexture(), transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.scale.set(7.5, 1, 5);
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  root.add(shadow);
  root.scale.setScalar(1.18);
  return { root, body, torso, head, arms, mat, glowMat, shadow, core };
}

/** Falling boulder used by the slam attack (shared geometry). */
let boulderGeo = null;
export function boulderGeometry() {
  if (!boulderGeo) boulderGeo = rock(1, STONE, 77, { top: MOSS, jitter: 0.2 });
  return boulderGeo;
}
