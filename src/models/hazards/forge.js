// Volcanic Forge hazard models (update 3): lava strip (scrolling molten texture, basalt crust rims, stepping
// stone causeway), falling ember rock + flame trail, cracked-floor overlay (dark fissures + orange glow), fire
// geyser (basalt vent, glowing core, warning ring, two scrolling flame columns). Original art, chunky toon look.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { once, paintRng, canvasTexture, glowMaterial, addMaterial, decalMaterial, columnTexture, softDiscTexture, ringTexture } from './common.js';

const BASALT = '#3b2f33', BASALT_L = '#5a4848', CRUST = '#24191c', STONE = '#b3a39a', STONE_D = '#8f8079';

// ---------------- lava ----------------
export function lavaTexture() {
  return once('lavaTex', () => canvasTexture(256, 256, (g, w, h) => {
    const r = paintRng(11);
    g.fillStyle = '#ff5a14'; g.fillRect(0, 0, w, h);
    // hot blobs (wrapped so the tile repeats seamlessly)
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 34;
      const col = r() < 0.5 ? ['rgba(255,214,90,0.9)', 'rgba(255,150,40,0)'] : ['rgba(255,120,30,0.8)', 'rgba(200,40,10,0)'];
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, col[0]); grd.addColorStop(1, col[1]);
        g.fillStyle = grd; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    // dark cooling crust plates with glowing seams
    g.strokeStyle = 'rgba(255,240,170,0.9)'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const x = r() * w, y = r() * h, s = 14 + r() * 22;
      g.fillStyle = 'rgba(70,20,16,0.75)';
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r() * 0.5, d = s * (0.6 + r() * 0.5); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
      g.closePath(); g.fill(); g.stroke();
    }
  }, { repeat: true }));
}

export const lavaMaterial = () => once('lavaMat', () => glowMaterial({ map: lavaTexture(), color: '#ffffff' }));
export const rockMaterial = () => once('rockMat', () => toonMaterial());

/** Lava surface: a plane (w x len) whose uv repeats every 3 u, lying at y. */
export function lavaGeometry(w, len) {
  const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * len / 3);
  return g;
}

/**
 * Crust rims along the strip edges + stepping stones for each causeway x in `paths` (half-width pathHalf).
 * x0..x1 across, len along -z (geometry spans z in [-len, 0]).
 */
export function lavaRimGeometry(x0, x1, len, paths = [], pathHalf = 1.1, low = false) {
  const parts = [];
  const w = x1 - x0, cx = (x0 + x1) / 2;
  for (const z of [0, -len]) {
    parts.push(part(G.box(w + 0.3, 0.16, 0.5), CRUST, { p: [cx, 0.05, z] }));
    const n = Math.max(2, Math.round(w / 1.1));
    for (let i = 0; i < n && !low; i++) {
      const x = x0 + (i + 0.5) * (w / n);
      parts.push(part(G.sphere(0.32, 6, 4), i % 2 ? BASALT : BASALT_L, { p: [x, 0.08, z + (z ? 0.15 : -0.15)], s: [1.3, 0.55, 1] }));
    }
  }
  // side rims (inner lane edge / road edge)
  for (const x of [x0, x1]) parts.push(part(G.box(0.3, 0.14, len), CRUST, { p: [x, 0.05, -len / 2] }));
  const r = paintRng(Math.round(len * 7 + x0 * 13 + 101));
  for (const px of paths) {
    const n = Math.max(2, Math.ceil(len / 1.25));
    for (let i = 0; i < n; i++) {
      const z = -((i + 0.5) * len) / n;
      for (const side of [-1, 1]) {
        const s = 0.56 + r() * 0.1;
        parts.push(part(G.cyl(s * 1.12, s * 1.2, 0.12, 7), CRUST, { p: [px + side * (pathHalf * 0.5), 0.06, z], r: [0, r() * 3, 0] }));
        parts.push(part(G.cyl(s, s * 1.08, 0.3, 7), r() < 0.5 ? STONE : STONE_D, { p: [px + side * (pathHalf * 0.5) + (r() - 0.5) * 0.1, 0.16, z + (r() - 0.5) * 0.15], r: [0, r() * 3, 0] }));
      }
    }
  }
  return merge(parts);
}

