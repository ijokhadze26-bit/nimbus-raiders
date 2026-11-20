// node tests/online/attacks.mjs — cheats a modified client could try, each played through the local hub
// against the real rule text. Every chain here once paid out (or locked a rival out); now its key step
// is refused. The stages that need console access (trophies, a match in progress) are set up as admin.
import { test, ok, eq, run, world } from './kit.mjs';
import { TS, isDenied } from '../../src/online/transport.js';

const base = (n, over = {}) => ({ n, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0, ...over });
const can = async (p) => { try { await p; return true; } catch (e) { if (isDenied(e)) return false; throw e; } };
const wkOf = (now) => { const x = now - 345600000; return (x - (x % 604800000)) / 6048; };
const dayOf = (now) => Math.floor(now / 86400000);
const room = (h, over = {}) => ({ h, k: 'quick', max: 2, ts: TS, st: 'lobby', rn: 0, sl: { 0: h }, ...over });
const goLive = (code, mid) => ({ [`rooms/${code}/st`]: 'live', [`rooms/${code}/mid`]: mid, [`rooms/${code}/mts`]: TS, [`rooms/${code}/ts`]: TS });
const state = `1${'0'.repeat(19)}`;

/** A real ranked match between A (host, seat 0) and B (seat 1), just gone live, both staked. */
async function ranked(w) {
  const A = await w.client('uidA'), B = await w.client('uidB');
  const now = w.clock.now();
  const sk = (ms) => ({ a: now, s: 20, st: 0, b: false, m: 'm1', ms, os: 1 - ms, o: 500 });
  w.hub.admin.update({
    'rooms/QQQQ': { h: 'uidA', k: 'quick', max: 2, ts: now, st: 'live', mid: 'm1', mts: now, rn: 0, q: 'uidB', sl: { 0: 'uidA', 1: 'uidB' }, p: { 0: { n: 'a' }, 1: { n: 'b' } } },
    'matches/m1': { code: 'QQQQ', k: 'quick', ts: now, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 }, tr: { 0: 500, 1: 500 } },
    'users/uidA': base('Alpha', { tr: 480, pk: 500, l: 1, sk: sk(0) }),
    'users/uidB': base('Bravo', { tr: 480, pk: 500, l: 1, sk: sk(1) }),
  });
  const win = (name) => base(name, { tr: 528, pk: 528, w: 1, l: 0, st: 1, bs: 1, ws: wkOf(w.clock.now()) + 28, cd: dayOf(w.clock.now()), cc: 1 });
  const beat = (who, slot, t) => who.set(`rooms/QQQQ/hb/${slot}`, { a: TS, t });
  return { A, B, win, beat };
}

test('a new room cannot come with seats filled in: no fake match against an absent player or against myself', async () => {
  const w = world();
  const X = await w.client('uidX');
  w.hub.admin.set('users/uidX', base('Cheat', { tr: 300, pk: 300 }));
  w.hub.admin.set('users/uidTop', base('Top', { tr: 2500, pk: 2500 }));
  await X.set('host/uidX', 'ZZZA');
  ok(!(await can(X.set('rooms/ZZZA', room('uidX', { sl: { 0: 'uidX', 1: 'uidTop' } })))), 'the top player in seat 1');
  ok(!(await can(X.set('rooms/ZZZA', room('uidX', { sl: { 0: 'uidX', 1: 'uidX' } })))), 'myself in both seats');
  ok(!(await can(X.set('rooms/ZZZA', room('uidX', { st: 'live', mid: 'fake', mts: TS })))), 'a room that is born live');
  ok(await can(X.set('rooms/ZZZA', room('uidX'))), 'the honest shape');
  ok(!(await can(X.set('rooms/ZZZA/sl/1', 'uidTop'))), 'and nobody can be seated afterwards either');
  ok(!(await can(X.set('matches/fake', { code: 'ZZZA', k: 'quick', ts: TS, u: { 0: 'uidX', 1: 'uidTop' }, us: { uidX: 0 }, tr: { 0: 300, 1: 2500 } }))), 'so no match record names them');
  ok(!(await can(X.set('matches/fake', { code: 'ZZZA', k: 'quick', ts: TS, u: { 0: 'uidX', 1: 'uidX' }, us: { uidX: 0 }, tr: { 0: 300, 1: 300 } }))), 'nor me twice');
});

