// Candy Kingdom hazard models (update 3): jelly bounce pad (wobbly pink cushion with bubbles + an "up" chevron
// decal), syrup river (glossy amber texture, caramel drip rims, warm sheen), giant gumball (speckled glossy
// sphere + highlight + ground shadow), chocolate waterfall (candy-cane post, wafer trough, scrolling chocolate
// curtain, splash pool). Original art, chunky toon look; merged geometry, unlit / toon / Lambert only.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial, blobShadowTexture } from '../materials.js';
import { once, paintRng, canvasTexture, glowMaterial, addMaterial, decalMaterial, softDiscTexture } from './common.js';

// ---------------- jelly pad ----------------
const JELLY = '#ff4fae', JELLY_L = '#ff8fd0', JELLY_D = '#d8338e', JELLY_B = '#ffd0ec';

/** Cushion w (x) by len (z), centred on x, spanning z in [-len, 0]. */
export function jellyPadGeometry(w, len, low = false) {
  const parts = [];
  const h = 0.4;     // stands above the lane divider; feet sink into the jelly
  parts.push(part(G.box(w - 0.5, h, len - 0.5), JELLY, { p: [0, h / 2, -len / 2] }));
  // rounded rims all round (capsules), a lighter top
  parts.push(part(G.capsule(0.27, w - 0.5, 2, low ? 5 : 8), JELLY_D, { p: [0, 0.27, -0.27], r: [0, 0, Math.PI / 2] }));
  parts.push(part(G.capsule(0.27, w - 0.5, 2, low ? 5 : 8), JELLY_D, { p: [0, 0.27, -len + 0.27], r: [0, 0, Math.PI / 2] }));
  for (const x of [-w / 2 + 0.27, w / 2 - 0.27]) parts.push(part(G.capsule(0.27, len - 0.5, 2, low ? 5 : 8), JELLY_D, { p: [x, 0.27, -len / 2], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(G.box(w - 0.7, 0.04, len - 0.7), JELLY_L, { p: [0, h + 0.02, -len / 2] }));
  if (!low) {
    const r = paintRng(Math.round(w * 13 + len * 7));
    const n = Math.round(w * len / 2.2);
    for (let i = 0; i < n; i++) parts.push(part(G.sphere(0.08 + r() * 0.1, 6, 4), JELLY_B, { p: [(r() - 0.5) * (w - 1), h + 0.02, -0.4 - r() * (len - 0.8)], s: [1, 0.4, 1] }));
  }
  return merge(parts);
}
export const jellyMaterial = () => once('jellyMat', () => toonMaterial({ emissive: '#ff3a9a', emissiveIntensity: 0.18 }));
/** White up-chevrons painted on the pad (scrolls forward). */
export const jellyArrowTexture = () => once('jellyArrows', () => canvasTexture(64, 64, (g, w, h) => {
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(12, 44); g.lineTo(32, 22); g.lineTo(52, 44); g.stroke();
}, { repeat: true }));
export function jellyArrowMaterial() {
  return addMaterial({ map: jellyArrowTexture(), color: '#fff2fb', opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// ---------------- syrup ----------------
export const syrupTexture = () => once('syrupTex', () => canvasTexture(256, 256, (g, w, h) => {
  const r = paintRng(41);
  g.fillStyle = '#d98a1c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { // amber swirls (wrapped)
    const x = r() * w, y = r() * h, rad = 12 + r() * 40;
    const col = r() < 0.5 ? ['rgba(255,196,90,0.7)', 'rgba(255,170,60,0)'] : ['rgba(150,70,10,0.6)', 'rgba(150,70,10,0)'];
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grd.addColorStop(0, col[0]); grd.addColorStop(1, col[1]);
      g.fillStyle = grd; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 18; i++) { // glossy streaks
    const x = r() * w, y = r() * h, len = 20 + r() * 50;
    g.strokeStyle = 'rgba(255,236,190,0.55)'; g.lineWidth = 2 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + (r() - 0.5) * 20, x + len, y + (r() - 0.5) * 10); g.stroke();
  }
  for (let i = 0; i < 26; i++) { // bubbles
    const x = r() * w, y = r() * h, rad = 2 + r() * 5;
    g.fillStyle = 'rgba(255,230,170,0.65)'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.35, 0, Math.PI * 2); g.fill();
  }
}, { repeat: true }));
export const syrupMaterial = () => once('syrupMat', () => decalMaterial({ map: syrupTexture(), color: '#ffffff', opacity: 0.96 }));
export const syrupSheenMaterial = () => once('syrupSheen', () => addMaterial({ map: syrupSheenTexture(), color: '#ffe0a0', opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const syrupSheenTexture = () => once('syrupSheenTex', () => canvasTexture(128, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.46, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.8)'); grd.addColorStop(0.55, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}, { repeat: true }));

/** Flat plane (w x len) lying on the road, uv repeating every `tile` u, spanning z in [-len, 0] after offset. */
export function tiledPlane(w, len, tile = 4) {
  const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * len / tile);
  return g;
}

/** Caramel drips / blobs along the syrup's near and far edges (x0..x1, z in [-len, 0]). */
export function syrupRimGeometry(x0, x1, len, low = false) {
  const parts = [], r = paintRng(Math.round(len * 11 + x0 * 5 + 77));
  const w = x1 - x0, cx = (x0 + x1) / 2;
  for (const z of [0, -len]) {
    parts.push(part(G.box(w, 0.08, 0.36), '#a85a0c', { p: [cx, 0.04, z] }));
    const n = Math.max(2, Math.round(w / (low ? 1.5 : 0.8)));
    for (let i = 0; i < n; i++) {
      parts.push(part(G.sphere(0.24 + r() * 0.16, low ? 5 : 7, 4), r() < 0.5 ? '#e89a2a' : '#c4740e', { p: [x0 + (i + 0.5) * (w / n), 0.05, z + (r() - 0.5) * 0.4], s: [1.4, 0.4, 1.1] }));
    }
  }
  for (const x of [x0, x1]) parts.push(part(G.box(0.22, 0.08, len), '#a85a0c', { p: [x, 0.04, -len / 2] }));
  return merge(parts);
}
export const syrupRimMaterial = () => once('syrupRim', () => toonMaterial());

// ---------------- gumball ----------------
export const GUM_COLORS = ['#ff3b6b', '#3fa9ff', '#ffd23b', '#46e08a', '#b06bff', '#ff8a2a'];
export const gumTexture = () => once('gumTex', () => canvasTexture(128, 64, (g, w, h) => {
  const r = paintRng(61);
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { // sugar speckles (rotation reads as rolling)
    g.fillStyle = r() < 0.6 ? 'rgba(255,255,255,1)' : 'rgba(110,110,130,0.5)';
    const x = r() * w, y = 6 + r() * (h - 12), s = 1.5 + r() * 2.5;
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.9)'; // a pale band so the spin shows from far
  g.fillRect(0, h * 0.46, w, h * 0.08);
}, { repeat: true }));
export function gumballGeometry(low = false) {
  return once('gumball' + (low ? 'L' : ''), () => new THREE.SphereGeometry(1, low ? 14 : 24, low ? 10 : 16));
}
/** One material per pooled ball (it flashes white on hits). */
export function gumballMaterial(color) {
  return new THREE.MeshLambertMaterial({ color, map: gumTexture(), emissive: color, emissiveIntensity: 0.22 });
}
export const gumGlossGeometry = () => once('gumGloss', () => new THREE.SphereGeometry(0.28, 8, 6).scale(1, 0.7, 0.5));
export const gumGlossMaterial = () => once('gumGlossMat', () => addMaterial({ color: '#ffffff', opacity: 0.75 }));
export const gumShadowGeometry = () => once('gumShadowGeo', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
export const gumShadowMaterial = () => once('gumShadow', () => decalMaterial({ map: blobShadowTexture(), color: '#5a1a4a', opacity: 0.5 }));

// ---------------- chocolate waterfall ----------------
export const CHOCO_H = 6.2;
export const chocoTexture = () => once('chocoTex', () => canvasTexture(64, 128, (g, w, h) => {
  const r = paintRng(83);
  g.fillStyle = '#7a3c1a'; g.fillRect(0, 0, w, h);
  g.filter = 'blur(2px)';
  for (let i = 0; i < 16; i++) { // soft vertical pour bands
    const x = r() * w, ww = 4 + r() * 10;
    g.fillStyle = r() < 0.55 ? 'rgba(168,96,46,0.75)' : 'rgba(78,34,14,0.55)';
    g.fillRect(x, 0, ww, h); g.fillRect(x - w, 0, ww, h);
  }
  g.filter = 'none';
  for (let i = 0; i < 14; i++) { // glossy highlights
    const x = r() * w, y = r() * h;
    g.fillStyle = 'rgba(255,214,170,0.6)'; g.fillRect(x, y, 2, 14 + r() * 34);
  }
}, { repeat: true }));
/** Curtain: a slightly curved sheet w wide, 1 high (scaled), base at y = 0, facing +z. */
export function chocoCurtainGeometry(w) {
  return once('chocoCurtain' + w, () => {
    const g = new THREE.PlaneGeometry(w, 1, 6, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, 0.35 * (1 - (2 * x / w) ** 2));
      p.setY(i, p.getY(i) + 0.5);
      uv.setX(i, uv.getX(i) * w / 2.5);
    }
    g.computeVertexNormals();
    return g;
  });
}
export const chocoMaterial = () => once('chocoMat', () => glowMaterial({ map: chocoTexture(), color: '#f0d8cc', side: THREE.DoubleSide, transparent: true, opacity: 0.97 }));
/** Candy-cane post at the road edge + a wafer trough over the lane at y = CHOCO_H (x from 0 toward -side*w). */
export function chocoSpoutGeometry(w, side, low = false) {
  return once('chocoSpout' + w + side + (low ? 'L' : ''), () => {
    const parts = [];
    const segs = low ? 5 : 9;
    for (let i = 0; i < segs; i++) {
      const h = (CHOCO_H + 1) / segs;
      parts.push(part(G.cyl(0.32, 0.32, h, low ? 6 : 10), i % 2 ? '#ffffff' : '#ff3b5c', { p: [0, h * (i + 0.5), 0] }));
    }
    parts.push(part(G.sphere(0.42, low ? 6 : 10, 6), '#ff3b5c', { p: [0, CHOCO_H + 1.05, 0] }));
    const tx = -side * (w / 2 + 0.2);
    parts.push(part(G.box(w + 0.6, 0.5, 1.5), '#e8b46a', { p: [tx, CHOCO_H + 0.35, 0] }));          // wafer trough
    parts.push(part(G.box(w + 0.7, 0.14, 1.6), '#c98c44', { p: [tx, CHOCO_H + 0.65, 0] }));
    parts.push(part(G.box(w + 0.4, 0.18, 1.1), '#4a2210', { p: [tx, CHOCO_H + 0.7, 0] }));          // chocolate inside
    if (!low) {
      const r = paintRng(w * 10 + side * 3 + 5);
      for (let i = 0; i < 8; i++) parts.push(part(G.box(0.12, 0.06, 1.52), '#b07a38', { p: [tx - w / 2 + (i + 0.5) * (w / 8), CHOCO_H + 0.36, 0] }));
      for (let i = 0; i < 6; i++) parts.push(part(G.sphere(0.12 + r() * 0.08, 6, 4), '#ff7ad1', { p: [tx + (r() - 0.5) * w, CHOCO_H + 0.8, (r() - 0.5) * 1.2] }));
    }
    return merge(parts);
  });
}
export const chocoSpoutMaterial = () => once('chocoSpoutMat', () => toonMaterial());
export const chocoPoolGeometry = () => once('chocoPool', () => new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2));
export const chocoPoolMaterial = () => decalMaterial({ map: softDiscTexture(), color: '#5a2c14', opacity: 0 });
