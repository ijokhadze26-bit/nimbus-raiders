// node tests/online/trophy.mjs — ranked Quick Match (src/online/ranked.js through the session) over the in-process
// hub with the REAL rules on a virtual clock: the client code itself makes every write (nothing hand-made), the hub
// only seeds profiles through admin (the owner's console). Stakes, claims, draws, closes, the daily limit, the day /
// week edge, a claim left for the next visit, a reload mid-match, the queue, the bt bounds.
import { test, ok, eq, run, world, drive } from './kit.mjs';
import { createSession } from '../../src/online/session.js';
import { createQuick } from '../../src/online/quick.js';
import { createMatch } from '../../src/online/match.js';
import { humanStake, humanGain, botStake, botGain, weekBase, dayOf, TROPHY } from '../../src/online/leagues.js';
import { STAKE_KEY } from '../../src/online/ranked.js';

const PICK = { he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
/** A page's clock: dies with the page (a closed tab runs no timer again). */
const pageClock = (clock) => { const c = { dead: false }; const w = (fn) => () => { if (!c.dead) fn(); }; return Object.assign(c, { now: () => clock.now(), after: (ms, fn) => clock.after(ms, w(fn)), every: (ms, fn) => clock.every(ms, w(fn)) }); };
const until = async (w, fn, ms = 30000, step = 50) => { for (let t = 0; t < ms && !fn(); t += step) await w.clock.advance(step); return fn(); };

/** A signed-in page: its own transport (optionally a skewed clock) and session; `fields` seeded through admin. */
async function page(w, uid, name, { fields, storage = memStore(), skew = 0, net } = {}) {
  const raw = await w.client(uid, net);
  const log = [];
  const tp = Object.assign(Object.create(raw), {
    now: () => raw.now() + skew,
    set: (path, v) => { if (path.startsWith('users/')) log.push({ at: w.clock.now(), v }); return raw.set(path, v); },
  });
  const clock = pageClock(w.clock);
  const session = createSession({ transport: tp, clock, storage, wall: () => w.clock.now() });
  await w.settle((async () => { await session.connect(); if (!session.profile) await session.ensureProfile(name); })(), 12000);
  if (fields) { w.hub.admin.update(Object.fromEntries(Object.entries(fields).map(([k, v]) => [`users/${uid}/${k}`, v]))); await w.settle(session.refresh()); }
  return { raw, tp, session, uid, log, storage, clock, kill() { clock.dead = true; raw.close(); } };
}
const prof = (w, uid) => w.hub.admin.get(`users/${uid}`);
const rk = (w, uid) => w.hub.admin.get(`rk/${uid}`);
const profileDenials = (w) => w.denials.filter((d) => d.writes.some(([p]) => /^(users|rk)\//.test(p)));

/** A bot match on page P: { m, go(), win(t), lose(t) } (the ranked side needs only the match and its result). */
function botMatch(w, P, rivalTr = 0) {
  const m = { kind: 'bot', mid: null, slot: 0, rivalSlot: 1, rivalTr, seed: 7, t0: P.tp.now() + 4000 }; // (the page's own clock, like quickflow)
  P.session.prepare(m);
  return {
    m,
    async go(late = 0) { await w.clock.advance(Math.max(0, m.t0 + late - P.tp.now())); const p = P.session.stake(m); await w.settle(p, 20000); return p; },
    at: (sec) => w.clock.advance(Math.max(0, m.t0 + sec * 1000 - P.tp.now())),
    claim: (result, t) => P.session.claim(m, { result, t, d: Math.round(t * 12), provisional: false }),
  };
}

/** Two pages paired by Quick Match; each stakes at GO, plays (kit drive) and acts on its verdict like quickflow does. */
async function duel(w, A, B, { claimOn = true } = {}) {
  const side = (P) => {
    const s = { P, room: null, link: null, g: null, verdict: null, claim: null };
    s.q = createQuick({ transport: P.tp, profile: P.session.profile, picks: PICK, cfg: P.session.cfg, clock: P.clock });
    s.q.on('paired', (room) => {
      s.room = room;
      room.on('start', () => { if (!s.link) { s.link = createMatch({ transport: P.tp, room, cfg: P.session.cfg, timer: P.clock }); s.g = drive(w, s.link); } });
      room.ready(true);
    });
    return s;
  };
  const a = side(A), b = side(B);
  a.q.start(); await w.clock.advance(100); b.q.start();
  ok(await until(w, () => a.link && b.link, 15000), 'the two pages started a match');
  for (const s of [a, b]) {
    const L = s.link;
    s.m = { kind: 'human', mid: L.mid, slot: L.slot, rivalSlot: 1 - L.slot, rivalTr: 0, seed: L.seed, t0: L.t0 };
    s.P.session.prepare(s.m);
    s.P.clock.after(Math.max(0, L.t0 - w.clock.now()), () => { s.stake = s.P.session.stake(s.m); });
    L.on('verdict', (v) => { s.verdict = v; if (claimOn && !v.provisional) s.claim = s.P.session.claim(s.m, { result: v.result, t: s.g.t, d: s.g.dist(), provisional: false }); });
  }
  const t0 = a.link.t0, mid = a.link.mid;
  return { a, b, t0, mid, to: (sec) => w.clock.advance(Math.max(0, t0 + sec * 1000 - w.clock.now())) };
}

test('human quick match: both stake at GO (s and o from the record), B falls, A claims at stake + 20.5 s, B closes', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha', { fields: { tr: 450, pk: 450 } });
  const B = await page(w, 'uidB', 'Bravo', { fields: { tr: 520, pk: 600, bt: 50 } });
  const d = await duel(w, A, B);
  await d.to(1);
  const pa = prof(w, 'uidA'), pb = prof(w, 'uidB');
  eq([pa.tr, pa.l, pa.st, pa.sk.s, pa.sk.o, pa.sk.b, pa.sk.m, pa.sk.ms, pa.sk.os], [430, 1, 0, 20, 520, false, d.mid, d.a.link.slot, d.b.link.slot], 'A staked');
  eq([pb.tr, pb.l, pb.sk.s, pb.sk.o], [500, 1, 20, 450], 'B staked');
  eq([rk(w, 'uidA'), rk(w, 'uidB')], [430, 500], 'rank mirrors after the stake');
  eq(A.session.ranked.state, 'staked', 'A view');
  const skA = pa.sk.a;
  d.b.g.fallAt(8);
  ok(await until(w, () => d.a.verdict && d.b.verdict, 15000), 'verdicts');
  eq([d.a.verdict.result, d.b.verdict.result], ['win', 'lose'], 'who won');
  eq(A.session.ranked.state, 'saving', 'A shows SAVING... while it waits');
  await w.settle(Promise.all([d.a.claim, d.b.claim]), 30000);
  const win = A.log.find((x) => !x.v.sk && x.v.w === 1);
  ok(win && win.at - skA >= 20000, `A's claim went out ${win && win.at - skA} ms after the stake`);
  ok(!A.log.some((x) => !x.v.sk && x.v.w === 1 && x.at - skA < 20000), 'a claim before 20 s was sent');
  const G = humanGain(450, 520), WK = weekBase(w.clock.now()), DAY = dayOf(w.clock.now());
  const a2 = prof(w, 'uidA'), b2 = prof(w, 'uidB');
  eq(a2, { n: 'Alpha', tr: 450 + G, pk: 450 + G, w: 1, l: 0, st: 1, bs: 1, bt: 90, ws: WK + G, cd: DAY, cc: 1 }, 'A after the claim (bt = OPP.t + 10)');
  eq(b2, { n: 'Bravo', tr: 500, pk: 600, w: 0, l: 1, st: 0, bs: 0, bt: 80, ws: 0, cd: 0, cc: 0 }, 'B after the close (bt = my own record)');
  eq([rk(w, 'uidA'), rk(w, 'uidB')], [450 + G, 500], 'rank mirrors equal tr');
  eq([A.session.ranked.state, A.session.ranked.g, A.session.ranked.tr, B.session.ranked.state, B.session.ranked.g], ['saved', G, 450 + G, 'saved', -20], 'views');
  eq([A.storage.getItem(STAKE_KEY), B.storage.getItem(STAKE_KEY)], [null, null], 'no pending left');
  eq(profileDenials(w).length, 0, 'profile denials: ' + JSON.stringify(profileDenials(w)));
});

test('bot tiers at 0, 9, 299, 300, 700, 1200: stake, win and loss as the SPEC table says', async () => {
  const w = world();
  const tiers = [[0, 0, 28], [9, 9, 28], [299, 10, 28], [300, 20, 20], [700, 12, 12], [1200, 6, 6]];
  for (const [tr, s, gain] of tiers) {
    eq([botStake(tr), botGain(tr)], [s, gain], `table at ${tr}`);
    const W = await page(w, `win${tr}`, 'Winner', { fields: { tr, pk: tr } });
    const bw = botMatch(w, W, tr);
    eq(await bw.go(), { ok: true, reason: null, s }, `stake at ${tr}`);
    eq(prof(w, `win${tr}`).tr, tr - s, `staked at ${tr}`);
    await bw.at(40);
    const r = await w.settle(bw.claim('win', 40), 30000);
    eq([r.ok, r.kind, r.g], [true, 'win', gain], `win at ${tr}`);
    eq([prof(w, `win${tr}`).tr, prof(w, `win${tr}`).w, prof(w, `win${tr}`).l, rk(w, `win${tr}`)], [tr + gain, 1, 0, tr + gain], `after the win at ${tr}`);
    const L = await page(w, `lose${tr}`, 'Loser', { fields: { tr, pk: tr } });
    const bl = botMatch(w, L, tr);
    await bl.go();
    await bl.at(25);
    const r2 = await w.settle(bl.claim('lose', 25), 30000);
    eq([r2.kind, prof(w, `lose${tr}`).tr, prof(w, `lose${tr}`).l, !!prof(w, `lose${tr}`).sk], ['close', tr - s, 1, false], `loss at ${tr}`);
  }
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('a draw (equal fall records) gives both stakes back; a "draw" whose raw records differ is closed', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha', { fields: { tr: 300, pk: 300 } });
  const B = await page(w, 'uidB', 'Bravo', { fields: { tr: 310, pk: 310 } });
  const d = await duel(w, A, B);
  await d.to(12);
  d.a.g.fall(150); d.b.g.fall(150);
  ok(await until(w, () => d.a.verdict && d.b.verdict, 15000), 'verdicts');
  eq([d.a.verdict.result, d.b.verdict.result], ['draw', 'draw'], 'both draw');
  await w.settle(Promise.all([d.a.claim, d.b.claim]), 30000);
  eq([prof(w, 'uidA').tr, prof(w, 'uidA').l, prof(w, 'uidB').tr, prof(w, 'uidB').l, !!prof(w, 'uidA').sk], [300, 0, 310, 0, false], 'stakes back');
  eq([A.session.ranked.state, A.session.ranked.g], ['saved', 0], 'A view');
  eq(profileDenials(w).length, 0, 'no denial for a real draw');
  // the same again, but the distances differ: the rules refuse the draw (rule E), the stake is closed
  for (const x of [d.a, d.b]) { x.g.stop(); x.link.leave(); await w.settle(x.room.leave(), 5000); }
  const d2 = await duel(w, A, B, { claimOn: false });
  await d2.to(12);
  d2.a.g.fall(150); d2.b.g.fall(162);
  ok(await until(w, () => d2.a.verdict && d2.b.verdict, 15000), 'verdicts 2');
  const r = await w.settle(A.session.claim(d2.a.m, { result: 'draw', t: 12, d: 150, provisional: false }), 30000);
  eq([r.kind, prof(w, 'uidA').tr, prof(w, 'uidA').l, !!prof(w, 'uidA').sk], ['close', 280, 1, false], 'a draw the records do not show is closed as a loss');
  eq(profileDenials(w).length, 1, 'exactly the one refused draw');
});

test('a dc forfeit win is claimed (the rival went silent after its stake)', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha');
  const B = await page(w, 'uidB', 'Bravo', { net: { lat: 20 } });
  const d = await duel(w, A, B);
  await d.to(3);
  ok(prof(w, 'uidB').sk, 'B staked');
  d.b.g.stop(); B.raw.net.offline(true); // B's phone loses its connection for good
  ok(await until(w, () => d.a.verdict, 40000), 'A got a verdict');
  eq([d.a.verdict.result, d.a.verdict.reason], ['win', 'dc'], 'a dc win');
  await w.settle(d.a.claim, 30000);
  eq([prof(w, 'uidA').tr, prof(w, 'uidA').w, prof(w, 'uidA').l, !!prof(w, 'uidA').sk], [28, 1, 0, false], 'A won 28 from 0');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('the daily limit: cc 40 before the match -> no stake ("cap"); cc set to 40 after the stake -> closed, "cap"', async () => {
  const w = world();
  const day = dayOf(w.clock.now());
  const A = await page(w, 'uidA', 'Alpha', { fields: { tr: 100, pk: 100, cd: day, cc: 40 } });
  const b = botMatch(w, A, 100);
  eq(await b.go(), { ok: false, reason: 'cap', s: 0 }, 'no stake at the limit');
  eq([prof(w, 'uidA').l, !!prof(w, 'uidA').sk, A.session.ranked.why], [0, false, 'cap'], 'nothing written');
  const C = await page(w, 'uidC', 'Charlie', { fields: { tr: 100, pk: 100, cd: day, cc: 39 } });
  const c = botMatch(w, C, 100);
  eq((await c.go()).ok, true, 'staked at 39');
  w.hub.admin.update({ 'users/uidC/cc': 40 }); // a win in another tab meanwhile
  await c.at(30);
  const r = await w.settle(c.claim('win', 30), 30000);
  eq([r.kind, r.reason, prof(w, 'uidC').tr, prof(w, 'uidC').cc, !!prof(w, 'uidC').sk], ['close', 'cap', 90, 40, false], 'closed at the limit');
  eq([C.session.ranked.state, C.session.ranked.why], ['failed', 'cap'], 'view: DAILY TROPHY LIMIT');
  eq(profileDenials(w).length, 0, 'profile denials (the limit is seen before writing)');
});

test('the week edge (Sunday 23:59 UTC, my clock 25 s behind) and the day edge (my clock 12 s ahead): the retry lands', async () => {
  const w = world({ start: Date.UTC(2026, 10, 29, 23, 59, 30) }); // a Sunday
  const A = await page(w, 'uidA', 'Alpha', { skew: -25000 });
  const a = botMatch(w, A, 0);
  eq((await a.go()).ok, true, 'staked before the week edge');
  await a.at(30);
  const r = await w.settle(a.claim('win', 30), 40000);
  const WK = weekBase(w.clock.now()), DAY = dayOf(w.clock.now());
  eq([r.kind, r.ok, prof(w, 'uidA').ws, prof(w, 'uidA').cd, prof(w, 'uidA').cc], ['win', true, WK + 28, DAY, 1], 'the claim with the new week');
  ok(WK !== weekBase(Date.UTC(2026, 10, 29, 23, 59, 30)), 'a new week began');
  eq(profileDenials(w).length, 1, 'one denial: the first try with the old week');

  const w2 = world({ start: Date.UTC(2026, 10, 24, 23, 59, 30) }); // a Tuesday
  const B = await page(w2, 'uidB', 'Bravo', { skew: 12000 });
  const b = botMatch(w2, B, 0);
  eq((await b.go()).ok, true, 'staked before midnight');
  await b.at(16);
  const r2 = await w2.settle(b.claim('win', 16), 40000);
  ok(w2.clock.now() < Date.UTC(2026, 10, 25), 'the claim landed before midnight on the server');
  eq([r2.ok, prof(w2, 'uidB').cd], [true, dayOf(Date.UTC(2026, 10, 24, 12))], 'the claim with the server\'s day');
  eq(profileDenials(w2).length, 1, 'one denial: the first try with tomorrow');
});

test('a claim offline at the end stays pending; the next visit (settle) claims it', async () => {
  const w = world();
  const store = memStore();
  const A = await page(w, 'uidA', 'Alpha', { storage: store, net: { lat: 20 } });
  const a = botMatch(w, A, 0);
  await a.go();
  await a.at(30);
  A.raw.net.offline(true);
  const r = await w.settle(a.claim('win', 30), 120000);
  eq([r.ok, r.reason, A.session.ranked.state, A.session.ranked.why], [false, 'offline', 'failed', 'pending'], 'left pending');
  ok(prof(w, 'uidA').sk && JSON.parse(store.getItem(STAKE_KEY)).res === 'win', 'the stake and the pending win are kept');
  A.kill();
  await w.clock.advance(TROPHY.liveDeadMs + 1000);
  const A2 = await page(w, 'uidA', 'Alpha', { storage: store });
  const s = await w.settle(A2.session.settle(), 30000);
  eq([s.claimed, prof(w, 'uidA').tr, prof(w, 'uidA').w, prof(w, 'uidA').l, !!prof(w, 'uidA').sk, store.getItem(STAKE_KEY)], [true, 28, 1, 0, false, null], 'claimed on the next visit');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('reload mid-match: a live stamp 1 s old is left alone; 7 s old -> my quit record and the close; the rival wins', async () => {
  const w = world();
  const store = memStore();
  const A = await page(w, 'uidA', 'Alpha', { storage: store });
  const B = await page(w, 'uidB', 'Bravo');
  const d = await duel(w, A, B);
  await d.to(6);
  const slot = d.a.link.slot;
  ok(JSON.parse(store.getItem(STAKE_KEY)).mid === d.mid, 'pending stake written');
  d.a.g.stop(); A.kill(); // the tab is closed (its timers and its connection are gone)
  const A2 = await page(w, 'uidA', 'Alpha', { storage: store });
  const p = JSON.parse(store.getItem(STAKE_KEY));
  store.setItem(STAKE_KEY, JSON.stringify({ ...p, live: w.clock.now() - 1000 }));
  await w.settle(A2.session.settle(), 10000);
  ok(prof(w, 'uidA').sk && !w.hub.admin.get(`matches/${d.mid}/out/${slot}`), 'a fresh stamp: nothing touched');
  store.setItem(STAKE_KEY, JSON.stringify({ ...p, live: w.clock.now() - 7000 }));
  const s = await w.settle(A2.session.settle(), 30000);
  const out = w.hub.admin.get(`matches/${d.mid}/out/${slot}`);
  eq([s.quit, s.closed, out && out.by, !!prof(w, 'uidA').sk, prof(w, 'uidA').l, store.getItem(STAKE_KEY)], [true, true, 'quit', false, 1, null], 'quit record + close');
  ok(await until(w, () => d.b.verdict, 20000), 'B got a verdict');
  await w.settle(d.b.claim, 30000);
  eq([d.b.verdict.result, prof(w, 'uidB').w, prof(w, 'uidB').tr], ['win', 1, 28], 'B claimed the win');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('a new stake waits for the last match\'s claim (PLAY AGAIN before stake + 20 s)', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha', { fields: { tr: 100, pk: 100 } });
  const m1 = botMatch(w, A, 100);
  await m1.go();
  await m1.at(5);
  const c1 = m1.claim('win', 5);              // waits until stake + 20.5 s
  await w.clock.advance(3000);
  const m2 = botMatch(w, A, 100);             // the next match starts 4 s later
  const st2 = m2.go();
  const [r1, r2] = await w.settle(Promise.all([c1, st2]), 40000);
  eq([r1.ok, r1.kind, r2.ok], [true, 'win', true], 'both landed');
  const kinds = A.session.ranked.test.writes.filter((x) => x.kind !== 'rk').map((x) => x.kind);
  eq(kinds, ['stake', 'win', 'stake'], 'the win before the second stake');
  eq([prof(w, 'uidA').tr, prof(w, 'uidA').w, prof(w, 'uidA').l, prof(w, 'uidA').sk.s], [128 - 10, 1, 1, 10], 'the win kept, the new stake on top');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('bt: the bot bound (now - stake + 2 s) and my time are hit exactly; never lower than the old best', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha');
  const a = botMatch(w, A, 0);
  await a.go(3000);                           // the stake landed 3 s after GO
  await a.at(30);
  const sk = prof(w, 'uidA').sk;
  await w.settle(a.claim('win', 30), 30000);
  const cap = Math.floor((w.clock.now() - sk.a + 2000) / 100);
  ok(cap < 300, 'the bound is below my time here');
  const win = A.log.find((x) => !x.v.sk && x.v.w === 1);
  const btWin = prof(w, 'uidA').bt;
  eq(btWin, Math.min(300, Math.floor((win.at - sk.a + 2000) / 100)), 'win bt = the bound');
  const b = botMatch(w, A, 0);
  await b.go();
  await b.at(12);
  await w.settle(b.claim('lose', 12), 30000);
  eq(prof(w, 'uidA').bt, btWin, 'a shorter close keeps the best');
  const C = await page(w, 'uidC', 'Charlie', { fields: { bt: 2000 } });
  const c = botMatch(w, C, 0);
  await c.go();
  await c.at(50);
  await w.settle(c.claim('win', 50), 30000);
  eq(prof(w, 'uidC').bt, 2000, 'an old best of 200 s stays');
  const D = await page(w, 'uidD', 'Delta');
  const e = botMatch(w, D, 0);
  await e.go();
  await e.at(45);
  await w.settle(e.claim('lose', 45), 30000);
  eq(prof(w, 'uidD').bt, 450, 'a bot close raises bt to my time');
  eq(profileDenials(w).length, 0, 'profile denials (no bound exceeded)');
});

run('trophy');