test('the loser cannot forge the winner\'s forfeit after the match (dc or cap) and take the win', async () => {
  for (const how of ['dc', 'cap']) {
    const w = world();
    const { A, B, win, beat } = await ranked(w);
    await w.clock.advance(4000);
    await beat(B, 1, 0);
    await w.clock.advance(6000);
    ok(await can(A.set('matches/m1/out/0', { t: 50, d: 60, ts: TS, by: 'dead' })), 'A falls at 5.0 s and says so');
    await beat(B, 1, 61); // the winner's last heartbeat: its link stops once it has the verdict
    await w.clock.advance(how === 'dc' ? 12000 : 344000);
    ok(!(await can(A.set('matches/m1/out/1', { t: 0, d: 0, ts: TS, by: how }))), `A writes a "${how}" record for the winner`);
    ok(!(await can(A.set('matches/m1/out/1', { t: 50, d: 60, ts: TS, by: how }))), 'or one that would make it a draw');
    ok(!(await can(A.set('users/uidA', win('Alpha')))), 'A cannot claim a win');
    ok(await can(B.set('users/uidB', win('Bravo'))), 'B, who won, can');
  }
});

test('nobody can throw a rival out of a live match or move the room onto another match', async () => {
  const w = world();
  const { A, B, beat } = await ranked(w);
  await w.clock.advance(5000);
  await beat(B, 1, 10);
  ok(!(await can(A.set('rooms/QQQQ/st', 'lobby'))), 'the host flips the live room to lobby');
  ok(!(await can(A.update({ 'rooms/QQQQ/st': 'lobby', 'rooms/QQQQ/rn': 1 }))), 'also not as a "rematch": nobody has fallen');
  ok(!(await can(A.remove('rooms/QQQQ/sl/1'))), "the host empties the rival's seat");
  ok(!(await can(A.remove('rooms/QQQQ'))), 'the host deletes the room under the rival');
  ok(!(await can(B.set('rooms/QQQQ/mts', TS))), 'a seat rewrites the go-live time (which would switch forfeits off)');
  ok(!(await can(B.remove('rooms/QQQQ/mid'))), 'or removes the match id');
  ok(!(await can(B.set('matches/m2', { code: 'QQQQ', k: 'quick', ts: TS, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 }, tr: { 0: 480, 1: 480 } }))), 'no second match record while the room is live');
  w.hub.admin.set('matches/m2', { code: 'QQQQ', k: 'quick', ts: w.clock.now(), u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 }, tr: { 0: 480, 1: 480 } });
  ok(!(await can(B.update(goLive('QQQQ', 'm2')))), 'and the room cannot be pointed at one');
  ok(await can(B.set('rooms/QQQQ/l/1', state)), 'the rival is still in the match: state...');
  ok(await can(beat(B, 1, 20)), '...and heartbeat go through');
  for (let i = 0; i < 4; i++) { await w.clock.advance(3000); ok(await can(beat(B, 1, 50 + i * 30)), 'the rival keeps heartbeating'); }
  ok(!(await can(A.set('matches/m1/out/1', { t: 0, d: 0, ts: TS, by: 'dc' }))), 'so 17 s in there is nothing to forfeit');
});

test('an honest player can still forfeit a rival who really went silent', async () => {
  const w = world();
  const { A, B, win, beat } = await ranked(w);
  await w.clock.advance(5000);
  await beat(B, 1, 10);
  await w.clock.advance(3000);
  ok(!(await can(A.set('matches/m1/out/1', { t: 10, d: 10, ts: TS, by: 'dc' }))), 'heard 3 s ago: no');
  await w.clock.advance(7000);
  ok(await can(A.set('matches/m1/out/1', { t: 10, d: 10, ts: TS, by: 'dc' })), 'silent for 10 s, 15 s into the match: yes');
  await w.clock.advance(6000);
  ok(await can(A.set('users/uidA', win('Alpha'))), 'and the win counts');
  ok(!(await can(B.set('matches/m1/out/0', { t: 0, d: 0, ts: TS, by: 'dc' }))), 'the forfeited player cannot forfeit back');
});

