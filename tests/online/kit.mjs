// Tiny test kit for tests/online/*.mjs: plain Node, no dependencies.
// Each file prints one PASS / FAIL line per test and exits 0 only when every test passed.

import { createClock } from '../../src/online/clock.js';
import { createHub } from '../../src/online/localhub.js';
import { createRules } from '../../src/online/rulescheck.js';
import { createLocalTransport } from '../../src/online/transport-local.js';
import { createSession } from '../../src/online/session.js';
import { shape } from '../../src/online/nettest.js';
import { rules } from '../../config/firebase/rules.src.mjs';

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
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS ${title}: ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${title}: ${t.name}\n     ${e instanceof Fail ? e.message : e.stack}`);
    }
  }
  console.log(`${failed ? 'FAILED' : 'OK'} ${title}: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

export const RULES = createRules(rules);

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
      let tp = createLocalTransport({ hub, uid, clock });
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
