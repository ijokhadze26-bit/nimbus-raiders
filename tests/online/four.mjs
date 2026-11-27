// node tests/online/four.mjs — stage 5: friend rooms and matches of 3-4 players, and the links of the players who fell
// and of watchers ('final', 'feed', 'stale', snapshot()). The client code itself (room.js, match.js) over the hub with
// the REAL rules on a virtual clock (run.mjs also runs it with NET_ECHO=1).
import { test, ok, eq, run, world, arena, drive } from './kit.mjs';
import { createRoom, joinRoom } from '../../src/online/room.js';
import { createMatch } from '../../src/online/match.js';
import { NET } from '../../src/online/config.js';
import { verdictWords, rematchWords } from '../../src/online/ui/vswords.js';

const slots = (places) => (places || []).map((p) => p.slot);

/** A watcher of the room `code`: its room (watch: true) and, once the match is on, a listen-only link. */
async function watcher(w, code, uid = 'uidW') {
  const p = await w.player(uid, 'Watcher');
  const room = await w.settle(joinRoom({ transport: p.tp, code, profile: p.profile, watch: true, clock: w.clock }));
  await w.clock.advance(50);
  const link = createMatch({ transport: p.tp, room, timer: w.clock });
  const seen = drive(w, link);
  seen.feed = []; seen.stale = 0;
  link.on('feed', (e) => seen.feed.push(e));
  link.on('stale', () => { seen.stale++; });
  return { p, room, link, seen };
}

/** Records every write of `tp` (a fallen player must not close anybody's seat). */
function spy(tp) {
  const writes = [];
  const set = tp.set.bind(tp);
  tp.set = (path, v) => { writes.push(path); return set(path, v); };
  return writes;
}

