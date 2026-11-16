// @smoke --seconds 0 --shots 0
// Gauntlet calibration (SPEC2 §8.3): per gauntlet, the toughness T (hpMul = toughFor(T, 3)) at which the 'ref'
// weapon (neutral K = 1 straight bullet, Pip, Mk III, squad 60, zero upgrades) loses 30-50% of the squad, mean
// over casual bot seeds 1-3. Losses are step-shaped in T (hits-to-kill thresholds), so several T can qualify:
// this scans 40 log-spaced T in [0.3, 400] and takes the T whose ref loss is closest to 40%, the largest such T
// on a tie (the toughest gauntlet that still fits the band); when a loss step jumps over the band between two
// grid points, it bisects between them. Result -> scripts/balance/gauntlets.json.
const g = window.__game;
g.loop.stop();
const { gauntletMean, GAUNTLET_TYPES } = await import('/scripts/balance/lib.js');
const N = 40, lo = Math.log(0.3), hi = Math.log(400);
const grid = Array.from({ length: N }, (_, i) => Math.round(Math.exp(lo + (hi - lo) * i / (N - 1)) * 1000) / 1000);
const out = {};
for (const type of GAUNTLET_TYPES) {
  let best = null;
  const tried = [];
  for (const T of grid) {
    const r = gauntletMean(g, { type, T, weapon: 'ref', hero: 'pip' });
    const frac = r.lost / r.start;
    tried.push([T, r.lost]);
    if (frac < 0.3 || frac > 0.5) continue;
    const d = Math.abs(frac - 0.4);
    if (!best || d < best.d - 1e-9 || Math.abs(d - best.d) < 1e-9) best = { T, lost: r.lost, frac: Math.round(frac * 1000) / 1000, d, runs: r.runs };
  }
  // no grid point in the band (a loss step jumps over it): bisect between the bracketing grid points
  for (let i = 1; !best && i < tried.length; i++) {
    if (!(tried[i - 1][1] / 60 < 0.3 && tried[i][1] / 60 > 0.5)) continue;
    let a = Math.log(tried[i - 1][0]), b = Math.log(tried[i][0]);
    for (let k = 0; k < 14 && !best; k++) {
      const T = Math.round(Math.exp((a + b) / 2) * 1000) / 1000;
      const r = gauntletMean(g, { type, T, weapon: 'ref', hero: 'pip' });
      const frac = r.lost / r.start;
      tried.push([T, r.lost]);
      if (frac >= 0.3 && frac <= 0.5) best = { T, lost: r.lost, frac: Math.round(frac * 1000) / 1000, runs: r.runs };
      else if (frac < 0.3) a = Math.log(T); else b = Math.log(T);
    }
  }
  out[type] = best ? { T: best.T, lost: best.lost, frac: best.frac, runs: best.runs, tried } : { T: null, tried };
}
g.debug.toTitle();
return out;
