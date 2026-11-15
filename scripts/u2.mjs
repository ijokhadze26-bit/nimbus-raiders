// Update-2 test runner: `npm run test:u2 [-- filter...]`. Runs every tests/u2/*.js scenario through
// scripts/smoke.mjs (headless Chrome) and prints pass / fail. A scenario returns JSON with `pass: true` to pass;
// any console error also fails it. A first line comment `// @smoke <flags>` adds smoke.mjs flags
// (e.g. --cpu-throttle 4, --desktop). Also checks that every src/** file is under 500 lines, and writes
// tests/u2/.tmp/shop-5d67da5.js (the shipped shop data) for foundation-shop.js.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const filters = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const testDir = path.join(root, 'tests/u2');
const outRoot = path.join(root, 'shots/u2');

// ---- 500-line rule ----
const long = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|css|mjs)$/.test(f)) { const n = fs.readFileSync(p, 'utf8').split('\n').length - 1; if (n >= 500) long.push(`${path.relative(root, p)} (${n})`); } } };
walk(path.join(root, 'src'));

// ---- shipped shop data for foundation-shop.js ----
fs.mkdirSync(path.join(testDir, '.tmp'), { recursive: true });
try { fs.writeFileSync(path.join(testDir, '.tmp/shop-5d67da5.js'), execSync('git show 5d67da5:src/data/shop.js', { cwd: root })); } catch (e) { console.error('git show failed:', e.message); }

const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.js') && (!filters.length || filters.some((k) => f.includes(k)))).sort();
const results = [];
for (const f of files) {
  const file = path.join(testDir, f);
  const head = fs.readFileSync(file, 'utf8').split('\n')[0];
  const m = /^\/\/\s*@smoke\s+(.*)$/.exec(head);
  const extra = m ? m[1].trim().split(/\s+/) : [];
  const args = ['scripts/smoke.mjs', '--no-hmr', '--seconds', '0', '--shots', '0', '--out', path.join(outRoot, f.replace(/\.js$/, '')), ...extra, '--scenario', file];
  const t0 = Date.now();
  const { code, out, err } = await run(args);
  let o = null;
  try { o = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* not JSON */ }
  const r = o && o.scenarioResult;
  const errors = o ? o.errors : ['no JSON output', err.slice(-400)];
  const pass = !!(o && errors.length === 0 && r && r.pass === true);
  results.push({ f, pass, s: Math.round((Date.now() - t0) / 100) / 10 });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${f}  (${results.at(-1).s}s)`);
  if (!pass || verbose) {
    if (errors.length) console.log('  errors:', JSON.stringify(errors).slice(0, 1500));
    if (r) console.log('  result:', JSON.stringify(r).slice(0, 3000));
    else if (code) console.log('  exit', code, err.slice(-600));
  }
}
if (long.length) console.log('FAIL  500-line rule:', long.join(', '));
else console.log('PASS  500-line rule (every src/** file < 500 lines)');
const failed = results.filter((r) => !r.pass).length + (long.length ? 1 : 0);
console.log(`\n${results.length - results.filter((r) => !r.pass).length}/${results.length} scenarios passed${long.length ? ', 500-line rule FAILED' : ''}`);
process.exit(failed ? 1 : 0);

function run(args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, args, { cwd: root });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ code, out, err }));
  });
}
