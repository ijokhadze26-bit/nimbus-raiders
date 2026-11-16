// @smoke --cpu-throttle 4 --size 390x844
// SPEC2 §6.9 / §9 integrate-perf-mobile: the phone frame-time gate for the merged game. Same flags and probe as
// tests/u2/baseline/perf-5d67da5.json (390x844 mobile, CPU x4, L8 pro 20 s from the start and the L15 boss 15 s
// with 300 troops, High and Low, median of 3): every weapon at Mk V with its hero (the hero whose favourite it
// is; Spectra, nobody's favourite, with Pip) firing the ability at second 5. The Thunderclap row is the
// Pip + Thunderclap + Rally pair. p95 frame time and long frames (> 50 ms) per 10 s must stay within +15% of the
// baseline for the same level and quality. Then the Armory and Compare are opened for 10 s each: p95 <= 1.15 x
// the baseline L8 p95 of that quality. `?reps=N` in the page query overrides the 3 repeats (quick local checks).
const g = window.__game, d = g.debug, ui = g.ui;
const base = await (await fetch('/tests/u2/baseline/perf-5d67da5.json')).json();
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const { HERO_DEFS } = await import('/src/data/heroes.js');
const REPS = Math.max(1, Number(new URLSearchParams(location.search).get('reps')) || 3);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], gate = {}, menus = {}, calls = {};
const heroFor = (w) => (HERO_DEFS.find((h) => h.favourite === w) || { id: 'pip' }).id;

function stats(p) {
  const n = g.perf.n, dt = g.perf.buf.dt.subarray(0, n);
  let long = 0; for (let i = 0; i < n; i++) if (dt[i] > 50) long++;
  return { p95: p.dt.p95, longPer10s: Math.round(long / Math.max(0.001, p.seconds) * 100) / 10, calls: p.calls, programs: p.programs };
}
async function measure(q, setup, ms) {
  g.applyQuality(q);
  setup();
  await wait(300);
  d.perfStart();
  await wait(5000 - 300);
  const used = d.useAbility();
  await wait(ms - 5000 + 300);
  return { ...stats(d.perfStop()), ability: used };
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

for (const w of WEAPON_IDS) {
  const hero = heroFor(w), runs = [];
  for (let k = 0; k < REPS; k++) {
    const r = {};
    for (const q of ['high', 'low']) {
      r[q + '_l8'] = await measure(q, () => { d.setLoadout(hero, w); d.setAutopilot('pro', 1); d.startLevel(8); d.setMk(5); }, 20000);
      r[q + '_l15boss'] = await measure(q, () => { d.setLoadout(hero, w); d.setAutopilot('pro', 1); d.startLevel(15); d.skipToBoss(); d.give('troops', 300); d.setMk(5); }, 15000);
    }
    runs.push(r);
  }
  const key = `${hero}+${w}`;
  gate[key] = {}; calls[key] = {};
  for (const c of Object.keys(runs[0])) {
    const p95 = med(runs.map((r) => r[c].p95)), lf = med(runs.map((r) => r[c].longPer10s)), b = base.configs[c];
    gate[key][c] = { p95, longPer10s: lf, base: [b.p95, b.longPer10s] };
    calls[key][c] = runs.map((r) => r[c].calls.max);
    if (!runs.some((r) => r[c].ability)) fails.push(`${key} ${c}: ability never fired`);
    if (p95 > b.p95 * 1.15) fails.push(`${key} ${c}: p95 ${p95} > 1.15 x ${b.p95}`);
    if (lf > b.longPer10s * 1.15 + 0.5) fails.push(`${key} ${c}: long frames ${lf}/10 s > 1.15 x ${b.longPer10s}`);
  }
}

// Armory and Compare open for 10 s (preview overlays only; the main scene is skipped once the page is shown)
d.toTitle();
d.unlockAll(); // the real models, not silhouettes
await wait(500);
for (const q of ['high', 'low']) {
  const res = { armory: [], compare: [] };
  for (let k = 0; k < REPS; k++) {
    g.applyQuality(q);
    ui.nav('armory', { from: 'title', weapon: 'spectra' });
    await wait(1500);
    d.perfStart(); await wait(10000); res.armory.push(stats(d.perfStop()));
    ui.screens.armory.onAct('compare');
    await wait(1500);
    d.perfStart(); await wait(10000); res.compare.push(stats(d.perfStop()));
    ui.closeModal('compare');
    await wait(300);
    ui.nav('title');
    await wait(600);
  }
  const lim = base.configs[q + '_l8'].p95 * 1.15;
  for (const s of ['armory', 'compare']) {
    const p95 = med(res[s].map((r) => r.p95));
    menus[q + '_' + s] = { p95, limit: Math.round(lim * 10) / 10, calls: res[s].map((r) => r.calls.max) };
    if (p95 > lim) fails.push(`${q} ${s}: p95 ${p95} > ${lim.toFixed(1)}`);
  }
}
g.applyQuality('high');
g.save.reset();
d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, reps: REPS, gate, menus, callsMax: calls };
