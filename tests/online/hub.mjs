// node tests/online/hub.mjs — the local hub, the local adapter, the rule interpreter and the slow-network shim.
import { test, ok, eq, near, run, world } from './kit.mjs';
import { createClock } from '../../src/online/clock.js';
import { createHub } from '../../src/online/localhub.js';
import { createLocalTransport } from '../../src/online/transport-local.js';
import { createRules } from '../../src/online/rulescheck.js';
import { compile, allows, Snap } from '../../src/online/rulesexpr.js';
import { setIn, getIn, runQuery } from '../../src/online/tree.js';
import { shape } from '../../src/online/nettest.js';
import { TS, isDenied } from '../../src/online/transport.js';

const denied = async (p) => { try { await p; return false; } catch (e) { return isDenied(e); } };

test('tree: set, remove, prune, share untouched branches', () => {
  const a = setIn(null, ['x', 'y'], 1);
  eq(a, { x: { y: 1 } });
  const b = setIn(a, ['x', 'z'], { q: [5, null, 6] });
  eq(b, { x: { y: 1, z: { q: { 0: 5, 2: 6 } } } });
  eq(a, { x: { y: 1 } }, 'the old root is untouched');
  eq(setIn(b, ['x', 'z'], null), a);
  eq(setIn(a, ['x', 'y'], null), null, 'empty parents vanish');
  eq(getIn(b, ['x', 'z', 'q', '2']), 6);
  eq(getIn(b, ['nope', 'deeper']), null);
});

test('tree: queries order and limit like the database', () => {
  const users = { a: { tr: 30 }, b: { tr: 10 }, c: { tr: 20 }, d: { n: 'no trophies' } };
  eq(Object.keys(runQuery(users, { orderBy: 'child', child: 'tr' })), ['d', 'b', 'c', 'a']);
  eq(Object.keys(runQuery(users, { orderBy: 'child', child: 'tr', limitToLast: 2 })), ['c', 'a']);
  eq(Object.keys(runQuery(users, { orderBy: 'child', child: 'tr', startAt: 20 })), ['c', 'a']);
  eq(Object.keys(runQuery({ x: 5, y: 1, z: 3 }, { orderBy: 'value', startAfter: 1, limitToFirst: 1 })), ['z']);
  eq(runQuery(users, { orderBy: 'child', child: 'tr', startAt: 99 }), null);
});

test('rule language: the parts the rules use', () => {
  const root = { users: { u1: { tr: 40, n: 'Nika' } }, list: { 0: 'a', 1: 'b' } };
  const env = { auth: { uid: 'u1' }, now: 1000, root: new Snap(root, []), data: new Snap(root, ['users', 'u1']),
    newData: new Snap(root, ['users', 'u1']), query: { limitToLast: null, orderByChild: 'tr' }, vars: { $uid: 'u1', $i: '1' } };
  const yes = (src) => ok(allows(compile(src), env) === true, `should be true: ${src}`);
  const no = (src) => ok(allows(compile(src), env) === false, `should be false: ${src}`);
  yes('auth != null && auth.uid === $uid');
  yes("data.child('tr').val() + 2 * 5 - 10 / 2 === 45");
  yes("(data.child('tr').val() >= 30 ? 20 : 10) === 20");
  yes('(now - now % 300) / 300 === 3');
  yes("root.child('users/' + auth.uid + '/n').val().matches(/^[A-Za-z0-9 _-]{3,12}$/)");
  yes("$i.matches(/^[0-3]$/) && root.child('list/' + $i).val() === 'b'");
  yes("newData.hasChildren(['tr', 'n']) && !newData.hasChildren(['tr', 'zz'])");
  yes("data.child('n').isString() && data.child('tr').isNumber() && !data.child('n').isBoolean()");
  yes("data.parent().parent().child('list').exists() && data.child('n').val().length === 4");
  yes("query.orderByChild === 'tr'");
  yes('true || (1 < null)');
  no("data.child('missing').val() < 5");
  no("data.child('missing').val() + 1 === 1");
  no("'out/' + data.child('tr').val() === 'out/40'");
  no('query.limitToLast <= 100');
  no("data.child('tr').val() && true");
  no("root.child('nobody').val().length === 0");
  no('(1 < null) || true');
});

