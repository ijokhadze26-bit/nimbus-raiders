// Bot decisions added in update 2 (SPEC2 §6.10), kept out of autopilot.js: loadout pick, weapon-aware firepower
// estimates, weapon crates (take / skip by profile option) and ability triggers. Dice come from the bot's own
// second Rng (ap.rng2), so the shipped bot's dice sequence (gates, hazards, wobble) is unchanged.
import { ALIVE } from './horde.js';
import { MAX_MK, WEAPON_IDS, DEFAULT_WEAPON } from '../data/weapons.js';
import { HERO_DEFS, DEFAULT_HERO } from '../data/heroes.js';
import { bossDef } from '../data/bosses.js';
import { isWeaponUnlocked, isHeroUnlocked } from '../save/unlocks.js';
import { ENEMY_TYPES } from '../data/enemies.js';

export const BOT_DEFAULTS = { crates: 'auto', ability: true, loadout: 'keep' };
// ability reaction per profile: delay (s) before using a trigger, chance to skip one (then 1 s before re-checking)
const ABILITY_SKILL = { pro: { delay: 0, skip: 0 }, casual: { delay: 0.8, skip: 0.25 }, novice: { delay: 1.5, skip: 0.5 } };
const CRATE_ALIGN = 25, CRATE_HALF = 1.6, CRATE_AWAY = 2;

/** First unlocked weapon among the level's favours (else Thunderclap) + the hero whose favourite it is (else Pip). */
export function autoLoadout(game, def) {
  const d = game.save && game.save.data;
  const favs = (def && def.favours) || [];
  const weapon = favs.find((w) => isWeaponUnlocked(d, w)) || DEFAULT_WEAPON;
  const h = HERO_DEFS.find((x) => x.favourite === weapon && isHeroUnlocked(d, x.id));
  return { hero: h ? h.id : DEFAULT_HERO, weapon };
}

/** 'never' | 'favoured' | 'always' for this bot (auto: pro = favoured, casual = favoured with a 50% skip roll, novice = never). */
export function crateMode(ap) {
  const o = ap.opts.crates;
  if (o && o !== 'auto') return o;
  return ap.profileName === 'novice' ? 'never' : 'favoured';
}

/** Weapons the run favours: the level's list, or the current boss's in endless / practice. */
export function runFavours(game) {
  const run = game.run;
  if (!run) return [];
  if (run.def && run.def.favours && run.def.favours.length) return run.def.favours;
  return run.boss ? bossDef(run.boss.type).favours || [] : [];
}

/** Decides once per crate (cached on the bot): take it? */
function wantsCrate(ap, c) {
  let r = ap.crateRolls.get(c.at);
  if (r === undefined) {
    const mode = crateMode(ap);
    const game = ap.game;
    if (mode === 'never') r = false;
    else if (mode === 'always') r = true;
    else {
      const fav = runFavours(game);
      r = c.weapon === game.weapons.id ? game.weapons.mk < MAX_MK : fav.includes(c.weapon);
      if (r && ap.profileName === 'casual' && ap.opts.crates === 'auto' && ap.rng2.next() < 0.5) r = false;
    }
    ap.crateRolls.set(c.at, r);
  }
  return r;
}

/** Steering goal toward a crate worth taking (<= 25 u out): { x, dz } (reused object) or null. */
const CG = { x: 0, dz: 0 };
export function crateGoal(ap) {
  const game = ap.game, cr = game.crates;
  if (!cr || !cr.live.length) return null;
  const L = game.squad.leader;
  for (const c of cr.live) {
    if (c.state !== 'live') continue;
    const dz = L.z - c.z;
    if (dz < -0.5 || dz > CRATE_ALIGN) continue;
    if (wantsCrate(ap, c)) { CG.x = c.x; CG.dz = dz; return CG; }
  }
  return null;
}

/** Final filter: a crate the bot skips is never driven through (moves 2 u past its pickup zone). */
export function avoidCrates(ap, x) {
  const game = ap.game, cr = game.crates;
  if (!cr || !cr.live.length) return x;
  const L = game.squad.leader;
  for (const c of cr.live) {
    if (c.state !== 'live') continue;
    const dz = L.z - c.z;
    if (dz < -0.5 || dz > CRATE_ALIGN || wantsCrate(ap, c)) continue;
    if (Math.abs(x - c.x) <= CRATE_HALF + 0.3) x = c.x - Math.sign(c.x || 1) * (CRATE_HALF + CRATE_AWAY);
  }
  return x;
}

