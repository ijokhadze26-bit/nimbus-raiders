// Ironhorn: an armored mech-rhino. Steel barrel torso with riveted plates and hazard stripes, a heavy
// head with a huge ivory-steel horn (+ a smaller one), glowing eye slits and cheek vents, four piston
// legs with hooves (separate pivots for the gallop), twin exhaust stacks, a cable tail. Faces +Z.
// Glow parts (eyes, vents, exhaust) share one material that heats from amber to red in phase 2.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { contactShadow, glowSprite } from './common.js';

const STEEL = '#aab6cb', STEEL_DARK = '#76839a', STEEL_LIGHT = '#d4dce8', IRON = '#4a5263', HAZARD = '#ffc531', HORN = '#f4ecd6', RED = '#d8344a', RED_DARK = '#9e2132';

/** Rounded box: a box with sphere-ish edges by scaling a low-poly sphere (chunky toy-like plates). */
const slab = (w, h, d, color, opts = {}) => part(new THREE.SphereGeometry(1, 10, 6), color, { ...opts, s: [w / 2, h / 2, d / 2] });

export function buildIronhorn() {
  const mat = toonMaterial();
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffb43a', toneMapped: false, fog: false });
  const root = new THREE.Group();
  const body = new THREE.Group();     // bobs + pitches during the gallop
  root.add(body);
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // torso: barrel hull + armor + stripes + rivets
  const rivets = [];
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) rivets.push(part(G.sphere(0.09, 6, 4), STEEL_LIGHT, { p: [side * 1.93, 3.85, -1.7 + i * 0.7] }));
  mk(merge([
    part(G.capsule(1.75, 3.0, 4, 14), STEEL, { p: [0, 3.5, -0.4], r: [Math.PI / 2, 0, 0], s: [1.15, 1, 1] }),
    slab(3.8, 1.2, 4.6, RED, { p: [0, 4.85, -0.4] }),                       // back armor
    slab(2.6, 0.7, 3.4, RED_DARK, { p: [0, 5.45, -0.5] }),                  // spine plate
    ...[-1.2, -0.2, 0.8].map((z) => part(G.box(0.5, 0.55, 0.4), STEEL_LIGHT, { p: [0, 5.85, z], r: [0.4, 0, 0] })), // dorsal fins
    slab(1.4, 2.2, 3.0, RED, { p: [-2.05, 3.6, 1.0] }),                    // shoulder pauldrons
    slab(1.4, 2.2, 3.0, RED, { p: [2.05, 3.6, 1.0] }),
    part(G.box(0.08, 0.5, 2.6), HAZARD, { p: [-2.0, 3.0, -1.4] }),
    part(G.box(0.08, 0.5, 2.6), HAZARD, { p: [2.0, 3.0, -1.4] }),
    ...[-1.9, -1.2, -0.5].map((z) => part(G.box(0.1, 0.52, 0.28), IRON, { p: [-2.02, 3.0, z], r: [0.6, 0, 0] })),
    ...[-1.9, -1.2, -0.5].map((z) => part(G.box(0.1, 0.52, 0.28), IRON, { p: [2.02, 3.0, z], r: [0.6, 0, 0] })),
    part(G.cyl(1.25, 1.25, 0.3, 16), IRON, { p: [0, 3.5, -2.9], r: [Math.PI / 2, 0, 0] }),   // rear cap
    ...rivets,
    // exhaust stacks
    part(G.cyl(0.32, 0.38, 1.6, 10), IRON, { p: [-0.8, 5.6, -2.2], r: [-0.35, 0, 0] }),
    part(G.cyl(0.32, 0.38, 1.6, 10), IRON, { p: [0.8, 5.6, -2.2], r: [-0.35, 0, 0] }),
    part(G.cyl(0.42, 0.42, 0.2, 10), STEEL_LIGHT, { p: [-0.8, 6.35, -2.47], r: [-0.35, 0, 0] }),
    part(G.cyl(0.42, 0.42, 0.2, 10), STEEL_LIGHT, { p: [0.8, 6.35, -2.47], r: [-0.35, 0, 0] }),
    // cable tail
    part(G.cyl(0.12, 0.12, 1.4, 6), IRON, { p: [0, 3.4, -3.6], r: [-0.9, 0, 0] }),
    part(G.sphere(0.28, 8, 6), STEEL_LIGHT, { p: [0, 2.9, -4.1] }),
  ]), body);
  // glowing side vents + exhaust mouths
  const vents = mk(merge([
    ...[-0.4, 0.2, 0.8].map((y) => part(G.box(0.06, 0.16, 1.4), '#ffffff', { p: [-2.78, 3.4 + y, 1.0] })),
    ...[-0.4, 0.2, 0.8].map((y) => part(G.box(0.06, 0.16, 1.4), '#ffffff', { p: [2.78, 3.4 + y, 1.0] })),
    part(G.cyl(0.26, 0.26, 0.05, 10), '#ffffff', { p: [-0.8, 6.46, -2.51], r: [-0.35, 0, 0] }),
    part(G.cyl(0.26, 0.26, 0.05, 10), '#ffffff', { p: [0.8, 6.46, -2.51], r: [-0.35, 0, 0] }),
  ]), body, glowMat, false);

  // head (pivot at the neck so it can lower for the charge)
  const head = new THREE.Group();
  head.position.set(0, 3.9, 2.6);
  body.add(head);
  mk(merge([
    slab(2.6, 2.3, 2.8, STEEL, { p: [0, 0, 0.9] }),
    slab(2.0, 1.6, 1.8, STEEL_LIGHT, { p: [0, -0.4, 2.2] }),               // snout
    slab(2.4, 0.5, 2.0, IRON, { p: [0, -1.15, 1.8] }),                      // jaw plate
    slab(2.9, 0.55, 2.0, RED, { p: [0, 1.05, 0.7] }),                       // brow armor
    part(G.box(0.12, 0.6, 1.6), HAZARD, { p: [0, 1.3, 0.8] }),               // head stripe
    // ears
    part(G.cone(0.4, 0.9, 4), STEEL_DARK, { p: [-1.1, 1.35, 0.1], r: [-0.4, 0, 0.5] }),
    part(G.cone(0.4, 0.9, 4), STEEL_DARK, { p: [1.1, 1.35, 0.1], r: [-0.4, 0, -0.5] }),
    // horns: big front horn + smaller second horn, steel collars
    // big horn sweeps up and forward (a stack of tapering segments for a curve)
    part(G.cyl(0.62, 0.72, 0.7, 12), HORN, { p: [0, 0.2, 2.95], r: [0.9, 0, 0] }),
    part(G.cyl(0.46, 0.62, 0.9, 12), HORN, { p: [0, 0.75, 3.4], r: [0.62, 0, 0] }),
    part(G.cyl(0.28, 0.46, 0.9, 12), HORN, { p: [0, 1.45, 3.7], r: [0.35, 0, 0] }),
    part(G.cone(0.28, 1.1, 12), HORN, { p: [0, 2.3, 3.83], r: [0.12, 0, 0] }),
    part(G.cyl(0.74, 0.78, 0.28, 12), IRON, { p: [0, -0.1, 2.75], r: [0.9, 0, 0] }),
    part(G.torus(0.5, 0.07, 6, 16), HAZARD, { p: [0, 0.75, 3.4], r: [0.62 + Math.PI / 2, 0, 0] }),
    part(G.cone(0.38, 1.3, 8), HORN, { p: [0, 1.15, 1.85], r: [0.15, 0, 0] }),
    part(G.cyl(0.42, 0.45, 0.22, 8), IRON, { p: [0, 0.55, 1.8], r: [0.15, 0, 0] }),
    // nostril grilles
    part(G.cyl(0.2, 0.2, 0.15, 8), IRON, { p: [-0.5, -0.55, 3.1], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.2, 0.2, 0.15, 8), IRON, { p: [0.5, -0.55, 3.1], r: [Math.PI / 2, 0, 0] }),
  ]), head);
  const eyes = mk(merge([
    part(G.box(0.62, 0.2, 0.12), '#ffffff', { p: [-0.85, 0.5, 2.0], r: [0, -0.35, -0.25] }),
    part(G.box(0.62, 0.2, 0.12), '#ffffff', { p: [0.85, 0.5, 2.0], r: [0, 0.35, 0.25] }),
  ]), head, glowMat, false);

  // legs: pivots at the hips, piston shins, chunky hooves
  const legs = [[-1.55, 1.25], [1.55, 1.25], [-1.55, -1.9], [1.55, -1.9]].map(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 3.0, z);
    body.add(g);
    mk(merge([
      slab(1.25, 1.7, 1.4, STEEL_DARK, { p: [0, -0.5, 0] }),
      part(G.cyl(0.38, 0.38, 1.5, 10), IRON, { p: [0, -1.6, 0] }),
      part(G.sphere(0.5, 10, 8), STEEL, { p: [0, -1.25, 0.1] }),
      part(G.cyl(0.28, 0.28, 0.9, 8), STEEL_LIGHT, { p: [0, -2.1, 0.05] }),
      part(G.cyl(0.72, 0.85, 0.65, 12), IRON, { p: [0, -2.68, 0.1] }),
      part(G.box(0.95, 0.12, 0.3), HAZARD, { p: [0, -2.45, 0.78] }),
    ]), g);
    g.userData.phase = i === 0 || i === 3 ? 0 : Math.PI;
    return g;
  });

  const exhaust = [glowSprite('#ffb43a', 1.6, 0.7), glowSprite('#ffb43a', 1.6, 0.7)];
  exhaust[0].position.set(-0.8, 6.6, -2.6); exhaust[1].position.set(0.8, 6.6, -2.6);
  body.add(...exhaust);
  const eyeGlow = glowSprite('#ffb43a', 2.4, 0.6);
  eyeGlow.position.set(0, 0.5, 2.2);
  head.add(eyeGlow);

  const shadow = contactShadow(6.5, 9.5, 0.45);
  root.add(shadow);
  root.scale.setScalar(1.12);
  return { root, body, head, legs, vents, eyes, glowMat, exhaust, eyeGlow, shadow, mat };
}