test('rule language: mistakes are caught when the rules are loaded', () => {
  for (const bad of ['auth.uid ===', 'foo === 1', "data.child('x'", '1 +* 2', "'open"]) {
    let threw = false;
    try { createRules({ rules: { a: { '.read': bad } } }); } catch { threw = true; }
    ok(threw, `should not parse: ${bad}`);
  }
});

test('rule tree: read and write grants cascade down, validate does not', () => {
  const r = createRules({ rules: {
    open: { '.read': true, '.write': 'auth != null', $k: { '.validate': 'newData.isNumber()', deep: { '.validate': false } } },
    box: { $uid: { '.write': 'auth.uid === $uid', '.validate': "newData.hasChildren(['a', 'b'])", a: { '.validate': 'newData.isNumber()' } } },
  } });
  const A = { uid: 'A' };
  const write = (auth, path, value, root = null) => r.write(auth, [path], root, setIn(root, path, value), 1).ok;
  ok(r.read(null, ['open', 'x', 'y'], null, 1, null), 'read below a granting rule');
  ok(!r.read(A, ['box', 'A'], null, 1, null), 'no rule, no read');
  ok(write(A, ['open', 'x'], 5));
  ok(!write(null, ['open', 'x'], 5), 'signed out');
  ok(!write(A, ['open', 'x'], 'text'), 'validate at the written node');
  ok(!write(A, ['open'], { x: 1, y: 'text' }), 'validate inside the written value');
  ok(write(A, ['box', 'A'], { a: 1, b: 2 }));
  ok(!write(A, ['box', 'B'], { a: 1, b: 2 }), 'another player');
  ok(!write(A, ['box', 'A', 'a'], 1), 'the parent validate sees the missing sibling');
  ok(write(A, ['box', 'A', 'a'], 7, { box: { A: { a: 1, b: 2 } } }), 'the parent validate passes with the sibling there');
  ok(!write(A, ['box', 'A', 'b'], null, { box: { A: { a: 1, b: 2 } } }), 'removing a required child fails the parent');
  ok(write(A, ['box', 'A'], null, { box: { A: { a: 1, b: 2 } } }), 'removing the whole node skips validate');
});

test('hub: set, get, listeners, child events, server time', async () => {
  const w = world({ withRules: false });
  const a = await w.client('A');
  const b = await w.client('B');
  const seen = [];
  b.on('room', 'value', (v) => seen.push(['value', v]));
  b.on('room/list', 'child_added', (v, k) => seen.push(['added', k, v]));
  b.on('room/list', 'child_changed', (v, k) => seen.push(['changed', k, v]));
  b.on('room/list', 'child_removed', (v, k) => seen.push(['removed', k, v]));
  await w.clock.advance(1);
  eq(seen, [['value', null]], 'a value listener hears "nothing here" straight away');
  seen.length = 0;
  a.set('room/list/x', { at: TS });
  await w.clock.advance(1);
  eq(seen, [['value', { list: { x: { at: w.clock.now() - 1 } } }], ['added', 'x', { at: w.clock.now() - 1 }]]);
  seen.length = 0;
  await a.update({ 'room/list/x/at': 5, 'room/list/y': true, 'room/flag': 1 });
  eq(seen.filter((e) => e[0] === 'value').length, 1, 'one value event for one atomic update');
  eq(seen.filter((e) => e[0] !== 'value').sort((p, q) => (p[1] < q[1] ? -1 : 1)), [['changed', 'x', { at: 5 }], ['added', 'y', true]]);
  seen.length = 0;
  await a.remove('room/list/x');
  eq(seen.filter((e) => e[0] === 'removed'), [['removed', 'x', { at: 5 }]]);
  eq(await b.get('room/list'), { y: true });
  eq(await b.get('room/nothing'), null);
  const id1 = await a.push('log', 'one');
  const id2 = await a.push('log', 'two');
  ok(id1 < id2, 'push ids sort by creation');
  eq(Object.values(await b.get('log')), ['one', 'two']);
});

test('hub: a query listener and a query read', async () => {
  const w = world({ withRules: false });
  const a = await w.client('A');
  await a.set('q', { a: { ts: 3 }, b: { ts: 1 }, c: { ts: 2 } });
  const added = [];
  a.on('q', 'child_added', (v, k) => added.push(k), { orderBy: 'child', child: 'ts', limitToFirst: 2 });
  await w.clock.advance(1);
  eq(added, ['b', 'c']);
  await a.remove('q/b');
  eq(added, ['b', 'c', 'a'], 'the next one moves into the window');
  eq(Object.keys(await a.get('q', { orderBy: 'child', child: 'ts', limitToLast: 1 })), ['a']);
});

