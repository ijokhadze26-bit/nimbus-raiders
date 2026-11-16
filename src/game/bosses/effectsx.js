// Update 3 boss attack visuals (pooled, owned by BossEffects as effects.x): glowing lava / frost strips left on
// the road (Ironhorn's charges, the Tempest King's frozen lanes), objects dropping from the sky (embers, rocks,
// icicles), spinning candy canes on an arc (Candy Queen), rolling giant gumballs, a red rage aura sprite and the
// Candy Queen's JELLY BROOD coats (one instanced see-through wobbling jelly shell over each summoned minion, in
// pink / mint / lemon / grape, that pops in a candy splat when the minion dies).
// Logic positions advance in update(dt) (deterministic, no game rng); meshes are posed in sync(). One mesh per
// object, no lights, no shadow casters; Low quality skips the extra sparkle particles.
import * as THREE from 'three';
import { glowTexture, toonMaterial } from '../../models/materials.js';
import { part, merge, G } from '../../models/util.js';
import { registerWarm } from '../warmup.js';
import { writeYawMatrix } from '../../core/pool.js';

const BROOD_CAP = 120;
const BROOD_COLORS = ['#ff6ad0', '#4dffc4', '#ffe14a', '#b77aff'].map((c) => new THREE.Color(c));
const BROOD_SPLAT = [0xff6ad0, 0x4dffc4, 0xffe14a, 0xb77aff];

const SOFT = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
const ADD = { ...SOFT, blending: THREE.AdditiveBlending };
const stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// strip looks: crust colour, vein colour, edge glow, sparkle colour
const STRIP_LOOK = {
  lava: { a: '#5a1206', b: '#ff7a1a', c: '#ffe08a', edge: '#ff5a12', spark: 0xffa040 },
  frost: { a: '#7fc4ff', b: '#dff6ff', c: '#ffffff', edge: '#8fe3ff', spark: 0xcff4ff },
};
const texCache = {};
function stripTexture(kind) {
  if (texCache[kind]) return texCache[kind];
  const L = STRIP_LOOK[kind];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = L.a; g.fillRect(0, 0, 64, 128);
  let s = kind === 'lava' ? 7 : 3;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // veins / cracks: wobbly bright lines, then hot (or white) blobs
  g.strokeStyle = L.b; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    g.lineWidth = 2 + rnd() * 5;
    g.beginPath();
    let x = rnd() * 64, y = rnd() * 128;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.3) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = L.c;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd() * 64, rnd() * 128, 1.5 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache[kind] = t;
  return t;
}

let caneGeo = null, gumGeo = null, rockGeo = null, emberGeo = null, iceGeo = null, solidMat = null, jellyGeo = null;
/** Jelly shell: a squashed dome, bright on top (a candy highlight) and darker at the base (vertex colours). */
function jellyGeometry() {
  const g = merge([part(G.sphere(1, 12, 8), '#ffffff', { p: [0, 0.82, 0], s: [1, 0.86, 1] }), part(G.sphere(0.24, 6, 4), '#ffffff', { p: [-0.36, 1.28, 0.5] })]);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const hl = Math.hypot(p.getX(i) + 0.36, p.getY(i) - 1.28, p.getZ(i) - 0.5) < 0.3; // the highlight bead
    const k = hl ? 1.6 : 0.55 + 0.5 * Math.max(0, Math.min(1, p.getY(i) / 1.6));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}
function shapes() {
  if (caneGeo) return;
  // candy cane: striped shaft + hook (alternating red / white bands, vertex colours)
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(part(G.cyl(0.16, 0.16, 0.42, 8), i % 2 ? '#ffffff' : '#ff2a4a', { p: [0, -1.05 + i * 0.42, 0] }));
  for (let i = 0; i < 4; i++) parts.push(part(G.torus(0.42, 0.16, 6, 4, Math.PI / 4), i % 2 ? '#ffffff' : '#ff2a4a', { p: [0.42, 1.43, 0], r: [0, 0, i * Math.PI / 4] }));
  caneGeo = merge(parts);
  // gumball: shiny pink sphere with sugar sprinkles
  const gp = [part(G.sphere(1, 18, 12), '#ff6ab8')];
  const sp = ['#ffffff', '#ffe14a', '#5ad8ff', '#7dff9a'];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996, y = 1 - (i + 0.5) / 11;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    gp.push(part(G.box(0.1, 0.1, 0.34), sp[i % 4], { p: [Math.cos(a) * r * 1.01, y * 1.01, Math.sin(a) * r * 1.01], r: [a, i, 0] }));
  }
  gumGeo = merge(gp);
  rockGeo = merge([part(new THREE.DodecahedronGeometry(1, 0), '#8a8176'), part(new THREE.DodecahedronGeometry(0.62, 0), '#6d655b', { p: [0.45, 0.3, 0.2] })]);
  emberGeo = new THREE.IcosahedronGeometry(1, 0);
  iceGeo = merge([part(G.cone(0.42, 2.4, 6), '#bfeaff', { r: [Math.PI, 0, 0] }), part(G.cone(0.22, 1.2, 5), '#ffffff', { p: [0.25, 0.3, 0], r: [Math.PI, 0, 0.2] })]);
  solidMat = toonMaterial({});
}

