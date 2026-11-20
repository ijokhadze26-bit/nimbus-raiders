// Tiny test kit for tests/online/*.mjs: plain Node, no dependencies.
// Each file prints one PASS / FAIL line per test and exits 0 only when every test passed.

import { createClock } from '../../src/online/clock.js';
import { createHub } from '../../src/online/localhub.js';
import { createRules } from '../../src/online/rulescheck.js';
import { createLocalTransport } from '../../src/online/transport-local.js';
import { createSession } from '../../src/online/session.js';
import { shape } from '../../src/online/nettest.js';
import { rules } from '../../config/firebase/rules.src.mjs';
import { createRoom, joinRoom } from '../../src/online/room.js';
import { createMatch } from '../../src/online/match.js';

const tests = [];
export const test = (name, fn) => tests.push({ name, fn });

export class Fail extends Error {}
export function ok(cond, msg) { if (!cond) throw new Fail(msg || 'expected a true value'); }
export function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Fail(`${msg ? `${msg}: ` : ''}got ${ja}, wanted ${jb}`);
}
export function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Fail(`${msg ? `${msg}: ` : ''}got ${a}, wanted ${b} +- ${tol}`);
}

export async function run(title) {
  let failed = 0, current = '', finished = false;
  // an await that never settles lets Node exit quietly with code 0: make that a loud failure
  process.on('exit', () => {
    if (finished) return;
    console.log(`FAILED ${title}: stopped inside "${current}" (a promise never settled)`);
    process.exitCode = 1;
  });
  for (const t of tests) {
    current = t.name;
    try {
      await t.fn();
      console.log(`PASS ${title}: ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${title}: ${t.name}\n     ${e instanceof Fail ? e.message : e.stack}`);
    }
  }
  finished = true;
  console.log(`${failed ? 'FAILED' : 'OK'} ${title}${ECHO ? ' (echo)' : ''}: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

export const RULES = createRules(rules);

/** NET_ECHO=1 runs the same tests with the local adapter imitating the real SDK's optimistic events. */
export const ECHO = process.env.NET_ECHO === '1';

/** A hub on a virtual clock with the real rules, plus helpers to add signed-in players. */
export function world({ withRules = true, dropMs = 5000, start } = {}) {
  const clock = createClock(start);
  const hub = createHub({ clock, rules: withRules ? RULES : null, dropMs });
  const denials = [];
  hub.onDeny = (d) => denials.push(d);
  const w = {
    clock, hub, denials,
    /** A connected transport for `uid`; `net` ({ lat, jit, loss }) wraps it in the slow-network shim. */
    async client(uid, net) {
      let tp = createLocalTransport({ hub, uid, clock, echo: ECHO });
      if (net) tp = shape(tp, { clock, seed: uid.length * 7919 + 13, ...net });
      const p = tp.connect();
      await clock.advance(1);
      await p;
      return tp;
    },
    /** A signed-in player with a profile: { tp, session, uid, profile }. */
    async player(uid, name, net) {
      const tp = await w.client(uid, net);
      const session = createSession({ transport: tp });
      const p = (async () => { await session.connect(); return session.ensureProfile(name); })();
      await w.settle(p, 12000);
      const made = await p;
      if (!made.ok) throw new Fail(`profile for ${uid}: ${made.reason}`);
      return { tp, session, uid, profile: made.profile };
    },
    /** Advance the clock until `promise` settles (or `maxMs` of virtual time has passed). */
    async settle(promise, maxMs = 2000, stepMs = 25) {
      let done = false;
      promise.then(() => { done = true; }, () => { done = true; });
      for (let t = 0; t < maxMs && !done; t += stepMs) await clock.advance(stepMs);
      if (!done) throw new Fail('a promise did not settle in time');
      return promise;
    },
  };
  return w;
}

// ---------------------------------------------------------------- whole matches (match.mjs, fixes.mjs)
export const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

/** A stand-in game: pushes samples on its played clock, records everything the link tells it. */
export function drive(w, link, { speed = 12, lane = (t) => Math.sin(t) * 3 } = {}) {
  const g = { link, t: 0, alive: true, states: [], outs: [], peer: [], events: [], status: [], verdict: null, verdictAt: null, final: null, speed };
  link.on('state', (slot, s) => g.states.push({ slot, s, at: link.clock() }));
  link.on('out', (slot, o) => g.outs.push({ slot, ...o }));
  link.on('peer', (slot, p) => g.peer.push({ slot, ...p }));
  link.on('event', (e) => g.events.push(e));
  link.on('status', (s) => g.status.push(s));
  link.on('final', (f) => { g.final = f.places; });
  link.on('verdict', (v) => { g.verdict = v; g.verdictAt = link.clock(); g.alive = false; });
  g.dist = () => g.speed * g.t;
  g.stop = w.clock.every(100, () => {
    if (!g.alive || link.clock() < 0) return;
    g.t = Math.floor(link.clock() * 10 + 1e-6) / 10; // an honest played clock: never ahead of real time
    link.push({ t: g.t, dist: g.dist(), n: 40, form: 1, flags: 0, boss: 0, zone: 0, charge: 7, danger: 2, x: lane(g.t) });
  });
  /** Wipe out now (or with a given distance). */
  g.fall = (d = g.dist(), by = 'dead') => { if (!g.alive) return; g.alive = false; link.fall({ t: g.t, d, by }); };
  /** Fall when the played clock reaches `at` seconds. */
  g.fallAt = (at, d) => { const off = w.clock.every(20, () => { if (g.t >= at - 1e-9) { off(); g.fall(d); } }); };
  return g;
}

/** N players in one room, everyone ready, links made at 'start'. nets[i] = { lat, jit, loss } per player. */
export async function arena(w, n = 2, { nets = [], cfg, noLink = [] } = {}) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await w.player(`uid${'ABCD'[i]}`, NAMES[i], nets[i]));
  const rooms = [await w.settle(createRoom({ transport: ps[0].tp, profile: ps[0].profile, max: n > 2 ? 4 : 2, clock: w.clock }), 8000)];
  for (const p of ps.slice(1)) rooms.push(await w.settle(joinRoom({ transport: p.tp, code: rooms[0].code, profile: p.profile, clock: w.clock }), 8000));
  const games = [];
  const begin = (i) => rooms[i].on('start', () => {
    if (noLink.includes(i)) return;
    const link = createMatch({ transport: ps[i].tp, room: rooms[i], cfg: cfg || ps[i].session.cfg, timer: w.clock });
    games[i] = drive(w, link);
  });
  rooms.forEach((_, i) => begin(i));
  await w.settle(Promise.all(rooms.map((r) => r.ready(true))), 8000);
  const wanted = n - noLink.length;
  for (let i = 0; i < 300 && games.filter(Boolean).length < wanted; i++) await w.clock.advance(50);
  const t0 = rooms[0].state.t0;
  ok(t0 && games.filter(Boolean).length === wanted, 'the match started');
  return { ps, rooms, games, t0, code: rooms[0].code, mid: rooms[0].state.mid,
    /** the slow-network switch of player i (needs a nets[i] entry) */
    net: (i) => ps[i].tp.net,
    /** advance to `sec` seconds on the match clock */
    to: (sec) => w.clock.advance(Math.max(0, t0 + sec * 1000 - w.clock.now())) };
}
