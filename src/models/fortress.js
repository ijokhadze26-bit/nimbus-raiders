// Deploy Fortress turret model. FOUNDATION STUB (owned by the HEROES builder): the barrel turret scaled up.
// Contract: buildFortress({ lod }) -> { root, head?, cannon?, animate?(t, entry), dispose() }; <= 900 triangles,
// <= 4 meshes, toon material, shadow only on High. Registered as the 'fortress' road-turret look
// (helpers.registerVisual) and for warm-up.
import * as THREE from 'three';
import { buildTurretGeometry, buildCannonGeometry } from './helpers.js';
import { toonMaterial } from './materials.js';
import { registerWarm } from '../game/warmup.js';

let geo = null, mat = null;
export function buildFortress() {
  if (!geo) { geo = { body: buildTurretGeometry(), cannon: buildCannonGeometry() }; mat = toonMaterial(); }
  const root = new THREE.Group();
  const body = new THREE.Mesh(geo.body, mat);
  body.castShadow = true;
  const cannon = new THREE.Mesh(geo.cannon, mat);
  cannon.position.set(0, 0.62, -0.05);
  body.add(cannon);
  body.scale.setScalar(1.5);
  root.add(body);
  return { root, head: cannon, dispose() {} };
}

registerWarm(() => buildFortress().root);