export function barrelValue(game, b) {
  const r = b.reward;
  switch (r.kind) {
    case 'weapon': return game.weapons.mk < MAX_MK ? 120 : 5;
    case 'troops': return (r.amount || 1) * 4;
    case 'drone': return game.helpers && game.helpers.drones < 4 ? 45 : 0;
    case 'turret': return game.helpers && game.helpers.turrets < 2 ? 55 : 0;
    case 'coins': return 8;
    case 'bridge': return 90; // shoot-to-build: saves the squad a walk over a thin strip
    default: return 20;
  }
}

const MIX = Object.fromEntries(ENEMY_TYPES.map((t) => [t, 0]));
/** Effective squad firepower against the enemies in the bot's horde window (shares by headcount). */
export function hordeFire(game, counts, total) {
  for (let i = 0; i < ENEMY_TYPES.length; i++) MIX[ENEMY_TYPES[i]] = total ? counts[i] / total : 0;
  return game.weapons.crowdDps(MIX);
}

/** Extra look-ahead (s) for a hero that dodges slower than Pip. */
export function easeLookAhead(game) {
  const e = game.heroes ? game.heroes.easeMul : 1;
  return 0.35 * (1 / Math.max(0.3, e) - 1);
}

// ---------------- abilities ----------------
function countAhead(game, near, far, halfW = Infinity, tankOnly = false) {
  const L = game.squad.leader, list = game.horde.list;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.state !== ALIVE) continue;
    const d = L.z - e.z;
    if (d < near || d > far || Math.abs(e.x - L.x) > halfW) continue;
    if (tankOnly && !e.def.contactKills) continue;
    n++;
  }
  return n;
}

function onSquad(game, list) {
  const T = game.telegraph, L = game.squad.leader;
  if (!list || !list.length || !T) return false;
  // a safe spot (update 3) marks everything outside its circle: the dodge walks into it, it is not a reason to fire
  for (const h of list) if (!h.done && h.kind !== 'safe' && T.contains(h, L.x, L.z, 0.45)) return true;
  return false;
}

/** A safe-spot blast lands within `soon` s while Pip is still outside the circle (shield it if the hero can). */
function safeMissed(game, soon) {
  const T = game.telegraph, L = game.squad.leader;
  if (!T) return false;
  for (const h of T.active) if (h.kind === 'safe' && !h.done && !h.fired && T.remaining(h) < soon && T.contains(h, L.x, L.z, 0)) return true;
  return false;
}

/** SPEC2 §6.10 triggers for the current hero's ability. */
export function abilityWanted(game) {
  const H = game.heroes, run = game.run, sq = game.squad;
  const boss = run.phase === 'boss' && game.boss;
  const bossStart = !!(boss && (boss.state === 'enter' || boss.state === 'intro' || (boss.state === 'fight' && boss.t < 2)));
  switch (H.ability.id) {
    case 'rally': return sq.count < 15 || sq.count < 0.6 * run.stats.maxSquad || bossStart;
    case 'meteor': return !!boss && boss.targetable || countAhead(game, 12, 24, 3) >= 25;
    case 'whiteout': return countAhead(game, 0, 12) >= 20 || (!!boss && onSquad(game, game.telegraph.active));
    case 'sugarshield': return countAhead(game, 0, 6) >= 10 || (!!boss && (onSquad(game, boss.dangerZones) || safeMissed(game, 0.6)));
    case 'fortress': return bossStart || countAhead(game, 0, 30) >= 40;
    case 'shockwave': return countAhead(game, 0, 8) >= 15 || countAhead(game, 0, 6, Infinity, true) > 0;
    default: return false;
  }
}

/** Called from Autopilot.update every step: checks the triggers every 0.1 s, with the profile's reaction. */
export function abilityTick(ap, dt) {
  const game = ap.game, H = game.heroes, run = game.run;
  if (!ap.opts.ability || !H || !run || !run.active) return;
  if (!H.ability.ready) { ap.abPending = -1; return; }
  ap.abClock += dt;
  if (ap.abPending >= 0) { if (ap.abClock >= ap.abPending) { ap.abPending = -1; H.useAbility(); } return; }
  if (ap.abClock < ap.abNext) return;
  ap.abNext = ap.abClock + 0.1;
  if (!abilityWanted(game)) return;
  const sk = ABILITY_SKILL[ap.profileName] || ABILITY_SKILL.pro;
  if (sk.skip && ap.rng2.next() < sk.skip) { ap.abNext = ap.abClock + 1; return; }
  if (sk.delay) ap.abPending = ap.abClock + sk.delay;
  else H.useAbility();
}

export { WEAPON_IDS };