export class ExtraFx {
  constructor(game) {
    this.game = game;
    this.strips = []; this.drops = []; this.canes = []; this.gums = []; this.auras = [];
    this.brood = []; this.broodFree = []; this.jellies = null;
    shapes();
  }

  get low() { return this.game.engine && this.game.engine.quality === 'low'; }

  pool(list, make) {
    let o = list.find((e) => !e.active);
    if (!o) { o = make(); list.push(o); }
    o.active = true; o.t = 0;
    return o;
  }

  addTo(obj) { if (obj.parent !== this.game.scene) this.game.scene.add(obj); obj.visible = true; }

  // ---------------- lava / frost strips ----------------
  /** Glowing strip x0..x1 x zFar..zNear that lives `life` s (grows in, fades out). kind 'lava' | 'frost'. */
  strip(kind, x0, x1, zFar, zNear, life) {
    const o = this.pool(this.strips, () => {
      const mesh = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ ...SOFT, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      const edge = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ ...ADD, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      mesh.renderOrder = 1; edge.renderOrder = 2;
      return { mesh, edge, kind: null };
    });
    if (o.kind !== kind) {
      const tex = stripTexture(kind).clone();
      tex.needsUpdate = true;
      if (o.mesh.material.map) o.mesh.material.map.dispose();
      o.mesh.material.map = tex; o.mesh.material.needsUpdate = true;
      o.edge.material.color.set(STRIP_LOOK[kind].edge);
      o.kind = kind;
    }
    Object.assign(o, { x0, x1, zFar, zNear, life, sparkT: 0 });
    o.mesh.material.map.repeat.set(Math.max(1, (x1 - x0) / 1.6), Math.max(1, (zNear - zFar) / 3.2));
    this.addTo(o.mesh); this.addTo(o.edge);
    return o;
  }

