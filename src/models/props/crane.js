// Road crane (update 3 road object): a yellow lattice tower on a stone ledge beside the bridge, a jib reaching
// over one lane, a cable + hook block holding a heavy iron-strapped crate over the road, and the dashed drop
// ring painted under it. Merged geometry: tower (1 mesh), swing (cable + hook, 1 mesh), crate (1 mesh), ring,
// hp tag. buildCrane(side, hookX) -> { group, swing, hook (flash material), crate, ring, tag, low }.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { once, propMaterial, flashMaterial, ledgeParts, hpTag, dashRingTexture, decalMat, flatPlane } from './common.js';

export const CRANE = { jibY: 8.2, cable: 2.7, crate: 1.75, hangY: 8.2 - 2.7 - 1.3 - 1.75 / 2, ringR: 2.6 };
const Y = '#ffbf1f', YD = '#d48a0a', DARK = '#33343f', STEEL = '#8b93a6';

function towerGeometry(side, hookX, low) {
  const bx = side * 6.25, H = CRANE.jibY;
  const parts = ledgeParts(side, 2.9, 3.2);
  const s = 0.62; // half width of the lattice
  for (const dx of [-s, s]) for (const dz of [-s, s]) parts.push(part(G.box(0.2, H, 0.2), Y, { p: [bx + dx, H / 2, dz] }));
  // cross braces on the two faces the camera sees (front and road side); Low: every other one
  const step = low ? 2.2 : 1.1;
  for (let y = 0.6; y < H - 0.6; y += step) {
    parts.push(part(G.box(0.08, 1.75, 0.08), DARK, { p: [bx, y + 0.5, s], r: [0, 0, 0.78] }));
    parts.push(part(G.box(0.08, 1.75, 0.08), DARK, { p: [bx - side * s, y + 0.5, 0], r: [0.78, 0, 0] }));
    parts.push(part(G.box(1.3, 0.1, 0.1), YD, { p: [bx, y, s] }));
  }
  // cab with a window, under the jib
  parts.push(part(G.box(1.5, 1.1, 1.5), '#f2f4f8', { p: [bx, H - 0.35, 0] }));
  parts.push(part(G.box(1.52, 0.5, 0.9), '#5fc8ff', { p: [bx, H - 0.25, 0.32] }));
  // jib toward the road (a box truss), counter jib + weight outwards
  const x0 = bx, x1 = hookX - side * 0.9, len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
  parts.push(part(G.box(len, 0.16, 0.16), Y, { p: [mid, H + 0.25, 0.3] }));
  parts.push(part(G.box(len, 0.16, 0.16), Y, { p: [mid, H + 0.25, -0.3] }));
  parts.push(part(G.box(len, 0.14, 0.14), Y, { p: [mid, H + 0.85, 0] }));
  const n = Math.max(3, Math.round(len / (low ? 1.4 : 0.8)));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0);
    parts.push(part(G.box(0.07, 0.75, 0.07), DARK, { p: [x, H + 0.55, 0.15], r: [0, 0, (i % 2 ? 0.55 : -0.55) * side] }));
  }
  parts.push(part(G.box(0.12, 0.12, 0.7), DARK, { p: [x1, H + 0.25, 0] }));
  const cx = bx + side * 1.6;
  parts.push(part(G.box(2.2, 0.16, 0.5), Y, { p: [bx + side * 1.0, H + 0.25, 0] }));
  parts.push(part(G.box(1.0, 0.9, 1.0), '#7c808c', { p: [cx, H - 0.05, 0] }));
  // apex + tie lines
  parts.push(part(G.cone(0.32, 1.4, 4), Y, { p: [bx, H + 1.5, 0] }));
  for (const tx of [x1, cx]) {
    const dx = tx - bx, dy = (H + 0.3) - (H + 2.1), l = Math.hypot(dx, dy);
    parts.push(part(G.cyl(0.035, 0.035, l, 4), DARK, { p: [(bx + tx) / 2, (H + 2.1 + H + 0.3) / 2, 0], r: [0, 0, Math.atan2(dy, dx) - Math.PI / 2] }));
  }
  // trolley over the hook
  parts.push(part(G.box(0.7, 0.3, 0.75), DARK, { p: [hookX, H + 0.1, 0] }));
  // warning stripes on the base
  parts.push(part(G.box(1.5, 0.35, 1.5), DARK, { p: [bx, 0.2, 0] }));
  parts.push(part(G.box(1.52, 0.12, 1.52), Y, { p: [bx, 0.3, 0] }));
  return merge(parts);
}