// ---------------- ember (falling meteor) ----------------
export function emberRockGeometry() {
  return once('emberRock', () => {
    const g = new THREE.IcosahedronGeometry(0.5, 0);
    const p = g.attributes.position, r = paintRng(3);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + r() * 0.3), p.getY(i) * (0.85 + r() * 0.3), p.getZ(i) * (0.85 + r() * 0.3));
    g.computeVertexNormals();
    return merge([part(g, '#5a2618'), part(G.sphere(0.38, 6, 4), '#ffb347', { p: [0.1, -0.12, 0.08] }), part(G.sphere(0.2, 5, 4), '#ffe9a0', { p: [-0.18, -0.2, -0.12] })]);
  });
}
export const emberRockMaterial = () => once('emberRockMat', () => glowMaterial({ vertexColors: true }));
/** Flame trail: a cone pointing up behind the falling rock (origin at the rock). */
export function emberTrailGeometry() { return once('emberTrail', () => new THREE.ConeGeometry(0.42, 3.2, 8, 1, true).translate(0, 1.6, 0)); }
export const emberTrailMaterial = () => once('emberTrailMat', () => addMaterial({ map: columnTexture(), color: '#ff8a2a', opacity: 0.9, side: THREE.DoubleSide }));

// ---------------- crack ----------------
function crackLines(g, w, h, r, width, color) {
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 7; i++) {
    let x = r() * w, y = r() * h;
    g.lineWidth = width * (0.6 + r() * 0.8);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.3) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  // tile seams (the floor reads as tiles breaking apart)
  g.lineWidth = width * 0.7;
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2 + (r() - 0.5) * 8); g.moveTo(w / 2, 0); g.lineTo(w / 2 + (r() - 0.5) * 8, h); g.stroke();
}
export const crackDarkTexture = () => once('crackDark', () => canvasTexture(128, 128, (g, w, h) => crackLines(g, w, h, paintRng(21), 6, 'rgba(25,12,10,0.9)'), { repeat: true }));
export const crackGlowTexture = () => once('crackGlow', () => canvasTexture(128, 128, (g, w, h) => {
  g.filter = 'blur(3px)';
  crackLines(g, w, h, paintRng(21), 11, 'rgba(255,150,50,1)');
  g.filter = 'none';
  crackLines(g, w, h, paintRng(21), 3, 'rgba(255,236,170,1)');
}, { repeat: true }));
export const crackDarkMaterial = () => once('crackDarkMat', () => decalMaterial({ map: crackDarkTexture(), opacity: 0.85 }));
export function crackGlowMaterial() {
  return addMaterial({ map: crackGlowTexture(), opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}
/** Overlay plane uv-scaled so cracks tile every 2.4 u. */
export function crackGeometry(w, len) {
  const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2.4, uv.getY(i) * len / 2.4);
  return g;
}

// ---------------- geyser ----------------
export function ventGeometry() {
  return once('vent', () => {
    const parts = [
      part(G.cyl(1.25, 1.55, 0.3, 10), BASALT, { p: [0, 0.15, 0] }),
      part(G.cyl(1.0, 1.2, 0.18, 10), BASALT_L, { p: [0, 0.36, 0] }),
      part(G.cyl(0.78, 0.78, 0.06, 10), CRUST, { p: [0, 0.46, 0] }),
    ];
    const r = paintRng(9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      parts.push(part(G.box(0.45, 0.3 + r() * 0.3, 0.35), i % 2 ? BASALT : CRUST, { p: [Math.cos(a) * 1.25, 0.3, Math.sin(a) * 1.25], r: [r() * 0.4, -a, r() * 0.4] }));
    }
    return merge(parts);
  });
}
export const coreGeometry = () => once('ventCore', () => new THREE.CircleGeometry(0.72, 14).rotateX(-Math.PI / 2));
export const coreMaterial = () => glowMaterial({ color: '#ff8a2a', transparent: true, opacity: 1 });
export const ringGeometry = () => once('ventRing', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
export const ringMaterial = () => addMaterial({ map: ringTexture(), color: '#ff6a1f', opacity: 0 });
/** Flame column (open cylinder, base at y = 0, height 1, scaled per geyser). */
export const flameGeometry = () => once('flame', () => new THREE.CylinderGeometry(0.9, 1, 1, 14, 1, true).translate(0, 0.5, 0));
/** Shared per colour (every column flickers with the same scrolling texture offset). */
export const flameMaterial = (color) => once('flameMat' + color, () => addMaterial({ map: columnTexture(), color, opacity: 0.95, side: THREE.DoubleSide }));
export const glowDiscMaterial = (color) => addMaterial({ map: softDiscTexture(), color, opacity: 0 });
