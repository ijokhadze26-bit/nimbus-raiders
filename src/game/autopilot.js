// Bot steering for tests/balance. Priorities: dodge active telegraphs > pass the best gate (accounts for the
// value it can still shoot onto the gate) > avoid the enemy-dense side when small / aim at the horde when
// strong > line up with worthwhile barrels (and never run into an unbroken one) > in the boss arena, stand
// in front of the boss. Blades and gaps are a hard filter on the final x: the whole formation (not just Pip)
// is tested against each hazard; power tokens (and coins when idle) are grabbed when the path is safe.
import { applyGate, predictGate } from './gates.js';
import { TARGET_CLAMP, MEMBER_CLAMP } from '../config.js';
import { BLADE_R } from '../models/obstacles.js';
import { MAX_TIER } from '../data/weapons.js';

const LOOK = 75;
const HAZ_LOOK = 24;     // start lining up this far before a blade / gap
const BLADE_PAD = 0.4, GAP_PAD = 0.35, GAP_SIDE = 0.22;
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
    this.look = HAZ_LOOK;
    if (tel.length || (zones && zones.length)) x = this.dodge(zones && zones.length ? tel.concat(zones) : tel);
    if (x === null) {
      const gate = this.gateGoal();
      const near = gate && gate.dz < 30;
      // a gate decision is not overruled by a hazard well past it (there is time to sidestep after passing)
      this.look = near ? Math.min(HAZ_LOOK, gate.dz + 8) : HAZ_LOOK;
      if (near) x = gate.x;
      if (x === null) x = this.pickupGoal(gate, false);
      if (x === null) x = this.hordeGoal();
      if (x === null) x = this.barrelGoal(gate);
      if (x === null) x = this.pickupGoal(gate, true);
      if (x === null && gate) x = gate.x;
      if (x === null && game.boss && game.run && game.run.phase === 'boss') x = game.boss.x;
      if (x !== null) x = this.avoidBarrels(x);
    }
    if (x !== null) this.targetX = x;
    if (!tel.length) this.targetX = this.avoidHazards(this.targetX);
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
    const bulletsPerSec = w.gateShotsPerSec();
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

  /**
   * Members expected to die to blades / gaps if the leader goes to cx (formation slots shifted with it,
   * moving blades predicted at the moment each member reaches them). 0 = clean path.
   */
  hazardLoss(cx) {
    const game = this.game, obs = game.obstacles;
    if (!obs || (!obs.blades.length && !obs.gaps.length)) return 0;
    const squad = game.squad, L = squad.leader, ms = squad.members;
    const speed = Math.max(1, game.run ? game.run.speed : 9);
    const dx = cx - L.x;
    const stride = Math.max(1, Math.floor(ms.length / 80));
    const c = squad.center(this.c);
    const back = c.z + c.r;
    let loss = 0;
    const R = BLADE_R + 0.2 + BLADE_PAD;
    for (const b of obs.blades) {
      if (L.z - b.z > (this.look || HAZ_LOOK) || b.z > back + R) continue;
      const hit = (x, z) => {
        const dz = z - b.z;
        if (dz < -R) return false;
        const bx = obs.bladeX(b, Math.max(0, dz / speed));
        return Math.abs(x - bx) < R;
      };
      if (!squad.pipGone && hit(cx, L.z)) loss += 3;
      for (let i = 0; i < ms.length; i += stride) if (hit(clampX(ms[i].tx + dx), ms[i].tz)) loss += stride;
    }
    const dist = -L.z;
    for (const g of obs.gaps) {
      if (g.from - dist > (this.look || HAZ_LOOK) || g.to < -back) continue;
      const side = GAP_SIDE - GAP_PAD;
      const over = (x, z) => -z < g.to && (g.lane === 'C' || (g.lane === 'R' ? x > side : x < -side));
      if (!squad.pipGone && over(cx, L.z)) loss += 3;
      for (let i = 0; i < ms.length; i += stride) if (over(clampX(ms[i].tx + dx), ms[i].tz)) loss += stride;
    }
    return loss;
  }

  /** Keeps x when it is clean, otherwise the nearby candidate that loses the fewest members. */
  avoidHazards(x) {
    const base = this.hazardLoss(x);
    if (base === 0) return x;
    const L = this.game.squad.leader;
    let best = x, bs = base * 10;
    for (const cx of CAND) {
      const s = this.hazardLoss(cx) * 10 + Math.abs(cx - x) * 0.6 + Math.abs(cx - L.x) * 0.2;
      if (s < bs) { bs = s; best = cx; }
    }
    return best;
  }

  /** Power tokens worth a detour (coins = true: nearest coin when nothing else matters). */
  pickupGoal(gate, coins) {
    const game = this.game, p = game.pickups;
    if (!p) return null;
    const L = game.squad.leader;
    const magnet = game.powers && game.powers.has('magnet');
    if (coins) {
      if (magnet) return null;
      let best = null, bd = Infinity;
      for (const cn of p.coins) {
        const dz = L.z - cn.z;
        if (cn.state !== 0 || dz < 1 || dz > 26) continue;
        if (gate && gate.dz < dz + 6) continue;
        if (dz < bd && this.hazardLoss(cn.x) === 0) { bd = dz; best = cn.x; }
      }
      return best;
    }
    const h = game.horde, count = game.squad.count;
    let best = null, bv = 0;
    for (const tk of p.tokens) {
      const dz = L.z - tk.z;
      if (tk.state !== 0 || dz < 0.5 || dz > 40) continue;
      if (magnet) continue;                                 // the magnet brings it anyway
      if (gate && gate.dz < dz + 4) continue;              // a gate decision comes first
      if (this.hazardLoss(tk.x) > 0) continue;
      const brave = tk.kind === 'freeze' || tk.kind === 'shield';
      if (h && h.count && !brave && h.densityAt(tk.x, 1.9, L.z - 42, L.z + 1) > count * 0.6) continue;
      let v = 40 - Math.abs(tk.x - L.x) * 2 - dz * 0.2;
      if (game.powers && game.powers.has(tk.kind)) v *= 0.3;
      if (v > bv) { bv = v; best = tk.x; }
    }
    return best;
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

function clampX(x) { return x < -MEMBER_CLAMP ? -MEMBER_CLAMP : x > MEMBER_CLAMP ? MEMBER_CLAMP : x; }
