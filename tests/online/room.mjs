// node tests/online/room.mjs — friend rooms over the in-process hub with a virtual clock.
import { test, ok, eq, run, world } from './kit.mjs';
import { createRoom, joinRoom } from '../../src/online/room.js';
import { hash32 } from '../../src/online/transport.js';
import { shape } from '../../src/online/nettest.js';
import { CODE_RE } from '../../src/online/config.js';

const PICK = { he: 'vanguard', we: 'blaster', hs: 'gold', ws: '' };

/** Host A creates, B joins by code. */
async function pair(w, optsB = {}) {
  const a = await w.player('uidA', 'Alpha');
  const b = await w.player('uidB', 'Bravo', optsB.net);
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, picks: PICK, clock: w.clock }));
  const rb = await w.settle(joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, picks: { he: 'medic', we: 'laser' }, clock: w.clock }), 6000);
  await w.clock.advance(optsB.net ? 2000 : 10);
  return { a, b, ra, rb };
}

test('create a room and join it by code', async () => {
  const w = world();
  const { ra, rb } = await pair(w);
  ok(CODE_RE.test(ra.code), ra.code);
  for (const r of [ra, rb]) {
    const s = r.state;
    eq([s.code, s.k, s.max, s.st, s.host, s.rn, s.spectators], [ra.code, 'friend', 2, 'lobby', 'uidA', 0, 0]);
    eq(s.seats.map((x) => [x.slot, x.uid, x.n, x.he, x.we, x.rdy, x.rm]),
      [[0, 'uidA', 'Alpha', 'vanguard', 'blaster', false, false], [1, 'uidB', 'Bravo', 'medic', 'laser', false, false]]);
    eq([s.mid, s.t0, s.seed, s.hostLeft, s.gone], [null, null, null, false, false]);
  }
  eq([ra.state.me, rb.state.me], [0, 1]);
  eq(w.denials.length, 0, 'no write was refused along the way');
});

test('a wrong code says not-found; lower case works', async () => {
  const w = world();
  const a = await w.player('uidA', 'Alpha');
  const b = await w.player('uidB', 'Bravo');
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  const other = ra.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ';
  for (const bad of [other, 'AB', '', 'ABIO', null]) {
    let code = null;
    await w.settle(joinRoom({ transport: b.tp, code: bad, profile: b.profile, clock: w.clock }).catch((e) => { code = e.code; }));
    eq(code, 'not-found', `code ${bad}`);
  }
  const rb = await w.settle(joinRoom({ transport: b.tp, code: ` ${ra.code.toLowerCase()} `, profile: b.profile, clock: w.clock }));
  eq(rb.state.me, 1);
});

test('a taken code is retried with another one', async () => {
  const w = world();
  const a = await w.player('uidA', 'Alpha');
  const b = await w.player('uidB', 'Bravo');
  const fixed = () => 0.5; // always the same letters
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, rand: fixed, clock: w.clock }));
  let n = 0;
  const thenOther = () => (n++ < 4 ? 0.5 : 0.1);
  const rb = await w.settle(createRoom({ transport: b.tp, profile: b.profile, rand: thenOther, clock: w.clock }));
  ok(ra.code !== rb.code, `${ra.code} / ${rb.code}`);
  eq(rb.state.host, 'uidB');
  let failed = null;
  await w.settle(createRoom({ transport: b.tp, profile: b.profile, rand: fixed, clock: w.clock }).catch((e) => { failed = e.code; }));
  eq(failed, 'no-code', 'gives up after 5 collisions');
});

