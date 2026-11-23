// node tests/online/trophy2.mjs — ranked Quick Match (src/online/ranked.js), the stage-4 review fixes, over the
// in-process hub with the REAL rules on a virtual clock (same set-up as trophy.mjs):
//   - a pending WIN is never lost: a page closed on its result screen (its stamp still fresh at the next visit) is
//     claimed a moment later; a next stake that meets a dead page's win claims it first; a claim that gave up
//     offline is tried again when the line comes back
//   - a stake write that timed out but landed later is adopted (one stake, the streak kept), also after the window
//   - the rival's trophy tag comes only from the rival's own stake of this match (none when they did not stake)
import { test, ok, eq, run, world, drive } from './kit.mjs';
import { createSession } from '../../src/online/session.js';
import { createQuick } from '../../src/online/quick.js';
import { createMatch } from '../../src/online/match.js';
import { humanStake, botStake, botGain, dayOf, TROPHY } from '../../src/online/leagues.js';
import { STAKE_KEY } from '../../src/online/ranked.js';

const PICK = { he: 'pip', we: 'thunderclap', hs: 'classic', ws: 'factory' };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const pageClock = (clock) => { const c = { dead: false }; const w = (fn) => () => { if (!c.dead) fn(); }; return Object.assign(c, { now: () => clock.now(), after: (ms, fn) => clock.after(ms, w(fn)), every: (ms, fn) => clock.every(ms, w(fn)) }); };
const until = async (w, fn, ms = 30000, step = 50) => { for (let t = 0; t < ms && !fn(); t += step) await w.clock.advance(step); return fn(); };

