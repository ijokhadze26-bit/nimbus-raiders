// BOLT, Engineer (SPEC2 §3.5). Medium build: a yellow-orange hard hat with a headlamp, round goggles, orange
// overalls over dark grey, big gloves, and a tool backpack with a small dish antenna and a wrench. Run: a
// brisk trot with a side-to-side waddle roll; the backpack bounces. Ability (Deploy Fortress): a crouch, then
// planting a beacon.
import * as THREE from 'three';
import { kit, part, merge, G, S, CAP, CYL, gunFor, glowSprite, envelope, finish, BASE_SCALE } from './common.js';
import { heroDef } from '../../data/heroes.js';

const C = {
  hat: '#ffd34d', hatDark: '#e0a91f', overalls: '#ffb21f', overallsDark: '#e08a10', suit: '#4b5672', suitDark: '#353d52',
  skin: '#e2a878', goggle: '#3a4358', lens: '#2fd6c8', glove: '#ff8a2b', gloveCuff: '#4b5672', boot: '#2a2f3e',
  lamp: '#fff6c4', steel: '#c8d0dc', dish: '#e3eaf5', red: '#ff3b4e',
};

export function buildBolt({ lod = 'high' } = {}) {
  const k = kit(lod);
  const R = heroDef('bolt').run;
  const root = new THREE.Group();
  const body = k.group(root);

  // torso: dark grey suit, orange overall bib + straps, tool belt with pouches
  k.mk(merge([
    part(CAP(k, 0.215, 0.17, 12), C.suit, { p: [0, 0.55, 0], s: [1.05, 1, 1] }),
    part(CYL(k, 0.225, 0.23, 0.2, 14), C.overalls, { p: [0, 0.43, 0] }),
    part(G.box(0.24, 0.2, 0.05), C.overalls, { p: [0, 0.6, -0.2] }),
    part(G.box(0.1, 0.07, 0.02), C.overallsDark, { p: [0, 0.62, -0.228] }),
    part(G.box(0.05, 0.3, 0.04), C.overalls, { p: [-0.11, 0.68, -0.15], r: [-0.3, 0, 0] }),
    part(G.box(0.05, 0.3, 0.04), C.overalls, { p: [0.11, 0.68, -0.15], r: [-0.3, 0, 0] }),
    part(S(k, 0.025, 5, 4), C.steel, { p: [-0.11, 0.69, -0.215] }),
    part(S(k, 0.025, 5, 4), C.steel, { p: [0.11, 0.69, -0.215] }),
    part(CYL(k, 0.235, 0.235, 0.05, 14), C.suitDark, { p: [0, 0.38, 0] }),
    part(G.box(0.09, 0.1, 0.07), C.overallsDark, { p: [-0.18, 0.34, -0.12], r: [0, 0.5, 0] }),
    part(G.box(0.09, 0.1, 0.07), C.overallsDark, { p: [0.18, 0.34, -0.12], r: [0, -0.5, 0] }),
  ]), body);

  // tool backpack: box, orange trim, dish antenna on a mast, wrench strapped diagonally (bounces)
  const pack = k.group(body, 0, 0.6, 0.25);
  k.mk(merge([
    part(G.box(0.34, 0.36, 0.18), C.suit, {}),
    part(G.box(0.35, 0.05, 0.185), C.overalls, { p: [0, 0.1, 0] }),
    part(G.box(0.2, 0.12, 0.02), C.suitDark, { p: [0, -0.06, 0.095] }),
    part(S(k, 0.03, 5, 4), C.red, { p: [0.11, 0.13, 0.095], bright: 1.3 }),
    part(S(k, 0.03, 5, 4), C.lens, { p: [0.04, 0.13, 0.095], bright: 1.3 }),
    part(CYL(k, 0.012, 0.012, 0.32, 5), C.steel, { p: [-0.12, 0.34, 0] }),
    part(CYL(k, 0.13, 0.02, 0.06, 12), C.dish, { p: [-0.12, 0.5, 0.02], r: [0.5, 0, 0.3] }),
    part(S(k, 0.025, 5, 4), C.red, { p: [-0.13, 0.54, 0.04], bright: 1.3 }),
    // wrench: handle + open head
    part(G.box(0.04, 0.34, 0.03), C.steel, { p: [0.08, 0.02, 0.11], r: [0, 0, -0.6] }),
    part(G.torus(0.05, 0.018, 4, k.seg(8), Math.PI * 1.5), C.steel, { p: [0.18, 0.17, 0.11], r: [0, 0, -0.6 + 0.8] }),
  ]), pack);

  // head: skin, hard hat dome + brim + headlamp, round goggles
  const head = k.group(body, 0, 0.98, 0);
  k.mk(merge([
    part(S(k, 0.24, 14, 10), C.skin, {}),
    part(S(k, 0.26, 14, 8), C.hat, { p: [0, 0.06, 0], s: [1, 0.85, 1.02] }),
    part(CYL(k, 0.33, 0.33, 0.035, 16), C.hatDark, { p: [0, 0.03, -0.02], s: [1, 1, 1.08] }),
    part(G.box(0.05, 0.03, 0.4), C.hatDark, { p: [0, 0.27, 0.02] }),                     // hat ridge
    part(CYL(k, 0.06, 0.07, 0.07, 10), C.suit, { p: [0, 0.15, -0.255], r: [Math.PI / 2, 0, 0] }),
    part(CYL(k, 0.05, 0.05, 0.02, 10), C.lamp, { p: [0, 0.15, -0.295], r: [Math.PI / 2, 0, 0], bright: 1.7 }),
    part(G.torus(0.065, 0.022, 5, k.seg(12)), C.goggle, { p: [-0.09, -0.01, -0.22] }),
    part(G.torus(0.065, 0.022, 5, k.seg(12)), C.goggle, { p: [0.09, -0.01, -0.22] }),
    part(CYL(k, 0.058, 0.058, 0.02, 10), C.lens, { p: [-0.09, -0.01, -0.225], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
    part(CYL(k, 0.058, 0.058, 0.02, 10), C.lens, { p: [0.09, -0.01, -0.225], r: [Math.PI / 2, 0, 0], bright: 1.3 }),
    part(CYL(k, 0.245, 0.245, 0.03, 14, true), C.goggle, { p: [0, -0.01, 0], s: [1.01, 1, 1.01] }),    // strap
    part(G.box(0.1, 0.02, 0.03), '#a8644a', { p: [0, -0.12, -0.215] }),                   // grin
  ]), head);
  const lamp = glowSprite(C.lamp, 0.5, 0.85);
  lamp.position.set(0, 0.15, -0.34);
  head.add(lamp);

  // overall legs, dark boots
  const legs = [-1, 1].map((side) => {
    const g = k.group(body, 0.11 * side, 0.36, 0);
    k.mk(merge([
      part(CAP(k, 0.085, 0.11, 8), C.overalls, { p: [0, -0.12, 0] }),
      part(CYL(k, 0.09, 0.09, 0.04, 8), C.overallsDark, { p: [0, -0.2, 0] }),
      part(G.box(0.15, 0.1, 0.24), C.boot, { p: [0, -0.3, -0.03] }),
    ]), g);
    return g;
  });

  // arms: grey sleeves, chunky orange gloves
  const arms = [-1, 1].map((side) => {
    const g = k.group(body, 0.27 * side, 0.66, 0);
    k.mk(merge([
      part(CAP(k, 0.065, 0.12, 8), C.suit, { p: [0, -0.1, 0] }),
      part(CYL(k, 0.08, 0.08, 0.05, 8), C.gloveCuff, { p: [0, -0.19, 0] }),
      part(S(k, 0.105, 10, 7), C.glove, { p: [0, -0.26, 0] }),
    ]), g);
    return g;
  });

  const { gun, gunMat, ownGeo } = gunFor(k, arms[1], -0.26);
  const rig = {
    root, body, head, legs, arms, gun, gunMat, ownGunGeo: ownGeo, glow: lamp, pack,
    handSocket: arms[1],
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      const f = R.freq, s = Math.sin(t * f), a = Math.abs(s);
      // Deploy Fortress: crouch (0..0.35 s) and plant the beacon (left arm down), stand up by 0.9 s
      const el = ability * rig.abilityDuration;
      const crouch = ability > 0 ? envelope(el, 0.9, 0.18, 0.35) : 0;
      body.position.y = a * R.bob * run * (1 - crouch) - crouch * 0.2 + (cheer > 0 ? Math.max(0, Math.sin(t * 7)) * 0.3 * cheer : 0);
      body.rotation.x = R.lean * run * (1 - crouch) + crouch * 0.45;
      body.rotation.z = -vx * 0.035 + s * R.roll * run;          // waddle
      root.rotation.y = -vx * 0.03;
      legs[0].rotation.x = s * 0.85 * run * (1 - crouch) - crouch * 0.9;
      legs[1].rotation.x = -s * 0.85 * run * (1 - crouch) - crouch * 0.4;
      arms[0].rotation.x = -s * 0.75 * run * (1 - crouch) - cheer * 2.6 + crouch * 0.5;
      arms[0].rotation.z = -0.18 - cheer * 0.3 - crouch * 0.1;
      arms[1].rotation.x = 1.45 * (1 - cheer) + Math.sin(t * f * 2) * 0.03 - cheer * 2.4 - crouch * 0.35;
      arms[1].rotation.z = 0.06;
      pack.position.y = 0.6 + a * 0.035 * run;
      pack.rotation.x = -a * 0.12 * run + 0.05;
      head.rotation.z = -s * 0.05 * run;
      head.rotation.y = -vx * 0.04;
      lamp.material.opacity = 0.7 + 0.15 * Math.sin(t * 9);
    },
  };
  return finish(rig, k, { id: 'bolt', scale: BASE_SCALE, arm: arms[1], tip: [0, -0.63, -0.02], extraMat: [lamp.material] });
}
