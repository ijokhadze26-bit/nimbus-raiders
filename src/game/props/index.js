// Road objects (update 3 stage 4, "props"): cranes, dams, bells and boulders the squad uses against the horde.
// Level events { type:'prop', kind:'crane'|'dam'|'bell'|'boulder', at, lane?:'L'|'R', hp?, hint? } (placed by
// src/data/propplan.js) spawn ~110 u ahead like barrels. Each kind module (crane.js, dam.js, bell.js,
// boulder.js) owns its objects: { kind, create(sys, ev) -> obj, update(sys, obj, dt) -> bool (false = remove),
// sync(sys, obj, dt), release(sys, obj), trigger?(sys, obj) }.
// Shootable kinds (crane hook, dam gate, bell) expose on their object: shoot (true while it can be hit), hp,
// max, tx / th (x centre / half width of the hit band), z, flash. ONE bullet target system serves them all
// (bit HIT.BARREL, like barrels and gumballs: tracers carry the damage as bdmg, main projectiles fly past),
// and hp <= 0 calls kind.trigger. Boulders are pushed by running into them from behind (boulder.js).
// Step order: after the horde (game.step), so kills / stuns / knock-backs act on this step's enemy positions,
// and the dam's squad push lands in hazards.mods (reset at hazards.update) for the next squad step.
// No randomness in the simulation (visual-only Math.random in fx); hints show once per run (hazard:hint).
import { HIT } from '../../config.js';
import { KINDS, KIND_LIST } from './kinds.js';
import { COMMON } from './common.js';
import { registerWarm } from '../warmup.js';

const SPAWN_AHEAD = 110;
const HINT_AHEAD = 50;
export const PROP_HINT_COLOR = '#ffd34d';

registerWarm((game) => {
  const sys = game.props;
  if (!sys) return null;
  const out = [];
  for (const k of KIND_LIST) {
    if (!k.warm) continue;
    try { const r = k.warm(sys); if (r) out.push(...[].concat(r)); } catch (e) { console.warn('[props] warm', k.kind, e); }
  }
  return out;
});

const hasHit = (bl, t) => { for (let i = 0; i < bl.nh; i++) if (bl.hits[i] === t) return true; return false; };

export class Props {
  init(game) {
    this.game = game;
    this.list = [];
    this.cursor = 0;
    this.run = null;
    this.time = 0;
    this.dt = 0;
    this.views = {};
    this.hinted = new Set();
    this.stunT = 0;
    this.stats = { spawned: {}, triggered: {}, kills: {}, stunned: 0 };
    this.hitPos = { x: 0, y: 0, z: 0 };
    game.events.setRate('hazard:sfx', 14);
    const sys = this;
    this.target = {
      kind: 'prop', bit: HIT.BARREL, priority: 7,
      sweep(bl, x, zHi, zLo) {
        if (!(bl.bdmg > 0)) return null; // main projectiles fly past (they are for the horde)
        let best = null;
        for (let i = 0; i < sys.list.length; i++) {
          const o = sys.list[i];
          if (!o.shoot) continue;
          const front = o.z + 0.6;
          if (front > zHi + 1.2 || front < zLo || Math.abs(x - o.tx) > o.th) continue;
          if (best && o.z <= best.z) continue;
          if (bl.nh && hasHit(bl, o)) continue;
          best = o;
        }
        return best;
      },
      hit(o, bl) { return sys.hit(o, bl); },
    };
    game.bullets.addTargetSystem(this.target);
  }

  reset(run) {
    for (const o of this.list) o.def.release(this, o);
    this.list.length = 0;
    this.cursor = 0;
    this.run = run;
    this.time = 0;
    this.stunT = 0;
    this.hinted.clear();
    this.stats = { spawned: {}, triggered: {}, kills: {}, stunned: 0 };
    for (const k of KIND_LIST) if (k.resetAll) k.resetAll(this);
  }

  /** Debug skipToBoss: nothing left to spawn, everything gone. */
  skipAll() {
    for (const o of this.list) o.def.release(this, o);
    this.list.length = 0;
    if (this.run) this.cursor = this.run.eventsOf('prop').length;
    this.stunT = 0;
  }

  update(dt) {
    const run = this.run;
    this.dt = dt;
    if (!run) return;
    this.time += dt;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    const dist = this.dist;
    const evs = run.eventsOf('prop');
    while (this.cursor < evs.length && evs[this.cursor].at - dist < SPAWN_AHEAD) {
      const e = evs[this.cursor++];
      const def = KINDS[e.kind];
      if (!def) continue;
      const o = def.create(this, e);
      if (!o) continue;
      o.def = def; o.ev = e;
      this.list.push(o);
      this.stats.spawned[e.kind] = (this.stats.spawned[e.kind] || 0) + 1;
    }
    for (const k of KIND_LIST) if (k.step) k.step(this, dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (o.ev.hint && !this.hinted.has(o.ev) && o.ev.at - dist < HINT_AHEAD && run.phase === 'run') {
        this.hinted.add(o.ev);
        this.game.events.emit('hazard:hint', { kind: 'prop', text: o.ev.hint, color: PROP_HINT_COLOR });
      }
      if (!o.def.update(this, o, dt)) { o.def.release(this, o); this.list.splice(i, 1); }
    }
  }

  /** Bullet hit on a shootable prop (tracers only reach here). */
  hit(o, bl) {
    o.flash = 1;
    const run = this.game.run;
    if (!run || !run.active || !o.shoot) return true;
    o.hp -= bl.bdmg;
    const p = this.hitPos; p.x = bl.x; p.y = bl.y + 0.3; p.z = o.z + 0.6;
    const ev = this.game.events;
    if (ev.wants('bullet:hit')) ev.emit('bullet:hit', { kind: 'barrel', pos: p });
    if (o.hp <= 0) this.fire(o);
    return true;
  }

  /** Sets a shootable prop off (hp gone, or tests / debug). */
  fire(o) {
    if (!o.shoot) return false;
    o.shoot = false; o.hp = 0;
    this.stats.triggered[o.ev.kind] = (this.stats.triggered[o.ev.kind] || 0) + 1;
    this.game.events.emit('prop:trigger', { kind: o.ev.kind, x: o.tx, z: o.z });
    o.def.trigger(this, o);
    return true;
  }

  sync(dt) {
    for (const o of this.list) o.def.sync(this, o, dt);
    for (const k of KIND_LIST) if (k.post) k.post(this, dt);
  }

  /** Test / debug summary. */
  state() {
    return {
      live: this.list.map((o) => ({ kind: o.ev.kind, at: o.ev.at, lane: o.ev.lane || null, state: o.state, hp: o.hp != null ? Math.max(0, Math.ceil(o.hp)) : null })),
      spawned: { ...this.stats.spawned }, triggered: { ...this.stats.triggered }, kills: { ...this.stats.kills }, stunned: this.stats.stunned,
    };
  }

  dispose() {}
}

Object.defineProperties(Props.prototype, Object.getOwnPropertyDescriptors(COMMON));
