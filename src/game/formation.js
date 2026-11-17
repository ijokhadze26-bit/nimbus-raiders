// Squad formation (update 3 stage 4, STAGE4.md A): LINE (wide flat, +12% damage vs the horde), WEDGE (arrow,
// slightly narrower, +20% boss damage), CIRCLE (round packed, 25% of enemy touches / blasts are shrugged off,
// -10% damage). The HUD button / F key cycles it; it lasts for the run (reset() = LINE).
// Shapes are a cheap transform of the squad's phyllotaxis disc slots (squad.js SLOT_X / SLOT_Z, inner first, so
// losses still come from the outside): x' = sx * x, z' = sz * z + k * |x'| (k > 0 sweeps the sides back into a
// chevron). Switching eases the parameters over MORPH s, so every member glides to its new place; no per-member
// state, works for any count (only <= 320 are rendered). shape(n) is cached per count + morph step.
// Damage: hordeK / bossK = formation x combo (game/combo.js) - read by hordeops.applyDamage and boss.damageTyped.
import { FORMATION, MEMBER_CLAMP } from '../config.js';

export const FORMATIONS = ['line', 'wedge', 'circle'];
export const FORM_DEF = {
  line: { name: 'LINE', sx: 1.35, sz: 0.62, k: 0, horde: 1.12, boss: 1, guard: 0 },
  wedge: { name: 'WEDGE', sx: 0.86, sz: 0.78, k: 0.7, horde: 1, boss: 1.2, guard: 0 },
  circle: { name: 'CIRCLE', sx: 0.78, sz: 0.78, k: 0, horde: 0.9, boss: 0.9, guard: 0.25 },
};
const C = FORMATION.spacing * 0.525; // same phyllotaxis scale as squad.js
const MORPH = 0.45;
const MAX_HALF_W = MEMBER_CLAMP - 0.3;
const GUARDED = new Set(['horde', 'bomb']); // enemy contact + blasts (Circle's shrug-off)

export class Formation {
  init(game) {
    this.game = game;
    this.mode = 'line';
    this.from = { sx: 1, sz: 1, k: 0 };
    this.cur = { sx: 1, sz: 1, k: 0 };
    this.b = 1;
    this.ver = 0;
    this.out = { sx: 1, sz: 1, k: 0, R: 0, off: 0, halfW: 0, front: 0, back: 0, n: -1, ver: -1 };
    this.hordeK = 1; this.bossK = 1;
    this.changes = 0;
    this.snap('line');
  }

  snap(mode) {
    const d = FORM_DEF[mode] || FORM_DEF.line;
    this.mode = d === FORM_DEF[mode] ? mode : 'line';
    this.cur.sx = d.sx; this.cur.sz = d.sz; this.cur.k = d.k;
    this.b = 1; this.ver++;
    this.refresh();
  }

  /** Run start (and menus): LINE, no morph. */
  reset() { this.changes = 0; this.snap('line'); }

  get def() { return FORM_DEF[this.mode]; }
  get name() { return FORM_DEF[this.mode].name; }

  /** Switches to a formation (eased); false when unknown or already on it. */
  set(mode) {
    if (!FORM_DEF[mode] || mode === this.mode) return false;
    const c = this.cur, f = this.from;
    f.sx = c.sx; f.sz = c.sz; f.k = c.k;
    this.mode = mode;
    this.b = 0;
    this.changes++;
    this.refresh();
    const L = this.game.squad.leader;
    this.game.events.emit('formation:change', { mode, name: FORM_DEF[mode].name, pos: { x: L.x, y: 1, z: L.z } });
    return true;
  }

  /** LINE -> WEDGE -> CIRCLE -> LINE. Only while a run is live. */
  cycle() {
    const g = this.game, run = g.run;
    if (!run || !run.active || g.state !== 'playing') return false;
    const i = FORMATIONS.indexOf(this.mode);
    return this.set(FORMATIONS[(i + 1) % FORMATIONS.length]);
  }

  /** Damage multipliers (formation x combo); called on a mode change and by the combo on a tier change. */
  refresh() {
    const d = FORM_DEF[this.mode], cm = this.game.combo ? this.game.combo.mul : 1;
    this.hordeK = d.horde * cm;
    this.bossK = d.boss * cm;
  }

  /** Circle: a 25% chance (game.rng) that one enemy-touch / blast loss is ignored. */
  absorb(reason) {
    const g = this.game, run = g.run;
    if (!run || !run.active) return false;
    const p = FORM_DEF[this.mode].guard;
    if (!p || !GUARDED.has(reason)) return false;
    return g.rng.next() < p;
  }

  update(dt) {
    if (this.b >= 1) return;
    this.b = Math.min(1, this.b + dt / MORPH);
    const u = this.b, e = u * u * (3 - 2 * u), f = this.from, t = FORM_DEF[this.mode], c = this.cur;
    c.sx = f.sx + (t.sx - f.sx) * e; c.sz = f.sz + (t.sz - f.sz) * e; c.k = f.k + (t.k - f.k) * e;
    this.ver++;
  }

  /**
   * Shape parameters for n rendered members (cached): sx/sz/k, off (z of the disc centre behind the leader),
   * halfW, front/back (z extent behind the leader). Wide shapes narrow down (area kept) to fit the road.
   */
  shape(n) {
    const o = this.out;
    if (o.n === n && o.ver === this.ver) return o;
    const c = this.cur, R = C * Math.sqrt(n + 0.5);
    let sx = c.sx, sz = c.sz;
    if (sx * R > MAX_HALF_W && sx > 0.86) { const nx = Math.max(0.86, MAX_HALF_W / R); sz *= sx / nx; sx = nx; }
    o.sx = sx; o.sz = sz; o.k = c.k; o.R = R;
    o.off = FORMATION.leaderGap + sz * R * 0.85;
    o.halfW = Math.min(MEMBER_CLAMP, sx * R);
    o.front = o.off - sz * R;
    o.back = o.off + R * Math.sqrt(sz * sz + c.k * c.k * sx * sx);
    o.n = n; o.ver = this.ver;
    return o;
  }

  state() { return { mode: this.mode, name: this.name, morph: Math.round(this.b * 100) / 100, hordeK: this.hordeK, bossK: this.bossK, changes: this.changes }; }
}
