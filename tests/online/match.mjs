// node tests/online/match.mjs — whole matches between clients on the in-process hub, virtual clock.
// A tiny stand-in for the game drives each link: one sample every 0.1 s after GO, a fall when told.
import { test, ok, eq, near, run, world, drive, arena } from './kit.mjs';
import { joinRoom } from '../../src/online/room.js';
import { createMatch } from '../../src/online/match.js';
import { decodeState } from '../../src/online/codec.js';

test('the link is what STAGE1.md says it is', async () => {
  const w = world();
  const { games, rooms, t0 } = await arena(w);
  const [a, b] = games.map((g) => g.link);
  eq([a.slot, b.slot, a.ranked], [0, 1, false]);
  eq(a.seed, rooms[0].state.seed);
  eq(a.seed, b.seed, 'same road for both');
  eq(a.peers, [{ slot: 1, name: 'Bravo', hero: '', weapon: '', heroSkin: '', weaponSkin: '', tr: 0, bot: false }]);
  eq(b.peers.map((p) => [p.slot, p.name]), [[0, 'Alpha']]);
  for (const f of ['clock', 'push', 'fall', 'sendEvent', 'on', 'leave', 'tick']) eq(typeof a[f], 'function', f);
  near(a.clock(), (w.clock.now() - t0) / 1000, 1e-9);
  ok(a.clock() < 0, 'still in the countdown');
  eq(typeof a.on('state', () => {}), 'function', 'on() returns off()');
  eq(a.flushMs, 250);
});

test('samples flow at the flush cadence and arrive intact', async () => {
  const w = world();
  const { games, to, code } = await arena(w);
  const [a, b] = games;
  await to(10);
  const fromA = b.states.filter((x) => x.slot === 0);
  ok(fromA.length >= 38 && fromA.length <= 41, `about 4 messages a second: ${fromA.length} in 10 s`);
  const xsTotal = fromA.reduce((n, x) => n + x.s.xs.length, 0);
  ok(xsTotal >= 96 && xsTotal <= 101, `every 0.1 s sample is in some message: ${xsTotal}`);
  ok(fromA.every((x) => x.s.xs.length >= 1 && x.s.xs.length <= 3 && Math.abs(x.s.step - 0.1) < 1e-9));
  ok(fromA.filter((x) => x.s.xs.length >= 2).length >= fromA.length - 1, '2 or 3 samples a message');
  const last = fromA[fromA.length - 1].s;
  near(last.t, a.t, 0.31, 'newest played time');
  near(last.dist, 12 * last.t, 0.26);
  eq([last.n, last.form, last.charge, last.danger], [40, 1, 7, 2]);
  near(last.x, Math.sin(last.t) * 3, 0.01);
  for (let i = 1; i < fromA.length; i++) eq(fromA[i].s.seq, (fromA[i - 1].s.seq + 1) % 1296, 'no message lost or repeated');
  eq(decodeState(w.hub.admin.get(`rooms/${code}/l/0`)).seq, last.seq);
  const hb = w.hub.admin.get(`rooms/${code}/hb`);
  ok(hb[0].a > 0 && hb[1].a > 0, 'both heartbeat');
  ok(a.link.stats.hb >= 4 && a.link.stats.hb <= 6, `a heartbeat every 3 s: ${a.link.stats.hb}`);
  eq(w.denials.length, 0, 'the rules accepted every write');
});

test('with 3-4 players messages go out every 500 ms', async () => {
  const w = world();
  const { games, to } = await arena(w, 3);
  eq(games[0].link.flushMs, 500);
  await to(10);
  const fromA = games[1].states.filter((x) => x.slot === 0);
  ok(fromA.length >= 19 && fromA.length <= 21, `${fromA.length} in 10 s`);
  ok(fromA.slice(1).every((x) => x.s.xs.length >= 4 && x.s.xs.length <= 6), '5 samples a message');
});

