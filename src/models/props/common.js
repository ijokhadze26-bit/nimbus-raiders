// Shared bits of the update 3 road objects (crane, dam, bell, boulder): cached materials, the stone ledge
// that holds a road-side object off the bridge edge, the hp tag and the dashed drop / flood marks.
// Everything is cached once per session; toon or unlit only, no lights; shadows only on High (caller).
import * as THREE from 'three';
import { part, G } from '../util.js';
import { toonMaterial } from '../materials.js';
import { createLabel, labelMesh } from '../labels.js';
import { ROAD_HALF } from '../../config.js';

const cache = {};
export const once = (k, make) => cache[k] || (cache[k] = make());

/** Shared vertex-colour toon material for merged prop geometry (static parts never flash). */
export const propMaterial = () => once('propMat', () => toonMaterial());
/** Per-object toon material with an emissive flash (hit feedback); the caller owns it. */
export const flashMaterial = () => toonMaterial({ emissive: '#ffffff', emissiveIntensity: 0 });

/**
 * Stone ledge bolted to the road side (x from the edge outwards, side = -1 left / +1 right): a road-side
 * object stands on it, since the bridge floats over the sky / lava / snow sea.
 */
export function ledgeParts(side, w = 2.8, d = 3.2, stone = '#9aa3b4', dark = '#6d7487') {
  const cx = side * (ROAD_HALF + w / 2 - 0.15);
  return [
    part(G.box(w, 0.5, d), stone, { p: [cx, -0.2, 0] }),
    part(G.box(w - 0.3, 0.35, d - 0.4), dark, { p: [cx - side * 0.1, -0.6, 0] }),
    part(G.cone(0.9, 1.4, 6), dark, { p: [cx, -1.4, 0], r: [Math.PI, 0, 0] }),
    part(G.box(0.5, 0.18, d + 0.1), '#ffd34d', { p: [side * (ROAD_HALF + w - 0.35), 0.1, 0] }),
  ];
}

/** HP tag: a small sign with the hp number (redrawn by the system when the hp changes). */
export function hpTag(w = 1.3) {
  const label = createLabel(256, 128);
  const mesh = labelMesh(label, w, w * 0.5);
  return { label, mesh, hp: -1 };
}
export const HP_STYLE = { fill: '#ffe14d', stroke: '#5a3300', strokeWidth: 14, size: 100, shadow: false, y: 0.56 };

/** Dashed yellow / black ring painted on the road (crane drop spot): flat, radius 1 (scale it). */
export function dashRingTexture() {
  return once('dashRing', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.fillStyle = 'rgba(255,210,60,0.18)';
    g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
    const n = 16;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#1c1c22' : '#ffd23c';
      g.beginPath(); g.arc(0, 0, 61, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2); g.arc(0, 0, 50, ((i + 1) / n) * Math.PI * 2, (i / n) * Math.PI * 2, true); g.fill();
    }
    // down arrow cross-hair
    g.fillStyle = 'rgba(255,210,60,0.85)';
    g.beginPath(); g.moveTo(-14, -18); g.lineTo(14, -18); g.lineTo(0, 10); g.closePath(); g.fill();
    g.fillRect(-4, -34, 8, 18);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function decalMat(map, opts = {}) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, ...opts });
}

export const flatPlane = () => once('propFlat', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

/** Cosmetic hash (vertex jitter, plank tints): deterministic, never game logic. */
export function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
