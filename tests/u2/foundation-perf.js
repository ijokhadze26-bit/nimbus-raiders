// @smoke --cpu-throttle 4 --size 390x844
// SPEC2 §6.9 / §9 foundation-perf: (1) L8 draw calls on High and Low <= the shipped baseline + 5 (u2map perf
// probe: 150 troops + top Mk, run and boss); (2) shader programs stop growing after the first 2 s of a run;
// (3) the phone frame-time gate: 390x844, CPU x4, L8 pro 20 s and the L15 boss 15 s on High and Low, median
// of 3 -> p95 frame time and long frames (> 50 ms) per 10 s within +15% of tests/u2/baseline/perf-5d67da5.json.
const g = window.__game, d = g.debug;
const base = await (await fetch('/tests/u2/baseline/perf-5d67da5.json')).json();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], out = { calls: {}, programs: {}, gate: {} };
async function calls(name, q, setup) {
  g.applyQuality(q);
  setup();
  await wait(600);
  d.perfStart(); await wait(3000);
  const p = d.perfStop();
  out.calls[name] = p.calls;
  const b = base.calls[name];
  if (b && p.calls.avg > b.calls.avg + 5) fails.push(`${name}: ${p.calls.avg} calls avg > baseline ${b.calls.avg} + 5`);
}
await calls('lvl8_run', 'high', () => { d.startLevel(8); d.setAutopilot('pro', 1); d.simulate(20); d.give('troops', 150); d.give('mk', 5); });
await calls('lvl8_boss', 'high', () => { d.skipToBoss(); d.simulate(4); });
await calls('low_lvl8_run', 'low', () => { d.startLevel(8); d.setAutopilot('pro', 1); d.simulate(20); d.give('troops', 150); d.give('mk', 5); });
await calls('low_lvl8_boss', 'low', () => { d.skipToBoss(); d.simulate(4); });
// programs stable after the first 2 s of a run (High and Low)
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  d.setAutopilot('pro', 1);
  d.startLevel(8);
  await wait(2000);
  const p0 = g.engine.renderer.info.programs.length;
  await wait(6000);
  const p1 = g.engine.renderer.info.programs.length;
  out.programs[q] = [p0, p1];
  if (p1 > p0) fails.push(`${q}: programs grew ${p0} -> ${p1} after 2 s`);
}
// phone frame-time gate (same probe as the baseline: tests/u2/lib/perfprobe.js)
async function measure(q, setup, ms) {
  g.applyQuality(q);
  setup();
  await wait(300);
  d.perfStart(); await wait(ms);
  const p = d.perfStop();
  const n = g.perf.n, dt = g.perf.buf.dt.subarray(0, n);
  let long = 0; for (let i = 0; i < n; i++) if (dt[i] > 50) long++;
  return { p95: p.dt.p95, longPer10s: Math.round(long / Math.max(0.001, p.seconds) * 100) / 10 };
}
const runs = [];
for (let k = 0; k < 3; k++) {
  const r = {};
  for (const q of ['high', 'low']) {
    r[q + '_l8'] = await measure(q, () => { d.setAutopilot('pro', 1); d.startLevel(8); }, 20000);
    r[q + '_l15boss'] = await measure(q, () => { d.setAutopilot('pro', 1); d.startLevel(15); d.skipToBoss(); d.give('troops', 300); d.give('mk', 5); }, 15000);
  }
  runs.push(r);
}
const med = (a) => a.slice().sort((x, y) => x - y)[1];
for (const k of Object.keys(runs[0])) {
  const p95 = med(runs.map((r) => r[k].p95)), lf = med(runs.map((r) => r[k].longPer10s)), b = base.configs[k];
  out.gate[k] = { p95, longPer10s: lf, base: { p95: b.p95, longPer10s: b.longPer10s } };
  if (p95 > b.p95 * 1.15) fails.push(`${k}: p95 ${p95} > 1.15 x ${b.p95}`);
  if (lf > b.longPer10s * 1.15 + 0.5) fails.push(`${k}: long frames ${lf}/10 s > 1.15 x ${b.longPer10s}`);
}
g.applyQuality('high');
d.toTitle();
return { pass: fails.length === 0, fails, ...out };