test('cfg can slow the cadence down live', async () => {
  const w = world();
  w.hub.admin.set('cfg', { flush2: 500 });
  const { games, to, ps } = await arena(w);
  eq(ps[0].session.cfg.flush2, 500);
  await to(10);
  const n = games[1].states.filter((x) => x.slot === 0).length;
  ok(n >= 19 && n <= 21, `${n} in 10 s`);
});

test('one falls: the other wins, both screens agree', async () => {
  const w = world();
  const { games, to, mid } = await arena(w);
  const [a, b] = games;
  b.fallAt(20);
  await to(19.9);
  eq([a.verdict, b.verdict], [null, null]);
  await to(23);
  eq([a.verdict.result, a.verdict.place, a.verdict.reason], ['win', 1, 'standing']);
  eq([b.verdict.result, b.verdict.place, b.verdict.reason], ['lose', 2, 'fell']);
  eq(a.verdict.places, [{ slot: 0, T: null, d: null, by: null }, { slot: 1, T: 20, d: 240, by: 'dead' }]);
  eq(b.verdict.places, a.verdict.places);
  eq(a.outs, [{ slot: 1, T: 20, d: 240, by: 'dead' }]);
  near(a.verdictAt, 21.1, 0.15, 'the winner is told once 1.1 s past the fall');
  ok(b.verdictAt - 20 <= 1.6, `the loser waits at most about 1.5 s: ${(b.verdictAt - 20).toFixed(2)}`);
  eq(w.hub.admin.get(`matches/${mid}/out/1/t`), 200);
  eq(w.hub.admin.get(`matches/${mid}/out/0`), null, 'the winner writes no fall');
  eq(a.verdict.void, false);
  eq(a.final, a.verdict.places);
  eq(w.denials.length, 0);
});

test('both fall within 1 s: the one who got further wins', async () => {
  const w = world();
  const { games, to } = await arena(w);
  const [a, b] = games;
  a.speed = 11;                 // A falls first but B, faster, is further
  a.fallAt(30);
  b.fallAt(30.6);
  await to(33);
  eq([a.verdict.result, a.verdict.reason], ['lose', 'distance']);
  eq([b.verdict.result, b.verdict.reason], ['win', 'distance']);
  eq(a.verdict.places, b.verdict.places);
  eq(a.verdict.places.map((p) => [p.slot, p.T]), [[1, 30.6], [0, 30]]);
  // and the other way round: the earlier faller is further
  const w2 = world();
  const m2 = await arena(w2);
  m2.games[1].speed = 11;
  m2.games[0].fallAt(30);
  m2.games[1].fallAt(30.6);
  await m2.to(33);
  eq([m2.games[0].verdict.result, m2.games[1].verdict.result], ['win', 'lose']);
  eq(m2.games[0].verdict.reason, 'distance');
});

test('same second, same distance: a draw on both screens', async () => {
  const w = world();
  const { games, to } = await arena(w);
  games[0].fallAt(30, 400);
  games[1].fallAt(30.5, 400);
  await to(33);
  eq(games.map((g) => [g.verdict.result, g.verdict.place, g.verdict.reason]), [['draw', 1, 'draw'], ['draw', 1, 'draw']]);
});

test('falls more than 1 s apart are decided by time even if the loser went further', async () => {
  const w = world();
  const { games, to } = await arena(w);
  games[0].fallAt(30, 500);
  games[1].fallAt(31.5, 100);
  await to(35);
  eq(games.map((g) => g.verdict.result), ['lose', 'win']);
  eq(games[1].verdict.reason, 'standing');
});

