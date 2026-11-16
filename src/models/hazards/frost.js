// Frozen Peaks hazard models (update 3): ice sheet (glossy blue texture + moving sheen), snowstorm flakes (one
// Points cloud animated in the vertex shader, wind-slanted streaks), icicle (crystal spike) + its ground shadow,
// avalanche wave (a long rolling snow mound with chunks). Original art, chunky toon look.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { blobShadowTexture } from '../materials.js';
import { once, paintRng, canvasTexture, glowMaterial, addMaterial, decalMaterial } from './common.js';

// ---------------- ice ----------------
export function iceTexture() {
  return once('iceTex', () => canvasTexture(256, 256, (g, w, h) => {
    const r = paintRng(31);
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#bfeaff'); grd.addColorStop(0.5, '#e6f8ff'); grd.addColorStop(1, '#a9dcff');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // frosted patches
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = 14 + r() * 36;
      const gg = g.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, 'rgba(255,255,255,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // glassy scratches + hairline cracks
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, len = 20 + r() * 60, a = -0.6 + r() * 0.4;
      g.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.8)' : 'rgba(90,160,210,0.55)';
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }, { repeat: true }));
}
export const iceMaterial = () => once('iceMat', () => decalMaterial({ map: iceTexture(), opacity: 0.94, color: '#ffffff' }));
/** Diagonal sheen band (additive) that slides over the ice. */
export const sheenTexture = () => once('sheenTex', () => canvasTexture(128, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.45, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.56, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}, { repeat: true }));
export const sheenMaterial = () => once('sheenMat', () => addMaterial({ map: sheenTexture(), opacity: 0.35, color: '#dff6ff', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
export const rimMaterial = () => once('iceRimMat', () => new THREE.MeshLambertMaterial({ vertexColors: true }));

export function icePlaneGeometry(w, len, tile = 5) {
  const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * len / tile);
  return g;
}

/** Snowy lumps along the ice edges (x0..x1, z in [-len, 0]). */
export function iceRimGeometry(x0, x1, len, low = false) {
  const parts = [], r = paintRng(Math.round(len * 5 + x0 * 7 + 50));
  const w = x1 - x0;
  for (const z of [0, -len]) {
    const n = Math.max(2, Math.round(w / (low ? 1.6 : 0.9)));
    for (let i = 0; i < n; i++) parts.push(part(G.sphere(0.34 + r() * 0.12, 7, 5), r() < 0.5 ? '#ffffff' : '#dff3ff', { p: [x0 + (i + 0.5) * (w / n), 0.04, z + (r() - 0.5) * 0.3], s: [1.4, 0.45, 1] }));
  }
  return merge(parts);
}

// ---------------- snowstorm ----------------
const MAX_FLAKES = 360;
const BOX = { w: 30, h: 14, d: 70 };
const VERT = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform float uCamZ; uniform float uCamX; uniform float uScale; uniform float uWind;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * (0.8 + aSeed.x * 0.5);
  float y = mod(p.y - t * 5.0, ${BOX.h.toFixed(1)});
  float x = mod(p.x + t * uWind + sin(t + aSeed.z * 6.28) * 0.6 + ${(BOX.w / 2).toFixed(1)}, ${BOX.w.toFixed(1)}) - ${(BOX.w / 2).toFixed(1)} + uCamX;
  float z = uCamZ + 6.0 - mod(uCamZ + 6.0 - p.z, ${BOX.d.toFixed(1)});
  vec4 mv = modelViewMatrix * vec4(x, y - 2.0, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vA = (1.0 - smoothstep(30.0, 60.0, d)) * smoothstep(1.0, 4.0, d);
  gl_PointSize = (0.3 + aSeed.w * 0.3) * uScale / max(d, 1.0);
}`;
const FRAG = /* glsl */`
uniform float uOpacity;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.2, 0.5, length(c))) * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;

export function buildSnowstorm() {
  const pos = new Float32Array(MAX_FLAKES * 3), seed = new Float32Array(MAX_FLAKES * 4);
  const r = paintRng(77);
  for (let i = 0; i < MAX_FLAKES; i++) {
    pos[i * 3] = (r() - 0.5) * BOX.w; pos[i * 3 + 1] = r() * BOX.h; pos[i * 3 + 2] = r() * BOX.d;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uniforms = { uTime: { value: 0 }, uCamZ: { value: 0 }, uCamX: { value: 0 }, uScale: { value: 800 }, uWind: { value: -3 }, uOpacity: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 9;
  points.visible = false;
  return { points, uniforms, max: MAX_FLAKES };
}

// ---------------- icicle ----------------
export function icicleGeometry() {
  return once('icicle', () => {
    const parts = [
      part(G.cone(0.32, 2.2, 7), '#d8f4ff', { p: [0, 1.1, 0], r: [Math.PI, 0, 0] }),
      part(G.cone(0.16, 1.2, 6), '#ffffff', { p: [0.14, 1.6, 0.05], r: [Math.PI, 0, 0.15] }),
      part(G.cone(0.14, 1.0, 6), '#9fdcff', { p: [-0.12, 1.75, -0.06], r: [Math.PI, 0, -0.18] }),
      part(G.cyl(0.36, 0.3, 0.3, 7), '#b8e8ff', { p: [0, 2.3, 0] }),
    ];
    return merge(parts); // tip at y = 0
  });
}
export const icicleMaterial = () => once('icicleMat', () => glowMaterial({ vertexColors: true, color: '#e8f8ff' }));
export const shadowGeometry = () => once('flatDisc', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
export const shadowMaterial = () => once('icicleShadow', () => decalMaterial({ map: blobShadowTexture(), color: '#0b2a4a', opacity: 0.55 }));

// ---------------- avalanche ----------------
/** A rolling snow mound 1 u wide across x, `len` long along z (centred), with chunks on top. */
export function avalancheGeometry(len = 16, low = false) {
  return once('aval' + len + (low ? 'L' : ''), () => {
    const parts = [part(G.capsule(1.1, len - 2.2, 3, low ? 6 : 10), '#f4fbff', { p: [0, 0.9, 0], r: [Math.PI / 2, 0, 0], s: [1.3, 1, 1] })];
    const r = paintRng(len * 3 + 7);
    const n = low ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const z = (r() - 0.5) * (len - 1.5);
      parts.push(part(G.sphere(0.45 + r() * 0.45, 7, 5), r() < 0.5 ? '#ffffff' : '#dcefff', { p: [(r() - 0.5) * 1.6, 1.6 + r() * 0.6, z] }));
    }
    for (let i = 0; i < (low ? 3 : 7); i++) {
      parts.push(part(G.box(0.4, 0.3, 0.4), '#b9d6ea', { p: [(r() - 0.5) * 2, 1.9 + r() * 0.5, (r() - 0.5) * (len - 2)], r: [r() * 3, r() * 3, 0] }));
    }
    return merge(parts);
  });
}
export const avalancheMaterial = () => once('avalMat', () => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#9fc8e8', emissiveIntensity: 0.25 }));
export const sprayMaterial = () => once('avalSpray', () => addMaterial({ color: '#ffffff', opacity: 0.0 }));
