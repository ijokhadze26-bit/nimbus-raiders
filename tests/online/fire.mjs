// node tests/online/fire.mjs — the real adapter, as far as it can be checked with NO account and NO network:
// it loads the installed SDK, is forced offline before anything could connect, and is then driven through
// the transport interface. This proves the SDK calls exist and are wired the right way round (paths, the
// timestamp sentinel, queries, push ids, listener callbacks, pending()). It cannot prove sign-in, the
// rules or timing: that is scripts/rules-probe.mjs --live, once the owner has made the account.
import { test, ok, eq, run } from './kit.mjs';
import { TS } from '../../src/online/transport.js';

const FAKE = {
  apiKey: 'not-a-real-key',
  authDomain: 'nimbus-offline-test.firebaseapp.com',
  databaseURL: 'https://nimbus-offline-test-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'nimbus-offline-test',
  appId: '1:1:web:1',
};

let tp;

test('the SDK loads and the adapter has the whole interface', async () => {
  const { createFireTransport } = await import('../../src/online/transport-fire.js');
  tp = createFireTransport(FAKE, { name: 'offline-test' });
  tp._net(false); // stay offline: no socket is ever opened
  for (const f of ['connect', 'now', 'status', 'onStatus', 'get', 'set', 'update', 'push', 'newId', 'remove', 'tx', 'on', 'onDisconnect', 'pending', 'idle', 'close']) {
    eq(typeof tp[f], 'function', f);
  }
  eq(tp.TS, TS);
  eq(tp.kind, 'fire');
  eq(tp.status(), 'off');
  eq(tp.uid, null);
  ok(Math.abs(tp.now() - Date.now()) < 50, 'no offset known yet');
  // the device clock is corrected by 15 s: now() must not move with it (deadlines and the match clock hang on it)
  const real = Date.now;
  const t1 = tp.now();
  Date.now = () => real() - 15000;
  const t2 = tp.now();
  Date.now = () => real() + 15000;
  const t3 = tp.now();
  Date.now = real;
  ok(Math.abs(t2 - t1) < 50 && Math.abs(t3 - t1) < 50, `now() jumped with the device clock: ${t2 - t1} / ${t3 - t1}`);
});

test('writes queue while offline, listeners hear them at once as plain objects', async () => {
  const seen = [];
  const off = tp.on('rooms/ABCD/sl', 'value', (v, key) => seen.push([key, v]));
  const before = Date.now();
  tp.set('rooms/ABCD/sl', { 0: 'uidA', 1: 'uidB' }).catch(() => {});
  tp.update({ 'rooms/ABCD/st': 'live', 'rooms/ABCD/mts': TS }).catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  eq(tp.pending(), 2, 'both writes are waiting for the server');
  const last = seen[seen.length - 1];
  eq(last[0], 'sl');
  eq(last[1], { 0: 'uidA', 1: 'uidB' }, 'an object, although the SDK itself would hand back an array here');
  ok(!Array.isArray(last[1]));
  // (a value listener only fires once the SDK holds the whole node, so listen where a whole value was set)
  const got = [];
  tp.set('rooms/WXYZ', { h: 'uidA', st: 'live', mts: TS, sl: ['uidA', 'uidB'] }).catch(() => {});
  tp.on('rooms/WXYZ', 'value', (v) => got.push(v));
  await new Promise((r) => setTimeout(r, 20));
  const room = got[got.length - 1];
  eq([room.st, room.sl], ['live', { 0: 'uidA', 1: 'uidB' }]);
  ok(typeof room.mts === 'number' && Math.abs(room.mts - before) < 5000, 'the timestamp sentinel became a time (a local estimate while offline)');
  eq(tp.pending(), 3);
  off();
});

test('child events, queries, push ids and onDisconnect are wired', async () => {
  const added = [];
  tp.on('users', 'child_added', (v, k) => added.push([k, v.tr]), { orderBy: 'child', child: 'tr', limitToLast: 2 });
  tp.set('users/a', { tr: 10 }).catch(() => {});
  tp.set('users/b', { tr: 30 }).catch(() => {});
  tp.set('users/c', { tr: 20 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  eq(added.map((x) => x[0]).sort(), ['a', 'b', 'c'], 'each one entered the top-2 window at some point');
  const ranked = [];
  tp.set('board', { a: { tr: 10 }, b: { tr: 30 }, c: { tr: 20 } }).catch(() => {});
  tp.on('board', 'value', (v) => ranked.push(Object.keys(v || {})), { orderBy: 'child', child: 'tr', limitToLast: 2 });
  tp.on('rk', 'value', () => {}, { orderBy: 'value', startAfter: 5, limitToFirst: 500 });
  await new Promise((r) => setTimeout(r, 20));
  eq(ranked[ranked.length - 1], ['c', 'b'], 'query order is kept: 20 then 30');
  const id1 = tp.newId(), id2 = tp.newId();
  ok(typeof id1 === 'string' && id1.length === 20 && id1 < id2, 'push ids sort by creation');
  const hold = tp.onDisconnect('rooms/ABCD/sl/1', null);
  eq(typeof hold.cancel, 'function');
  tp.onDisconnect('rooms/ABCD/p/1', { n: 'gone', at: TS });
  tp.remove('users/a').catch(() => {});
  tp.push('rooms/ABCD/ev/m1', { k: 'e', a: 1, f: 0, to: 1 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  eq(added.length, 3);
  ok(tp.pending() >= 9, `every write is still waiting: ${tp.pending()}`);
  tp.close();
  eq(tp.status(), 'off');
});

run('fire');
