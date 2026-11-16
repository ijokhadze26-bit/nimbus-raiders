// Horde rendering: one InstancedMesh per Murkling type (toon + per-instance flash/ice/glow/burn attribute),
// Shieldbearer shields, Fizzbomb fuse sparks, instanced blob shadows and bomber blast puffs.
// Update 3: the stage-3 types (Boomling swell, Mendling / Hive / Spitling glow pulses, Flapling altitude +
// wing flap), per-enemy size, turned shields, the elite gold rim (aElite) and the extras in hordefx.js.
import * as THREE from 'three';
import { ENEMY_TYPES, ENEMIES } from '../data/enemies.js';
import { buildMurklingGeometry, buildShieldGeometry, buildSparkGeometry, murklingBodyColor } from '../models/murklings.js';
import { blobShadowTexture } from '../models/materials.js';
import { XF, writeXfYawRoll, writeXfYaw, markInstances } from '../core/pool.js';
import { part, merge, G } from '../models/util.js';
import { murklingMaterial, NEW_GLOW } from '../models/murklings2.js';
import { HordeFx } from './hordefx.js';

const DIE_TIME = 0.17;
// bomber chain puffs: few, see-through and quick, so a chain never hides the gate row or the squad
const MAX_BLASTS = 8;
const ANIM = {
  grunt: { f: 9, hop: 0.13, sq: 0.09, roll: 0.13 },
  runner: { f: 15, hop: 0.1, sq: 0.07, roll: 0.1 },
  tank: { f: 5.5, hop: 0.05, sq: 0.05, roll: 0.07 },
  shield: { f: 8, hop: 0.09, sq: 0.07, roll: 0.08 },
  bomber: { f: 10, hop: 0.15, sq: 0.1, roll: 0.15 },
  blaster: { f: 11, hop: 0.12, sq: 0.11, roll: 0.12 },
  healer: { f: 6, hop: 0.08, sq: 0.08, roll: 0.06 },
  spawner: { f: 3.5, hop: 0.02, sq: 0.07, roll: 0.04 },
  sniper: { f: 8, hop: 0.09, sq: 0.06, roll: 0.08 },
  flyer: { f: 16, hop: 0.12, sq: 0.05, roll: 0.14 },
};
const GLOW = { bomber: '#ff6a3a', tank: '#ff2a3a', ...NEW_GLOW };
const ANIMS = ENEMY_TYPES.map((t) => ANIM[t]);
const _c = new THREE.Color();