test('a friend room takes 4: three friends sit, the 5th is told it is full and nothing is written for them', async () => {
  const w = world();
  const ps = [];
  for (const [uid, name] of [['uidA', 'Alpha'], ['uidB', 'Bravo'], ['uidC', 'Charlie'], ['uidD', 'Delta'], ['uidE', 'Echo']]) ps.push(await w.player(uid, name));
  const host = await w.settle(createRoom({ transport: ps[0].tp, profile: ps[0].profile, max: NET.friendMax, clock: w.clock }));
  const rooms = [host];
  for (const p of ps.slice(1, 4)) rooms.push(await w.settle(joinRoom({ transport: p.tp, code: host.code, profile: p.profile, clock: w.clock })));
  await w.clock.advance(20);
  eq([NET.friendMax, host.state.max], [4, 4]);
  eq(rooms.map((r) => r.state.me), [0, 1, 2, 3]);
  eq(host.state.seats.map((s) => s && s.n), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  let code = null;
  await w.settle(joinRoom({ transport: ps[4].tp, code: host.code, profile: ps[4].profile, clock: w.clock }).catch((e) => { code = `${e.code}:${e.max}`; }));
  eq(code, 'full:4', 'full, and how many seats (the notice words)');
  eq(w.hub.admin.get(`rooms/${host.code}/sp`), null, 'no sp marker for the 5th');
  eq(w.denials.length, 0);
});

test('4 players start together; falls at 10 / 20 / 30 s: places 4 / 3 / 2 / 1, the same table on every link and on a watcher', async () => {
  const w = world();
  const { games, code, to } = await arena(w, 4);
  const W = await watcher(w, code);
  eq([W.link.slot, W.link.slots], [null, [0, 1, 2, 3]]);
  eq(games.map((g) => g.link.slots.length), [4, 4, 4, 4]);
  const [a, b, c, d] = games;
  d.fallAt(10); c.fallAt(20); b.fallAt(30);
  await to(34);
  eq(games.map((g) => [g.verdict.result, g.verdict.place]), [['win', 1], ['lose', 2], ['lose', 3], ['lose', 4]]);
  for (const g of [...games, W.seen]) eq(slots(g.final), [0, 1, 2, 3], 'the final table');
  for (const g of [...games, W.link]) eq(slots(g.link ? g.link.final : g.final), [0, 1, 2, 3], 'link.final');
  eq(W.seen.final.slice(1).map((p) => p.T), [30, 20, 10]);
  eq([W.seen.verdict, W.link.stats.sent + W.link.stats.hb], [null, 0], 'a watcher gets no verdict and sends nothing');
  eq([W.seen.stale, games.some((g) => g.link.stale)], [0, false], 'no stale while everyone is heard');
  eq(w.denials.length, 0);
});

test('first place inside 1 s: the further one wins on every link; 3rd and 4th by time even 0.4 s apart', async () => {
  const w = world();
  const { games, code, to } = await arena(w, 4);
  const W = await watcher(w, code);
  const [a, b, c, d] = games;
  d.fallAt(10, 100);     // 4th: shorter, and later than nobody
  c.fallAt(10.4, 60);    // 3rd: 0.4 s later but shorter: time decides below first place
  b.fallAt(20, 150);
  a.fallAt(20.6, 120);   // 0.6 s after b but not as far: b wins
  await to(24);
  const want = [1, 0, 2, 3];
  for (const g of [...games, W.seen]) eq(slots(g.final), want, 'final');
  eq(games.map((g) => g.verdict.place), [2, 1, 3, 4]);
  eq([b.verdict.result, b.verdict.reason, a.verdict.result, a.verdict.reason], ['win', 'distance', 'lose', 'distance']);
  eq(w.denials.length, 0);
});

test('equal distance inside 1 s for first: a draw for both, the same on every link', async () => {
  const w = world();
  const { games, to } = await arena(w, 3);
  const [a, b, c] = games;
  c.fallAt(8, 80);
  a.fallAt(15, 150);
  b.fallAt(15.5, 150);
  await to(19);
  eq([a.verdict.result, a.verdict.place, b.verdict.result, b.verdict.place], ['draw', 1, 'draw', 1]);
  eq([c.verdict.result, c.verdict.place], ['lose', 3]);
  for (const g of games) eq(slots(g.final), [0, 1, 2]);
  eq(w.denials.length, 0);
});

test('one player leaves mid-match (a quit record), the other three play on', async () => {
  const w = world();
  const { games, to } = await arena(w, 4);
  const [a, b, c, d] = games;
  await to(8);
  d.stop(); d.link.leave();
  await to(10);
  for (const g of [a, b, c]) ok(g.outs.some((o) => o.slot === 3 && o.by === 'quit'), 'everyone sees the quit');
  eq([a.verdict, b.verdict, c.verdict], [null, null, null], 'the others play on');
  c.fallAt(16); b.fallAt(22);
  await to(26);
  eq([a.verdict.result, b.verdict.place, c.verdict.place], ['win', 2, 3]);
  eq(a.final.map((p) => [p.slot, p.by]), [[0, null], [1, 'dead'], [2, 'dead'], [3, 'quit']]);
  eq(w.denials.length, 0);
});

test('one goes silent: a standing player closes the seat after 13 s, the fallen ones only show it', async () => {
  const w = world();
  const { games, to, net, ps } = await arena(w, 4, { nets: [{}, {}, {}, {}] });
  const [a, b, c, d] = games;
  d.fallAt(6);
  await to(9);
  const dWrites = spy(ps[3].tp);
  await to(12);
  net(2).offline(true);   // Charlie's connection goes
  await to(20);
  ok(d.peer.some((p) => p.slot === 2 && p.silent >= 3 && p.countdown === null), 'the fallen player sees LOST CONNECTION (no countdown)');
  ok(a.peer.some((p) => p.slot === 2 && p.countdown > 0), 'a standing player sees the countdown');
  await to(30);
  const rec = w.hub.admin.get(`matches/${a.link.mid}/out/2`);
  eq(rec && rec.by, 'dc', 'a standing player wrote the dc');
  for (const g of [a, b, d]) ok(g.outs.some((o) => o.slot === 2 && o.by === 'dc'), 'everyone sees it');
  eq(dWrites.filter((p) => /\/out\//.test(p)), [], 'the fallen player never writes a seat closing');
  eq([a.verdict, b.verdict], [null, null], 'the two standing ones play on');
  b.fallAt(34);
  await to(38);
  eq([a.verdict.result, b.verdict.place, d.verdict.place], ['win', 2, 4]);
  eq(slots(d.final), [0, 1, 2, 3]);
  // two standing players close the same seat at once: the second write finds the record there (write-once) and is
  // refused; the link takes the server's record either way
  const other = w.denials.filter((x) => x.path !== `matches/${a.link.mid}/out/2`);
  eq(other.length, 0, JSON.stringify(other));
  ok(w.denials.length <= 1);
});

test('every runner goes silent: the fallen link and the watcher end on stale after 20 s', async () => {
  const w = world();
  const { games, code, to, net } = await arena(w, 3, { nets: [{}, {}, {}] });
  const W = await watcher(w, code);
  const [a, b, c] = games;
  let staleAt = null;
  c.link.on('stale', () => { staleAt = c.link.clock(); });
  c.fallAt(5);
  await to(10);
  ok(!c.link.stale, 'not while the others run');
  net(0).offline(true); net(1).offline(true);
  await to(29);
  ok(staleAt === null && !c.link.stale, 'not before 20 s of silence');
  await to(32);
  ok(c.link.stale && staleAt >= 29.9 && staleAt < 31, `stale on the fallen link (${staleAt})`);
  eq([W.seen.stale, W.link.stale], [1, true], 'and on the watcher');
  eq([c.link.final, W.link.final], [null, null], 'no final table: nothing more is known');
  await to(40);
  eq(W.seen.stale, 1, 'once');
  eq(w.denials.length, 0);
});

test('rematch with 4 only after OVER (an early one is refused and retried), then with 3 after one leaves', async () => {
  const w = world();
  const { games, rooms, to } = await arena(w, 4);
  const firstMid = rooms[0].state.mid;
  games[3].fallAt(5);
  await to(6);
  // everyone taps REMATCH while three still run: the room cannot turn yet
  await w.settle(Promise.all(rooms.map((r) => r.rematch({ ready: true }))));
  await to(9);
  eq([rooms[0].state.st, rooms[0].state.mid], ['live', firstMid], 'still the first match');
  games[2].fallAt(10); games[1].fallAt(12);
  await to(16);
  ok(rooms[0].state.mid && rooms[0].state.mid !== firstMid, 'the second match started with four');
  eq(rooms[0].state.players.length, 4);
  const denied = w.denials.filter((d) => !/\/st$|^rooms\/[A-Z]{4}$/.test(d.path || ''));
  eq(denied.length, 0, `only the early turn was refused: ${JSON.stringify(w.denials.slice(0, 3))}`);
  // round 2: Delta leaves, the other three ask for a rematch
  const second = rooms[0].state.mid;
  let t0 = rooms[0].state.t0;
  await w.clock.advance(t0 + 5000 - w.clock.now());
  games.forEach((g) => { g.stop(); });
  games[3].link.leave(); await w.settle(rooms[3].leave());
  for (const g of games.slice(0, 3)) g.link.leave();
  await w.settle(Promise.all(rooms.slice(0, 3).map((r) => r.rematch({ ready: true }))));
  await w.clock.advance(400);
  ok(rooms[0].state.mid && rooms[0].state.mid !== second, 'a third match');
  eq(rooms[0].state.players.map((p) => p.slot), [0, 1, 2], 'with the three who stayed');
  t0 = rooms[0].state.t0;
  await w.clock.advance(t0 + 4000 - w.clock.now());
  games[2].fallAt(5); games[1].fallAt(7);
  await w.clock.advance(5000);
  eq([games[0].verdict.result, games[1].verdict.place, games[2].verdict.place], ['win', 2, 3]);
});

test("feed: an event A sends to B reaches the fallen C and the watcher once each, also after C's reconnect", async () => {
  const w = world();
  const { games, code, to, net } = await arena(w, 3, { nets: [{}, {}, {}] });
  const W = await watcher(w, code);
  const [a, b, c] = games;
  c.feed = [];
  c.link.on('feed', (e) => c.feed.push(e));
  c.fallAt(5);
  await to(7);
  a.link.sendEvent({ k: 's', a: 2, to: 1 });
  await to(8);
  eq(b.events.map((e) => [e.k, e.a, e.f]), [['s', 2, 0]], 'B is hit');
  eq(c.events, [], 'C is not the target: no event');
  const one = (list) => list.filter((e) => e.k === 's' && e.a === 2 && e.f === 0 && e.to === 1);
  eq([one(c.feed).length, one(W.seen.feed).length], [1, 1], 'but both feeds have it, once');
  ok(typeof one(c.feed)[0].id === 'string' && one(c.feed)[0].id === one(W.seen.feed)[0].id, 'with its push key');
  net(2).offline(true);
  await to(9);
  net(2).offline(false);
  await to(12);
  eq(one(c.feed).length, 1, 'a reconnect replays nothing');
  // a listener added later is given the earlier events first
  const late = [];
  c.link.on('feed', (e) => late.push(e));
  eq(one(late).length, 1);
  eq(w.denials.length, 0);
});

test('snapshot() of a link made mid-match has everyone\'s latest state, the falls and the silences', async () => {
  const w = world();
  const { games, rooms, to } = await arena(w, 4);
  games[3].fallAt(6);
  await to(15);
  const W = await watcher(w, rooms[0].code);
  await w.clock.advance(100);
  const s = W.link.snapshot();
  near15(s.t);
  eq(Object.keys(s.states).sort(), ['0', '1', '2', '3']);
  for (const k of [0, 1, 2]) ok(s.states[k].t > 14 && s.states[k].t <= 15.2, `slot ${k} at ${s.states[k].t}`);
  eq(Object.keys(s.outs), ['3']);
  eq([s.outs[3].T, s.outs[3].by], [6, 'dead']);
  ok(Object.values(s.silent).every((x) => x >= 0 && x < 1), JSON.stringify(s.silent));
  // a fallen player's snapshot holds its own record too
  const d = games[3].link.snapshot();
  eq([d.outs[3].T, Object.keys(d.states).length], [6, 4]);
  eq(w.denials.length, 0);
});
const near15 = (t) => ok(t > 15 && t < 15.3, `clock ${t}`);

test('words of 3-4 players: a dropped player gets a place, a three-way draw, a rematch that cannot come; 2 players unchanged', () => {
  const dc4 = verdictWords({ result: 'lose', place: 2, reason: 'dc' }, { players: 3 });
  eq([dc4.head, dc4.text], ['YOU CAME 2ND OF 3', 'Your internet dropped for too long, so your squad is out.']);
  const dc2 = verdictWords({ result: 'lose', place: 2, reason: 'dc' }, { players: 2 });
  eq([dc2.head, dc2.text], ['CONNECTION LOST', 'Your internet dropped for too long, so the match went to your rival.']);
  ok(!/Both squads/.test(verdictWords({ result: 'draw', place: 1, reason: 'draw' }, { players: 4 }).text), 'a draw of 4 says nothing of "both"');
  eq(verdictWords({ result: 'draw', place: 1, reason: 'draw' }, { players: 2 }).text, 'Both squads fell at the same moment, at the same distance. Nobody wins!');
  const st = rematchWords({ can: false, stuck: 'left', others: [{ name: 'Ann', here: false }, { name: 'Ben', here: false }, { name: 'Dan', here: true }] });
  eq([st.off, st.waiting, st.note], [true, false, 'THE OTHERS LEFT · MAKE A NEW ROOM']);
  eq(rematchWords({ can: false, stuck: 'on', others: [] }).note, 'THE MATCH IS STILL ON');
});

run('four');
