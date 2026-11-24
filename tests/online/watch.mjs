// node tests/online/watch.mjs — the WATCH model (src/online/game/watch.js) on the fake listen link
// (tests/u2/lib/on11link.js): states -> numbers, falls -> places (provisional, then from 'final'), the feed of
// sabotage and emotes, the emote rate limit, silence, stale, dispose, and a link of before stage 5 (no feeds, no
// snapshot) that still works.
import { test, ok, eq, near, run } from './kit.mjs';
import { createWatch, WATCH } from '../../src/online/game/watch.js';
import { createFakeLink } from '../u2/lib/on11link.js';

const ROSTER = [{ slot: 0, name: 'Ann', tr: 120 }, { slot: 1, name: 'Ben', tr: 740 }, { slot: 2, name: 'Cyd', tr: 0 }, { slot: 3, name: 'Dot', tr: 1900 }];
const four = (o = {}) => createFakeLink({ players: ROSTER.map((r, i) => ({ ...r, fallAt: (o.falls || [])[i] ?? Infinity })), ...o });
/** Moves the link's clock and the model's own time together, in frames of 1/20 s. */
function go(link, w, to) {
  while (link.test.t < to - 1e-9) { link.test.to(Math.min(to, link.test.t + 0.1)); w.update(0.05); w.update(0.05); }
}
const P = (w, slot) => w.players.find((p) => p.slot === slot);

test('states become the numbers of every card (eased: no jumps), the clock and the phase', () => {
  const link = four();
  const w = createWatch({ link, roster: ROSTER });
  eq(w.players.map((p) => p.slot), [0, 1, 2, 3]);
  eq([w.final, w.stale, w.phase], [null, false, '']);
  go(link, w, 20);
  const want = link.test.players[1].curve(link.test.players[1].last.t);
  near(P(w, 1).n, want.n, 2, 'squad');
  near(P(w, 1).dist, want.dist, 6, 'distance (eased toward the last state)');
  ok(w.players.every((p) => p.alive && p.place === null && p.silent < 1), 'everyone running');
  near(w.t, 20, 0.01, 'match clock');
  // a jump in the numbers is eased over WATCH.ease, never shown at once
  link.test.set(2, { n: 400 });
  link.test.to(20.6);
  const before = P(w, 2).n;
  w.update(0.05);
  ok(P(w, 2).n > before && P(w, 2).n < 400, `eased: ${before} -> ${P(w, 2).n}`);
  for (let i = 0; i < 40; i++) w.update(0.05);
  eq(P(w, 2).n, 400, 'reaches the target');
  // danger, boss, flags
  link.test.set(3, { danger: 7, flags: 1 | 4, boss: 0.4 });
  link.test.to(21.2); w.update(0.05);
  eq([P(w, 3).danger, P(w, 3).inBoss, P(w, 3).boss, P(w, 3).flags], [7, true, 0.4, 5]);
  link.test.set(3, { flags: 0, boss: 0 });
  link.test.to(21.8); w.update(0.05);
  eq([P(w, 3).inBoss, P(w, 3).boss], [false, 0], 'out of the boss arena');
  // the phase follows the clock
  link.test.to(181); w.update(0.05);
  eq(w.phase, 'sudden');
  link.test.to(271); w.update(0.05);
  eq(w.phase, 'storm');
});

test('falls: OUT with time and metres, provisional places by the order of falls, then the places of final', () => {
  const link = four({ falls: [30, 10, 20, Infinity] });
  const w = createWatch({ link, roster: ROSTER });
  let finals = 0;
  w.on('final', () => finals++);
  go(link, w, 12);
  const b = P(w, 1);
  eq([b.alive, b.T, b.place, b.by], [false, 10, 4, 'dead']);
  eq(b.d, Math.floor(link.test.players[1].curve(10).dist), 'metres');
  go(link, w, 21);
  eq([P(w, 2).place, P(w, 1).place], [3, 4], 'provisional');
  go(link, w, 33);
  eq(finals, 1, "'final' once");
  eq(w.final.map((r) => r.slot), [3, 0, 2, 1]);
  eq(w.players.map((p) => p.place), [2, 4, 3, 1], 'places from final');
  eq(P(w, 3).alive, true, 'the winner is still standing');
  ok(!w.draw);
  // a late model reads link.final at once
  const late = createWatch({ link, roster: ROSTER });
  eq(late.players.map((p) => p.place), [2, 4, 3, 1], 'late model');
});

test('a draw for first: both get place 1 and watch.draw', () => {
  const link = createFakeLink({ players: [{ slot: 0, name: 'Ann' }, { slot: 1, name: 'Ben' }, { slot: 2, name: 'Cyd', fallAt: 5 }] });
  const w = createWatch({ link, roster: ROSTER.slice(0, 3) });
  go(link, w, 8);
  link.test.final([{ slot: 0, T: 8, d: 70, by: 'dead' }, { slot: 1, T: 7.6, d: 70, by: 'dead' }, { slot: 2, T: 5, d: 46, by: 'dead' }]);
  eq([w.draw, P(w, 0).place, P(w, 1).place, P(w, 2).place], [true, 1, 1, 3]);
});