test('no seat free: a plain join throws full / playing and writes nothing; watch: true watches; two racing for one seat cannot both get it', async () => {
  const w = world();
  const a = await w.player('uidA', 'Alpha');
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  const b = await w.player('uidB', 'Bravo');
  const c = await w.player('uidC', 'Charlie');
  const tries = await w.settle(Promise.all([
    joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }).catch((e) => e.code),
    joinRoom({ transport: c.tp, code: ra.code, profile: c.profile, clock: w.clock }).catch((e) => e.code),
  ]));
  await w.clock.advance(10);
  const seated = tries.filter((r) => typeof r === 'object' && r.state.me === 1);
  eq([seated.length, tries.filter((r) => r === 'full').length], [1, 1], 'one sits, the other is told the lobby is full');
  eq(w.hub.admin.get(`rooms/${ra.code}/sp`), null, 'no watcher marker from a plain join');
  eq(ra.state.spectators, 0);
  const d = await w.player('uidD', 'Delta');
  const rd = await w.settle(joinRoom({ transport: d.tp, code: ra.code, profile: d.profile, watch: true, clock: w.clock }));
  await w.clock.advance(10);
  eq([rd.state.me, rd.state.watching, ra.state.spectators], [null, true, 1]);
  // the match starts: a plain join now says 'playing', still without a marker
  ra.on('start', () => {}); seated[0].on('start', () => {});
  await w.settle(Promise.all([ra.ready(true), seated[0].ready(true)]));
  await w.clock.advance(200);
  ok(ra.state.mid, 'live');
  const e = await w.player('uidE', 'Echo');
  let code = null;
  await w.settle(joinRoom({ transport: e.tp, code: ra.code, profile: e.profile, clock: w.clock }).catch((x) => { code = x.code; }));
  eq(code, 'playing');
  eq(Object.keys(w.hub.admin.get(`rooms/${ra.code}/sp`) || {}), ['uidD'], 'only the real watcher has a marker');
  // four watch: the fifth is turned away
  for (const id of ['uidX', 'uidY', 'uidZ']) w.hub.admin.set(`rooms/${ra.code}/sp/${id}`, true);
  await w.clock.advance(10);
  code = null;
  await w.settle(joinRoom({ transport: e.tp, code: ra.code, profile: e.profile, watch: true, clock: w.clock }).catch((x) => { code = x.code; }));
  eq(code, 'full', 'the 5th watcher');
  eq(w.hub.admin.get(`rooms/${ra.code}/sp/uidE`), null);
  await w.settle(rd.leave());
  await w.clock.advance(10);
  eq(ra.state.spectators, 3, 'a watcher who leaves is gone');
  eq(w.denials.length, 0);
});

test('picks show live and lock at ready', async () => {
  const w = world();
  const { ra, rb } = await pair(w);
  let changes = 0;
  ra.on('change', () => changes++);
  eq(await w.settle(rb.pick({ he: 'sniper', ws: 'neon' })), true);
  await w.clock.advance(10);
  eq([ra.state.seats[1].he, ra.state.seats[1].we, ra.state.seats[1].ws], ['sniper', 'laser', 'neon']);
  ok(changes >= 1);
  await w.settle(rb.ready(true));
  await w.clock.advance(10);
  eq(ra.state.seats[1].rdy, true);
  eq(await w.settle(rb.pick({ he: 'medic' })), false, 'locked');
  await w.clock.advance(10);
  eq(ra.state.seats[1].he, 'sniper');
  await w.settle(rb.ready(false));
  await w.clock.advance(10);
  eq(ra.state.seats[1].rdy, false);
  eq(await w.settle(rb.pick({ he: 'medic' })), true, 'unlocked again');
});

test('ready, start: both derive the same match, seed and GO time from the server record', async () => {
  const w = world();
  const { ra, rb } = await pair(w);
  const starts = { a: [], b: [] };
  ra.on('start', (s) => starts.a.push(s));
  rb.on('start', (s) => starts.b.push(s));
  await w.settle(ra.ready(true));
  await w.clock.advance(50);
  eq(ra.state.st, 'lobby', 'one ready player does not start anything');
  await w.settle(rb.ready(true));
  await w.clock.advance(50);
  eq([starts.a.length, starts.b.length], [1, 1]);
  eq(starts.a[0], starts.b[0]);
  const { mid, t0, seed } = starts.a[0];
  const rec = w.hub.admin.get(`matches/${mid}`);
  eq(rec.code, ra.code);
  eq(rec.u, { 0: 'uidA', 1: 'uidB' });
  eq(rec.us, { uidA: 0, uidB: 1 });
  eq(rec.tr, { 0: 0, 1: 0 });
  eq(t0, rec.ts + 4000);
  eq(seed, hash32(rec.ts, mid));
  for (const r of [ra, rb]) eq([r.state.st, r.state.mid, r.state.t0, r.state.seed], ['live', mid, t0, seed]);
  eq(w.hub.admin.get(`rooms/${ra.code}/mid`), mid);
  eq(w.denials.length, 0);
});

