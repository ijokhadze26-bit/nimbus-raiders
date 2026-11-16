// Glacius' attack props (pooled with the cached model, logic in update so kills stay deterministic):
//   frozen lanes  ice sheet + spike clusters; members inside freeze and die a few per second, the leader is
//                 slowed inside and cannot walk back in (Glacius.update applies that)
//   ice walls     crystal slabs in front of the squad: a bullet target system (kind 'icewall') that soaks shots
//                 until shot apart (hp) or melted (life); the boss behind them takes no damage through them
//   icicles       long ice spikes falling onto telegraph circles
// Low quality: no spikes on frozen lanes, fewer shards.
import * as THREE from 'three';
import { HIT } from '../../config.js';
import { Bullets } from '../bullets.js';
import { toonMaterial } from '../../models/materials.js';
import { iceWallGeometry, icicleGeometry, frostSpikeGeometry } from '../../models/bosses/glacius.js';

const SPIKES = 14, WAVE = 22, WAVE_LOW = 8, WALL_RISE = 0.18, WALL_SINK = 0.4, ICICLE_FALL = 0.42, ICICLE_STAY = 0.7;
const sheetGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

let frostTex = null;
function frostTexture() {
  if (frostTex) return frostTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(64,150,255,0.62)';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(150,215,255,0.5)';
  for (let i = 0; i < 6; i++) g.fillRect(0, i * 22 + 4, 128, 9);
  // frost cracks
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.2;
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 9; k++) {
    let x = rnd() * 128, y = rnd() * 128;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 5; i++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(235,250,255,0.8)';
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
  frostTex = new THREE.CanvasTexture(c);
  frostTex.colorSpace = THREE.SRGBColorSpace;
  frostTex.wrapS = frostTex.wrapT = THREE.RepeatWrapping;
  return frostTex;
}

/** Pools live on the cached model (m.frost) so meshes are built once per game. */
export function frostPools(m) {
  if (!m.frost) {
    m.frost = { lanes: [], walls: [], icicles: [], waves: [], iceMat: toonMaterial({ emissive: new THREE.Color('#2a5f94') }) };
  }
  return m.frost;
}

export class FrostFx {
  constructor(boss, pools) {
    this.boss = boss;
    this.game = boss.game;
    this.p = pools;
    for (const list of [pools.lanes, pools.walls, pools.icicles, pools.waves]) for (const o of list) o.active = false;
    // ice walls catch bullets aimed past them at the boss
    this.kind = 'icewall';
    this.bit = HIT.BOSS;
    this.priority = 9.5;
    this.offTarget = this.game.bullets.addTargetSystem(this);
  }

  get low() { return this.game.engine && this.game.engine.quality === 'low'; }
  get lanes() { return this.p.lanes; }
  get walls() { return this.p.walls; }

  addMesh(o) { if (o.parent !== this.game.scene) this.game.scene.add(o); }

  // ---------------- frozen lanes ----------------
  freezeLane(x0, x1, zNear, zFar, life) {
    let L = this.p.lanes.find((o) => !o.active);
    if (!L) {
      const tex = frostTexture().clone();
      tex.needsUpdate = true;
      const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      sheet.renderOrder = 1;
      const spikes = new THREE.InstancedMesh(frostSpikeGeometry(), this.p.iceMat, SPIKES);
      spikes.frustumCulled = false;
      // deep-blue rims along both lane edges (the sheet alone vanishes on the snowy road)
      const rimMat = new THREE.MeshBasicMaterial({ color: '#1f6fe0', transparent: true, depthWrite: false, toneMapped: false });
      const rimA = new THREE.Mesh(sheetGeo, rimMat), rimB = new THREE.Mesh(sheetGeo, rimMat);
      rimA.renderOrder = rimB.renderOrder = 2;
      L = { sheet, tex, spikes, rimA, rimB, rimMat, seed: this.p.lanes.length * 13 + 5 };
      this.p.lanes.push(L);
    }
    Object.assign(L, { active: true, x0, x1, zNear, zFar, t: 0, life, budget: 0 });
    this.addMesh(L.sheet); this.addMesh(L.spikes); this.addMesh(L.rimA); this.addMesh(L.rimB);
    return L;
  }

  /** True while (x, z) is inside a live frozen lane (pad widens it). */
  frozenAt(x, z, pad = 0) {
    for (const L of this.p.lanes) if (L.active && L.t < L.life && x > L.x0 - pad && x < L.x1 + pad && z > L.zFar && z < L.zNear) return L;
    return null;
  }

