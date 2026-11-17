// Road bell (update 3 road object): a stone arch across the whole bridge with a big bronze bell hanging in
// the middle (the target). Rung, it swings and sends out sound rings; the stun stars over the enemies are
// one InstancedMesh (bellStars). buildBell() -> { group, arch, pivot, bell (flash material), rings, tag }.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { once, propMaterial, flashMaterial, hpTag } from './common.js';

export const BELL = { pivotY: 6.6, h: 1.9, postX: 5.3 };
const STONE = '#b7bfcf', STONE_D = '#7f879a', BRONZE = '#e3a63c', BRONZE_D = '#a86f1d';

function archGeometry(low) {
  const parts = [];
  for (const sx of [-1, 1]) {
    const x = sx * BELL.postX;
    parts.push(part(G.box(0.75, 5.6, 0.75), STONE, { p: [x, 2.8, 0] }));
    parts.push(part(G.box(1.0, 0.4, 1.0), STONE_D, { p: [x, 0.2, 0] }));
    parts.push(part(G.box(0.95, 0.35, 0.95), STONE_D, { p: [x, 5.55, 0] }));
    for (let y = 1.0; y < 5.2; y += 1.05) parts.push(part(G.box(0.78, 0.06, 0.78), STONE_D, { p: [x, y, 0] }));
  }
  // curved beam over the road from post top to post top; the bell hangs from its apex on a short chain
  parts.push(part(G.torus(BELL.postX, 0.34, low ? 5 : 7, low ? 14 : 24, Math.PI), STONE, { p: [0, 5.6, 0], s: [1, 0.38, 1] }));
  parts.push(part(G.box(0.9, 0.5, 0.8), STONE_D, { p: [0, 7.55, 0] }));
  parts.push(part(G.box(0.14, 0.75, 0.14), '#3d3f4a', { p: [0, 7.0, 0] }));
  // little pennants on the posts
  for (const sx of [-1, 1]) parts.push(part(G.cone(0.32, 0.9, 3), '#ff5a6e', { p: [sx * BELL.postX, 6.25, 0], r: [0, 0, sx * 0.15] }));
  return merge(parts);
}

/** Bell with a crown loop and a clapper (local origin = the hanging point, bell below). */
function bellGeometry() {
  return once('bellBody', () => {
    const h = BELL.h;
    const prof = [[0.05, 0], [0.42, -0.04], [0.55, -0.3], [0.6, -0.8], [0.72, -1.3], [0.96, -1.72], [1.02, -h], [0.9, -h + 0.04], [0.82, -h + 0.08]];
    const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
    return merge([
      part(lathe, BRONZE),
      part(G.torus(0.99, 0.07, 5, 18), BRONZE_D, { p: [0, -h + 0.12, 0], r: [Math.PI / 2, 0, 0] }),
      part(G.torus(0.63, 0.05, 5, 16), BRONZE_D, { p: [0, -0.85, 0], r: [Math.PI / 2, 0, 0] }),
      part(G.torus(0.2, 0.07, 5, 10), '#3d3f4a', { p: [0, 0.12, 0] }),
      part(G.sphere(0.26, 10, 8), '#5a4a3a', { p: [0, -h - 0.05, 0] }),
      part(G.cyl(0.05, 0.05, 1.2, 5), '#3d3f4a', { p: [0, -h + 0.55, 0] }),
      // shine streak on the front
      part(G.box(0.12, 0.9, 0.05), '#fff0b8', { p: [-0.35, -1.0, 0.68], r: [0.2, 0, 0.12] }),
    ]);
  });
}

function ringTexture() {
  return once('bellRingTex', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 40, 64, 64, 63);
    grd.addColorStop(0, 'rgba(255,240,180,0)'); grd.addColorStop(0.65, 'rgba(255,240,180,0.9)'); grd.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function buildBell(low) {
  const group = new THREE.Group();
  const arch = new THREE.Mesh(once('bellArch' + (low ? 'L' : ''), () => archGeometry(low)), propMaterial());
  arch.castShadow = !low;
  group.add(arch);
  const pivot = new THREE.Group();
  pivot.position.set(0, BELL.pivotY, 0);
  const bell = new THREE.Mesh(bellGeometry(), flashMaterial());
  pivot.add(bell);
  group.add(pivot);
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(once('bellRingGeo', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
    r.position.set(0, BELL.pivotY - 1.1, 0.2);
    r.visible = false;
    rings.push(r);
    group.add(r);
  }
  const tag = hpTag(1.3);
  tag.mesh.position.set(0, BELL.pivotY - 1.15, 1.05);
  group.add(tag.mesh);
  return { group, arch, pivot, bell, rings, tag };
}

/** Stun stars (shared InstancedMesh, cap instances): a small yellow 5-point star. */
export function buildStars(cap) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.09 : 0.22;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe14d', toneMapped: false, side: THREE.DoubleSide }), cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 4;
  return mesh;
}
