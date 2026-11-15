// Gearworks mini turret (SPEC2 §2.5): a squat steel tripod, a brass gear drum and a copper dome with a short
// barrel. Two meshes (body + rotating head), one shared toon material, <= 400 triangles, shadow only on High
// (helpers pools the visuals; the shadow flag follows the engine quality when one is built).
// Contract: buildGearTurret({ lod }) -> { root, head, dispose(), animate(t, h) }.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { registerWarm } from '../../game/warmup.js';

let geo = null, headGeo = null, mat = null;

function gearRing(R, r, teeth, y, color) {
  const parts = [part(G.cyl(r, r, 0.16, teeth), color, { p: [0, y, 0] })];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    parts.push(part(G.box(0.07, 0.14, R - r + 0.04), color, { p: [Math.sin(a) * (R + r) / 2, y, Math.cos(a) * (R + r) / 2], r: [0, a, 0] }));
  }
  return parts;
}

function geos() {
  if (geo) return;
  const legs = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    return part(G.box(0.07, 0.42, 0.07), '#5b6474', { p: [Math.sin(a) * 0.24, 0.16, Math.cos(a) * 0.24], r: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5] });
  });
  const feet = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    return part(G.cyl(0.07, 0.08, 0.04, 4), '#3a4252', { p: [Math.sin(a) * 0.34, 0.02, Math.cos(a) * 0.34] });
  });
  geo = merge([...legs, ...feet, part(G.cyl(0.2, 0.24, 0.12, 8), '#6c7894', { p: [0, 0.36, 0] })]);
  headGeo = merge([
    ...gearRing(0.3, 0.23, 8, 0.0, '#d9a441'),
    part(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#c87a3a', { p: [0, 0.08, 0] }),
    part(G.cyl(0.05, 0.06, 0.36, 6), '#c8d0dc', { p: [0, 0.14, -0.26], r: [Math.PI / 2, 0, 0] }),
    part(G.cyl(0.075, 0.075, 0.05, 6), '#ffc531', { p: [0, 0.14, -0.44], r: [Math.PI / 2, 0, 0] }),
    part(G.sphere(0.05, 5, 3), '#ffefc0', { p: [0, 0.27, 0.05], bright: 1.3 }),
  ]);
  mat = toonMaterial({ emissive: '#3a2a10', emissiveIntensity: 0.25 });
}

export function buildGearTurret() {
  geos();
  const root = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 0.48;
  body.castShadow = true; head.castShadow = true;
  root.add(body, head);
  root.scale.setScalar(1.15);
  return {
    root, head,
    /** helpers.sync: drum wobble + barrel recoil from the shot count (visual only). */
    animate(t, h) { head.position.y = 0.48 + (h && h.recoil ? h.recoil * 0.04 : 0) + Math.sin(t * 9) * 0.008; },
    dispose() {},
  };
}

/** Triangles of the turret (tests: <= 400). */
export function gearTurretTris() { geos(); return (geo.index ? geo.index.count : geo.attributes.position.count) / 3 + (headGeo.index ? headGeo.index.count : headGeo.attributes.position.count) / 3; }

registerWarm(() => buildGearTurret().root);
