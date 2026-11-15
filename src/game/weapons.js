// Weapons runtime (SPEC2 §1, §6.3): the equipped weapon (id, Mk, behaviour), the fire accumulator with
// bullet bundling (visual budget with DPS conservation), tracers (the weapon-independent gate / barrel
// economy), fire events, and the stats API the bot and the UI read. One behaviour instance per weapon is
// built at boot (all bullet styles registered + warmed); only the equipped one fires.
import { BULLETS, HIT, TRACER } from '../config.js';
import { MAX_MK, MKREF, GATE_RATE, WEAPON_IDS, DEFAULT_WEAPON, weaponDef } from '../data/weapons.js';
import { behaviourClass } from './weapons/registry.js';

const FXQ_SIZE = 128;

/** Pull ring buffer for two-endpoint visuals (arcs, bounce segments); fx/weapons drains it each frame. */
export class FxQueue {
  constructor(n = FXQ_SIZE) {
    this.buf = Array.from({ length: n }, () => ({ kind: '', weapon: '', mk: 1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, n: 0, t: 0 }));
    this.head = 0; this.len = 0;
  }
  /** Returns the entry to fill (overwrites the oldest when full). */
  push(kind) {
    const e = this.buf[(this.head + this.len) % this.buf.length];
    if (this.len < this.buf.length) this.len++; else this.head = (this.head + 1) % this.buf.length;
    e.kind = kind;
    return e;
  }
  /** Calls fn(entry) for every queued entry, oldest first, then empties the queue. */
  drain(fn) {
    for (let i = 0; i < this.len; i++) fn(this.buf[(this.head + i) % this.buf.length]);
    this.head = 0; this.len = 0;
  }
  clear() { this.head = 0; this.len = 0; }
}

export class Weapons {
  init(game) {
    this.game = game;
    this.id = DEFAULT_WEAPON;
    this.def = weaponDef(this.id);
    this.mk = 1;
    this.acc = 0; this.rr = 0; this.showAcc = 0;      // main volleys
    this.tAcc = 0; this.trr = 0; this.tShowAcc = 0;   // tracers
    this.rateMul = 1; this.dmgMul = 1;                // shop upgrades
    this.enabled = true;
    this.muzzle = { x: 0, y: 0, z: 0 };
    this.firePos = { x: 0, y: 0, z: 0 };
    this.lastShotsPerSec = 0;
    this.fxq = new FxQueue();
    this.v = { x: 0, y: 0, z: 0, lead: 0, dmg: 0, unit: 0, shots: 1, show: true, mk: 1, range: 60, pierce: 0, idx: 0 };
    this.firePayload = { tier: 1, mk: 1, weapon: this.id, pos: this.firePos };
    this.behaviours = {};
    for (const id of [...WEAPON_IDS, 'ref']) {
      const Cls = behaviourClass(id);
      const b = new Cls(this, weaponDef(id));
      b.init();
      this.behaviours[id] = b;
    }
    this.beh = this.behaviours[this.id];
    this.beh.equip(1);
  }

  /** @deprecated alias of mk (debug.state().tier, old callers). */
  get tier() { return this.mk; }

  /** Run start: weapon + Mk + shop modifiers (silent; nothing is emitted). */
  reset(run, { weapon = this.id, mk = 1, dmgMul = 1, rateMul = 1 } = {}) {
    this.acc = 0; this.rr = 0; this.showAcc = 0;
    this.tAcc = 0; this.trr = 0; this.tShowAcc = 0;
    this.rateMul = rateMul;
    this.dmgMul = dmgMul;
    this.fxq.clear();
    for (const id in this.behaviours) this.behaviours[id].reset();
    this.setWeapon(weapon, { silent: true });
    this.setMk(mk, { silent: true, force: true });
  }

