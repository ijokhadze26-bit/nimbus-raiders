// Per-run state: level definition, distance, phase, coins, kills, stats, events grouped by type.
import { RUN_SPEED } from '../config.js';

export class Run {
  constructor(def, mode, bus) {
    this.def = def;
    this.bus = bus;
    this.levelId = def.id;
    this.mode = mode;
    this.name = def.name || '';
    this.theme = def.theme || 'noon';
    this.length = def.length;
    this.speed = def.speed ?? RUN_SPEED;
    this.boss = def.boss || null;
    this.dist = 0;
    this.phase = 'run';
    this.coins = 0;          // collected during the run
    this.coinsEarned = 0;    // final payout (set on win/lose)
    this.kills = 0;
    this.time = 0;
    this.stars = 0;
    this.stats = { gatesPassed: 0, maxSquad: 0, membersLost: 0 };
    this.byType = {};
    const evs = (def.events || []).slice().sort((a, b) => a.at - b.at);
    for (const e of evs) (this.byType[e.type] ||= []).push(e);
    this.lastProgress = -1;
    // endless: the progress bar spans the current boss segment (segStart -> length)
    this.segStart = 0;
  }

  /**
   * Sorted events of one type (systems keep their own cursor). The array is stored, so endless mode can
   * append generated events later (always ahead of every cursor, still sorted) and systems pick them up.
   */
  eventsOf(type) { return (this.byType[type] ||= []); }

  /** Appends generated events (endless); `list` must be sorted and lie past every event already queued. */
  append(list) { for (const e of list) (this.byType[e.type] ||= []).push(e); }

  setPhase(phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.bus.emit('run:phase', { phase });
  }

  get active() { return this.phase === 'run' || this.phase === 'boss'; }

  update(dt, dist) {
    this.time += dt;
    this.dist = dist;
    if (this.mode === 'endless') {
      const seg = Math.max(1, this.length - this.segStart);
      this.bus.emit('run:progress', { dist: Math.max(0, Math.min(seg, dist - this.segStart)), length: seg, total: Math.max(0, Math.round(dist)) });
    } else this.bus.emit('run:progress', { dist: Math.max(0, dist), length: this.length });
  }

  starsFor(squad) {
    const [a, b] = this.def.stars || [10, 25];
    return squad >= b ? 3 : squad >= a ? 2 : 1;
  }
}
