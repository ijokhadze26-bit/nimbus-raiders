// Tempest King: a crowned thunder-cloud titan. A towering storm-cloud torso tapering to a wispy tail,
// a stern face (glowing slanted eyes, jagged glowing mouth, a white cloud beard), a tall gold crown with
// gems, and arms made of crackling lightning ending in cloud fists. Lightning recolours (yellow -> violet)
// and the crown gems flare in phase 2. Faces +Z. Floats; ~12u tall.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { cloud, contactShadow, glowSprite, zigzag } from './common.js';

const TOP = '#9aa3d6', BOT = '#3f4670', BEARD_TOP = '#ffffff', BEARD_BOT = '#b9c2e6', GOLD = '#ffc531', GOLD_DARK = '#c98a12';

/** Jagged glowing mouth: a zigzag of thin bars across the face. */
function mouth() {
  const pts = [[-0.55, -0.12], [-0.28, -0.3], [0, -0.14], [0.28, -0.3], [0.55, -0.12]];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[i + 1];
    out.push(part(G.box(Math.hypot(nx - x, ny - y) + 0.09, 0.1, 0.08), '#ffffff', { p: [(x + nx) / 2, (y + ny) / 2, 1.74], r: [0, 0, Math.atan2(ny - y, nx - x)] }));
  }
  return out;
}

export function buildTempestKing() {
  const mat = toonMaterial();
  const boltMat = new THREE.MeshBasicMaterial({ color: '#fff27a', toneMapped: false, fog: false });
  const faceMat = new THREE.MeshBasicMaterial({ color: '#fff6b0', toneMapped: false, fog: false });
  const gemMat = new THREE.MeshBasicMaterial({ color: '#59e8ff', toneMapped: false, fog: false });
  const root = new THREE.Group();
  const body = new THREE.Group();         // hover bob
  root.add(body);
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // storm-cloud torso: broad shoulders, chest, tapering wisp tail
  mk(cloud([
    [0, 7.2, -0.4, 2.9, 1.25, 1, 1], [-2.6, 7.9, -0.2, 1.8], [2.6, 7.9, -0.2, 1.8], [-1.4, 8.9, -0.6, 1.7], [1.4, 8.9, -0.6, 1.7],
    [0, 5.4, 0, 2.3, 1.15, 1, 1], [-1.6, 5.9, 0.3, 1.4], [1.6, 5.9, 0.3, 1.4], [0, 4.0, 0.1, 1.7],
    [-0.9, 3.4, 0.4, 1.1], [0.9, 3.3, 0.2, 1.05], [0, 2.4, 0.3, 1.0], [-0.4, 1.6, 0.5, 0.75], [0.3, 1.05, 0.6, 0.5],
    [0, 7.6, -2.0, 2.4, 1.4, 1.1, 0.9], [-3.6, 8.4, -0.6, 1.25], [3.6, 8.4, -0.6, 1.25],
  ], TOP, BOT, 16), body);

  // head: cloud dome with a glowing face, beard and crown
  const head = new THREE.Group();
  head.position.set(0, 9.6, 0.9);
  body.add(head);
  mk(cloud([
    [0, 0.2, 0, 1.75, 1.1, 1, 1], [-1.2, 0.9, -0.2, 1.0], [1.2, 0.9, -0.2, 1.0], [0, 1.2, -0.3, 1.2],
  ], TOP, '#5d6487', 16), head);
  // brows (dark storm puffs) + beard (white cloud)
  mk(cloud([[-0.75, 0.75, 1.45, 0.42, 1.6, 0.6, 0.8], [0.75, 0.75, 1.45, 0.42, 1.6, 0.6, 0.8]], '#4a527e', '#2e3458', 10), head);
  mk(cloud([
    [0, -1.0, 1.2, 0.95, 1.4, 0.9, 0.9], [-0.85, -0.7, 1.15, 0.7], [0.85, -0.7, 1.15, 0.7], [0, -1.9, 1.0, 0.75], [-0.45, -2.5, 0.9, 0.5], [0.4, -2.6, 0.9, 0.45],
  ], BEARD_TOP, BEARD_BOT, 12), head);
  const face = mk(merge([
    part(G.box(0.62, 0.2, 0.12), '#ffffff', { p: [-0.62, 0.42, 1.68], r: [0, -0.2, -0.32] }),
    part(G.box(0.62, 0.2, 0.12), '#ffffff', { p: [0.62, 0.42, 1.68], r: [0, 0.2, 0.32] }),
    ...mouth(),
  ]), head, faceMat, false);

  // crown: gold ring, seven tall spikes with ball tips, gems on the band
  const crown = new THREE.Group();
  crown.position.set(0, 1.85, -0.1);
  head.add(crown);
  const crownParts = [part(G.cyl(1.35, 1.25, 0.65, 24, true), GOLD), part(G.torus(1.35, 0.1, 6, 28), GOLD_DARK, { p: [0, 0.32, 0], r: [Math.PI / 2, 0, 0] }), part(G.torus(1.25, 0.1, 6, 28), GOLD_DARK, { p: [0, -0.32, 0], r: [Math.PI / 2, 0, 0] })];
  const gems = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const x = Math.sin(a) * 1.32, z = Math.cos(a) * 1.32;
    const h = i === 0 ? 1.6 : 1.1;
    crownParts.push(part(G.cone(0.3, h, 4), GOLD, { p: [x, 0.3 + h / 2, z], r: [0, a + Math.PI / 4, 0] }));
    crownParts.push(part(G.sphere(0.15, 8, 6), GOLD_DARK, { p: [x, 0.36 + h, z] }));
    gems.push(part(new THREE.OctahedronGeometry(i === 0 ? 0.34 : 0.2), '#ffffff', { p: [x * 1.06, 0, z * 1.06], s: [0.8, 1.1, 0.5], r: [0, a, 0] }));
  }
  mk(merge(crownParts), crown);
  mk(merge(gems), crown, gemMat, false);

  // lightning arms: pivots at the shoulders, crackling zigzags ending in clenched cloud fists
  const arms = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(3.7 * side, 8.2, 0.2);
    body.add(g);
    const variants = [0, 1, 2].map((v) => zigzag([0, 0, 0], [1.5 * side, -3.6, 1.0], 6, 0.2, 3 + v * 5 + (side > 0 ? 17 : 0), 0.45));
    const bolt = mk(variants[0], g, boltMat, false);
    const shell = mk(zigzag([0, 0, 0], [1.5 * side, -3.6, 1.0], 6, 0.5, 3 + (side > 0 ? 17 : 0), 0.45), g, new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, fog: false }), false);
    const fist = new THREE.Group();
    fist.position.set(1.5 * side, -3.9, 1.0);
    g.add(fist);
    mk(cloud([[0, 0, 0, 0.95, 1.1, 1, 1], [0.5 * side, 0.4, 0.4, 0.55], [-0.3 * side, 0.45, 0.55, 0.5], [0, -0.4, 0.5, 0.55]], '#c3c9ec', '#5d6487', 12), fist);
    const spark = glowSprite('#fff27a', 2.6, 0.75);
    fist.add(spark);
    return { g, bolt, shell, variants, fist, spark };
  });

  const aura = glowSprite('#8a9cff', 18, 0.22);
  aura.position.set(0, 7, -1.5);
  body.add(aura);
  const shadow = contactShadow(8, 6, 0.4);
  root.add(shadow);
  root.scale.setScalar(0.82);
  return { root, body, head, crown, face, faceMat, arms, boltMat, gemMat, aura, shadow, mat };
}