  /** Switches weapon keeping the Mk. Emits weapon:swap unless silent (crates). */
  setWeapon(id, { silent = false } = {}) {
    if (!this.behaviours[id]) id = DEFAULT_WEAPON;
    if (id === this.id) return false;
    const from = this.id;
    this.beh.unequip();
    this.id = id;
    this.def = weaponDef(id);
    this.beh = this.behaviours[id];
    this.beh.equip(this.mk);
    this.applyLook();
    if (!silent) {
      const L = this.game.squad.leader;
      this.game.events.emit('weapon:swap', { from, to: id, mk: this.mk, name: this.def.name, pos: { x: L.x, y: 1.5, z: L.z } });
    }
    return true;
  }

  /** Sets the Mk (1..5). Emits weapon:tier (kept name) on a change unless silent. */
  setMk(n, { silent = false, force = false } = {}) {
    const nm = Math.max(1, Math.min(MAX_MK, n | 0));
    const changed = nm !== this.mk;
    this.mk = nm;
    if (changed || force) { this.beh.setMk(nm); this.applyLook(); }
    if (changed && !silent) {
      const L = this.game.squad.leader;
      this.game.events.emit('weapon:tier', { tier: nm, mk: nm, weapon: this.id, name: this.def.name, pos: { x: L.x, y: 1.5, z: L.z } });
    }
    return nm;
  }

  /** @deprecated alias of setMk (old callers). */
  setTier(t, silent = false) { return this.setMk(t, { silent }); }

  upgrade(n = 1) { return this.setMk(this.mk + n); }

  /** Gun geometry + paint colour for the current weapon / Mk (game/loadout.js). */
  applyLook() { if (this.game.loadout) this.game.loadout.applyGun(this.id, this.mk); }

  // ---------------- stats (bot + UI) ----------------
  heroes() { return this.game.heroes; }
  /** Shop rate x rapid-fire power x hero rate. */
  rates() {
    const p = this.game.powers && this.game.powers.rateMul ? this.game.powers.rateMul : 1;
    const h = this.heroes();
    return this.rateMul * p * (h ? h.rateMul : 1);
  }
  /** Damage multiplier of the equipped weapon's hits: shop x hero (generic, favourite, fire). */
  damageMul(id = this.id) { const h = this.heroes(); return this.dmgMul * (h ? h.dmgMulFor(id) : 1); }

  /** Tracer volleys / s of the squad (gate hits per second, uncapped). */
  gateRate(count = this.game.squad.count) { return count * GATE_RATE[this.mk - 1] * this.rates(); }
  /** Gate hits per second the squad's fire is worth (<= 200, device independent). */
  gateShotsPerSec() { return Math.min(BULLETS.budgetHigh, this.gateRate()); }
  /** Barrel damage / s (tracers): count * MKREF * shop * rates * generic hero bonus. */
  barrelDps(count = this.game.squad.count) {
    const h = this.heroes();
    return count * MKREF[this.mk] * this.dmgMul * this.rates() * (h ? h.dmgMul : 1);
  }
  /** Single-target sheet DPS of the whole squad (before matchups). */
  sheetDps(count = this.game.squad.count) { return count * this.beh.sheetDps(this.mk) * this.damageMul() * this.rates(); }
  /** Effective crowd DPS against a mix {type: share} (bot hordeGoal, UI estimates). */
  crowdDps(mix, count) { return this.sheetDps(count) * this.beh.crowdFactor(mix); }
  /** Effective boss DPS against a boss type. */
  bossDps(type, count) { return this.sheetDps(count) * this.beh.bossFactor(type); }

