// Two-window tests of online play: `node scripts/duo.mjs [filter...]` (package.json: "test:duo").
// Starts the game (dev server, or the production build with --preview), opens REAL pages in headless Chrome and
// plays whole matches between them through the real screens. No account and no internet: the "server" is the local
// hub with the real security rules, living in this process (tests/online/duokit.mjs explains the bridge).
//
//   node scripts/duo.mjs                  every tests/online/duo-*.mjs scenario
//   node scripts/duo.mjs match tie        only files / scenario names containing one of the words
//   --preview        test dist/ (run `npx vite build` first) instead of the dev server
//   --shots <dir>    where screenshots go (default shots/duo)
//   --verbose        print each scenario's notes (seeds, times, measured numbers)
//   --headed         show the browser windows
//   --base <url>     test an already running copy instead of starting one (e.g. the live site, with DUO_LIVE=1)
//   --echo           the pages' network adapter imitates the real SDK: my own writes show at once, before the answer
//
// A scenario file exports `scenarios = [{ name, run(duo, T), real }]`:
//   run(duo, T)  duo = a fresh hub + clock + helpers (duokit.mjs Duo); T = { ok, eq, browser, base, shots, note }
//   real: true   the scenario opens its own pages (real time, ?net=local) and gets no hub
// A scenario fails when it throws, or when any of its pages logged a console error.
// Exit code 0 only when every scenario passed.
import { createServer, preview } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Duo, Fail, ok, eq } from '../tests/online/duokit.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(root);
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const shots = path.resolve(opt('shots', 'shots/duo'));
const filters = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots' && args[i - 1] !== '--base');
const verbose = flag('verbose');

// --base <url>: test an already running copy (e.g. the live site with `DUO_LIVE=1 ... live --base <url>`), no server
const given = opt('base', null);
const server = given ? null : flag('preview')
  ? await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
  : await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
if (server && !flag('preview')) await server.listen();
const base = given ? given.replace(/\/$/, '') : `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  channel: 'chrome', headless: !flag('headed'),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const dir = path.join(root, 'tests/online');
const files = fs.readdirSync(dir).filter((f) => /^duo-.*\.mjs$/.test(f)).sort();
let passed = 0, failed = 0;
for (const f of files) {
  const file = f.replace(/\.mjs$/, '');
  const { scenarios } = await import(pathToFileURL(path.join(dir, f)).href);
  for (const [i, sc] of scenarios.entries()) {
    if (filters.length && !filters.some((k) => file.includes(k) || sc.name.includes(k))) continue;
    const label = `${file.replace(/^duo-/, '')}${i + 1}`; // screenshots: <label>-<page>-<name>.png
    const duo = sc.real ? null : new Duo({ browser, base, shots, label, verbose, echo: flag('echo') });
    const notes = duo ? duo.notes : [];
    const T = { ok, eq, browser, base, shots, label, note: (t) => { notes.push(t); if (verbose) console.log('     ·', t); } };
    const t0 = Date.now();
    let err = null;
    try {
      fs.mkdirSync(shots, { recursive: true });
      await sc.run(duo, T);
      const errors = duo ? duo.errors() : (T.errors || []);
      if (errors.length) err = new Fail(`console errors:\n     ${errors.slice(0, 8).join('\n     ')}`);
    } catch (e) { err = e; }
    if (duo) await duo.close();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (err) {
      failed++;
      console.log(`FAIL ${file}: ${sc.name} (${secs}s)\n     ${err instanceof Fail ? err.message : err.stack || err}`);
      if (!verbose) for (const n of notes.slice(-6)) console.log('     ·', n);
    } else { passed++; console.log(`PASS ${file}: ${sc.name} (${secs}s)`); }
  }
}

await browser.close();
if (server) { if (server.close) await server.close(); else await new Promise((r) => server.httpServer.close(r)); }
console.log(failed ? `\nFAILED: ${failed} of ${passed + failed} duo scenario(s) failed` : `\nALL DUO SCENARIOS PASSED (${passed}${flag('echo') ? ', echo' : ''}${flag('preview') ? ', production build' : ''})`);
process.exit(failed || !passed ? 1 : 0);
