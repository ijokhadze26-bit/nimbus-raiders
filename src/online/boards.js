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
// The league numbers come from leagues.js (re-exported as LG).
import { censor } from './names.js';
import * as LG from './leagues.js';

export const BOARD = { top: 100, rankMax: 500, ttlMs: 300000, rankTtlMs: 600000, timeoutMs: 8000 };
export const TABS = ['top', 'week', 'long'];

/** The league numbers (leagues.js); boardsview, profileview, share and hub take them from here. */
export { LG };

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
