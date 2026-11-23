// Bot curve generator (STAGE3 "botcurves.js"): measures the autopilots in versus matches and writes
// src/online/botcurves.js, the curves the scripted Quick Match rival plays by (src/online/botplan.js).
//   node scripts/balance/botcurves.mjs [--seeds 20] [--write] [--date 2026-11-23] [--json raw.json] [--raw raw.json]
// Runs scripts/balance/botcurves.js in one headless Chrome (scripts/smoke.mjs): Pip + Thunderclap, upgrades off,
// casual and pro autopilots, road seeds (i + 1) * 7919 + 13, two passes (no sabotage; --sab mirror as versus.mjs).
// Without --write it only prints the numbers. --raw reads the runs from a file written by --json instead of playing
// them again. Same runs = the same file (the date is the only other input).
//   fall    median / sigma (sd of ln T) / min / max of the no-sabotage fall times
//   sliceK  (no-sabotage median - mirror median) / mean sends in the mirror pass, never below 0: the seconds of
//           fall time one landed sabotage is worth
//   n, dist median squad / distance of the runs still standing at t = 0, 5, 10 ... 330 s (fewer than 3 standing:
//           the last value is held)
//   arena   boss 1..4: median length (s) of the arenas the runs got through, and the median share of the squad lost
//           in them (a boss no run got through repeats the one before)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const seeds = Number(opt('seeds', '20'));
const date = opt('date', new Date().toISOString().slice(0, 10));
const HERO = 'pip', WEAPON = 'thunderclap', STEPS = 67, ARENAS = 4; // t = 0, 5 ... 330

const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

function play() {
  return new Promise((resolve) => {
    const q = new URLSearchParams({ test: '1', seeds: String(seeds), profs: 'casual,pro', hero: HERO, weapon: WEAPON, seed0: '1', passes: 'plain,mirror' });
    const out = process.env.BALANCE_OUT || path.join(root, 'shots/balance');
    const p = spawn(process.execPath, ['scripts/smoke.mjs', '--no-hmr', '--seconds', '0', '--shots', '0', '--out', out, '--query', q.toString(), '--scenario', path.join(root, 'scripts/balance/botcurves.js')], { cwd: root });
    let so = '', se = '';
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se += d; });
    p.on('close', (code) => {
      let o = null;
      try { o = JSON.parse(so.slice(so.indexOf('{'))); } catch { /* not JSON */ }
      if (!o || !o.scenarioResult) { console.error('no result', code, se.slice(-1500), so.slice(-1500)); process.exit(1); }
      if (o.errors.length) { console.error('console errors:', JSON.stringify(o.errors).slice(0, 2000)); process.exit(1); }
      resolve(o.scenarioResult);
    });
  });
}

/** Median of the runs standing at each 5 s mark; fewer than 3 standing holds the last value. */
function curve(runs, key) {
  const outv = [];
  for (let k = 0; k < STEPS; k++) {
    const vals = runs.filter((r) => r[key].length > k).map((r) => r[key][k]);
    outv.push(vals.length >= 3 ? r1(med(vals)) : outv.length ? outv[outv.length - 1] : 0);
  }
  return outv;
}

function profile(plain, mirror) {
  const Ts = plain.map((r) => r.T);
  const logs = Ts.map((t) => Math.log(Math.max(1, t)));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sigma = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logs.length - 1));
  const median = med(Ts), mMedian = med(mirror.map((r) => r.T));
  const sends = mirror.reduce((a, r) => a + r.sends, 0) / Math.max(1, mirror.length);
  const arena = [];
  for (let z = 1; z <= ARENAS; z++) {
    const done = plain.flatMap((r) => r.arenas.filter((a) => a.z === z && !a.died));
    const prev = arena[arena.length - 1] || { dur: 15, loss: 0.2 };
    arena.push(done.length ? { dur: r1(med(done.map((a) => a.dur))), loss: r3(Math.max(0, med(done.map((a) => a.loss)))) } : { ...prev });
  }
  return {
    fall: { median: r1(median), sigma: r3(sigma), min: r1(Math.min(...Ts)), max: r1(Math.max(...Ts)) },
    sliceK: r3(Math.max(0, (median - mMedian) / Math.max(1, sends))),
    n: curve(plain, 'n'), dist: curve(plain, 'dist'), arena,
    _: { mirrorMedian: r1(mMedian), sends: r1(sends), through: arena.map((_, i) => plain.filter((r) => r.arenas.some((a) => a.z === i + 1 && !a.died)).length) },
  };
}

const res = opt('raw', '') ? JSON.parse(fs.readFileSync(opt('raw', ''), 'utf8')) : await play();
if (opt('json', '')) fs.writeFileSync(opt('json', ''), JSON.stringify(res) + '\n');
const curves = {};
for (const prof of ['casual', 'pro']) curves[prof] = profile(res.out['plain:' + prof], res.out['mirror:' + prof]);

for (const prof of ['casual', 'pro']) {
  const c = curves[prof];
  console.log(`${prof}: fall median ${c.fall.median} s  sigma ${c.fall.sigma}  min ${c.fall.min}  max ${c.fall.max}`);
  console.log(`  mirror median ${c._.mirrorMedian} s, ${c._.sends} sends a match -> sliceK ${c.sliceK} s a sabotage`);
  console.log(`  arenas ${c.arena.map((a, i) => `${i + 1}: ${a.dur} s / ${Math.round(a.loss * 100)}% (${c._.through[i]} through)`).join('   ')}`);
  console.log(`  squad at 0/30/60/90/120/150/180 s: ${[0, 6, 12, 18, 24, 30, 36].map((k) => c.n[k]).join(' / ')}`);
  console.log(`  dist  at 0/30/60/90/120/150/180 s: ${[0, 6, 12, 18, 24, 30, 36].map((k) => c.dist[k]).join(' / ')}`);
}

if (flag('write')) {
  const body = (c) => [
    `    fall: { median: ${c.fall.median}, sigma: ${c.fall.sigma}, min: ${c.fall.min}, max: ${c.fall.max} },`,
    `    sliceK: ${c.sliceK},`,
    `    n: [${c.n.join(', ')}],`,
    `    dist: [${c.dist.join(', ')}],`,
    `    arena: [${c.arena.map((a) => `{ dur: ${a.dur}, loss: ${a.loss} }`).join(', ')}],`,
  ].join('\n');
  const text = `// GENERATED by scripts/balance/botcurves.mjs on ${date}, ${seeds} seeds, ${HERO} + ${WEAPON}. Do not edit by hand.
// (STAGE3 "botcurves.js"; read by src/online/botplan.js) Survival of the autopilots in versus matches, shop upgrades
// off: fall = no-sabotage fall time (sigma = sd of ln T); sliceK = seconds of fall time one sabotage is worth (mirror
// pass); n / dist = median squad / distance of the runs still standing at t = 0, 5, 10 ... 330 s; arena = boss 1..4:
// median arena length (s) and share of the squad lost in it.
export const BOT_CURVES = {
  made: '${date}', seeds: ${seeds}, hero: '${HERO}', weapon: '${WEAPON}',
  casual: {
${body(curves.casual)}
  },
  pro: {
${body(curves.pro)}
  },
};
`;
  fs.writeFileSync(path.join(root, 'src/online/botcurves.js'), text);
  console.log('wrote src/online/botcurves.js');
}
