// Run twists for the game modes (Daily Challenge twist, Chaos Mode modifiers). Stage 5 note: the shared modifier
// data lives in src/data/modifiers.js (owned by the "squad" builder, merged later). Until it exists this LOCAL
// STUB implements every id the modes use, in two parts:
//   def(d)    -> a level def copy changed before the run starts (gates, barrels, hordes, speed)
//   run(game) -> applied right after game.beginRun (squad size, fog, mirror steering, giant enemies)
// PREFERRING THE SHARED FILE: import.meta.glob below picks src/data/modifiers.js up automatically once it is
// merged (the glob is empty while the file is missing, so the build never breaks). For every id the shared file
// knows (MODIFIERS[id] / MODIFIER_BY_ID[id] with apply(), or an `apply(id, def, run, game)` export), applyRun()
// calls its apply(def, run, game) once right after beginRun (def === run.def, a private copy with copied events)
// and skips the local def()/run() parts of that id. Ids the shared file lacks ('eliteHorde') stay local.
// If the integrator's game.js modifier hook already applies runOpts.modifiers inside beginRun, set
// SHARED_IN_BEGINRUN = true: modes then only pass opts.modifiers to beginRun and never call the shared apply.
import { START_SQUAD } from '../../config.js';

const SHARED_FILES = import.meta.glob('../../data/modifiers.js', { eager: true });
const SHARED = Object.values(SHARED_FILES)[0] || null;
export const SHARED_IN_BEGINRUN = false;

const FOG_MUL = 0.4;     // view distance ~40%
const GIANT = { size: 1.5, hp: 2.2, count: 0.7 };

const mapEvents = (d, fn) => ({ ...d, events: d.events.map((e) => fn({ ...e }) || null).filter(Boolean) });

/** Local twist table: label (short, for "CHAOS: x2 SPEED + FOG"), text (one line), icon id, parts. */
export const TWISTS = {
  doubleSpeed: {
    label: 'x2 SPEED', text: 'The squad runs twice as fast', ico: 'bolt',
    def: (d) => ({ ...d, speed: Math.round((d.speed || 10) * 2 * 100) / 100 }),
  },
  fog: { label: 'FOG', text: 'Heavy fog: you see 40% as far', ico: 'freeze', run: (g) => { g.modes.fx.fogMul = FOG_MUL; } },
  halfSquad: {
    label: 'HALF SQUAD', text: 'Start with half your Raiders', ico: 'squad',
    run: (g) => g.squad.reset(Math.max(1, Math.ceil(g.squad.count / 2)), 0),
  },
  tinySquad: {
    label: 'TINY SQUAD', text: 'Start alone, blue gates give less', ico: 'squad',
    def: (d) => mapEvents(d, (e) => {
      if (e.type === 'gate' && e.op === 'add' && e.value > 0) { e.value = Math.max(1, Math.round(e.value * 0.6)); if (e.max > 0) e.max = Math.max(e.value, Math.round(e.max * 0.6)); }
      return e;
    }),
    run: (g) => g.squad.reset(1, 0),
  },
  onlyRed: {
    label: 'ONLY RED GATES', text: 'Every gate starts red: shoot them blue', ico: 'damage',
    def: (d) => mapEvents(d, (e) => {
      if (e.type !== 'gate') return e;
      if (e.op === 'add') { const v = Math.abs(e.value || 1); e.value = -Math.max(1, Math.round(v * 0.5)); if (!(e.max > 0)) e.max = -1; return e; }
      if (e.op === 'mul') { e.op = 'div'; e.rung = 2; } // ÷2 (it still climbs when shot, if the gate allowed it)
      return e;
    }),
  },
  giantEnemies: {
    label: 'GIANT ENEMIES', text: 'Fewer Murklings, but huge and tough', ico: 'skull',
    def: (d) => mapEvents(d, (e) => {
      if (e.type !== 'horde') return e;
      e.count = Math.max(4, Math.round(e.count * GIANT.count));
      e.hpMul = Math.round((e.hpMul || 1) * GIANT.hp * 100) / 100;
      return e;
    }),
    run: (g) => { g.modes.fx.giant = GIANT.size; },
  },
  noGuns: {
    label: 'NO GUN BARRELS', text: 'No weapon barrels or crates', ico: 'tier',
    def: (d) => mapEvents(d, (e) => {
      if (e.type === 'crate') return null;
      if (e.type === 'barrel' && e.reward && e.reward.kind === 'weapon') e.reward = { kind: 'coins', amount: 25 };
      return e;
    }),
  },
  mirror: { label: 'MIRROR STEERING', text: 'Left is right, right is left', ico: 'retry', run: (g) => { g.modes.fx.mirror = true; } },
  // the two loadout-only modifiers (never rolled by Daily / Chaos; mapped so the stub covers all 10 shared ids)
  noUpgrades: {
    label: 'NO SHOP UPGRADES', text: 'Shop upgrades are switched off', ico: 'cart',
    run: (g) => {
      g.squad.reset(START_SQUAD + (g.heroes.startBonus || 0), 0);
      g.weapons.reset(g.run, { weapon: g.run.weapon, mk: 1, dmgMul: 1, rateMul: 1 });
    },
  },
  oneLife: {
    label: 'ONE LIFE', text: 'Lose half your peak squad and the run ends', ico: 'heart',
    def: (d) => mapEvents(d, (e) => (e.type === 'powerup' && e.kind === 'shield' ? null : e)),
    run: (g) => { g.heroes.guard = 0; g.heroes.guardMax = 0; g.modes.fx.oneLife = true; },
  },
  eliteHorde: {
    label: 'ELITE HORDE', text: 'A third of the Murklings are elite', ico: 'star',
    def: (d) => mapEvents(d, (e) => {
      if (e.type === 'horde') e.elite = Math.min(1, Math.round(((e.elite || 0) + 0.33) * 100) / 100);
      return e;
    }),
  },
};
export const TWIST_IDS = Object.keys(TWISTS);