test('a match record must hold every player, so nobody is left unable to record a fall', async () => {
  const w = world();
  const A = await w.client('uidA'), B = await w.client('uidB');
  w.hub.admin.update({
    'rooms/QQQQ': { h: 'uidA', k: 'quick', max: 2, ts: w.clock.now(), st: 'lobby', rn: 0, sl: { 0: 'uidA', 1: 'uidB' } },
    'users/uidA': base('Alpha', { tr: 500, pk: 500 }), 'users/uidB': base('Bravo', { tr: 500, pk: 500 }),
  });
  const rec = (over) => ({ code: 'QQQQ', k: 'quick', ts: TS, u: { 0: 'uidA', 1: 'uidB' }, us: { uidA: 0, uidB: 1 }, tr: { 0: 500, 1: 500 }, ...over });
  ok(!(await can(A.set('matches/m1', rec({ us: { uidA: 0 } })))), 'the rival left out of `us`');
  ok(!(await can(A.set('matches/m1', rec({ tr: null })))), 'a ranked record without the trophies');
  ok(!(await can(A.set('matches/m1', rec({ tr: 'x'.repeat(100000) })))), 'a bare value where the trophies go');
  ok(await can(A.set('matches/m1', rec())), 'the whole record');
  ok(await can(A.update(goLive('QQQQ', 'm1'))));
  await w.clock.advance(6000);
  ok(await can(B.set('matches/m1/out/1', { t: 10, d: 10, ts: TS, by: 'dead' })), 'the rival can record its own fall');
});

test('sizes: a room or match record cannot be stuffed with bare values or thousands of keys', async () => {
  const w = world();
  const X = await w.client('uidX');
  w.hub.admin.set('users/uidX', base('Cheat'));
  await X.set('host/uidX', 'BBBA');
  const big = 'x'.repeat(200000);
  const many = (mk) => Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, mk(i)]));
  const fr = (over) => room('uidX', { k: 'friend', ...over });
  for (const [what, over] of [
    ['l as a string', { l: big }], ['p as a string', { p: big }], ['hb as a string', { hb: big }], ['ev as a string', { ev: big }],
    ['sp as a string', { sp: big }], ['sl as a string', { sl: 'nobody' }], ['a huge seat 1', { sl: { 0: 'uidX', 1: big } }],
    ['500 pick rows', { p: many(() => ({ n: 'x' })) }], ['500 states', { l: many(() => 'x'.repeat(64)) }],
    ['500 watchers', { sp: many(() => true) }], ['500 events', { ev: { any: many(() => ({ k: 's', a: 1, f: 0, to: 1 })) } }],
    ['a huge q in a friend room', { q: big }],
  ]) ok(!(await can(X.set('rooms/BBBA', fr(over)))), what);
  ok(await can(X.set('rooms/BBBA', fr({ p: { 0: { n: 'Cheat' } } }))), 'the honest room');
  for (const [what, path, v] of [['picks as a string', 'p', big], ['states as a string', 'l', big], ['a pick row for seat 7', 'p/7', { n: 'x' }],
    ['a state for seat 7', 'l/7', state], ['a heartbeat for seat 7', 'hb/7', { a: TS, t: 0 }]]) ok(!(await can(X.set(`rooms/BBBA/${path}`, v))), what);
  ok(!(await can(X.set('matches/junk', { code: 'BBBA', k: 'friend', ts: TS, u: { 0: 'uidX' }, us: { uidX: 0 }, tr: big }))), 'a match record with a bare trophy value');
  let made = 0;
  for (let i = 0; i < 20; i++) if (await can(X.set(`matches/spam${i}`, { code: 'BBBA', k: 'friend', ts: TS, u: { 0: 'uidX' }, us: { uidX: 0 } }))) made++;
  eq(made, 0, 'one account alone in a lobby cannot pile up match records');
  // with a second player seated a spare record can exist, and either of them may tidy it away
  const Y = await w.client('uidY');
  await Y.set('rooms/BBBA/sl/1', 'uidY');
  ok(await can(X.set('matches/spare', { code: 'BBBA', k: 'friend', ts: TS, u: { 0: 'uidX', 1: 'uidY' }, us: { uidX: 0, uidY: 1 } })));
  ok(await can(Y.remove('matches/spare')), 'the room never went live with it');
});

