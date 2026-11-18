// Persistent save (SPEC §9): versioned localStorage key, defaults + sanitizing migration, debounced
// autosave (300 ms), flush on pagehide / hidden, in-memory fallback when storage is unavailable.
// Emits 'save:changed' { save } after every change.
// Version 2 (update 2) adds heroes / arsenal / seen. Migration is in place (sanitize): every v1 field is copied
// exactly; new fields take their defaults. Unknown top-level JSON keys are kept (<= 16, <= 4 KB each) so this
// build never drops a future field. Old-tab protection: every write also stores the bought heroes / weapons
// under OWNED_KEY, and a load takes the union of both keys (reset() clears the backup first).
// Version 3 (update 3): 50 levels (stars / unlockedLevel 1..50), a save that had beaten the old last level
// (stars[15], unlockedLevel 15) moves on to 16, plus elite stars, mode bests, achievements, squad types and the
// new settings (volumes, ability side, colorblind, haptics = the old vibration switch). Every v2 field is copied
// exactly. Old-tab protection for progress: PROGRESS_KEY keeps unlockedLevel + stars + elite (an old build clamps
// them to 15 levels and never touches this key); a load takes the higher of both.
import { UPGRADES } from '../data/shop.js';
import { FREE_SKIN_IDS, HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../data/skins.js';
import { HERO_IDS, DEFAULT_HERO } from '../data/heroes.js';
import { WEAPON_IDS, DEFAULT_WEAPON } from '../data/weapons.js';
import { isHeroUnlocked, isWeaponUnlocked } from './unlocks.js';
import { TOTAL_LEVELS, WORLD_COUNT } from '../data/worlds.js';
import { PLAYER_MOD_IDS } from '../data/modifiers.js';
import { SQUAD_TYPE_IDS, mixLevel } from '../data/squadtypes.js';

export const SAVE_KEY = 'nimbusRaiders.save.v1';
export const OWNED_KEY = 'nimbusRaiders.owned.v2';
export const PROGRESS_KEY = 'nimbusRaiders.progress.v3';
export const SAVE_VERSION = 3;
const EXTRA_MAX = 16, EXTRA_BYTES = 4096;
const LEVELS = TOTAL_LEVELS;
/** The last level of update 2: beating it used to leave unlockedLevel there. */
const OLD_LAST = 15;
const WORLDS = WORLD_COUNT, ID_LIST = 200, DAILY_KEEP = 60, MIX_MAX = 100;
const QUALITIES = ['auto', 'high', 'low'];

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    unlockedLevel: 1,
    stars: {},
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    skins: { owned: [...FREE_SKIN_IDS], hero: 'classic', weapon: 'factory' },
    daily: { lastClaim: null, streak: 0 },
    endlessBest: 0,
    settings: { music: true, sfx: true, quality: 'auto', vibration: true, musicVol: 0.8, sfxVol: 0.9, abilitySide: 'right', colorblind: false, haptics: true },
    stats: { kills: 0, runs: 0, wins: 0 },
    heroes: { owned: [DEFAULT_HERO], selected: DEFAULT_HERO },        // owned = bought with coins (+ the starter)
    arsenal: { owned: [DEFAULT_WEAPON], selected: DEFAULT_WEAPON },
    seen: { heroes: [], weapons: [] },                                // info page opened -> no NEW badge
    // v3
    elite: {},                                                        // levelId -> best ELITE stars (1..3)
    modes: { bossRushBest: 0, dailyBest: {}, chaosBest: 0, endlessBest: {} }, // dailyBest: 'YYYY-MM-DD' -> score; endlessBest: worldId -> m
    achievements: { done: [], claimed: [], counts: {} },              // achievement ids; counts: tracker key -> number
    squadTypes: { owned: [], mix: {} },                               // raider type ids; mix: id -> share 0..100
    modifiers: [],                                                    // stage 5: loadout modifiers left on (remembered)
  };
}

const KNOWN = new Set(Object.keys(defaultSave()));
const ids = (list, valid, into) => { if (Array.isArray(list)) for (const id of list) if (valid.includes(id) && !into.includes(id)) into.push(id); return into; };

