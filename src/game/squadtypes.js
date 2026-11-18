// Squad member types in a run (update 3 stage 5; data in data/squadtypes.js, looks in models/raider.js + squad.js).
// begin(run) reads the save's owned types + mix; Squad.syncMembers asks next() for the type of every Raider that
// pops in (a deterministic share accumulator, no game.rng: runs without squad types are unchanged). Effects:
// - SHIELD BEARER (type 1): absorb(reason) — an enemy hit on any member is blocked by one bearer's shield (gone).
// - MEDIC (type 2): every MEDIC.every s, while squad < its peak, one Raider back per medic (max MEDIC.maxPer).
// - HEAVY GUNNER (type 3): weapons.dmgMul = the run's base x (1 + GUNNER.per per gunner, capped at GUNNER.max).
// Counts are taken over the rendered members (<= 320). Practice runs and menus never mix types in.
import { SQUAD_TYPES, MEDIC, GUNNER, SHIELD_BLOCKS, typeShare } from '../data/squadtypes.js';

const BLOCKS = new Set(SHIELD_BLOCKS);
export const T_SHIELD = 1, T_MEDIC = 2, T_GUNNER = 3;

export class SquadTypes {
  init(game) {
    this.game = game;
    this.on = false;
    this.share = [0, 0, 0, 0];   // by type index, fraction 0..1
    this.acc = [0, 0, 0, 0];
    this.counts = [0, 0, 0, 0];  // rendered members per type (shield = bearers that still have a shield)
    this.medT = 0; this.countT = 0;
    this.baseDmg = null;
    this.stats = { blocked: 0, revived: 0 };
    this.pos = { x: 0, y: 1, z: 0 };
  }

  /** Run start (before squad.reset): which types mix in, fresh counters. run null / practice = none. */
  begin(run) {
    const d = this.game.save && this.game.save.data;
    const use = !!run && run.mode !== 'practice' && !!d;
    this.on = false;
    for (const t of SQUAD_TYPES) {
      const s = use ? typeShare(d, t.id) / 100 : 0;
      this.share[t.idx] = s;
      if (s > 0) this.on = true;
    }
    this.acc.fill(0); this.counts.fill(0);
    this.medT = 0; this.countT = 0; this.baseDmg = null;
    this.stats.blocked = 0; this.stats.revived = 0;
  }

  /** Type of the next Raider that joins (0 = a plain Raider). */
  next() {
    if (!this.on) return 0;
    const a = this.acc;
    let best = 0;
    for (let t = 1; t < 4; t++) { a[t] += this.share[t]; if (a[t] >= 1 && (!best || a[t] > a[best])) best = t; }
    if (best) a[best] -= 1;
    return best;
  }

  /** A member loss: true = a Shield Bearer's shield took the hit (that shield is gone). */
  absorb(reason) {
    if (!this.on || !BLOCKS.has(reason)) return false;
    const ms = this.game.squad.members;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (m.type === T_SHIELD && m.shield) {
        m.shield = false;
        this.counts[T_SHIELD] = Math.max(0, this.counts[T_SHIELD] - 1);
        this.stats.blocked++;
        this.blockFx(m);
        this.game.events.emit('squad:block', { pos: { x: m.x, y: 0.8, z: m.z } });
        return true;
      }
    }
    return false;
  }

  blockFx(m) {
    const fx = this.game.fx;
    if (!fx) return;
    fx.B.sparkle(m.x, 0.9, m.z, 0x8fd0ff, 8, 0.8, -this.game.squad.speed);
    fx.popups.show('tick', 'BLOCK!', m.x, 1.7, m.z, { color: '#bfe6ff', outline: '#12408f' });
  }

  recount() {
    const c = this.counts, ms = this.game.squad.members;
    c[1] = 0; c[2] = 0; c[3] = 0;
    for (let i = 0; i < ms.length; i++) {
      const t = ms[i].type | 0;
      if (t === T_SHIELD) { if (ms[i].shield) c[1]++; } else if (t) c[t]++;
    }
  }

  update(dt) {
    const g = this.game, run = g.run;
    if (!this.on || !run || !run.active) return;
    this.countT -= dt;
    if (this.countT <= 0) { this.countT = 0.25; this.recount(); }
    // HEAVY GUNNER: damage bonus on top of the run's own multiplier (weapons.reset set it this run)
    const W = g.weapons;
    if (this.baseDmg == null) this.baseDmg = W.dmgMul;
    W.dmgMul = this.baseDmg * (1 + this.gunnerBonus());
    // MEDIC: revive while under the peak
    const medics = this.counts[T_MEDIC], sq = g.squad, peak = run.stats.maxSquad;
    if (!medics || sq.count <= 0 || sq.count >= peak) { this.medT = Math.min(this.medT, MEDIC.every); return; }
    this.medT += dt;
    if (this.medT < MEDIC.every) return;
    this.medT = 0;
    const n = Math.min(medics, MEDIC.maxPer, peak - sq.count);
    if (n > 0) {
      this.stats.revived += n;
      sq.add(n, 'medic');
      const L = sq.leader;
      if (g.fx) g.fx.popups.show('tick', '+' + n + ' MEDIC', L.x, 1.9, L.z + 1, { color: '#ffd0d6', outline: '#8e0f22' });
    }
  }

  gunnerBonus() { return Math.min(GUNNER.max, GUNNER.per * this.counts[T_GUNNER]); }

  /** Debug / tests. */
  state() {
    this.recount();
    return { on: this.on, share: this.share.slice(1), counts: { shield: this.counts[1], medic: this.counts[2], gunner: this.counts[3] }, gunnerBonus: this.gunnerBonus(), ...this.stats };
  }
}