test('rematch: a new seed and a working new link', async () => {
  const w = world();
  const { games, rooms, to, ps } = await arena(w);
  const first = { seed: games[0].link.seed, mid: games[0].link.mid };
  games[1].fallAt(5);
  await to(8);
  eq(games[0].verdict.result, 'win');
  games.forEach((g) => { g.stop(); g.link.leave(); });
  const old = games.slice();
  await w.settle(Promise.all(rooms.map((r) => r.rematch({ ready: true }))));
  await w.clock.advance(200);
  ok(games[0] !== old[0] && games[1] !== old[1], 'new links were made at the new start');
  const [a, b] = games;
  ok(a.link.seed !== first.seed && a.link.mid !== first.mid, 'new road');
  eq(a.link.seed, b.link.seed);
  ok(a.link.clock() < 0, 'a fresh countdown');
  const t0 = a.link.t0;
  await w.clock.advance(t0 + 6000 - w.clock.now());
  ok(b.states.length > 15, 'states flow again');
  ok(b.states.every((x) => x.s.t <= 6.5), 'nothing left over from the first round leaked in');
  a.fallAt(7);
  await w.clock.advance(3000);
  eq([a.verdict.result, b.verdict.result], ['lose', 'win']);
  eq(ps.length, 2);
  eq(w.denials.length, 0);
});