test('rematch: back to the lobby, a new match id and a new seed', async () => {
  const w = world();
  const { b, ra, rb } = await pair(w);
  const seeds = [];
  ra.on('start', (s) => seeds.push(s));
  /** the match in the room ends: B falls (its own write-once record) */
  const fallB = async () => { await w.clock.advance(3500); await b.tp.set(`matches/${ra.state.mid}/out/1`, { t: 5, d: 10, ts: b.tp.TS, by: 'dead' }); };
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
  await w.clock.advance(50);
  await w.settle(Promise.all([ra.rematch(), rb.rematch()]));
  await w.clock.advance(3000);
  eq([ra.state.st, ra.state.rn], ['live', 0], 'no rematch while the match is still on (the rules refuse it)');
  await fallB();
  await w.clock.advance(2000);
  for (const r of [ra, rb]) {
    eq([r.state.st, r.state.rn, r.state.mid, r.state.seed, r.state.players], ['lobby', 1, null, null, null], 'the match is over: back to the lobby');
    eq(r.state.seats.map((s) => [s.rdy, s.rm]), [[false, false], [false, false]], 'last round\'s ready and rematch are spent');
  }
  await w.clock.advance(3000);
  eq(ra.state.st, 'lobby', 'nothing starts until both are ready again');
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
  await w.clock.advance(50);
  eq(seeds.length, 2);
  ok(seeds[0].mid !== seeds[1].mid && seeds[0].seed !== seeds[1].seed, 'new road');
  eq([ra.state.st, rb.state.seed], ['live', seeds[1].seed]);
  await fallB();
  await w.settle(ra.rematch());
  await w.clock.advance(50);
  eq([ra.state.st, rb.state.seats[0].rm, rb.state.seats[1].rm], ['live', true, false], 'one player asking is not enough');
  // the quick way: both press REMATCH and go straight in
  await w.settle(Promise.all([ra.rematch({ ready: true }), rb.rematch({ ready: true })]));
  await w.clock.advance(100);
  eq(seeds.length, 3);
  eq([ra.state.st, ra.state.rn, rb.state.mid], ['live', 2, seeds[2].mid]);
});

test('rematch after the rival closed the tab: the seat is free, the room goes back to the lobby without them', async () => {
  for (const how of ['tab closed', 'network gone']) {
    const w = world();
    const a = await w.player('uidA', 'Alpha', {});
    const b = await w.player('uidB', 'Bravo');
    const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
    const rb = await w.settle(joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }));
    await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
    await w.clock.advance(3500);
    await w.settle(a.tp.set(`matches/${ra.state.mid}/out/0`, { t: 5, d: 10, ts: a.tp.TS, by: 'dead' })); // the host loses...
    if (how === 'tab closed') a.tp.close(); else a.tp.net.offline(true);                        // ...and is gone
    await w.clock.advance(6000);
    eq(rb.state.seats.map((s) => s && s.n), [null, 'Bravo'], `${how}: the winner sees the empty seat`);
    await w.settle(rb.rematch({ ready: true }));
    await w.clock.advance(2000);
    eq([rb.state.st, rb.state.rn, rb.state.hostLeft, rb.state.seats[1].rdy], ['lobby', 1, true, true], `${how}: lobby again, alone, host left`);
  }
});

