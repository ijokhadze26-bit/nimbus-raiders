// Mother Murk: a huge jelly goo queen. Gumdrop body on a spreading goo skirt, three big yellow eyes,
// a wide toothy grin, stubby arms, a gold crown dripping with goo, glossy highlights and baby Murklings
// bubbling in her skirt. Separate meshes for body / arms / crown so she can wobble, swell and wave.
// Phase 2: red-hot eyes, glowing crown gems. Faces +Z. ~9u tall.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { contactShadow, glowSprite } from './common.js';

const GOO = '#7c45dc', GOO_LIGHT = '#a77bff', GOO_DARK = '#4f2a96', DRIP = '#b98cff', GOLD = '#ffc531', GOLD_DARK = '#c98a12';

/** Sphere with a vertical colour gradient (belly lighter toward the front/top). */
function gooBlob(r, opts, top = GOO_LIGHT, bot = GOO_DARK, seg = 28) {
  const g = part(G.sphere(r, seg, Math.round(seg * 0.75)), '#ffffff', opts);
  const pos = g.attributes.position, col = g.attributes.color;
  const a = new THREE.Color(top), b = new THREE.Color(bot), c = new THREE.Color(), mid = new THREE.Color(GOO);
  const cy = opts.p ? opts.p[1] : 0, sy = Array.isArray(opts.s) ? opts.s[1] : (opts.s || 1);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.max(0, Math.min(1, ((pos.getY(i) - cy) / (r * sy) + 1) * 0.5));
    if (f < 0.5) c.copy(b).lerp(mid, f * 2); else c.copy(mid).lerp(a, (f - 0.5) * 2);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

export function buildMotherMurk() {
  const mat = toonMaterial();
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', toneMapped: false });
  const gemMat = new THREE.MeshBasicMaterial({ color: '#59e8ff', toneMapped: false });
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, toneMapped: false });
  const root = new THREE.Group();
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // goo skirt pooled on the road (static, wobbles via scale)
  const skirt = new THREE.Group();
  root.add(skirt);
  const lumps = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.2;
    const r = 4.1 + (i % 3) * 0.35;
    lumps.push(gooBlob(0.75 + (i % 2) * 0.25, { p: [Math.cos(a) * r, 0.3, Math.sin(a) * r * 0.85], s: [1.2, 0.55, 1.2] }, GOO, GOO_DARK, 14));
  }
  // baby murklings bubbling up out of the skirt: purple nubs with a yellow eye
  const babies = [];
  [[-3.6, 2.6], [3.4, 2.9], [-2.0, 3.8], [2.4, 3.5], [0.2, 4.3]].forEach(([x, z], k) => {
    babies.push(gooBlob(0.42, { p: [x, 0.62, z], s: [1, 0.9, 1] }, GOO_LIGHT, GOO, 12));
    babies.push(part(G.sphere(0.17, 10, 8), '#ffe14d', { p: [x, 0.74, z + 0.33], s: [1, 1, 0.5] }));
    babies.push(part(G.sphere(0.08, 8, 6), '#1a0f2e', { p: [x, 0.74, z + 0.4], s: [1, 1, 0.5] }));
    babies.push(part(G.cone(0.08, 0.22, 5), GOO_LIGHT, { p: [x + (k % 2 ? 0.2 : -0.2), 1.0, z], r: [0, 0, k % 2 ? -0.4 : 0.4] }));
  });
  mk(merge([gooBlob(4.6, { p: [0, 0.2, 0], s: [1.15, 0.2, 1] }, GOO, GOO_DARK, 32), ...lumps, ...babies]), skirt);

  // body: jelly gumdrop (squash/stretch on this group)
  const body = new THREE.Group();
  root.add(body);
  mk(merge([
    gooBlob(3.2, { p: [0, 3.3, 0], s: [1.22, 1.12, 1.0] }),
    gooBlob(2.3, { p: [0, 1.4, 0.2], s: [1.55, 0.7, 1.3] }, GOO, GOO_DARK),
    // mouth: dark grin with teeth + tongue
    part(G.sphere(1, 20, 12), '#2a0f45', { p: [0, 2.55, 3.15], s: [1.55, 0.62, 0.45] }),
    part(G.sphere(0.6, 14, 8), '#ff6a9a', { p: [0, 2.2, 3.3], s: [1.3, 0.35, 0.45] }),
    ...[-0.95, -0.35, 0.35, 0.95].map((x) => part(G.cone(0.18, 0.42, 6), '#ffffff', { p: [x, 2.95, 3.45], r: [Math.PI, 0, 0] })),
    ...[-0.6, 0.6].map((x) => part(G.cone(0.14, 0.3, 6), '#ffffff', { p: [x, 2.15, 3.42] })),
    // pupils + cheeks (eye whites are the glowing eyeMat mesh)
    part(G.sphere(0.32, 12, 10), '#1a0f2e', { p: [-1.25, 4.5, 3.06], s: [1, 1.15, 0.5] }),
    part(G.sphere(0.32, 12, 10), '#1a0f2e', { p: [1.25, 4.5, 3.06], s: [1, 1.15, 0.5] }),
    part(G.sphere(0.24, 12, 10), '#1a0f2e', { p: [0, 5.55, 2.62], s: [1, 1.15, 0.5] }),
    part(G.sphere(0.45, 12, 8), '#ff8ad8', { p: [-2.2, 3.35, 2.75], s: [1, 0.6, 0.4] }),
    part(G.sphere(0.45, 12, 8), '#ff8ad8', { p: [2.2, 3.35, 2.75], s: [1, 0.6, 0.4] }),
  ]), body);
  // three yellow eyes (glow in phase 2)
  const eyes = mk(merge([
    part(G.sphere(0.72, 18, 14), '#ffffff', { p: [-1.2, 4.45, 2.72], s: [1, 1.12, 0.62] }),
    part(G.sphere(0.72, 18, 14), '#ffffff', { p: [1.2, 4.45, 2.72], s: [1, 1.12, 0.62] }),
    part(G.sphere(0.52, 16, 12), '#ffffff', { p: [0, 5.5, 2.3], s: [1, 1.1, 0.62] }),
  ]), body, eyeMat, false);
  // glossy highlights
  const shine = mk(merge([
    part(G.sphere(0.55, 12, 8), '#ffffff', { p: [-2.0, 5.0, 2.2], s: [1, 0.55, 0.35], r: [0, 0, 0.6] }),
    part(G.sphere(0.25, 10, 6), '#ffffff', { p: [-2.55, 4.35, 1.95], s: [1, 0.6, 0.35] }),
    part(G.sphere(0.2, 10, 6), '#ffffff', { p: [-0.95, 4.75, 3.2], s: [1, 1, 0.4] }),
    part(G.sphere(0.2, 10, 6), '#ffffff', { p: [1.45, 4.75, 3.2], s: [1, 1, 0.4] }),
  ]), body, shineMat, false);

  // stubby arms (pivot at the shoulder)
  const arms = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(3.4 * side, 3.4, 0.6);
    body.add(g);
    mk(merge([
      gooBlob(0.9, { p: [0.6 * side, -0.6, 0.2], s: [1.1, 1.5, 1] }, GOO_LIGHT, GOO, 16),
      gooBlob(0.7, { p: [1.0 * side, -1.75, 0.55], s: [1, 0.85, 1] }, GOO_LIGHT, GOO_DARK, 14),
      ...[-0.35, 0, 0.35].map((dz) => part(G.sphere(0.25, 8, 6), GOO_LIGHT, { p: [1.15 * side, -2.25, 0.6 + dz] })),
    ]), g);
    return g;
  });

  // crown with goo drips running down the head
  const crown = new THREE.Group();
  crown.position.set(0, 6.35, -0.2);
  body.add(crown);
  const spikes = [], gems = [], drips = [];
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 1.25;
    const x = Math.sin(a) * 1.8, z = Math.cos(a) * 1.8;
    const h = 1.05 - Math.abs(i - 3) * 0.1;
    spikes.push(part(G.cone(0.36, h, 4), GOLD, { p: [x, 0.5 + h / 2, z], r: [0, -a + Math.PI / 4, 0] }));
    spikes.push(part(G.sphere(0.14, 8, 6), GOLD_DARK, { p: [x, 0.55 + h, z] }));
    if (i % 2 === 1 || i === 3) gems.push(part(new THREE.OctahedronGeometry(i === 3 ? 0.36 : 0.24), '#ffffff', { p: [x * 1.09, 0.22, z * 1.09], s: [0.8, 1.1, 0.5], r: [0, -a, 0] }));
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    const x = Math.sin(a) * 1.85, z = Math.cos(a) * 1.85;
    const len = 0.5 + ((i * 37) % 7) * 0.12;
    drips.push(part(G.capsule(0.17, len, 3, 8), DRIP, { p: [x, -0.2 - len / 2, z] }));
    drips.push(part(G.sphere(0.24, 10, 8), DRIP, { p: [x, -0.32 - len, z] }));
  }
  mk(merge([
    part(G.cyl(1.95, 1.8, 0.75, 24, true), GOLD, { p: [0, 0.2, 0] }),
    part(G.torus(1.95, 0.12, 6, 30), GOLD_DARK, { p: [0, 0.55, 0], r: [Math.PI / 2, 0, 0] }),
    part(G.torus(1.82, 0.12, 6, 30), GOLD_DARK, { p: [0, -0.15, 0], r: [Math.PI / 2, 0, 0] }),
    ...spikes,
    // goo pooled inside the crown bubbling over the rim
    gooBlob(1.75, { p: [0, 0.35, 0], s: [1, 0.42, 1] }, DRIP, GOO, 18),
    ...drips,
  ]), crown);
  const gemMesh = mk(merge(gems), crown, gemMat, false);

  const aura = glowSprite('#7dff6a', 12, 0);
  aura.position.set(0, 3.5, 1);
  root.add(aura);
  const shadow = contactShadow(11, 8, 0.4);
  root.add(shadow);
  root.scale.setScalar(1.05);
  return { root, body, skirt, arms, crown, eyes, eyeMat, gemMat, gemMesh, shine, aura, shadow, mat };
}