test('silence: a 10 s countdown, then a win by disconnect; the one who dropped is told on return', async () => {
  const w = world();
  const { games, to, mid, net } = await arena(w, 2, { nets: [null, { lat: 20 }] });
  const [a, b] = games;
  await to(20);
  eq(a.peer.length, 0, 'no warning while messages flow');
  b.link.tick(); // a harmless extra tick, as the game does each frame
  net(1).offline(true);
  await to(22.5);
  eq(a.peer.length, 0, 'under 3 s of silence: nothing yet');
  await to(24);
  eq(a.peer[0].slot, 1);
  eq(a.peer[0].countdown, 10, 'the chip starts at WIN IN 10');
  ok(a.peer[0].silent >= 3 && a.peer[0].silent < 3.2);
  await to(34.5);
  eq(a.peer.map((p) => p.countdown), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  eq([a.verdict.result, a.verdict.reason], ['win', 'dc']);
  const rec = w.hub.admin.get(`matches/${mid}/out/1`);
  eq(rec.by, 'dc');
  near(rec.t, 200, 6, 'their last known played time');
  ok(b.status.includes('lost'), 'the dropped player saw RECONNECTING');
  eq(b.verdict, null, 'and kept playing meanwhile');
  net(1).offline(false);
  await w.clock.advance(1500);
  eq([b.verdict.result, b.verdict.reason], ['lose', 'dc']);
  eq(b.status[b.status.length - 1], 'on');
});

test('a forfeit the server refuses decides nothing (the rival came back just in time)', async () => {
  const w = world();
  // A hears everything 600 ms late, so its countdown can run out after B is in fact back
  const { games, mid, net, to } = await arena(w, 2, { nets: [{ lat: 600 }, { lat: 20 }] });
  const [a, b] = games;
  await to(20);
  net(1).offline(true);
  for (let i = 0; i < 400 && !(a.peer.length && a.peer[a.peer.length - 1].countdown === 1); i++) await w.clock.advance(50);
  eq(a.peer[a.peer.length - 1].countdown, 1);
  await w.clock.advance(600);
  net(1).offline(false);            // B's heartbeat reaches the server now; A will only hear of it in 600 ms
  await w.clock.advance(3000);
  ok(w.denials.some((d) => d.path === `matches/${mid}/out/1`), 'A did try the forfeit, and the rules refused it');
  eq(w.hub.admin.get(`matches/${mid}/out`), null);
  eq([a.verdict, b.verdict], [null, null], 'nobody was told a result');
  eq(a.outs, [], 'and the game was not told the rival fell');
  eq(a.peer[a.peer.length - 1].countdown, null, 'the chip went away');
  b.fallAt(b.t + 2);
  await w.clock.advance(8000);
  eq([a.verdict.result, a.verdict.reason, b.verdict.result], ['win', 'standing', 'lose'], 'the match then ends the normal way');
});

test('a frozen game (hidden tab) still heartbeats, and is forfeited once its played clock is 15 s behind', async () => {
  const w = world();
  const { games, to, mid } = await arena(w);
  const [a, b] = games;
  await to(20);
  b.alive = false;                 // the page stops stepping the game; its link keeps ticking
  await to(30);
  eq(a.verdict, null, '10 s behind is not enough');
  eq(a.peer.filter((p) => p.countdown === 0).length, 0, 'heartbeats still arrive, so this is not the silence path');
  await to(39);
  eq([a.verdict.result, a.verdict.reason], ['win', 'dc']);
  near(w.hub.admin.get(`matches/${mid}/out/1/t`), 200, 2, 'ranked at the time their game stopped');
  eq(b.verdict.reason, 'dc', 'the frozen player is told why they lost');
});

test('falling while offline: a provisional lose after 8 s, and the rival still gets the win', async () => {
  const w = world();
  const { games, to, mid, net } = await arena(w, 2, { nets: [{ lat: 20 }, null] });
  const [a, b] = games;
  await to(10);
  net(0).offline(true);
  a.fallAt(12);
  await to(19.5);
  eq(a.verdict, null, 'still hoping the connection returns');
  await to(21);
  eq([a.verdict.result, a.verdict.reason], ['lose', 'offline']);
  await to(25);
  eq([b.verdict.result, b.verdict.reason], ['win', 'dc']);
  net(0).offline(false);
  await w.clock.advance(2000);
  eq(w.hub.admin.get(`matches/${mid}/out/0/by`), 'dc', 'the write-once record stays the forfeit; my late fall is refused');
});

test('quitOut: the fall for a match I left by reloading, written on my next visit', async () => {
  const w = world();
  const { games, to, mid, ps, t0 } = await arena(w, 2, { noLink: [1] });
  await to(6);
  const { quitOut } = await import('../../src/online/match.js');
  eq(await w.settle(quitOut(ps[1].tp, { mid, slot: 1, t: 5.2, d: 60, ts0: t0 - 4000 })), true);
  eq(w.hub.admin.get(`matches/${mid}/out/1`).by, 'quit');
  eq(w.hub.admin.get(`matches/${mid}/out/1/t`), 52);
  eq(await w.settle(quitOut(ps[1].tp, { mid, slot: 0, t: 1, d: 1, ts0: t0 - 4000 })), false, 'never for somebody else');
  await to(8);
  eq([games[0].verdict.result, games[0].verdict.reason], ['win', 'quit']);
});

test('silence that ends in time cancels the countdown', async () => {
  const w = world();
  const { games, to, mid, net } = await arena(w, 2, { nets: [null, { lat: 20 }] });
  const [a] = games;
  await to(20);
  net(1).offline(true);
  await to(27);
  ok(a.peer.length >= 3 && a.peer[a.peer.length - 1].countdown > 0);
  net(1).offline(false);
  await to(28);
  eq(a.peer[a.peer.length - 1], { slot: 1, silent: 0, countdown: null }, 'cancelled');
  await to(45);
  eq(a.verdict, null);
  eq(w.hub.admin.get(`matches/${mid}/out`), null);
  ok(games[1].states.length > 100, 'and the match goes on');
});

test('a rival who never shows up is forfeited 9 s after GO', async () => {
  const w = world();
  const { games, to, mid } = await arena(w, 2, { noLink: [1] });
  const [a] = games;
  await to(8.9);
  eq(a.verdict, null);
  await to(10.5);
  eq([a.verdict.result, a.verdict.reason], ['win', 'dc']);
  eq(w.hub.admin.get(`matches/${mid}/out/1/t`), 0);
});

test('leaving mid-match is a quit: the rival wins', async () => {
  const w = world();
  const { games, to, mid } = await arena(w);
  const [a, b] = games;
  await to(12);
  b.alive = false;
  b.link.leave();
  b.link.leave(); // idempotent
  await to(14.5);
  eq([a.verdict.result, a.verdict.reason], ['win', 'quit']);
  eq(w.hub.admin.get(`matches/${mid}/out/1/by`), 'quit');
  near(w.hub.admin.get(`matches/${mid}/out/1/t`), 120, 2);
});

test('quitting during the countdown still gets recorded (the rules want a little real time first)', async () => {
  const w = world();
  const { games, mid } = await arena(w);
  const [a, b] = games;
  ok(b.link.clock() < -3, 'right at the start of the countdown');
  b.alive = false;
  b.link.leave();
  await w.clock.advance(1000);
  eq(w.hub.admin.get(`matches/${mid}/out/1`), null, 'too early for the rules');
  await w.clock.advance(6000);
  eq(w.hub.admin.get(`matches/${mid}/out/1/by`), 'quit');
  eq([a.verdict.result, a.verdict.reason], ['win', 'quit']);
});

test('400 ms latency and 5% loss: slower messages, same result on both screens', async () => {
  const w = world();
  const net = { lat: 400, jit: 100, loss: 5 };
  const { games, to } = await arena(w, 2, { nets: [net, net] });
  const [a, b] = games;
  a.fallAt(40);
  await to(46);
  eq([a.verdict.result, b.verdict.result], ['lose', 'win']);
  eq(a.verdict.places.map((p) => [p.slot, p.T, p.by]), [[1, null, null], [0, 40, 'dead']]);
  eq(b.verdict.places, a.verdict.places);
  ok(b.verdictAt - 40 < 4, `the winner knew ${(b.verdictAt - 40).toFixed(1)} s after the fall`);
  ok(a.verdictAt - 40 < 4, `the loser knew ${(a.verdictAt - 40).toFixed(1)} s after the fall`);
  const fromA = b.states.filter((x) => x.slot === 0);
  ok(fromA.length >= 15 && fromA.length < 80, `backpressure paces the sender to the round trip: ${fromA.length} messages in 40 s`);
  if (process.env.NET_VERBOSE) console.log(`     lat400 jit100 loss5: ${fromA.length} messages in 40 s, ${fromA.reduce((n, x) => n + x.s.xs.length, 0)} of 400 lane samples, oldest message ${Math.max(...fromA.map((x) => x.at - x.s.t)).toFixed(2)} s, typical ${fromA.map((x) => x.at - x.s.t).sort((p, q) => p - q)[fromA.length >> 1].toFixed(2)} s, verdicts ${(b.verdictAt - 40).toFixed(2)} s (winner) / ${(a.verdictAt - 40).toFixed(2)} s (loser) after the fall, thinned ${a.link.stats.thinned}x`);
  const xs = fromA.reduce((n, x) => n + x.s.xs.length, 0);
  ok(xs >= 240, `most 0.1 s lane samples still arrived (the rest were thinned while a write was stuck): ${xs} of 400`);
  const ages = fromA.map((x) => x.at - x.s.t);
  ok(Math.max(...ages) < 4, `no message older than ${Math.max(...ages).toFixed(1)} s when it arrived`);
  eq([a.verdict.void, b.verdict.void], [false, false], 'nothing looked implausible');
  eq(a.peer.filter((p) => p.countdown === 0).length, 0, 'no false disconnect');
});

test('both fall inside 1 s on a slow, lossy network: still the same answer on both screens', async () => {
  const w = world();
  const net = { lat: 400, jit: 150, loss: 5 };
  const { games, to } = await arena(w, 2, { nets: [net, net] });
  games[0].speed = 11;
  games[0].fallAt(25);
  games[1].fallAt(25.7);
  await to(40);
  eq([games[0].verdict.result, games[1].verdict.result], ['lose', 'win']);
  eq(games[0].verdict.reason, 'distance');
  eq(games[0].verdict.places, games[1].verdict.places);
});

test('offline: samples pile up to 20, are then halved, and one catch-up message follows', async () => {
  const w = world();
  const { games, to, net, ps } = await arena(w, 2, { nets: [{ lat: 10 }, null] });
  const [a, b] = games;
  await to(10);
  const before = b.states.length;
  const sentBefore = a.link.stats.sent;
  net(0).offline(true);
  await to(17);
  eq(a.link.stats.sent, sentBefore, 'nothing is sent while offline');
  ok(a.link.stats.thinned >= 2, `the backlog was halved ${a.link.stats.thinned} times in 7 s`);
  eq(b.states.length, before);
  net(0).offline(false);
  await to(17.6);
  const caught = b.states[before].s;
  ok(caught.xs.length <= 20, `${caught.xs.length} samples`);
  ok(caught.step >= 0.4 - 1e-9, `spaced ${caught.step} s apart instead of 0.1`);
  near(caught.t, 17, 0.4, 'and it carries the newest position, not a 7 s old one');
  near(caught.xs.length * caught.step, 7, 1.7, 'covering the whole gap');
  await to(20);
  const tail = b.states[b.states.length - 1].s;
  near(tail.step, 0.1, 1e-9, 'back to full detail afterwards');
  eq(ps[0].tp.pending(), 0);
  eq(a.verdict, null);
  eq(b.peer.filter((p) => p.countdown === 0).length, 0, '7 s of silence is inside the countdown');
});

test('events reach the rival they are meant for, once', async () => {
  const w = world();
  const { games, to } = await arena(w, 3);
  const [a, b, c] = games;
  await to(3);
  a.link.sendEvent({ k: 's', a: 2, to: 1 });
  a.link.sendEvent({ k: 'e', a: 3, to: -1 });
  await to(4);
  eq(b.events, [{ k: 's', a: 2, to: 1, f: 0, q: 1 }, { k: 'e', a: 3, to: -1, f: 0, q: 2 }]);
  eq(c.events, [{ k: 'e', a: 3, to: -1, f: 0, q: 2 }]);
  eq(a.events, [], 'never echoed to the sender');
  eq(w.denials.length, 0);
});

test('4 players: places by time, fallen players keep listening, the last one standing wins', async () => {
  const w = world();
  const { games, to } = await arena(w, 4);
  const [a, b, c, d] = games;
  d.fallAt(10);
  b.fallAt(20);
  a.fallAt(30);
  await to(12);
  eq([d.verdict.result, d.verdict.place], ['lose', 4]);
  eq([a.verdict, b.verdict, c.verdict], [null, null, null]);
  const sentAtFall = d.link.stats.sent;
  await to(22);
  eq([b.verdict.result, b.verdict.place], ['lose', 3]);
  await to(33);
  eq([a.verdict.result, a.verdict.place], ['lose', 2]);
  eq([c.verdict.result, c.verdict.place, c.verdict.reason], ['win', 1, 'standing']);
  eq(c.verdict.places.map((p) => p.slot), [2, 0, 1, 3]);
  eq(d.link.stats.sent, sentAtFall, 'a fallen player stops sending');
  ok(d.states.some((x) => x.slot === 2 && x.s.t > 25), 'but keeps hearing the others');
  for (const g of games) eq(g.final.map((p) => p.slot), [2, 0, 1, 3], 'everyone ends with the same table');
  eq(w.denials.length, 0);
});

test('a watcher gets states, falls and the final table, and sends nothing', async () => {
  const w = world();
  const { games, rooms, to } = await arena(w);
  const e = await w.player('uidE', 'Echo');
  const re = await w.settle(joinRoom({ transport: e.tp, code: rooms[0].code, profile: e.profile, clock: w.clock }));
  await w.clock.advance(50);
  eq([re.state.me, re.state.watching, re.state.mid], [null, true, rooms[0].state.mid]);
  const link = createMatch({ transport: e.tp, room: re, timer: w.clock });
  const seen = drive(w, link);
  eq([link.slot, link.peers.length], [null, 2]);
  games[0].fallAt(6);
  await to(9);
  ok(seen.states.filter((x) => x.slot === 0).length > 10 && seen.states.filter((x) => x.slot === 1).length > 10);
  eq(seen.outs.map((o) => [o.slot, o.T]), [[0, 6]]);
  eq(seen.final.map((p) => p.slot), [1, 0]);
  eq(seen.verdict, null);
  eq(link.stats.sent + link.stats.hb, 0);
  eq(w.denials.length, 0);
});

run('match');
