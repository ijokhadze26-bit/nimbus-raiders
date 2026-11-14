// Helpers: hover drones (max 4) orbit above the squad and fire green lasers at the nearest target ahead;
// wheeled turrets (max 2) trail behind the squad and lob heavy piercing shells. Removed on a new run.
import * as THREE from 'three';
import { HELPER_SHOTS } from '../data/weapons.js';
import { buildDroneGeometry, buildRotorGeometry, buildTurretGeometry, buildCannonGeometry } from '../models/helpers.js';
import { toonMaterial } from '../models/materials.js';

const MAX = { drone: 4, turret: 2 };
const DRONE = HELPER_SHOTS[0], SHELL = HELPER_SHOTS[1];
const RANGE = 46;

export class Helpers {
  init(game) {
    this.game = game;
    this.droneList = [];
    this.turretList = [];
    this.pool = { drone: [], turret: [] };
    this.time = 0;
    this.mat = toonMaterial();
    this.rotorMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    this.geo = { drone: buildDroneGeometry(), rotor: buildRotorGeometry(), turret: buildTurretGeometry(), cannon: buildCannonGeometry() };
    this.aim = { x: 0, z: 0 };
    this.c = { x: 0, z: 0, r: 0 };
  }

  get drones() { return this.droneList.length; }
  get turrets() { return this.turretList.length; }

  reset() {
    for (const h of this.droneList) this.release(h);
    for (const h of this.turretList) this.release(h);
    this.droneList.length = 0; this.turretList.length = 0;
  }

  visual(kind) {
    const pool = this.pool[kind];
    if (pool.length) return pool.pop();
    const root = new THREE.Group();
    let v;
    if (kind === 'drone') {
      const body = new THREE.Mesh(this.geo.drone, this.mat);
      body.castShadow = true;
      const rotor = new THREE.Mesh(this.geo.rotor, this.rotorMat);
      body.add(rotor);
      body.scale.setScalar(0.95);
      root.add(body);
      v = { root, body, rotor };
    } else {
      const body = new THREE.Mesh(this.geo.turret, this.mat);
      body.castShadow = true;
      const cannon = new THREE.Mesh(this.geo.cannon, this.mat);
      cannon.castShadow = true;
      cannon.position.set(0, 0.62, -0.05);
      body.add(cannon);
      root.add(body);
      v = { root, body, cannon };
    }
    v.kind = kind;
    return v;
  }

  release(h) { this.game.scene.remove(h.v.root); this.pool[h.v.kind].push(h.v); }

  /** Adds n helpers of a kind (respecting the max). Returns the new count. */
  add(kind, n = 1) {
    const list = kind === 'drone' ? this.droneList : this.turretList;
    const L = this.game.squad.leader;
    for (let i = 0; i < n && list.length < MAX[kind]; i++) {
      const h = { kind, v: this.visual(kind), x: L.x, y: kind === 'drone' ? 2.6 : 0, z: L.z + 1, cd: 0.3 + list.length * 0.11, recoil: 0, yaw: 0, spawn: 0 };
      this.game.scene.add(h.v.root);
      list.push(h);
      this.game.events.emit('helper:add', { kind, pos: { x: h.x, y: h.y, z: h.z } });
    }
    return list.length;
  }

  /** Picks the nearest worthwhile target ahead of (x, z): enemy, then boss, then barrel. Writes this.aim. */
  target(x, z) {
    const game = this.game;
    const e = game.horde && game.horde.nearestAhead(x, z, RANGE);
    if (e) { this.aim.x = e.x; this.aim.z = e.z; return true; }
    const boss = game.boss;
    if (boss && boss.targetable) { this.aim.x = boss.x + Math.sin(this.time * 3) * 1.2; this.aim.z = boss.z + boss.def.hitbox.front; return true; }
    if (game.barrels) {
      let best = null;
      for (const b of game.barrels.live) if (b.state === 'live' && b.z < z && z - b.z < RANGE && (!best || b.z > best.z)) best = b;
      if (best) { this.aim.x = best.x; this.aim.z = best.z; return true; }
    }
    return false;
  }

