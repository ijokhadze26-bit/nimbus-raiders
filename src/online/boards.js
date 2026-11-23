// LEADERBOARDS: the three board reads and "my rank" (SPEC4 §9, STAGE4 "Leaderboards and profile"). Network only, no DOM.
//   TOP 100     users ordered by tr, the last 100                        value: trophies
//   THIS WEEK   users ordered by ws from this week's base WK, last 100   value: ws - WK (trophies won this week)
//   LONGEST     users ordered by bt, the last 100                        value: bt (tenths of a second); bt 0 hidden
//   my rank     rk ordered by value, after my trophies, the first 500     count + 1, or "500+" when 500 came back
// The published rules allow exactly these reads (users: orderByChild tr / ws / bt and limitToLast <= 100; rk:
// orderByValue and limitToFirst <= 500). Each tab is read only when it is opened, kept 5 minutes, one read in flight
// per tab, 8 s at most; my rank is kept 10 minutes or until my trophies change. Names go through censor().
//
//   const boards = createBoards({ transport, session });
//   await boards.load('top' | 'week' | 'long', { force })  -> { rows: [{ uid, n, v, tr, rank, me }], at, err }
//   await boards.myRank({ force })                          -> { rank /* null = unknown */, plus /* 500+ */, tr }
//   boards.stats.reads                                      reads sent (tests: a cached open sends none)
//
// The league numbers come from leagues.js (builder PROG). Until the two halves are merged that file may be missing:
// LG below is then a stub with the same thresholds (the integrator replaces it with a static import).
import { censor } from './names.js';

export const BOARD = { top: 100, rankMax: 500, ttlMs: 300000, rankTtlMs: 600000, timeoutMs: 8000 };
export const TABS = ['top', 'week', 'long'];

// ---- leagues.js, or a stub with exactly its thresholds (STAGE4 "THE API": removed by the integrator) ----
const LEAGUES_STUB = [
  { id: 'bronze', name: 'BRONZE', min: 0, color: '#d08a4c', edge: '#6b3a12' },
  { id: 'silver', name: 'SILVER', min: 300, color: '#cfd8e6', edge: '#4d5f8a' },
  { id: 'gold', name: 'GOLD', min: 700, color: '#ffd34d', edge: '#8a5a00' },
  { id: 'diamond', name: 'DIAMOND', min: 1200, color: '#7fe8ff', edge: '#1b5a8a' },
  { id: 'champion', name: 'STORM CHAMPION', min: 1800, color: '#b49dff', edge: '#3b2a8f' },
];
function stubLeagues() {
  const LEAGUES = LEAGUES_STUB;
  const weekBase = (now) => { const x = now - 345600000; return (x - (x % 604800000)) / 6048; };
  const leagueOf = (tr) => {
    const v = Math.max(0, Number(tr) || 0);
    let i = 0;
    while (i + 1 < LEAGUES.length && LEAGUES[i + 1].min <= v) i++;
    return { i, ...LEAGUES[i], next: i + 1 < LEAGUES.length ? LEAGUES[i + 1].min : null };
  };
  const SKIN_RULES = [{ id: 'on-silver', field: 'pk', min: 300 }, { id: 'on-wins10', field: 'w', min: 10 },
    { id: 'on-streak5', field: 'bs', min: 5 }, { id: 'on-champion', field: 'pk', min: 1800 }];
  return {
    LEAGUES, leagueOf, weekBase, SKIN_RULES,
    dayOf: (now) => (now - (now % 86400000)) / 86400000,
    weekScore: (ws, now) => (ws >= weekBase(now) ? ws - weekBase(now) : 0),
    earnedSkins: (p) => SKIN_RULES.filter((r) => p && (Number(p[r.field]) || 0) >= r.min).map((r) => r.id),
    badgeHtml: (tr, size = 'sm') => { const l = leagueOf(tr); return `<i class="lg-badge lg-${size}" style="--lg:${l.color};--lge:${l.edge}" role="img" aria-label="${l.name}"></i>`; },
    stub: true,
  };
}
let found = {};
try { found = import.meta.glob('./leagues.js', { eager: true }); } catch { found = {}; } // (Node: no glob; the stub)
const real = Object.values(found)[0];
/** The league module this half works with: PROG's leagues.js when present, else the stub. */
export const LG = real && typeof real.leagueOf === 'function' && typeof real.badgeHtml === 'function' ? real : stubLeagues();

