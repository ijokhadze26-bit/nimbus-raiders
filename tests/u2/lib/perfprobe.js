// Phone frame-time probe (SPEC2 §6.9): L8 pro 20 s from start, L15 boss 15 s; High and Low.
const g = window.__game, d = g.debug;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
async function measure(name, q, setup, ms) {
  g.applyQuality(q);
  setup();
  await wait(300);
  d.perfStart();
  await wait(ms);
  const p = d.perfStop();
  const n = g.perf.n, dt = g.perf.buf.dt.subarray(0, n);
  let long = 0; for (let i = 0; i < n; i++) if (dt[i] > 50) long++;
  out[name] = { frames: n, seconds: p.seconds, p95: p.dt.p95, p50: p.dt.p50, longPer10s: Math.round(long / Math.max(0.001, p.seconds) * 100) / 10, calls: p.calls, tris: p.tris, programs: p.programs, heapKBf: p.heap && p.heap.allocKBPerFrame };
}
const give = (k, n) => d.give(k, n);
for (const q of ['high', 'low']) {
  await measure(q + '_l8', q, () => { d.setAutopilot('pro', 1); d.startLevel(8); }, 20000);
  await measure(q + '_l15boss', q, () => { d.setAutopilot('pro', 1); d.startLevel(15); d.skipToBoss(); give('troops', 300); give('tier', 5); }, 15000);
}
d.toTitle();
return out;