const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const num01 = (v, d) => { const n = Number(v); return typeof v === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
/** Integer key in lo..hi, else 0 (an out-of-range level / world id is dropped, never clamped onto the last one). */
const key = (k, lo, hi) => { const n = Math.floor(Number(k)); return Number.isFinite(n) && n >= lo && n <= hi ? n : 0; };
/** Unique safe string ids (achievements, raider types), at most `max`. */
const strIds = (list, into, max = ID_LIST) => { if (Array.isArray(list)) for (const id of list) if (typeof id === 'string' && SAFE_ID.test(id) && !into.includes(id) && into.length < max) into.push(id); return into; };
/** levelId (1..LEVELS) -> stars (1..3); merges the higher value into `into`. */
function starMap(raw, into) {
  if (!isObj(raw)) return into;
  for (const [k, v] of Object.entries(raw)) {
    const id = key(k, 1, LEVELS), s = int(v, 0, 3, 0);
    if (id && s && s > (into[id] || 0)) into[id] = s;
  }
  return into;
}

/** Merge untrusted stored JSON onto the defaults, clamping every field (also the migration hook). */
export function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  d.coins = int(raw.coins, 0, 1e9, 0);
  d.unlockedLevel = int(raw.unlockedLevel, 1, LEVELS, 1);
  starMap(raw.stars, d.stars);
  // v2 -> v3: the old last level was beaten -> the next world is open
  if ((int(raw.version, 0, 99, 0) < 3) && d.stars[OLD_LAST] > 0 && d.unlockedLevel === OLD_LAST) d.unlockedLevel = OLD_LAST + 1;
  for (const u of UPGRADES) d.upgrades[u.id] = int(raw.upgrades?.[u.id], 0, u.max, 0);
  const sk = raw.skins || {};
  if (Array.isArray(sk.owned)) {
    for (const id of sk.owned) if ((HERO_BY_ID[id] || WEAPON_SKIN_BY_ID[id]) && !d.skins.owned.includes(id)) d.skins.owned.push(id);
  }
  if (HERO_BY_ID[sk.hero] && d.skins.owned.includes(sk.hero)) d.skins.hero = sk.hero;
  if (WEAPON_SKIN_BY_ID[sk.weapon] && d.skins.owned.includes(sk.weapon)) d.skins.weapon = sk.weapon;
  const dl = raw.daily || {};
  d.daily.lastClaim = typeof dl.lastClaim === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dl.lastClaim) ? dl.lastClaim : null;
  d.daily.streak = int(dl.streak, 0, 1e6, 0);
  d.endlessBest = int(raw.endlessBest, 0, 1e9, 0);
  const st = raw.settings || {};
  d.settings.music = bool(st.music, true);
  d.settings.sfx = bool(st.sfx, true);
  d.settings.quality = QUALITIES.includes(st.quality) ? st.quality : 'auto';
  d.settings.vibration = bool(st.vibration, true);
  d.settings.musicVol = num01(st.musicVol, 0.8);
  d.settings.sfxVol = num01(st.sfxVol, 0.9);
  d.settings.abilitySide = st.abilitySide === 'left' ? 'left' : 'right';
  d.settings.colorblind = bool(st.colorblind, false);
  d.settings.haptics = bool(st.haptics, d.settings.vibration);
  d.stats.kills = int(raw.stats?.kills, 0, 1e12, 0);
  d.stats.runs = int(raw.stats?.runs, 0, 1e9, 0);
  d.stats.wins = int(raw.stats?.wins, 0, 1e9, 0);
  // v2: bought heroes / weapons (filtered against the hero / weapon ids, never against outfit or paint ids)
  ids(raw.heroes?.owned, HERO_IDS, d.heroes.owned);
  ids(raw.arsenal?.owned, WEAPON_IDS, d.arsenal.owned);
  ids(raw.seen?.heroes, HERO_IDS, d.seen.heroes);
  ids(raw.seen?.weapons, WEAPON_IDS, d.seen.weapons);
  reselect(d, raw.heroes?.selected, raw.arsenal?.selected);
  // v3
  starMap(raw.elite, d.elite);
  const md = isObj(raw.modes) ? raw.modes : {};
  d.modes.bossRushBest = int(md.bossRushBest, 0, 1e9, 0);
  d.modes.chaosBest = int(md.chaosBest, 0, 1e9, 0);
  if (isObj(md.dailyBest)) {
    const days = Object.keys(md.dailyBest).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-DAILY_KEEP);
    for (const k of days) { const v = int(md.dailyBest[k], 0, 1e9, 0); if (v) d.modes.dailyBest[k] = v; }
  }
  if (isObj(md.endlessBest)) {
    for (const [k, v] of Object.entries(md.endlessBest)) { const w = key(k, 1, WORLDS), m = int(v, 0, 1e9, 0); if (w && m) d.modes.endlessBest[w] = m; }
  }
  strIds(raw.achievements?.done, d.achievements.done);
  strIds(raw.achievements?.claimed, d.achievements.claimed);
  if (isObj(raw.achievements?.counts)) {
    for (const [k, v] of Object.entries(raw.achievements.counts)) {
      if (Object.keys(d.achievements.counts).length >= ID_LIST || !SAFE_ID.test(k)) continue;
      const n = int(v, 0, 1e12, 0); if (n) d.achievements.counts[k] = n;
    }
  }
  ids(raw.squadTypes?.owned, SQUAD_TYPE_IDS, d.squadTypes.owned); // known raider types only
  if (isObj(raw.squadTypes?.mix)) {
    for (const [k, v] of Object.entries(raw.squadTypes.mix)) {
      if (!SQUAD_TYPE_IDS.includes(k)) continue;
      d.squadTypes.mix[k] = mixLevel(int(v, 0, MIX_MAX, 0)).share; // OFF / FEW / MANY
    }
  }
  ids(raw.modifiers, PLAYER_MOD_IDS, d.modifiers);
  // keep unknown top-level JSON keys (a newer build's fields survive this one)
  let extra = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (KNOWN.has(k) || k === '__proto__' || extra >= EXTRA_MAX || v === undefined || typeof v === 'function') continue;
    let text;
    try { text = JSON.stringify(v); } catch { continue; }
    if (text === undefined || text.length > EXTRA_BYTES) continue;
    d[k] = JSON.parse(text);
    extra++;
  }
  return d;
}

