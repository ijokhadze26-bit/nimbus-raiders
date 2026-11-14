// Persistent save (SPEC §9): versioned localStorage key, defaults + sanitizing migration, debounced
// autosave (300 ms), flush on pagehide / hidden, in-memory fallback when storage is unavailable.
// Emits 'save:changed' { save } after every change.
import { UPGRADES } from '../data/shop.js';
import { FREE_SKIN_IDS, HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../data/skins.js';

export const SAVE_KEY = 'nimbusRaiders.save.v1';
export const SAVE_VERSION = 1;
const LEVELS = 15;
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
    settings: { music: true, sfx: true, quality: 'auto', vibration: true },
    stats: { kills: 0, runs: 0, wins: 0 },
  };
}

const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** Merge untrusted stored JSON onto the defaults, clamping every field (also the migration hook). */
export function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  d.coins = int(raw.coins, 0, 1e9, 0);
  d.unlockedLevel = int(raw.unlockedLevel, 1, LEVELS, 1);
  if (raw.stars && typeof raw.stars === 'object') {
    for (const [k, v] of Object.entries(raw.stars)) {
      const id = int(k, 1, LEVELS, 0);
      const s = int(v, 0, 3, 0);
      if (id && s) d.stars[id] = s;
    }
  }
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
  d.stats.kills = int(raw.stats?.kills, 0, 1e12, 0);
  d.stats.runs = int(raw.stats?.runs, 0, 1e9, 0);
  d.stats.wins = int(raw.stats?.wins, 0, 1e9, 0);
  return d;
}

export class Save {
  constructor(events, { key = SAVE_KEY, delay = 300 } = {}) {
    this.events = events;
    this.key = key;
    this.delay = delay;
    this.timer = 0;
    this.memory = null;          // fallback copy when localStorage throws (private mode, blocked)
    this.persistent = true;
    this.data = sanitize(this.readRaw());
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

  writeRaw(text) {
    this.memory = text;
    if (!this.persistent) return;
    try { window.localStorage.setItem(this.key, text); } catch { this.persistent = false; }
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
    this.update((d) => { d.settings[k] = v; });
    this.events?.emit('settings:changed', { settings: this.data.settings });
  }

  owns(id) { return this.data.skins.owned.includes(id); }
}
