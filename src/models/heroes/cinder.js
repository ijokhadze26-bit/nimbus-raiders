// CINDER, Fire Brawler (SPEC2 §3.2). Stocky and short-legged (torso x1.25 wide, total height ~ Pip), human
// skin, sleeveless red vest over a charcoal suit, bandaged forearms with glowing orange knuckle wraps, goggles
// pushed up on the forehead, no helmet, a crest of three swept-back flame-shaped hair spikes (orange -> yellow).
// Fire shows only on the knuckle wraps and the hair tips (additive flames). Run: aggressive lean, punchy
// alternating arm pumps, the gun arm stays forward. Ability (Meteor Drop): both fists up, then a ground slam.
import * as THREE from 'three';
import { kit, part, merge, G, S, CAP, CYL, gunFor, gradient, additive, glowSprite, envelope, finish, BASE_SCALE } from './common.js';
import { heroDef } from '../../data/heroes.js';

const C = {
  vest: '#d8321e', vestDark: '#a8231a', suit: '#3a2420', suitLight: '#4e332c', skin: '#c98a5e', skinDark: '#a86c45',
  knuckle: '#ff7a1f', bandage: '#efe2c8', boot: '#2a1a16', belt: '#1c1210', buckle: '#ffb21f', goggle: '#2a1a16',
  lens: '#ffb21f', hairBase: '#7a2a14', hairA: '#ff7a1f', hairB: '#ffd34d', emblem: '#ffb21f',
};

