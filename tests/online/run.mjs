// node tests/online/run.mjs [name...] — every online test file, each in its own Node process.
// The files that talk to the hub are run twice: once plainly, once with NET_ECHO=1 (the local adapter
// then imitates the real SDK's optimistic local events, so both behaviours are covered).
// Prints each file's PASS / FAIL lines and exits 0 only when everything passed.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FILES = ['codec', 'verdict', 'hub', 'rules', 'attacks', 'room', 'match', 'four', 'fixes', 'quick', 'botplan', 'channel', 'fire', 'rewards', 'trophy', 'trophy2', 'boards'];
const BOTH_WAYS = new Set(['hub', 'room', 'match', 'four', 'fixes', 'quick', 'trophy', 'trophy2']);
const want = process.argv.slice(2);
const quiet = process.env.NET_QUIET === '1';

let failed = 0;
for (const name of FILES) {
  if (want.length && !want.includes(name)) continue;
  for (const echo of BOTH_WAYS.has(name) ? ['0', '1'] : ['0']) {
    const file = fileURLToPath(new URL(`./${name}.mjs`, import.meta.url));
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, NET_ECHO: echo } });
    const lines = (r.stdout || '').trimEnd().split('\n');
    console.log((quiet && r.status === 0 ? lines.slice(-1) : lines).join('\n'));
    if (r.stderr && r.stderr.trim()) console.log(r.stderr.trimEnd());
    // a test file whose last await never settles exits 0 without its summary line: that is a failure too
    const done = /^OK /.test(lines[lines.length - 1] || '');
    if (r.status === 0 && !done) console.log(`FAILED ${name}: stopped before its summary line (a promise never settled)`);
    if (r.status !== 0 || !done) failed++;
  }
}
console.log(failed ? `\nFAILED: ${failed} test file run(s) failed` : '\nALL ONLINE TESTS PASSED');
process.exit(failed ? 1 : 0);
