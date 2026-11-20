// Run modifiers (update 3 stage 5). Two kinds share this one list:
// - PLAYER modifiers (player: true): toggled on the loadout before a campaign level for extra coins
//   (bonuses add up: all four = +115%). Remembered in save.modifiers.
// - TWISTS (player: false, bonus 0): used by the game modes (Daily Challenge, Chaos Mode), which add their own pay.
// Contract (STAGE5.md): every modifier has apply(def, run, game). game.beginRun calls applyMods(ids, def, run, game)
// right after the Run is built and before any system resets, so apply() may
//   - write run-time knobs into run.mods (read by game.beginRun, game/runmods.js and the squad), and
//   - replace run.byType[type] with edited COPIES of the events (the campaign def and its events are never touched).
// run.def stays the campaign def, so RETRY (which passes the same ids again) never applies a modifier twice.

/** Copies the events of one type through fn(copy) -> copy | null (null drops it). Order (by `at`) is kept. */
function editEvents(run, type, fn) {
  const list = run.byType[type];
  if (!list || !list.length) return;
  const out = [];
  for (const e of list) { const c = fn({ ...e }); if (c) out.push(c); }
  run.byType[type] = out;
}

/**
 * Edits every gate spec of the gate events through fn(spec) (mutates the copy): the gate itself and, for a chain
 * follow-up gate (data/roadplan.js), each spec in e.alt[family] that it takes when it reveals (game/gatefeat.js).
 */
function editGates(run, fn) {
  editEvents(run, 'gate', (e) => {
    fn(e);
    if (e.alt) { const alt = {}; for (const [f, s] of Object.entries(e.alt)) alt[f] = s ? fn({ ...s }) : s; e.alt = alt; }
    return e;
  });
}

/** Ladder rungs (config GATE.rungs): 0..2 are ÷4 ÷3 ÷2, 3..5 are ×2 ×3 ×4; mirror = the same k on the bad side. */
export const badRung = (r) => (r >= 3 ? 5 - r : r);

/** HALF SQUAD: a + gate gives half (at least 1). */
function halfSpec(s) {
  if (s.op === 'add' && (s.value | 0) > 0) {
    s.value = Math.max(1, Math.ceil(s.value / 2));
    if (s.max != null) s.max = Math.max(s.value, Math.ceil(s.max / 2));
  }
  return s;
}

/** ONLY RED GATES: + becomes - (half), x becomes the same-size ÷ (shoot it back up). */
export function redSpec(s) {
  if (s.op === 'add') { if ((s.value | 0) > 0) s.value = -Math.max(1, Math.round(s.value / 2)); }
  else if (s.rung !== undefined) { s.rung = badRung(s.rung); if (s.op === 'mul') s.op = 'div'; }
  else if (s.op === 'mul') s.op = 'div';
  return s;
}

