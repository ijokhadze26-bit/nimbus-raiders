// RIME, Ice Sniper (SPEC2 §3.3). Tall and slim (height x1.15): a long white coat built as a cone skirt split
// at the back (two tails that sway), a fur-trimmed hood, a narrow glowing visor slit, a blue sash, a quiver of
// ice crystals on the back. Holds the gun two-handed at the shoulder. Run: a smooth glide (low bob, both arms
// steady in the aim pose, the coat tails sway). Ability (Whiteout): the rifle raised vertically, a crystal burst.
import * as THREE from 'three';
import { kit, part, merge, G, S, CAP, CYL, gunFor, glowSprite, envelope, finish, BASE_SCALE } from './common.js';

const OCT = (r) => new THREE.OctahedronGeometry(r);
import { heroDef } from '../../data/heroes.js';

const C = {
  coat: '#e8f6ff', coatShade: '#c9e2f4', lining: '#9fc8e8', hood: '#9fc8e8', fur: '#ffffff', visor: '#4dc3ff',
  mask: '#22324e', sash: '#6f9bff', sashDark: '#4f78e0', boot: '#5f7fa8', glove: '#dff2ff', crystal: '#9fe8ff',
};
const HEIGHT = 1.15;
const HOOD_GAP = 1.9;       // hood opening (radians) at the face

/** Open cone skirt with a gap at the back (+Z): outside in the coat colour, inside in the lining colour. */
function skirt(k, rTop, rBot, h, y, gap) {
  const seg = k.seg(18);
  const out = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, gap / 2, Math.PI * 2 - gap);
  const inn = new THREE.CylinderGeometry(rTop * 0.97, rBot * 0.97, h, seg, 1, true, gap / 2, Math.PI * 2 - gap);
  return [
    part(out, C.coat, { p: [0, y, 0] }),
    part(inn, C.lining, { p: [0, y, 0], s: [-1, 1, 1] }),   // mirrored copy = inward-facing lining
  ];
}

