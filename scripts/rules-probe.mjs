// Runs the shared table of allowed / denied reads and writes (tests/online/vectors.mjs) and prints it.
//
//   node scripts/rules-probe.mjs            against the local hub (same rule text, virtual clock, instant)
//   node scripts/rules-probe.mjs --live     against the REAL database: signs in anonymously as three
//                                           separate players through the SDK and takes about a minute
//                                           (the table waits real seconds for the time-based rules)
//   --config <file.json>                    use this public firebaseConfig instead of src/online/config.js
//
// Before a --live run the owner must have published config/firebase/database.rules.json in the console.
// The live run leaves a few small records behind (three test profiles named "Probe ...", two match
// records, one day-meter count): the rules deliberately do not let a client delete those.
// Exit code 0 when every row behaved as expected.

import { readFileSync } from 'node:fs';
import { runVectors, printVectors } from '../tests/online/vectors.mjs';
import { firebaseConfig, configured } from '../src/online/config.js';
import { UNVERIFIED } from '../config/firebase/rules.src.mjs';

const args = process.argv.slice(2);
const live = args.includes('--live');
const cfgAt = args.indexOf('--config');

async function local() {
  const { createClock } = await import('../src/online/clock.js');
  const { createHub } = await import('../src/online/localhub.js');
  const { createRules } = await import('../src/online/rulescheck.js');
  const { createLocalTransport } = await import('../src/online/transport-local.js');
  const { rules } = await import('../config/firebase/rules.src.mjs');
  const clock = createClock();
  const hub = createHub({ clock, rules: createRules(rules) });
  const users = {};
  for (const k of ['A', 'B', 'C']) {
    users[k] = createLocalTransport({ hub, uid: `probe${k}`, clock });
    const p = users[k].connect();
    await clock.advance(1);
    await p;
  }
  return { users, wait: (ms) => clock.advance(ms), where: 'the local hub (rulescheck.js over the real rule text)' };
}

async function real() {
  const config = cfgAt >= 0 ? JSON.parse(readFileSync(args[cfgAt + 1], 'utf8')) : firebaseConfig;
  if (!configured(config)) {
    console.log('There is no Firebase config yet: src/online/config.js has an empty apiKey.');
    console.log('Paste the owner\'s firebaseConfig block there (or pass --config file.json) and run again.');
    process.exit(2);
  }
  const { createFireTransport } = await import('../src/online/transport-fire.js');
  const users = {};
  for (const k of ['A', 'B', 'C']) {
    users[k] = createFireTransport(config, { name: `probe-${k}` });
    try {
      const { uid } = await users[k].connect();
      console.log(`signed in player ${k}: ${uid}`);
    } catch (e) {
      console.log(`FAIL could not sign in player ${k}: ${e.code || ''} ${e.message || e}`);
      console.log('Check: Anonymous sign-in is enabled, the database exists, databaseURL is in the config.');
      process.exit(1);
    }
  }
  const offsets = Object.values(users).map((t) => Math.round(t.now() - Date.now()));
  console.log(`clock offsets to the server (ms): ${offsets.join(', ')}`);
  return { users, wait: (ms) => new Promise((r) => setTimeout(r, ms)), where: `the real database ${config.databaseURL}` };
}

const started = Date.now();
const { users, wait, where } = live ? await real() : await local();
console.log(`running the rule vectors against ${where}${live ? ' (about a minute)...' : ''}`);
const results = await runVectors({ A: users.A, B: users.B, C: users.C, wait });
const bad = printVectors(results);
const allowed = results.filter((r) => r.expect === 'allow').length;
console.log(`\n${results.length} vectors (${allowed} must be allowed, ${results.length - allowed} must be denied): ${results.length - bad} as expected, ${bad} not, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (bad && live) {
  console.log('\nA row that is "allowed" but came back denied usually means the real service reads a rule');
  console.log('expression differently from the local checker. The constructs that were never seen working:');
  for (const u of UNVERIFIED) console.log(`  - ${u}`);
}
console.log(bad ? 'FAIL rules probe' : 'PASS rules probe');
process.exit(bad ? 1 : 0);