export const MODIFIERS = [
  {
    id: 'noUpgrades', name: 'NO UPGRADES', bonus: 0.30, player: true, icon: 'tier', color: '#8a4dff',
    desc: 'Your shop upgrades are switched off for this run.',
    apply(def, run) { run.mods.noUpgrades = true; },
  },
  {
    id: 'halfSquad', name: 'HALF SQUAD', bonus: 0.25, player: true, icon: 'squad', color: '#2f8cff',
    desc: 'Start with half the Raiders, and + gates give half.',
    apply(def, run) {
      run.mods.startMul *= 0.5;
      editGates(run, halfSpec);
    },
  },
  {
    id: 'oneLife', name: 'ONE LIFE', bonus: 0.40, player: true, icon: 'heart', color: '#ff3b4e',
    desc: 'No hero Guard, no shield power-ups. Lose half your biggest squad and the run ends.',
    apply(def, run) {
      run.mods.oneLife = true;
      editEvents(run, 'powerup', (e) => { if (e.kind === 'shield') e.kind = 'rapid'; return e; });
    },
  },
  {
    id: 'fog', name: 'FOG', bonus: 0.20, player: true, icon: 'quality', color: '#7d8db0',
    desc: 'Thick fog: you see less than half as far ahead.',
    apply(def, run) { run.mods.fogMul *= 0.4; },
  },
  // ---- twists (game modes) ----
  {
    id: 'doubleSpeed', name: 'x2 SPEED', bonus: 0, player: false, icon: 'rate', color: '#ffae1a',
    desc: 'The squad runs twice as fast.',
    apply(def, run) { run.speed *= 2; },
  },
  {
    id: 'tinySquad', name: 'TINY SQUAD', bonus: 0, player: false, icon: 'squad', color: '#2fbf4f',
    desc: 'The squad can never grow past 20 Raiders (stars need 10 / 18).',
    apply(def, run) {
      const m = run.mods;
      m.cap = Math.min(m.cap || TINY_CAP, TINY_CAP);
      const [a, b] = def.stars || [10, 25];
      const A = Math.min(a, 10), B = Math.min(b, 18);
      run.starsFor = (squad) => (squad >= B ? 3 : squad >= A ? 2 : 1);
    },
  },
  {
    id: 'onlyRed', name: 'ONLY RED GATES', bonus: 0, player: false, icon: 'damage', color: '#ff3b4e',
    desc: 'Every gate starts red. Shoot them blue!',
    apply(def, run) {
      editGates(run, redSpec);
    },
  },
  {
    id: 'giantEnemies', name: 'GIANT ENEMIES', bonus: 0, player: false, icon: 'skull', color: '#8a4dff',
    desc: 'Murklings are bigger and have +60% health.',
    apply(def, run) {
      run.mods.giant = true;
      editEvents(run, 'horde', (e) => { e.hpMul = Math.round((e.hpMul ?? def.enemyHp ?? 1) * GIANT.hp * 100) / 100; return e; });
    },
  },
  {
    id: 'noGuns', name: 'NO GUN BARRELS', bonus: 0, player: false, icon: 'tier', color: '#4b5672',
    desc: 'Gun barrels hold coins instead: no Mk upgrades on the road.',
    apply(def, run) {
      editEvents(run, 'barrel', (e) => { if (e.reward && e.reward.kind === 'weapon') e.reward = { kind: 'coins', amount: 20 }; return e; });
    },
  },
  {
    id: 'mirror', name: 'MIRROR STEERING', bonus: 0, player: false, icon: 'retry', color: '#22d3c5',
    desc: 'Steering is flipped: drag left to go right.',
    apply(def, run) { run.mods.mirror = true; },
  },
];

export const TINY_CAP = 20;
export const GIANT = { size: 1.45, hp: 1.6 };
export const MOD_IDS = MODIFIERS.map((m) => m.id);
export const MOD_BY_ID = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));
export const PLAYER_MODS = MODIFIERS.filter((m) => m.player);
export const PLAYER_MOD_IDS = PLAYER_MODS.map((m) => m.id);

/** Fresh run.mods knobs (no modifier = every value neutral). */
export function freshMods() {
  return { ids: [], noUpgrades: false, startMul: 1, cap: null, oneLife: false, fogMul: 1, giant: false, mirror: false, bonus: 0 };
}

/** Known, unique ids in list order (anything else is dropped). */
export function cleanIds(ids) {
  const out = [];
  if (Array.isArray(ids)) for (const id of ids) if (MOD_BY_ID[id] && !out.includes(id)) out.push(id);
  return out;
}

/** Coin bonus of a set of ids (fraction: 0.7 = +70%). Twists add nothing (their mode pays). */
export function modsBonus(ids) {
  return Math.round(cleanIds(ids).reduce((s, id) => s + MOD_BY_ID[id].bonus, 0) * 100) / 100;
}

/** Sets run.mods and applies every modifier in `ids` to the run (see the contract at the top). */
export function applyMods(ids, def, run, game) {
  run.mods = freshMods();
  const list = cleanIds(ids);
  run.mods.ids = list;
  run.mods.bonus = modsBonus(list);
  for (const id of list) MOD_BY_ID[id].apply(def, run, game);
  return run.mods;
}

/** One short line for banners: "FOG + ONE LIFE". */
export function modsLabel(ids) { return cleanIds(ids).map((id) => MOD_BY_ID[id].name).join(' + '); }
