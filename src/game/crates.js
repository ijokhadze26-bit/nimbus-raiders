// Weapon crates (SPEC2 §2.10): level / endless events {type:'crate', at, lane, x, weapon}. When the crate's z
// passes the leader and |leader.x - crate.x| <= 1.6 the squad takes it: a different weapon is switched in
// (Mk kept, weapon:swap), the same weapon gets +1 Mk (+25 coins at Mk V). Locked weapons work from crates
// for that run only (nothing is saved). Bullets ignore crates; touching one never costs a raider.
// Visual: models/crate.js (pooled, max 2 alive, warmed).
import { MAX_MK } from '../data/weapons.js';
import { buildCrate } from '../models/crate.js';

const SPAWN_AHEAD = 110, TAKE_HALF = 1.6, KEEP_BEHIND = 12, MAX_ALIVE = 2;

export class Crates {
  init(game) {
    this.game = game;
    this.events = [];
    this.cursor = 0;
    this.live = [];
    this.pool = [];
    this.time = 0;
    this.taken = 0;
  }

  reset(run) {
    for (const c of this.live) this.release(c);
    this.live.length = 0;
    this.events = run ? run.eventsOf('crate') : [];
    this.cursor = 0;
    this.taken = 0;
  }

  skipAll() { this.cursor = this.events.length; for (const c of this.live) c.state = 'gone'; }

  release(c) {
    if (!c.v) return;
    this.game.scene.remove(c.v.root);
    this.pool.push(c.v);
    c.v = null;
  }

  visual(weapon) {
    const v = this.pool.length ? this.pool.pop() : buildCrate(weapon);
    if (v.setWeapon) v.setWeapon(weapon);
    this.game.scene.add(v.root);
    return v;
  }

  /** Crates not yet reached: [{ at, lane, weapon }] (debug.state().crates). */
  upcoming() {
    const out = [];
    for (const c of this.live) if (c.state === 'live') out.push({ at: c.at, lane: c.lane, weapon: c.weapon, x: c.x, z: c.z });
    for (let i = this.cursor; i < this.events.length; i++) { const e = this.events[i]; out.push({ at: e.at, lane: e.lane, weapon: e.weapon, x: e.x, z: -e.at }); }
    return out;
  }

  update(dt) {
    const game = this.game, run = game.run;
    this.time += dt;
    const L = game.squad.leader;
    const dist = -L.z;
    const ev = this.events;
    while (this.cursor < ev.length && ev[this.cursor].at - dist < SPAWN_AHEAD) {
      const e = ev[this.cursor++];
      const c = { at: e.at, lane: e.lane, x: e.x ?? 0, z: -e.at, weapon: e.weapon, kind: e.kind, state: 'live', t: 0, v: null };
      if (this.live.length < MAX_ALIVE) c.v = this.visual(e.kind === 'sabotage' ? 'sabotage' : e.weapon);
      this.live.push(c);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      c.t += dt;
      if (c.state === 'live' && run && run.active && L.z <= c.z) {
        if (Math.abs(L.x - c.x) <= TAKE_HALF) this.take(c); else c.state = 'missed';
      }
      if (c.state === 'gone' || c.z > L.z + KEEP_BEHIND || (c.state === 'taken' && c.t > 0.6)) {
        this.release(c);
        this.live.splice(i, 1);
      }
    }
  }

  take(c) {
    const game = this.game, w = game.weapons;
    c.state = 'taken'; c.t = 0;
    this.taken++;
    const pos = { x: c.x, y: 1, z: c.z };
    if (c.kind === 'sabotage') { game.events.emit('crate:take', { kind: 'sabotage', weapon: c.weapon, pos }); return; } // online only
    if (c.weapon !== w.id) w.setWeapon(c.weapon);
    else if (w.mk < MAX_MK) w.upgrade(1);
    else { game.run.coins += 25; game.events.emit('coin:collect', { amount: 25, pos }); }
    game.events.emit('crate:take', { weapon: c.weapon, pos });
  }

  sync() {
    for (const c of this.live) {
      const v = c.v;
      if (!v) continue;
      v.root.position.set(c.x, 0, c.z);
      const s = c.state === 'taken' ? Math.max(0.01, 1 - c.t / 0.35) : c.state === 'missed' ? 0.85 : 1;
      v.root.scale.setScalar(s);
      if (v.update) v.update(this.time, c);
    }
  }
}
