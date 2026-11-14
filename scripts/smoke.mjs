// Headless smoke test: starts Vite, opens the game in headless Chrome (phone-sized),
// runs an optional in-page scenario, prints console errors + debug state, saves screenshots.
// Usage: node scripts/smoke.mjs [--scenario path/to/scenario.js] [--seconds 8] [--shots 4] [--query "a=1"] [--desktop]
// A scenario file is plain JS evaluated in the page *after* load: it may be async and return any JSON value.
import { createServer } from 'vite';
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
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const url = `http://127.0.0.1:${port}/?${query}`;

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext(flag('desktop')
  ? { viewport: { width: 1280, height: 800 } }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; if (m.type() === 'error' && !t.includes('Failed to load resource')) errors.push(t); else if (!t.includes('GL Driver Message')) logs.push(t); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`[http ${r.status()}] ${r.url()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + (e.stack || e.message)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);

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

const state = await page.evaluate(() => { try { return window.__game?.debug?.state?.() ?? null; } catch (e) { return 'state() threw: ' + e.message; } });

console.log(JSON.stringify({ url, errors, scenarioResult, state, lastLogs: logs.slice(-25) }, null, 2));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
