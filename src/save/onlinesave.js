// Save version 4 (update 5, online play): the `online` block and its backup key (SPEC4 §4.5).
// save.data.online = { name, tr, pk, bt, st, bs, w, hist } is only a CACHE of what the online service holds (the
// player name and the profile numbers) plus the last 20 matches; the server stays the truth and nothing here can be
// used to cheat. It is kept small (well under 4 KB) so an older cached tab, which keeps unknown save keys up to that
// size, does not drop it. Every write also stores ONLINE_KEY; a load prefers that copy (an older tab never writes it,
// so it is never staler than the main save) and takes the union of both match lists. reset() removes the key; the
// online account itself lives on the server and stays.
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../data/skins.js';

export const ONLINE_KEY = 'nimbusRaiders.online.v4';
export const HIST_MAX = 20;

const NAME_OK = /^[A-Za-z0-9 _-]{1,12}$/;   // the same letters src/online/names.js allows (that file is not loaded here)
const RESULTS = ['w', 'l', 'd'];
const KINDS = ['f', 'q'];                    // friend room / quick match
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const name = (v) => (typeof v === 'string' && NAME_OK.test(v) ? v : '');

export function defaultOnline() {
  return { name: '', tr: 0, pk: 0, bt: 0, st: 0, bs: 0, w: 0, hist: [] };
}

/** One match row: a = when (seconds since 1970), r = w / l / d, t = seconds survived, d = metres, n = rival, k = kind. */
function histRow(v) {
  if (!isObj(v) || !RESULTS.includes(v.r)) return null;
  const a = int(v.a, 0, 1e11);
  if (!a) return null;
  return { a, r: v.r, t: Math.round(Math.max(0, Math.min(330, Number(v.t) || 0)) * 10) / 10, d: int(v.d, 0, 1e6), n: name(v.n), k: KINDS.includes(v.k) ? v.k : 'f' };
}

/** Newest first, one row per moment, at most HIST_MAX. */
function histList(...lists) {
  const seen = new Set(), out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const v of list.slice(0, 200)) {
      const row = histRow(v);
      if (row && !seen.has(row.a)) { seen.add(row.a); out.push(row); }
    }
  }
  return out.sort((x, y) => y.a - x.a).slice(0, HIST_MAX);
}

/** Untrusted stored JSON -> a clean online block (also what a v1-v3 save gets: the defaults). */
export function cleanOnline(raw) {
  const d = defaultOnline();
  if (!isObj(raw)) return d;
  d.name = name(raw.name);
  d.tr = int(raw.tr, 0, 1e6);                 // trophies
  d.pk = Math.max(d.tr, int(raw.pk, 0, 1e6)); // highest trophies
  d.bt = int(raw.bt, 0, 3300);                // best survival time, tenths of a second
  d.st = int(raw.st, 0, 1e6);                 // win streak
  d.bs = Math.max(d.st, int(raw.bs, 0, 1e6)); // best streak
  d.w = int(raw.w, 0, 1e9);                   // wins
  d.hist = histList(raw.hist);
  return d;
}

/** The skins that can only be earned online (data/skins.js flags them `online: true`; none exist before stage 4). */
const onlineSkin = (id) => !!((HERO_BY_ID[id] || WEAPON_SKIN_BY_ID[id]) || {}).online;

/** What goes under ONLINE_KEY on every write. */
export function onlineBackup(d) {
  return { ...d.online, skins: d.skins.owned.filter(onlineSkin) };
}

/** Old-tab protection: the backup copy wins (name, cached profile), match lists are joined, earned skins come back. */
export function mergeOnline(d, backup) {
  if (!isObj(backup)) return d;
  const b = cleanOnline(backup);
  b.hist = histList(backup.hist, d.online.hist);
  d.online = b;
  if (Array.isArray(backup.skins)) for (const id of backup.skins.slice(0, 64)) if (onlineSkin(id) && !d.skins.owned.includes(id)) d.skins.owned.push(id);
  return d;
}

/** The online screens call these (through game.save); both go through save.update so the write is debounced. */
export function setOnlineProfile(save, profile) {
  if (!isObj(profile)) return;
  save.update((d) => { d.online = cleanOnline({ ...d.online, name: profile.n ?? d.online.name, tr: profile.tr, pk: profile.pk, bt: profile.bt, st: profile.st, bs: profile.bs, w: profile.w }); });
}

export function addOnlineMatch(save, row) {
  const clean = histRow(row);
  if (!clean) return;
  save.update((d) => { d.online.hist = histList([clean], d.online.hist.filter((h) => h.a !== clean.a)); });
}
