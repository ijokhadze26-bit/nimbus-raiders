// Pooled boss attack visuals shared by every boss: glowing orbs that arc onto targets, lightning bolts,
// shockwave rings, ground glows, goo puddles (slow zones), a sweeping eye-laser sheet and a quake crest.
// Logic (positions over time, puddle queries) advances in update(dt) so it stays deterministic; meshes are
// posed in sync(). Everything is built once per game and reused; clear() hides it all between fights.
import * as THREE from 'three';
import { glowTexture } from '../../models/materials.js';

const ADD = { transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, fog: false };
// normal-blended glow: keeps its colour on the bright road / sky where additive washes out to white
const SOFT = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
const orbGeo = new THREE.IcosahedronGeometry(1, 2);
const ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const crestGeo = new THREE.TorusGeometry(1, 0.3, 6, 18, Math.PI);

let boltGeos = null, puddleTex = null;

const BOLT_H = 18;
/** Zigzag lightning path (BOLT_H tall) as merged boxes; thick = glow shell, thin = hot core. */
function boltGeometry(seed, w) {
  const pts = [];
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const j = i === 0 || i === N ? 0 : (rnd() - 0.5) * 1.1;
    pts.push(new THREE.Vector3(j, f * BOLT_H, (rnd() - 0.5) * 0.5 * (i === 0 || i === N ? 0 : 1)));
  }
  const parts = [];
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(w, len + w * 0.5, w);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g.toNonIndexed());
  }
  const pos = [];
  for (const p of parts) pos.push(...p.attributes.position.array);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

function makePuddleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  // lumpy goo blob: overlapping circles, glossy rim + bubbles
  const blob = (fill) => {
    g.fillStyle = fill;
    g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.3, d = 40 + (i % 3) * 6;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 13 + (i % 4) * 3, 0, Math.PI * 2); g.fill();
    }
  };
  blob('rgba(60,140,40,0.95)');
  g.scale(0.84, 0.84); blob('rgba(126,236,88,0.95)'); g.setTransform(1, 0, 0, 1, 64, 64);
  g.fillStyle = 'rgba(220,255,190,0.85)';
  [[-18, -14, 7], [14, 10, 5], [-6, 20, 4], [22, -16, 3.5], [2, -2, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BossEffects {
  constructor(game) {
    this.game = game;
    this.orbs = []; this.bolts = []; this.rings = []; this.glows = []; this.puddles = []; this.crests = [];
    this.beam = null;
    if (!boltGeos) boltGeos = [1, 2, 3, 4].map((k) => [boltGeometry(k, 0.42), boltGeometry(k, 0.13)]);
    puddleTex = puddleTex || makePuddleTexture();
  }

  pool(list, make) {
    let o = list.find((e) => !e.active);
    if (!o) { o = make(); list.push(o); }
    o.active = true; o.t = 0;
    return o;
  }

  addTo(obj) { if (obj.parent !== this.game.scene) this.game.scene.add(obj); obj.visible = true; }

  // ---------------- orbs ----------------
  /** Glowing orb flying from (x0,y0,z0) to (x1,0,z1) in `time` s with a parabolic arc of height `arc`. */
  orb(x0, y0, z0, x1, z1, time, opts = {}) {
    const o = this.pool(this.orbs, () => {
      const core = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...SOFT, opacity: 0.75 }));
      const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...ADD }));
      return { core, halo, tail };
    });
    Object.assign(o, { x0, y0, z0, x1, z1, time: Math.max(0.05, time), arc: opts.arc ?? 4, size: opts.size ?? 0.55, x: x0, y: y0, z: z0, px: x0, py: y0, pz: z0 });
    o.core.material.color.set(opts.core || opts.color || '#ffffff');
    o.halo.material.color.set(opts.color || '#7fe9ff');
    o.tail.material.color.set(opts.color || '#7fe9ff');
    this.addTo(o.core); this.addTo(o.halo); this.addTo(o.tail);
    return o;
  }

  // ---------------- lightning ----------------
  /** Vertical lightning bolt striking (x, z) from `height`. Lives `life` s, flickering. */
  bolt(x, z, height = 16, opts = {}) {
    const o = this.pool(this.bolts, () => {
      const glow = new THREE.Mesh(boltGeos[0][0], new THREE.MeshBasicMaterial({ ...SOFT, opacity: 0.6 }));
      const core = new THREE.Mesh(boltGeos[0][1], new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      const g = new THREE.Group(); g.add(glow, core);
      return { g, glow, core };
    });
    const v = (Math.random() * 4) | 0;
    o.glow.geometry = boltGeos[v][0]; o.core.geometry = boltGeos[v][1];
    o.glow.material.color.set(opts.color || '#fff27a');
    Object.assign(o, { x, z, height, life: opts.life ?? 0.32, w: opts.width ?? 1, ry: Math.random() * Math.PI, y0: opts.y0 ?? 0 });
    this.addTo(o.g);
    this.glow(x, 0.3, z, opts.color || '#fff27a', 3.2 * o.w, 0.35);
    return o;
  }

  // ---------------- rings / glows ----------------
  ring(x, z, r, opts = {}) {
    const o = this.pool(this.rings, () => ({ mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })) }));
    o.mesh.material.color.set(opts.color || '#fff4dc');
    o.mesh.renderOrder = 3;
    Object.assign(o, { x, z, r, life: opts.life ?? 0.42, y: opts.y ?? 0.08 });
    this.addTo(o.mesh);
    return o;
  }

  glow(x, y, z, color, size, life = 0.4) {
    const o = this.pool(this.glows, () => ({ s: new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), ...ADD })) }));
    o.s.material.color.set(color);
    Object.assign(o, { x, y, z, size, life });
    this.addTo(o.s);
    return o;
  }

  // ---------------- goo puddles (slow zones) ----------------
  puddle(x, z, r, life) {
    const o = this.pool(this.puddles, () => {
      const mesh = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: puddleTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      const rim = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#c8ff7a', transparent: true, depthWrite: false, toneMapped: false }));
      mesh.renderOrder = 1; rim.renderOrder = 2;
      return { mesh, rim };
    });
    Object.assign(o, { x, z, r, life, spin: Math.random() * 6 });
    this.addTo(o.mesh); this.addTo(o.rim);
    return o;
  }

  /** Slow factor at (x, z): 1 = free, < 1 inside a live puddle. */
  slowAt(x, z) {
    for (const p of this.puddles) {
      if (!p.active || p.t < 0.15 || p.t > p.life - 0.3) continue;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r * 0.85) return 0.32;
    }
    return 1;
  }

  // ---------------- quake crest (ironhorn stomp) ----------------
  crest(x, halfW, z0, z1, time, color = '#ff9a3a') {
    const o = this.pool(this.crests, () => ({ mesh: new THREE.Mesh(crestGeo, new THREE.MeshBasicMaterial({ ...SOFT, opacity: 0.85 })) }));
    o.mesh.material.color.set(color);
    Object.assign(o, { x, halfW, z0, z1, time, z: z0 });
    this.addTo(o.mesh);
    return o;
  }

  // ---------------- laser sheet (oculon) ----------------
  /** A light sheet from an apex (the eye) down onto the ground line x = bx, z in [zFar, zNear]. */
  laser() {
    if (!this.beam) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 2), 3));
      const sheet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ ...SOFT, color: '#ff4a6a', opacity: 0.4, side: THREE.DoubleSide }));
      sheet.frustumCulled = false;
      const line = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ ...SOFT, color: '#fff2f4' }));
      const burn = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ ...SOFT, color: '#ff2a4a', opacity: 0.6 }));
      line.renderOrder = burn.renderOrder = 4;
      this.beam = { sheet, line, burn, on: false, ax: 0, ay: 0, az: 0, bx: 0, zFar: 0, zNear: 0, w: 0.5, k: 0 };
    }
    return this.beam;
  }

  beamOn(color) {
    const b = this.laser();
    b.on = true; b.k = 0;
    b.sheet.material.color.set(color || '#ff4a6a');
    b.burn.material.color.set(color || '#ff2a4a');
    this.addTo(b.sheet); this.addTo(b.line); this.addTo(b.burn);
    return b;
  }

  beamOff(now = false) { if (this.beam) { this.beam.on = false; if (now) this.beam.k = 0; } }

  // ---------------- lifecycle ----------------
  update(dt) {
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.t += dt;
      o.px = o.x; o.py = o.y; o.pz = o.z;
      const f = Math.min(1, o.t / o.time);
      o.x = o.x0 + (o.x1 - o.x0) * f;
      o.z = o.z0 + (o.z1 - o.z0) * f;
      o.y = o.y0 * (1 - f) + Math.sin(f * Math.PI) * o.arc + o.size * 0.5 * f;
      if (f >= 1) o.active = false;
    }
    const tick = (list) => { for (const o of list) if (o.active && (o.t += dt) >= o.life) o.active = false; };
    tick(this.bolts); tick(this.rings); tick(this.glows); tick(this.puddles);
    for (const o of this.crests) {
      if (!o.active) continue;
      o.t += dt;
      const f = Math.min(1, o.t / o.time);
      o.z = o.z0 + (o.z1 - o.z0) * f;
      if (f >= 1) o.active = false;
    }
    if (this.beam && this.beam.on) this.beam.k = Math.min(1, this.beam.k + dt * 8);
    else if (this.beam) this.beam.k = Math.max(0, this.beam.k - dt * 6);
  }

  sync() {
    const time = this.game.time;
    for (const o of this.orbs) {
      o.core.visible = o.halo.visible = o.tail.visible = o.active;
      if (!o.active) continue;
      const pulse = 1 + Math.sin(time * 30 + o.x0) * 0.12;
      o.core.position.set(o.x, o.y, o.z); o.core.scale.setScalar(o.size * 0.7);
      o.halo.position.set(o.x, o.y, o.z); o.halo.scale.setScalar(o.size * 3.2 * pulse);
      o.tail.position.set(o.x + (o.px - o.x) * 3, o.y + (o.py - o.y) * 3, o.z + (o.pz - o.z) * 3);
      o.tail.scale.setScalar(o.size * 2.2);
      o.tail.material.opacity = 0.6;
    }
    for (const o of this.bolts) {
      o.g.visible = o.active;
      if (!o.active) continue;
      const f = o.t / o.life;
      const flick = (Math.sin(time * 90 + o.ry * 10) > -0.3 ? 1 : 0.35) * (1 - f * f);
      o.g.position.set(o.x, o.y0, o.z);
      o.g.scale.set(o.w * (1 + f * 0.6), o.height / BOLT_H, o.w * (1 + f * 0.6));
      o.g.rotation.y = o.ry;
      o.glow.material.opacity = 0.75 * flick;
      o.core.material.opacity = flick;
    }
    for (const o of this.rings) {
      o.mesh.visible = o.active;
      if (!o.active) continue;
      const f = o.t / o.life;
      o.mesh.position.set(o.x, o.y, o.z);
      o.mesh.scale.setScalar(o.r * (0.3 + 0.7 * (1 - (1 - f) * (1 - f))));
      o.mesh.material.opacity = 0.9 * (1 - f);
    }
    for (const o of this.glows) {
      o.s.visible = o.active;
      if (!o.active) continue;
      const f = o.t / o.life;
      o.s.position.set(o.x, o.y, o.z);
      o.s.scale.setScalar(o.size * (0.6 + 0.6 * f));
      o.s.material.opacity = 1 - f;
    }
    for (const o of this.puddles) {
      o.mesh.visible = o.rim.visible = o.active;
      if (!o.active) continue;
      const grow = Math.min(1, o.t / 0.25), fade = Math.min(1, (o.life - o.t) / 0.4);
      const wob = 1 + Math.sin(time * 3 + o.spin) * 0.03;
      o.mesh.position.set(o.x, 0.05, o.z);
      o.mesh.scale.set(o.r * grow * wob, 1, o.r * grow / wob);
      o.mesh.rotation.y = o.spin + time * 0.2;
      o.mesh.material.opacity = 0.92 * fade;
      o.rim.position.set(o.x, 0.07, o.z);
      o.rim.scale.setScalar(o.r * grow * (1.02 + Math.sin(time * 6) * 0.03));
      o.rim.material.opacity = (0.35 + 0.25 * Math.sin(time * 6 + o.spin)) * fade;
    }
    for (const o of this.crests) {
      o.mesh.visible = o.active;
      if (!o.active) continue;
      const f = o.t / o.time;
      o.mesh.position.set(o.x, 0, o.z);
      o.mesh.scale.set(o.halfW, 0.9 + Math.sin(time * 40) * 0.1, 1.2);
      o.mesh.material.opacity = 0.85 * (1 - f * 0.6);
    }
    const b = this.beam;
    if (b) {
      const vis = b.k > 0.01;
      b.sheet.visible = b.line.visible = b.burn.visible = vis;
      if (vis) {
        const p = b.sheet.geometry.attributes.position;
        const hw = 0.5;
        // two triangles: apex -> far..near ground line (slightly widened so it never reads as a hairline)
        p.setXYZ(0, b.ax, b.ay, b.az); p.setXYZ(1, b.bx - hw, 0.05, b.zFar); p.setXYZ(2, b.bx + hw, 0.05, b.zNear);
        p.setXYZ(3, b.ax, b.ay, b.az); p.setXYZ(4, b.bx + hw, 0.05, b.zFar); p.setXYZ(5, b.bx - hw, 0.05, b.zNear);
        p.needsUpdate = true;
        b.sheet.material.opacity = 0.6 * b.k * (0.85 + 0.15 * Math.sin(time * 50));
        const len = b.zNear - b.zFar;
        b.line.position.set(b.bx, 0.1, (b.zNear + b.zFar) / 2); b.line.scale.set(b.w * 0.75, 1, len);
        b.burn.position.set(b.bx, 0.09, (b.zNear + b.zFar) / 2); b.burn.scale.set(b.w * 2.8, 1, len + 0.6);
        b.line.material.opacity = b.k; b.burn.material.opacity = 0.9 * b.k;
      }
    }
  }

  /** Stops everything (between fights / on dispose). */
  clear() {
    const all = [this.orbs, this.bolts, this.rings, this.glows, this.puddles, this.crests];
    for (const list of all) for (const o of list) o.active = false;
    if (this.beam) { this.beam.on = false; this.beam.k = 0; }
    this.sync();
    const scene = this.game.scene;
    for (const o of this.orbs) { scene.remove(o.core); scene.remove(o.halo); scene.remove(o.tail); }
    for (const o of this.bolts) scene.remove(o.g);
    for (const o of this.rings) scene.remove(o.mesh);
    for (const o of this.glows) scene.remove(o.s);
    for (const o of this.puddles) { scene.remove(o.mesh); scene.remove(o.rim); }
    for (const o of this.crests) scene.remove(o.mesh);
    if (this.beam) { scene.remove(this.beam.sheet); scene.remove(this.beam.line); scene.remove(this.beam.burn); }
  }
}
