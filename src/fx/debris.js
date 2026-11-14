// Pooled 3D debris (one InstancedMesh, toon-lit, flat-shaded chunk): metal shards, rock chips, goo lumps,
// armor plates. Tumbles, falls, bounces on the bridge (not over the void beside it), shrinks out.
import * as THREE from 'three';
import { toonGradient } from '../models/materials.js';
import { ROAD_HALF } from '../config.js';

const FIELDS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'sx', 'sy', 'sz', 'age', 'life', 'grav', 'cr', 'cg', 'cb'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

function chunkGeometry() {
  // squashed icosahedron = chunky faceted piece; non-indexed so the toon shading reads facet by facet
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.scale(1, 0.8, 0.9);
  g.computeVertexNormals();
  return g;
}

export class Debris {
  constructor(scene, capacity = 220) {
    this.capacity = capacity;
    this.cap = capacity;
    this.n = 0;
    const d = {};
    for (const f of FIELDS) d[f] = new Float32Array(capacity);
    this.d = d;
    this.fields = FIELDS.map((f) => d[f]);
    this.mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
    this.mesh = new THREE.InstancedMesh(chunkGeometry(), this.mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  setQuality(q) { this.cap = q === 'low' ? Math.min(this.capacity, 100) : this.capacity; }

  /** size = base scale; flat (0..1) squashes it into a plate/shard. color 0xRRGGBB. */
  spawn(x, y, z, vx, vy, vz, life, size, color, flat = 0, grav = 16) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    const d = this.d;
    d.px[i] = x; d.py[i] = y; d.pz[i] = z;
    d.vx[i] = vx; d.vy[i] = vy; d.vz[i] = vz;
    d.rx[i] = Math.random() * 6.28; d.ry[i] = Math.random() * 6.28; d.rz[i] = Math.random() * 6.28;
    d.wx[i] = (Math.random() - 0.5) * 16; d.wy[i] = (Math.random() - 0.5) * 10; d.wz[i] = (Math.random() - 0.5) * 16;
    const j = 0.75 + Math.random() * 0.5;
    d.sx[i] = size * j; d.sy[i] = size * (1 - flat * 0.78) * (0.8 + Math.random() * 0.4); d.sz[i] = size * (0.7 + Math.random() * 0.6) * (1 - flat * 0.2);
    d.age[i] = 0; d.life[i] = life; d.grav[i] = grav;
    _c.setHex(color);
    d.cr[i] = _c.r; d.cg[i] = _c.g; d.cb[i] = _c.b;
    return i;
  }

  clear() { this.n = 0; this.mesh.count = 0; this.mesh.visible = false; }

  update(dt) {
    const d = this.d, F = this.fields, nf = F.length;
    let n = this.n;
    for (let i = n - 1; i >= 0; i--) {
      d.age[i] += dt;
      if (d.age[i] >= d.life[i]) {
        n--;
        if (i !== n) for (let k = 0; k < nf; k++) F[k][i] = F[k][n];
        continue;
      }
      d.vy[i] -= d.grav[i] * dt;
      d.px[i] += d.vx[i] * dt; d.py[i] += d.vy[i] * dt; d.pz[i] += d.vz[i] * dt;
      const floor = d.sy[i] * 0.4;
      if (d.py[i] < floor && d.vy[i] < 0 && Math.abs(d.px[i]) < ROAD_HALF + 0.2 && d.py[i] > -0.5) {
        d.py[i] = floor;
        d.vy[i] = -d.vy[i] * 0.32;
        d.vx[i] *= 0.55; d.vz[i] *= 0.55;
        d.wx[i] *= 0.5; d.wy[i] *= 0.5; d.wz[i] *= 0.5;
      }
      d.rx[i] += d.wx[i] * dt; d.ry[i] += d.wy[i] * dt; d.rz[i] += d.wz[i] * dt;
    }
    this.n = n;
    const arr = this.mesh.instanceMatrix.array, col = this.mesh.instanceColor.array;
    for (let i = 0; i < n; i++) {
      const t = d.age[i] / d.life[i];
      const k = t < 0.7 ? 1 : Math.max(0.001, 1 - (t - 0.7) / 0.3);
      _q.setFromEuler(_e.set(d.rx[i], d.ry[i], d.rz[i]));
      _m.compose(_p.set(d.px[i], d.py[i], d.pz[i]), _q, _s.set(d.sx[i] * k, d.sy[i] * k, d.sz[i] * k));
      _m.toArray(arr, i * 16);
      col[i * 3] = d.cr[i]; col[i * 3 + 1] = d.cg[i]; col[i * 3 + 2] = d.cb[i];
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) {
      const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
      im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
      ic.clearUpdateRanges(); ic.addUpdateRange(0, n * 3); ic.needsUpdate = true;
    }
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