/** Selected hero / weapon must be unlocked, otherwise the starters. */
function reselect(d, hero = d.heroes.selected, weapon = d.arsenal.selected) {
  d.heroes.selected = HERO_IDS.includes(hero) && isHeroUnlocked(d, hero) ? hero : DEFAULT_HERO;
  d.arsenal.selected = WEAPON_IDS.includes(weapon) && isWeaponUnlocked(d, weapon) ? weapon : DEFAULT_WEAPON;
}

/** Higher of the main save's progress and the progress backup's (old-tab protection, v3). */
export function mergeProgress(d, backup) {
  if (!isObj(backup)) return d;
  const lvl = int(backup.unlockedLevel, 1, LEVELS, 1);
  if (lvl > d.unlockedLevel) d.unlockedLevel = lvl;
  starMap(backup.stars, d.stars);
  starMap(backup.elite, d.elite);
  return d;
}

/** Union of the main save's owned lists with the backup key's (old-tab protection). */
export function mergeOwned(d, backup) {
  if (!backup || typeof backup !== 'object') return d;
  ids(backup.heroes, HERO_IDS, d.heroes.owned);
  ids(backup.arsenal, WEAPON_IDS, d.arsenal.owned);
  reselect(d);
  return d;
}

export class Save {
  constructor(events, { key = SAVE_KEY, delay = 300 } = {}) {
    this.events = events;
    this.key = key;
    this.delay = delay;
    this.timer = 0;
    this.memory = null;          // fallback copy when localStorage throws (private mode, blocked)
    this.memoryOwned = null;
    this.memoryProgress = null;
    this.persistent = true;
    this.data = mergeProgress(mergeOwned(sanitize(this.readRaw()), this.readOwned()), this.readProgress());
    const flush = () => this.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  readRaw() {
    let text = null;
    try { text = window.localStorage.getItem(this.key); } catch { this.persistent = false; text = this.memory; }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  readOwned() { return this.readKey(OWNED_KEY, this.memoryOwned); }
  readProgress() { return this.readKey(PROGRESS_KEY, this.memoryProgress); }

  readKey(key, memory) {
    let text = null;
    try { text = this.persistent ? window.localStorage.getItem(key) : memory; } catch { text = memory; }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  writeRaw(text) {
    this.memory = text;
    const owned = JSON.stringify({ heroes: this.data.heroes.owned, arsenal: this.data.arsenal.owned });
    this.memoryOwned = owned;
    const d = this.data;
    const progress = JSON.stringify({ unlockedLevel: d.unlockedLevel, stars: d.stars, elite: d.elite });
    this.memoryProgress = progress;
    if (!this.persistent) return;
    try {
      window.localStorage.setItem(this.key, text); window.localStorage.setItem(OWNED_KEY, owned); window.localStorage.setItem(PROGRESS_KEY, progress);
    } catch { this.persistent = false; }
  }

  /** Mutate the save through fn(data), then emit + schedule the debounced write. */
  update(fn) {
    if (fn) fn(this.data);
    this.changed();
    return this.data;
  }

  changed() {
    this.events?.emit('save:changed', { save: this.data });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = 0;
    try { this.writeRaw(JSON.stringify(this.data)); } catch { /* never throw from a save */ }
  }

  reset() {
    const keepSettings = { ...this.data.settings };
    // the backups must go first, or the next load would merge bought items / progress back in
    this.memoryOwned = null;
    this.memoryProgress = null;
    try { window.localStorage.removeItem(OWNED_KEY); window.localStorage.removeItem(PROGRESS_KEY); } catch { /* storage blocked */ }
    this.data = defaultSave();
    this.data.settings = keepSettings;
    this.changed();
    this.flush();
    return this.data;
  }

  // ---- small helpers used by the UI ----
  addCoins(n) { const v = Math.max(0, Math.round(n || 0)); if (v) this.update((d) => { d.coins = Math.min(1e9, d.coins + v); }); return this.data.coins; }

  /** Spend coins if affordable; returns true on success. */
  spend(n) {
    const v = Math.max(0, Math.round(n || 0));
    if (this.data.coins < v) return false;
    this.update((d) => { d.coins -= v; });
    return true;
  }

  setSetting(k, v) {
    if (!(k in this.data.settings)) return;
    // haptics (v3) and the old vibration switch are one setting
    this.update((d) => { d.settings[k] = v; if (k === 'haptics') d.settings.vibration = !!v; else if (k === 'vibration') d.settings.haptics = !!v; });
    this.events?.emit('settings:changed', { settings: this.data.settings });
  }

  owns(id) { return this.data.skins.owned.includes(id); }
}