test("the feed: sabotage to one, to everyone, emotes; newest first, at most WATCH.feedMax, each event once", () => {
  const link = four();
  const w = createWatch({ link, roster: ROSTER });
  go(link, w, 5);
  link.test.sab(0, 2, 1);
  link.test.sab(2, 12, -1);
  link.test.emote(1, 3);
  w.update(0.05);
  eq(w.feed.map((l) => [l.k, l.fromName, l.toName, l.what]), [['e', 'Ben', '', 'GG'], ['s', 'Cyd', 'EVERYONE', 'BLACKOUT'], ['s', 'Ann', 'Ben', 'FOG']]);
  eq([w.feed[1].a, w.feed[1].to, w.feed[2].to], [12, -1, 1]);
  eq(P(w, 1).emote && P(w, 1).emote.a, 3, 'the emote bubbles on the sender card');
  // the same event delivered twice (a replay) is one line
  const ev = link.test.events[0];
  link.test.send({ ...ev });
  w.update(0.05);
  eq(w.feed.length, 3, 'deduped by key');
  // junk is ignored: an unknown code, a bad emote, another kind
  link.test.send({ k: 's', a: 99, f: 0, to: 1 });
  link.test.send({ k: 'e', a: 7, f: 0, to: -1 });
  link.test.send({ k: 'x', a: 1, f: 0, to: -1 });
  w.update(0.05);
  eq(w.feed.length, 3, 'junk ignored');
  for (let i = 0; i < 8; i++) { link.test.sab(3, 1, 0); }
  w.update(0.05);
  eq(w.feed.length, WATCH.feedMax);
  eq(w.feed[0].fromName, 'Dot');
});

test('emotes: one a second per sender, the bubble goes after 2.2 s', () => {
  const link = four();
  const w = createWatch({ link, roster: ROSTER });
  go(link, w, 3);
  link.test.emote(2, 0);
  link.test.emote(2, 1);
  link.test.emote(3, 2);
  w.update(0.05);
  eq(w.feed.map((l) => [l.f, l.a]), [[3, 2], [2, 0]], 'the second emote of Cyd inside 1 s is dropped');
  for (let i = 0; i < 20; i++) w.update(0.05);
  link.test.emote(2, 1);
  w.update(0.05);
  eq(P(w, 2).emote.a, 1, 'after a second the next one shows');
  for (let i = 0; i < 46; i++) w.update(0.05);
  eq([P(w, 2).emote, P(w, 3).emote], [null, null], 'gone after WATCH.emoteMs');
});

test('silent: LOST CONNECTION after 3 s with nothing; back again when states come; nothing before GO', () => {
  const link = four();
  const w = createWatch({ link, roster: ROSTER });
  for (let i = 0; i < 10; i++) w.update(0.1);
  ok(w.players.every((p) => p.silent === 0), 'nothing is silence before the match runs');
  go(link, w, 10);
  link.test.silence(2, true);
  go(link, w, 12);
  ok(P(w, 2).silent > 1.5 && P(w, 2).silent < WATCH.silentS, 'not yet: ' + P(w, 2).silent);
  go(link, w, 14);
  ok(P(w, 2).silent >= WATCH.silentS, 'silent: ' + P(w, 2).silent);
  ok(P(w, 1).silent < 1, 'the others are not');
  link.test.silence(2, false);
  go(link, w, 15);
  ok(P(w, 2).silent < 1, 'back: ' + P(w, 2).silent);
});

test("stale: once, the clock stops; the fallen me is OUT from the start (snapshot)", () => {
  const link = four({ slot: 1, falls: [Infinity, 6, Infinity, Infinity] });
  go(link, { update() {} }, 9);
  const w = createWatch({ link, roster: ROSTER });
  const me = P(w, 1);
  eq([me.me, me.alive, me.T, me.place], [true, false, 6, 4], 'my own card from the snapshot');
  ok(P(w, 0).n > 0 && P(w, 2).dist > 0, 'the snapshot gives everyone their numbers at once');
  let stales = 0;
  w.on('stale', () => stales++);
  go(link, w, 12);
  link.test.stale();
  link.test.stale();
  eq([stales, w.stale], [1, true]);
  const t = w.t;
  go(link, w, 14);
  eq(w.t, t, 'frozen clock');
  ok(w.players.every((p) => p.silent === 0), 'no silence counted after the end');
});

test('a spectator link with no feeds / snapshot / final / stale still works; dispose leaves 0 listeners', () => {
  const link = four({ feeds: false, snapshot: false, falls: [Infinity, Infinity, 8, Infinity] });
  delete link.final; delete link.stale;
  go(link, { update() {} }, 4);
  const w = createWatch({ link, roster: ROSTER });
  eq(w.players.map((p) => p.n), [0, 0, 0, 0], 'no snapshot: nothing until the next states');
  go(link, w, 5);
  ok(w.players.every((p) => p.n > 0), 'numbers after the next states');
  link.test.sab(1, 5, 3);
  link.test.emote(0, 0);
  w.update(0.05);
  eq(w.feed.map((l) => l.what), ['THUMBS UP', 'FREEZE'], "'event' brings every event to a spectator");
  go(link, w, 9);
  eq([P(w, 2).alive, P(w, 2).place], [false, 4]);
  ok(link.test.listeners() > 0);
  w.dispose();
  eq(link.test.listeners(), 0, 'every listener removed');
  w.dispose();
  // a link whose on() throws for an unknown type (testlink before stage 5)
  const strict = { slot: null, clock: () => 1, on(type, cb) { if (!['state', 'out', 'event'].includes(type)) throw new Error('unknown ' + type); return () => {}; } };
  const w2 = createWatch({ link: strict, roster: ROSTER.slice(0, 2) });
  w2.update(0.1);
  eq(w2.players.length, 2);
});

test('update(dt) with nothing new sends no change events', () => {
  const link = four();
  const w = createWatch({ link, roster: ROSTER });
  go(link, w, 10);
  let changes = 0;
  w.on('change', () => changes++);
  for (let i = 0; i < 100; i++) w.update(0.016);
  ok(changes <= 2, 'no change events with nothing new: ' + changes);
});

run('watch');
