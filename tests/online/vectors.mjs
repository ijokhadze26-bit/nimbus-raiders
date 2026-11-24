// ONE table of allowed and denied reads / writes, run two ways:
//   node tests/online/rules.mjs            against the local hub (rulescheck.js over the real rule text)
//   node scripts/rules-probe.mjs --live    against the real database, once the owner has made the account
// It only uses the transport interface and three signed-in players A, B, C, so it needs no console
// access. The steps build on each other (allowed writes really happen), so the order matters.
// Real waits add up to about 53 s on the live run (67 s with stage 5); the hub run uses a virtual clock. The stage-4
// rows (a draw, a human close and a bot close that raise the best survival time) and the 11 stage-5 rows (a match of
// three in a 4-seat friend room: seats 2 and 3, out/2, a dc of out/3, OVER with three) were appended.

import { TS, isDenied } from '../../src/online/transport.js';
import { makeCode } from '../../src/online/names.js';

const base = (n) => ({ n, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0 });
const seat = (n) => ({ n, tr: 0, he: 'vanguard', we: 'blaster', hs: '', ws: '' });
const state = `1${'0'.repeat(19)}`;

/**
 * runVectors({ A, B, C, wait, rand }) -> [{ name, who, expect, got, ok, note }]
 *   A, B, C  connected transports of three different players (none has a profile yet)
 *   wait     async (ms) => {}  real sleep on the live run, clock.advance on the hub
 */
