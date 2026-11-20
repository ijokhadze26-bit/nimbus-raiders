// Online survival calibration: how long do the autopilots last in a versus match (shop upgrades off)?
//   node scripts/balance/versus.mjs [--seeds 10] [--profs casual,pro] [--hero pip] [--weapon thunderclap]
//                                   [--seed0 1] [--vs '{"waves":{"count0":14}}'] [--json out.json]
// Runs scripts/balance/versus.js in one headless Chrome (scripts/smoke.mjs) and prints one line per run plus the
// median / min / max per profile. --vs merges numbers over VS (src/online/game/vsdata.js) for that run only, so a
// candidate can be tried without editing the file.
// Targets (STAGE1): casual median 120-170 s, pro 200-260 s, nobody past 330 s (the storm wall guarantees it).
//
// Measured 2026-11-20 with the numbers now in vsdata.js: see the table at the bottom of this file.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const q = new URLSearchParams({ test: '1', seeds: opt('seeds', '10'), profs: opt('profs', 'casual,pro'), hero: opt('hero', 'pip'), weapon: opt('weapon', 'thunderclap'), seed0: opt('seed0', '1') });
if (opt('vs', '')) q.set('vs', opt('vs', ''));
if (opt('max', '')) q.set('max', opt('max', ''));
const out = process.env.BALANCE_OUT || path.join(root, 'shots/balance');
const p = spawn(process.execPath, ['scripts/smoke.mjs', '--no-hmr', '--seconds', '0', '--shots', '0', '--out', out, '--query', q.toString(), '--scenario', path.join(root, 'scripts/balance/versus.js')], { cwd: root });
let so = '', se = '';
p.stdout.on('data', (d) => { so += d; });
p.stderr.on('data', (d) => { se += d; });
p.on('close', (code) => {
  let o = null;
  try { o = JSON.parse(so.slice(so.indexOf('{'))); } catch { /* not JSON */ }
  if (!o || !o.scenarioResult) { console.error('no result', code, se.slice(-1500), so.slice(-1500)); process.exit(1); }
  if (o.errors.length) console.error('console errors:', JSON.stringify(o.errors).slice(0, 2000));
  const r = o.scenarioResult;
  if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify(r, null, 1) + '\n');
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  console.log(`${r.hero} + ${r.weapon}, upgrades off`);
  const byProf = {};
  for (const x of r.runs) {
    (byProf[x.prof] ||= []).push(x);
    const m = Object.entries(x.marks).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`${x.prof.padEnd(7)} seed ${String(x.seed).padEnd(7)} ${String(x.t).padStart(6)} s${x.alive ? ' (ALIVE)' : ''}  ${String(x.d).padStart(5)} m  zone ${x.zone}  Mk ${x.mk}  peak ${String(x.peak).padStart(3)}  by ${String(x.by).padEnd(8)} squad ${m}`);
  }
  console.log('');
  let worst = 0;
  for (const [prof, list] of Object.entries(byProf)) {
    const ts = list.map((x) => x.t);
    worst = Math.max(worst, ...ts);
    console.log(`${prof.padEnd(7)} median ${med(ts).toFixed(1)} s   min ${Math.min(...ts).toFixed(1)}   max ${Math.max(...ts).toFixed(1)}   (${list.length} seeds: ${ts.slice().sort((a, b) => a - b).join(', ')})`);
  }
  console.log(`longest run ${worst.toFixed(1)} s (limit 330)`);
  process.exit(o.errors.length ? 1 : 0);
});