test('hub: transactions are compare-and-set', async () => {
  const w = world({ withRules: false });
  const a = await w.client('A');
  const b = await w.client('B');
  const take = (tp, who) => tp.tx('seat', (cur) => (cur === null ? who : undefined));
  const [ra, rb] = await w.settle(Promise.all([take(a, 'A'), take(b, 'B')]));
  eq([ra.committed, rb.committed].filter(Boolean).length, 1, 'exactly one of two racing takers gets the seat');
  eq(await a.get('seat'), ra.committed ? 'A' : 'B');
  const counts = await w.settle(Promise.all([1, 2, 3, 4, 5].map(() => a.tx('n', (c) => (c || 0) + 1))));
  eq(await b.get('n'), 5, 'retries until every increment lands');
  ok(counts.every((r) => r.committed));
});

test('hub: onDisconnect fires on a clean close, after dropMs when the network dies, and can be cancelled', async () => {
  const w = world({ withRules: false, dropMs: 5000 });
  const a = await w.client('A');
  const b = shape(await w.client('B'), { clock: w.clock });
  const c = await w.client('C');
  await a.set('seats', { a: 'A', b: 'B', c: 'C', c2: 'C' });
  a.onDisconnect('seats/a', null);
  b.onDisconnect('seats/b', 'gone');
  c.onDisconnect('seats/c', null);
  const keep = c.onDisconnect('seats/c2', null);
  await w.clock.advance(1);
  keep.cancel();
  await w.clock.advance(1);
  a.close();
  await w.clock.advance(1);
  eq(w.hub.admin.get('seats'), { b: 'B', c: 'C', c2: 'C' }, 'clean close: at once');
  b.net.offline(true);
  await w.clock.advance(4000);
  eq(w.hub.admin.get('seats/b'), 'B', 'not yet');
  await w.clock.advance(1500);
  eq(w.hub.admin.get('seats/b'), 'gone', 'after dropMs');
  c.close();
  await w.clock.advance(1);
  eq(w.hub.admin.get('seats'), { b: 'gone', c2: 'C' }, 'the cancelled one stays');
});

test('hub: a client that was away gets one catch-up event, not a replay', async () => {
  const w = world({ withRules: false });
  const a = await w.client('A');
  const b = shape(await w.client('B'), { clock: w.clock });
  const seen = [];
  b.on('v', 'value', (v) => seen.push(v));
  await w.clock.advance(5);
  b.net.offline(true);
  eq(b.status(), 'lost');
  for (let i = 1; i <= 5; i++) await a.set('v', i);
  const queued = b.set('mine', 1);
  await w.clock.advance(100);
  eq(seen, [null]);
  eq(b.pending(), 1, 'my write waits');
  eq(w.hub.admin.get('mine'), null);
  b.net.offline(false);
  await w.settle(queued);
  eq(seen, [null, 5]);
  eq(b.pending(), 0);
  eq(w.hub.admin.get('mine'), 1);
  eq(b.status(), 'on');
});

test('hub: clients over a JSON message port (the browser bridge)', async () => {
  const clock = createClock();
  const hub = createHub({ clock });
  const wire = [];                       // every message really is JSON text here
  const page = { post: (m) => { wire.push(JSON.stringify(m)); queueMicrotask(() => node.onmessage(JSON.parse(wire[wire.length - 1]))); }, onmessage: null };
  const node = { post: (m) => { const text = JSON.stringify(m); queueMicrotask(() => page.onmessage(JSON.parse(text))); }, onmessage: null };
  hub.attach(node);
  const tp = createLocalTransport({ port: page, uid: 'P1', clock, follow: true });
  const p = tp.connect();
  await clock.advance(1);
  eq((await p).uid, 'P1');
  await tp.set('hello', { there: TS });
  eq(hub.admin.get('hello/there'), clock.now());
  await clock.advance(5000);
  eq(tp.now(), clock.now() - 5000, 'follow mode: time stands still until the hub speaks');
  hub.syncTime();
  await clock.advance(0);
  eq(tp.now(), clock.now());
  ok(wire.length >= 2 && wire.every((t) => typeof t === 'string'));
});

