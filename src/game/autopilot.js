// Bot steering for tests/balance. Stage 1: picks the gate with the best expected outcome,
// accounting for the value the squad can shoot onto that gate before reaching it.
import { applyGate, predictGate } from './gates.js';
import { TARGET_CLAMP } from '../config.js';

const LOOK = 75;

export class Autopilot {
  init(game) {
    this.game = game;
    this.enabled = false;
    this.targetX = 0;
    this.choice = null;
  }

  reset() { this.choice = null; this.targetX = this.game.squad.leader.x; }

  update() {
    const game = this.game;
    const L = game.squad.leader;
    const run = game.run;
    const speed = Math.max(1, run ? run.speed : 9);
    const rows = game.gates.upcoming();
    let row = null;
    for (const r of rows) { if (r.z < L.z + 0.2 && L.z - r.z < LOOK) { row = r; break; } }
    if (row) {
      const t = Math.max(0, (L.z - row.z) / speed);
      const w = game.weapons;
      const bulletsPerSec = Math.min(w.lastShotsPerSec, w.budget() / w.weapon.pellets) * w.weapon.pellets;
      const count = game.squad.count;
      let best = null, bestScore = -Infinity;
      for (const g of row.gates) {
        if (g.state !== 'live') continue;
        // assume ~80% of the stream lands on the gate we are lined up with (minus steering time)
        const hits = bulletsPerSec * Math.max(0, t - 0.5) * 0.8;
        const pred = predictGate(g, hits);
        let score = applyGate(g, count, pred.value, pred.rung);
        if (g === this.choice) score *= 1.08; // hysteresis
        if (score > bestScore) { bestScore = score; best = g; }
      }
      if (best) {
        this.choice = best;
        const inner = Math.max(0.2, best.halfW - 0.9);
        let x = best.x;
        if (best.moving) {
          // lead a moving gate: aim at its predicted position when we arrive (only when close)
          const tt = game.gates.time + Math.min(t, 1.2);
          x = best.baseX + Math.sin(tt * best.moving.speed + best.phase) * best.moving.range;
        }
        if (best.lane === 'C') x = Math.max(-1.5, Math.min(1.5, L.x));
        this.targetX = Math.max(best.x - inner, Math.min(best.x + inner, x));
      }
    }
    this.targetX = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, this.targetX));
    return this.targetX;
  }
}
