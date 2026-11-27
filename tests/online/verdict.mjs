// node tests/online/verdict.mjs — who won, from fall records only (pure).
import { test, ok, eq, run } from './kit.mjs';
import { judge, finalPlaces, toRank, rankT10, plausible, humanStake, botStake, botGain, humanGain, drawSlots } from '../../src/online/verdict.js';

const T0 = 1_000_000;
// a fall record as the database holds it: t in tenths, ts = server time of the write
const rec = (tSec, d, by = 'dead', lagMs = 300) => ({ t: Math.round(tSec * 10), d, ts: T0 + tSec * 1000 + lagMs, by });
const rank = (tSec, d, by, lagMs) => toRank(rec(tSec, d, by, lagMs), T0);

test('ranking time is the played time, capped by real time', () => {
  eq(rankT10({ t: 1000, ts: T0 + 100300 }, T0), 1000);
  eq(rankT10({ t: 1000, ts: T0 + 80000 }, T0), 800, 'a played clock ahead of real time is cut back');
  eq(rankT10({ t: 50, ts: T0 - 2000 }, T0), 0, 'never negative');
  eq(toRank({ t: 1234, d: 900, ts: T0 + 130000, by: 'quit' }, T0), { T10: 1234, T: 123.4, d: 900, by: 'quit' });
});

test('2 players: win once I am 1.1 s past the rival', () => {
  const outs = { 1: rank(100, 1500) };
  eq(judge({ me: 0, slots: [0, 1], outs, liveT10: { 0: 1005 } }), null, 'inside the tie window: wait');
  eq(judge({ me: 0, slots: [0, 1], outs, liveT10: { 0: 1010 } }), null, 'exactly 1.0 s: still wait');
  const v = judge({ me: 0, slots: [0, 1], outs, liveT10: { 0: 1011 } });
  eq(v.result, 'win'); eq(v.place, 1); eq(v.reason, 'standing');
  eq(v.places, [{ slot: 0, T: null, d: null, by: null }, { slot: 1, T: 100, d: 1500, by: 'dead' }]);
});

test('2 players: lose once the rival is seen past my time', () => {
  const outs = { 0: rank(100, 1500) };
  eq(judge({ me: 0, slots: [0, 1], outs, liveT10: { 1: 1008 } }), null, 'rival may still fall inside the window');
  const v = judge({ me: 0, slots: [0, 1], outs, liveT10: { 1: 1011 } });
  eq(v.result, 'lose'); eq(v.place, 2); eq(v.reason, 'fell');
  eq(v.places[0], { slot: 1, T: null, d: null, by: null });
});

test('both fall within 1 s: further distance wins, for both screens alike', () => {
  const outs = { 0: rank(100, 1500), 1: rank(100.8, 1490) };
  const a = judge({ me: 0, slots: [0, 1], outs });
  const b = judge({ me: 1, slots: [0, 1], outs });
  eq([a.result, a.place, a.reason], ['win', 1, 'distance']);
  eq([b.result, b.place, b.reason], ['lose', 2, 'distance']);
  eq(a.places, b.places, 'same table on both screens');
  eq(a.places.map((p) => p.slot), [0, 1]);
});

test('exactly 1.0 s apart still counts as a tie; 1.1 s does not', () => {
  const tie = judge({ me: 0, slots: [0, 1], outs: { 0: rank(100, 1500), 1: rank(101, 1400) } });
  eq([tie.result, tie.reason], ['win', 'distance']);
  const late = judge({ me: 0, slots: [0, 1], outs: { 0: rank(100, 1500), 1: rank(101.1, 1400) } });
  eq([late.result, late.reason], ['lose', 'fell']);
});

test('same second, same distance: draw', () => {
  const outs = { 0: rank(100, 1500), 1: rank(100.4, 1500) };
  const a = judge({ me: 0, slots: [0, 1], outs });
  const b = judge({ me: 1, slots: [0, 1], outs });
  eq([a.result, a.place, a.reason], ['draw', 1, 'draw']);
  eq([b.result, b.place, b.reason], ['draw', 1, 'draw']);
});

test('disconnect: the rival was closed by a dc record', () => {
  const outs = { 1: rank(60, 800, 'dc', 13000) };
  const v = judge({ me: 0, slots: [0, 1], outs, liveT10: { 0: 730 } });
  eq([v.result, v.reason], ['win', 'dc']);
});

test('disconnect: my own seat was closed while I was away', () => {
  const v = judge({ me: 0, slots: [0, 1], outs: { 0: rank(60, 800, 'dc', 13000) }, liveT10: { 1: 0 } });
  eq([v.result, v.place, v.reason], ['lose', 2, 'dc'], 'no tie window to wait for');
});

test('quit: the rival left', () => {
  const v = judge({ me: 0, slots: [0, 1], outs: { 1: rank(30, 400, 'quit') }, liveT10: { 0: 500 } });
  eq([v.result, v.reason], ['win', 'quit']);
  const me = judge({ me: 1, slots: [0, 1], outs: { 1: rank(30, 400, 'quit') }, liveT10: { 0: 500 } });
  eq([me.result, me.reason], ['lose', 'quit']);
});

