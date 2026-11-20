// ONE table of allowed and denied reads / writes, run two ways:
//   node tests/online/rules.mjs            against the local hub (rulescheck.js over the real rule text)
//   node scripts/rules-probe.mjs --live    against the real database, once the owner has made the account
// It only uses the transport interface and three signed-in players A, B, C, so it needs no console
// access. The steps build on each other (allowed writes really happen), so the order matters.
// Real waits add up to about 50 s on the live run; the hub run uses a virtual clock.

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
  const roomVal = (h, k = 'friend', max = 2) => ({ h, k, max, ts: TS, st: 'lobby', rn: 0, sl: { 0: h }, p: { 0: seat('Probe A2') } });
  await deny('a room with a lower-case code', 'A', (t) => t.set(`rooms/${code.toLowerCase()}`, roomVal(U.A)));
  await deny('a room code with the letter O', 'A', (t) => t.set('rooms/ABOC', roomVal(U.A)));
  await deny('a room hosted by somebody else', 'A', (t) => t.set(R, roomVal(U.B)));
  await deny('4 seats in a quick room', 'A', (t) => t.set(R, roomVal(U.A, 'quick', 4)));
  await deny('a room of an unknown kind', 'A', (t) => t.set(R, roomVal(U.A, 'party', 2)));
  await allow('create a room', 'A', (t) => t.set(R, roomVal(U.A)));
  await deny("overwrite another player's room", 'B', (t) => t.set(R, roomVal(U.B)));
  await deny("delete another player's room", 'B', (t) => t.remove(R));
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
  await deny('an unknown room field', 'A', (t) => t.set(`${R}/zz`, 1));

  // ------------------------------------------------------------------ match record
  const mid = A.newId();
  const M = `matches/${mid}`;
  const matchVal = (over = {}) => ({ code, k: 'friend', ts: TS, u: { 0: U.A, 1: U.B }, us: { [U.A]: 0, [U.B]: 1 }, tr: { 0: 0, 1: 0 }, ...over });
  const live = (m) => ({ [`${R}/st`]: 'live', [`${R}/mid`]: m, [`${R}/mts`]: TS, [`${R}/ts`]: TS });
  await deny('room goes live with no match record', 'A', (t) => t.update(live('nothing')));
  await deny('a match record from outside the room', 'C', (t) => t.set(M, matchVal()));
  await deny('a match record with the wrong players', 'A', (t) => t.set(M, matchVal({ u: { 0: U.A, 1: U.C }, us: { [U.A]: 0, [U.C]: 1 } })));
  await deny('a match record with swapped seats', 'A', (t) => t.set(M, matchVal({ us: { [U.A]: 1, [U.B]: 0 } })));
  await deny('a match record with a made-up time', 'A', (t) => t.set(M, matchVal({ ts: 1234567 })));
  await deny('a match record with made-up trophies', 'A', (t) => t.set(M, matchVal({ tr: { 0: 500, 1: 0 } })));
  await deny('a match record that already holds a result', 'A', (t) => t.set(M, matchVal({ out: { 1: { t: 0, d: 0, ts: TS, by: 'dead' } } })));
  await deny('a match record of another kind than the room', 'A', (t) => t.set(M, matchVal({ k: 'quick' })));
  await allow('create the match record', 'A', (t) => t.set(M, matchVal()));
  const matchAt = A.now();
  await deny('set the match id without going live', 'A', (t) => t.set(`${R}/mid`, mid));
  await allow('room goes live', 'A', (t) => t.update(live(mid)));
  await deny('edit the match record', 'A', (t) => t.set(`${M}/ts`, TS));
  await deny('replace the match record', 'A', (t) => t.set(M, matchVal()));
  await deny('delete a fresh match record', 'A', (t) => t.remove(M));
  await allow('read the match record', 'C', (t) => t.get(M));

  // ------------------------------------------------------------------ events
  const ev = (f, over = {}) => ({ k: 'e', a: 1, f, to: 1, q: 1, ...over });
  await allow('send an event', 'A', (t) => t.set(`${R}/ev/${mid}/e1`, ev(0)));
  await deny('send an event as the rival', 'A', (t) => t.set(`${R}/ev/${mid}/e2`, ev(1)));
  await deny('an event from a watcher', 'C', (t) => t.set(`${R}/ev/${mid}/e3`, ev(0)));
  await deny('an event for another match', 'A', (t) => t.set(`${R}/ev/other/e4`, ev(0)));
  await deny('rewrite an event', 'A', (t) => t.set(`${R}/ev/${mid}/e1`, ev(0, { a: 2 })));
  await deny('an event with free text', 'A', (t) => t.set(`${R}/ev/${mid}/e5`, ev(0, { msg: 'hello' })));

  // ------------------------------------------------------------------ falls
  const out = (t, d, by = 'dead', ts = TS) => ({ t, d, ts, by });
  await deny('a fall before the countdown could have ended', 'A', (t) => t.set(`${M}/out/0`, out(5, 10)));
  await until(matchAt + 3200);
  await deny("forge the rival's fall", 'B', (t) => t.set(`${M}/out/0`, out(0, 0)));
  await deny('forfeit the rival too early', 'B', (t) => t.set(`${M}/out/0`, out(0, 0, 'dc')));
  await deny('cap the match too early', 'B', (t) => t.set(`${M}/out/0`, out(0, 0, 'cap')));
  await deny('a fall from outside the match', 'C', (t) => t.set(`${M}/out/0`, out(0, 0)));
  await deny('a played time longer than real time', 'A', (t) => t.set(`${M}/out/0`, out(3000, 100)));
  await deny('an impossible distance', 'A', (t) => t.set(`${M}/out/0`, out(5, 5000)));
  await deny('a fall with a made-up server time', 'A', (t) => t.set(`${M}/out/0`, out(5, 10, 'dead', 1234)));
  await deny('call my own fall a disconnect', 'A', (t) => t.set(`${M}/out/0`, out(5, 10, 'dc')));
  await deny('a fall of an unknown kind', 'A', (t) => t.set(`${M}/out/0`, out(5, 10, 'won')));
  await deny('a fall for a seat nobody has', 'A', (t) => t.set(`${M}/out/3`, out(5, 10)));
  await allow('my own fall', 'A', (t) => t.set(`${M}/out/0`, out(5, 10)));
  await deny('rewrite my fall', 'A', (t) => t.set(`${M}/out/0`, out(6, 10)));
  await deny("delete the rival's fall", 'B', (t) => t.remove(`${M}/out/0`));

  // ------------------------------------------------------------------ queue, quick room, human stake
  await allow('join the queue', 'B', (t) => t.set(`queue/${U.B}`, { tr: 0, ts: TS }));
  await deny('a ticket with made-up trophies', 'C', (t) => t.set(`queue/${U.C}`, { tr: 900, ts: TS }));
  await deny("write another player's ticket", 'A', (t) => t.set(`queue/${U.C}`, { tr: 0, ts: TS }));
  await wait(30);
  await allow('second player joins the queue', 'A', (t) => t.set(`queue/${U.A}`, { tr: 0, ts: TS }));
  await allow('read the 10 oldest tickets', 'A', (t) => t.get('queue', { orderBy: 'child', child: 'ts', limitToFirst: 10 }));
  await deny('read the whole queue', 'A', (t) => t.get('queue'));
  let qcode = makeCode(rand);
  while (qcode === code) qcode = makeCode(rand);
  const Q = `rooms/${qcode}`;
  await allow('create a quick room', 'A', (t) => t.set(Q, roomVal(U.A, 'quick', 2)));
  await deny('take a quick-room seat without being matched', 'B', (t) => t.set(`${Q}/sl/1`, U.B));
  await deny('claim a ticket with a friend room', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code }));
  await deny('claim a ticket without one of my own', 'C', (t) => t.set(`queue/${U.B}/m`, { by: U.C, code: qcode }));
  await deny('claim a ticket in somebody else\'s name', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.C, code: qcode }));
  await deny('the older ticket claims the newer one', 'B', (t) => t.set(`queue/${U.A}/m`, { by: U.B, code: qcode }));
  await allow('claim the older ticket for my quick room', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode }));
  await deny('claim a ticket twice', 'A', (t) => t.set(`queue/${U.B}/m`, { by: U.A, code: qcode }));
  await deny('an unmatched player takes the quick-room seat', 'C', (t) => t.set(`${Q}/sl/1`, U.C));
  await allow('take the seat I was matched to', 'B', (t) => t.set(`${Q}/sl/1`, U.B));
  await allow('picks in the quick room', 'B', (t) => t.set(`${Q}/p/1`, seat('Probe B')));
  const mid2 = A.newId();
  const M2 = `matches/${mid2}`;
  await allow('create the quick match record', 'A', (t) => t.set(M2, { code: qcode, k: 'quick', ts: TS, u: { 0: U.A, 1: U.B }, us: { [U.A]: 0, [U.B]: 1 }, tr: { 0: 0, 1: 0 } }));
  const match2At = A.now();
  await allow('quick room goes live', 'A', (t) => t.update({ [`${Q}/st`]: 'live', [`${Q}/mid`]: mid2, [`${Q}/mts`]: TS, [`${Q}/ts`]: TS }));
  const stakeHuman = (m, over = {}) => ({ ...base('Probe A2'), l: 1, sk: { a: TS, s: 0, st: 0, b: false, m, ms: 0, os: 1, o: 0, ...over } });
  await deny('a stake on a friend match', 'A', (t) => t.set(uA, stakeHuman(mid)));
  await deny('a stake on a match that does not exist', 'A', (t) => t.set(uA, stakeHuman('nothing')));
  await deny('a stake that claims the wrong seat', 'A', (t) => t.set(uA, stakeHuman(mid2, { ms: 1, os: 0 })));
  await deny('a stake that inflates the rival\'s trophies', 'A', (t) => t.set(uA, stakeHuman(mid2, { o: 2000 })));
  await allow('stake on my quick match', 'A', (t) => t.set(uA, stakeHuman(mid2)));
  const stakeAt = A.now();

  // ------------------------------------------------------------------ disconnect forfeit (friend match)
  await until(matchAt + 13500);
  await allow('the rival heartbeats again', 'B', (t) => t.set(`${R}/hb/1`, { a: TS, t: 0 }));
  await deny('forfeit a rival whose heartbeat is fresh', 'A', (t) => t.set(`${M}/out/1`, out(0, 0, 'dc')));
  await wait(9300);
  await deny('a forfeit from outside the match', 'C', (t) => t.set(`${M}/out/1`, out(0, 0, 'dc')));
  await allow('forfeit a rival who has been silent', 'A', (t) => t.set(`${M}/out/1`, out(0, 0, 'dc')));

  // ------------------------------------------------------------------ human win claim
  await until(match2At + 15500);
  await deny('a stake on an old match', 'B', (t) => t.set(uB, { ...base('Probe B'), l: 1, sk: { a: TS, s: 0, st: 0, b: false, m: mid2, ms: 1, os: 0, o: 0 } }));
  await until(stakeAt + 20500);
  const humanWin = (over = {}) => ({ ...base('Probe A2'), tr: 28, pk: 28, w: 1, st: 1, bs: 1, ws: weekBase() + 28, cd: day(), cc: 1, ...over });
  await deny("a win without the rival's fall", 'A', (t) => t.set(uA, humanWin()));
  await deny('delete part of the stake', 'A', (t) => t.remove(`${uA}/sk/ms`));
  await allow('the rival falls', 'B', (t) => t.set(`${M2}/out/1`, out(100, 150)));
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

  // ------------------------------------------------------------------ 4 seats, leaving, tidy up
  let code4 = makeCode(rand);
  while (code4 === code || code4 === qcode) code4 = makeCode(rand);
  await allow('create a 4-seat friend room', 'A', (t) => t.set(`rooms/${code4}`, roomVal(U.A, 'friend', 4)));
  await allow('take seat 3 of a 4-seat room', 'C', (t) => t.set(`rooms/${code4}/sl/3`, U.C));
  await deny('take a second seat', 'C', (t) => t.set(`rooms/${code4}/sl/2`, U.C));
  await deny('seat 4 does not exist', 'B', (t) => t.set(`rooms/${code4}/sl/4`, U.B));
  await deny("empty a rival's seat", 'B', (t) => t.remove(`rooms/${code4}/sl/3`));
  await allow('leave my seat', 'C', (t) => t.remove(`rooms/${code4}/sl/3`));
  await allow('the host deletes the room', 'A', (t) => t.remove(`rooms/${code4}`));
  await allow('leave the queue', 'B', (t) => t.remove(`queue/${U.B}`));
  await allow('leave the queue (second player)', 'A', (t) => t.remove(`queue/${U.A}`));
  await allow('stop watching', 'C', (t) => t.remove(`${R}/sp/${U.C}`));
  await allow('the host deletes the friend room', 'A', (t) => t.remove(R));
  await allow('the host deletes the quick room', 'A', (t) => t.remove(Q));
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
