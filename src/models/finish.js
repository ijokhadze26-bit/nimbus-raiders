// Finish arch (update 3): two striped posts with glowing caps and a crossbar (one merged vertex-coloured
// geometry) plus a "FINISH" banner (one canvas-textured plane). Colours per world. Faces +Z (the squad).
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { ROAD_HALF } from '../config.js';
import { FONT_DISPLAY } from './labels.js';

// a / b = post stripes, cap = glowing top ball, bar = crossbar, banner = banner fill, ink = text outline
export const FINISH_LOOK = {
  sky: { a: '#ffffff', b: '#59c1ff', cap: '#ffd84a', bar: '#2f7fe0', banner: '#2f8cff', ink: '#0f2f6a' },
  forge: { a: '#3a2a28', b: '#ff6a1a', cap: '#ffb02a', bar: '#2a1c1a', banner: '#e2420e', ink: '#3a0c02' },
  frost: { a: '#ffffff', b: '#6fc8ff', cap: '#bff4ff', bar: '#3a7ac8', banner: '#3a9ae8', ink: '#0c2c5a' },
  candy: { a: '#ffffff', b: '#ff4aa8', cap: '#6affd2', bar: '#ff7ad1', banner: '#ff5ab4', ink: '#6a0e44' },
  citadel: { a: '#3a3650', b: '#a07aff', cap: '#d8c4ff', bar: '#26223a', banner: '#7a4aff', ink: '#160a3a' },
};

export const ARCH = { halfW: ROAD_HALF + 0.55, h: 6.2 };

/** Frame geometry: striped posts, caps, crossbar, little flags. */
export function finishFrameGeometry(look) {
  const parts = [];
  const seg = 7, segH = ARCH.h / seg;
  for (const side of [-1, 1]) {
    const x = side * ARCH.halfW;
    for (let i = 0; i < seg; i++) parts.push(part(G.cyl(0.26, 0.26, segH, 8), i % 2 ? look.b : look.a, { p: [x, segH * (i + 0.5), 0] }));
    parts.push(part(G.cyl(0.42, 0.5, 0.35, 8), look.bar, { p: [x, 0.17, 0] }));
    parts.push(part(G.sphere(0.42, 10, 7), look.cap, { p: [x, ARCH.h + 0.35, 0], bright: 1.25 }));
    parts.push(part(G.box(0.05, 0.9, 0.05), '#ffffff', { p: [x, ARCH.h + 1.15, 0] }));
    parts.push(part(G.box(0.62, 0.38, 0.03), look.b, { p: [x + 0.33, ARCH.h + 1.4, 0], bright: 1.1 }));
  }
  parts.push(part(G.box(ARCH.halfW * 2, 0.3, 0.32), look.bar, { p: [0, ARCH.h - 0.15, 0] }));
  return merge(parts);
}

/** Banner texture: world-coloured cloth, checkered edges, big outlined FINISH. */
export function finishBannerTexture(look) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = look.banner; g.fillRect(0, 0, 512, 128);
  const sq = 16;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 512 / sq; i++) {
      g.fillStyle = (i + row) % 2 ? '#ffffff' : '#1a1a24';
      g.fillRect(i * sq, row * sq, sq, sq);
      g.fillStyle = (i + row + 1) % 2 ? '#ffffff' : '#1a1a24';
      g.fillRect(i * sq, 128 - (row + 1) * sq, sq, sq);
    }
  }
  g.font = `68px ${FONT_DISPLAY}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = look.ink;
  g.strokeText('FINISH', 256, 66);
  g.fillStyle = '#ffffff';
  g.fillText('FINISH', 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Banner plane geometry (hangs under the crossbar). */
export function finishBannerGeometry() {
  return new THREE.PlaneGeometry(ARCH.halfW * 2 - 0.6, 1.5).translate(0, ARCH.h - 1.05, 0.05);
}
