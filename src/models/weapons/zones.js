// Zone views (SPEC2 §2.3 / §2.7): caramel puddles and black holes. Reads game.zones.list every frame
// (read-only; the simulation is identical on every quality). Three InstancedMeshes, visible only while zones
// exist (one draw call each), all MeshBasic + vertex RGBA (the bullets' program), registered for warm-up:
//   puddles  glossy amber caramel disc with a lighter rim and a gloss streak (<= 5)
//   holes    dark disc with magenta spiral arms (<= 6) + a magenta swirl ring turning the other way (normal
//            blending: additive washes out to white on the bright road)
// Particles (bubble pops, inward streaks, accretion stars) come from fx/weapons. Contract:
// createZoneViews(game) -> { sync(dt), reset(), dispose(), meshes }.
import * as THREE from 'three';
import { registerWarm } from '../../game/warmup.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const geoCache = {};

/** Flat disc on the ground (XZ), triangle fan with per-vertex RGBA from fn(r01, angle) -> [r,g,b,a]. */
function disc(rings, seg, fn, wobble = 0) {
  const pos = [], col = [], idx = [];
  pos.push(0, 0, 0); col.push(...fn(0, 0));
  for (let k = 1; k <= rings; k++) {
    const r = k / rings;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const w = 1 + wobble * (Math.sin(a * 5) * 0.6 + Math.sin(a * 3 + 1.3) * 0.4) * r;
      pos.push(Math.cos(a) * r * w, 0, Math.sin(a) * r * w);
      col.push(...fn(r, a));
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let k = 1; k < rings; k++) {
    const o0 = 1 + (k - 1) * seg, o1 = 1 + k * seg;
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      idx.push(o0 + i, o0 + j, o1 + i, o0 + j, o1 + j, o1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export function puddleGeometry() {
  if (geoCache.puddle) return geoCache.puddle;
  const core = hex('#d98a2b'), mid = hex('#e8a040'), rim = hex('#ffd27a'), gloss = hex('#fff6e0');
  geoCache.puddle = disc(4, 22, (r, a) => {
    if (r === 0) return [...core, 0.82];
    const c = r < 0.6 ? mid : r < 0.9 ? mid.map((v, i) => v * 0.5 + rim[i] * 0.5) : rim;
    // a gloss streak toward the camera-left quadrant
    const g = r > 0.35 && r < 0.75 && a > 2.2 && a < 3.4 ? 0.55 : 0;
    return [c[0] + (gloss[0] - c[0]) * g, c[1] + (gloss[1] - c[1]) * g, c[2] + (gloss[2] - c[2]) * g, r >= 1 ? 0.6 : 0.8];
  }, 0.12);
  return geoCache.puddle;
}

export function holeGeometry() {
  if (geoCache.hole) return geoCache.hole;
  const dark = hex('#0d0418'), mag = hex('#ff4bd8'), vio = hex('#6a2bd8');
  geoCache.hole = disc(5, 24, (r, a) => {
    if (r < 0.45) return [...dark, 0.97];
    const arm = 0.5 + 0.5 * Math.sin(a * 3 + r * 7.5); // three spiral arms
    const c = arm > 0.72 ? mag : vio;
    const k = (r - 0.45) / 0.55;
    return [dark[0] + (c[0] - dark[0]) * k * 0.9, dark[1] + (c[1] - dark[1]) * k * 0.9, dark[2] + (c[2] - dark[2]) * k * 0.9, 0.95 * (1 - k * k * 0.85)];
  });
  return geoCache.hole;
}

export function swirlGeometry() {
  if (geoCache.swirl) return geoCache.swirl;
  const mag = hex('#ff4bd8'), pink = hex('#ffb3f0');
  geoCache.swirl = disc(4, 24, (r, a) => {
    if (r < 0.6) return [0, 0, 0, 0];
    const arm = 0.5 + 0.5 * Math.sin(a * 2 - r * 9);
    const c = arm > 0.8 ? pink : mag;
    const edge = r >= 1 ? 0 : 1 - Math.abs(r - 0.82) / 0.3;
    return [c[0], c[1], c[2], Math.max(0, edge) * (0.35 + 0.6 * arm)];
  });
  return geoCache.swirl;
}

function instMesh(geo, cap, additive = false) {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  if (additive) mat.blending = THREE.AdditiveBlending;
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 3;
  return mesh;
}

function put(mesh, i, x, y, z, s, yaw) {
  _e.set(0, yaw, 0); _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(s, 1, s));
  mesh.setMatrixAt(i, _m);
}

export function createZoneViews(game) {
  const puddles = instMesh(puddleGeometry(), 5);
  const holes = instMesh(holeGeometry(), 6);
  const swirls = instMesh(swirlGeometry(), 6);
  game.scene.add(puddles, holes, swirls);
  let t = 0;
  const view = {
    game, meshes: [puddles, holes, swirls],
    sync(dt) {
      t += dt || 0;
      const Z = game.zones;
      if (!Z) return;
      const P = Z.puddles, H = Z.holes;
      let n = 0;
      for (let i = 0; i < P.length && n < 5; i++) {
        const p = P[i];
        const life = p.dur - p.t;
        const k = Math.min(1, p.t / 0.18) * Math.min(1, Math.max(0.02, life / 0.5));
        put(puddles, n++, p.x, 0.035 + i * 0.002, p.z, p.r * (0.55 + 0.45 * k) * (1 + Math.sin(t * 3 + p.id) * 0.02), p.id * 1.7);
      }
      puddles.count = n; puddles.visible = n > 0;
      if (n) puddles.instanceMatrix.needsUpdate = true;
      n = 0;
      for (let i = 0; i < H.length && n < 6; i++) {
        const h = H[i];
        const life = h.dur - h.t;
        const k = Math.min(1, h.t / 0.15) * Math.min(1, Math.max(0.05, life / 0.3));
        const core = Z.holeCore(h) * 1.6 * k, rr = Z.holeR(h) * (0.6 + 0.4 * k);
        put(holes, n, h.x, 0.05 + i * 0.003, h.z, core, t * 2.2 + h.id);
        put(swirls, n, h.x, 0.07 + i * 0.003, h.z, rr, -t * 3.1 - h.id);
        n++;
      }
      holes.count = n; swirls.count = n;
      holes.visible = swirls.visible = n > 0;
      if (n) { holes.instanceMatrix.needsUpdate = true; swirls.instanceMatrix.needsUpdate = true; }
    },
    reset() { for (const m of view.meshes) { m.count = 0; m.visible = false; } },
    dispose() { for (const m of view.meshes) { game.scene.remove(m); m.material.dispose(); } },
  };
  return view;
}

registerWarm(() => {
  const objs = [instMesh(puddleGeometry(), 1), instMesh(holeGeometry(), 1), instMesh(swirlGeometry(), 1)];
  for (const m of objs) { m.count = 1; m.visible = true; m.setMatrixAt(0, _m.identity()); }
  return objs;
});
