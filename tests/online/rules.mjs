// node tests/online/rules.mjs — the security rules, through the local hub.
// First the shared table (tests/online/vectors.mjs: the same one the live probe runs), then the cases
// that need console access (bans, old records, seeded trophies), which only the hub can stage.
import { test, ok, eq, run, world } from './kit.mjs';
import { runVectors, printVectors } from './vectors.mjs';
import { TS, isDenied } from '../../src/online/transport.js';

const base = (n, over = {}) => ({ n, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0, ...over });
const can = async (p) => { try { await p; return true; } catch (e) { if (isDenied(e)) return false; throw e; } };
const HOUR = 3600000;

async function trio(w) {
  return { A: await w.client('uidA'), B: await w.client('uidB'), C: await w.client('uidC') };
}

test('the shared table: every allowed write is allowed, every attack is denied', async () => {
  const w = world();
  const { A, B, C } = await trio(w);
  let seed = 4242;
  const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const results = await runVectors({ A, B, C, wait: (ms) => w.clock.advance(ms), rand });
  const bad = printVectors(results.filter((r) => !r.ok));
  const allowed = results.filter((r) => r.expect === 'allow').length;
  console.log(`     ${results.length} vectors: ${allowed} must be allowed, ${results.length - allowed} must be denied`);
  eq(bad, 0, 'vectors that did not behave as expected');
  ok(results.length > 150, 'the table is all there');
});

test('signed-out clients can read the config and nothing else', async () => {
  const w = world();
  w.hub.admin.set('cfg', { on: true });
  w.hub.admin.set('users/x', base('Somebody'));
  const anon = await w.client(null);
  // the local adapter invents a uid when none is given, so talk to the hub directly as nobody
  const port = w.hub.connect();
  const replies = [];
  port.onmessage = (m) => replies.push(m);
  port.post({ id: 1, op: 'get', path: 'cfg' });
  port.post({ id: 2, op: 'get', path: 'users/x' });
  port.post({ id: 3, op: 'write', w: [['users/x/tr', 5]] });
  port.post({ id: 4, op: 'get', path: 'rooms/ABCD' });
  await w.clock.advance(1);
  eq(replies.map((r) => r.ok), [true, false, false, false]);
  ok(anon.uid, 'a named client still works');
});

test('a banned player cannot make a profile, a room or a ticket', async () => {
  const w = world();
  const { A, B } = await trio(w);
  await A.set('users/uidA', base('Fine'));
  w.hub.admin.set('ban/uidA', true);
  w.hub.admin.set('ban/uidB', true);
  ok(!(await can(B.set('users/uidB', base('Banned')))), 'new profile');
  ok(!(await can(A.set('users/uidA/n', 'Renamed'))), 'rename');
  ok(!(await can(A.set('rooms/ABCD', { h: 'uidA', k: 'friend', max: 2, ts: TS, st: 'lobby', rn: 0, sl: { 0: 'uidA' } }))), 'room');
  ok(!(await can(A.set('queue/uidA', { tr: 0, ts: TS }))), 'ticket');
  eq(await A.get('ban/uidA'), true, 'they can see their own flag');
});

test('a room untouched for 2 hours can be cleared and its code reused, a fresh one cannot; nobody takes one over', async () => {
  const w = world();
  const { A, B, C } = await trio(w);
  const room = (h) => ({ h, k: 'friend', max: 2, ts: TS, st: 'lobby', rn: 0, sl: { 0: h }, p: { 0: { n: 'x' } } });
  await A.set('host/uidA', 'ABCD');
  await B.set('host/uidB', 'ABCD');
  ok(await can(A.set('rooms/ABCD', room('uidA'))));
  ok(await can(C.set('rooms/ABCD/sl/1', 'uidC')));
  await w.clock.advance(2 * HOUR - 1000);
  ok(!(await can(B.remove('rooms/ABCD'))), 'still fresh');
  await w.clock.advance(2000);
  ok(!(await can(B.set('rooms/ABCD', room('uidB')))), 'stale, but a room is never overwritten');
  ok(!(await can(B.set('rooms/ABCD/h', 'uidB'))), 'nor taken over with one child write that keeps the seats');
  ok(!(await can(B.set('rooms/ABCD/l/1', 'zzz'))), "an outsider cannot write a seated player's state");
  ok(!(await can(B.remove('rooms/ABCD/sl/1'))), 'or empty a seat');
  ok(await can(B.remove('rooms/ABCD')), 'stale: anyone may clear it away as a whole');
  ok(await can(B.set('rooms/ABCD', room('uidB'))), 'and then make a fresh room on the code');
  eq(await A.get('rooms/ABCD'), { h: 'uidB', k: 'friend', max: 2, ts: w.clock.now(), st: 'lobby', rn: 0, sl: { 0: 'uidB' }, p: { 0: { n: 'x' } } }, 'nothing of the old room is left');
  await w.clock.advance(2 * HOUR + 1000);
  ok(await can(B.remove('rooms/ABCD')), 'a host can delete its own room when it is stale too');
});

