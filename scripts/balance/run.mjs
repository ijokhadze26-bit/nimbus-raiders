// Balance driver: node scripts/balance/run.mjs <in-page scenario.js> <out.json> [query]
// Runs the scenario in one headless Chrome (scripts/smoke.mjs, no shots) and writes its return value to out.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [scenario, out, query = ''] = process.argv.slice(2);
if (!scenario || !out) { console.error('usage: run.mjs <scenario.js> <out.json> [query]'); process.exit(2); }
const shotsDir = process.env.BALANCE_OUT || path.join(root, 'shots/balance');
const args = ['scripts/smoke.mjs', '--no-hmr', '--seconds', '0', '--shots', '0', '--out', shotsDir, '--query', 'test=1' + (query ? '&' + query : ''), '--scenario', path.resolve(scenario)];
const t0 = Date.now();
const p = spawn(process.execPath, args, { cwd: root });
let so = '', se = '';
p.stdout.on('data', (d) => { so += d; });
p.stderr.on('data', (d) => { se += d; });
p.on('close', (code) => {
  let o = null;
  try { o = JSON.parse(so.slice(so.indexOf('{'))); } catch { /* not JSON */ }
  if (!o) { console.error('no JSON', code, se.slice(-1500), so.slice(-1500)); process.exit(1); }
  if (o.errors.length) console.error('console errors:', JSON.stringify(o.errors).slice(0, 2000));
  fs.writeFileSync(out, JSON.stringify(o.scenarioResult, null, 1) + '\n');
  console.log(`wrote ${out} in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(o.errors.length ? 1 : 0);
});
