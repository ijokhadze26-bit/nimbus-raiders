// Horde rendering: one InstancedMesh per Murkling type (toon + per-instance flash/ice/glow attribute),
// Shieldbearer shields, Fizzbomb fuse sparks, instanced blob shadows and bomber blast puffs.
import * as THREE from 'three';
import { ENEMY_TYPES, ENEMIES } from '../data/enemies.js';
import { buildMurklingGeometry, buildShieldGeometry, buildSparkGeometry } from '../models/murklings.js';
import { fxToonMaterial, blobShadowTexture } from '../models/materials.js';
import { XF, writeXfYawRoll, writeXfYaw, markInstances } from '../core/pool.js';
import { part, merge, G } from '../models/util.js';

const DIE_TIME = 0.17;
const MAX_BLASTS = 24;
const ANIM = {
  grunt: { f: 9, hop: 0.13, sq: 0.09, roll: 0.13 },
  runner: { f: 15, hop: 0.1, sq: 0.07, roll: 0.1 },
  tank: { f: 5.5, hop: 0.05, sq: 0.05, roll: 0.07 },
  shield: { f: 8, hop: 0.09, sq: 0.07, roll: 0.08 },
  bomber: { f: 10, hop: 0.15, sq: 0.1, roll: 0.15 },
};
const ANIMS = ENEMY_TYPES.map((t) => ANIM[t]);
const _c = new THREE.Color();

export class HordeView {
  constructor(game, cap) {
    this.game = game;
    this.cap = cap;
    const scene = game.scene;
    this.meshes = ENEMY_TYPES.map((t) => {
      const geo = buildMurklingGeometry(t);
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      fx.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFx', fx);
      const mat = fxToonMaterial(t === 'bomber' ? '#ff6a3a' : t === 'tank' ? '#ff2a3a' : '#ffffff');
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return { mesh, fx, n: 0 };
    });
    this.shields = new THREE.InstancedMesh(buildShieldGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false }), 320);
    this.shields.frustumCulled = false; this.shields.count = 0; this.shields.renderOrder = 4;
    this.shields.setColorAt(0, _c.set(1, 1, 1));
    this.sparks = new THREE.InstancedMesh(buildSparkGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), 320);
    this.sparks.frustumCulled = false; this.sparks.count = 0;
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#2a3f7a', alphaMap: blobShadowTexture(), transparent: true, opacity: 0.32, depthWrite: false }), cap);
    this.blobs.frustumCulled = false; this.blobs.count = 0; this.blobs.renderOrder = 1;
    this.blastGeo = merge([
      part(G.sphere(1, 12, 8), '#ffb03a', { a: 0.55 }),
      part(G.sphere(0.62, 10, 7), '#fff2b0', { a: 0.9 }),
    ]);
    this.blastMesh = new THREE.InstancedMesh(this.blastGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false }), MAX_BLASTS);
    this.blastMesh.frustumCulled = false; this.blastMesh.count = 0; this.blastMesh.renderOrder = 7;
    scene.add(this.shields, this.sparks, this.blobs, this.blastMesh);
    this.blastData = [];
  }

  reset() { this.blastData.length = 0; }

  blast(x, z, r) {
    if (this.blastData.length >= MAX_BLASTS) this.blastData.shift();
    this.blastData.push({ x, z, r, t: 0 });
  }

  shatterShield(e) {
    const gates = this.game.gates;
    if (gates && gates.burst) gates.burst(e.x, 0.5, e.z + 0.5, 1.1, 0.8, '#4de1ff', 10);
  }

  sync(dt, list, time, frozen) {
    const ms = this.meshes;
    for (const m of ms) m.n = 0;
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
      } else {
        const speed = e.charging && !frozen ? 1 : 0.45;
        const ph = time * a.f * speed + e.ph;
        const hop = Math.abs(Math.sin(ph));
        y = frozen ? 0 : hop * a.hop * (e.charging ? 1 : 0.6);
        const squash = frozen ? 0 : Math.cos(ph * 2) * a.sq;
        sy = 1 + squash; sx = sz = 1 - squash * 0.6;
        roll = frozen ? 0 : Math.sin(ph) * a.roll;
        yaw = Math.max(-0.5, Math.min(0.5, e.vx * 0.18)) + (e.charging ? 0 : Math.sin(time * 0.9 + e.ph * 3) * 0.35);
        e.flash = Math.max(0, e.flash - fd);
      }
      XF[0] = e.x; XF[1] = y; XF[2] = e.z; XF[3] = yaw; XF[4] = roll; XF[5] = sx; XF[6] = sy; XF[7] = sz;
      writeXfYawRoll(vm.mesh.instanceMatrix.array, vm.n);
      const fo = vm.n * 3;
      const fx = vm.fx.array;
      fx[fo] = flash * 0.7;
      fx[fo + 1] = frozen ? 1 : 0;
      fx[fo + 2] = d.blastRadius ? 0.25 + 0.25 * Math.sin(time * 11 + e.ph) : (d.contactKills ? e.ckills * 0.2 : 0);
      vm.n++;
      // blob shadow
      if (nb < this.cap) {
        const bs = d.r * 2.5 * (e.state === 1 ? Math.max(0, 1 - e.t / DIE_TIME) : 1 - y * 0.8);
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
    }
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
      const s = b.r * (f < 0.35 ? 0.4 + (f / 0.35) * 0.6 : 1 - (f - 0.35) / 0.65 * 0.9);
      XF[0] = b.x; XF[1] = 0.5; XF[2] = b.z; XF[3] = 0; XF[5] = s; XF[6] = s * 0.7; XF[7] = s;
      writeXfYaw(xArr, nx++);
    }
    this.blastMesh.count = nx;
    if (nx) markInstances(this.blastMesh.instanceMatrix, nx);
  }
}

export const MURKLING_COLORS = Object.fromEntries(ENEMY_TYPES.map((t) => [t, ENEMIES[t].color]));