test('a quit inside the tie window follows the same rule', () => {
  const outs = { 0: rank(100, 1500, 'quit'), 1: rank(100.5, 1400) };
  const quitter = judge({ me: 0, slots: [0, 1], outs });
  eq(quitter.result, 'win', 'the rule is time then distance, whoever wrote the record');
  const other = judge({ me: 1, slots: [0, 1], outs });
  eq([other.result, other.reason], ['lose', 'distance']);
});

test('nothing is decided while a rival is still running', () => {
  eq(judge({ me: 0, slots: [0, 1], outs: {}, liveT10: { 0: 999, 1: 999 } }), null);
  eq(judge({ me: 0, slots: [0, 1, 2], outs: { 1: rank(50, 700) }, liveT10: { 0: 999, 2: 100 } }), null);
});

test('4 players: places by time, last one standing wins', () => {
  const slots = [0, 1, 2, 3];
  const outs = { 3: rank(40, 500), 1: rank(90, 1300), 0: rank(120, 1800) };
  const liveT10 = { 2: 1300 };
  const first = judge({ me: 2, slots, outs, liveT10 });
  eq([first.result, first.place], ['win', 1]);
  eq(first.places.map((p) => p.slot), [2, 0, 1, 3]);
  eq(judge({ me: 0, slots, outs, liveT10 }).place, 2);
  eq(judge({ me: 1, slots, outs, liveT10 }).place, 3);
  eq(judge({ me: 3, slots, outs, liveT10 }).place, 4);
  eq(judge({ me: 3, slots, outs, liveT10 }).result, 'lose');
  eq(finalPlaces({ slots, outs, liveT10 }).map((p) => p.slot), [2, 0, 1, 3]);
});

test('4 players: a fallen player waits only for those who may still tie with them', () => {
  const slots = [0, 1, 2, 3];
  const outs = { 3: rank(40, 500) };
  eq(judge({ me: 3, slots, outs, liveT10: { 0: 405, 1: 420, 2: 420 } }), null, 'slot 0 not yet past my window');
  const v = judge({ me: 3, slots, outs, liveT10: { 0: 411, 1: 420, 2: 420 } });
  eq([v.result, v.place], ['lose', 4]);
  eq(finalPlaces({ slots, outs, liveT10: { 0: 411, 1: 420, 2: 420 } }), null, 'the full table is not final yet');
});

test('4 players: only first place uses the tie rule', () => {
  const slots = [0, 1, 2, 3];
  // 2 and 0 fall 0.5 s apart at the end (distance decides), 1 and 3 fall 0.5 s apart earlier (time decides)
  const outs = { 3: rank(40, 900), 1: rank(40.5, 600), 0: rank(120, 1700), 2: rank(120.5, 1650) };
  const places = finalPlaces({ slots, outs });
  eq(places.map((p) => p.slot), [0, 2, 1, 3]);
  eq(judge({ me: 0, slots, outs }).result, 'win');
  eq(judge({ me: 0, slots, outs }).reason, 'distance');
  eq(judge({ me: 2, slots, outs }).place, 2);
  eq(judge({ me: 1, slots, outs }).place, 3, 'slot 1 outlasted slot 3 by time, although 3 went further');
  eq(judge({ me: 3, slots, outs }).place, 4);
});

test('4 players: a three-way tie at the top goes to the furthest', () => {
  const slots = [0, 1, 2];
  const outs = { 0: rank(100, 1500), 1: rank(100.5, 1600), 2: rank(100.9, 1550) };
  eq(finalPlaces({ slots, outs }).map((p) => p.slot), [1, 2, 0]);
  eq(judge({ me: 1, slots, outs }).result, 'win');
  eq(judge({ me: 2, slots, outs }).place, 2);
});

test('3-4 players: equal distance inside 1 s for first is a draw for both, everyone else by time', () => {
  const slots = [0, 1, 2, 3];
  const outs = { 3: rank(30, 400), 2: rank(30.4, 300), 0: rank(90, 1200), 1: rank(90.6, 1200) };
  eq(finalPlaces({ slots, outs }).map((p) => p.slot), [0, 1, 2, 3], 'the draw lists the lower seat first');
  const a = judge({ me: 0, slots, outs }), b = judge({ me: 1, slots, outs });
  eq([a.result, a.place, a.reason, b.result, b.place, b.reason], ['draw', 1, 'draw', 'draw', 1, 'draw']);
  eq(a.places, b.places, 'one table');
  eq([judge({ me: 2, slots, outs }).place, judge({ me: 3, slots, outs }).place], [3, 4], '0.4 s apart below first: time decides');
  // three players: the draw for first waits for nobody once all three fell
  const three = { 2: rank(10, 90), 0: rank(50, 600), 1: rank(50.9, 600) };
  eq([judge({ me: 0, slots: [0, 1, 2], outs: three }).result, judge({ me: 2, slots: [0, 1, 2], outs: three }).place], ['draw', 3]);
});