test('a match record can be removed after 7 days, not before', async () => {
  const w = world();
  const { A } = await trio(w);
  w.hub.admin.set('rooms/ABCD', { h: 'uidA', k: 'friend', max: 2, ts: w.clock.now(), st: 'live', mid: 'm1', mts: w.clock.now(), rn: 0, sl: { 0: 'uidA' } });
  w.hub.admin.set('matches/m1', { code: 'ABCD', k: 'friend', ts: w.clock.now(), u: { 0: 'uidA' }, us: { uidA: 0 } });
  await w.clock.advance(7 * 24 * HOUR - 5000);
  ok(!(await can(A.remove('matches/m1'))));
  await w.clock.advance(10000);
  ok(await can(A.remove('matches/m1')));
});

test('a stale queue ticket can be swept by anyone after a minute', async () => {
  const w = world();
  const { A, B } = await trio(w);
  await A.set('users/uidA', base('Ticket'));
  await A.set('queue/uidA', { tr: 0, ts: TS });
  ok(!(await can(B.remove('queue/uidA'))), 'too soon');
  await w.clock.advance(61000);
  ok(await can(B.remove('queue/uidA')));
});

// A quick match between A (seat 0) and B (seat 1) staged through the console, 30 s old, both staked.
async function stakedMatch(w, { trA = 500, trB = 500 } = {}) {
  const { A, B, C } = await trio(w);
  const now = w.clock.now();
  const sk = (ms, o) => ({ a: now, s: 20, st: 3, b: false, m: 'm1', ms, os: 1 - ms, o });
  w.hub.admin.update({
    'rooms/QQQQ': { h: 'uidA', k: 'quick', max: 2, ts: now, st: 'live', mid: 'm1', mts: now, rn: 0, sl: { 0: 'uidA', 1: 'uidB' } },
    'matches/m1': { code: 'QQQQ', k: 'quick', ts: now, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 }, tr: { 0: trA, 1: trB } },
    'users/uidA': base('Alpha', { tr: trA - 20, pk: trA, l: 1, w: 4, bs: 5, bt: 600, sk: sk(0, trB) }),
    'users/uidB': base('Bravo', { tr: trB - 20, pk: trB, l: 1, sk: sk(1, trA) }),
  });
  await w.clock.advance(30000);
  const x = w.clock.now() - 345600000;
  const wk = (x - (x % 604800000)) / 6048;
  const day = Math.floor(w.clock.now() / 86400000);
  const winA = (gain, over = {}) => base('Alpha', { tr: trA + gain, pk: Math.max(trA, trA + gain), w: 5, l: 0, st: 4, bs: 5, bt: 600, ws: wk + gain, cd: day, cc: 1, ...over });
  const out = (slot, t, d, by = 'dead') => w.hub.admin.set(`matches/m1/out/${slot}`, { t, d, ts: w.clock.now(), by });
  return { A, B, C, winA, out, wk, day, trA, trB };
}

test('human win: the gain follows the trophy gap and is capped', async () => {
  const w = world();
  const m = await stakedMatch(w, { trA: 500, trB: 500 });
  m.out(1, 200, 300);
  ok(!(await can(m.A.set('users/uidA', m.winA(30)))), '30 is over 28 + gap / 25 (+1 for rounding)');
  ok(!(await can(m.A.set('users/uidA', m.winA(28, { st: 9, bs: 9 })))), 'the streak is the one saved in the stake, plus one');
  ok(!(await can(m.A.set('users/uidA', m.winA(28, { ws: 5 })))), 'the weekly number must be this week plus the gain');
  ok(await can(m.A.set('users/uidA', m.winA(28))), 'the table value');
  eq((await m.B.get('users/uidA')).sk ?? null, null, 'the stake is gone');
});

test('human win: beating a much stronger rival pays up to 40, a much weaker one 2', async () => {
  let w = world();
  let m = await stakedMatch(w, { trA: 300, trB: 1500 });
  m.out(1, 200, 300);
  ok(!(await can(m.A.set('users/uidA', m.winA(41)))));
  ok(await can(m.A.set('users/uidA', m.winA(40))));
  w = world();
  m = await stakedMatch(w, { trA: 1500, trB: 300 });
  m.out(1, 200, 300);
  ok(!(await can(m.A.set('users/uidA', m.winA(3)))));
  ok(await can(m.A.set('users/uidA', m.winA(2))));
});

test('human win: not when the rival outlasted me, yes when I went further inside the tie window', async () => {
  let w = world();
  let m = await stakedMatch(w);
  m.out(0, 150, 300); m.out(1, 200, 400);
  ok(!(await can(m.A.set('users/uidA', m.winA(28)))), 'I fell 5 s earlier');
  w = world();
  m = await stakedMatch(w);
  m.out(0, 195, 400); m.out(1, 200, 300);
  ok(await can(m.A.set('users/uidA', m.winA(28))), '0.5 s earlier but further');
  w = world();
  m = await stakedMatch(w);
  m.out(0, 195, 300); m.out(1, 200, 300);
  ok(!(await can(m.A.set('users/uidA', m.winA(28)))), 'same distance is a draw, not a win');
  const draw = base('Alpha', { tr: 500, pk: 500, w: 4, l: 0, st: 3, bs: 5, bt: 600 });
  ok(!(await can(m.A.set('users/uidA', { ...draw, tr: 520 }))), 'a draw returns the stake and nothing more');
  ok(await can(m.A.set('users/uidA', draw)), 'draw: the stake comes back');
  ok(await can(m.B.set('users/uidB', base('Bravo', { tr: 500, pk: 500, l: 0, st: 3 }))), 'for both players');
});

