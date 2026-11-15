// Weapon + hero unlocks, purchases and selection (SPEC2 §4). Unlock state is DERIVED, never stored:
// unlocked = bought with coins (save.arsenal.owned / save.heroes.owned) OR level reached
// (save.unlockedLevel >= def.unlock.level). A returning level-10 player therefore has everything up to
// level 10 at once, with no grant code. Purchases spend def.unlock.coins. Nothing here equips a locked item
// (crates and practice use locked weapons for one run only and never touch the save).
import { WEAPON_DEFS, WEAPON_BY_ID, WEAPON_IDS, DEFAULT_WEAPON } from '../data/weapons.js';
import { HERO_DEFS, HERO_DEF_BY_ID, HERO_IDS, DEFAULT_HERO } from '../data/heroes.js';

const levelOf = (d) => (d && d.unlockedLevel) || 1;
const owned = (list, id) => Array.isArray(list) && list.includes(id);

/** d = save data (save.data). */
export function isWeaponUnlocked(d, id) {
  const def = WEAPON_BY_ID[id];
  if (!def) return false;
  return id === DEFAULT_WEAPON || owned(d?.arsenal?.owned, id) || levelOf(d) >= def.unlock.level;
}

export function isHeroUnlocked(d, id) {
  const def = HERO_DEF_BY_ID[id];
  if (!def) return false;
  return id === DEFAULT_HERO || owned(d?.heroes?.owned, id) || levelOf(d) >= def.unlock.level;
}

export function unlockedWeapons(d) { return WEAPON_IDS.filter((id) => isWeaponUnlocked(d, id)); }
export function unlockedHeroes(d) { return HERO_IDS.filter((id) => isHeroUnlocked(d, id)); }

/** The one lock line used everywhere: "LOCKED: reach level N or buy for C coins". */
export function lockText(def) {
  const u = def && def.unlock;
  if (!u || u.start) return '';
  return `LOCKED: reach level ${u.level} or buy for ${u.coins} coins`;
}

/** { weapons:[ids], heroes:[ids] } unlocked by a save data snapshot. */
export function unlockSet(d) { return { weapons: unlockedWeapons(d), heroes: unlockedHeroes(d) }; }

/**
 * Items unlocked in `after` but not in `before` (each a save data snapshot or an unlockSet), in data
 * order: [{ kind: 'weapon' | 'hero', id, def }]. The result screen shows one card per entry.
 */
export function newlyUnlocked(before, after) {
  const b = before && before.weapons ? before : unlockSet(before);
  const a = after && after.weapons ? after : unlockSet(after);
  const out = [];
  for (const def of WEAPON_DEFS) if (a.weapons.includes(def.id) && !b.weapons.includes(def.id)) out.push({ kind: 'weapon', id: def.id, def });
  for (const def of HERO_DEFS) if (a.heroes.includes(def.id) && !b.heroes.includes(def.id)) out.push({ kind: 'hero', id: def.id, def });
  return out;
}

/** Can this item be bought right now (locked and affordable)? */
export function canBuy(save, kind, id) {
  const d = save.data;
  const def = kind === 'hero' ? HERO_DEF_BY_ID[id] : WEAPON_BY_ID[id];
  if (!def || def.unlock.start) return false;
  const unlocked = kind === 'hero' ? isHeroUnlocked(d, id) : isWeaponUnlocked(d, id);
  return !unlocked && d.coins >= def.unlock.coins;
}

/** Buys a locked weapon with coins, then selects it. false when unknown, already unlocked or too poor. */
export function buyWeapon(save, id) {
  if (!canBuy(save, 'weapon', id)) return false;
  if (!save.spend(WEAPON_BY_ID[id].unlock.coins)) return false;
  save.update((s) => { if (!s.arsenal.owned.includes(id)) s.arsenal.owned.push(id); });
  selectWeapon(save, id);
  return true;
}

/** Buys a locked hero with coins, then selects it (favourite-weapon rule applies). */
export function buyHero(save, id) {
  if (!canBuy(save, 'hero', id)) return false;
  if (!save.spend(HERO_DEF_BY_ID[id].unlock.coins)) return false;
  save.update((s) => { if (!s.heroes.owned.includes(id)) s.heroes.owned.push(id); });
  selectHero(save, id);
  return true;
}

/** Equips an unlocked weapon (false for a locked / unknown one). */
export function selectWeapon(save, id) {
  if (!isWeaponUnlocked(save.data, id)) return false;
  save.update((s) => { s.arsenal.selected = id; });
  return true;
}

/**
 * Equips an unlocked hero. Its favourite weapon is equipped too, but only when that weapon is unlocked;
 * otherwise the current weapon stays (SPEC2 §3).
 */
export function selectHero(save, id) {
  if (!isHeroUnlocked(save.data, id)) return false;
  const fav = HERO_DEF_BY_ID[id].favourite;
  save.update((s) => {
    s.heroes.selected = id;
    if (isWeaponUnlocked(s, fav)) s.arsenal.selected = fav;
  });
  return true;
}

/** The weapon a hero brings when picked: its favourite if unlocked, else `current`. */
export function heroWeapon(d, heroId, current) {
  const def = HERO_DEF_BY_ID[heroId];
  return def && isWeaponUnlocked(d, def.favourite) ? def.favourite : current;
}

/** Info page opened: hides the item's NEW badge. kind 'hero' | 'weapon'. */
export function markSeen(save, kind, id) {
  const key = kind === 'hero' ? 'heroes' : 'weapons';
  const valid = kind === 'hero' ? HERO_DEF_BY_ID[id] : WEAPON_BY_ID[id];
  if (!valid || save.data.seen[key].includes(id)) return false;
  save.update((s) => { s.seen[key].push(id); });
  return true;
}

/** NEW badge: unlocked but its info page was never opened. */
export function isNew(d, kind, id) {
  const unlocked = kind === 'hero' ? isHeroUnlocked(d, id) : isWeaponUnlocked(d, id);
  return unlocked && !d.seen[kind === 'hero' ? 'heroes' : 'weapons'].includes(id);
}