export function buildRime({ lod = 'high' } = {}) {
  const k = kit(lod);
  const R = heroDef('rime').run;
  const root = new THREE.Group();
  const body = k.group(root);

  // slim torso + coat (upper body, collar, buttons) + split cone skirt + sash
  k.mk(merge([
    part(CAP(k, 0.17, 0.24, 12), C.coat, { p: [0, 0.6, 0], s: [1, 1, 0.92] }),
    part(CYL(k, 0.17, 0.19, 0.06, 14), C.coatShade, { p: [0, 0.42, 0] }),
    ...skirt(k, 0.19, 0.29, 0.34, 0.25, 0.55),
    part(G.box(0.03, 0.34, 0.02), C.coatShade, { p: [0, 0.55, -0.165] }),
    part(new THREE.CylinderGeometry(0.287, 0.293, 0.04, k.seg(18), 1, true, 0.3, Math.PI * 2 - 0.6), C.sash, { p: [0, 0.1, 0] }),
    part(G.box(0.025, 0.32, 0.02), C.lining, { p: [0, 0.25, -0.245], r: [-0.28, 0, 0] }),
    part(CYL(k, 0.185, 0.185, 0.04, 14), C.sashDark, { p: [0, 0.44, 0] }),
    part(S(k, 0.018, 5, 4), C.sash, { p: [0, 0.63, -0.172] }),
    part(S(k, 0.018, 5, 4), C.sash, { p: [0, 0.53, -0.172] }),
    // diagonal sash across the chest and the back
    part(G.torus(0.2, 0.03, 4, k.seg(14)), C.sash, { p: [0, 0.6, 0], r: [Math.PI / 2, 0.75, 0], s: [0.92, 1, 1.0] }),
    part(G.box(0.07, 0.2, 0.03), C.sashDark, { p: [0.1, 0.38, 0.19], r: [0.2, 0, 0.3] }),   // sash knot tail
    // ice-crystal quiver on the back
    part(CYL(k, 0.06, 0.05, 0.3, 8), C.lining, { p: [-0.07, 0.68, 0.17], r: [0.15, 0, 0.45] }),
    part(OCT(0.07), C.crystal, { p: [-0.15, 0.88, 0.2], s: [0.7, 1.6, 0.7], r: [0.15, 0, 0.45], bright: 1.35 }),
    part(OCT(0.055), C.crystal, { p: [-0.21, 0.83, 0.2], s: [0.7, 1.5, 0.7], r: [0.15, 0, 0.7], bright: 1.35 }),
    part(OCT(0.05), C.crystal, { p: [-0.1, 0.83, 0.25], s: [0.7, 1.4, 0.7], r: [0.3, 0, 0.3], bright: 1.35 }),
  ]), body);

  // coat tails (two flaps at the back split) sway with the glide
  const tail = k.group(body, 0, 0.42, 0.2);
  k.mk(merge([
    part(G.box(0.12, 0.36, 0.025), C.coat, { p: [-0.075, -0.18, 0.02], r: [0.12, 0, -0.08] }),
    part(G.box(0.12, 0.36, 0.025), C.coat, { p: [0.075, -0.18, 0.02], r: [0.12, 0, 0.08] }),
    part(G.box(0.12, 0.03, 0.03), C.lining, { p: [-0.075, -0.36, 0.045], r: [0.12, 0, -0.08] }),
    part(G.box(0.12, 0.03, 0.03), C.lining, { p: [0.075, -0.36, 0.045], r: [0.12, 0, 0.08] }),
  ]), tail);

  // head: hood with fur trim, dark mask, narrow glowing visor slit
  const head = k.group(body, 0, 0.98, 0);
  k.mk(merge([
    part(S(k, 0.2, 12, 9), C.mask, { s: [0.95, 1, 0.95] }),
    part(new THREE.SphereGeometry(0.245, k.seg(16), k.seg(10), Math.PI * 1.5 + HOOD_GAP / 2, Math.PI * 2 - HOOD_GAP), C.hood, { p: [0, 0.03, 0.03], s: [1, 1.08, 1.05] }),
    part(new THREE.SphereGeometry(0.235, k.seg(16), k.seg(10), Math.PI * 1.5 + HOOD_GAP / 2, Math.PI * 2 - HOOD_GAP), C.lining, { p: [0, 0.03, 0.03], s: [-1.0, 1.08, 1.05] }),
    part(G.cone(0.12, 0.22, k.seg(8)), C.hood, { p: [0, 0.03, 0.27], r: [-Math.PI / 2 - 0.5, 0, 0] }),      // hood point
    part(G.torus(0.165, 0.05, k.seg(6), k.seg(14)), C.fur, { p: [0, 0.02, -0.15], s: [1, 1.2, 1] }),
    part(G.box(0.26, 0.035, 0.05), C.visor, { p: [0, 0.03, -0.185], bright: 1.6 }),
  ]), head);
  const visorGlow = glowSprite(C.visor, 0.4, 0.55);
  visorGlow.position.set(0, 0.03, -0.24);
  head.add(visorGlow);

  // long legs (mostly under the coat), slim boots
  const legs = [-1, 1].map((side) => {
    const g = k.group(body, 0.08 * side, 0.4, 0);
    k.mk(merge([
      part(CAP(k, 0.06, 0.22, 8), C.lining, { p: [0, -0.17, 0] }),
      part(S(k, 0.08, 8, 6), C.boot, { p: [0, -0.35, -0.03], s: [0.9, 0.7, 1.4] }),
    ]), g);
    return g;
  });

  // arms: both forward on the gun (the left one braces it)
  const arms = [-1, 1].map((side) => {
    const g = k.group(body, 0.2 * side, 0.73, 0);
    k.mk(merge([
      part(S(k, 0.07, 8, 6), C.coat, { p: [0, 0, 0] }),
      part(CAP(k, 0.055, 0.16, 8), C.coat, { p: [0, -0.12, 0] }),
      part(CYL(k, 0.065, 0.065, 0.05, 8), C.fur, { p: [0, -0.2, 0] }),
      part(S(k, 0.065, 8, 6), C.glove, { p: [0, -0.25, 0] }),
    ]), g);
    return g;
  });

  const { gun, gunMat, ownGeo } = gunFor(k, arms[1], -0.25);
  const rig = {
    root, body, head, legs, arms, gun, gunMat, ownGunGeo: ownGeo, glow: visorGlow, tail,
    handSocket: arms[1],
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      const f = R.freq, s = Math.sin(t * f);
      // Whiteout: rifle raised vertically (0..0.5 s), held, lowered over the last 0.3 s of the first 1.2 s
      const el = ability * rig.abilityDuration;
      const raise = ability > 0 ? envelope(el, 1.2, 0.25, 0.35) : 0;
      body.position.y = Math.abs(s) * R.bob * run + (cheer > 0 ? Math.max(0, Math.sin(t * 6)) * 0.22 * cheer : 0);
      body.rotation.x = R.lean * run * (1 - raise);
      body.rotation.z = -vx * 0.03 + s * 0.015 * run;
      root.rotation.y = -vx * 0.025;
      legs[0].rotation.x = s * 0.55 * run;
      legs[1].rotation.x = -s * 0.55 * run;
      tail.rotation.x = 0.25 + Math.sin(t * f * 0.5 + 0.6) * 0.1 * (0.4 + run) + run * 0.25;
      tail.rotation.z = Math.sin(t * f * 0.5) * 0.12 * run + vx * 0.03;
      const lift = Math.max(raise, cheer);
      // two-handed aim at the shoulder; raise = rifle straight up
      arms[1].rotation.x = 1.38 * (1 - lift) + lift * 3.05 + Math.sin(t * f * 2) * 0.012;
      arms[1].rotation.z = 0.12 * (1 - lift) - lift * 0.1;
      arms[1].rotation.y = -0.1;
      arms[0].rotation.x = 1.25 * (1 - lift) + lift * 2.8;
      arms[0].rotation.z = -0.62 * (1 - lift) + lift * 0.25;
      head.rotation.y = -vx * 0.03 + 0.06;
      head.rotation.x = -0.05 * run - lift * 0.25;
      visorGlow.material.opacity = 0.45 + 0.15 * Math.sin(t * 3) + raise * 0.4;
    },
  };
  return finish(rig, k, { id: 'rime', scale: BASE_SCALE * HEIGHT, arm: arms[1], tip: [0, -0.64, -0.02], extraMat: [visorGlow.material] });
}