/** Cable + hook block, hanging from the trolley (local origin = the trolley, y down). */
function swingGeometry() {
  return once('craneSwing', () => {
    const c = CRANE.cable;
    return merge([
      part(G.cyl(0.045, 0.045, c, 5), DARK, { p: [-0.12, -c / 2, 0] }),
      part(G.cyl(0.045, 0.045, c, 5), DARK, { p: [0.12, -c / 2, 0] }),
      part(G.box(0.62, 0.42, 0.42), '#e8343f', { p: [0, -c - 0.1, 0] }),
      part(G.box(0.66, 0.1, 0.46), '#ffd34d', { p: [0, -c + 0.05, 0] }),
      part(G.torus(0.2, 0.06, 5, 10, Math.PI * 1.4), STEEL, { p: [0, -c - 0.48, 0], r: [0, 0, Math.PI * 0.8] }),
      // four straps down to the crate corners
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(G.cyl(0.03, 0.03, 0.95, 3), DARK, { p: [sx * 0.42, -c - 0.85, sz * 0.42], r: [sz * 0.5, 0, -sx * 0.5] })),
    ]);
  });
}

/** Heavy crate: wood planks, dark iron straps and corner plates, a yellow "drop" mark. */
export function crateGeometry() {
  return once('craneCrate', () => {
    const s = CRANE.crate, h = s / 2;
    const parts = [part(G.box(s, s, s), '#b67a3c')];
    for (const y of [-h * 0.5, 0, h * 0.5]) parts.push(part(G.box(s + 0.02, 0.05, s + 0.02), '#8a5527', { p: [0, y, 0] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(G.box(0.2, s + 0.04, 0.2), '#3d3f4a', { p: [sx * h, 0, sz * h] }));
    parts.push(part(G.box(s + 0.06, 0.18, s + 0.06), '#3d3f4a', { p: [0, h - 0.06, 0] }));
    parts.push(part(G.box(s + 0.06, 0.18, s + 0.06), '#3d3f4a', { p: [0, -h + 0.06, 0] }));
    parts.push(part(G.box(0.18, s * 1.25, 0.04), '#ffd34d', { p: [0, 0, h + 0.03], r: [0, 0, 0.78] }));
    parts.push(part(G.box(0.18, s * 1.25, 0.04), '#ffd34d', { p: [0, 0, h + 0.03], r: [0, 0, -0.78] }));
    parts.push(part(G.box(s * 0.5, s * 0.22, 0.05), '#33343f', { p: [0, -h * 0.55, h + 0.05] }));
    return merge(parts);
  });
}

export function buildCrane(side, hookX, low) {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(once(`craneTower${side}:${hookX}:${low ? 1 : 0}`, () => towerGeometry(side, hookX, low)), propMaterial());
  tower.castShadow = !low;
  group.add(tower);
  const swing = new THREE.Group();
  swing.position.set(hookX, CRANE.jibY, 0);
  const hook = new THREE.Mesh(swingGeometry(), flashMaterial());
  swing.add(hook);
  group.add(swing);
  const crate = new THREE.Mesh(crateGeometry(), flashMaterial());
  crate.castShadow = !low;
  group.add(crate);
  const ring = new THREE.Mesh(flatPlane(), decalMat(dashRingTexture()));
  ring.scale.set(CRANE.ringR * 2, 1, CRANE.ringR * 2);
  ring.position.set(hookX, 0.06, 0);
  ring.renderOrder = 2;
  group.add(ring);
  const tag = hpTag(1.25);
  tag.mesh.position.set(hookX, CRANE.jibY - CRANE.cable - 0.1, 0.45);
  group.add(tag.mesh);
  return { group, tower, swing, hook, crate, ring, tag, low, side, hookX };
}
