// Storm Citadel hazard models (update 3): moving platform (stone deck with glowing violet trims + runes, slide
// rails across the hole), lightning (charge orb, zigzag bolt, impact glow), wind gust (sideways arrow decal,
// streaks, striped wind socks), collapsing bridge (stone slabs, glowing crack overlay). Original art, chunky toon
// look; merged / instanced geometry, unlit / toon only, no lights, no shadow casters.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { once, paintRng, canvasTexture, glowMaterial, addMaterial, softDiscTexture } from './common.js';

const STONE = '#8a86a6', STONE_D = '#5a5674', STONE_DD = '#3e3a56', METAL = '#4a4660', VIOLET = '#b98cff';
const DECK = '#d4cdf0', DECK_D = '#7a68b0', DECK_S = '#9a8ccc';

// ---------------- moving platform ----------------
/** Deck w (x) by len (z), centred on x, z in [-len, 0], top at y = 0. */
export function platformGeometry(w, len, low = false) {
  const parts = [];
  parts.push(part(G.box(w, 0.5, len), DECK, { p: [0, -0.25, -len / 2] }));
  parts.push(part(G.box(w + 0.1, 0.22, len + 0.1), DECK_D, { p: [0, -0.42, -len / 2] }));
  parts.push(part(G.box(w - 0.6, 0.45, len - 0.6), STONE_D, { p: [0, -0.7, -len / 2] }));
  // deck plates: seams across and along
  const rows = Math.max(2, Math.round(len / 2));
  for (let i = 1; i < rows; i++) parts.push(part(G.box(w - 0.3, 0.03, 0.08), DECK_S, { p: [0, 0.005, -(i * len) / rows] }));
  parts.push(part(G.box(0.08, 0.03, len - 0.3), DECK_S, { p: [0, 0.005, -len / 2] }));
  // corner posts
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) {
    for (const z of [-0.25, -len + 0.25]) parts.push(part(G.box(0.4, 0.4, 0.4), METAL, { p: [x, 0.1, z] }));
  }
  if (!low) {
    const r = paintRng(Math.round(w * 17 + len * 3));
    for (let i = 0; i < Math.round(len / 2); i++) parts.push(part(G.box(0.3 + r() * 0.4, 0.04, 0.3 + r() * 0.3), DECK_S, { p: [(r() - 0.5) * (w - 1), 0.01, -0.6 - r() * (len - 1.2)] }));
  }
  return merge(parts);
}
export const platformMaterial = () => once('platMat', () => toonMaterial());
/** Glowing trims along the deck's long edges + rune studs (unlit). */
export function platformGlowGeometry(w, len) {
  const parts = [];
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) parts.push(part(G.box(0.24, 0.16, len - 0.2), VIOLET, { p: [x, 0.06, -len / 2] }));
  for (const z of [-0.1, -len + 0.1]) parts.push(part(G.box(w - 0.2, 0.12, 0.16), VIOLET, { p: [0, 0.05, z] }));
  const n = Math.max(2, Math.round(len / 4));
  for (let i = 0; i < n; i++) {
    for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) parts.push(part(G.cyl(0.18, 0.18, 0.04, 8), '#e6d8ff', { p: [x, 0.02, -((i + 0.5) * len) / n] }));
  }
  return merge(parts);
}
export const glowTrimMaterial = () => once('platGlow', () => glowMaterial({ vertexColors: true, transparent: true, opacity: 1 }));
/** Slide rails across the hole at its near / far ends (x from -9 to 9), y just under the deck. */
export function railGeometry(len) {
  return once('rails' + len, () => {
    const parts = [];
    for (const z of [-0.6, -len + 0.6]) {
      parts.push(part(G.box(18, 0.16, 0.22), METAL, { p: [0, -0.9, z] }));
      for (const x of [-8.6, 8.6]) parts.push(part(G.box(0.5, 1.4, 0.5), STONE_DD, { p: [x, -0.6, z] }));
    }
    return merge(parts);
  });
}
export const railMaterial = () => once('railMat', () => toonMaterial());
export const underGlowMaterial = () => once('platUnder', () => addMaterial({ map: softDiscTexture(), color: '#9a6aff', opacity: 0.55 }));

