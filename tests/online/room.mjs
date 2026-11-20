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

test('the third player in a 2-seat room becomes a watcher; two racing for one seat cannot both get it', async () => {
  const w = world();
  const a = await w.player('uidA', 'Alpha');
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  const b = await w.player('uidB', 'Bravo');
  const c = await w.player('uidC', 'Charlie');
  const [rb, rc] = await w.settle(Promise.all([
    joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }),
    joinRoom({ transport: c.tp, code: ra.code, profile: c.profile, clock: w.clock }),
  ]));
  await w.clock.advance(10);
  const seated = [rb, rc].filter((r) => r.state.me === 1);
  const watching = [rb, rc].filter((r) => r.state.watching);
  eq([seated.length, watching.length], [1, 1]);
  eq(ra.state.spectators, 1);
  eq(ra.state.seats.filter(Boolean).length, 2);
  const d = await w.player('uidD', 'Delta');
  const rd = await w.settle(joinRoom({ transport: d.tp, code: ra.code, profile: d.profile, watch: true, clock: w.clock }));
  await w.clock.advance(10);
  eq([rd.state.me, rd.state.watching, ra.state.spectators], [null, true, 2]);
  await w.settle(rd.leave());
  await w.clock.advance(10);
  eq(ra.state.spectators, 1, 'a watcher who leaves is gone');
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
  const { ra, rb } = await pair(w);
  const seeds = [];
  ra.on('start', (s) => seeds.push(s));
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
  await w.clock.advance(50);
  await w.settle(ra.rematch());
  await w.clock.advance(50);
  eq([ra.state.st, rb.state.seats[0].rm, rb.state.seats[1].rm], ['live', true, false], 'one player asking is not enough');
  await w.settle(rb.rematch());
  await w.clock.advance(50);
  for (const r of [ra, rb]) {
    eq([r.state.st, r.state.rn, r.state.mid, r.state.seed], ['lobby', 1, null, null]);
    eq(r.state.seats.map((s) => [s.rdy, s.rm]), [[false, false], [false, false]], 'last round\'s ready and rematch are spent');
  }
  await w.clock.advance(3000);
  eq(ra.state.st, 'lobby', 'nothing starts until both are ready again');
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
  await w.clock.advance(50);
  eq(seeds.length, 2);
  ok(seeds[0].mid !== seeds[1].mid && seeds[0].seed !== seeds[1].seed, 'new road');
  eq([ra.state.st, rb.state.seed], ['live', seeds[1].seed]);
  // the quick way: both press REMATCH and go straight in
  await w.settle(Promise.all([ra.rematch({ ready: true }), rb.rematch({ ready: true })]));
  await w.clock.advance(100);
  eq(seeds.length, 3);
  eq([ra.state.st, ra.state.rn, rb.state.mid], ['live', 2, seeds[2].mid]);
  eq(w.denials.length, 0);
});

test('leaving frees the seat; the host leaving shows as host-left; an empty room is removed', async () => {
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
  eq([rc.state.hostLeft, rc.state.seats[0], rc.state.host], [true, null, 'uidA']);
  await w.settle(rc.leave());
  await w.clock.advance(10);
  ok(w.hub.admin.get(`rooms/${ra.code}/sl`) === null, 'no seats left');
  // a host alone in the room takes the room with them
  const solo = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  await w.settle(solo.leave());
  eq(w.hub.admin.get(`rooms/${solo.code}`), null);
});

test('a lobby seat is given up when the connection drops, a seat in a live match is kept', async () => {
  const w = world({ dropMs: 5000 });
  const a = await w.player('uidA', 'Alpha');
  const bRaw = await w.player('uidB', 'Bravo');
  const bNet = shape(bRaw.tp, { clock: w.clock });
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
  let rb = await w.settle(joinRoom({ transport: bNet, code: ra.code, profile: bRaw.profile, clock: w.clock }));
  await w.clock.advance(10);
  bNet.net.offline(true);
  await w.clock.advance(6000);
  eq(ra.state.seats[1], null, 'the lobby seat was let go');
  bNet.net.offline(false);
  await w.clock.advance(50);
  eq(rb.state.me, null, 'and I can see that I lost it');
  rb.close();
  rb = await w.settle(joinRoom({ transport: bNet, code: ra.code, profile: bRaw.profile, clock: w.clock }));
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
  await w.clock.advance(100);
  eq(ra.state.st, 'live');
  bNet.net.offline(true);
  await w.clock.advance(20000);
  eq(ra.state.seats[1]?.uid, 'uidB', 'still seated in the live match');
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
  await w.settle(rooms[0].leave());           // the host goes: seat 1 is now the lowest
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