test('survival record: only as far as the records show', async () => {
  const w = world();
  const m = await stakedMatch(w);
  m.out(0, 250, 500); m.out(1, 200, 300);
  ok(!(await can(m.A.set('users/uidA', m.winA(28, { bt: 900 })))), 'I fell at 25.0 s, not 90 s');
  ok(await can(m.A.set('users/uidA', m.winA(28, { bt: 250 }))) === false, 'and 25.0 s is below my old best of 60 s, so no change is allowed downwards');
  ok(await can(m.A.set('users/uidA', m.winA(28))), 'unchanged best is fine');
  // the loser may record their own time when closing
  ok(!(await can(m.B.set('users/uidB', base('Bravo', { tr: 480, pk: 500, l: 1, bt: 300 })))), 'more than they survived');
  ok(await can(m.B.set('users/uidB', base('Bravo', { tr: 480, pk: 500, l: 1, bt: 200 }))), 'their own fall time');
});

test('40 win claims a day', async () => {
  const w = world();
  const m = await stakedMatch(w);
  m.out(1, 200, 300);
  w.hub.admin.update({ 'users/uidA/cd': m.day, 'users/uidA/cc': 40 });
  ok(!(await can(m.A.set('users/uidA', m.winA(28, { cc: 41 })))), 'the 41st today');
  w.hub.admin.update({ 'users/uidA/cd': m.day - 1 });
  ok(await can(m.A.set('users/uidA', m.winA(28, { cc: 1 }))), 'yesterday does not count');
});

test('forfeits: a stalled played clock and the 344 s cap', async () => {
  const w = world();
  const { A, B, C } = await trio(w);
  const now = w.clock.now();
  w.hub.admin.update({
    'rooms/FFFF': { h: 'uidA', k: 'friend', max: 2, ts: now, st: 'live', mid: 'm2', mts: now, rn: 0, sl: { 0: 'uidA', 1: 'uidB' } },
    'matches/m2': { code: 'FFFF', k: 'friend', ts: now, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 } },
  });
  const beat = (t) => B.set('rooms/FFFF/hb/1', { a: TS, t });
  const dc = (who, t = 0) => who.set('matches/m2/out/1', { t, d: 0, ts: TS, by: 'dc' });
  await w.clock.advance(30000);
  await beat(250);                               // 25.0 s played at 26 s of match: fine
  ok(!(await can(dc(A, 250))), 'heartbeat fresh and the played clock keeps up');
  await w.clock.advance(3000);
  await beat(60);                                // fresh heartbeat, but only 6.0 s played at 29 s of match
  ok(await can(dc(A, 60)), 'the played clock is more than 15 s behind');
  ok(!(await can(A.set('matches/m2/out/0', { t: 10, d: 0, ts: TS, by: 'cap' }))), 'no cap before 344 s');
  ok(!(await can(C.set('matches/m2/out/0', { t: 10, d: 0, ts: TS, by: 'cap' }))), 'never from outside');
  await w.clock.advance(320000);
  ok(!(await can(B.set('matches/m2/out/0', { t: 3300, d: 5000, ts: TS, by: 'cap' }))), 'a player who is already out cannot cap anybody');
  // a second match where nobody has fallen by the cap
  w.hub.admin.set('matches/m3', { code: 'FFFF', k: 'friend', ts: now, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 } });
  ok(await can(B.set('matches/m3/out/0', { t: 3300, d: 5000, ts: TS, by: 'cap' })), 'cap after 344 s');
  ok(!(await can(A.set('matches/m3/out/1', { t: 3300, d: 5000, ts: TS, by: 'cap' }))), 'and the capped player cannot cap back');
});

test('a forfeit needs the room to have gone live with that very match', async () => {
  const w = world();
  const { A } = await trio(w);
  const now = w.clock.now();
  w.hub.admin.update({
    'rooms/GGGG': { h: 'uidA', k: 'friend', max: 2, ts: now, st: 'lobby', rn: 0, sl: { 0: 'uidA', 1: 'uidB' } },
    // a spare record made in the lobby: the room never went live with it
    'matches/spare': { code: 'GGGG', k: 'friend', ts: now, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 } },
  });
  await w.clock.advance(20000);
  ok(!(await can(A.set('matches/spare/out/1', { t: 0, d: 0, ts: TS, by: 'dc' }))), 'the rival was never told a match began');
  w.hub.admin.update({ 'rooms/GGGG/mid': 'spare', 'rooms/GGGG/mts': w.clock.now(), 'rooms/GGGG/st': 'live' });
  ok(!(await can(A.set('matches/spare/out/1', { t: 0, d: 0, ts: TS, by: 'dc' }))), 'going live 20 s after the record does not count either');
});

run('rules');
