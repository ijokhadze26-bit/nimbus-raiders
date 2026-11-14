// Procedural geometry helpers: colored parts merged into one BufferGeometry (vertex colors).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Transforms + colors a primitive. Options: p (position), r (euler xyz radians), s (scale; number or array),
 * a (alpha, adds RGBA colors), keepUv.
 */
export function part(geo, color, opts = {}) {
  const g = geo;
  const p = opts.p || [0, 0, 0];
  const r = opts.r || [0, 0, 0];
  const s = typeof opts.s === 'number' ? [opts.s, opts.s, opts.s] : (opts.s || [1, 1, 1]);
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  if (!opts.keepUv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const alpha = opts.a !== undefined;
  const size = alpha ? 4 : 3;
  const arr = new Float32Array(n * size);
  if (typeof color === 'string' || typeof color === 'number') _c.set(color); else _c.copy(color);
  const k = opts.bright ?? 1;
  for (let i = 0; i < n; i++) {
    arr[i * size] = _c.r * k; arr[i * size + 1] = _c.g * k; arr[i * size + 2] = _c.b * k;
    if (alpha) arr[i * size + 3] = opts.a;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, size));
  return g;
}

/** Merges parts; converts to non-indexed when indexed and non-indexed parts are mixed. */
export function merge(parts) {
  const anyIndexed = parts.some((g) => g.index);
  const anyPlain = parts.some((g) => !g.index);
  const list = anyIndexed && anyPlain ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const out = mergeGeometries(list, false);
  if (!out) throw new Error('merge failed: attribute mismatch');
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  sphere: (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs),
  capsule: (r, len, cap = 2, rad = 8) => new THREE.CapsuleGeometry(r, len, cap, rad),
  cyl: (rt, rb, h, rad = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, rad, 1, open),
  cone: (r, h, rad = 8) => new THREE.ConeGeometry(r, h, rad),
  torus: (r, t, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
};