test('queue: only the owner marks a ticket as "took a bot"; a quick room can claim just the ticket it was made for', async () => {
  const w = world();
  const X = await w.client('uidX');
  await X.set('users/uidX', base('Cheat'));
  const vs = [];
  for (const u of ['uidV1', 'uidV2', 'uidV3']) { const c = await w.client(u); await c.set(`users/${u}`, base('Vic')); await c.set(`queue/${u}`, { tr: 0, ts: TS }); vs.push(c); await w.clock.advance(50); }
  await X.set('queue/uidX', { tr: 0, ts: TS });
  await X.set('host/uidX', 'QQQA');
  await X.set('rooms/QQQA', room('uidX', { q: 'uidV1' }));
  for (const u of ['uidV1', 'uidV2', 'uidV3']) ok(!(await can(X.set(`queue/${u}/m`, { by: u, bot: true }))), `forge the bot marker on ${u}`);
  ok(!(await can(X.set('queue/uidV2/m', { by: 'uidX', code: 'QQQA' }))), 'claim a ticket the room was not made for');
  ok(await can(X.set('queue/uidV1/m', { by: 'uidX', code: 'QQQA' })), 'claim the one it was made for');
  ok(!(await can(X.set('queue/uidV2/m', { by: 'uidX', code: 'QQQA' }))), 'a second ticket into the same room');
  ok(!(await can(X.set('rooms/QQQA/q', 'uidV2'))), 'the room cannot be re-aimed');
  ok(!(await can(vs[1].set('rooms/QQQA/sl/1', 'uidV2'))), 'another player cannot sit down');
  ok(await can(vs[0].set('rooms/QQQA/sl/1', 'uidV1')), 'the claimed one can');
  ok(await can(vs[2].set('queue/uidV3/m', { by: 'uidV3', bot: true })), 'and the owner of a ticket may take a bot');
});

test('one hosted room per account: codes cannot be collected, and an abandoned room is cleared by whoever needs the code', async () => {
  const w = world();
  const X = await w.client('uidX'), V = await w.client('uidV');
  const fr = (h) => room(h, { k: 'friend' });
  ok(!(await can(X.set('rooms/AAAA', fr('uidX')))), 'no room without reserving the code');
  await X.set('host/uidX', 'AAAA');
  ok(await can(X.set('rooms/AAAA', fr('uidX'))));
  ok(!(await can(X.set('rooms/AAAB', fr('uidX')))), 'a second room');
  ok(!(await can(X.set('host/uidX', 'AAAB'))), 'the reservation cannot move while I sit in the first room');
  ok(!(await can(X.remove('host/uidX'))), 'or be forgotten');
  ok(await can(X.remove('rooms/AAAA/sl/0')), 'leave the seat...');
  ok(await can(X.set('host/uidX', 'AAAB')), '...then it can');
  ok(await can(X.set('rooms/AAAB', fr('uidX'))));
  await V.set('host/uidV', 'AAAA');
  ok(!(await can(V.set('rooms/AAAA', fr('uidV')))), 'the abandoned room is still there');
  ok(!(await can(V.remove('rooms/AAAB'))), 'a room somebody sits in cannot be cleared');
  ok(await can(V.remove('rooms/AAAA')), 'but the one nobody sits in can, by anyone');
  ok(await can(V.set('rooms/AAAA', fr('uidV'))), 'and the code is free again');
  eq(await V.get('rooms/AAAA/h'), 'uidV');
});

run('attacks');