test('leaving frees the seat; the host leaving a lobby removes the room; an empty room is removed', async () => {
  const w = world();
  const { a, ra, rb } = await pair(w);
  await w.settle(rb.leave());
  await w.clock.advance(10);
  eq([ra.state.seats[1], ra.state.hostLeft], [null, false]);
  const b2 = await w.player('uidC', 'Charlie');
  const rc = await w.settle(joinRoom({ transport: b2.tp, code: ra.code, profile: b2.profile, clock: w.clock }));
  await w.clock.advance(10);
  eq(rc.state.me, 1);
  await w.settle(ra.leave());
  await w.clock.advance(10);
  eq([rc.state.gone, w.hub.admin.get(`rooms/${ra.code}`)], [true, null], 'the host leaving the lobby closes it for everyone');
  await w.settle(rc.leave());
  await w.clock.advance(10);
  eq(w.hub.admin.get(`rooms/${ra.code}`), null);
  // a guest is the last one out: they take the room with them
  const e = await w.player('uidE', 'Echo', {}); // (with a network that can drop)
  const two = await w.settle(createRoom({ transport: e.tp, profile: e.profile, clock: w.clock }));
  const rc2 = await w.settle(joinRoom({ transport: b2.tp, code: two.code, profile: b2.profile, clock: w.clock }));
  await w.clock.advance(10);
  e.tp.net.offline(true);                     // the host's link drops: the hub frees the seat
  await w.clock.advance(6000);
  eq([rc2.state.hostLeft, rc2.state.seats[0]], [true, null], 'a dropped host shows as host-left');
  // nobody new gets in meanwhile: the host may be on the way back
  const d = await w.player('uidD', 'Delta');
  let err = null;
  try { await w.settle(joinRoom({ transport: d.tp, code: two.code, profile: d.profile, clock: w.clock })); } catch (e) { err = e; }
  eq(err && err.code, 'hostaway', 'joining a lobby whose host is away');
  await w.settle(rc2.leave());
  await w.clock.advance(10);
  eq(w.hub.admin.get(`rooms/${two.code}`), null, 'the last one out takes the room with them');
  two.close();
  e.tp.net.offline(false);
  await w.clock.advance(10);
  const solo = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  await w.settle(solo.leave());
  eq(w.hub.admin.get(`rooms/${solo.code}`), null);
  eq(w.denials.length, 0, 'no write was refused along the way');
  // an old code of a lobby nobody sits in any more (the host closed the tab): ROOM CLOSED, and it is tidied away
  const dead = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  dead.close(); a.tp.close();
  await w.clock.advance(10);
  err = null;
  try { await w.settle(joinRoom({ transport: d.tp, code: dead.code, profile: d.profile, clock: w.clock })); } catch (e) { err = e; }
  await w.clock.advance(10);
  eq([err && err.code, w.hub.admin.get(`rooms/${dead.code}`)], ['closed', null], 'joining a dead lobby');
});

test('leaving and creating while offline never hang; a left room stays quiet', async () => {
  const w = world();
  const { b, ra, rb } = await pair(w, { net: {} });
  let changes = 0, left = false;
  rb.on('change', () => changes++);
  b.tp.net.offline(true);
  await w.clock.advance(500);
  rb.leave().then(() => { left = true; });
  await w.clock.advance(2500);
  ok(left, 'leave() is done after 2 s although the write could not be sent');
  const before = changes;
  let err = null;
  createRoom({ transport: b.tp, profile: b.profile, clock: w.clock }).catch((e) => { err = e.code; });
  await w.clock.advance(9000);
  eq(err, 'timeout', 'createRoom gives up instead of waiting for ever');
  b.tp.net.offline(false);
  await w.clock.advance(5000);
  eq(changes, before, 'no change events after leaving');
  eq(ra.state.seats[1], null, 'the seat was given up');
  eq(Object.keys(w.hub.admin.get('rooms')), [ra.code], 'and the room that was created too late did not stay');
});