  // ---------------- ice walls ----------------
  wall(x, hw, z, hp, life) {
    let W = this.p.walls.find((o) => !o.active);
    if (!W) {
      const mesh = new THREE.Mesh(iceWallGeometry(), this.p.iceMat.clone());
      mesh.castShadow = true;
      W = { mesh, target: { z: 0, wall: null } };
      W.target.wall = W;
      this.p.walls.push(W);
    }
    Object.assign(W, { active: true, x, hw, z, hp, maxHp: hp, t: 0, life, flash: 0, broken: false, end: -1 });
    W.mesh.material.emissive.set('#2a5f94');
    this.addMesh(W.mesh);
    return W;
  }

  sweep(b, x, z0, z1) {
    let best = null;
    for (const W of this.p.walls) {
      if (!W.active || W.end >= 0) continue;
      const front = W.z + 0.3;
      if (front > z0 || front < z1 || Math.abs(x - W.x) > W.hw) continue;
      if (Bullets.hasHit(b, W.target)) continue;
      if (!best || front > best.z) { best = W.target; best.z = front; }
    }
    return best;
  }

  hit(t, b) {
    const W = t.wall;
    W.hp -= b.dmg || 0;
    W.flash = 1;
    if (W.hp <= 0) this.breakWall(W);
    return true;
  }

  breakWall(W) {
    if (W.end >= 0) return;
    W.end = W.t; W.broken = true;
    const g = this.game, n = this.low ? 8 : 18;
    g.gates.burst(W.x, 1.4, W.z, W.hw * 1.6, 2.2, '#d8f4ff', n);
    this.boss.effects.ring(W.x, W.z, W.hw * 1.6, { color: '#cfefff', life: 0.35 });
    g.events.emit('boss:attack', { attack: 'iceBreak', pos: { x: W.x, y: 0, z: W.z } });
  }

  // ---------------- icicles ----------------
  icicle(x, z, size) {
    let I = this.p.icicles.find((o) => !o.active);
    if (!I) {
      const mesh = new THREE.Mesh(icicleGeometry(), this.p.iceMat);
      mesh.castShadow = true;
      I = { mesh };
      this.p.icicles.push(I);
    }
    Object.assign(I, { active: true, x, z, t: 0, size, y: 16, landed: false, spin: (x * 3.1 + z) % 6 });
    this.addMesh(I.mesh);
    return I;
  }

  // ---------------- spike wave (ground pound crest) ----------------
  /** Ice spikes burst out of the road along a lane, far to near, over `travel` s. */
  spikeWave(x, hw, zFar, zNear, travel) {
    let V = this.p.waves.find((o) => !o.active);
    if (!V) {
      const mesh = new THREE.InstancedMesh(frostSpikeGeometry(), this.p.iceMat, WAVE);
      mesh.frustumCulled = false;
      V = { mesh, seed: this.p.waves.length * 7 + 3 };
      this.p.waves.push(V);
    }
    Object.assign(V, { active: true, x, hw, zFar, zNear, travel, t: 0 });
    this.addMesh(V.mesh);
    return V;
  }

  // ---------------- logic ----------------
  update(dt) {
    for (const L of this.p.lanes) if (L.active && (L.t += dt) >= L.life + 0.45) L.active = false;
    for (const W of this.p.walls) {
      if (!W.active) continue;
      W.t += dt;
      W.flash = Math.max(0, W.flash - dt * 8);
      if (W.end < 0 && W.t >= W.life) W.end = W.t; // melts away
      if (W.end >= 0 && W.t - W.end >= (W.broken ? 0.05 : WALL_SINK)) W.active = false;
    }
    for (const V of this.p.waves) if (V.active && (V.t += dt) >= V.travel + 0.9) V.active = false;
    for (const I of this.p.icicles) {
      if (!I.active) continue;
      I.t += dt;
      const f = Math.min(1, I.t / ICICLE_FALL);
      I.y = 16 * (1 - f * f);
      if (I.t >= ICICLE_FALL + ICICLE_STAY) I.active = false;
    }
  }