  update(dt) {
    const game = this.game;
    this.time += dt;
    const run = game.run;
    const firing = !!(run && run.active);
    const c = game.squad.center(this.c);
    const L = game.squad.leader;
    const dmgMul = game.weapons.dmgMul;
    const k = 1 - Math.exp(-dt * 5);
    // drones orbit above the blob
    const nd = this.droneList.length;
    for (let i = 0; i < nd; i++) {
      const h = this.droneList[i];
      h.spawn = Math.min(1, h.spawn + dt * 2.5);
      const a = this.time * 1.3 + (i / nd) * Math.PI * 2;
      const rr = Math.max(1.3, c.r * 0.55);
      const tx = Math.max(-4.4, Math.min(4.4, c.x + Math.cos(a) * rr)), tz = L.z - 1.6 + Math.sin(a) * 0.9;
      h.x += (tx - h.x) * k; h.z += (tz - h.z) * k;
      h.y = 2.5 + Math.sin(this.time * 2.6 + i) * 0.18;
      h.cd -= dt;
      if (firing && h.cd <= 0) {
        h.cd += 1 / DRONE.rate;
        if (h.cd < 0) h.cd = 0;
        if (this.target(h.x, h.z)) this.shoot(7, h, DRONE, dmgMul, 0);
      }
    }
    // turrets roll behind the squad
    const nt = this.turretList.length;
    for (let i = 0; i < nt; i++) {
      const h = this.turretList[i];
      h.spawn = Math.min(1, h.spawn + dt * 2.5);
      const side = nt === 1 ? 0 : i === 0 ? -1 : 1;
      const sx = side || (c.x > 0 ? -1 : 1);
      const tx = Math.max(-4.3, Math.min(4.3, c.x + sx * (c.r + 0.9))), tz = Math.min(c.z + 0.4, L.z + 1.5);
      h.x += (tx - h.x) * k; h.z += (tz - h.z) * Math.max(k, 0.5);
      h.recoil = Math.max(0, h.recoil - dt * 4);
      h.cd -= dt;
      if (firing && h.cd <= 0) {
        h.cd += 1 / SHELL.rate;
        if (h.cd < 0) h.cd = 0;
        if (this.target(h.x, h.z)) { this.shoot(8, h, SHELL, dmgMul, 0.85); h.recoil = 1; }
      }
    }
  }

  shoot(style, h, w, dmgMul, y0) {
    const dx = this.aim.x - h.x, dz = this.aim.z - h.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const sp = w.speed;
    const y = y0 || h.y - 0.25;
    const b = this.game.bullets.spawn(style, h.x, y, h.z - 0.3, (dx / d) * sp, (dz / d) * sp, w.damage * dmgMul, w.pierce, w.damage * dmgMul, RANGE + 6);
    if (b && y > 0.7) b.vy = -(y - 0.6) / Math.max(0.15, d / sp);
    h.yaw = Math.atan2(-dx, -dz);
  }

  sync() {
    for (const h of this.droneList) {
      const v = h.v;
      v.root.position.set(h.x, h.y, h.z);
      v.root.rotation.y = h.yaw * 0.8;
      v.root.scale.setScalar(easeBack(h.spawn));
      v.rotor.rotation.y = this.time * 34;
    }
    for (const h of this.turretList) {
      const v = h.v;
      v.root.position.set(h.x, 0, h.z);
      v.root.scale.setScalar(easeBack(h.spawn));
      v.cannon.rotation.y = h.yaw;
      v.cannon.position.z = -0.05 + h.recoil * 0.22;
      v.body.position.y = Math.abs(Math.sin(this.time * 14)) * 0.03;
    }
  }

  dispose() {}
}

function easeBack(t) { const s = 1.7; const u = t - 1; return Math.max(0.001, 1 + (s + 1) * u * u * u + s * u * u); }
