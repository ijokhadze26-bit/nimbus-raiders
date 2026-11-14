// Oculon: a floating storm-cloud eyeball. A huge glossy eye (teal iris, eyelids that blink and narrow
// into a glare) sits in a cumulus collar, two gold/cyan rings orbit it with spark studs, little lightning
// tendrils dangle underneath. Phase 2: red iris, hot rings, darker cloud. Faces +Z. Eye centre ~6u up.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { cloud, contactShadow, glowSprite, zigzag } from './common.js';

const CLOUD_TOP = '#eef2ff', CLOUD_BOT = '#7d88b8';

export function buildOculon() {
  const mat = toonMaterial();
  const root = new THREE.Group();
  const body = new THREE.Group();          // hover bob + tilt
  body.position.y = 5.0;
  root.add(body);
  const mk = (geo, parent, m = mat, shadow = true) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; parent.add(mesh); return mesh; };

  // storm-cloud collar behind and under the eye
  const cloudGroup = new THREE.Group();
  body.add(cloudGroup);
  mk(cloud([
    [0, -1.9, -0.4, 1.55, 1.5, 0.8, 1.2], [-1.9, -1.2, -0.6, 1.3], [1.9, -1.2, -0.6, 1.3],
    [-2.75, 0.3, -1.1, 1.2], [2.75, 0.3, -1.1, 1.2], [-2.0, 1.95, -1.2, 1.15], [2.0, 1.95, -1.2, 1.15],
    [0, 2.6, -1.5, 1.35, 1.3, 1, 1], [-0.9, -2.3, 0.6, 0.85], [0.9, -2.3, 0.6, 0.85],
    [0, 0.2, -1.9, 2.0, 1.3, 1.2, 0.8], [-3.1, -0.8, -0.3, 0.75], [3.1, -0.8, -0.3, 0.75],
    [-1.3, 3.0, -0.7, 0.7], [1.4, 2.9, -0.8, 0.75],
  ], CLOUD_TOP, CLOUD_BOT), cloudGroup);
  // dangling lightning tendrils (glow material, recoloured in phase 2)
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#fff27a', toneMapped: false, fog: false });
  const tendrils = mk(merge([
    zigzag([-1.0, -2.6, 0.4], [-1.3, -4.4, 0.6], 4, 0.12, 3),
    zigzag([0.4, -2.8, 0.6], [0.6, -4.9, 0.9], 5, 0.12, 7),
    zigzag([1.5, -2.4, 0.2], [1.9, -4.0, 0.3], 3, 0.1, 11),
  ]), cloudGroup, sparkMat, false);

  // the eye (rotates to watch the squad)
  const eye = new THREE.Group();
  eye.scale.setScalar(1.12);
  body.add(eye);
  mk(merge([
    part(G.sphere(2.1, 32, 22), '#f8f9ff'),
    // faint vein lines
    part(G.torus(2.08, 0.025, 4, 40, 1.2), '#ff9aa8', { r: [0.4, 0.6, 0.2] }),
    part(G.torus(2.08, 0.025, 4, 40, 0.9), '#ff9aa8', { r: [-0.5, -0.7, 2.4] }),
  ]), eye);
  const irisMat = new THREE.MeshToonMaterial({ color: '#25d4e8', emissive: '#0a5a70', gradientMap: mat.gradientMap });
  const iris = mk(new THREE.SphereGeometry(2.115, 32, 10, 0, Math.PI * 2, 0, 0.62).rotateX(Math.PI / 2), eye, irisMat, false);
  const irisRing = mk(part(new THREE.TorusGeometry(1.2, 0.07, 6, 40), '#0b3550', { p: [0, 0, 1.75] }), eye, toonMaterial(), false);
  const pupil = mk(part(new THREE.SphereGeometry(2.13, 24, 6, 0, Math.PI * 2, 0, 0.3).rotateX(Math.PI / 2), '#101828'), eye, mat, false);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  shine.position.set(-0.62, 0.7, 2.0); shine.scale.set(1, 0.75, 0.4);
  eye.add(shine);
  const shine2 = shine.clone(); shine2.position.set(-0.2, 0.32, 2.12); shine2.scale.set(0.45, 0.35, 0.2);
  eye.add(shine2);

  // eyelids: cloud shells hinged at the eye centre (rotation.x opens/closes them)
  const lidGeo = (top) => {
    const g = new THREE.SphereGeometry(2.28, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    if (!top) g.rotateX(Math.PI);
    return part(g, top ? '#c3cbea' : '#9aa5d2');
  };
  const lidTop = new THREE.Group(), lidBot = new THREE.Group();
  eye.add(lidTop, lidBot);
  mk(lidGeo(true), lidTop);
  mk(lidGeo(false), lidBot);
  // angry brow puff riding on the top lid
  mk(cloud([[0, 0.2, 2.2, 0.42, 2.3, 0.5, 0.7], [-1.35, 0.16, 1.84, 0.4], [1.35, 0.16, 1.84, 0.4]], CLOUD_TOP, '#a9b2dd', 10), lidTop);

  // orbiting rings with spark studs
  const ringMats = [new THREE.MeshToonMaterial({ color: '#ffc531', emissive: '#6a4200', gradientMap: mat.gradientMap }), new THREE.MeshToonMaterial({ color: '#59e8ff', emissive: '#0b5566', gradientMap: mat.gradientMap })];
  const rings = [];
  const ringDefs = [{ r: 3.5, tilt: [1.25, 0, 0.35] }, { r: 3.95, tilt: [1.9, 0, -0.5] }];
  ringDefs.forEach((d, i) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(...d.tilt);
    body.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    const studs = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      studs.push(part(G.sphere(0.2, 8, 6), '#ffffff', { p: [Math.cos(a) * d.r, Math.sin(a) * d.r, 0] }));
    }
    const ring = mk(new THREE.TorusGeometry(d.r, 0.13, 8, 64), spin, ringMats[i]);
    const studMesh = mk(merge(studs), spin, sparkMat, false);
    const glow = glowSprite(i ? '#59e8ff' : '#ffd84a', 1.2, 0.9);
    glow.position.set(d.r, 0, 0);
    spin.add(glow);
    rings.push({ pivot, spin, ring, studMesh, glow, speed: i ? -1.1 : 0.8 });
  });

  const aura = glowSprite('#7fe9ff', 13, 0.28);
  body.add(aura);
  aura.position.z = -1.5;

  const shadow = contactShadow(6.5, 4.5, 0.36);
  root.add(shadow);
  root.scale.setScalar(1.25);
  return { root, body, eye, iris, irisMat, irisRing, pupil, lidTop, lidBot, rings, ringMats, cloudGroup, tendrils, sparkMat, aura, shadow, mat };
}
