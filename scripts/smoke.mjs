// Headless smoke test: starts Vite, opens the game in headless Chrome (phone-sized),
// runs an optional in-page scenario, prints console errors + debug state, saves screenshots.
// Usage: node scripts/smoke.mjs [--scenario path/to/scenario.js] [--seconds 8] [--shots 4] [--query "a=1"] [--desktop]
//        [--cpu-throttle N] (CDP CPU slow-down, e.g. 4 = mid phone) [--dpr N] (phone device scale factor, default 2)
//        [--size WxH] (phone viewport in CSS px, default 390x844)
//        [--profile] (CPU profile + sampled allocations between in-page console.debug('[perf:begin NAME]') and
//        '[perf:end NAME]' markers; top self-time / allocation sites per NAME land in the output as `profiles`)
//        [--preview] (serve the production build from dist/ via `vite preview` instead of the dev server)
//        [--no-hmr] (dev server without hot reload: editing src/ never reloads the page under test)
// A scenario file is plain JS evaluated in the page *after* load: it may be async and return any JSON value.
import { createServer, preview } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const seconds = Number(opt('seconds', 8));
const shots = Number(opt('shots', 3));
const scenarioPath = opt('scenario', null);
const query = opt('query', 'test=1');
const outDir = path.resolve(opt('out', 'shots'));
const throttle = Number(opt('cpu-throttle', 0));
const dpr = Number(opt('dpr', 2));
const size = opt('size', null); // phone viewport override "WxH" (CSS px)
const [vw, vh] = size ? size.split('x').map(Number) : [390, 844];
fs.mkdirSync(outDir, { recursive: true });

const server = flag('preview')
  ? await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
  : await createServer({ server: { port: 0, host: '127.0.0.1', ...(flag('no-hmr') ? { hmr: false, watch: null } : {}) }, logLevel: 'error' });
if (!flag('preview')) await server.listen();
const port = server.httpServer.address().port;
const url = `http://127.0.0.1:${port}/?${query}`;

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const ctx = await browser.newContext(flag('desktop')
  ? { viewport: { width: 1280, height: 800 } }
  : { viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; if (m.type() === 'error' && !t.includes('Failed to load resource')) errors.push(t); else if (!t.includes('GL Driver Message')) logs.push(t); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`[http ${r.status()}] ${r.url()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + (e.stack || e.message)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const cdp = (throttle > 1 || flag('profile')) ? await page.context().newCDPSession(page) : null;
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
const profiles = {};
let profChain = Promise.resolve();
if (flag('profile')) {
  await cdp.send('Profiler.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  page.on('console', (m) => {
    const t = m.text();
    const b = /^\[perf:begin (.+)\]$/.exec(t), e = /^\[perf:end (.+)\]$/.exec(t);
    if (b) profChain = profChain.then(async () => {
      await cdp.send('Profiler.start');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    }).catch((x) => errors.push('[profile] ' + x.message));
    if (e) profChain = profChain.then(async () => {
      const { profile } = await cdp.send('Profiler.stop');
      const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
      profiles[e[1]] = { cpu: topCpu(profile), alloc: topAlloc(heap) };
    }).catch((x) => errors.push('[profile] ' + x.message));
  });
}
const site = (f) => `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`;
function topCpu(p) {
  const self = new Map(), dt = new Map();
  for (let i = 0; i < p.samples.length; i++) dt.set(p.samples[i], (dt.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
  let total = 0;
  for (const n of p.nodes) {
    const us = dt.get(n.id) || 0;
    if (!us || ['(idle)', '(program)', '(root)'].includes(n.callFrame.functionName)) continue;
    const k = site(n.callFrame);
    self.set(k, (self.get(k) || 0) + us); total += us;
  }
  return { totalMs: Math.round(total / 1000), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1000).toFixed(1)}ms ${k}`) };
}
function topAlloc(h) {
  const self = new Map();
  let total = 0;
  const walk = (n) => { const k = site(n.callFrame); self.set(k, (self.get(k) || 0) + n.selfSize); total += n.selfSize; n.children.forEach(walk); };
  walk(h.head);
  return { totalKB: Math.round(total / 1024), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${Math.round(v / 1024)}KB ${k}`) };
}

let scenarioResult = null;
if (scenarioPath) {
  const code = fs.readFileSync(scenarioPath, 'utf8');
  try {
    scenarioResult = await page.evaluate(`(async () => { ${code} })()`);
  } catch (e) { errors.push('[scenario] ' + e.message); }
}

const interval = shots > 0 ? (seconds * 1000) / shots : seconds * 1000;
for (let i = 0; i < Math.max(shots, 1); i++) {
  await page.waitForTimeout(interval);
  if (shots > 0) await page.screenshot({ path: path.join(outDir, `shot-${i + 1}.png`) });
}

await profChain;
const state = await page.evaluate(() => { try { return window.__game?.debug?.state?.() ?? null; } catch (e) { return 'state() threw: ' + e.message; } });

console.log(JSON.stringify({ url, errors, scenarioResult, ...(flag('profile') ? { profiles } : {}), state, lastLogs: logs.slice(-25).filter((l) => !l.includes('[perf:')) }, null, 2));
await browser.close();
if (server.close) await server.close(); else await new Promise((r) => server.httpServer.close(r));
process.exit(errors.length ? 1 : 0);
