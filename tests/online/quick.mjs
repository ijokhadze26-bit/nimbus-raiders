// node tests/online/quick.mjs — QUICK MATCH, the queue (src/online/quick.js) over the in-process hub with the real
// rules and a virtual clock: pairing, the bot at 10 s, claim races, compatibility, cancel at every step, the day meter.
import { test, ok, eq, near, run, world, NAMES } from './kit.mjs';
import { createQuick, QUICK, meterKey, countMatch, matchCfg } from '../../src/online/quick.js';
import { createRoom, joinRoom } from '../../src/online/room.js';
import { createMatch } from '../../src/online/match.js';
import { TS } from '../../src/online/transport.js';
import { NET } from '../../src/online/config.js';

const PICK = { he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' };
let seq = 0;

/** A clock that counts the callbacks of the timers made through it (tests: nothing may fire after cancel). */
function counting(clock) {
  const c = { fired: 0, armed: false };
  const wrap = (fn) => () => { if (c.armed) c.fired++; fn(); };
  return Object.assign(c, { now: () => clock.now(), after: (ms, fn) => clock.after(ms, wrap(fn)), every: (ms, fn) => clock.every(ms, wrap(fn)) });
}

/** A player searching like the flow does: READY as soon as it is paired. */
async function searcher(w, uid, name, { net, ready = true, profile } = {}) {
  const p = await w.player(uid, name, net);
  const clock = counting(w.clock);
  const n = ++seq;
  let r = n * 0x9e3779b9; // mulberry32: every player its own room codes
  const rand = () => { r = (r + 0x6d2b79f5) | 0; let t = Math.imul(r ^ (r >>> 15), 1 | r); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const s = { ...p, clock, events: [], room: null, bot: null, pairedAt: null, botAt: null, t0: null };
  s.q = createQuick({ transport: p.tp, profile: profile || p.profile, picks: PICK, cfg: p.session.cfg, clock, rand });
  s.q.on('change', (st) => s.events.push(st.phase));
  s.q.on('paired', (room) => { s.room = room; s.pairedAt = w.clock.now(); if (ready) room.ready(true); });
  s.q.on('bot', (b) => { s.bot = b.why; s.botAt = w.clock.now(); });
  s.tap = () => { s.t0 = w.clock.now(); s.q.start(); };
  return s;
}
const ticket = (w, uid) => w.hub.admin.get(`queue/${uid}`);
const roomsOf = (w, uid) => Object.entries(w.hub.admin.get('rooms') || {}).filter(([, r]) => r.h === uid || Object.values(r.sl || {}).includes(uid));
const anyRooms = (w) => Object.keys(w.hub.admin.get('rooms') || {}).length;
const claimDenials = (w, them) => w.denials.filter((d) => d.writes.some(([p]) => p === `queue/${them}/m`)).length;
const until = async (w, fn, ms = 15000, step = 50) => { for (let t = 0; t < ms && !fn(); t += step) await w.clock.advance(step); return fn(); };

test('two players pair within 2 s: one quick room, live, a match record with both, no ticket left', async () => {
  const w = world();
  const A = await searcher(w, 'uidA', 'Alpha');
  const B = await searcher(w, 'uidB', 'Bravo');
  A.tap(); await w.clock.advance(100); B.tap();
  const tapB = w.clock.now();
  await until(w, () => A.room && B.room && A.room.state.mid && B.room.state.mid, 4000, 25);
  ok(A.room && B.room && A.room.code === B.room.code, `not one room: ${A.room && A.room.code} / ${B.room && B.room.code}`);
  const rec = w.hub.admin.get(`matches/${A.room.state.mid}`);
  ok(A.room.state.st === 'live' && rec && rec.k === 'quick' && rec.u[0] && rec.u[1], 'no live quick match: ' + JSON.stringify(rec));
  eq(Object.values(rec.u).sort(), ['uidA', 'uidB'], 'the record lists both');
  ok(w.clock.now() - tapB <= 2000, `paired and live ${w.clock.now() - tapB} ms after the second tap`);
  const room = w.hub.admin.get(`rooms/${A.room.code}`);
  eq([room.k, room.q], ['quick', 'uidA'], 'room made by B for A');
  eq([ticket(w, 'uidA'), ticket(w, 'uidB')], [null, null], 'no ticket left');
  eq(w.denials.length, 0, 'no write was refused');
  eq([A.q.state.phase, A.q.state.why, B.q.state.phase, B.q.state.why], ['off', 'live', 'off', 'live'], 'both let the room go to the flow');
});

test('a lone player gets the bot at 10 s: no ticket, no room', async () => {
  const w = world();
  const A = await searcher(w, 'uidA', 'Alpha');
  A.tap();
  await until(w, () => A.bot, 12000, 50);
  eq(A.bot, 'alone');
  near((A.botAt - A.t0) / 1000, 10, 0.3, 'bot at');
  eq(ticket(w, 'uidA'), null, 'ticket gone');
  eq(anyRooms(w), 0, 'no room');
  eq(A.q.state.phase, 'bot');
  const o = A.q.open();
  eq([o.subs, o.timers, o.room, o.ticket], [0, 0, false, false], 'nothing held');
});

test('two claimers race for one ticket: one room has two seats, the loser was denied once and gets the bot at 10 s', async () => {
  const w = world();
  const A = await searcher(w, 'uidA', 'Alpha');
  const B = await searcher(w, 'uidB', 'Bravo');
  const C = await searcher(w, 'uidC', 'Charlie');
  A.tap(); await w.clock.advance(300);
  B.tap(); C.tap(); // the same tick: both see A as the oldest ticket and claim it at once
  await until(w, () => (B.room || C.room) && A.room, 4000, 25);
  const [win, lose] = B.room ? [B, C] : [C, B];
  ok(win.room && A.room && win.room.code === A.room.code, 'the winner and A share a room');
  await until(w, () => lose.bot, 12000, 50);
  eq(lose.bot, 'alone', 'the loser takes a bot');
  near((lose.botAt - lose.t0) / 1000, 10, 0.3, "the loser's bot at");
  eq(lose.q.stats.denied, 1, 'the loser saw exactly one denial');
  eq(claimDenials(w, 'uidA'), 1, 'one refused claim on A');
  eq(roomsOf(w, lose.uid).length, 0, 'the loser removed its room');
  const two = Object.values(w.hub.admin.get('rooms') || {}).filter((r) => Object.keys(r.sl || {}).length === 2);
  eq(two.length, 1, 'exactly one room with two seats');
  eq([ticket(w, 'uidA'), ticket(w, 'uidB'), ticket(w, 'uidC')], [null, null, null], 'no ticket left');
});

test("the bot marker racing a claim at A's 10 s mark: A joins the claim, or the claimer is denied and goes on", async () => {
  // (both on a slow network, so A's transaction and B's claim are on their way at the same moment)
  // a claim that lands between the transaction's read and its write: the transaction aborts, A joins that room
  {
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha', { net: { lat: 200 } });
    const B = await searcher(w, 'uidB', 'Bravo', { net: { lat: 300 } });
    A.tap(); await w.clock.advance(6600);
    B.tap();
    await until(w, () => A.bot || (A.room && A.room.state.mid), 9000, 25);
    eq([A.q.stats.marks, A.q.stats.aborted], [1, 1], "A's bot marker was not aborted by the claim");
    ok(!A.bot && A.room && B.room && A.room.code === B.room.code && A.room.state.mid, `A did not join the claim (bot ${A.bot})`);
    ok(A.pairedAt - A.t0 <= QUICK.botAtMs + QUICK.fillMs, `paired ${A.pairedAt - A.t0} ms after the tap`);
    eq([B.q.stats.denied, B.bot], [0, null]);
  }
  // the bot marker lands first: the claimer's write is refused, it removes its room and searches on alone
  {
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha', { net: { lat: 200 } });
    const B = await searcher(w, 'uidB', 'Bravo', { net: { lat: 300 } });
    A.tap(); await w.clock.advance(7400);
    B.tap();
    await until(w, () => A.bot && (B.q.stats.denied || B.room || B.bot), 9000, 25);
    eq([A.bot, A.q.stats.marks, A.q.stats.aborted], ['alone', 1, 0], 'A takes its bot');
    eq(B.q.stats.denied, 1, 'the claim was refused');
    await until(w, () => B.bot, 14000, 50);
    eq(B.bot, 'alone', 'B searches on and gets its own bot');
    near((B.botAt - B.t0) / 1000, 10, 0.8, "B's bot at");
    await w.clock.advance(1500);
    eq(anyRooms(w), 0, 'no room left');
    eq([ticket(w, 'uidA'), ticket(w, 'uidB')], [null, null]);
  }
});

test('compatibility: 0 vs 400 trophies pair only after 5 s; a 25 s old ticket is never claimed; an empty claim -> nofill', async () => {
  {
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha');
    const pb = await w.player('uidB', 'Bravo');
    w.hub.admin.set('users/uidB/tr', 400);
    const B = await searcher(w, 'uidB', 'Bravo', { profile: { ...pb.profile, tr: 400 } });
    A.tap(); await w.clock.advance(100); B.tap();
    await w.clock.advance(4800);
    ok(!A.room && !B.room, 'paired before 5 s across 400 trophies');
    await until(w, () => A.room && B.room, 2000, 25);
    ok(A.room && B.room && A.pairedAt - A.t0 >= 5000 && A.pairedAt - A.t0 <= 5800, `paired at ${A.pairedAt - A.t0} ms`);
  }
  {
    const w = world();
    const old = await w.client('uidO');
    w.hub.admin.set('users/uidO', { n: 'Old', tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0 });
    w.hub.admin.set('queue/uidO', { tr: 0, ts: w.clock.now() - 25000 });
    const A = await searcher(w, 'uidA', 'Alpha');
    A.tap();
    await until(w, () => A.bot, 12000, 50);
    eq([A.bot, A.q.stats.claims], ['alone', 0], 'a stale ticket was claimed');
    ok(!(w.hub.admin.get('queue/uidO') || {}).m, 'the stale ticket has an m');
    old.close();
  }
  {
    const w = world();
    const P = await w.player('uidP', 'Papa'); // a ticket whose owner never comes to the room
    await P.tp.set('queue/uidP', { tr: 0, ts: TS });
    await w.clock.advance(100);
    const B = await searcher(w, 'uidB', 'Bravo');
    B.tap();
    await until(w, () => B.bot, 8000, 50);
    eq(B.bot, 'nofill');
    ok(Math.abs(B.botAt - B.t0 - QUICK.fillMs) <= 600, `nofill bot at ${B.botAt - B.t0} ms`);
    eq(roomsOf(w, 'uidB').length, 0, "the claimer's room is gone");
    eq(ticket(w, 'uidB'), null);
  }
});

test('cancel at every step leaves no ticket, room, seat, listener or timer', async () => {
  const clean = async (w, s, what) => {
    s.clock.armed = false;
    await w.settle(s.q.cancel(), 3000);
    // (a join that was on its way when I cancelled lands, and room.js gives its seat back: that may take its own
    // NET.leaveMs on a slow network, after the join itself; after that, nothing of the search may ever run again)
    await w.clock.advance(NET.connectMs);
    s.clock.armed = true;
    eq(ticket(w, s.uid), null, `${what}: ticket`);
    eq(roomsOf(w, s.uid).length, 0, `${what}: rooms / seats`);
    const o = s.q.open();
    eq([o.subs, o.timers, o.room, o.ticket, s.q.state.phase], [0, 0, false, false, 'off'], `${what}: held`);
    await w.clock.advance(15000);
    eq(s.clock.fired, 0, `${what}: a timer fired after cancel`);
  };
  { // searching
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha');
    A.tap(); await w.clock.advance(2000);
    ok(ticket(w, 'uidA'), 'a ticket while searching');
    await clean(w, A, 'searching');
  }
  { // my claim landed, seat 1 still empty
    const w = world();
    const P = await w.player('uidP', 'Papa');
    await P.tp.set('queue/uidP', { tr: 0, ts: TS });
    await w.clock.advance(100);
    const B = await searcher(w, 'uidB', 'Bravo');
    B.tap();
    await until(w, () => B.q.state.phase === 'claim', 3000, 25);
    eq(B.q.state.phase, 'claim');
    await clean(w, B, 'after my claim');
  }
  { // the waiter: my m is there, my seat not yet (the claimer's room exists, I am slow to sit down)
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha', { net: { lat: 400 } });
    A.tap(); await w.clock.advance(1500);
    const B = await searcher(w, 'uidB', 'Bravo', { ready: false });
    B.tap();
    await until(w, () => A.q.state.phase === 'wait', 4000, 10);
    eq(A.q.state.phase, 'wait');
    await clean(w, A, 'the waiter');
    await w.settle(B.q.cancel(), 3000);
  }
  { // both seated, not live yet
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha', { ready: false });
    const B = await searcher(w, 'uidB', 'Bravo', { ready: false });
    A.tap(); await w.clock.advance(100); B.tap();
    await until(w, () => A.room && B.room, 3000, 25);
    eq([A.q.state.phase, B.q.state.phase], ['paired', 'paired']);
    await clean(w, A, 'paired (waiter side)');
    await clean(w, B, 'paired (claimer side)');
    eq(anyRooms(w), 0, 'the room is gone');
  }
  { // a bot was found, its match not started yet
    const w = world();
    const A = await searcher(w, 'uidA', 'Alpha');
    A.tap();
    await until(w, () => A.bot, 12000, 50);
    await clean(w, A, 'bot found');
  }
});

test('paired, then the rival leaves before the match: the room goes, the search goes on (a bot after 10 s)', async () => {
  const w = world();
  const A = await searcher(w, 'uidA', 'Alpha', { ready: false });
  const B = await searcher(w, 'uidB', 'Bravo', { ready: false });
  A.tap(); await w.clock.advance(100); B.tap();
  await until(w, () => A.room && B.room, 3000, 25);
  await w.settle(B.q.cancel(), 3000);
  await until(w, () => A.q.state.phase === 'search' && ticket(w, 'uidA'), 3000, 25);
  ok(A.q.state.phase === 'search' && ticket(w, 'uidA'), 'A is not back in line');
  eq(roomsOf(w, 'uidA').length, 0, "A left B's room");
  await until(w, () => A.bot, 12000, 50);
  eq(A.bot, 'alone');
  near((A.botAt - A.t0) / 1000, 10, 0.3, 'the counter kept running');
});

test('day meter: +1 per human match (friend and quick, lowest seat only), 0 for a bot; busy days', async () => {
  const w = world();
  const key = () => `meter/${meterKey(w.clock.now())}`;
  // a friend match: both links count, only the lowest seat writes
  const a = await w.player('uidA', NAMES[0]);
  const b = await w.player('uidB', NAMES[1]);
  const ra = await w.settle(createRoom({ transport: a.tp, profile: a.profile, clock: w.clock }), 8000);
  const rb = await w.settle(joinRoom({ transport: b.tp, code: ra.code, profile: b.profile, clock: w.clock }), 8000);
  const links = [];
  for (const [r, p] of [[ra, a], [rb, b]]) r.on('start', () => { const l = createMatch({ transport: p.tp, room: r, cfg: p.session.cfg, timer: w.clock }); links.push(l); countMatch(p.tp, l); });
  await w.settle(Promise.all([ra.ready(true), rb.ready(true)]), 8000);
  await until(w, () => links.length === 2 && w.hub.admin.get(key()) === 1, 3000, 25);
  eq(w.hub.admin.get(key()), 1, 'a friend match counts once');
  for (const l of links) l.leave();
  // a quick match counts too
  const C = await searcher(w, 'uidC', NAMES[2]);
  const D = await searcher(w, 'uidD', NAMES[3]);
  for (const s of [C, D]) s.q.on('paired', (room) => room.on('start', () => { const l = createMatch({ transport: s.tp, room, cfg: matchCfg(s.session.cfg, s.q.state.busy), timer: w.clock }); s.link = l; countMatch(s.tp, l); }));
  C.tap(); await w.clock.advance(100); D.tap();
  await until(w, () => C.link && D.link && w.hub.admin.get(key()) === 2, 4000, 25);
  eq(w.hub.admin.get(key()), 2, 'a quick match counts once');
  eq([C.link.flushMs, D.link.flushMs], [250, 250], 'a quiet day flushes as cfg says');
  // a bot match writes nothing at all
  const E = await searcher(w, 'uidE', 'Echo');
  E.tap(); await until(w, () => E.bot, 12000, 50);
  eq(w.hub.admin.get(key()), 2, 'a bot match is not counted');
  // a busy day: meter > dayCap -> the next quick match flushes at 500 ms
  const cap = C.session.cfg.dayCap;
  w.hub.admin.set(key(), cap + 1);
  const F = await searcher(w, 'uidF', 'Foxtrot');
  const G = await searcher(w, 'uidG', 'Golf');
  for (const s of [F, G]) s.q.on('paired', (room) => room.on('start', () => { s.link = createMatch({ transport: s.tp, room, cfg: matchCfg(s.session.cfg, s.q.state.busy), timer: w.clock }); }));
  F.tap(); await w.clock.advance(100); G.tap();
  await until(w, () => F.link && G.link, 4000, 25);
  eq([F.q.state.busy, F.link.flushMs, G.link.flushMs], [true, 500, 500], 'a busy day sends every 500 ms');
  // a very busy day: meter > 2 x dayCap -> bots only, no ticket
  w.hub.admin.set(key(), 2 * cap + 1);
  const H = await searcher(w, 'uidH', 'Hotel');
  H.tap();
  await w.clock.advance(500);
  eq(ticket(w, 'uidH'), null, 'a ticket was written on a bots-only day');
  await until(w, () => H.bot, 8000, 50);
  eq(H.bot, 'busy');
  const at = H.botAt - H.t0;
  ok(at >= QUICK.busyBotMs[0] && at <= QUICK.busyBotMs[1] + 100, `busy bot at ${at} ms`);
});

run('quick');