const QUERY = {
  top: () => ({ orderBy: 'child', child: 'tr', limitToLast: BOARD.top }),
  week: (now) => ({ orderBy: 'child', child: 'ws', startAt: LG.weekBase(now), limitToLast: BOARD.top }),
  long: () => ({ orderBy: 'child', child: 'bt', limitToLast: BOARD.top }),
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Board rows from the raw `users` answer: value per tab, high to low (ties: name, then uid), shared ranks on ties. */
export function boardRows(tab, raw, { uid = null, now = Date.now() } = {}) {
  const wk = LG.weekBase(now);
  const rows = [];
  for (const [id, p] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!p || typeof p !== 'object') continue;
    const tr = Math.max(0, Math.floor(num(p.tr)));
    const v = tab === 'top' ? tr : tab === 'week' ? Math.floor(num(p.ws) - wk) : Math.floor(num(p.bt));
    if (tab !== 'top' && !(v > 0)) continue; // (last week's score, or no survival time yet)
    rows.push({ uid: id, n: censor(p.n), v, tr, rank: 0, me: id === uid });
  }
  rows.sort((a, b) => b.v - a.v || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  rows.length = Math.min(rows.length, BOARD.top);
  for (let i = 0; i < rows.length; i++) rows[i].rank = i > 0 && rows[i].v === rows[i - 1].v ? rows[i - 1].rank : i + 1;
  return rows;
}

const why = (e) => (e && e.code === 'timeout' ? 'timeout' : e && /permission.denied/i.test(String(e.code || e.message)) ? 'denied' : 'offline');

/**
 * @param transport  the transport (get(path, query))
 * @param session    for my uid and my profile's trophies (session.uid, session.profile.tr)
 * @param now        server-synced clock (the week's base)
 * @param timeoutMs  how long one read may take
 */
export function createBoards({ transport, session, now = () => transport.now(), timeoutMs = BOARD.timeoutMs } = {}) {
  const cache = new Map();    // tab -> { rows, at }
  const flying = new Map();   // tab -> Promise
  let rank = null;            // { tr, rank, plus, at }
  let rankFlying = null;
  const stats = { reads: 0 };
  const clockNow = () => { try { return Number(now()) || Date.now(); } catch { return Date.now(); } };
  const wall = () => Date.now();

  function read(path, q) {
    stats.reads++;
    return new Promise((res, rej) => {
      const h = setTimeout(() => { const e = new Error('timeout'); e.code = 'timeout'; rej(e); }, timeoutMs);
      Promise.resolve().then(() => transport.get(path, q)).then((v) => { clearTimeout(h); res(v); }, (e) => { clearTimeout(h); rej(e); });
    });
  }

  const boards = {
    stats,
    /** The rows of one tab (from the cache inside 5 minutes unless forced). Never rejects: a failure is `err`. */
    load(tab, { force = false } = {}) {
      if (!QUERY[tab]) return Promise.resolve({ rows: [], at: 0, err: 'tab' });
      const c = cache.get(tab);
      if (!force && c && wall() - c.at < BOARD.ttlMs) return Promise.resolve({ rows: c.rows, at: c.at, err: null });
      if (flying.has(tab)) return flying.get(tab);
      const t = clockNow();
      const p = read('users', QUERY[tab](t)).then((raw) => {
        const out = { rows: boardRows(tab, raw, { uid: session && session.uid, now: t }), at: wall() };
        cache.set(tab, out);
        return { ...out, err: null };
      }, (e) => ({ rows: [], at: wall(), err: why(e) })).finally(() => flying.delete(tab));
      flying.set(tab, p);
      return p;
    },
    /** What a tab holds right now without reading (null: never loaded or too old). */
    cached(tab) { const c = cache.get(tab); return c && wall() - c.at < BOARD.ttlMs ? c : null; },

    /** My place on TOP 100 among everyone: the players with more trophies than me, plus one. */
    myRank({ force = false } = {}) {
      const prof = session && session.profile;
      if (!prof) return Promise.resolve({ rank: null, plus: false, tr: null });
      const tr = Math.max(0, Math.floor(num(prof.tr)));
      if (!force && rank && rank.tr === tr && wall() - rank.at < BOARD.rankTtlMs) return Promise.resolve({ rank: rank.rank, plus: rank.plus, tr });
      if (rankFlying && rankFlying.tr === tr) return rankFlying.p;
      const p = read('rk', { orderBy: 'value', startAfter: tr, limitToFirst: BOARD.rankMax }).then((raw) => {
        const n = raw && typeof raw === 'object' ? Object.keys(raw).length : 0;
        rank = { tr, rank: n + 1, plus: n >= BOARD.rankMax, at: wall() };
        return { rank: rank.rank, plus: rank.plus, tr };
      }, () => ({ rank: null, plus: false, tr })).finally(() => { if (rankFlying && rankFlying.p === p) rankFlying = null; });
      rankFlying = { tr, p };
      return p;
    },
    /** Forget everything (tests). */
    clear() { cache.clear(); rank = null; },
  };
  return boards;
}