export async function runVectors({ A, B, C, wait, rand = Math.random }) {
  const T = { A, B, C };
  const U = { A: A.uid, B: B.uid, C: C.uid };
  const results = [];
  const attempt = async (name, who, expect, fn) => {
    let got = 'allow', note = '';
    try { await fn(T[who]); } catch (e) { got = isDenied(e) ? 'deny' : 'error'; note = String(e?.message || e); }
    results.push({ name, who, expect, got, ok: got === expect, note });
  };
  const allow = (name, who, fn) => attempt(name, who, 'allow', fn);
  const deny = (name, who, fn) => attempt(name, who, 'deny', fn);
  const until = async (at) => { const ms = at - A.now(); if (ms > 0) await wait(ms); };
  const weekBase = () => { const x = A.now() - 345600000; return (x - (x % 604800000)) / 6048; };
  const day = () => Math.floor(A.now() / 86400000);

  // ------------------------------------------------------------------ profiles
  const uA = `users/${U.A}`, uB = `users/${U.B}`, uC = `users/${U.C}`;
  await allow('create my profile', 'A', (t) => t.set(uA, base('Probe A')));
  await deny('create a profile for another player', 'A', (t) => t.set(uB, base('Hacked')));
  await allow('second player creates a profile', 'B', (t) => t.set(uB, base('Probe B')));
  await allow('third player creates a profile', 'C', (t) => t.set(uC, base('Probe C')));
  await deny('a new profile that starts with trophies', 'A', (t) => t.set(uA, { ...base('Probe A'), tr: 500, pk: 500 }));
  await deny('+500 trophies', 'A', (t) => t.set(`${uA}/tr`, 500));
  await deny('give myself wins', 'A', (t) => t.set(`${uA}/w`, 10));
  await deny('give myself a survival record', 'A', (t) => t.set(`${uA}/bt`, 3000));
  await deny('negative trophies', 'A', (t) => t.set(`${uA}/tr`, -5));
  await deny('trophies as text', 'A', (t) => t.set(`${uA}/tr`, 'lots'));
  await allow('rename', 'A', (t) => t.set(`${uA}/n`, 'Probe A2'));
  await deny('a name with other characters', 'A', (t) => t.set(`${uA}/n`, '<b>x</b>'));
  await deny('a name that is too long', 'A', (t) => t.set(`${uA}/n`, 'ThirteenChars'));
  await deny("rename another player", 'B', (t) => t.set(`${uA}/n`, 'Owned'));
  await deny("change another player's trophies", 'B', (t) => t.set(`${uA}/tr`, 0));
  await deny('an unknown profile field', 'A', (t) => t.set(`${uA}/admin`, true));
  await deny('delete my profile', 'A', (t) => t.remove(uA));
  await allow('read one profile', 'A', (t) => t.get(uB));
  await deny('read every profile at once', 'A', (t) => t.get('users'));
  await allow('top 100 by trophies', 'A', (t) => t.get('users', { orderBy: 'child', child: 'tr', limitToLast: 100 }));
  await allow('top 100 by survival time', 'A', (t) => t.get('users', { orderBy: 'child', child: 'bt', limitToLast: 100 }));
  await allow('top 100 this week', 'A', (t) => t.get('users', { orderBy: 'child', child: 'ws', startAt: weekBase(), limitToLast: 100 }));
  await deny('top 500 by trophies', 'A', (t) => t.get('users', { orderBy: 'child', child: 'tr', limitToLast: 500 }));
  await deny('every profile ordered by name', 'A', (t) => t.get('users', { orderBy: 'child', child: 'n', limitToLast: 100 }));

  // ------------------------------------------------------------------ rank mirror, config, bans, day meter
  await allow('mirror my trophies for rank counting', 'A', (t) => t.set(`rk/${U.A}`, 0));
  await deny('mirror a made-up number', 'A', (t) => t.set(`rk/${U.A}`, 999));
  await deny("write another player's rank number", 'B', (t) => t.set(`rk/${U.A}`, 0));
  await allow('count the players above me', 'A', (t) => t.get('rk', { orderBy: 'value', startAfter: 0, limitToFirst: 500 }));
  await deny('read every rank number', 'A', (t) => t.get('rk'));
  await allow('read the config', 'A', (t) => t.get('cfg'));
  await deny('change the config', 'A', (t) => t.set('cfg/on', false));
  await deny('ban somebody', 'A', (t) => t.set(`ban/${U.B}`, true));
  await allow('read my own ban flag', 'A', (t) => t.get(`ban/${U.A}`));
  await deny("read another player's ban flag", 'A', (t) => t.get(`ban/${U.B}`));
  const meterKey = `meter/d${new Date(A.now()).toISOString().slice(0, 10).replace(/-/g, '')}`;
  const meter0 = (await A.get(meterKey).catch(() => 0)) || 0;
  await allow('count one match on the day meter', 'A', (t) => t.set(meterKey, meter0 + 1));
  await deny('jump the day meter', 'A', (t) => t.set(meterKey, meter0 + 50));
  await deny('a day meter with a bad key', 'A', (t) => t.set('meter/today', 1));

  // ------------------------------------------------------------------ a bot stake (claimed at the end)
  const stakeBot = (over = {}) => ({ ...base('Probe C'), l: 1, sk: { a: TS, s: 0, st: 0, b: true }, ...over });
  await deny('a stake that does not count the loss', 'C', (t) => t.set(uC, stakeBot({ l: 0 })));
  await deny('a stake with a made-up time', 'C', (t) => t.set(uC, stakeBot({ sk: { a: 1234, s: 0, st: 0, b: true } })));
  await deny('a stake of the wrong size', 'C', (t) => t.set(uC, stakeBot({ sk: { a: TS, s: 5, st: 0, b: true } })));
  await allow('stake against a bot', 'C', (t) => t.set(uC, stakeBot()));
  const botStakeAt = A.now();
  const botWin = (over = {}) => ({ ...base('Probe C'), tr: 28, pk: 28, w: 1, st: 1, bs: 1, ws: weekBase() + 28, cd: day(), cc: 1, ...over });
  await deny('claim a win straight after the stake', 'C', (t) => t.set(uC, botWin()));
  await deny('raise the streak inside an open stake', 'C', (t) => t.set(`${uC}/sk/st`, 5));
  await deny('turn a bot stake into a human one', 'C', (t) => t.set(`${uC}/sk/b`, false));
  await allow('rename while a stake is open', 'C', (t) => t.set(`${uC}/n`, 'Probe C3'));

  // ------------------------------------------------------------------ friend room
  const code = makeCode(rand);
  const R = `rooms/${code}`;
  const roomVal = (h, k = 'friend', max = 2, over = {}) => ({ h, k, max, ts: TS, st: 'lobby', rn: 0, sl: { 0: h }, p: { 0: seat('Probe A2') }, ...over });
  await deny('a room without reserving its code first', 'A', (t) => t.set(R, roomVal(U.A)));
  await deny('reserve a room code for another player', 'A', (t) => t.set(`host/${U.B}`, code));
  await deny('reserve something that is not a room code', 'A', (t) => t.set(`host/${U.A}`, 'abcd'));
  await allow('reserve a room code', 'A', (t) => t.set(`host/${U.A}`, code));
  await deny('forget my reservation', 'A', (t) => t.remove(`host/${U.A}`));
  await deny('a room with a lower-case code', 'A', (t) => t.set(`rooms/${code.toLowerCase()}`, roomVal(U.A)));
  await deny('a room code with the letter O', 'A', (t) => t.set('rooms/ABOC', roomVal(U.A)));
  await deny('a room hosted by somebody else', 'A', (t) => t.set(R, roomVal(U.B)));
  await deny('4 seats in a quick room', 'A', (t) => t.set(R, roomVal(U.A, 'quick', 4)));
  await deny('a room of an unknown kind', 'A', (t) => t.set(R, roomVal(U.A, 'party', 2)));
  await deny('a new room with a rival already seated', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { sl: { 0: U.A, 1: U.B } })));
  await deny('a new room with me in both seats', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { sl: { 0: U.A, 1: U.A } })));
  await deny('a new room with no seats, only a bare value', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { sl: 'nobody' })));
  await deny('a new room that is already live', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { st: 'live', mid: 'm', mts: TS })));
  await deny('a new room stuffed with states', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { l: 'x'.repeat(5000) })));
  await deny('a new room stuffed with pick rows', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { p: { 0: seat('Probe A2'), k1: seat('x'), k2: seat('y') } })));
  await deny('a new room stuffed with events and watchers', 'A', (t) => t.set(R, roomVal(U.A, 'friend', 2, { ev: { any: { e: { k: 's', a: 1, f: 0, to: 1 } } }, sp: { nobody: true } })));
  await allow('create a room', 'A', (t) => t.set(R, roomVal(U.A)));
  await deny("overwrite another player's room", 'B', (t) => t.set(R, roomVal(U.B)));
  await deny('overwrite my own room', 'A', (t) => t.set(R, roomVal(U.A)));
  await deny("delete another player's room", 'B', (t) => t.remove(R));
  await deny("make myself host of another player's room", 'B', (t) => t.set(`${R}/h`, U.B));
  await allow('read a room', 'B', (t) => t.get(`${R}/sl`));
  await deny('seat 2 of a 2-seat room', 'B', (t) => t.set(`${R}/sl/2`, U.B));
  await deny('seat somebody else', 'B', (t) => t.set(`${R}/sl/1`, U.C));
  await allow('take the empty seat', 'B', (t) => t.set(`${R}/sl/1`, U.B));
  await deny('take a taken seat', 'C', (t) => t.set(`${R}/sl/1`, U.C));
  await allow('write my picks', 'B', (t) => t.set(`${R}/p/1`, seat('Probe B')));
  await deny("change a rival's picks", 'B', (t) => t.set(`${R}/p/0/he`, 'none'));
  await deny('picks with an unknown field', 'B', (t) => t.set(`${R}/p/1/coins`, 999));
  await deny('picks from outside the room', 'C', (t) => t.set(`${R}/p/1`, seat('Probe C')));
  await allow('ready', 'B', (t) => t.set(`${R}/p/1/rdy`, 1));
  await allow('watch a room', 'C', (t) => t.set(`${R}/sp/${U.C}`, true));
  await deny('mark somebody else as watching', 'C', (t) => t.set(`${R}/sp/${U.B}`, true));
  await allow('send my state', 'B', (t) => t.set(`${R}/l/1`, state));
  await deny("write a rival's state", 'B', (t) => t.set(`${R}/l/0`, state));
  await deny('a state that is too long', 'B', (t) => t.set(`${R}/l/1`, 'x'.repeat(100)));
  await deny('a state from a watcher', 'C', (t) => t.set(`${R}/l/1`, state));
  await allow('heartbeat', 'B', (t) => t.set(`${R}/hb/1`, { a: TS, t: 0 }));
  await deny('a heartbeat with a made-up time', 'B', (t) => t.set(`${R}/hb/1`, { a: 12345, t: 0 }));
  await deny("a rival's heartbeat", 'B', (t) => t.set(`${R}/hb/0`, { a: TS, t: 0 }));
  await deny('a watcher flips the room to live', 'C', (t) => t.set(`${R}/st`, 'live'));
  await deny('flip the room to live with no match', 'B', (t) => t.set(`${R}/st`, 'live'));
  await deny('skip a round number', 'B', (t) => t.set(`${R}/rn`, 5));
  await deny('an unknown room field', 'A', (t) => t.set(`${R}/zz`, 1));

  // ------------------------------------------------------------------ match record
  const mid = A.newId();
  const M = `matches/${mid}`;
  const matchVal = (over = {}) => ({ code, k: 'friend', ts: TS, u: { 0: U.A, 1: U.B }, us: { [U.A]: 0, [U.B]: 1 }, tr: { 0: 0, 1: 0 }, ...over });
  const live = (room, m) => ({ [`${room}/st`]: 'live', [`${room}/mid`]: m, [`${room}/mts`]: TS, [`${room}/ts`]: TS });
  const lobby = (room, rn) => ({ [`${room}/st`]: 'lobby', [`${room}/rn`]: rn });
  await deny('room goes live with no match record', 'A', (t) => t.update(live(R, 'nothing')));
  await deny('a match record from outside the room', 'C', (t) => t.set(M, matchVal()));
  await deny('a match record with the wrong players', 'A', (t) => t.set(M, matchVal({ u: { 0: U.A, 1: U.C }, us: { [U.A]: 0, [U.C]: 1 } })));
  await deny('a match record with swapped seats', 'A', (t) => t.set(M, matchVal({ us: { [U.A]: 1, [U.B]: 0 } })));
  await deny('a match record that leaves the rival out', 'A', (t) => t.set(M, matchVal({ us: { [U.A]: 0 } })));
  await deny('a match record with a made-up time', 'A', (t) => t.set(M, matchVal({ ts: 1234567 })));
  await deny('a match record with made-up trophies', 'A', (t) => t.set(M, matchVal({ tr: { 0: 500, 1: 0 } })));
  await deny('a match record with a bare value for trophies', 'A', (t) => t.set(M, matchVal({ tr: 'x'.repeat(5000) })));
  await deny('a match record that already holds a result', 'A', (t) => t.set(M, matchVal({ out: { 1: { t: 0, d: 0, ts: TS, by: 'dead' } } })));
  await deny('a match record of another kind than the room', 'A', (t) => t.set(M, matchVal({ k: 'quick' })));
  const spare = A.newId();
  await allow('a match record that will not be used', 'A', (t) => t.set(`matches/${spare}`, matchVal()));
  await deny('tidy away a match record from outside', 'C', (t) => t.remove(`matches/${spare}`));
  await allow('tidy away a match record the room never used', 'B', (t) => t.remove(`matches/${spare}`));
  await allow('create the match record', 'A', (t) => t.set(M, matchVal()));
  const matchAt = A.now();
  await deny('set the match id without going live', 'A', (t) => t.set(`${R}/mid`, mid));
  await allow('room goes live', 'A', (t) => t.update(live(R, mid)));
  await deny('edit the match record', 'A', (t) => t.set(`${M}/ts`, TS));
  await deny('replace the match record', 'A', (t) => t.set(M, matchVal()));
  await deny('delete a fresh match record', 'A', (t) => t.remove(M));
  await allow('read the match record', 'C', (t) => t.get(M));
  await deny('flip a live room back to the lobby mid-match', 'B', (t) => t.update(lobby(R, 1)));
  await deny('flip a live room back with a bare write', 'A', (t) => t.set(`${R}/st`, 'lobby'));
  await deny('rewrite the go-live time mid-match', 'B', (t) => t.set(`${R}/mts`, TS));
  await deny("remove the room's match id mid-match", 'B', (t) => t.remove(`${R}/mid`));
  await deny("empty a rival's seat mid-match", 'A', (t) => t.remove(`${R}/sl/1`));
  await deny('delete a room while its match is on', 'A', (t) => t.remove(R));

  // ------------------------------------------------------------------ events
  const ev = (f, over = {}) => ({ k: 'e', a: 1, f, to: 1, q: 1, ...over });
  await allow('send an event', 'A', (t) => t.set(`${R}/ev/${mid}/e1`, ev(0)));
  await deny('send an event as the rival', 'A', (t) => t.set(`${R}/ev/${mid}/e2`, ev(1)));
  await deny('an event from a watcher', 'C', (t) => t.set(`${R}/ev/${mid}/e3`, ev(0)));
  await deny('an event for another match', 'A', (t) => t.set(`${R}/ev/other/e4`, ev(0)));
  await deny('rewrite an event', 'A', (t) => t.set(`${R}/ev/${mid}/e1`, ev(0, { a: 2 })));
  await deny('an event with free text', 'A', (t) => t.set(`${R}/ev/${mid}/e5`, ev(0, { msg: 'hello' })));

  // ------------------------------------------------------------------ falls (B falls in the friend match)
  const out = (t, d, by = 'dead', ts = TS) => ({ t, d, ts, by });
  await deny('a fall before the countdown could have ended', 'B', (t) => t.set(`${M}/out/1`, out(5, 10)));
  await until(matchAt + 3200);
  await deny("forge the rival's fall", 'B', (t) => t.set(`${M}/out/0`, out(0, 0)));
  await deny('forfeit the rival too early', 'B', (t) => t.set(`${M}/out/0`, out(0, 0, 'dc')));
  await deny('cap the match too early', 'B', (t) => t.set(`${M}/out/0`, out(0, 0, 'cap')));
  await deny('a fall from outside the match', 'C', (t) => t.set(`${M}/out/1`, out(0, 0)));
  await deny('a played time longer than real time', 'B', (t) => t.set(`${M}/out/1`, out(3000, 100)));
  await deny('an impossible distance', 'B', (t) => t.set(`${M}/out/1`, out(5, 5000)));
  await deny('a fall with a made-up server time', 'B', (t) => t.set(`${M}/out/1`, out(5, 10, 'dead', 1234)));
  await deny('call my own fall a disconnect', 'B', (t) => t.set(`${M}/out/1`, out(5, 10, 'dc')));
  await deny('a fall of an unknown kind', 'B', (t) => t.set(`${M}/out/1`, out(5, 10, 'won')));
  await deny('a fall for a seat nobody has', 'B', (t) => t.set(`${M}/out/3`, out(5, 10)));
  await allow('my own fall', 'B', (t) => t.set(`${M}/out/1`, out(5, 10)));
  await deny('rewrite my fall', 'B', (t) => t.set(`${M}/out/1`, out(6, 10)));
  await deny("delete the rival's fall", 'A', (t) => t.remove(`${M}/out/1`));

  // ------------------------------------------------------------------ queue, quick room, human stake
  await allow('join the queue', 'B', (t) => t.set(`queue/${U.B}`, { tr: 0, ts: TS }));
  await deny('a ticket with made-up trophies', 'C', (t) => t.set(`queue/${U.C}`, { tr: 900, ts: TS }));
  await deny("write another player's ticket", 'A', (t) => t.set(`queue/${U.C}`, { tr: 0, ts: TS }));
  await wait(30);
  await allow('second player joins the queue', 'C', (t) => t.set(`queue/${U.C}`, { tr: 0, ts: TS }));
  let qcode = makeCode(rand);
  while (qcode === code) qcode = makeCode(rand);
  const Q = `rooms/${qcode}`;
  await deny('reserve a second room while I sit in my first', 'A', (t) => t.set(`host/${U.A}`, qcode));
  await allow('leave my seat (the match goes on)', 'A', (t) => t.remove(`${R}/sl/0`));
  await allow('state from a player whose seat is gone', 'A', (t) => t.set(`${R}/l/0`, state));
  await allow('reserve the next room code', 'A', (t) => t.set(`host/${U.A}`, qcode));
  await allow('create a quick room for the oldest ticket', 'A', (t) => t.set(Q, roomVal(U.A, 'quick', 2, { q: U.B })));
  await deny('claim a ticket without one of my own', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode }));
  await wait(30);
  await allow('third player joins the queue', 'A', (t) => t.set(`queue/${U.A}`, { tr: 0, ts: TS }));
  await allow('read the 10 oldest tickets', 'A', (t) => t.get('queue', { orderBy: 'child', child: 'ts', limitToFirst: 10 }));
  await deny('read the whole queue', 'A', (t) => t.get('queue'));
  await deny('claim a ticket with a friend room', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code }));
  await deny('claim a ticket in somebody else\'s name', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.C, code: qcode }));
  await deny('claim a ticket into a room I do not host', 'C', (t) => t.set(`queue/${U.B}/m`, { by: U.C, code: qcode }));
  await deny('the older ticket claims the newer one', 'B', (t) => t.set(`queue/${U.A}/m`, { by: U.B, code: qcode }));
  await deny("say another player took a bot", 'A', (t) => t.set(`queue/${U.C}/m`, { by: U.C, bot: true }));
  await deny('claim a ticket the room was not made for', 'A', (t) => t.set(`queue/${U.C}/m`, { by: U.A, code: qcode }));
  await allow('claim the older ticket for my quick room', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode }));
  await deny('claim a ticket twice', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode }));
  await allow('take a bot instead of waiting', 'C', (t) => t.set(`queue/${U.C}/m`, { by: U.C, bot: true }));
  await deny('take a quick-room seat made for somebody else', 'C', (t) => t.set(`${Q}/sl/1`, U.C));
  await allow('take the seat the room was made for', 'B', (t) => t.set(`${Q}/sl/1`, U.B));
  await allow('picks in the quick room', 'B', (t) => t.set(`${Q}/p/1`, seat('Probe B')));
  const mid2 = A.newId();
  const M2 = `matches/${mid2}`;
  const quickVal = (over = {}) => ({ code: qcode, k: 'quick', ts: TS, u: { 0: U.A, 1: U.B }, us: { [U.A]: 0, [U.B]: 1 }, tr: { 0: 0, 1: 0 }, ...over });
  await deny('a quick match record without the trophies', 'A', (t) => t.set(M2, quickVal({ tr: null })));
  await allow('create the quick match record', 'A', (t) => t.set(M2, quickVal()));
  const match2At = A.now();
  await allow('quick room goes live', 'A', (t) => t.update(live(Q, mid2)));
  await deny('point a live room at another match', 'B', (t) => t.update(live(Q, mid)));
  const stakeHuman = (m, over = {}) => ({ ...base('Probe A2'), l: 1, sk: { a: TS, s: 0, st: 0, b: false, m, ms: 0, os: 1, o: 0, ...over } });
  await deny('a stake on a friend match', 'A', (t) => t.set(uA, stakeHuman(mid)));
  await deny('a stake on a match that does not exist', 'A', (t) => t.set(uA, stakeHuman('nothing')));
  await deny('a stake that claims the wrong seat', 'A', (t) => t.set(uA, stakeHuman(mid2, { ms: 1, os: 0 })));
  await deny('a stake that inflates the rival\'s trophies', 'A', (t) => t.set(uA, stakeHuman(mid2, { o: 2000 })));
  await allow('stake on my quick match', 'A', (t) => t.set(uA, stakeHuman(mid2)));
  const stakeAt = A.now();

  // ------------------------------------------------------------------ disconnect forfeit
  await until(match2At + 13500);
  await allow('the rival heartbeats', 'B', (t) => t.set(`${Q}/hb/1`, { a: TS, t: 0 }));
  await deny('forfeit a rival whose heartbeat is fresh', 'A', (t) => t.set(`${M2}/out/1`, out(100, 150, 'dc')));
  await deny('the loser forfeits the winner after the match', 'B', (t) => t.set(`${M}/out/0`, out(0, 0, 'dc')));
  await until(match2At + 15500);
  await deny('a stake on an old match', 'B', (t) => t.set(uB, { ...base('Probe B'), l: 1, sk: { a: TS, s: 0, st: 0, b: false, m: mid2, ms: 1, os: 0, o: 0 } }));

  // ------------------------------------------------------------------ human win claim
  await until(Math.max(stakeAt + 20500, match2At + 23000));
  const humanWin = (over = {}) => ({ ...base('Probe A2'), tr: 28, pk: 28, w: 1, st: 1, bs: 1, ws: weekBase() + 28, cd: day(), cc: 1, ...over });
  await deny("a win without the rival's fall", 'A', (t) => t.set(uA, humanWin()));
  await deny('delete part of the stake', 'A', (t) => t.remove(`${uA}/sk/ms`));
  await deny('a forfeit from outside the match', 'C', (t) => t.set(`${M2}/out/1`, out(100, 150, 'dc')));
  await deny('back to the lobby before anybody fell', 'A', (t) => t.update(lobby(Q, 1)));
  await allow('forfeit a rival who has been silent', 'A', (t) => t.set(`${M2}/out/1`, out(100, 150, 'dc')));
  await deny('claim +500 trophies', 'A', (t) => t.set(uA, humanWin({ tr: 500, pk: 500, ws: weekBase() + 500 })));
  await deny('claim a win without counting it for the day', 'A', (t) => t.set(uA, humanWin({ cc: 0 })));
  await deny('claim a survival time I did not reach', 'A', (t) => t.set(uA, humanWin({ bt: 3000 })));
  await deny('claim a win and keep the stake open', 'A', (t) => t.set(uA, { ...humanWin(), sk: { a: stakeAt, s: 0, st: 0, b: false, m: mid2, ms: 0, os: 1, o: 0 } }));
  await allow('claim the win', 'A', (t) => t.set(uA, humanWin({ bt: 100 })));
  await deny('a second claim', 'A', (t) => t.set(uA, humanWin({ tr: 56, pk: 56, w: 2, st: 2, bs: 2, ws: weekBase() + 56, cc: 2, bt: 100 })));
  await allow('mirror the new trophies', 'A', (t) => t.set(`rk/${U.A}`, 28));

  // ------------------------------------------------------------------ bot win claim, close
  await until(botStakeAt + 20500);
  await deny('claim more than a bot win pays', 'C', (t) => t.set(uC, botWin({ tr: 29, pk: 29, ws: weekBase() + 29 })));
  await deny('claim a bot win with a made-up survival time', 'C', (t) => t.set(uC, botWin({ bt: 3000 })));
  await allow('claim the bot win', 'C', (t) => t.set(uC, botWin()));
  await deny('claim the bot win again', 'C', (t) => t.set(uC, botWin({ tr: 56, pk: 56, w: 2, st: 2, bs: 2, ws: weekBase() + 56, cc: 2 })));
  await allow('a second bot stake', 'B', (t) => t.set(uB, { ...base('Probe B'), l: 1, sk: { a: TS, s: 0, st: 0, b: true } }));
  await deny('close a stake and take the loss back', 'B', (t) => t.set(uB, base('Probe B')));
  await allow('close a lost stake', 'B', (t) => t.set(uB, { ...base('Probe B'), l: 1 }));

  // ------------------------------------------------------------------ rematch, 4 seats, leaving, tidy up
  await deny('a rematch that skips the round count', 'B', (t) => t.set(`${R}/st`, 'lobby'));
  await allow('back to the lobby once the match is over', 'B', (t) => t.update(lobby(R, 1)));
  await allow('the host deletes the friend room', 'A', (t) => t.remove(R));
  await deny('delete a live quick room', 'A', (t) => t.remove(Q));
  await allow('quick room back to the lobby', 'A', (t) => t.update(lobby(Q, 1)));
  await allow('the host deletes the quick room', 'A', (t) => t.remove(Q));
  let code4 = makeCode(rand);
  while (code4 === code || code4 === qcode) code4 = makeCode(rand);
  await allow('reserve a third room code', 'A', (t) => t.set(`host/${U.A}`, code4));
  await allow('create a 4-seat friend room', 'A', (t) => t.set(`rooms/${code4}`, roomVal(U.A, 'friend', 4)));
  await allow('take seat 3 of a 4-seat room', 'C', (t) => t.set(`rooms/${code4}/sl/3`, U.C));
  await deny('take a second seat', 'C', (t) => t.set(`rooms/${code4}/sl/2`, U.C));
  await deny('seat 4 does not exist', 'B', (t) => t.set(`rooms/${code4}/sl/4`, U.B));
  await deny("empty a rival's seat", 'B', (t) => t.remove(`rooms/${code4}/sl/3`));
  await allow('leave my seat', 'C', (t) => t.remove(`rooms/${code4}/sl/3`));
  await deny('delete a room that still has its host', 'B', (t) => t.remove(`rooms/${code4}`));
  await allow('the host leaves the seat', 'A', (t) => t.remove(`rooms/${code4}/sl/0`));
  await allow('anyone clears a room nobody sits in', 'B', (t) => t.remove(`rooms/${code4}`));
  await allow('leave the queue', 'B', (t) => t.remove(`queue/${U.B}`));
  await allow('leave the queue (second player)', 'A', (t) => t.remove(`queue/${U.A}`));
  await allow('leave the queue (third player)', 'C', (t) => t.remove(`queue/${U.C}`));

  // ------------------------------------------------------------------ stage 4 (appended): never run live before
  // a draw (rule E), a human close that raises bt, a bot close that raises bt. Each body is built from the CURRENT
  // profile (read first), the way src/online/ranked.js builds it.
  const now = async (t, u) => { const v = await t.get(u); const { sk, ...rest } = v || {}; return { rest, sk }; };
  const cP = (await now(C, uC)).rest;
  await allow('a bot stake (to close with a survival time)', 'C', (t) => t.set(uC, { ...cP, tr: cP.tr - 10, l: cP.l + 1, st: 0, sk: { a: TS, s: 10, st: cP.st, b: true } }));
  await deny('close a bot stake with a survival time I did not reach', 'C', async (t) => { const { rest } = await now(t, uC); return t.set(uC, { ...rest, bt: 3000 }); });
  await allow('close a bot stake with my survival time', 'C', async (t) => { const { rest } = await now(t, uC); return t.set(uC, { ...rest, bt: Math.max(rest.bt, 20) }); });
  await allow('join the queue again', 'B', (t) => t.set(`queue/${U.B}`, { tr: 0, ts: TS }));
  await wait(30);
  await allow('join the queue again (second player)', 'A', async (t) => t.set(`queue/${U.A}`, { tr: (await now(t, uA)).rest.tr, ts: TS }));
  let qcode2 = makeCode(rand);
  while ([code, qcode, code4].includes(qcode2)) qcode2 = makeCode(rand);
  const Q2 = `rooms/${qcode2}`, mid3 = A.newId(), M3 = `matches/${mid3}`;
  await allow('reserve a fourth room code', 'A', (t) => t.set(`host/${U.A}`, qcode2));
  await allow('a second quick room', 'A', (t) => t.set(Q2, roomVal(U.A, 'quick', 2, { q: U.B })));
  await allow('claim the ticket for the second quick room', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode2 }));
  await allow('sit in the second quick room', 'B', (t) => t.set(`${Q2}/sl/1`, U.B));
  await allow('the second quick match record', 'A', async (t) => t.set(M3, { code: qcode2, k: 'quick', ts: TS, u: { 0: U.A, 1: U.B }, us: { [U.A]: 0, [U.B]: 1 }, tr: { 0: (await now(t, uA)).rest.tr, 1: 0 } }));
  const match3At = A.now();
  await allow('the second quick room goes live', 'A', (t) => t.update(live(Q2, mid3)));
  const stake3 = (r, s, ms, o) => ({ ...r, tr: r.tr - s, l: r.l + 1, st: 0, sk: { a: TS, s, st: r.st, b: false, m: mid3, ms, os: 1 - ms, o } });
  await allow('both stake: the first', 'A', async (t) => { const { rest } = await now(t, uA); return t.set(uA, stake3(rest, rest.tr >= 300 ? 20 : rest.tr >= 10 ? 10 : rest.tr, 0, 0)); });
  await allow('both stake: the second', 'B', async (t) => { const { rest } = await now(t, uB); return t.set(uB, stake3(rest, 0, 1, (await t.get(`${M3}/tr/0`)))); });
  await until(match3At + 3200);
  await allow('both fall: the first', 'A', (t) => t.set(`${M3}/out/0`, out(5, 30)));
  await allow('both fall at the same moment and distance', 'B', (t) => t.set(`${M3}/out/1`, out(5, 30)));
  await allow('a draw gives the stake back', 'A', async (t) => { const { rest, sk } = await now(t, uA); return t.set(uA, { ...rest, tr: rest.tr + sk.s, l: rest.l - 1, st: sk.st }); });
  await deny('close with a survival time above my own fall', 'B', async (t) => { const { rest } = await now(t, uB); return t.set(uB, { ...rest, bt: 6 }); });
  await allow('close with my own fall time as my best', 'B', async (t) => { const { rest } = await now(t, uB); return t.set(uB, { ...rest, bt: Math.max(rest.bt, 5) }); });

  // ------------------------------------------------------------------ stage 5 (appended): never run live before
  // a 4-seat friend room whose seats 2 and 3 are taken, a match of three in it, out/2, a dc of out/3 after 13 s and
  // OVER with three runners. The third player hosts; the other two take seats 2 and 3. Extra real waits: about 13.5 s.
  let code5 = makeCode(rand);
  while ([code, qcode, code4, qcode2].includes(code5)) code5 = makeCode(rand);
  const R5 = `rooms/${code5}`, mid5 = C.newId(), M5 = `matches/${mid5}`;
  await allow('reserve a room code (third player)', 'C', (t) => t.set(`host/${U.C}`, code5));
  await allow('a 4-seat friend room (third player hosts)', 'C', (t) => t.set(R5, roomVal(U.C, 'friend', 4)));
  await allow('take seat 2 of a 4-seat room', 'A', (t) => t.set(`${R5}/sl/2`, U.A));
  await allow('take seat 3 of a 4-seat room (second player)', 'B', (t) => t.set(`${R5}/sl/3`, U.B));
  await allow('a match record of three in a 4-seat room', 'C', (t) => t.set(M5, { code: code5, k: 'friend', ts: TS, u: { 0: U.C, 2: U.A, 3: U.B }, us: { [U.C]: 0, [U.A]: 2, [U.B]: 3 } }));
  const match5At = A.now();
  await allow('the 4-seat room goes live with three', 'C', (t) => t.update(live(R5, mid5)));
  await until(match5At + 3200);
  await allow('seat 2 falls', 'A', (t) => t.set(`${M5}/out/2`, out(5, 30)));
  await deny('back to the lobby while two still run', 'C', (t) => t.update(lobby(R5, 1)));
  await until(match5At + 13500);
  await deny('a fallen player forfeits a silent runner', 'A', (t) => t.set(`${M5}/out/3`, out(100, 150, 'dc')));
  await allow('forfeit seat 3 after 13 s of silence', 'C', (t) => t.set(`${M5}/out/3`, out(100, 150, 'dc')));
  await allow('back to the lobby once only one still runs', 'C', (t) => t.update(lobby(R5, 1)));
  return results;
}

/** Print the table; returns the number of rows that did not behave as expected. */
export function printVectors(results, print = console.log) {
  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    print(`${r.ok ? 'PASS' : 'FAIL'}  ${r.expect === 'allow' ? 'allowed' : 'denied '}  ${r.who}  ${r.name}${r.ok ? '' : `   <-- got ${r.got}${r.note ? ` (${r.note})` : ''}`}`);
  }
  return bad;
}