export class HordeView {
  constructor(game, cap) {
    this.game = game;
    this.cap = cap;
    const scene = game.scene;
    this.meshes = ENEMY_TYPES.map((t) => {
      const geo = buildMurklingGeometry(t);
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      fx.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFx', fx);
      const el = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      el.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aElite', el);
      const mat = murklingMaterial(GLOW[t] || '#ffffff');
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return { mesh, fx, el, n: 0, anyElite: false };
    });
    this.extras = new HordeFx(game);
    this.shields = new THREE.InstancedMesh(buildShieldGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false }), 320);
    this.shields.frustumCulled = false; this.shields.count = 0; this.shields.renderOrder = 4;
    this.shields.setColorAt(0, _c.set(1, 1, 1));
    this.sparks = new THREE.InstancedMesh(buildSparkGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), 320);
    this.sparks.frustumCulled = false; this.sparks.count = 0;
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#2a3f7a', alphaMap: blobShadowTexture(), transparent: true, opacity: 0.32, depthWrite: false }), cap);
    this.blobs.frustumCulled = false; this.blobs.count = 0; this.blobs.renderOrder = 1;
    this.blastGeo = merge([
      part(G.sphere(1, 12, 8), '#ffb03a', { a: 0.3 }),
      part(G.sphere(0.62, 10, 7), '#fff2b0', { a: 0.55 }),
    ]);
    this.blastMesh = new THREE.InstancedMesh(this.blastGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false }), MAX_BLASTS);
    this.blastMesh.frustumCulled = false; this.blastMesh.count = 0; this.blastMesh.renderOrder = 7;
    scene.add(this.shields, this.sparks, this.blobs, this.blastMesh);
    this.blastData = [];
    this.skin = 'sky';
    this.skinCache = new Map(); // 'type:skin' -> Float32Array vertex colours
    this.bodyColors = ENEMY_TYPES.map((t) => murklingBodyColor(t));
  }

  reset() {
    this.blastData.length = 0;
    const run = this.game.run;
    this.setSkin((run && run.world) || 'sky');
    const th = this.game.world && this.game.world.theme;
    this.blobs.material.color.set((th && th.blob) || '#2a3f7a');
  }

  /**
   * World skin (update 3): swaps the vertex colours of the existing per-type geometries in place (same parts,
   * same vertex count, so no new mesh, material or shader program). Arrays are cached per type + skin.
   */
  setSkin(skin) {
    if (skin === this.skin) return;
    this.skin = skin;
    ENEMY_TYPES.forEach((t, i) => {
      const key = t + ':' + skin;
      let arr = this.skinCache.get(key);
      if (!arr) {
        const g = buildMurklingGeometry(t, skin);
        arr = g.attributes.color.array;
        g.dispose();
        this.skinCache.set(key, arr);
      }
      const col = this.meshes[i].mesh.geometry.attributes.color;
      if (col.array.length === arr.length) { col.array.set(arr); col.needsUpdate = true; }
      this.bodyColors[i] = murklingBodyColor(t, skin);
    });
  }

  blast(x, z, r) {
    if (this.blastData.length >= MAX_BLASTS) this.blastData.shift();
    this.blastData.push({ x, z, r, t: 0 });
  }

  shatterShield(e) {
    const gates = this.game.gates;
    if (gates && gates.burst) gates.burst(e.x, 0.5, e.z + 0.5, 1.1, 0.8, '#4de1ff', 10);
  }

  sync(dt, list, time, frozen, h) {
    const ms = this.meshes;
    for (const m of ms) { m.n = 0; m.anyElite = false; }
    let ns = 0, nk = 0, nb = 0;
    const sArr = this.shields.instanceMatrix.array, kArr = this.sparks.instanceMatrix.array, bArr = this.blobs.instanceMatrix.array;
    const fd = Math.min(1, dt * 12);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const vm = ms[e.type];
      if (vm.n >= this.cap) continue;
      const a = ANIMS[e.type];
      const d = e.def;
      let sx = 1, sy = 1, sz = 1, y = 0, roll = 0, yaw = 0, flash = e.flash;
      if (e.state === 1) {
        const f = Math.min(1, e.t / DIE_TIME);
        const s = f < 0.45 ? 1 + f * 0.9 : Math.max(0.01, 1.4 * (1 - (f - 0.45) / 0.55));
        sx = sz = s * 1.12; sy = s * (f < 0.45 ? 0.82 : 1);
        flash = 1;
      } else if (e.state === 2) { // Boomling swell: puffs up, trembles and blinks before the burst
        const f = e.sw;
        sx = sz = 1 + f * 0.8; sy = (1 + f * 0.7) * (1 - 0.06 * Math.sin(time * 50));
        roll = Math.sin(time * 60 + e.ph) * 0.08 * f;
        flash = 0.2 + 0.65 * f * (0.5 + 0.5 * Math.sin(time * 42));
      } else {
        const speed = e.charging && !frozen ? 1 : 0.45;
        const ph = time * a.f * speed + e.ph;
        const hop = Math.abs(Math.sin(ph));
        y = frozen ? 0 : hop * a.hop * (e.charging ? 1 : 0.6);
        const squash = frozen ? 0 : Math.cos(ph * 2) * a.sq;
        sy = 1 + squash; sx = sz = 1 - squash * 0.6;
        roll = frozen ? 0 : Math.sin(ph) * a.roll;
        yaw = e.turn && e.charging ? e.yaw : Math.max(-0.5, Math.min(0.5, e.vx * 0.18)) + (e.charging ? 0 : Math.sin(time * 0.9 + e.ph * 3) * 0.35);
        e.flash = Math.max(0, e.flash - fd);
        if (d.fly && !still0(frozen, e)) { const fl = Math.sin(time * 22 + e.ph); sx *= 1 + 0.2 * fl; sy *= 1 - 0.06 * fl; y += Math.sin(time * 3 + e.ph) * 0.12; }
      }
      const still = frozen || e.freezeT > 0;
      if (still && e.state === 0) { y = 0; roll = 0; sy = 1; sx = sz = 1; }
      const sz0 = e.size || 1;
      if (sz0 !== 1) { sx *= sz0; sy *= sz0; sz *= sz0; }
      if (e.y) y += e.y;
      XF[0] = e.x; XF[1] = y; XF[2] = e.z; XF[3] = yaw; XF[4] = roll; XF[5] = sx; XF[6] = sy; XF[7] = sz;
      writeXfYawRoll(vm.mesh.instanceMatrix.array, vm.n);
      if (e.px || e.pz) lean(vm.mesh.instanceMatrix.array, vm.n, e.px, e.pz, e.x, e.z);
      const fo = vm.n * 4;
      const fx = vm.fx.array;
      fx[fo] = flash * 0.7;
      fx[fo + 1] = frozen ? 1 : e.ice;
      fx[fo + 2] = d.boom ? (e.state === 2 ? 0.5 + 0.5 * e.sw : 0.12 + 0.14 * Math.sin(time * 9 + e.ph))
        : d.blastRadius ? 0.25 + 0.25 * Math.sin(time * 11 + e.ph)
          : d.heal || d.brood || d.spit ? e.glow * 0.75 : (d.contactKills ? e.ckills * 0.2 : 0);
      vm.el.array[vm.n] = e.elite ? 0.8 + 0.2 * Math.sin(time * 6 + e.ph) : 0;
      if (e.elite) vm.anyElite = true;
      fx[fo + 3] = e.burn > 0 ? Math.min(1, 0.35 + e.burn * 1.5) * (0.8 + 0.2 * Math.sin(time * 17 + e.ph)) : 0;
      vm.n++;
      // blob shadow
      if (nb < this.cap) {
        const bs = d.r * 2.5 * sz0 * (e.state === 1 ? Math.max(0, 1 - e.t / DIE_TIME) : e.y ? Math.max(0.35, 1 - e.y * 0.28) : 1 - y * 0.8);
        XF[0] = e.x; XF[1] = 0.02; XF[2] = e.z + 0.05; XF[3] = 0; XF[5] = bs; XF[6] = 1; XF[7] = bs * 0.85;
        writeXfYaw(bArr, nb++);
      }
      if (e.state !== 0) continue;
      if (e.shield > 0 && ns < 320) {
        const hurt = 1 - e.shield / d.shieldHits;
        const p = 1 + e.sflash * 0.12;
        XF[0] = e.x; XF[1] = y; XF[2] = e.z; XF[3] = yaw; XF[4] = roll * 0.6; XF[5] = sx * p; XF[6] = sy * p; XF[7] = sz;
        writeXfYawRoll(sArr, ns);
        const fl = e.sflash;
        _c.setRGB(1 + hurt * 0.5 + fl * 0.9, 1 - hurt * 0.35 + fl * 0.9, 1 - hurt * 0.1 + fl * 0.9);
        if (hurt > 0.5 && Math.sin(time * 40 + e.ph) > 0.4) _c.multiplyScalar(0.6);
        this.shields.setColorAt(ns, _c);
        ns++;
        e.sflash = Math.max(0, e.sflash - fd);
      }
      if (d.blastRadius && nk < 320) {
        const fl = 0.75 + 0.5 * Math.abs(Math.sin(time * 31 + e.ph * 5));
        XF[0] = e.x + Math.sin(roll) * -1.1 + 0.06; XF[1] = y + 1.12 * sy; XF[2] = e.z + 0.03; XF[3] = time * 7 + e.ph; XF[5] = XF[6] = XF[7] = fl;
        writeXfYaw(kArr, nk++);
      }
    }
    for (const m of ms) {
      m.mesh.count = m.n;
      if (m.n) { markInstances(m.mesh.instanceMatrix, m.n); markInstances(m.fx, m.n); }
      if (m.n && m.anyElite) markInstances(m.el, m.n);
      else if (m.elDirty) { m.el.array.fill(0, 0, m.n); if (m.n) markInstances(m.el, m.n); }
      m.elDirty = m.anyElite; m.anyElite = false;
    }
    if (h) this.extras.sync(dt, list, time, h);
    this.shields.count = ns;
    if (ns) { markInstances(this.shields.instanceMatrix, ns); markInstances(this.shields.instanceColor, ns); }
    this.sparks.count = nk; if (nk) markInstances(this.sparks.instanceMatrix, nk);
    this.blobs.count = nb; if (nb) markInstances(this.blobs.instanceMatrix, nb);
    // blasts
    const bd = this.blastData;
    let nx = 0;
    const xArr = this.blastMesh.instanceMatrix.array;
    for (let i = bd.length - 1; i >= 0; i--) {
      const b = bd[i];
      b.t += dt;
      const f = b.t / 0.32;
      if (f >= 1) { bd.splice(i, 1); continue; }
      const s = b.r * 0.7 * (f < 0.2 ? 0.4 + (f / 0.2) * 0.6 : 1 - (f - 0.2) / 0.8 * 0.95);
      XF[0] = b.x; XF[1] = 0.5; XF[2] = b.z; XF[3] = 0; XF[5] = s; XF[6] = s * 0.7; XF[7] = s;
      writeXfYaw(xArr, nx++);
    }
    this.blastMesh.count = nx;
    if (nx) markInstances(this.blastMesh.instanceMatrix, nx);
  }
}

