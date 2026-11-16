// World hazards (update 3, SPEC3 stage 2): lava, embers, cracking floors, geysers, ice, snowstorms, icicles,
// avalanches, jelly pads, syrup, gumballs, chocolate falls, moving platforms, lightning, wind, collapsing
// bridges. Level events { type:'hazard', kind, at, lane?, length?, ...params } (src/data/hazardplan.js places
// them) spawn ~110 u ahead like obstacles.js (kinds with reserve() cut their holes ~230 u ahead); each kind
// module (registry.js) owns its objects. Step order: after obstacles (game.step); sync after obstacles.
// Every step `mods` is reset and then written by the active hazards; other systems read it:
//   easeMul (squad steering), slide (0..1 ice momentum), pushX (u/s sideways), speedMul (forward speed),
//   airborne (no gap falls), fogMul (world fog), dark (dimmer light).
// `danger` (rebuilt every step) lists telegraph-shaped zones {kind:'circle', x, z, r} / {kind:'lane', x0, x1,
// zNear, zFar} (+ pad / shift / w) the autopilot keeps the squad out of. Hint texts on an event show once per run
// as a HUD line (hazard:hint) shortly before the squad reaches it. Randomness: the system's own seeded Rng
// (per level), never Math.random in the simulation.
import { Rng } from '../../core/rng.js';
import { KINDS, KIND_LIST } from './registry.js';
import { COMMON } from './common.js';
import { registerWarm } from '../warmup.js';

const SPAWN_AHEAD = 110;
// kinds with reserve(sys, ev) claim their road earlier (a hazard-made gap must exist before its tiles come into
// view; obstacles.js spawns level gaps 230 ahead too); create() then finds the result in sys.reserved.get(ev)
const RESERVE_AHEAD = 230;
const HINT_AHEAD = 48;
export const HINT_COLORS = { 2: '#ff8a3d', 3: '#8fe3ff', 4: '#ff7ad1', 5: '#b49dff' };

registerWarm((game) => {
  const sys = game.hazards;
  if (!sys) return null;
  const out = [];
  for (const k of KIND_LIST) {
    if (!k.warm) continue;
    try { const r = k.warm(sys); if (r) out.push(...[].concat(r)); } catch (e) { console.warn('[hazards] warm', k.kind, e); }
  }
  return out;
});

export function freshMods(m = {}) {
  m.easeMul = 1; m.slide = 0; m.pushX = 0; m.speedMul = 1; m.airborne = false; m.fogMul = 1; m.dark = 0; m.lift = 0;
  return m;
}

export class Hazards {
  init(game) {
    this.game = game;
    this.list = [];
    this.cursor = 0;
    this.rcursor = 0;
    this.reserved = new Map();
    this.run = null;
    this.time = 0;
    this.dt = 0;
    this.mods = freshMods();
    this.danger = [];
    this.rng = new Rng(1);
    this.views = {};
    this.used = new Set();
    this.budget = new Map();
    this.carry = 0;
    this.hinted = new Set();
    this.stats = { spawned: {}, kills: {} };
    game.events.setRate('hazard:sfx', 14);
  }

  reset(run) {
    for (const o of this.list) o.def.release(this, o);
    this.list.length = 0;
    this.cursor = 0;
    this.rcursor = 0;
    this.reserved.clear();
    this.run = run;
    this.time = 0;
    freshMods(this.mods);
    this.danger.length = 0;
    this.budget.clear();
    this.carry = 0;
    this.hinted.clear();
    this.stats = { spawned: {}, kills: {} };
    this.rng.seed(run ? run.def.id * 7349 + 11 : 1);
  }

  /** Debug skipToBoss: nothing left to spawn, everything gone. */
  skipAll() {
    const run = this.run;
    for (const o of this.list) o.def.release(this, o);
    this.list.length = 0;
    if (run) this.cursor = this.rcursor = run.eventsOf('hazard').length;
    this.reserved.clear();
    freshMods(this.mods);
    this.danger.length = 0;
  }

  update(dt) {
    freshMods(this.mods);
    this.danger.length = 0;
    this.dt = dt;
    const run = this.run;
    if (!run) return;
    this.time += dt;
    const dist = this.dist;
    const evs = run.eventsOf('hazard');
    while (this.rcursor < evs.length && evs[this.rcursor].at - dist < RESERVE_AHEAD) {
      const e = evs[this.rcursor++];
      const def = KINDS[e.kind];
      if (def && def.reserve) this.reserved.set(e, def.reserve(this, e));
    }
    while (this.cursor < evs.length && evs[this.cursor].at - dist < SPAWN_AHEAD) {
      const e = evs[this.cursor++];
      const def = KINDS[e.kind];
      if (!def) continue;
      const o = def.create(this, e);
      if (!o) continue;
      o.def = def; o.ev = e;
      this.used.add(def);
      this.list.push(o);
      this.stats.spawned[e.kind] = (this.stats.spawned[e.kind] || 0) + 1;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (o.ev.hint && !this.hinted.has(o.ev) && o.ev.at - dist < HINT_AHEAD && run.phase === 'run') {
        this.hinted.add(o.ev);
        this.game.events.emit('hazard:hint', { kind: o.ev.kind, text: o.ev.hint, color: HINT_COLORS[run.worldId] || '#ffd34d' });
      }
      if (!o.def.update(this, o, dt)) { o.def.release(this, o); this.list.splice(i, 1); }
    }
  }

  sync(dt) {
    for (const k of this.used) if (k.pre) k.pre(this, dt);
    for (const o of this.list) o.def.sync(this, o, dt);
    for (const k of this.used) if (k.post) k.post(this, dt);
  }

  /** Test / debug summary. */
  state() {
    return {
      live: this.list.map((o) => ({ kind: o.ev.kind, at: o.ev.at, state: o.state || null })),
      mods: { ...this.mods },
      danger: this.danger.length,
      spawned: { ...this.stats.spawned },
      kills: { ...this.stats.kills },
    };
  }

  dispose() {}
}

Object.defineProperties(Hazards.prototype, Object.getOwnPropertyDescriptors(COMMON));