export function buildCinder({ lod = 'high' } = {}) {
  const k = kit(lod);
  const R = heroDef('cinder').run;
  const root = new THREE.Group();
  const body = k.group(root);

  // torso: charcoal suit, wide red vest (open front shows the suit), belt, flame emblem on the back
  k.mk(merge([
    part(CAP(k, 0.25, 0.14, 12), C.suit, { p: [0, 0.5, 0], s: [1.25, 1, 1.02] }),
    part(CAP(k, 0.262, 0.1, 12), C.vest, { p: [0, 0.53, 0.012], s: [1.27, 0.98, 1.0] }),
    part(G.box(0.16, 0.3, 0.06), C.suitLight, { p: [0, 0.54, -0.255] }),
    part(G.box(0.03, 0.3, 0.07), C.vestDark, { p: [-0.09, 0.54, -0.255] }),
    part(G.box(0.03, 0.3, 0.07), C.vestDark, { p: [0.09, 0.54, -0.255] }),
    part(CYL(k, 0.3, 0.3, 0.08, 14), C.belt, { p: [0, 0.37, 0], s: [1.08, 1, 0.9] }),
    part(G.box(0.12, 0.08, 0.04), C.buckle, { p: [0, 0.37, -0.29], bright: 1.2 }),
    // back flame emblem (the camera sees the back)
    part(G.cone(0.08, 0.26, 5), C.emblem, { p: [0, 0.6, 0.27], r: [-0.12, 0, 0], s: [1, 1, 0.3], bright: 1.15 }),
    part(G.cone(0.05, 0.16, 5), C.hairA, { p: [-0.08, 0.55, 0.265], r: [-0.12, 0, 0.35], s: [1, 1, 0.3] }),
    part(G.cone(0.05, 0.16, 5), C.hairA, { p: [0.08, 0.55, 0.265], r: [-0.12, 0, -0.35], s: [1, 1, 0.3] }),
    // vest shoulder seams
    part(G.box(0.12, 0.05, 0.22), C.vestDark, { p: [-0.24, 0.7, 0] }),
    part(G.box(0.12, 0.05, 0.22), C.vestDark, { p: [0.24, 0.7, 0] }),
  ]), body);

  // head: human, goggles pushed up, flame crest
  const head = k.group(body, 0, 0.93, 0);
  const hairGeo = [];
  const spike = (x, len, rz, rx) => {
    const g = G.cone(0.075, len, k.seg(6));
    g.translate(0, len / 2, 0);
    gradient(g, 'y', C.hairA, C.hairB, 1.1);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz));
    g.applyMatrix4(m);
    g.translate(x, 0.2, 0.06);
    g.deleteAttribute('uv');
    hairGeo.push(g);
    return g;
  };
  k.mk(merge([
    part(S(k, 0.25, 14, 10), C.skin, { s: [1, 0.95, 0.98] }),
    part(S(k, 0.06, 6, 4), C.skinDark, { p: [0, -0.04, -0.245], s: [1, 0.8, 0.7] }),       // nose
    part(S(k, 0.035, 6, 4), '#1a0e0a', { p: [-0.085, 0.03, -0.225] }),
    part(S(k, 0.035, 6, 4), '#1a0e0a', { p: [0.085, 0.03, -0.225] }),
    part(G.box(0.08, 0.025, 0.03), '#5a2a14', { p: [-0.085, 0.09, -0.23], r: [0, 0, -0.25] }),  // fierce brows
    part(G.box(0.08, 0.025, 0.03), '#5a2a14', { p: [0.085, 0.09, -0.23], r: [0, 0, 0.25] }),
    part(G.box(0.1, 0.02, 0.03), '#6a2a1c', { p: [0, -0.11, -0.22] }),                      // grin
    part(S(k, 0.258, 14, 8), C.hairBase, { p: [0, 0.03, 0.03], s: [1, 0.9, 1] }),          // hair cap (back of the head)
    part(CYL(k, 0.255, 0.255, 0.07, 16, true), C.goggle, { p: [0, 0.12, 0], s: [1.01, 1, 1.01] }),
    part(CYL(k, 0.06, 0.06, 0.05, 10), C.lens, { p: [-0.09, 0.15, -0.235], r: [Math.PI / 2 - 0.5, 0, 0], bright: 1.25 }),
    part(CYL(k, 0.06, 0.06, 0.05, 10), C.lens, { p: [0.09, 0.15, -0.235], r: [Math.PI / 2 - 0.5, 0, 0], bright: 1.25 }),
    part(S(k, 0.06, 6, 4), C.skin, { p: [-0.25, 0, 0], s: [0.5, 1, 0.8] }),                 // ears
    part(S(k, 0.06, 6, 4), C.skin, { p: [0.25, 0, 0], s: [0.5, 1, 0.8] }),
    spike(-0.11, 0.3, 0.45, 0.95), spike(0, 0.38, 0, 0.85), spike(0.11, 0.3, -0.45, 0.95),
  ]), head);
  // flame licks on the hair tips (additive)
  const flameMat = additive('#ffb03a', 0.85);
  const tipGeo = new THREE.ConeGeometry(0.06, 0.2, 6);
  tipGeo.translate(0, 0.1, 0);
  const tips = [[-0.11, 0.3, 0.45, 0.95], [0, 0.38, 0, 0.85], [0.11, 0.3, -0.45, 0.95]].map(([x, len, rz, rx]) => {
    const f = new THREE.Mesh(tipGeo, flameMat);
    const e = new THREE.Euler(rx, 0, rz);
    const dir = new THREE.Vector3(0, len, 0).applyEuler(e);
    f.position.set(x + dir.x, 0.2 + dir.y, 0.06 + dir.z);
    f.rotation.copy(e);
    return f;
  });
  const tipGroup = k.group(head);
  for (const f of tips) tipGroup.add(f);

  // short, stout legs with chunky boots
  const legs = [-1, 1].map((side) => {
    const g = k.group(body, 0.13 * side, 0.3, 0);
    k.mk(merge([
      part(CAP(k, 0.095, 0.06, 8), C.suit, { p: [0, -0.1, 0] }),
      part(G.box(0.17, 0.11, 0.26), C.boot, { p: [0, -0.24, -0.03] }),
      part(G.box(0.175, 0.03, 0.27), C.vest, { p: [0, -0.18, -0.03] }),
    ]), g);
    return g;
  });

  // thick arms: suit upper arm, bandaged forearm, glowing knuckle wrap
  const arms = [-1, 1].map((side) => {
    const g = k.group(body, 0.36 * side, 0.66, 0);
    k.mk(merge([
      part(S(k, 0.11, 10, 7), C.skin, { p: [0, -0.02, 0] }),
      part(CAP(k, 0.085, 0.08, 8), C.skin, { p: [0, -0.1, 0] }),
      part(CYL(k, 0.088, 0.08, 0.1, 8), C.bandage, { p: [0, -0.2, 0] }),
      part(G.box(0.03, 0.1, 0.17), '#d9c8a8', { p: [0, -0.2, 0], r: [0.3, 0, 0] }),
      part(S(k, 0.1, 10, 7), C.knuckle, { p: [0, -0.28, 0], bright: 1.45 }),
    ]), g);
    return g;
  });
  const knuckleGlow = [glowSprite('#ff8a2a', 0.42, 0.7), glowSprite('#ff8a2a', 0.42, 0.7)];
  knuckleGlow.forEach((s, i) => { s.position.set(0, -0.28, 0); arms[i].add(s); });

  const { gun, gunMat, ownGeo } = gunFor(k, arms[1], -0.28);
  const rig = {
    root, body, head, legs, arms, gun, gunMat, ownGunGeo: ownGeo, flames: tips, glow: knuckleGlow[1],
    handSocket: arms[1],
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      const f = R.freq, s = Math.sin(t * f), c = Math.cos(t * f);
      // Meteor Drop: fists up (0..0.35 s), slam (0.35..0.55 s), recover
      const el = ability * rig.abilityDuration;
      const up = ability > 0 ? envelope(el, 0.42, 0.1, 0.06) : 0;
      const slam = ability > 0 ? envelope(el - 0.36, 0.34, 0.05, 0.25) : 0;
      const bob = Math.abs(s) * R.bob * run;
      const jump = cheer > 0 ? Math.max(0, Math.sin(t * 7)) * 0.3 * cheer : 0;
      body.position.y = bob + jump + up * 0.12 - slam * 0.16;
      body.rotation.x = R.lean * run * (1 - up) + slam * 0.35;
      body.rotation.y = s * 0.12 * run;               // shoulders swing with the punches
      body.rotation.z = -vx * 0.035 + c * 0.03 * run;
      root.rotation.y = -vx * 0.03;
      legs[0].rotation.x = s * 0.95 * run - slam * 0.5;
      legs[1].rotation.x = -s * 0.95 * run + slam * 0.5;
      const lift = Math.max(up, cheer);
      // left fist pumps hard; right (gun) arm stays forward
      arms[0].rotation.x = (-0.5 - s * 1.1) * run * (1 - lift) - lift * 2.9 + slam * 1.4;
      arms[0].rotation.z = -0.25 - lift * 0.2;
      arms[1].rotation.x = 1.45 * (1 - lift) + Math.sin(t * f * 2) * 0.05 - lift * 2.9 + slam * 1.4;
      arms[1].rotation.z = 0.08 + lift * 0.2;
      head.rotation.x = 0.1 * run - lift * 0.2;
      head.rotation.y = -vx * 0.04 - s * 0.06 * run;
      const fl = 0.8 + Math.sin(t * 31) * 0.15 + Math.sin(t * 47 + 1) * 0.1;
      for (let i = 0; i < tips.length; i++) tips[i].scale.set(1, fl * (1 + 0.25 * Math.sin(t * 23 + i * 2)) * (1 + up * 0.8), 1);
      flameMat.opacity = 0.65 + fl * 0.25;
      const kg = 0.55 + fl * 0.25 + up * 0.4;
      knuckleGlow[0].material.opacity = kg; knuckleGlow[1].material.opacity = kg;
    },
  };
  return finish(rig, k, { id: 'cinder', scale: BASE_SCALE, arm: arms[1], tip: [0, -0.65, -0.02], extraGeo: [tipGeo, ...hairGeo], extraMat: [flameMat, knuckleGlow[0].material, knuckleGlow[1].material] });
}