test('3-4 players: the same time below first place goes to the further one, then the lower seat', () => {
  const slots = [0, 1, 2, 3];
  const outs = { 1: rank(20, 200), 3: rank(20, 260), 2: rank(20, 260), 0: rank(70, 900) };
  eq(finalPlaces({ slots, outs }).map((p) => p.slot), [0, 2, 3, 1]);
});

test('plausibility: a stream that cannot be real', () => {
  const s = (t, dist, n = 50) => ({ t, dist, n });
  eq(plausible(null, s(10, 150), 10.2), null);
  eq(plausible(s(10, 150), s(10.3, 155), 10.5), null);
  eq(plausible(null, s(150, 2000), -3), 'time-ahead', 'left over from another round');
  eq(plausible(s(100, 1500), s(100.3, 1750), 100.5), 'speed');
  eq(plausible(s(10, 150), s(9, 150), 10.5), 'time-back');
  eq(plausible(null, s(10, 150, 5000), 10.2), 'squad');
  eq(plausible(null, s(10, 5000), 10.2), 'distance');
});

test('plausibility: an honest rival on SPEED UP late in a match is never suspect, 32 u/s is', () => {
  const s = (t, dist, n = 50) => ({ t, dist, n });
  // 200 s in at an average 12 u/s, then 5 s of SPEED UP at 25 u/s with bundles 2 s apart (a slow phone network)
  let prev = s(200, 2400), why = [];
  for (let t = 202; t <= 206; t += 2) { const next = s(t, prev.dist + 25 * 2); why.push(plausible(prev, next, t + 0.2)); prev = next; }
  eq(why, [null, null, null], '25 u/s in 2 s bundles');
  // the same with the usual 0.25 s bundles
  prev = s(200, 2400); why = [];
  for (let k = 1; k <= 20; k++) { const next = s(200 + k * 0.25, prev.dist + 25 * 0.25); why.push(plausible(prev, next, next.t + 0.2)); prev = next; }
  ok(why.every((w) => w === null), '25 u/s in 0.25 s bundles: ' + why.join());
  // 32 u/s sustained: too fast from one bundle to the next, and over the whole run
  prev = s(200, 2400); why = [];
  for (let t = 202; t <= 206; t += 2) { const next = s(t, prev.dist + 32 * 2); why.push(plausible(prev, next, t + 0.2)); prev = next; }
  eq(why, ['speed', 'speed', 'speed'], '32 u/s in 2 s bundles');
  eq(plausible(s(99.75, 32 * 99.75), s(100, 3200), 100.2), 'distance', '32 u/s from the start');
});

test('drawSlots: every seat sharing first place, in tenths, as the verdict decides it', () => {
  // a three-way draw: three falls at the same moment and distance (the 4th fell earlier)
  const outs3 = { 0: rank(8, 72), 1: rank(8, 72), 2: rank(8, 72), 3: rank(6, 58) };
  const fin3 = finalPlaces({ slots: [0, 1, 2, 3], outs: outs3 });
  eq(drawSlots(fin3), [0, 1, 2], 'three share first');
  eq(judge({ me: 2, slots: [0, 1, 2, 3], outs: outs3 }).result, 'draw', 'and the verdict says draw for the third one');
  // exactly 1.0 s apart at equal metres is a draw by the verdict: the float 2.2 - 1.2 must not break it
  for (const [a, b] of [[2.2, 1.2], [4.4, 3.4], [8.3, 7.3], [16.6, 15.6], [32.7, 31.7], [64.9, 63.9], [128.8, 127.8]]) {
    const outs = { 0: rank(a, 40), 1: rank(b, 40), 2: rank(0.5, 5) };
    const fin = finalPlaces({ slots: [0, 1, 2], outs });
    eq(judge({ me: 1, slots: [0, 1, 2], outs }).result, 'draw', `verdict draw ${a}/${b}`);
    eq(drawSlots(fin), [0, 1], `drawSlots ${a}/${b}`);
  }
  eq(drawSlots(finalPlaces({ slots: [0, 1, 2], outs: { 0: rank(9, 80), 1: rank(9.5, 79), 2: rank(3, 20) } })), [], 'further distance wins: no draw');
  eq(drawSlots(finalPlaces({ slots: [0, 1, 2], outs: { 1: rank(9, 80), 2: rank(9, 80) }, liveT10: { 0: 120 } })), [], 'somebody still standing: no draw');
  eq(drawSlots([]), []);
});

test('trophy maths matches the table in the design', () => {
  eq([humanStake(0), humanStake(7), humanStake(10), humanStake(299), humanStake(300)], [0, 7, 10, 10, 20]);
  eq([botStake(100), botStake(300), botStake(700), botStake(1200)], [10, 20, 12, 6]);
  eq([botGain(100), botGain(300), botGain(700), botGain(1200)], [28, 20, 12, 6]);
  eq([humanGain(500, 500), humanGain(500, 1500), humanGain(1500, 500), humanGain(500, 550)], [28, 40, 2, 30]);
});

run('verdict');
