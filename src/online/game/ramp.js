// Time pressure of an online survival match (SPEC4 §6): the road gets harder the longer the match lasts, so
// every match ends. Driven by Versus.step with the PLAYED clock t (real seconds of simulation), numbers in vsdata.js.
// - pace: forward speed up (hazards.mods.speedMul, rebuilt every step; run.speed is never touched);
// - tougher enemies: run.hpRamp (read by horde.spawnWave);
// - pressure waves: extra hordes spawned straight into the field (not road events);
// - more red gates: by DISTANCE and the match seed, so every player meets the same rows (redden());
// - Sudden Death (180 s): growing waves that never stop, also in a boss arena, and a darker sky;
// - Storm wall (270 s): the squad shrinks every second until it is gone.
// Nothing here reads the graphics quality, the wall clock or the generator's Rng (the road stays seed-only).
import { Rng } from '../../core/rng.js';
import { GATE } from '../../config.js';
import { endlessTough } from '../../data/endless.js';
import { redSpec } from '../../data/modifiers.js';
import { VS, vsPace } from './vsdata.js';

export class Ramp {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.sudden = false; this.storm = false;
    this.stats = { waves: 0, suddenWaves: 0, rows: 0, reds: 0, stormLost: 0 };
  }

  /** Match start, right after game.beginRun (the first zone's events exist, none is spawned past 110 u). */
  begin(seed) {
    this.on = true;
    this.redRng = new Rng(seed * 97 + 3);
    this.gateIdx = 0;
    this.waveAt = VS.waves.from;
    this.sudden = false; this.suddenK = 0; this.suddenAt = VS.sudden.at;
    this.storm = false; this.stormAt = VS.storm.at;
    this.pace = 1;
    Object.assign(this.stats, { waves: 0, suddenWaves: 0, rows: 0, reds: 0, stormLost: 0 });
    this.redden();
  }

  end() {
    this.on = false; this.sudden = false; this.storm = false;
    const run = this.game.run;
    if (run) run.hpRamp = 1;
  }

  /** How much a gate is worth to a squad of E Raiders (bigger = better side). */
  worth(e, E) {
    if (e.op === 'add') return E + (e.value | 0);
    const r = e.rung !== undefined ? GATE.rungs[Math.max(0, Math.min(GATE.rungs.length - 1, e.rung))] : { op: e.op, k: e.value || 2 };
    return r.op === 'mul' ? E * r.k : E / r.k;
  }

  /**
   * Walks the gate rows generated since the last call (zone 1 at the start, the next zone after every boss) and
   * turns the better side of some rows red. One draw per row past VS.red.from whatever happens, so the result
   * depends on the seed and the distance only. The events are this run's own objects and not spawned yet.
   */
  redden() {
    const g = this.game, run = g.run;
    if (!run || !g.endless.gen) return;
    const ev = run.eventsOf('gate'), R = VS.red;
    let i = this.gateIdx;
    while (i < ev.length) {
      const at = ev[i].at;
      let j = i;
      while (j < ev.length && ev[j].at === at) j++;
      if (at > R.from) {
        this.stats.rows++;
        if (this.redRng.next() < Math.min(R.max, R.base + R.per700 * at / 700)) {
          const E = g.endless.gen.knobs(at).E;
          let best = i, top = -Infinity;
          for (let k = i; k < j; k++) { const w = this.worth(ev[k], E); if (w > top) { top = w; best = k; } }
          redSpec(ev[best]);
          if (this.worth(ev[best], E) < top) this.stats.reds++;
        }
      }
      i = j;
    }
    this.gateIdx = i;
  }

  /** Enemy mix by distance (the generator's unlock distances, fixed shares: no Rng draw). */
  mix(d) {
    const K = this.game.endless.gen.knobs(d), m = { grunt: 1 };
    if (d > 150) m.runner = 0.22;
    if (d > 400) m.shield = 0.9 * K.shields;
    if (d > 600) m.bomber = 0.05;
    if (d > 900) m.tank = 0.9 * K.tanks;
    return m;
  }

  wave(count, hpMul = 1, elite = 0) {
    const g = this.game, run = g.run, d = run.dist;
    // an arena has no forward speed: a wave from the road distance would be shot down long before it arrives
    const ahead = run.phase !== 'boss' ? VS.waves.ahead : this.sudden ? VS.sudden.aheadBoss : VS.waves.aheadBoss;
    g.horde.spawnWave({ at: d + ahead, count, mix: this.mix(d), lane: 'both', hpMul: endlessTough(d) * hpMul, elite }, false);
  }

  /** One playing step while the squad is alive. Returns 'sudden' / 'storm' on the step that phase begins. */
  step(dt, raw, t) {
    const g = this.game, run = g.run, mods = g.hazards.mods, W = VS.waves, S = VS.sudden, ST = VS.storm;
    let began = null;
    this.pace = vsPace(t);
    mods.speedMul *= this.pace;
    run.hpRamp = 1 + t / VS.hpRamp.per;
    if (!this.sudden) {
      if (t >= this.waveAt) {
        this.waveAt = t + Math.max(W.everyMin, W.every0 - t / W.everyDiv);
        const n = Math.round(W.count0 + t / W.countDiv);
        this.wave(run.phase === 'boss' ? Math.max(1, Math.round(n * W.bossMul)) : n);
        this.stats.waves++;
      }
      if (t >= S.at) { this.sudden = true; this.suddenAt = t; began = 'sudden'; }
    }
    if (this.sudden) {
      mods.dark = Math.max(mods.dark, S.dark);
      if (t >= this.suddenAt) {
        const k = this.suddenK++;
        this.suddenAt = t + Math.max(S.everyMin, S.every0 - S.everyStep * k);
        this.wave(Math.min(S.countMax, Math.round(S.count0 * Math.pow(S.growth, k))), Math.pow(S.hpGrowth, k), Math.min(S.eliteMax, S.eliteStep * k));
        this.stats.suddenWaves++;
      }
    }
    if (t >= ST.at) {
      if (!this.storm) { this.storm = true; this.stormAt = t; began = 'storm'; }
      mods.dark = Math.max(mods.dark, ST.dark);
      mods.fogMul = Math.min(mods.fogMul, ST.fogMul);
      if (t >= this.stormAt && run.active) {
        this.stormAt = t + ST.every;
        const sq = g.squad, n = sq.count;
        const left = t >= ST.hardEnd ? 0 : Math.max(0, n - (Math.ceil(n * ST.frac) + ST.flat));
        this.stats.stormLost += n - left;
        sq.setCount(left, 'storm'); // the wall takes its share: no Guard, no shield, no dodge
      }
    }
    return began;
  }
}