// ---------------- lightning ----------------
/** Zigzag bolt from y = 0 up to ~16 (unit width; scaled per strike). */
export function boltGeometry() {
  return once('bolt', () => {
    const parts = [], r = paintRng(13);
    let x = 0, y = 0;
    while (y < 16) {
      const ny = y + 1.2 + r() * 1.6, nx = (r() - 0.5) * 1.6 * Math.min(1, y / 2 + 0.3);
      const dx = nx - x, dy = ny - y, len = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
      parts.push(part(G.box(0.22, len + 0.1, 0.22), '#ffffff', { p: [(x + nx) / 2, (y + ny) / 2, 0], r: [0, 0, -a] }));
      parts.push(part(G.box(0.55, len + 0.1, 0.1), VIOLET, { p: [(x + nx) / 2, (y + ny) / 2, 0], r: [0, 0, -a] }));
      if (r() < 0.45) { // a short fork
        const fx = nx + (r() - 0.5) * 2.2, fy = ny - 0.5 - r();
        const fl = Math.hypot(fx - nx, fy - ny), fa = Math.atan2(fx - nx, fy - ny);
        parts.push(part(G.box(0.12, fl, 0.12), '#e6d8ff', { p: [(nx + fx) / 2, (ny + fy) / 2, 0], r: [0, 0, -fa] }));
      }
      x = nx; y = ny;
    }
    return merge(parts);
  });
}
export const boltMaterial = () => once('boltMat', () => addMaterial({ vertexColors: true, opacity: 1 }));
export const orbGeometry = () => once('stormOrb', () => new THREE.SphereGeometry(0.4, 10, 8));
export const orbMaterial = () => once('stormOrbMat', () => addMaterial({ color: '#a77bff', opacity: 0.85 }));
export const flatDisc = () => once('stormDisc', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
export const impactMaterial = () => once('stormImpact', () => addMaterial({ map: softDiscTexture(), color: '#c8a8ff', opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

// ---------------- wind ----------------
/** Chevrons pointing +u (the decal is flipped for a push toward -x). */
export const windArrowTexture = () => once('windArrows', () => canvasTexture(128, 64, (g, w, h) => {
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const x0 of [22, 86]) { g.beginPath(); g.moveTo(x0, 12); g.lineTo(x0 + 22, 32); g.lineTo(x0, 52); g.stroke(); }
}, { repeat: true }));
export function windArrowMaterial() {
  return addMaterial({ map: windArrowTexture(), color: '#d8c8ff', opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}
/** Wind streak: a thin plane along x (length 1, scaled), facing +z. */
export const streakGeometry = () => once('windStreak', () => new THREE.PlaneGeometry(1, 0.07));
export const streakMaterial = () => once('windStreakMat', () => addMaterial({ color: '#f0e8ff', opacity: 0.55, side: THREE.DoubleSide }));
/** Pole + striped sock blowing toward +x (mirror with scale.x = -1). */
export function windsockGeometry(low = false) {
  return once('windsock' + (low ? 'L' : ''), () => {
    const parts = [part(G.cyl(0.08, 0.1, 3.4, 6), METAL, { p: [0, 1.7, 0] }), part(G.sphere(0.14, 6, 4), VIOLET, { p: [0, 3.45, 0] })];
    const segs = low ? 3 : 5;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.38 - i * 0.05, len = 0.42;
      parts.push(part(G.cyl(r0 - 0.05, r0, len, low ? 6 : 10, true), i % 2 ? '#ffffff' : '#ff7a3a', { p: [0.25 + i * len + len / 2, 3.2 - i * 0.06, 0], r: [0, 0, Math.PI / 2] }));
    }
    return merge(parts);
  });
}
export const windsockMaterial = () => once('windsockMat', () => toonMaterial({ side: THREE.DoubleSide }));

// ---------------- collapsing bridge ----------------
/** One slab of a lane: w (x) by ~TILE_LEN (z), top at y = 0, centred. */
export function slabGeometry(w, low = false) {
  return once('slab' + w + (low ? 'L' : ''), () => {
    const parts = [
      part(G.box(w, 0.42, 1.94), STONE, { p: [0, -0.21, 0] }),
      part(G.box(w - 0.3, 0.6, 1.6), STONE_D, { p: [0, -0.6, 0] }),
      part(G.box(w, 0.05, 0.08), STONE_DD, { p: [0, 0.0, 0.93] }),
    ];
    if (!low) {
      for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) for (const z of [-0.6, 0.6]) parts.push(part(G.cyl(0.07, 0.07, 0.04, 6), '#bdb8d8', { p: [x, 0.01, z] }));
      parts.push(part(G.box(w * 0.4, 0.03, 0.06), STONE_DD, { p: [-w * 0.1, 0.005, -0.2], r: [0, 0.4, 0] }));
    }
    return merge(parts);
  });
}
export const slabMaterial = () => once('slabMat', () => toonMaterial());
const crackLines = (g, w, h, r, width, color) => {
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 5; i++) {
    let x = r() * w, y = r() * h;
    g.lineWidth = width * (0.6 + r() * 0.8);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
};
export const slabCrackTexture = () => once('slabCrack', () => canvasTexture(128, 64, (g, w, h) => {
  g.filter = 'blur(3px)';
  crackLines(g, w, h, paintRng(29), 9, 'rgba(190,140,255,1)');
  g.filter = 'none';
  crackLines(g, w, h, paintRng(29), 3, 'rgba(255,245,255,1)');
}));
export const slabCrackGeometry = (w) => once('slabCrackGeo' + w, () => new THREE.PlaneGeometry(w - 0.2, 1.8).rotateX(-Math.PI / 2).translate(0, 0.02, 0));
export const slabCrackMaterial = () => once('slabCrackMat', () => addMaterial({ map: slabCrackTexture(), color: '#ffffff', opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
