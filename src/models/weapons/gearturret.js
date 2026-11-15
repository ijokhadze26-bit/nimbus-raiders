// Gearworks mini turret model. FOUNDATION STUB (owned by the WEAPONS builder): a small brass box with a drum.
// Contract: buildGearTurret({ lod }) -> { root, head?, dispose() }; <= 400 triangles, toon material only.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { registerWarm } from '../../game/warmup.js';

let geo = null, mat = null;
export function buildGearTurret() {
  if (!geo) {
    geo = merge([
      part(G.cyl(0.32, 0.4, 0.3, 8), '#5b6474', { p: [0, 0.15, 0] }),
      part(G.cyl(0.26, 0.26, 0.28, 10), '#d9a441', { p: [0, 0.45, 0], r: [0, 0, Math.PI / 2] }),
      part(G.sphere(0.18, 8, 5), '#c87a3a', { p: [0, 0.62, 0.05] }),
    ]);
    mat = toonMaterial();
  }
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  root.add(mesh);
  return { root, head: mesh, dispose() {} };
}

registerWarm(() => buildGearTurret().root);
