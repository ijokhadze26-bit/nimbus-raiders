// Node test of src/online/boards.js: node tests/online/boards.mjs (also through tests/online/run.mjs).
// The real rules on an in-process hub: the three board reads and my rank are allowed (no denial), rows are sorted with
// shared ranks, rude names censored, last week's and bt 0 rows dropped; the cache, one read in flight, the timeout.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { createBoards, boardRows, BOARD, LG } = await imp('src/online/boards.js');
const { createHub } = await imp('src/online/localhub.js');
const { createRules } = await imp('src/online/rulescheck.js');
const { createLocalTransport } = await imp('src/online/transport-local.js');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'config/firebase/database.rules.json'), 'utf8'));

let fails = 0, n = 0;
const ok = (c, what) => { n++; if (!c) { fails++; console.log('FAIL', what); } };

const now = Date.UTC(2026, 10, 25, 12);   // a Wednesday
const WK = LG.weekBase(now);
ok(WK === ((now - 345600000) - ((now - 345600000) % 604800000)) / 6048 && Number.isInteger(WK), 'weekBase = the rules WK');

// ---- pure rows ----
const raw = {
  a: { n: 'Ann', tr: 50, ws: WK + 5, bt: 100 }, b: { n: 'Bob', tr: 50, ws: WK - 3, bt: 0 }, c: { n: 'fuuuck', tr: 70, ws: WK + 9, bt: 30 },
  d: { n: 'Dee', tr: 10, ws: WK + 5, bt: 100 }, me: { n: 'Me', tr: 20, ws: WK + 1, bt: 5 },
};
const top = boardRows('top', raw, { uid: 'me', now });
ok(top.map((r) => r.uid).join() === 'c,a,b,me,d' && top.map((r) => r.rank).join() === '1,2,2,4,5', 'top order / shared ranks: ' + JSON.stringify(top.map((r) => [r.uid, r.rank])));
ok(/^Raider-\d{4}$/.test(top[0].n) && top[3].me && !top[0].me, 'censor + me');
const week = boardRows('week', raw, { uid: 'me', now });
ok(week.map((r) => `${r.uid}${r.v}`).join() === 'c9,a5,d5,me1' && week[2].rank === 2, 'week: ' + JSON.stringify(week.map((r) => [r.uid, r.v, r.rank])));
const long = boardRows('long', raw, { uid: 'me', now });
ok(long.map((r) => r.uid).join() === 'a,d,c,me', 'long drops bt 0: ' + long.map((r) => r.uid));
ok(boardRows('top', null).length === 0 && boardRows('top', { x: 5, y: null }).length === 0, 'junk rows');

// ---- the real rules, an in-process hub ----
let t = now;
const clock = { now: () => t, after: (ms, fn) => { const h = setTimeout(fn, 0); return () => clearTimeout(h); }, every: () => () => {} };
const hub = createHub({ rules: createRules(rules), clock });
const denied = [];
hub.onDeny = (d) => denied.push(d);
const prof = (nm, o) => ({ n: nm, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0, ...o });
const map = {};
for (let i = 0; i < 150; i++) { map[`users/u${i}`] = prof(`P ${i}`, { tr: 1000 - i * 5, pk: 1000 - i * 5, ws: i % 2 ? WK + i : WK - 1, bt: i % 3 ? 3000 - i : 0 }); map[`rk/u${i}`] = 1000 - i * 5; }
map['users/me'] = prof('Me', { tr: 802, pk: 802, ws: WK + 40, bt: 1234 }); map['rk/me'] = 802;
hub.admin.update(map);
const tp = createLocalTransport({ hub, uid: 'me', clock: { now: () => t, after: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); } } });
await tp.connect();
const session = { uid: 'me', profile: { ...map['users/me'] } };
const B = createBoards({ transport: tp, session, now: () => t, timeoutMs: 500 });
for (const tab of ['top', 'week', 'long']) {
  const r = await B.load(tab);
  ok(!r.err && r.rows.length === (tab === 'week' ? 76 : 100), `${tab}: ${r.err} ${r.rows.length}`);   // (75 played this week, and me)
  ok(r.rows.every((x, i) => i === 0 || r.rows[i - 1].v >= x.v), `${tab} order`);
}
ok((await B.load('week')).rows.every((x) => x.v > 0), 'week only this week');
ok((await B.load('long')).rows.every((x) => x.v > 0), 'long no bt 0');
ok(B.stats.reads === 3, 'cache: ' + B.stats.reads);
const [p1, p2] = [B.load('top', { force: true }), B.load('top', { force: true })];
ok(p1 === p2, 'one read in flight per tab');
await p1;
ok(B.stats.reads === 4, 'force read: ' + B.stats.reads);
const rk = await B.myRank();
ok(rk.rank === 41 && !rk.plus && rk.tr === 802, 'my rank: ' + JSON.stringify(rk));   // 40 players above 802 (1000..805)
await B.myRank();
ok(B.stats.reads === 5, 'rank cached: ' + B.stats.reads);
const more = {};
for (let i = 0; i < 600; i++) more[`rk/x${i}`] = 2000 + i;
hub.admin.update(more);
session.profile = { ...session.profile, tr: 0 };
const rk2 = await B.myRank();
ok(rk2.plus && rk2.rank === 501 && B.stats.reads === 6, 'rank 500+: ' + JSON.stringify(rk2));
ok(denied.length === 0, 'denials: ' + JSON.stringify(denied));
// a read the rules refuse (a page larger than the rules allow) is an error, never a crash
const bad = await tp.get('users', { orderBy: 'child', child: 'tr', limitToLast: 101 }).then(() => 'ok', (e) => e.code);
ok(bad === 'PERMISSION_DENIED', 'the rules refuse 101 rows: ' + bad);
// a read that never answers: the timeout
const slow = createBoards({ transport: { get: () => new Promise(() => {}), now: () => t }, session, timeoutMs: 50 });
const r3 = await slow.load('top');
ok(r3.err === 'timeout' && r3.rows.length === 0 && !slow.cached('top'), 'timeout: ' + JSON.stringify(r3));
tp.close();
console.log(`${fails ? 'FAILED' : 'OK'} boards: ${n - fails}/${n} passed (BOARD.top ${BOARD.top}, rank max ${BOARD.rankMax})`);
process.exit(fails ? 1 : 0);
