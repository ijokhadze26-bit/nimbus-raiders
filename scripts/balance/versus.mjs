// Online survival calibration: how long do the autopilots last in a versus match (shop upgrades off)?
//   node scripts/balance/versus.mjs [--seeds 10] [--profs casual,pro] [--hero pip] [--weapon thunderclap]
//                                   [--seed0 1] [--vs '{"waves":{"count0":14}}'] [--json out.json] [--sab mirror]
// Runs scripts/balance/versus.js in one headless Chrome (scripts/smoke.mjs) and prints one line per run plus the
// median / min / max per profile. --vs merges numbers over VS (src/online/game/vsdata.js) for that run only, so a
// candidate can be tried without editing the file. --sab mirror: a rival of equal skill sends back every sabotage the
// bot sends (and the bot sends whenever it can); the runs then also print sent / landed sabotages.
// Targets (STAGE1): casual median 120-170 s, pro 200-260 s, nobody past 330 s (the storm wall guarantees it).
//
// Measured 2026-11-20 with the numbers now in vsdata.js (survival in seconds, medians; `--seeds 40`, `--seed0 41`):
//   Pip + Thunderclap, seeds 1-40     casual 170.2 (82-254)   pro 199.4 (168-262)   longest 262.0
//   Pip + Thunderclap, seeds 41-60    casual 175.9            pro 183.9             (not tuned on)
//   Cinder + Emberstorm, seeds 1-10   casual 175.9            pro 200.3
//   Vex + Voidsiphon, seeds 1-10      casual 191.2            pro 201.8
// So the casual bot sits on the top edge of its band and the pro bot on the bottom edge of its own, and not on every
// seed set. Why, and what the sweeps showed (so the next person does not repeat them):
// - Every squad is at the 999 cap from about 1:30 (gates no longer tell the bots apart), reaches the second boss at
//   about 1:55 and is thinned by it to a handful by 2:40-3:00 whichever bot steers. The two bots then differ in one
//   thing only: the pro bot dodges the boss perfectly with a handful of Raiders, the casual bot does not.
// - The first calibration (casual 167 / pro 221) rested on a bug: waves spawned in an arena never charged, so that
//   handful lived on until the storm. With the waves charging (ramp.js), a handful dies to the first wave that reaches
//   it, and both bots fall in the same seconds: SPEC4's arena counts (waves.bossMul 0.5, full Sudden Death waves)
//   give casual 171 / pro 176; 0.25 / 0.25 gives 187 / 191.
// - waves.bossMul 0.15 + sudden.bossMul 0.05 is the best found: the casual bot falls to the boss or the pressure
//   waves before 3:00, about half of the pro runs get into Sudden Death and last until its growing waves or the third
//   boss (207-262 s). The answer to these two numbers is NOT smooth: 0.12 / 0.2 / 0.25 for waves.bossMul gave casual
//   174 / 203 / 190, and moving waves.from by 3-5 s moved the pro median by 30-40 s (deaths follow the wave arrivals,
//   8 s apart). A 20-seed median moves by about +-8 s between seed sets; use 40 seeds to compare two candidates.
// - Weaker arena waves (waves.bossMul 0.05-0.08) lift BOTH bots (casual 178-195, pro 204-218): a trickle of enemies
//   keeps the combo up and more squads shoot the second boss down. A tougher second boss (600000-700000 hp, tier 6)
//   does not bring the casual bot back (188-199); a weaker one (300000-350000) lets both pass alike (the bots pass
//   it 15 / 18 of 20 at 300000, 8 / 9 of 20 at 350000) and everybody then falls at the third boss at about 3:50.
// - To separate skill for real, the lever has to be something the bots do differently before the squad cap or at the
//   boss with a FULL squad; none of the numbers in VS is that lever.
// Stage 2 (sabotage), measured 2026-11-21, Pip + Thunderclap, seeds 1-20 (`--seeds 20`):
//   no sabotage sent      casual 175.0 (95-263)    pro 213.1 (166-255)
//   --sab mirror          casual 167.4 (110-253)   pro 184.8 (160-274)   7-10 sends a match (21-27 when zone 4 is reached)
// So a rival of equal skill shortens a casual match by ~8 s and a pro one by ~28 s. The autopilot ignores fog and
// blackout (visual only), so the real effect on a player is larger.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const q = new URLSearchParams({ test: '1', seeds: opt('seeds', '10'), profs: opt('profs', 'casual,pro'), hero: opt('hero', 'pip'), weapon: opt('weapon', 'thunderclap'), seed0: opt('seed0', '1') });
if (opt('vs', '')) q.set('vs', opt('vs', ''));
if (opt('max', '')) q.set('max', opt('max', ''));
if (opt('sab', '')) q.set('sab', opt('sab', ''));
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
  console.log(`${r.hero} + ${r.weapon}, upgrades off${r.sab ? `, sabotage ${r.sab}` : ''}`);
  const byProf = {};
  for (const x of r.runs) {
    (byProf[x.prof] ||= []).push(x);
    const m = Object.entries(x.marks).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`${x.prof.padEnd(7)} seed ${String(x.seed).padEnd(7)} ${String(x.t).padStart(6)} s${x.alive ? ' (ALIVE)' : ''}  ${String(x.d).padStart(5)} m  zone ${x.zone}  Mk ${x.mk}  peak ${String(x.peak).padStart(3)}  by ${String(x.by).padEnd(8)} squad ${m}${x.sab ? `  sab sent ${x.sab.sent} landed ${x.sab.landed}` : ''}`);
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
