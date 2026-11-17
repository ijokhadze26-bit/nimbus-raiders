// Dodge roll (update 3 stage 4, STAGE4.md A): swipe up / W / ArrowUp (core/input.js onSwipeUp) or the HUD
// dodge chip. The squad rolls for ROLL s (members hop + spin, Pip flips - squad.sync reads amount()), and the NEXT
// loss event inside that window is skipped (squad.remove / killMember ask absorb() first: one enemy touch, blast,
// hazard tick, boss strike, blade or barrel). Cooldown COOLDOWN s. Game time only, deterministic.
// Events: dodge:start { pos }, dodge:skip { reason, pos }, dodge:ready {}.
export const DODGE = { roll: 0.6, cooldown: 4 };
const NOT_A_HIT = new Set(['gap', 'gate', 'start', 'ability', 'cursed']);

export class Dodge {
  init(game) {
    this.game = game;
    this.rollT = 0; this.cd = 0; this.armed = false;
    this.used = 0; this.skipped = 0;
    this.pos = { x: 0, y: 1, z: 0 };
    if (game.input && game.input.onSwipeUp) game.input.onSwipeUp(() => this.trigger());
  }

  reset() { this.rollT = 0; this.cd = 0; this.armed = false; this.used = 0; this.skipped = 0; }

  live() {
    const g = this.game, run = g.run;
    if (!run || !run.active || g.state !== 'playing' || g.squad.count <= 0) return false;
    return !(run.phase === 'boss' && g.boss && !g.boss.alive);
  }

  get ready() { return this.cd <= 0; }

  /** Starts a roll when off cooldown during a live run. true = rolled. */
  trigger() {
    if (this.cd > 0 || !this.live()) return false;
    this.rollT = DODGE.roll; this.cd = DODGE.cooldown; this.armed = true;
    this.used++;
    const L = this.game.squad.leader;
    this.pos.x = L.x; this.pos.z = L.z;
    this.game.events.emit('dodge:start', { pos: this.pos });
    return true;
  }

  /** squad loss gate: true = this loss event is skipped (once per roll). */
  absorb(reason) {
    if (!this.armed || this.rollT <= 0 || NOT_A_HIT.has(reason)) return false;
    const run = this.game.run;
    if (!run || !run.active) return false;
    this.armed = false; this.skipped++;
    const L = this.game.squad.leader;
    this.pos.x = L.x; this.pos.z = L.z;
    if (this.game.events.wants('dodge:skip')) this.game.events.emit('dodge:skip', { reason, pos: this.pos });
    return true;
  }

  update(dt) {
    if (this.rollT > 0) { this.rollT = Math.max(0, this.rollT - dt); if (this.rollT <= 0) this.armed = false; }
    if (this.cd > 0) { this.cd = Math.max(0, this.cd - dt); if (this.cd <= 0) this.game.events.emit('dodge:ready', {}); }
  }

  /** Roll progress 0..1 while rolling (visual), else 0. */
  amount() { return this.rollT > 0 ? 1 - this.rollT / DODGE.roll : 0; }

  state() { return { rolling: this.rollT > 0, armed: this.armed, cd: Math.round(this.cd * 100) / 100, used: this.used, skipped: this.skipped }; }
}
