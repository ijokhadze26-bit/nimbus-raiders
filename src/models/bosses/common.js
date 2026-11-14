// Shared bits for the procedural boss models: cloud puff clusters, soft contact shadow, glow sprites,
// zigzag lightning limbs. All geometry is vertex-colored and merged so each boss stays a handful of draws.
import * as THREE from 'three';
import { part, merge, G } from '../util.js';
import { blobShadowTexture, glowTexture } from '../materials.js';

const _c = new THREE.Color(), _top = new THREE.Color(), _bot = new THREE.Color();

/**
 * Cloud puff: a sphere whose vertex colors fade from `top` (upper half) to `bottom` (underside) so a
 * cluster of puffs reads as a lit cumulus. opts: p, s (scale), seg.
 */
export function puff(r, top, bottom, opts = {}) {
  const seg = opts.seg || 14;
  const g = part(G.sphere(r, seg, Math.round(seg * 0.7)), '#ffffff', { p: opts.p, s: opts.s, r: opts.r });
  const pos = g.attributes.position, col = g.attributes.color;
  _top.set(top); _bot.set(bottom);
  const cy = opts.p ? opts.p[1] : 0;
  const sy = typeof opts.s === 'number' ? opts.s : (opts.s ? opts.s[1] : 1);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.max(0, Math.min(1, ((pos.getY(i) - cy) / (r * sy) + 1) * 0.5));
    _c.copy(_bot).lerp(_top, Math.pow(f, 0.8));
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return g;
}

/** Many puffs merged; list items: [x, y, z, r, sx?, sy?, sz?]. */
export function cloud(list, top, bottom, seg = 14) {
  return merge(list.map(([x, y, z, r, sx = 1, sy = 1, sz = 1]) => puff(r, top, bottom, { p: [x, y, z], s: [sx, sy, sz], seg })));
}

/** Soft dark blob on the road under a boss (bosses stand outside the squad's shadow-map frustum). */
export function contactShadow(w, d, opacity = 0.42) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1f2f5a', alphaMap: blobShadowTexture(), transparent: true, opacity, depthWrite: false }));
  m.scale.set(w, 1, d);
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

/** Additive glow sprite. */
export function glowSprite(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** Zigzag chain of boxes from a to b (arrays), `kinks` jittered joints, thickness w (white vertex color). */
export function zigzag(a, b, kinks, w, seed = 1, amp = 0.35) {
  let s = seed * 7.13;
  const rnd = () => { s = (s * 16807 + 0.5) % 2147483647; return (s % 1000) / 1000; };
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const side = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
  const pts = [A];
  for (let i = 1; i < kinks; i++) {
    const p = A.clone().addScaledVector(dir, i / kinks);
    p.addScaledVector(side, (i % 2 ? 1 : -1) * amp * (0.6 + rnd() * 0.8));
    p.z += (rnd() - 0.5) * amp;
    pts.push(p);
  }
  pts.push(B);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const len = p0.distanceTo(p1);
    const g = G.box(w, len + w * 0.7, w);
    q.setFromUnitVectors(up, p1.clone().sub(p0).normalize());
    g.applyQuaternion(q);
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(part(g, '#ffffff'));
  }
  return merge(parts);
}