test('a seat is presence: it goes with the connection and comes back with it, in the lobby and in a match', async () => {
  for (const ms of [800, 6000]) {
    const w = world({ dropMs: 5000 });
    const a = await w.player('uidA', 'Alpha', {});
    const b = await w.player('uidB', 'Bravo', {});
    const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, picks: PICK, clock: w.clock }));
    const rb = await w.settle(joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }));
    await w.settle(rb.pick({ he: 'tank' }));
    await w.settle(rb.ready(true));
    await w.clock.advance(100);
    b.tp.net.offline(true);
    await w.clock.advance(ms);
    if (ms > 5000) eq(ra.state.seats[1], null, 'the others see the seat empty once the service has noticed');
    b.tp.net.offline(false);
    await w.clock.advance(2000);
    for (const r of [ra, rb]) eq(r.state.seats.map((s) => s && [s.n, s.he, s.rdy]), [['Alpha', 'vanguard', false], ['Bravo', 'tank', true]], `${ms} ms away: seat, picks and ready are back`);
    eq([rb.state.me, rb.state.lost], [1, false]);
    // the host blips: HOST LEFT shows only while the seat is really empty
    a.tp.net.offline(true);
    await w.clock.advance(ms);
    a.tp.net.offline(false);
    await w.clock.advance(2000);
    eq([ra.state.me, rb.state.hostLeft, rb.state.seats[0].uid], [0, false, 'uidA'], 'the host is back in seat 0');
    await w.settle(ra.ready(true));
    await w.clock.advance(200);
    eq([ra.state.st, rb.state.st, !!rb.state.mid], ['live', 'live', true], 'and the match can start');
    // in a match the seat drops on a reconnect as well: the player may keep sending and takes the seat back
    b.tp.net.offline(true);
    await w.clock.advance(ms);
    b.tp.net.offline(false);
    await w.settle(b.tp.set(`rooms/${ra.code}/hb/1`, { a: b.tp.TS, t: 0 }), 4000);
    await w.clock.advance(2000);
    eq([rb.state.me, ra.state.seats[1]?.uid, ra.state.players.map((p) => p.uid)], [1, 'uidB', ['uidA', 'uidB']], 'seated again mid-match');
    eq(w.denials.length, 0, 'no write was refused along the way');
  }
});

test('a seat that cannot be taken back shows as lost', async () => {
  const w = world();
  const { b, ra, rb } = await pair(w, { net: {} });
  const c = await w.player('uidC', 'Charlie');
  b.tp.net.offline(true);
  await w.clock.advance(6000);
  const rc = await w.settle(joinRoom({ transport: c.tp, code: ra.code, profile: c.profile, clock: w.clock }));
  eq(rc.state.me, 1, 'somebody else sat down meanwhile');
  b.tp.net.offline(false);
  await w.clock.advance(2000);
  eq([rb.state.me, rb.state.lost, ra.state.seats[1].uid], [null, true, 'uidC']);
  // the same when the others started while I was away: I am not in that match
  const w2 = world();
  const x = await pair(w2, { net: {} });
  const c2 = await w2.player('uidC', 'Charlie');
  w2.hub.admin.set(`rooms/${x.ra.code}/max`, 4);
  x.b.tp.net.offline(true);
  await w2.clock.advance(6000);
  const r3 = await w2.settle(joinRoom({ transport: c2.tp, code: x.ra.code, profile: c2.profile, clock: w2.clock }));
  await w2.settle(Promise.all([x.ra.ready(true), r3.ready(true)]));
  await w2.clock.advance(500);
  x.b.tp.net.offline(false);
  await w2.clock.advance(2000);
  eq([x.ra.state.st, x.rb.state.me, x.rb.state.lost, x.rb.state.players.map((p) => p.uid)], ['live', null, true, ['uidA', 'uidC']]);
});