  // ---------------- drops (ember / rock / ice falling from the sky) ----------------
  /** An object falls from height h onto (x, z) in `time` s. kind 'ember' | 'rock' | 'ice'. */
  drop(kind, x, z, time, size = 1, h = 16) {
    const o = this.pool(this.drops, () => {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...ADD }));
      return { glow, meshes: {} };
    });
    for (const k of Object.keys(o.meshes)) o.meshes[k].visible = false;
    let m = o.meshes[kind];
    if (!m) {
      m = kind === 'ember' ? new THREE.Mesh(emberGeo, new THREE.MeshBasicMaterial({ color: '#ffb040', toneMapped: false }))
        : new THREE.Mesh(kind === 'ice' ? iceGeo : rockGeo, solidMat);
      o.meshes[kind] = m;
    }
    o.mesh = m;
    Object.assign(o, { kind, x, z, time: Math.max(0.1, time), size, h, y: h, spin: (x * 7.3 + z) % 6 });
    o.glow.material.color.set(kind === 'ember' ? '#ff7a1e' : kind === 'ice' ? '#9fe8ff' : '#ffd9a0');
    this.addTo(m);
    if (kind !== 'rock') this.addTo(o.glow); else o.glow.visible = false;
    return o;
  }

  // ---------------- candy canes ----------------
  /** A spinning candy cane flying from (x0,y0,z0) onto (x1,0,z1) in `time` s on an arc. */
  cane(x0, y0, z0, x1, z1, time, arc = 4) {
    const o = this.pool(this.canes, () => ({ mesh: new THREE.Mesh(caneGeo, solidMat) }));
    Object.assign(o, { x0, y0, z0, x1, z1, time: Math.max(0.1, time), arc, x: x0, y: y0, z: z0 });
    this.addTo(o.mesh);
    return o;
  }

  // ---------------- gumballs ----------------
  /** A giant gumball of radius r rolling at (x, z); the attack moves it (o.z / o.vz). */
  gumball(x, z, r) {
    const o = this.pool(this.gums, () => ({ mesh: new THREE.Mesh(gumGeo, solidMat) }));
    Object.assign(o, { x, z, r, vz: 0, roll: 0, y: r });
    this.addTo(o.mesh);
    return o;
  }

  // ---------------- rage aura ----------------
  /** Red pulsing glow behind a raging boss (one sprite, re-posed every frame by the boss). */
  aura() {
    if (!this.rageAura) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...SOFT, color: '#ff2a1a', opacity: 0 }));
      s.renderOrder = -1;
      this.rageAura = { s, x: 0, y: 0, z: 0, size: 0, k: 0, on: false };
    }
    return this.rageAura;
  }

  // ---------------- jelly brood (Candy Queen) ----------------
  /** The instanced jelly-shell mesh (built once, one draw call for every brood minion). */
  jellyMesh() {
    if (!this.jellies) {
      jellyGeo = jellyGeo || jellyGeometry();
      const m = new THREE.InstancedMesh(jellyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, ...SOFT, opacity: 0.55 }), BROOD_CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, BROOD_COLORS[0]);
      m.frustumCulled = false; m.count = 0; m.renderOrder = 3;
      this.jellies = m;
    }
    return this.jellies;
  }

  /** Coats a freshly summoned Murkling (horde enemy object) in jelly; k picks the colour. */
  coat(e, k) {
    if (this.brood.length >= BROOD_CAP) return;
    const o = this.broodFree.pop() || { e: null, ph: 0, k: 0 };
    o.e = e; o.ph = e.ph; o.k = ((k % 4) + 4) % 4;
    this.brood.push(o);
    this.addTo(this.jellyMesh());
  }

  /** Strip covering (x, z) (or null). */
  stripAt(x, z, kind) {
    for (const o of this.strips) {
      if (!o.active || (kind && o.kind !== kind) || o.t < 0.25 || o.t > o.life - 0.25) continue;
      if (x > o.x0 && x < o.x1 && z > o.zFar && z < o.zNear) return o;
    }
    return null;
  }

  update(dt) {
    for (const o of this.strips) if (o.active && (o.t += dt) >= o.life) o.active = false;
    for (const o of this.drops) {
      if (!o.active) continue;
      o.t += dt;
      const f = Math.min(1, o.t / o.time);
      o.y = o.h * (1 - f * f) + o.size * 0.5;
      if (f >= 1) o.active = false;
    }
    for (const o of this.canes) {
      if (!o.active) continue;
      o.t += dt;
      const f = Math.min(1, o.t / o.time);
      o.x = o.x0 + (o.x1 - o.x0) * f;
      o.z = o.z0 + (o.z1 - o.z0) * f;
      o.y = o.y0 * (1 - f) + Math.sin(f * Math.PI) * o.arc + 0.6 * f;
      if (f >= 1) o.active = false;
    }
    for (const o of this.gums) if (o.active) { o.t += dt; o.roll += (o.vz * dt) / Math.max(0.3, o.r); }
    const a = this.rageAura;
    if (a) a.k = a.on ? Math.min(1, a.k + dt * 3) : Math.max(0, a.k - dt * 2);
  }

  sync() {
    const time = this.game.time;
    const B = !this.low && this.game.fx ? this.game.fx.B : null;
    for (const o of this.strips) {
      o.mesh.visible = o.edge.visible = o.active;
      if (!o.active) continue;
      const grow = Math.min(1, o.t / 0.3), fade = Math.min(1, (o.life - o.t) / 0.5);
      const w = o.x1 - o.x0, len = o.zNear - o.zFar;
      const cx = (o.x0 + o.x1) / 2, cz = (o.zFar + o.zNear) / 2;
      o.mesh.position.set(cx, 0.06, cz);
      o.mesh.scale.set(w * grow, 1, len);
      o.mesh.material.opacity = 0.95 * fade;
      o.mesh.material.map.offset.y = (o.kind === 'lava' ? -0.25 : -0.05) * time;
      o.edge.position.set(cx, 0.08, cz);
      o.edge.scale.set((w + 0.7) * grow, 1, len + 0.4);
      o.edge.material.opacity = (0.28 + 0.14 * Math.sin(time * 7 + cx)) * fade;
      if (B && (o.sparkT -= 1 / 60) <= 0) {
        o.sparkT = o.kind === 'lava' ? 0.09 : 0.16;
        const h = (time * 97.13 + cx * 13.7) % 1, h2 = (time * 51.7 + cz) % 1;
        B.sparkle(o.x0 + Math.abs(h) * w, 0.2, o.zFar + Math.abs(h2) * len, STRIP_LOOK[o.kind].spark, 1, 0.3, 0, o.kind === 'lava' ? 2.2 : 0.6);
      }
    }
    for (const o of this.drops) {
      if (!o.active) { if (o.mesh) o.mesh.visible = false; o.glow.visible = false; continue; }
      const m = o.mesh;
      m.position.set(o.x, o.y, o.z);
      m.scale.setScalar(o.size * (o.kind === 'ice' ? 0.8 : o.kind === 'ember' ? 0.45 : 0.75));
      if (o.kind === 'ice') m.rotation.set(0, o.spin, 0);
      else m.rotation.set(time * 4 + o.spin, time * 3, 0);
      if (o.kind !== 'rock') { o.glow.position.set(o.x, o.y + 0.4, o.z); o.glow.scale.setScalar(o.size * (o.kind === 'ember' ? 2.6 : 1.8)); o.glow.material.opacity = 0.8; }
    }
    for (const o of this.canes) {
      o.mesh.visible = o.active;
      if (!o.active) continue;
      o.mesh.position.set(o.x, o.y, o.z);
      o.mesh.rotation.set(o.t * 9, o.x0 * 0.3, o.t * 5);
      o.mesh.scale.setScalar(0.9);
    }
    for (const o of this.gums) {
      o.mesh.visible = o.active;
      if (!o.active) continue;
      o.mesh.position.set(o.x, o.r * (1 + Math.abs(Math.sin(o.roll * 2)) * 0.04), o.z);
      o.mesh.rotation.set(o.roll, 0, 0);
      o.mesh.scale.setScalar(o.r);
    }
    if (this.jellies) this.syncBrood(time, B);
    const a = this.rageAura;
    if (a) {
      a.s.visible = a.k > 0.01;
      if (a.s.visible) {
        this.addTo(a.s);
        a.s.position.set(a.x, a.y, a.z);
        a.s.scale.setScalar(a.size * (1 + 0.08 * Math.sin(time * 9)));
        a.s.material.opacity = a.k * (0.42 + 0.22 * Math.sin(time * 9));
      }
    }
  }

  /** Poses the jelly shells over the live brood; a minion that died pops in a candy splat (High only). */
  syncBrood(time, B) {
    const m = this.jellies, arr = m.instanceMatrix.array, list = this.brood;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], e = o.e;
      if (e.state !== 0 || e.ph !== o.ph) {
        // died (same spawn, now dying) -> splat; a recycled enemy object (new ph) just loses its coat
        if (B && e.ph === o.ph) B.sparkle(e.x, 0.6, e.z, BROOD_SPLAT[o.k], 7, 1.1, 0, 2.2);
        list[i] = list[list.length - 1]; list.pop(); o.e = null; this.broodFree.push(o);
        continue;
      }
      const r = (e.def ? e.def.r : 0.4) * 1.45;
      const w = Math.sin(time * 8 + o.ph * 3);
      const hop = Math.abs(Math.sin(time * 6 + o.ph)) * 0.16;
      writeYawMatrix(arr, n, e.x, hop, e.z, Math.sin(time * 1.3 + o.ph) * 0.4, r * (1 + 0.1 * w), r * (1 - 0.12 * w), r * (1 + 0.1 * w));
      m.setColorAt(n, BROOD_COLORS[o.k]);
      n++;
    }
    m.count = n;
    if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    m.visible = n > 0;
  }

  clear() {
    for (const list of [this.strips, this.drops, this.canes, this.gums]) for (const o of list) o.active = false;
    for (const o of this.brood) { o.e = null; this.broodFree.push(o); }
    this.brood.length = 0;
    if (this.rageAura) { this.rageAura.on = false; this.rageAura.k = 0; }
    this.sync();
    const scene = this.game.scene;
    for (const o of this.strips) { scene.remove(o.mesh); scene.remove(o.edge); }
    for (const o of this.drops) { scene.remove(o.glow); for (const k of Object.keys(o.meshes)) scene.remove(o.meshes[k]); }
    for (const o of this.canes) scene.remove(o.mesh);
    for (const o of this.gums) scene.remove(o.mesh);
    if (this.rageAura) scene.remove(this.rageAura.s);
    if (this.jellies) { this.jellies.count = 0; scene.remove(this.jellies); }
  }
}

// boot warm-up: compile the strip / drop / cane / gumball programs (each object goes back to its pool)
registerWarm((game) => {
  const x = game.bosses && game.bosses.effects && game.bosses.effects.x;
  if (!x) return null;
  x.strip('lava', -1, 1, -12, -8, 1); x.strip('frost', -1, 1, -12, -8, 1);
  x.drop('ember', 0, -10, 1); x.drop('rock', 1, -10, 1); x.drop('ice', -1, -10, 1);
  x.cane(0, 2, -10, 0, -12, 1); x.gumball(0, -10, 1);
  x.aura().on = true; x.update(0.5); x.sync();
  const jm = x.jellyMesh();
  jm.count = 1;
  return { objects: [jm], done: () => { jm.count = 0; x.clear(); } };
});