/** A signed-in page; `beforeSet(path, v)` runs before each write leaves (the test drops the line there). */
async function page(w, uid, name, { fields, storage = memStore(), net, beforeSet } = {}) {
  const raw = await w.client(uid, net);
  const tp = Object.assign(Object.create(raw), { set: (path, v) => { if (beforeSet) beforeSet(path, v); return raw.set(path, v); } });
  const clock = pageClock(w.clock);
  const session = createSession({ transport: tp, clock, storage, wall: () => w.clock.now() });
  await w.settle((async () => { await session.connect(); if (!session.profile) await session.ensureProfile(name); })(), 12000);
  if (fields) { w.hub.admin.update(Object.fromEntries(Object.entries(fields).map(([k, v]) => [`users/${uid}/${k}`, v]))); await w.settle(session.refresh()); }
  return { raw, tp, session, uid, storage, clock, kill() { clock.dead = true; raw.close(); } };
}
const prof = (w, uid) => w.hub.admin.get(`users/${uid}`);
const nums = (p) => ({ tr: p.tr, w: p.w, l: p.l, st: p.st, sk: !!p.sk });
const profileDenials = (w) => w.denials.filter((d) => d.writes.some(([p]) => /^(users|rk)\//.test(p)));
const kinds = (P) => P.session.ranked.test.writes.filter((x) => x.kind !== 'rk' && x.ok).map((x) => x.kind);

function botMatch(w, P, rivalTr = 0) {
  const m = { kind: 'bot', mid: null, slot: 0, rivalSlot: 1, rivalTr, seed: 7, t0: P.tp.now() + 4000 };
  P.session.prepare(m);
  return {
    m,
    async go() { await w.clock.advance(Math.max(0, m.t0 - P.tp.now())); const p = P.session.stake(m); await w.settle(p, 30000); return p; },
    at: (sec) => w.clock.advance(Math.max(0, m.t0 + sec * 1000 - P.tp.now())),
    claim: (result, t) => P.session.claim(m, { result, t, d: Math.round(t * 12), provisional: false }),
  };
}

test('a page closed on its result screen before stake + 20.5 s: the next visit claims the win once the stamp is dead', async () => {
  const w = world();
  const store = memStore();
  const A = await page(w, 'uidA', 'Alpha', { storage: store, fields: { tr: 100, pk: 100 } });
  await w.settle(A.session.settle());
  const a = botMatch(w, A, 100);
  await a.go();
  await a.at(12);
  a.claim('win', 12);                          // waits for stake + 20.5 s ...
  await w.clock.advance(1000);
  ok(JSON.parse(store.getItem(STAKE_KEY)).res === 'win', 'the pending win is written');
  A.kill();                                    // ... but the tab is reloaded on the result screen
  await w.clock.advance(3000);
  const A2 = await page(w, 'uidA', 'Alpha', { storage: store });
  const s = await w.settle(A2.session.settle(), 10000);
  eq([s.claimed, !!prof(w, 'uidA').sk], [false, true], 'the stamp is still fresh: left alone at first');
  ok(await until(w, () => !prof(w, 'uidA').sk, 30000), 'claimed a moment later (no new ONLINE tap)');
  eq(nums(prof(w, 'uidA')), { tr: 100 + botGain(100), w: 1, l: 0, st: 1, sk: false }, 'the win stands');
  const b = botMatch(w, A2, 100);
  eq((await b.go()).ok, true, 'the next match is ranked');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('a next stake that meets a dead page\'s pending win claims it first, then stakes', async () => {
  const w = world();
  const store = memStore();
  const A = await page(w, 'uidA', 'Alpha', { storage: store, fields: { tr: 100, pk: 100 } });
  const a = botMatch(w, A, 100);
  await a.go();
  await a.at(12);
  a.claim('win', 12);
  await w.clock.advance(1000);
  A.kill();
  await w.clock.advance(TROPHY.liveDeadMs + 1000);
  const A2 = await page(w, 'uidA', 'Alpha', { storage: store }); // (no settle: straight into the next match)
  const b = botMatch(w, A2, 100);
  const r = await b.go();
  eq([r.ok, r.s], [true, botStake(100 + botGain(100))], 'the new stake landed');
  eq(kinds(A2), ['win', 'stake'], 'the old win first');
  eq(nums(prof(w, 'uidA')), { tr: 128 - botStake(128), w: 1, l: 1, st: 0, sk: true }, 'win kept, new stake on top');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('a claim that gave up offline is tried again when the line comes back; the next stake is not "busy"', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha', { net: { lat: 20 }, fields: { tr: 100, pk: 100 } });
  await w.settle(A.session.settle());
  const a = botMatch(w, A, 100);
  await a.go();
  await a.at(25);
  A.raw.net.offline(true);
  const r = await w.settle(a.claim('win', 25), 120000);
  eq([r.ok, A.session.ranked.state, A.session.ranked.why], [false, 'failed', 'pending'], 'gave up offline');
  A.raw.net.offline(false);
  ok(await until(w, () => !prof(w, 'uidA').sk, 30000), 'claimed when the line came back');
  eq(nums(prof(w, 'uidA')), { tr: 128, w: 1, l: 0, st: 1, sk: false }, 'the win stands');
  ok(await until(w, () => A.session.ranked.state === 'saved', 5000), 'the view says saved: ' + A.session.ranked.state);
  const b = botMatch(w, A, 128);
  eq((await b.go()).ok, true, 'the next match is ranked');
  eq(profileDenials(w).length, 0, 'profile denials');
});

/** The line drops just as the stake write leaves and comes back `backMs` later (the write was queued, it lands then). */
async function lateStake(backMs) {
  const w = world();
  let drop = true, A = null;
  const beforeSet = (path, v) => { if (drop && path === 'users/uidA' && v && v.sk) { drop = false; A.raw.net.offline(true); w.clock.after(backMs, () => A.raw.net.offline(false)); } };
  A = await page(w, 'uidA', 'Alpha', { net: { lat: 20 }, beforeSet, fields: { tr: 400, pk: 400, w: 3, st: 3, bs: 3 } });
  await w.settle(A.session.settle());
  const a = botMatch(w, A, 400);
  const st = await a.go();
  await a.at(40);
  const c = await w.settle(a.claim('win', 40), 60000);
  return { w, A, st, c };
}

test('a stake write that timed out but landed 8.5 s later is adopted: one stake, the win and the streak kept', async () => {
  const { w, A, st, c } = await lateStake(8500);
  eq([st.ok, st.s], [true, botStake(400)], 'the stake is this match\'s (adopted, not written twice)');
  eq(kinds(A), ['win'], 'no second stake went out (the first one landed late)');
  eq([c.ok, c.kind], [true, 'win'], 'the win is claimed');
  eq(nums(prof(w, 'uidA')), { tr: 400 + botGain(400), w: 4, l: 0, st: 4, sk: false }, 'tr, wins, losses and the streak');
  eq(profileDenials(w).length, 0, 'profile denials');
});

test('a stake that landed only after the stake window (20 s): UNRANKED at first, the verdict adopts it and claims the win', async () => {
  const { w, A, st, c } = await lateStake(20000);
  eq([st.ok, st.reason], [false, 'offline'], 'unranked at GO + 10 s');
  eq([c.ok, c.kind], [true, 'win'], 'the verdict found the stake and claimed the win');
  eq(nums(prof(w, 'uidA')), { tr: 400 + botGain(400), w: 4, l: 0, st: 4, sk: false }, 'the win stands');
  eq([A.session.ranked.state, A.session.ranked.g], ['saved', botGain(400)], 'the view');
  eq(profileDenials(w).length, 0, 'profile denials');
});

/** Two pages paired by Quick Match; each stakes at GO (unless `noStake`) with the rival's uid, like quickflow. */
async function duel(w, A, B) {
  const side = (P) => {
    const s = { P, room: null, link: null, g: null };
    s.q = createQuick({ transport: P.tp, profile: P.session.profile, picks: PICK, cfg: P.session.cfg, clock: P.clock });
    s.q.on('paired', (room) => { s.room = room; room.on('start', () => { if (!s.link) { s.link = createMatch({ transport: P.tp, room, cfg: P.session.cfg, timer: P.clock }); s.g = drive(w, s.link); } }); room.ready(true); });
    return s;
  };
  const a = side(A), b = side(B);
  a.q.start(); await w.clock.advance(100); b.q.start();
  ok(await until(w, () => a.link && b.link, 15000), 'the two pages started a match');
  for (const [s, o] of [[a, b], [b, a]]) {
    const L = s.link;
    s.m = { kind: 'human', mid: L.mid, slot: L.slot, rivalSlot: 1 - L.slot, rivalTr: 0, rivalUid: o.P.uid, seed: L.seed, t0: L.t0 };
    s.P.session.prepare(s.m);
    s.P.clock.after(Math.max(0, L.t0 - w.clock.now()), () => { s.stake = s.P.session.stake(s.m); });
  }
  return { a, b, to: (sec) => w.clock.advance(Math.max(0, a.link.t0 + sec * 1000 - w.clock.now())) };
}

test('the rival tag: from the rival\'s own stake (their tr0 and o); none for a rival who did not stake (daily limit)', async () => {
  const w = world();
  const A = await page(w, 'uidA', 'Alpha', { fields: { tr: 450, pk: 450 } });
  const B = await page(w, 'uidB', 'Bravo', { fields: { tr: 520, pk: 600 } });
  const d = await duel(w, A, B);
  await d.to(6);
  eq([A.session.ranked.ro, B.session.ranked.ro], [{ tr0: 520, o: 450 }, { tr0: 450, o: 520 }], 'each side saw the other\'s stake');
  ok(humanStake(520) > 0, 'B staked something');
  for (const s of [d.a, d.b]) s.g.stop();
  const w2 = world();
  const day = dayOf(w2.clock.now());
  const C = await page(w2, 'uidC', 'Charlie', { fields: { tr: 450, pk: 450 } });
  const D = await page(w2, 'uidD', 'Delta', { fields: { tr: 520, pk: 520, cd: day, cc: 40 } });
  const e = await duel(w2, C, D);
  await e.to(30);
  eq([C.session.ranked.state, D.session.ranked.why, C.session.ranked.ro], ['staked', 'cap', null], 'D did not stake: C sees no stake of D');
  for (const s of [e.a, e.b]) s.g.stop();
});

run('trophy2');
