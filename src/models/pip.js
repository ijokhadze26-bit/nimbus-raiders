// Pip: the hero sky-cadet (leader). Real limb rig: legs, arms, head, scarf tail, jet flames.
// Faces -Z. Height ~1.3u (about 1.6x a Raider).
// Update 2 rig contract (SPEC2 §3.7), additive: scale, muzzle (local gun tip, x scale = world offset),
// handSocket (gun parent), animate(..., ability), dispose(). Every running number is unchanged.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial, glowTexture } from './materials.js';

export const PIP_SCALE = 1.25;

const C = {
  suit: '#2f6ff2', suitDark: '#2148b8', helmet: '#f8fbff', visor: '#1fd0c4', visorDeep: '#119a9a',
  scarf: '#ff8a2b', scarfDark: '#e8641a', pack: '#e3eaf5', packDark: '#4f5d78', glove: '#ffffff',
  belt: '#1c3a8c', gold: '#ffc531', stripe: '#2f8cff', glow: '#7ff3ff',
};

export function buildPip(skin = {}) {
  const c = { ...C, ...skin };
  const mat = toonMaterial();
  const root = new THREE.Group();     // positioned by squad (x, z)
  const body = new THREE.Group();     // bob + lean
  root.add(body);
  const meshes = [];
  const mk = (geo, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); meshes.push(m); return m; };

  // Torso (static parts merged)
  mk(merge([
    part(G.capsule(0.22, 0.16, 3, 10), c.suit, { p: [0, 0.55, 0] }),
    part(G.cyl(0.228, 0.228, 0.07, 12), c.belt, { p: [0, 0.43, 0] }),
    part(G.box(0.09, 0.07, 0.04), c.gold, { p: [0, 0.43, -0.225] }),
    part(G.box(0.1, 0.12, 0.03), c.gold, { p: [0.06, 0.6, -0.21], r: [0, 0, 0.5] }),
    // scarf ring
    part(G.torus(0.15, 0.065, 6, 14), c.scarf, { p: [0, 0.74, 0], r: [Math.PI / 2, 0, 0] }),
    // backpack jet
    part(G.box(0.34, 0.36, 0.17), c.pack, { p: [0, 0.6, 0.23] }),
    part(G.box(0.35, 0.06, 0.175), c.stripe, { p: [0, 0.68, 0.23] }),
    part(G.box(0.1, 0.1, 0.02), c.gold, { p: [0, 0.56, 0.32] }),
    part(G.cyl(0.06, 0.075, 0.13, 8), c.packDark, { p: [-0.09, 0.38, 0.26] }),
    part(G.cyl(0.06, 0.075, 0.13, 8), c.packDark, { p: [0.09, 0.38, 0.26] }),
  ]), body);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0);
  body.add(head);
  mk(merge([
    part(G.sphere(0.31, 16, 12), c.helmet, {}),
    part(G.sphere(0.25, 14, 9), c.visor, { p: [0, -0.02, -0.15], s: [1.08, 0.74, 0.7] }),
    part(G.sphere(0.06, 6, 4), '#ffffff', { p: [-0.1, 0.05, -0.31], s: [1.3, 0.8, 0.4], bright: 1.5 }),
    part(G.torus(0.305, 0.035, 5, 16, Math.PI), c.stripe, { r: [0, Math.PI / 2, 0] }),
    part(G.cyl(0.075, 0.075, 0.07, 10), c.scarf, { p: [-0.3, 0, 0], r: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.075, 0.075, 0.07, 10), c.scarf, { p: [0.3, 0, 0], r: [0, 0, Math.PI / 2] }),
    part(G.cyl(0.012, 0.012, 0.2, 4), c.packDark, { p: [-0.18, 0.3, 0.05], r: [0, 0, 0.35] }),
    part(G.sphere(0.04, 6, 4), c.gold, { p: [-0.215, 0.4, 0.05], bright: 1.2 }),
  ]), head);

  // Legs (pivot at hip)
  const legs = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(0.1 * side, 0.36, 0);
    body.add(g);
    mk(merge([
      part(G.capsule(0.075, 0.12, 2, 8), c.suitDark, { p: [0, -0.13, 0] }),
      part(G.sphere(0.095, 8, 6), c.glove, { p: [0, -0.27, -0.03], s: [1, 0.75, 1.3] }),
    ]), g);
    return g;
  });

  // Arms (pivot at shoulder). Right arm holds the gun forward.
  const arms = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(0.25 * side, 0.64, 0);
    body.add(g);
    mk(merge([
      part(G.capsule(0.065, 0.13, 2, 8), c.suit, { p: [0, -0.11, 0] }),
      part(G.sphere(0.08, 8, 6), c.glove, { p: [0, -0.23, 0] }),
    ]), g);
    return g;
  });
  const gunMat = new THREE.MeshToonMaterial({ gradientMap: mat.gradientMap, color: '#ffd34d', vertexColors: true });
  const ownGunGeo = merge([
    part(G.box(0.1, 0.32, 0.12), '#ffffff', { p: [0, -0.3, -0.02] }),
    part(G.box(0.06, 0.16, 0.06), '#ffffff', { p: [0, -0.5, -0.02], bright: 1.2 }),
    part(G.box(0.07, 0.08, 0.1), '#4b5672', { p: [0, -0.24, 0.07] }),
  ]);
  const gun = new THREE.Mesh(ownGunGeo, gunMat);
  gun.castShadow = true;
  arms[1].add(gun);

  // Scarf tail (flutters behind toward the camera)
  const scarf = new THREE.Group();
  scarf.position.set(0.08, 0.76, 0.14);
  body.add(scarf);
  const tailA = mk(merge([part(G.box(0.12, 0.035, 0.26), c.scarf, { p: [0, 0, 0.13] })]), scarf);
  const tailB = new THREE.Group();
  tailB.position.set(0, 0, 0.26);
  scarf.add(tailB);
  mk(merge([part(G.box(0.11, 0.03, 0.22), c.scarfDark, { p: [0, 0, 0.11] })]), tailB);

  // Jet flames (additive glow) under the nozzles
  const flameMat = new THREE.MeshBasicMaterial({ color: c.glow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.055, 0.22, 8);
  flameGeo.rotateX(Math.PI);
  const flames = [-0.09, 0.09].map((x) => {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(x, 0.22, 0.26);
    body.add(f);
    return f;
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c.glow, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.55, 0.55, 1);
  glow.position.set(0, 0.24, 0.3);
  body.add(glow);

  root.scale.setScalar(PIP_SCALE);

  const pip = {
    id: 'pip', root, body, head, legs, arms, gun, gunMat, scarf, tailB, flames, glow, meshes,
    scale: PIP_SCALE,
    muzzle: { x: 0.32 / PIP_SCALE, y: 0.9 / PIP_SCALE, z: -0.75 / PIP_SCALE },
    handSocket: arms[1],
    abilityDuration: 0.6,   // Rally Call pose length (s) that `ability` 0..1 spans
    /** t = time (s), run = 0..1 run blend, vx = sideways speed, cheer = 0..1 celebration, ability = 0..1 pose */
    animate(t, run, vx = 0, cheer = 0, ability = 0) {
      if (ability > 0) cheer = Math.max(cheer, Math.sin(Math.min(1, ability) * Math.PI));
      const f = 11.5;
      const s = Math.sin(t * f);
      const bob = Math.abs(Math.sin(t * f)) * 0.07 * run;
      const jump = cheer > 0 ? Math.max(0, Math.sin(t * 7)) * 0.35 * cheer : 0;
      body.position.y = bob + jump;
      body.rotation.x = -0.14 * run;
      body.rotation.z = -vx * 0.035 + s * 0.04 * run;
      root.rotation.y = -vx * 0.03;
      legs[0].rotation.x = s * 0.8 * run;
      legs[1].rotation.x = -s * 0.8 * run;
      arms[0].rotation.x = -s * 0.7 * run - cheer * 2.6;
      arms[0].rotation.z = -0.15 - cheer * 0.3;
      arms[1].rotation.x = 1.45 * (1 - cheer) + Math.sin(t * f * 2) * 0.03 - cheer * 2.4;
      arms[1].rotation.z = 0.05;
      head.rotation.z = -s * 0.04 * run;
      head.rotation.y = -vx * 0.04;
      scarf.rotation.x = 0.35 + Math.sin(t * 17) * 0.18 * (0.4 + run);
      scarf.rotation.y = Math.sin(t * 9) * 0.25 + vx * 0.05;
      tailB.rotation.x = Math.sin(t * 17 + 1.3) * 0.35;
      const fl = 0.85 + Math.sin(t * 43) * 0.15 + Math.sin(t * 27) * 0.1;
      for (const fm of flames) fm.scale.set(1, fl * (0.8 + run * 0.6), 1);
      glow.material.opacity = 0.55 + fl * 0.3;
      tailA.scale.y = 1;
    },
    /** Frees every geometry / material this rig created (shared textures and cached gun geometries stay). */
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      ownGunGeo.dispose();
      mat.dispose(); gunMat.dispose();
      flameGeo.dispose(); flameMat.dispose(); glow.material.dispose();
    },
  };
  return pip;
}
