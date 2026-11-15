// BONBON, Candy Trickster (SPEC2 §3.4). Small and round (height x0.85): a sphere body in mint and pink
// striped overalls, a big head with two puffy pink hair buns, a lilac candy-wrapper bow on the back, lemon
// shoes. Run: a bouncy hop (|sin| bob with squash and stretch, arms swinging wide). Ability (Sugar Shield):
// a 360 degree twirl.
import * as THREE from 'three';
import { kit, part, merge, G, S, CAP, gunFor, stripes, glowSprite, envelope, finish, BASE_SCALE } from './common.js';
import { heroDef } from '../../data/heroes.js';

const C = {
  mint: '#8affc8', pink: '#ff8ad8', bow: '#b48aff', bowDark: '#8f63e8', shoe: '#fff0a0', skin: '#ffd9c2',
  cheek: '#ff9ab8', hair: '#ff8ad8', hairLight: '#ffb3e6', eye: '#2a1838', white: '#ffffff', strap: '#ff6fc8',
};
const HEIGHT = 0.85;

export function buildBonbon({ lod = 'high' } = {}) {
  const k = kit(lod);
  const R = heroDef('bonbon').run;
  const root = new THREE.Group();
  const squash = k.group(root);          // squash and stretch pivot at the feet
  const body = k.group(squash);

  // round body: diagonal mint / pink candy stripes, overall straps + bib, a heart pocket
  const mint = new THREE.Color(C.mint), pink = new THREE.Color(C.pink);
  const ball = G.sphere(0.32, k.seg(18), k.seg(14));
  stripes(ball, (x, y, z) => (Math.floor((y * 1.0 + x * 0.55 + 1) * 7.5) & 1 ? mint : pink));
  ball.deleteAttribute('uv');
  ball.translate(0, 0.46, 0);
  ball.scale(1, 0.95, 0.95);
  // wrapper bow on the back: knot + two twisted wrapper ends
  const end = (side) => part(G.cone(0.13, 0.26, k.seg(6)), C.bow, { p: [0.17 * side, 0.6, 0.33], r: [0, 0, side * Math.PI / 2], s: [1, 1, 0.55] });
  k.mk(merge([
    ball,
    part(G.box(0.2, 0.16, 0.06), C.mint, { p: [0, 0.55, -0.28], r: [-0.25, 0, 0] }),
    part(G.box(0.05, 0.3, 0.04), C.strap, { p: [-0.12, 0.66, -0.2], r: [-0.55, 0, 0] }),
    part(G.box(0.05, 0.3, 0.04), C.strap, { p: [0.12, 0.66, -0.2], r: [-0.55, 0, 0] }),
    part(S(k, 0.035, 6, 4), C.shoe, { p: [-0.12, 0.6, -0.285], bright: 1.2 }),
    part(S(k, 0.035, 6, 4), C.shoe, { p: [0.12, 0.6, -0.285], bright: 1.2 }),
    part(S(k, 0.045, 6, 4), C.pink, { p: [-0.025, 0.53, -0.315], bright: 1.1 }),
    part(S(k, 0.045, 6, 4), C.pink, { p: [0.025, 0.53, -0.315], bright: 1.1 }),
    part(G.cone(0.045, 0.06, 4), C.pink, { p: [0, 0.5, -0.315], r: [Math.PI, 0, Math.PI / 4], bright: 1.1 }),
    part(S(k, 0.075, 8, 6), C.bowDark, { p: [0, 0.6, 0.33] }),
    end(-1), end(1),
  ]), body);

  // big head with two puffy buns
  const head = k.group(body, 0, 0.96, 0);
  k.mk(merge([
    part(S(k, 0.3, 16, 12), C.skin, {}),
    part(S(k, 0.31, 16, 10), C.hair, { p: [0, 0.05, 0.05], s: [1.02, 0.95, 1] }),       // hair cap (back + top)
    part(S(k, 0.12, 8, 6), C.hair, { p: [-0.11, 0.17, -0.2], s: [1.3, 0.7, 0.7] }),     // bangs
    part(S(k, 0.12, 8, 6), C.hair, { p: [0.11, 0.17, -0.2], s: [1.3, 0.7, 0.7] }),
    part(S(k, 0.16, 12, 9), C.hair, { p: [-0.25, 0.25, 0.03] }),                        // buns
    part(S(k, 0.16, 12, 9), C.hair, { p: [0.25, 0.25, 0.03] }),
    part(S(k, 0.07, 8, 6), C.hairLight, { p: [-0.29, 0.33, -0.05], s: [1, 0.6, 0.6] }),
    part(S(k, 0.07, 8, 6), C.hairLight, { p: [0.21, 0.33, -0.05], s: [1, 0.6, 0.6] }),
    part(S(k, 0.06, 8, 6), C.eye, { p: [-0.1, 0.0, -0.265], s: [0.85, 1.25, 0.5] }),    // big eyes
    part(S(k, 0.06, 8, 6), C.eye, { p: [0.1, 0.0, -0.265], s: [0.85, 1.25, 0.5] }),
    part(S(k, 0.02, 4, 3), C.white, { p: [-0.115, 0.03, -0.295], bright: 1.4 }),
    part(S(k, 0.02, 4, 3), C.white, { p: [0.085, 0.03, -0.295], bright: 1.4 }),
    part(S(k, 0.05, 6, 4), C.cheek, { p: [-0.18, -0.08, -0.22], s: [1, 0.6, 0.4] }),
    part(S(k, 0.05, 6, 4), C.cheek, { p: [0.18, -0.08, -0.22], s: [1, 0.6, 0.4] }),
    part(G.torus(0.04, 0.012, 4, 8, Math.PI), '#d9406a', { p: [0, -0.1, -0.28], r: [0, 0, Math.PI] }),  // smile
  ]), head);

  // stubby legs, round lemon shoes
  const legs = [-1, 1].map((side) => {
    const g = k.group(body, 0.12 * side, 0.2, 0);
    k.mk(merge([
      part(CAP(k, 0.07, 0.04, 8), side < 0 ? C.mint : C.pink, { p: [0, -0.06, 0] }),
      part(S(k, 0.1, 10, 7), C.shoe, { p: [0, -0.15, -0.03], s: [1, 0.7, 1.35] }),
    ]), g);
    return g;
  });

  // short arms that swing wide
  const arms = [-1, 1].map((side) => {
    const g = k.group(body, 0.3 * side, 0.62, 0);
    k.mk(merge([
      part(CAP(k, 0.06, 0.1, 8), side < 0 ? C.pink : C.mint, { p: [0, -0.08, 0] }),
      part(S(k, 0.075, 8, 6), C.white, { p: [0, -0.19, 0] }),
    ]), g);
    return g;
  });
  const sparkle = glowSprite(C.hairLight, 0.5, 0.0);
  sparkle.position.set(0, 0.6, 0.4);
  body.add(sparkle);

  const { gun, gunMat, ownGeo } = gunFor(k, arms[1], -0.19);
  const rig = {
    root, body, head, legs, arms, gun, gunMat, ownGunGeo: ownGeo, glow: sparkle,
    handSocket: arms[1],
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      const f = R.freq, ph = t * f, s = Math.sin(ph), a = Math.abs(s);
      // Sugar Shield: a 360 twirl over the first 0.6 s
      const el = ability * rig.abilityDuration;
      const tw = ability > 0 && el < 0.6 ? el / 0.6 : 0;
      const spinE = tw > 0 ? tw * tw * (3 - 2 * tw) : 0;
      const hop = a * R.bob * run + (cheer > 0 ? Math.max(0, Math.sin(t * 8)) * 0.35 * cheer : 0) + envelope(el, 0.6, 0.15, 0.25) * 0.18;
      // squash at the bottom of the hop, stretch at the top (scale y 0.9 .. 1.1)
      const sq = run > 0 ? 0.9 + 0.2 * a : 1;
      squash.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
      body.position.y = hop;
      body.rotation.x = R.lean * run;
      body.rotation.z = -vx * 0.04 + Math.sin(ph * 0.5) * 0.05 * run;
      root.rotation.y = -vx * 0.03 + spinE * Math.PI * 2;
      legs[0].rotation.x = s * 0.9 * run;
      legs[1].rotation.x = -s * 0.9 * run;
      // left arm swings wide; gun arm forward with a little bounce
      arms[0].rotation.x = -s * 0.9 * run - cheer * 2.6;
      arms[0].rotation.z = -0.55 - a * 0.35 * run - cheer * 0.3 - spinE * 0.8 * (1 - spinE) * 4;
      arms[1].rotation.x = 1.4 * (1 - cheer) + s * 0.08 * run - cheer * 2.4;
      arms[1].rotation.z = 0.15 + a * 0.1 * run;
      head.rotation.z = Math.sin(ph * 0.5) * 0.08 * run;
      head.rotation.y = -vx * 0.04;
      sparkle.material.opacity = tw > 0 ? 0.8 * (1 - tw) + 0.2 : 0;
    },
  };
  return finish(rig, k, { id: 'bonbon', scale: BASE_SCALE * HEIGHT, arm: arms[1], tip: [0, -0.56, -0.02], extraMat: [sparkle.material] });
}
