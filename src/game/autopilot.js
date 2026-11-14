// Bot steering for tests/balance. Priorities: dodge active telegraphs > pass the best gate (accounts for the
// value it can still shoot onto the gate) > avoid the enemy-dense side when small / aim at the horde when
// strong > line up with worthwhile barrels (and never run into an unbroken one) > in the boss arena, stand
// in front of the boss.
import { applyGate, predictGate } from './gates.js';
import { TARGET_CLAMP } from '../config.js';
import { MAX_TIER } from '../data/weapons.js';

const LOOK = 75;
const CAND = [];
for (let x = -TARGET_CLAMP; x <= TARGET_CLAMP + 1e-6; x += 0.4) CAND.push(Math.round(x * 100) / 100);

export class Autopilot {
  init(game) {
    this.game = game;
    this.enabled = false;
    this.targetX = 0;
    this.choice = null;
    this.c = { x: 0, z: 0, r: 0 };
  }

  reset() { this.choice = null; this.targetX = this.game.squad.leader.x; }

  update() {
    const game = this.game;
    const L = game.squad.leader;
    const tel = game.telegraph ? game.telegraph.active : [];
    // live boss hazards that outlast their warning (charges, laser sweeps, quake crests, goo puddles)
    const zones = game.boss && game.boss.dangerZones;
    let x = null;
    if (tel.length || (zones && zones.length)) x = this.dodge(zones && zones.length ? tel.concat(zones) : tel);
    if (x === null) {
      const gate = this.gateGoal();
      const near = gate && gate.dz < 30;
      if (near) x = gate.x;
      if (x === null) x = this.hordeGoal();
      if (x === null) x = this.barrelGoal(gate);
      if (x === null && gate) x = gate.x;
      if (x === null && game.boss && game.run && game.run.phase === 'boss') x = game.boss.x;
      if (x !== null) x = this.avoidBarrels(x);
    }
    if (x !== null) this.targetX = x;
    this.targetX = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, this.targetX));
    return this.targetX;
  }

  /** Candidate x that keeps the most members out of the marked areas. */
  dodge(list) {
    const game = this.game;
    const squad = game.squad, L = squad.leader, T = game.telegraph;
    const ms = squad.members;
    const stride = Math.max(1, Math.floor(ms.length / 90));
    const bossX = game.boss ? game.boss.x : 0;
    let best = null, bestScore = Infinity;
    for (const cx of CAND) {
      const dx = cx - L.x;
      let loss = 0;
      for (const h of list) {
        if (h.done) continue;
        const pad = 0.45;
        if (T.contains(h, L.x + dx, L.z, pad)) loss += 3;
        for (let i = 0; i < ms.length; i += stride) {
          const m = ms[i];
          if (T.contains(h, m.tx + dx, m.tz, pad)) loss += stride;
        }
      }
      const score = loss * 10 + Math.abs(dx) * 0.6 + Math.abs(cx - bossX) * 0.25;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    return best;
  }

  gateGoal() {
    const game = this.game;
    const L = game.squad.leader;
    const run = game.run;
    const speed = Math.max(1, run ? run.speed : 9);
    let row = null;
    for (const r of game.gates.upcoming()) { if (r.z < L.z + 0.2 && L.z - r.z < LOOK) { row = r; break; } }
    if (!row) return null;
    const t = Math.max(0, (L.z - row.z) / speed);
    const w = game.weapons;
    const bulletsPerSec = Math.min(w.lastShotsPerSec, w.budget() / w.weapon.pellets) * w.weapon.pellets;
    const count = game.squad.count;
    let best = null, bestScore = -Infinity;
    for (const g of row.gates) {
      if (g.state !== 'live') continue;
      const hits = bulletsPerSec * Math.max(0, t - 0.5) * 0.8;
      const pred = predictGate(g, hits);
      let score = applyGate(g, count, pred.value, pred.rung);
      if (g === this.choice) score *= 1.08; // hysteresis
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (!best) return null;
    this.choice = best;
    const inner = Math.max(0.2, best.halfW - 0.9);
    let x = best.x;
    if (best.moving) {
      const tt = game.gates.time + Math.min(t, 1.2);
      x = best.baseX + Math.sin(tt * best.moving.speed + best.phase) * best.moving.range;
    }
    if (best.lane === 'C') x = Math.max(-1.5, Math.min(1.5, L.x));
    return { x: Math.max(best.x - inner, Math.min(best.x + inner, x)), dz: L.z - row.z };
  }

  /** Small squad: steer to the thinner side of an incoming horde. Strong squad: face the horde. */
  hordeGoal() {
    const game = this.game;
    const h = game.horde;
    if (!h || h.count === 0) return null;
    const L = game.squad.leader;
    const zNear = L.z + 1, zFar = L.z - 42;
    const total = h.densityAt(0, 6, zFar, zNear);
    if (total === 0) return null;
    const count = game.squad.count;
    const strong = count > total * 0.9 + 12;
    let best = null, bestScore = Infinity;
    for (const cx of CAND) {
      const d = h.densityAt(cx, 1.9, zFar, zNear);
      const score = (strong ? -d : d) + Math.abs(cx - L.x) * 0.15;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    return best;
  }

  barrelValue(b) {
    const game = this.game;
    const r = b.reward;
    switch (r.kind) {
      case 'weapon': return game.weapons.tier < MAX_TIER ? 120 : 5;
      case 'troops': return (r.amount || 1) * 4;
      case 'drone': return game.helpers && game.helpers.drones < 4 ? 45 : 0;
      case 'turret': return game.helpers && game.helpers.turrets < 2 ? 55 : 0;
      case 'coins': return 8;
      default: return 20;
    }
  }

  barrelGoal(gate) {
    const game = this.game;
    if (!game.barrels) return null;
    const L = game.squad.leader;
    const run = game.run;
    const speed = Math.max(1, run ? run.speed : 9);
    const w = game.weapons.weapon;
    const dps = game.squad.count * w.rate * w.damage * game.weapons.dmgMul;
    let best = null, bs = 0;
    for (const b of game.barrels.upcoming()) {
      const dz = L.z - b.z;
      if (dz < 4 || dz > 60) continue;
      if (gate && gate.dz < dz + 12) continue; // a gate comes first
      const time = (dz - 3) / speed;
      if (dps * time * 0.75 < b.hp) continue;   // can't break it in time
      const v = this.barrelValue(b) - Math.abs(b.x - L.x) * 2;
      if (v > bs) { bs = v; best = b; }
    }
    return best ? best.x : null;
  }

  /** Shift x so the blob doesn't run into an unbroken barrel that is about to be reached. */
  avoidBarrels(x) {
    const game = this.game;
    if (!game.barrels) return x;
    const squad = game.squad, L = squad.leader;
    const c = squad.center(this.c);
    for (const b of game.barrels.upcoming()) {
      const dz = L.z - b.z;
      if (dz < -c.r * 2 - 1 || dz > 6.5) continue;
      const half = c.r * 0.9 + 1.0;
      if (Math.abs(x - b.x) < half) {
        const left = b.x - half, right = b.x + half;
        const goLeft = Math.abs(x - left) < Math.abs(x - right);
        let nx = goLeft ? left : right;
        if (nx < -TARGET_CLAMP || nx > TARGET_CLAMP) nx = goLeft ? right : left;
        x = nx;
      }
    }
    return x;
  }
}