/**
 * Pull lean (SPEC2 §6.4): tilts an instance toward its pull direction by min(0.35, 0.06 * |p|) rad about its
 * base (left-multiplies the written rotation by an axis-angle turn about (pz, 0, -px)).
 */
export function leanAngle(px, pz) { return Math.min(0.35, 0.06 * Math.hypot(px, pz)); }
function lean(arr, i, px, pz, x, z) {
  const a = leanAngle(px, pz);
  if (a <= 1e-4) return;
  const len = Math.hypot(px, pz), ax = pz / len, az = -px / len; // axis = up x dir
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  // rotation about (ax, 0, az)
  const r00 = c + ax * ax * t, r01 = -az * s, r02 = ax * az * t;
  const r10 = az * s, r11 = c, r12 = -ax * s;
  const r20 = az * ax * t, r21 = ax * s, r22 = c + az * az * t;
  const o = i * 16;
  for (let col = 0; col < 3; col++) {
    const k = o + col * 4, m0 = arr[k], m1 = arr[k + 1], m2 = arr[k + 2];
    arr[k] = r00 * m0 + r01 * m1 + r02 * m2;
    arr[k + 1] = r10 * m0 + r11 * m1 + r12 * m2;
    arr[k + 2] = r20 * m0 + r21 * m1 + r22 * m2;
  }
  arr[o + 12] = x; arr[o + 14] = z;
}

const still0 = (frozen, e) => frozen || e.freezeT > 0;

export const MURKLING_COLORS = Object.fromEntries(ENEMY_TYPES.map((t) => [t, ENEMIES[t].color]));
