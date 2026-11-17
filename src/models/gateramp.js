// Stage 4 road layout visuals for gates: the ramp hump under a RAMP gate and the chain-link badge on CHAIN gates.
// Geometry is merged + cached per width, one shared material each (no lights, no shadow casting: Low-safe).
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { GATE } from '../config.js';

export const RAMP_H = 1.2;
/** Ramp profile along z (gate at 0, +z toward the squad): up slope up0 -> up1, flat top, down slope down0 -> down1. */
export const RAMP = { up0: 7, up1: 1.6, down0: -1.6, down1: -6 };

/** Ramp height at dz = z - gateZ (0 outside the hump). */
export function rampHeight(dz) {
  if (dz > RAMP.up0 || dz < RAMP.down1) return 0;
  if (dz > RAMP.up1) return RAMP_H * (RAMP.up0 - dz) / (RAMP.up0 - RAMP.up1);
  if (dz >= RAMP.down0) return RAMP_H;
  return RAMP_H * (dz - RAMP.down1) / (RAMP.down0 - RAMP.down1);
}

const rampGeoCache = new Map();
/** Ramp hump: deck slabs, side skirts, glowing chevrons on the up slope (merged, vertex colours). */
export function rampGeometry(width) {
  if (rampGeoCache.has(width)) return rampGeoCache.get(width);
  const H = RAMP_H, w = width + 0.1;
  const upLen = RAMP.up0 - RAMP.up1, downLen = RAMP.down0 - RAMP.down1, top = RAMP.up1 - RAMP.down0;
  const upAng = Math.atan2(H, upLen), downAng = Math.atan2(H, downLen);
  const deck = '#9aa6c2', side = '#566079', chev = '#ffd34d', edge = '#ffb02e';
  const parts = [
    part(G.box(w, 0.16, Math.hypot(H, upLen) + 0.1), deck, { p: [0, H / 2 - 0.07, (RAMP.up0 + RAMP.up1) / 2], r: [upAng, 0, 0] }),
    part(G.box(w, 0.16, top + 0.1), deck, { p: [0, H - 0.08, (RAMP.up1 + RAMP.down0) / 2], bright: 1.05 }),
    part(G.box(w, 0.16, Math.hypot(H, downLen) + 0.1), deck, { p: [0, H / 2 - 0.07, (RAMP.down0 + RAMP.down1) / 2], r: [-downAng, 0, 0], bright: 0.9 }),
    // glowing lip where the up slope meets the road
    part(G.box(w, 0.06, 0.3), edge, { p: [0, 0.03, RAMP.up0 - 0.1], bright: 1.2 }),
  ];
  for (const sx of [-w / 2, w / 2]) {
    parts.push(part(G.box(0.2, H, top + 0.2), side, { p: [sx, H / 2, (RAMP.up1 + RAMP.down0) / 2] }));
    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      parts.push(part(G.box(0.2, H * (1 - f), upLen / 4 + 0.02), side, { p: [sx, H * (1 - f) / 2, RAMP.up1 + upLen * f], bright: 0.95 }));
      parts.push(part(G.box(0.2, H * (1 - f), downLen / 4 + 0.02), side, { p: [sx, H * (1 - f) / 2, RAMP.down0 - downLen * f], bright: 0.82 }));
    }
  }
  for (let i = 0; i < 3; i++) {
    const f = 0.22 + i * 0.26, z = RAMP.up0 - upLen * f, y = H * f + 0.03;
    for (const s of [-1, 1]) parts.push(part(G.box(w * 0.3, 0.05, 0.28), chev, { p: [s * w * 0.12, y, z], r: [upAng, s * 0.62, 0], bright: 1.25 }));
  }
  const geo = merge(parts);
  rampGeoCache.set(width, geo);
  return geo;
}

let rampMat = null;
export function buildRamp(width) {
  if (!rampMat) rampMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1d2233', emissiveIntensity: 0.2 });
  const m = new THREE.Mesh(rampGeometry(width), rampMat);
  m.receiveShadow = true;
  return m;
}

let linkGeo = null, linkMat = null;
/** Two interlocked chain links on the gate's top bar (chain gates). */
export function buildLinks() {
  if (!linkGeo) {
    linkGeo = merge([
      part(G.torus(0.24, 0.075, 6, 14), '#ffffff', { p: [-0.2, 0, 0], s: [1.35, 0.85, 1] }),
      part(G.torus(0.24, 0.075, 6, 14), '#ffffff', { p: [0.2, 0, 0], r: [0, Math.PI / 2, 0], s: [1, 0.85, 1.35] }),
    ]);
    linkMat = new THREE.MeshLambertMaterial({ color: '#ffe27a', emissive: '#d08a10', emissiveIntensity: 0.7, vertexColors: true });
  }
  const m = new THREE.Mesh(linkGeo, linkMat);
  m.position.set(0, GATE.height + 0.7, 0.05);
  m.scale.setScalar(1.6);
  return m;
}
