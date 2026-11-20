// node tests/online/fixes.mjs — match scenarios that once went wrong (the review of stage 1), kept as tests.
// Same world as match.mjs: clients on the in-process hub, a virtual clock, a stand-in for the game.
import { test, ok, eq, run, world, drive, arena } from './kit.mjs';
import { createRoom, joinRoom } from '../../src/online/room.js';
import { createMatch } from '../../src/online/match.js';

/** Fall at an exact instant of the match clock (a real game falls between two samples, not on one). */
const fallAtClock = (w, g, t0, sec, d) => w.clock.after(t0 + Math.round(sec * 1000) - w.clock.now(), () => {
  if (!g.alive) return;
  g.alive = false;
  g.link.fall({ t: g.link.clock(), d, by: 'dead' });
});
const brief = (g) => (g.verdict ? `${g.verdict.result}/${g.verdict.reason}` : 'none');
const chips = (g) => g.peer.filter((p) => p.countdown !== null).length;

test('the edge of the 1 s tie window: both screens always read the same records', async () => {
  for (const [bFall, dA, dB, lat] of [[51.06, 700, 600, 0], [51.06, 600, 700, 0], [51.06, 700, 600, 60], [51.08, 700, 600, 150],
    [51.02, 600, 700, 60], [50.96, 700, 600, 20], [51.14, 700, 600, 60]]) {
    const w = world();
    const { games, to, t0, mid } = await arena(w, 2, { nets: lat ? [{ lat }, { lat }] : [] });
    const [a, b] = games;
    fallAtClock(w, a, t0, 50.0, dA);
    fallAtClock(w, b, t0, bFall, dB);
    await to(70);
    const rec = w.hub.admin.get(`matches/${mid}/out`);
    const pair = [a.verdict?.result, b.verdict?.result].sort().join('+');
    ok(pair === 'lose+win' || pair === 'draw+draw', `B fell at ${bFall} (lat ${lat}): A ${brief(a)}, B ${brief(b)}`);
    if (rec[1]) { // both fell: the screens must say what the two records say
      const T = (o) => Math.min(o.t, Math.floor((o.ts - t0) / 100));
      const aWins = T(rec[1]) > T(rec[0]) + 10 ? false : T(rec[0]) > T(rec[1]) + 10 ? true : rec[0].d > rec[1].d;
      eq([a.verdict.result, b.verdict.result], aWins ? ['win', 'lose'] : ['lose', 'win'], `B fell at ${bFall} (lat ${lat})`);
      eq(a.final, b.final, 'and the same table');
    }
  }
});

test('falling offline: the provisional lose is put right when the records say I won', async () => {
  const w = world();
  const { games, to, t0, net } = await arena(w, 2, { nets: [{}, {}] });
  const [a, b] = games;
  const seen = [];
  b.link.on('verdict', (v) => seen.push([v.result, v.reason, v.provisional, v.revised]));
  fallAtClock(w, a, t0, 50.0, 600);
  fallAtClock(w, b, t0, 52.0, 624); // B outlasts A by 2 s, but is offline from 49.5 to 60.5
  await to(49.5);
  net(1).offline(true);
  await to(60.4);
  eq(seen, [['lose', 'offline', true, false]], 'told after 8 s, marked provisional');
  eq(a.verdict, null, 'the rival is still waiting');
  net(1).offline(false);
  await to(70);
  eq(seen, [['lose', 'offline', true, false], ['win', 'standing', false, true]], 'one more verdict, the real one');
  eq([a.verdict.result, a.verdict.provisional], ['lose', false]);
  eq(a.final, b.final);
});

test('after my own fall I close nobody\'s seat: a rival who vanishes is taken to have outlasted me', async () => {
  const w = world();
  const { games, to, t0, ps, mid } = await arena(w, 2, { nets: [{}, {}] });
  const [a, b] = games;
  const seen = [];
  a.link.on('verdict', (v) => seen.push([v.result, v.reason, v.provisional, v.revised]));
  await to(29.95);
  ps[1].tp.net.offline(true); // B's connection dies for good, a moment before A falls
  fallAtClock(w, a, t0, 30.0, 360);
  const before = w.denials.length;
  await to(42);
  eq(seen, [], 'A waits out the countdown');
  await to(45);
  eq(seen, [['lose', 'fell', true, false]], 'then a provisional lose');
  eq(w.denials.length, before, 'without ever asking for a forfeit the rules would refuse');
  eq(Object.keys(w.hub.admin.get(`matches/${mid}/out`)), ['0'], 'only A\'s own fall is on record');
  ok(b.alive, 'B is still playing, offline');
});

