// Environment props: road tile pieces, divider, floating islands, cloud puffs.
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { ROAD_HALF, DIVIDER } from '../config.js';

export const TILE_LEN = 2;

/** Canvas texture for the road surface of one half-tile (2 tiles across). */
export function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c4d6e6';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2; i++) {
    const x = i * 128 + 5, y = 5, w = 118, h = 118, r = 14;
    const grd = g.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#eef5fb');
    g.fillStyle = grd;
    roundRect(g, x, y, w, h, r); g.fill();
    // soft bevel highlight
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
    roundRect(g, x + 4, y + 4, w - 8, h - 8, r - 4); g.stroke();
    g.strokeStyle = 'rgba(150,180,205,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 10, y + h - 3); g.lineTo(x + w - 6, y + h - 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Right half of a road tile (x from divider to edge), centered on z=0. Left half = rotate 180 deg about Y. */
export function halfTileGeometry(theme) {
  const x0 = DIVIDER.width / 2, x1 = ROAD_HALF - 0.12;
  const w = x1 - x0, L = TILE_LEN;
  const top = new THREE.PlaneGeometry(w, L);
  top.rotateX(-Math.PI / 2);
  top.translate(x0 + w / 2, 0, 0);
  const topPart = part(top, '#ffffff', { keepUv: true });
  const uvFix = (geo) => {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(0.25), 2));
    // y of the uv=0.25 lands at a tile center (white) for both rows in the 2:1 texture
    for (let i = 0; i < n; i++) geo.attributes.uv.array[i * 2 + 1] = 0.5;
    return geo;
  };
  const side = part(G.box(ROAD_HALF - x0, 0.7, L), theme.road.side, { p: [x0 + (ROAD_HALF - x0) / 2, -0.37, 0], keepUv: true });
  const under = part(G.box(ROAD_HALF - x0 - 0.5, 0.25, L), theme.road.under, { p: [x0 + (ROAD_HALF - x0) / 2 - 0.2, -0.8, 0], keepUv: true });
  return merge([topPart, uvFix(side), uvFix(under)]);
}

export function trimGeometry() {
  return merge([
    part(G.box(0.34, 0.3, TILE_LEN), '#ffffff', { p: [ROAD_HALF - 0.07, 0.06, 0] }),
    part(G.box(0.12, 0.1, TILE_LEN), '#ffffff', { p: [ROAD_HALF + 0.03, -0.56, 0], bright: 0.9 }),
    part(G.cyl(0.11, 0.11, 0.1, 10), '#ffffff', { p: [ROAD_HALF - 0.07, 0.24, 0], bright: 1.15 }),
  ]);
}

export function dividerGeometry() {
  const w = DIVIDER.width, h = DIVIDER.height;
  const cyl = G.cyl(w / 2, w / 2, TILE_LEN - 0.12, 12);
  return merge([
    part(G.box(w, h - w / 2, TILE_LEN - 0.12), '#ffffff', { p: [0, (h - w / 2) / 2, 0], bright: 0.92 }),
    part(cyl, '#ffffff', { p: [0, h - w / 2, 0], r: [Math.PI / 2, 0, 0], bright: 1.08 }),
  ]);
}

/** Floating cloud island: grassy top, rocky inverted cone, little trees + crystal. Flat-shaded. */
export function islandGeometry(theme) {
  const t = theme.island;
  const parts = [
    part(new THREE.CylinderGeometry(3.2, 3.0, 0.7, 9), t.grass, { p: [0, 0, 0] }),
    part(new THREE.CylinderGeometry(3.25, 3.25, 0.25, 9), t.grassDark, { p: [0, -0.45, 0] }),
    part(new THREE.ConeGeometry(3.0, 4.6, 9), t.rock, { p: [0, -2.75, 0], r: [Math.PI, 0, 0] }),
    part(new THREE.ConeGeometry(1.4, 2.6, 7), t.rockDark, { p: [1.0, -4.0, 0.6], r: [Math.PI, 0.4, 0.15] }),
    part(new THREE.DodecahedronGeometry(0.7, 0), t.rockDark, { p: [-1.6, 0.55, 0.9] }),
    part(new THREE.ConeGeometry(0.9, 2.0, 7), t.grassDark, { p: [1.1, 1.55, -0.7] }),
    part(new THREE.ConeGeometry(0.7, 1.5, 7), t.grassDark, { p: [1.1, 2.5, -0.7] }),
    part(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 5), '#8a5a3c', { p: [1.1, 0.6, -0.7] }),
    part(new THREE.ConeGeometry(0.6, 1.3, 7), t.grass, { p: [-0.6, 1.0, -1.4] }),
    part(new THREE.OctahedronGeometry(0.45, 0), t.crystal, { p: [-0.2, 0.75, 1.6], s: [1, 1.8, 1], bright: 1.3 }),
  ];
  return merge(parts);
}

export function puffGeometry() {
  return new THREE.SphereGeometry(1, 11, 6);
}