/** The shared module's apply for an id, or null (several export shapes are accepted). */
export function sharedApply(id) {
  if (!SHARED) return null;
  const table = SHARED.MODIFIERS || SHARED.MODIFIER_BY_ID || SHARED.default || null;
  const m = table && (Array.isArray(table) ? table.find((x) => x && x.id === id) : table[id]);
  if (m && typeof m.apply === 'function') return (def, run, game) => m.apply(def, run, game);
  if (typeof SHARED.apply === 'function' && Array.isArray(SHARED.MODIFIER_IDS) && SHARED.MODIFIER_IDS.includes(id)) return (def, run, game) => SHARED.apply(id, def, run, game);
  return null;
}
export const usesShared = (id) => !!sharedApply(id);

export function twistLabel(id) { return (TWISTS[id] && TWISTS[id].label) || String(id).toUpperCase(); }
export const twistsText = (ids) => ids.map(twistLabel).join(' + ');

/** Level def with the def parts of the twists (a copy; the campaign def is never touched). */
export function applyDef(ids, def) {
  let d = { ...def, events: def.events.map((e) => ({ ...e })) };
  for (const id of ids) {
    const t = TWISTS[id];
    if (t && t.def && (SHARED_IN_BEGINRUN || !usesShared(id))) d = t.def(d);
  }
  return d;
}

/** After beginRun: the run parts (local) or the shared apply(def, run, game). */
export function applyRun(ids, game) {
  for (const id of ids) {
    const sh = !SHARED_IN_BEGINRUN && sharedApply(id);
    if (sh) { sh(game.run.def, game.run, game); continue; }
    if (SHARED_IN_BEGINRUN && usesShared(id)) continue;
    const t = TWISTS[id];
    if (t && t.run) t.run(game);
  }
}
