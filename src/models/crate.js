// Weapon crate model. FOUNDATION STUB (owned by the WEAPONS builder): a glass-coloured box in the weapon's
// colour with a ground ring. Contract: buildCrate(weaponId) -> { root, setWeapon(id), update(t, crate) };
// <= 300 triangles, <= 3 draw calls, pooled by game/crates.js (max 2 alive), registered for warm-up.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { toonMaterial } from './materials.js';
import { weaponDef } from '../data/weapons.js';
import { registerWarm } from '../game/warmup.js';

let boxGeo = null, ringGeo = null;
function geos() {
  if (!boxGeo) {
    boxGeo = merge([
      part(G.box(1.3, 1.3, 1.3), '#ffffff', { p: [0, 0.95, 0] }),
      part(G.box(1.42, 0.14, 1.42), '#1b3a8a', { p: [0, 0.35, 0] }),
      part(G.box(1.42, 0.14, 1.42), '#1b3a8a', { p: [0, 1.55, 0] }),
    ]);
    ringGeo = new THREE.RingGeometry(1.1, 1.45, 24).rotateX(-Math.PI / 2);
  }
}

export function buildCrate(weaponId) {
  geos();
  const root = new THREE.Group();
  const mat = toonMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25 });
  const box = new THREE.Mesh(boxGeo, mat);
  box.castShadow = true;
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04;
  root.add(box, ring);
  const crate = {
    root, box, ring,
    setWeapon(id) {
      const c = weaponDef(id).look.mk[0].color;
      mat.color.set(c); mat.emissive.set(c); ringMat.color.set(c);
    },
    update(t) { box.rotation.y = t * 1.2; box.position.y = Math.sin(t * 2.4) * 0.12; },
  };
  crate.setWeapon(weaponId);
  return crate;
}

registerWarm(() => buildCrate('thunderclap').root);
