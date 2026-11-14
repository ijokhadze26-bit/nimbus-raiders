// Gate visual: tinted glass panel, glowing frame posts, outlined number label, ground strip.
// One visual per pooled gate (own materials so each gate can tint independently).
import * as THREE from 'three';
import { part, merge, G } from './util.js';
import { createLabel, labelMesh } from './labels.js';
import { GATE } from '../config.js';

let glassTex = null;
function glassTexture() {
  if (glassTex) return glassTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  // vertical body: stronger tint at bottom and top
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,255,255,0.78)');
  v.addColorStop(0.12, 'rgba(255,255,255,0.5)');
  v.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  v.addColorStop(1, 'rgba(255,255,255,0.82)');
  g.fillStyle = v;
  g.fillRect(0, 0, 128, 256);
  // diagonal shine streaks
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(64, 128); g.rotate(-0.5); g.translate(-64, -128);
  g.fillStyle = 'rgba(255,255,255,0.32)'; g.fillRect(18, -60, 16, 400);
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(42, -60, 6, 400);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(96, -60, 22, 400);
  g.restore();
  // inner border highlight
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 5;
  g.strokeRect(4, 4, 120, 248);
  glassTex = new THREE.CanvasTexture(c);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  return glassTex;
}

const frameGeoCache = new Map();
function frameGeometry(width, height) {
  const key = width + ':' + height;
  if (frameGeoCache.has(key)) return frameGeoCache.get(key);
  const hw = width / 2;
  const geo = merge([
    part(G.box(0.26, height + 0.2, 0.3), '#ffffff', { p: [-hw, (height + 0.2) / 2, 0] }),
    part(G.box(0.26, height + 0.2, 0.3), '#ffffff', { p: [hw, (height + 0.2) / 2, 0] }),
    part(G.box(width + 0.26, 0.22, 0.3), '#ffffff', { p: [0, height + 0.2, 0] }),
    part(G.sphere(0.21, 10, 8), '#ffffff', { p: [-hw, height + 0.24, 0], bright: 1.35 }),
    part(G.sphere(0.21, 10, 8), '#ffffff', { p: [hw, height + 0.24, 0], bright: 1.35 }),
    part(G.box(0.4, 0.14, 0.42), '#ffffff', { p: [-hw, 0.07, 0], bright: 0.8 }),
    part(G.box(0.4, 0.14, 0.42), '#ffffff', { p: [hw, 0.07, 0], bright: 0.8 }),
  ]);
  frameGeoCache.set(key, geo);
  return geo;
}

const planeCache = new Map();
function cachedPlane(w, h) {
  const key = w + ':' + h;
  if (!planeCache.has(key)) planeCache.set(key, new THREE.PlaneGeometry(w, h));
  return planeCache.get(key);
}

export function buildGateVisual(width) {
  const height = GATE.height;
  const group = new THREE.Group();

  const frameMat = new THREE.MeshLambertMaterial({ color: '#59c1ff', emissive: '#2f8cff', emissiveIntensity: 0.55, vertexColors: true });
  const frame = new THREE.Mesh(frameGeometry(width, height), frameMat);
  frame.castShadow = true;
  group.add(frame);

  const panelMat = new THREE.MeshBasicMaterial({ map: glassTexture(), color: '#59c1ff', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const panel = new THREE.Mesh(cachedPlane(width - 0.2, height), panelMat);
  panel.position.set(0, height / 2 + 0.06, 0);
  panel.renderOrder = 2;
  group.add(panel);

  const stripMat = new THREE.MeshBasicMaterial({ color: '#59c1ff', transparent: true, opacity: 0.85, depthWrite: false });
  const strip = new THREE.Mesh(cachedPlane(width, 0.5), stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.025, 0);
  strip.renderOrder = 1;
  group.add(strip);

  const label = createLabel(256, 160);
  const lw = Math.min(width - 0.5, width > 6 ? 4.4 : 3.4);
  const lmesh = labelMesh(label, lw, lw * (160 / 256));
  lmesh.position.set(0, height * 0.56, 0.07);
  group.add(lmesh);

  return { group, frame, frameMat, panel, panelMat, strip, stripMat, label, labelMesh: lmesh, width, height };
}

/** Small shard used when an unchosen gate shatters. */
export function shardGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0.22, 0, -0.16, -0.12, 0, 0.18, -0.1, 0, 0, 0.22, 0.02, 0.18, -0.1, 0.02, -0.16, -0.12, 0.02]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
