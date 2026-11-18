// Run twists for the game modes (Daily Challenge twist, Chaos Mode modifiers). Every twist except 'eliteHorde' is a
// shared run modifier from src/data/modifiers.js: modes pass those ids to game.beginRun as opts.mods, so
// game/runmods.js applies them exactly like the loadout modifiers (event copies, run.mods knobs, squad cap, fog,
// mirror steering, ONE LIFE). 'eliteHorde' (Daily only) is the one local twist: applyDef() edits a copy of the def.
// This file only adds the mode labels / icons and splits a twist list into shared ids + the local def edit.
import { MOD_BY_ID, cleanIds } from '../../data/modifiers.js';

/** Icon (ui/icons.js id) per twist for the mode cards, HUD chips and result tags. */
const ICO = {
  doubleSpeed: 'bolt', fog: 'freeze', halfSquad: 'squad', tinySquad: 'squad', onlyRed: 'damage', giantEnemies: 'skull',
  noGuns: 'tier', mirror: 'retry', noUpgrades: 'cart', oneLife: 'heart', eliteHorde: 'star',
};

const mapEvents = (d, fn) => ({ ...d, events: d.events.map((e) => fn({ ...e }) || null).filter(Boolean) });

/** Local twists (not in data/modifiers.js): def(d) -> an edited copy of the level def. */
const LOCAL = {
  eliteHorde: {
    label: 'ELITE HORDE', text: 'A third of the Murklings are elite',
    def: (d) => mapEvents(d, (e) => {
      if (e.type === 'horde') e.elite = Math.min(1, Math.round(((e.elite || 0) + 0.33) * 100) / 100);
      return e;
    }),
  },
};

/** Twist table: label (short, for "CHAOS: x2 SPEED + FOG"), text (one line), ico. Shared ids take the shared names. */
export const TWISTS = {};
for (const [id, m] of Object.entries(MOD_BY_ID)) TWISTS[id] = { label: m.name, text: m.desc, ico: ICO[id] || 'star', shared: true };
for (const [id, t] of Object.entries(LOCAL)) TWISTS[id] = { label: t.label, text: t.text, ico: ICO[id] || 'star', def: t.def };
export const TWIST_IDS = Object.keys(TWISTS);

export const usesShared = (id) => !!MOD_BY_ID[id];
/** The twist ids game.beginRun applies through data/modifiers.js (opts.mods). */
export const sharedIds = (ids) => cleanIds(ids);

export function twistLabel(id) { return (TWISTS[id] && TWISTS[id].label) || String(id).toUpperCase(); }
export const twistsText = (ids) => ids.map(twistLabel).join(' + ');

/** Level def with the local twists applied (a copy; the campaign def is never touched). Shared ids: see sharedIds. */
export function applyDef(ids, def) {
  let d = { ...def, events: def.events.map((e) => ({ ...e })) };
  for (const id of ids) { const t = LOCAL[id]; if (t) d = t.def(d); }
  return d;
}