test('a player who sits down while the host is starting is not half in the match', async () => {
  const w = world();
  const a = await w.player('uidA', 'Alpha', { lat: 60 });
  const b = await w.player('uidB', 'Bravo', { lat: 60 });
  const c = await w.player('uidC', 'Charlie', { lat: 20 });
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock, max: 4 }), 8000);
  const rb = await w.settle(joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }), 8000);
  ra.ready(true); rb.ready(true);
  await w.clock.advance(260); // the host's match record is written, its "room is live" update is on the way
  const rc = await w.settle(joinRoom({ transport: c.tp, code: ra.code, profile: c.profile, clock: w.clock }), 8000);
  await w.clock.advance(4000);
  eq([ra.state.st, rc.state.me], ['lobby', 2], 'the start was called off: three are seated and one is not ready');
  eq(w.hub.admin.get('matches'), null, 'and the unused match record was tidied away');
  await w.settle(rc.ready(true), 4000);
  await w.clock.advance(4000);
  for (const r of [ra, rb, rc]) eq([r.state.st, r.state.players.map((p) => p.slot)], ['live', [0, 1, 2]], 'then all three start together');
  eq(w.hub.admin.get(`matches/${ra.state.mid}/u`), { 0: 'uidA', 1: 'uidB', 2: 'uidC' });
});

test('a lobby that stays open for hours keeps its room', async () => {
  const w = world();
  const { ra, rb } = await pair(w);
  const c = await w.client('uidC');
  await w.clock.advance(5 * 3600000);
  let denied = false;
  await c.remove(`rooms/${ra.code}`).catch(() => { denied = true; });
  ok(denied, 'nobody can clear it away: it is not stale');
  eq([ra.state.seats.map((s) => s.n), rb.state.gone], [['Alpha', 'Bravo'], false]);
  // both leave in the same moment: the room goes with them (no orphan)
  await w.settle(Promise.all([ra.leave(), rb.leave()]));
  await w.clock.advance(100);
  eq(w.hub.admin.get(`rooms/${ra.code}`), null);
});

test('one hosted room per account: a new room lets go of the old seat first', async () => {
  const w = world();
  const { a, ra, rb } = await pair(w);
  ra.close(); // a reload: the page forgot the room, the seat is still held
  const second = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  await w.clock.advance(50);
  ok(second.code !== ra.code);
  eq([rb.state.seats[0], rb.state.hostLeft, second.state.me], [null, true, 0], 'the first room shows the host as gone');
  eq(w.hub.admin.get('host/uidA'), second.code);
});

test('4 seats: lowest empty seat first, the lowest seated player starts', async () => {
  const w = world();
  const ps = [];
  for (const [uid, name] of [['uidA', 'Alpha'], ['uidB', 'Bravo'], ['uidC', 'Charlie'], ['uidD', 'Delta']]) ps.push(await w.player(uid, name));
  const rooms = [await w.settle(createRoom({ transport: ps[0].tp, profile: ps[0].profile, max: 4, clock: w.clock }))];
  for (const p of ps.slice(1)) rooms.push(await w.settle(joinRoom({ transport: p.tp, code: rooms[0].code, profile: p.profile, clock: w.clock })));
  await w.clock.advance(10);
  eq(rooms.map((r) => r.state.me), [0, 1, 2, 3]);
  eq(rooms[3].state.max, 4);
  rooms[0].close(); ps[0].tp.close();          // the host's tab closes: seat 1 is now the lowest
  await w.clock.advance(10);
  await w.settle(Promise.all(rooms.slice(1).map((r) => r.ready(true))));
  await w.clock.advance(100);
  const mid = rooms[1].state.mid;
  ok(mid, 'started without seat 0');
  eq(rooms.slice(1).map((r) => r.state.mid), [mid, mid, mid]);
  eq(w.hub.admin.get(`matches/${mid}/u`), { 1: 'uidB', 2: 'uidC', 3: 'uidD' });
  eq(w.denials.length, 0);
});

test('names from the network are censored on display', async () => {
  const w = world();
  const { ra, rb } = await pair(w);
  // a modified client writes a rude display name straight into its seat
  eq(rb.state.me, 1);
  w.hub.admin.set(`rooms/${ra.code}/p/1/n`, 'fuckface');
  await w.clock.advance(10);
  ok(/^Raider-\d{4}$/.test(ra.state.seats[1].n), ra.state.seats[1].n);
});

run('room');