  // ---------------- firing ----------------
  update(dt) {
    const game = this.game;
    if (!this.enabled) return;
    const squad = game.squad;
    const count = squad.count;
    const rates = this.rates();
    const shooters = squad.rendered;
    const bullets = game.bullets;
    const run = game.run;
    const boss = !!(run && run.phase === 'boss');
    // ---- tracers: gate + barrel economy, identical for every weapon ----
    const Sg = count * GATE_RATE[this.mk - 1] * rates;
    const vis = Math.min(Sg, BULLETS.budgetHigh);
    if (vis > 0) {
      const h = this.heroes();
      const gw = Sg / vis;
      const bdmg = (count * MKREF[this.mk] * this.dmgMul * rates * (h ? h.dmgMul : 1)) / vis;
      const style = this.beh.tracerStyle;
      this.tAcc += vis * dt;
      const total = Math.floor(this.tAcc);
      for (let s = 0; s < total; s++) {
        this.tAcc -= 1;
        const p = squad.muzzle(this.pick(shooters, true), this.muzzle);
        const lead = (s / Math.max(1, total)) * dt * TRACER.speed;
        this.tShowAcc += BULLETS.budgetLow / BULLETS.budgetHigh;
        const show = this.tShowAcc >= 1;
        if (show) this.tShowAcc -= 1;
        const b = bullets.spawn(style, p.x, p.y, p.z + lead, 0, -TRACER.speed, 0, 0, 0, TRACER.range);
        if (b) { b.mask = HIT.GATE | HIT.BARREL; b.gw = gw; b.bdmg = bdmg; b.show = show; }
      }
    }
    // ---- main projectiles (bundled: DPS conserved under the visual budget) ----
    const beh = this.beh, mk = this.mk;
    const row = beh.row(mk);
    const pellets = row.pellets || 1;
    const S = count * row.rate * rates;                 // real volleys per second (whole squad)
    const visual = Math.min(S, (this.def.visualCap || BULLETS.budgetHigh) / pellets);
    this.lastShotsPerSec = S;
    if (visual <= 0) return;
    const unit = beh.unitDamage(mk) * this.damageMul();
    const shots = S / visual;
    const h = this.heroes();
    let range = (row.range || BULLETS.range) * (h ? h.rangeMul : 1);
    if (boss) range = Math.max(range, 40);
    const pierce = (row.pierce || 0) + (h ? h.pierceAdd(this.id) : 0);
    const v = this.v;
    v.dmg = unit * shots; v.unit = unit; v.shots = shots; v.mk = mk; v.range = range; v.pierce = pierce;
    this.acc += visual * dt;
    const speed = row.speed || 60;
    let fired = false;
    // spread spawn times across the step to avoid visible bullet "rows"
    const total = Math.floor(this.acc);
    for (let s = 0; s < total; s++) {
      this.acc -= 1;
      const idx = this.pick(shooters, false);
      const p = squad.muzzle(idx, this.muzzle);
      this.showAcc += BULLETS.budgetLow / BULLETS.budgetHigh;
      const show = this.showAcc >= 1;
      if (show) this.showAcc -= 1;
      v.x = p.x; v.y = p.y; v.z = p.z; v.idx = idx; v.show = show;
      v.lead = (s / Math.max(1, total)) * dt * speed;
      beh.fire(v);
      if (!fired) { fired = true; this.firePos.x = p.x; this.firePos.y = p.y; this.firePos.z = p.z; }
    }
    if (fired && game.events.wants('weapon:fire')) {
      const fp = this.firePayload;
      fp.tier = mk; fp.mk = mk; fp.weapon = this.id;
      game.events.emit('weapon:fire', fp);
    }
  }

  /** After bullets each step (SPEC2 §6.7): the equipped behaviour's cadences. */
  updateBehaviour(dt) { if (this.game.run && this.game.run.active) this.beh.update(dt); }

  /**
   * Round-robin across shooters, biased toward the front of the blob (low slot indices). Tracers keep their
   * own counter so the main volleys follow the shipped pattern.
   */
  pick(n, tracer) {
    if (n <= 1) return 0;
    const rr = tracer ? ++this.trr : ++this.rr;
    const front = Math.max(1, Math.ceil(n * 0.45));
    if (rr & 1) return (rr >> 1) % front;
    return (rr >> 1) % n;
  }

  /** @deprecated */
  pickShooter(n) { return this.pick(n, false); }

  dispose() {}
}