test('no false "rival lost connection" chips: slow starts, and a rival who only heartbeats', async () => {
  for (const lat of [0, 400, 800]) {
    const w = world();
    const { games, to } = await arena(w, 2, { nets: [{ lat, jit: lat ? 100 : 0 }, { lat, jit: lat ? 100 : 0 }] });
    await to(6);
    eq([chips(games[0]), chips(games[1])], [0, 0], `latency ${lat}: no chip around GO`);
  }
  for (const lat of [0, 60, 150]) {
    const w = world();
    const { games, to } = await arena(w, 2, { nets: [{ lat }, { lat }] });
    const [a, b] = games;
    await to(20);
    b.stop(); // B's game freezes (a hidden tab): no more states, its link still heartbeats every 3 s
    await to(34);
    eq(chips(a), 0, `latency ${lat}: 14 s of heartbeats only`);
    ok(!a.verdict && !b.verdict);
  }
  // real silence still shows: chip, countdown, forfeit
  const w = world();
  const { games, to, net } = await arena(w, 2, { nets: [{}, {}] });
  await to(20);
  net(1).offline(true);
  await to(24);
  ok(chips(games[0]) >= 1, 'a chip 3 s into real silence');
  await to(36);
  eq([games[0].verdict?.result, games[0].verdict?.reason], ['win', 'dc']);
});

test('a device clock that jumps back does not silence the player', async () => {
  for (const step of [-5000, -15000]) {
    const w = world();
    const a = await w.player('uidA', 'Alpha');
    const b = await w.player('uidB', 'Bravo');
    let shift = 0;
    const tb = new Proxy(b.tp, { get: (t, k) => (k === 'now' ? () => t.now() + shift : t[k]) }); // B's idea of "now" can be stepped
    const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }));
    const rb = await w.settle(joinRoom({ transport: tb, code: ra.code, profile: b.profile, clock: w.clock }));
    const g = {};
    ra.on('start', () => { g.a = drive(w, createMatch({ transport: a.tp, room: ra, timer: w.clock })); });
    rb.on('start', () => { g.b = drive(w, createMatch({ transport: tb, room: rb, timer: w.clock })); });
    await w.settle(Promise.all([ra.ready(true), rb.ready(true)]));
    await w.clock.advance(4000 + 30000);
    shift = step;
    // B's game keeps stepping its own played clock, whatever the device clock now says
    g.b.stop();
    let bt = g.b.t;
    w.clock.every(100, () => { bt += 0.1; g.b.link.push({ t: bt, dist: 12 * bt, n: 40, form: 1, flags: 0, boss: 0, zone: 0, charge: 0, danger: 0, x: 0 }); });
    const sent = g.b.link.stats.sent, hb = g.b.link.stats.hb;
    await w.clock.advance(14500);
    ok(g.b.link.stats.sent - sent > 40 && g.b.link.stats.hb - hb >= 4, `${step} ms: B kept sending (${g.b.link.stats.sent - sent} states, ${g.b.link.stats.hb - hb} heartbeats)`);
    eq([chips(g.a), g.a.verdict, g.b.verdict], [0, null, null], `${step} ms: no chip, no forfeit`);
  }
});

test('a connection blip in the middle of a match: the seat drops and comes back, the match goes on', async () => {
  const w = world();
  const { games, rooms, to, net } = await arena(w, 2, { nets: [{}, {}] });
  await to(20);
  net(1).offline(true);
  await to(26.5); // 6.5 s: longer than the service takes to notice, shorter than the forfeit
  eq(rooms[0].state.seats[1], null, 'the seat is gone while B is away');
  net(1).offline(false);
  await to(40);
  eq([rooms[0].state.seats[1]?.uid, rooms[1].state.me], ['uidB', 1], 'and back again');
  ok(!games[0].verdict && !games[1].verdict, 'nobody was forfeited');
  ok(games[0].states.filter((x) => x.at > 30).length > 30, 'A sees B\'s squad moving again');
  eq(w.denials.length, 0, 'no write was refused');
  games[1].fall();
  await to(45);
  eq([games[0].verdict.result, games[1].verdict.result], ['win', 'lose']);
});

test('the link is built from the match record: someone seated but not in it only watches', async () => {
  const w = world();
  const { games, to, code } = await arena(w, 2);
  const c = await w.player('uidC', 'Charlie');
  w.hub.admin.update({ [`rooms/${code}/max`]: 4, [`rooms/${code}/sl/2`]: 'uidC', [`rooms/${code}/p/2`]: { n: 'Charlie' } }); // a seat that slipped in
  const rc = await w.settle(joinRoom({ transport: c.tp, code, profile: c.profile, clock: w.clock }));
  await w.clock.advance(200);
  eq([rc.state.me, rc.state.players.map((p) => p.uid)], [2, ['uidA', 'uidB']]);
  const lc = createMatch({ transport: c.tp, room: rc, timer: w.clock });
  eq([lc.slot, lc.slots, games[0].link.slots, games[0].link.peers.map((p) => p.slot)], [null, [0, 1], [0, 1], [1]]);
  let final = null;
  lc.on('final', (f) => { final = f.places; });
  games[0].fallAt(10);
  await to(14);
  eq([games[0].verdict.result, games[1].verdict.result], ['lose', 'win'], 'the two players settle it between them');
  eq(final.map((p) => p.slot), [1, 0], 'the third one saw the result');
});

run('fixes');
