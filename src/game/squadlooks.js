// Squad member type looks (update 3 stage 5): one InstancedMesh per type (shield / medic / heavy gunner accessory,
// models/raider.js buildRaiderAccessoryGeometry) sharing the Raider toon material. Squad.sync copies each typed
// member's matrix in (writeTypeMatrix) and finishTypeMeshes sets the counts; a mesh with no members is hidden, so a
// squad without types costs nothing. No shadows, no lights; Low quality swaps to the fewer-segment geometry.
import * as THREE from 'three';
import { buildRaiderAccessoryGeometry } from '../models/raider.js';

export function createTypeMeshes(scene, mat, cap) {
  const list = [null];
  for (let t = 1; t <= 3; t++) {
    const geo = { high: buildRaiderAccessoryGeometry(t, false), low: null };
    const mesh = new THREE.InstancedMesh(geo.high, mat, cap);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0; mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    list.push({ mesh, geo, n: 0, type: t });
  }
  return list;
}

/** Copies one 4x4 matrix (16 floats of `src` at `off`) into the type's next instance slot. */
export function writeTypeMatrix(list, type, src, off) {
  const T = list[type];
  if (!T || T.n >= T.mesh.instanceMatrix.count) return;
  const dst = T.mesh.instanceMatrix.array, o = T.n * 16;
  for (let k = 0; k < 16; k++) dst[o + k] = src[off + k];
  T.n++;
}

export function finishTypeMeshes(list) {
  for (let t = 1; t < list.length; t++) {
    const T = list[t];
    T.mesh.count = T.n;
    T.mesh.visible = T.n > 0;
    if (T.n) T.mesh.instanceMatrix.needsUpdate = true;
    T.n = 0;
  }
}

export function setTypeLod(list, q) {
  for (let t = 1; t < list.length; t++) {
    const T = list[t];
    if (q === 'low' && !T.geo.low) T.geo.low = buildRaiderAccessoryGeometry(t, true);
    T.mesh.geometry = q === 'low' ? T.geo.low : T.geo.high;
  }
}