test('transport: status, pending, denied writes, connect timeout', async () => {
  const w = world();
  const a = createLocalTransport({ hub: w.hub, uid: 'A', clock: w.clock });
  eq(a.status(), 'off');
  const states = [];
  a.onStatus((s) => states.push(s));
  const p = a.connect();
  eq(a.status(), 'connecting');
  await w.clock.advance(1);
  await p;
  eq(states, ['connecting', 'on']);
  const write = a.set('cfg/on', false);
  eq(a.pending(), 1);
  ok(await denied(write), 'the rules refuse a client write to cfg');
  eq(a.pending(), 0);
  eq(await a.get('cfg'), null, 'anyone may read cfg');
  ok(await denied(a.get('users')), 'reading every profile at once is refused');
  let listenErr = null;
  a.on('users', 'value', () => {}, null, (e) => { listenErr = e; });
  await w.clock.advance(1);
  ok(isDenied(listenErr), 'a refused listener reports it');
  // a hub that never answers
  const dead = createLocalTransport({ port: { post() {}, onmessage: null }, uid: 'Z', clock: w.clock });
  let failed = null;
  dead.connect().catch((e) => { failed = e.code; });
  await w.clock.advance(8100);
  eq(failed, 'timeout');
  eq(dead.status(), 'off');
});

test('echo mode imitates the real SDK: my listeners fire at once, a timestamp is first a guess, a refusal rolls back', async () => {
  const w = world();
  const a = createLocalTransport({ hub: w.hub, uid: 'uidA', clock: w.clock, echo: true });
  const p = a.connect();
  await w.clock.advance(1);
  await p;
  await a.set('users/uidA', { n: 'Echo', tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0 });
  const seen = [];
  a.on('users/uidA', 'value', (v) => seen.push(v && [v.n, v.tr]));
  await w.clock.advance(1);
  eq(seen, [['Echo', 0]]);
  const refused = a.set('users/uidA/tr', 500).catch((e) => e.code);
  eq(seen[seen.length - 1], ['Echo', 500], 'shown before the server has answered');
  eq(await w.settle(refused), 'PERMISSION_DENIED');
  eq(seen[seen.length - 1], ['Echo', 0], 'and taken back when the rules said no');
  await a.set('users/uidA/n', 'Echo Two');
  eq(seen[seen.length - 1], ['Echo Two', 0]);
  // a server timestamp: a local guess first, then the server's own value
  const stamps = [];
  await a.set('rooms/ABCD', { h: 'uidA', k: 'friend', max: 2, ts: a.TS, st: 'lobby', rn: 0, sl: { 0: 'uidA' } });
  a.on('rooms/ABCD/ts', 'value', (v) => stamps.push(v));
  await w.clock.advance(5);
  const write = a.set('rooms/ABCD/ts', a.TS);
  const guess = stamps[stamps.length - 1];
  await w.settle(write);
  const real = stamps[stamps.length - 1];
  eq(real, w.hub.admin.get('rooms/ABCD/ts'));
  ok(guess !== real && Math.abs(guess - real) < 50, `guess ${guess}, server ${real}`);
});

test('nettest: delay, order and the loss model', async () => {
  const w = world({ withRules: false });
  const a = shape(await w.client('A'), { clock: w.clock, lat: 400 });
  const b = await w.client('B');
  const got = [];
  b.on('n', 'value', (v) => got.push([v, w.clock.now()]));
  await w.clock.advance(1);
  const t0 = w.clock.now();
  let acked = 0;
  a.set('n', 1).then(() => { acked = w.clock.now() - t0; });
  a.set('n', 2);
  eq(a.pending(), 2);
  await w.clock.advance(399);
  eq(got.length, 1, 'nothing has arrived yet');
  await w.clock.advance(2);
  eq(got.slice(1).map((g) => g[0]), [1, 2], 'in order');
  await w.clock.advance(400);
  near(acked, 800, 2, 'acknowledged after a round trip');
  eq(a.pending(), 0);
  // heavy loss: still every write, still in order
  const c = shape(await w.client('C'), { clock: w.clock, lat: 100, jit: 80, loss: 30, seed: 7 });
  const order = [];
  b.on('m', 'value', (v) => { if (v !== null) order.push(v); });
  for (let i = 1; i <= 40; i++) c.set('m', i);
  await w.clock.advance(60000);
  eq(order[order.length - 1], 40);
  ok(order.every((v, i) => i === 0 || v > order[i - 1]), 'never out of order');
  eq(c.pending(), 0);
});

run('hub');