  // ---------------- visuals ----------------
  sync(time) {
    const low = this.low;
    for (const L of this.p.lanes) {
      L.sheet.visible = L.spikes.visible = L.rimA.visible = L.rimB.visible = L.active;
      if (!L.active) continue;
      const w = L.x1 - L.x0, len = L.zNear - L.zFar;
      const grow = Math.min(1, L.t / 0.18), fade = Math.max(0, Math.min(1, (L.life + 0.45 - L.t) / 0.45));
      L.sheet.position.set((L.x0 + L.x1) / 2, 0.05, (L.zNear + L.zFar) / 2);
      L.sheet.scale.set(w * (0.6 + 0.4 * grow), 1, len * grow);
      L.tex.repeat.set(w / 2.4, len / 2.4);
      L.sheet.material.opacity = 0.95 * fade;
      const cz = (L.zNear + L.zFar) / 2;
      L.rimA.position.set(L.x0 + 0.09, 0.06, cz); L.rimB.position.set(L.x1 - 0.09, 0.06, cz);
      L.rimA.scale.set(0.18, 1, len * grow); L.rimB.scale.set(0.18, 1, len * grow);
      L.rimMat.opacity = 0.9 * fade;
      // spikes: rise fast, shrink as the lane thaws (Low: none)
      const n = low ? 0 : SPIKES;
      L.spikes.count = n;
      const rise = Math.min(1, L.t / 0.22) * fade;
      for (let i = 0; i < n; i++) {
        const h1 = Math.sin(L.seed + i * 12.9898) * 43758.5453, r1 = h1 - Math.floor(h1);
        const h2 = Math.sin(L.seed + i * 78.233) * 12543.123, r2 = h2 - Math.floor(h2);
        const edge = i % 3 !== 2; // most spikes line the lane edges
        const x = edge ? (i % 2 ? L.x0 + 0.25 : L.x1 - 0.25) + (r1 - 0.5) * 0.3 : L.x0 + 0.4 + r1 * (w - 0.8);
        const z = L.zFar + 0.5 + r2 * (len - 1);
        const s = (1.1 + r1 * 1.0) * rise;
        _e.set(0, r2 * 6, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(x, 0, z), _q, _s.set(s, s * (1 + r2 * 0.6), s));
        L.spikes.setMatrixAt(i, _m);
      }
      L.spikes.instanceMatrix.needsUpdate = true;
    }
    for (const W of this.p.walls) {
      W.mesh.visible = W.active;
      if (!W.active) continue;
      const rise = Math.min(1, W.t / WALL_RISE);
      const sink = W.end >= 0 ? Math.min(1, (W.t - W.end) / WALL_SINK) : 0;
      const shake = W.flash * 0.06 * Math.sin(time * 70);
      W.mesh.position.set(W.x + shake, -3.4 * (1 - rise) - 3.4 * sink * sink, W.z);
      W.mesh.scale.set(W.hw * 2, 1 + (1 - rise) * 0.25, 1.3);
      // cracks show as the wall weakens: emissive warms from cold blue to white on hits
      const dmg = 1 - Math.max(0, W.hp) / W.maxHp;
      W.mesh.material.emissive.setRGB(0.04 + W.flash * 0.5 + dmg * 0.2, 0.12 + W.flash * 0.45 + dmg * 0.22, 0.28 + W.flash * 0.35 + dmg * 0.1);
    }
    for (const V of this.p.waves) {
      V.mesh.visible = V.active;
      if (!V.active) continue;
      const n = low ? WAVE_LOW : WAVE, len = V.zNear - V.zFar;
      V.mesh.count = n;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, h1 = Math.sin(V.seed + i * 12.9898) * 43758.5453, r1 = h1 - Math.floor(h1);
        const lt = V.t - V.travel * f; // time since the crest passed this spot
        const s = lt <= 0 ? 0 : Math.min(1, lt / 0.09) * Math.max(0, Math.min(1, (0.75 - lt) / 0.3));
        const k = s * (1.5 + r1 * 1.1) * (V.hw / 1.4);
        _e.set(0, r1 * 6, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(V.x + (r1 - 0.5) * V.hw * 1.3, 0, V.zFar + f * len), _q, _s.set(k, k * 1.3, k));
        V.mesh.setMatrixAt(i, _m);
      }
      V.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const I of this.p.icicles) {
      I.mesh.visible = I.active;
      if (!I.active) continue;
      const out = I.t > ICICLE_FALL ? (I.t - ICICLE_FALL) / ICICLE_STAY : 0;
      I.mesh.position.set(I.x, I.y - out * out * 1.6, I.z);
      I.mesh.rotation.set(0, I.spin, 0);
      I.mesh.scale.setScalar(I.size * (1 - out * 0.3));
    }
  }

  clear() {
    const scene = this.game.scene;
    for (const L of this.p.lanes) { L.active = false; scene.remove(L.sheet); scene.remove(L.spikes); scene.remove(L.rimA); scene.remove(L.rimB); }
    for (const W of this.p.walls) { W.active = false; scene.remove(W.mesh); }
    for (const I of this.p.icicles) { I.active = false; scene.remove(I.mesh); }
    for (const V of this.p.waves) { V.active = false; scene.remove(V.mesh); }
  }

  dispose() { this.offTarget(); this.clear(); }
}
