// Deploy Fortress turret (SPEC2 §3.5): an armoured box on tracks with a turret head, a twin cannon and a
// radar dish. 4 meshes (hull, head, cannons, dish), <= 900 triangles, toon material, casts a shadow only on
// High. Built at 1/1.5 size: helpers scales road turrets by their shell scale (1.5).
// Contract: buildFortress({ quality?: () => 'high'|'low' }) -> { root, head, animate(t, entry), dispose() }.
// Registered as the 'fortress' road-turret look (game/abilities/fortress.js) and for warm-up.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial } from './materials.js';
import { registerWarm } from '../game/warmup.js';

const C = {
  hull: '#4b5672', hullDark: '#353d52', plate: '#ffb21f', plateDark: '#e08a10', track: '#23283a', steel: '#c8d0dc',
  dome: '#ffd34d', barrel: '#55607a', muzzle: '#ff8a2b', lens: '#2fd6c8', dish: '#e3eaf5', red: '#ff3b4e',
};
const S = 1 / 1.5;

let geo = null, mat = null;
function geometries() {
  if (geo) return geo;
  const tread = (x) => [
    part(G.box(0.22, 0.26, 1.15), C.track, { p: [x, 0.16, 0] }),
    part(G.cyl(0.13, 0.13, 0.24, 8), C.hullDark, { p: [x, 0.16, -0.5], r: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.13, 0.13, 0.24, 8), C.hullDark, { p: [x, 0.16, 0.5], r: [0, 0, Math.PI / 2] }),
  ];
  const hull = merge([
    ...tread(-0.42), ...tread(0.42),
    part(G.box(0.7, 0.32, 1.05), C.hull, { p: [0, 0.4, 0] }),
    part(G.box(0.74, 0.07, 1.08), C.plate, { p: [0, 0.58, 0] }),
    part(G.box(0.6, 0.18, 0.08), C.plateDark, { p: [0, 0.36, -0.54], r: [0.35, 0, 0] }),
    part(G.box(0.08, 0.06, 0.02), C.red, { p: [-0.22, 0.42, -0.57], bright: 1.4 }),
    part(G.box(0.08, 0.06, 0.02), C.red, { p: [0.22, 0.42, -0.57], bright: 1.4 }),
    part(G.box(0.5, 0.2, 0.2), C.hullDark, { p: [0, 0.48, 0.5] }),                  // engine block
    part(G.cyl(0.05, 0.05, 0.22, 6), C.steel, { p: [-0.15, 0.66, 0.52] }),         // exhausts
    part(G.cyl(0.05, 0.05, 0.22, 6), C.steel, { p: [0.15, 0.66, 0.52] }),
  ]);
  const head = merge([
    part(G.cyl(0.36, 0.42, 0.26, 12), C.hull, { p: [0, 0.13, 0] }),
    part(new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.dome, { p: [0, 0.26, 0.04], s: [1, 0.65, 1] }),
    part(G.box(0.46, 0.18, 0.22), C.hullDark, { p: [0, 0.2, -0.3] }),             // mantlet
    part(G.box(0.3, 0.06, 0.03), C.lens, { p: [0, 0.38, -0.22], bright: 1.4 }),   // sight
    part(G.box(0.1, 0.1, 0.1), C.hullDark, { p: [0.28, 0.4, 0.12] }),             // dish mount
  ]);
  const barrel = (x) => [
    part(G.cyl(0.07, 0.085, 0.75, 8), C.barrel, { p: [x, 0, -0.38], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.1, 0.1, 0.12, 8), C.muzzle, { p: [x, 0, -0.74], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.05, 0.05, 0.02, 8), '#1b1f2b', { p: [x, 0, -0.81], r: [Math.PI / 2, 0, 0] }),
  ];
  const cannons = merge([...barrel(-0.13), ...barrel(0.13), part(G.box(0.36, 0.12, 0.14), C.plateDark, { p: [0, 0, -0.05] })]);
  const dish = merge([
    part(G.cyl(0.02, 0.02, 0.22, 5), C.steel, { p: [0, 0.11, 0] }),
    part(G.cyl(0.2, 0.04, 0.07, 12, true), C.dish, { p: [0, 0.25, 0], r: [0.6, 0, 0] }),
    part(G.sphere(0.035, 6, 4), C.red, { p: [0, 0.3, -0.06], bright: 1.5 }),
  ]);
  geo = { hull, head, cannons, dish };
  mat = toonMaterial();
  return geo;
}

export function buildFortress(opts = {}) {
  const g = geometries();
  const root = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(S * 1.6);   // x1.6 of a barrel turret overall at shell scale 1.5
  root.add(scaled);
  const hull = new THREE.Mesh(g.hull, mat);
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  const headMesh = new THREE.Mesh(g.head, mat);
  const cannons = new THREE.Mesh(g.cannons, mat);
  cannons.position.set(0, 0.2, -0.3);
  const dish = new THREE.Mesh(g.dish, mat);
  dish.position.set(0.28, 0.44, 0.12);
  head.add(headMesh, cannons, dish);
  scaled.add(hull, head);
  const meshes = [hull, headMesh, cannons, dish];
  let shadow = null;
  const setShadow = (on) => { if (on === shadow) return; shadow = on; for (const m of meshes) m.castShadow = on; };
  setShadow(true);
  return {
    root, head, meshes,
    animate(t, h) {
      setShadow(!opts.quality || opts.quality() !== 'low');
      dish.rotation.y = t * 3;
      const rc = h ? h.recoil || 0 : 0;
      cannons.position.z = -0.3 + rc * 0.18;
      hull.position.y = Math.abs(Math.sin(t * 16)) * 0.015;
    },
    dispose() {},
  };
}

registerWarm(() => buildFortress().root);
