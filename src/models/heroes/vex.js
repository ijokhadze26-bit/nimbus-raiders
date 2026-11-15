// TITAN VEX, Heavy Guard (SPEC2 §3.6). Huge (height x1.45): box-plated armour in deep violet and gunmetal,
// gold trim, a red visor bar, a flat-ridged helmet crest, big round pauldrons, a tower shield on the left arm
// and the gun in the right hand. Run: a heavy stomp (low frequency, a landing dip, the shield arm held
// forward). Ability (Shockwave): the shield slammed into the ground.
import * as THREE from 'three';
import { kit, part, merge, G, S, CYL, gunFor, glowSprite, envelope, finish, BASE_SCALE } from './common.js';
import { heroDef } from '../../data/heroes.js';

const C = {
  armour: '#5a3fa8', armourDark: '#43308a', plate: '#2a2d3e', plateLight: '#3d4258', trim: '#ffc531', visor: '#ff3b4e',
  glow: '#c48aff', boot: '#1f2130',
};
const HEIGHT = 1.45;
const SHIELD_ARM = 1.15;   // the shield arm's held-forward angle

export function buildVex({ lod = 'high' } = {}) {
  const k = kit(lod);
  const R = heroDef('vex').run;
  const root = new THREE.Group();
  const body = k.group(root);

  // torso: violet chest block, gunmetal plates, gold trim, a back plate with glowing vents
  k.mk(merge([
    part(G.box(0.46, 0.36, 0.32), C.armour, { p: [0, 0.6, 0] }),
    part(G.box(0.4, 0.2, 0.3), C.plate, { p: [0, 0.4, 0] }),
    part(G.box(0.48, 0.04, 0.34), C.trim, { p: [0, 0.48, 0] }),
    part(G.box(0.3, 0.2, 0.04), C.plateLight, { p: [0, 0.64, -0.17] }),
    part(G.box(0.32, 0.03, 0.05), C.trim, { p: [0, 0.75, -0.17] }),
    part(G.box(0.08, 0.08, 0.03), C.trim, { p: [0, 0.6, -0.195], r: [0, 0, Math.PI / 4], bright: 1.1 }),  // gem
    part(G.box(0.36, 0.3, 0.05), C.plateLight, { p: [0, 0.6, 0.17] }),
    part(G.box(0.05, 0.22, 0.02), C.glow, { p: [-0.08, 0.6, 0.198], bright: 1.4 }),
    part(G.box(0.05, 0.22, 0.02), C.glow, { p: [0.08, 0.6, 0.198], bright: 1.4 }),
    part(G.box(0.38, 0.03, 0.06), C.trim, { p: [0, 0.76, 0.17] }),
    part(G.box(0.2, 0.12, 0.3), C.plateLight, { p: [0, 0.82, 0] }),                         // gorget
    // belt + tassets
    part(G.box(0.44, 0.06, 0.33), C.plate, { p: [0, 0.3, 0] }),
    part(G.box(0.16, 0.14, 0.04), C.armourDark, { p: [-0.12, 0.22, -0.17], r: [0.15, 0, 0] }),
    part(G.box(0.16, 0.14, 0.04), C.armourDark, { p: [0.12, 0.22, -0.17], r: [0.15, 0, 0] }),
    part(G.box(0.07, 0.07, 0.03), C.trim, { p: [0, 0.3, -0.18] }),
  ]), body);

  // helmet: boxy, red visor bar, flat ridge crest
  const head = k.group(body, 0, 0.98, 0);
  k.mk(merge([
    part(G.box(0.3, 0.28, 0.3), C.plate, {}),
    part(G.box(0.32, 0.1, 0.32), C.armour, { p: [0, 0.1, 0] }),
    part(G.box(0.28, 0.05, 0.03), C.visor, { p: [0, -0.01, -0.155], bright: 1.7 }),
    part(G.box(0.06, 0.12, 0.42), C.trim, { p: [0, 0.2, 0.01] }),                           // ridge crest
    part(G.box(0.03, 0.06, 0.44), C.armourDark, { p: [0, 0.26, 0.01] }),
    part(G.box(0.34, 0.03, 0.34), C.trim, { p: [0, 0.05, 0] }),
    part(G.box(0.12, 0.08, 0.04), C.plateLight, { p: [0, -0.1, -0.15] }),                  // jaw guard
  ]), head);
  const visorGlow = glowSprite(C.visor, 0.42, 0.6);
  visorGlow.position.set(0, -0.01, -0.2);
  head.add(visorGlow);

  // legs: thick gunmetal thighs, violet greaves with gold knee caps, big boots
  const legs = [-1, 1].map((side) => {
    const g = k.group(body, 0.13 * side, 0.3, 0);
    k.mk(merge([
      part(G.box(0.16, 0.16, 0.18), C.plate, { p: [0, -0.07, 0] }),
      part(G.box(0.17, 0.12, 0.19), C.armour, { p: [0, -0.18, 0] }),
      part(G.box(0.1, 0.06, 0.04), C.trim, { p: [0, -0.12, -0.1] }),
      part(G.box(0.2, 0.08, 0.28), C.boot, { p: [0, -0.26, -0.03] }),
    ]), g);
    return g;
  });

  // arms: huge round pauldrons with gold rims; left arm carries the tower shield
  const arms = [-1, 1].map((side) => {
    const g = k.group(body, 0.32 * side, 0.74, 0);
    const parts = [
      part(S(k, 0.17, 12, 8), C.armour, { p: [0.03 * side, 0.03, 0], s: [1, 0.8, 1] }),
      part(G.torus(0.16, 0.025, 4, k.seg(14)), C.trim, { p: [0.03 * side, -0.02, 0], r: [Math.PI / 2, 0, 0] }),
      part(G.box(0.12, 0.2, 0.12), C.plate, { p: [0, -0.15, 0] }),
      part(G.box(0.13, 0.1, 0.13), C.armour, { p: [0, -0.26, 0] }),
      part(G.box(0.11, 0.08, 0.11), C.plateLight, { p: [0, -0.33, 0] }),
    ];
    k.mk(merge(parts), g);
    return g;
  });
  // tower shield on the left forearm, counter-rotated so it stands upright in the held-forward pose
  const shield = k.group(arms[0], 0, -0.3, 0);
  shield.rotation.x = -SHIELD_ARM;
  k.mk(merge([
    part(G.box(0.42, 0.66, 0.05), C.armour, { p: [0.05, 0.02, -0.1] }),
    part(G.box(0.46, 0.04, 0.06), C.trim, { p: [0.05, 0.35, -0.1] }),
    part(G.box(0.46, 0.04, 0.06), C.trim, { p: [0.05, -0.31, -0.1] }),
    part(G.box(0.04, 0.66, 0.06), C.plate, { p: [-0.16, 0.02, -0.1] }),
    part(G.box(0.04, 0.66, 0.06), C.plate, { p: [0.26, 0.02, -0.1] }),
    part(G.box(0.12, 0.12, 0.02), C.trim, { p: [0.05, 0.06, -0.135], r: [0, 0, Math.PI / 4], bright: 1.15 }),
    part(G.box(0.04, 0.42, 0.015), C.trim, { p: [0.05, 0.02, -0.132] }),
    part(G.box(0.3, 0.05, 0.05), C.plateLight, { p: [0.05, 0.0, -0.05] }),            // grip strap
  ]), shield);

  const { gun, gunMat, ownGeo } = gunFor(k, arms[1], -0.33);
  const rig = {
    root, body, head, legs, arms, gun, gunMat, ownGunGeo: ownGeo, glow: visorGlow, shield,
    handSocket: arms[1],
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      const f = R.freq, s = Math.sin(t * f), a = Math.abs(s);
      // heavy stomp: sharp landing dip at each footfall
      const dip = Math.pow(1 - a, 6) * 0.05 * run;
      // Shockwave: raise the shield (0..0.18 s), slam it down (0.18..0.3 s), hold, recover by 0.5 s
      const el = ability * rig.abilityDuration;
      const raise = ability > 0 ? envelope(el, 0.22, 0.12, 0.04) : 0;
      const slam = ability > 0 ? envelope(el - 0.18, 0.32, 0.04, 0.18) : 0;
      body.position.y = a * R.bob * run - dip - slam * 0.18 + raise * 0.06 + (cheer > 0 ? Math.max(0, Math.sin(t * 5)) * 0.18 * cheer : 0);
      body.rotation.x = R.lean * run + slam * 0.3 - raise * 0.08;
      body.rotation.z = -vx * 0.02 + s * 0.03 * run;
      root.rotation.y = -vx * 0.02;
      legs[0].rotation.x = s * 0.6 * run - slam * 0.4;
      legs[1].rotation.x = -s * 0.6 * run + slam * 0.3;
      // shield arm held forward; raised high, then driven into the ground
      arms[0].rotation.x = SHIELD_ARM - raise * 2.2 + slam * 0.6 - cheer * 2.0;
      arms[0].rotation.z = 0.32 - raise * 0.2;
      arms[1].rotation.x = 1.45 * (1 - cheer) + Math.sin(t * f * 2) * 0.02 - cheer * 2.5;
      arms[1].rotation.z = 0.05;
      head.rotation.y = -vx * 0.03;
      head.rotation.x = slam * 0.15;
      visorGlow.material.opacity = 0.5 + 0.2 * Math.sin(t * 2.2) + slam * 0.3;
    },
  };
  return finish(rig, k, { id: 'vex', scale: BASE_SCALE * HEIGHT, arm: arms[1], tip: [0, -0.7, -0.02], extraMat: [visorGlow.material] });
}
