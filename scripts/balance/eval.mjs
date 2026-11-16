// Balance evaluator: node scripts/balance/eval.mjs --m matrices.json[,more.json] --e campaign.json --x distinct.json
//   [--det aproLow.json,aproHigh.json,aproHigh2.json] [--out scripts/balance/results.json]
// Applies every SPEC2 §8.2 / §8.3 pass criterion to the raw outputs of matrices.js, campaign.js and distinct.js
// and prints one line per criterion. Exit code 0 only if every evaluated criterion passes.
import fs from 'node:fs';
import { WEAPON_DEFS } from '../../src/data/weapons.js';
import { HERO_DEFS } from '../../src/data/heroes.js';
import { LEVELS } from '../../src/data/levels.js';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const load = (list) => (list ? list.split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))) : []);
const M = Object.assign({}, ...load(opt('m')));
const [E] = load(opt('e'));
const [X] = load(opt('x'));
const DET = load(opt('det'));
const W = WEAPON_DEFS.map((w) => w.id), HS = HERO_DEFS.map((h) => h.id);
const rows = [];
const add = (id, pass, detail) => { rows.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(28)} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const lastArena = (c) => { const r = c.runs[c.runs.length - 1]; return c.win ? (r.arena ?? 0) : 0; };
const fmtLoss = (cs) => cs.filter((c) => !c.win || c.attempts > 1).map((c) => `${c.hero}/${c.weapon} L${c.id} s${c.seed}:${c.win ? c.attempts : 'X'}`);

function allWin(name, cells, cap) {
  if (!cells) return;
  const bad = cells.filter((c) => !c.win || c.attempts > cap);
  const tot = cells.reduce((s, c) => s + c.attempts, 0);
  add(name, bad.length === 0, `${cells.length - bad.length}/${cells.length} cells win within ${cap}; attempts ${tot}; retries: ${fmtLoss(cells).slice(0, 40).join(' ') || 'none'}`);
}
allWin('A all win <= 4', M.A, 4);
if (M.Apro) {
  const per = {}; let ok = true;
  for (const w of W) {
    const cs = M.Apro.filter((c) => c.weapon === w);
    if (!cs.length) continue;
    const first = cs.filter((c) => c.win && c.attempts === 1).length, two = cs.filter((c) => c.win && c.attempts <= 2).length;
    per[w] = `${first}/${cs.length} first, ${two} <=2`;
    if (first < 14 || two < cs.length) ok = false;
  }
  add('A-pro >=14/15 first, all <=2', ok, per);
}
allWin('B all win <= 4', M.B, 4);
allWin('C all win <= 4', M.C, 4);
allWin('D all win <= 4', M.D, 4);
allWin('F novice L1-4 <= 5', M.F, 5);
allWin('G crates always <= 4', M.G, 4);
if (E) {
  const pro = E.pro && E.pro.log, cas = E.casual && E.casual.log, nov = E.novice && E.novice.log;
  if (pro) add('E pro 15/15 first try', pro.length === 15 && pro.every((l) => l.won && l.tries === 1), pro.map((l) => `${l.id}:${l.won ? l.tries : 'X'}`).join(' '));
  if (cas) add('E casual <=3 L1-8, <=5 L9-15', cas.length === 15 && cas.every((l) => l.won && l.tries <= (l.id <= 8 ? 3 : 5)), cas.map((l) => `${l.id}:${l.won ? l.tries : 'X'}`).join(' '));
  if (nov) add('E novice clears L1-4', [1, 2, 3, 4].every((id) => nov.find((l) => l.id === id && l.won)), nov.map((l) => `${l.id}:${l.won ? l.tries : 'X'}`).join(' '));
}
// ---- spread + favours (matrix A) ----
if (M.A) {
  const lv = [...new Set(M.A.map((c) => c.id))];
  const tot = Object.fromEntries(W.map((w) => [w, M.A.filter((c) => c.weapon === w).reduce((s, c) => s + c.attempts, 0)]));
  const med = median(Object.values(tot));
  const spreadOk = Object.values(tot).every((t) => Math.abs(t - med) <= 0.25 * med);
  add('spread: attempts within 25%', spreadOk, { median: med, ...tot });
  const best = Object.fromEntries(W.map((w) => [w, 0])), favour = [];
  let favOk = 0;
  for (const id of lv) {
    const score = (w) => { const cs = M.A.filter((c) => c.weapon === w && c.id === id); return { a: mean(cs.map((c) => c.attempts)), s: mean(cs.map(lastArena)) }; };
    const sc = Object.fromEntries(W.map((w) => [w, score(w)]));
    const better = (x, y) => x.a < y.a - 1e-9 || (Math.abs(x.a - y.a) < 1e-9 && x.s > y.s + 1e-9);
    const top = W.filter((w) => !W.some((v) => v !== w && !better(sc[w], sc[v])));
    if (top.length === 1) best[top[0]]++;
    const fav = LEVELS.find((l) => l.id === id).favours || [];
    const F = fav.filter((w) => sc[w]), N = W.filter((w) => !fav.includes(w));
    const fa = { a: mean(F.map((w) => sc[w].a)), s: mean(F.map((w) => sc[w].s)) }, na = { a: mean(N.map((w) => sc[w].a)), s: mean(N.map((w) => sc[w].s)) };
    const win = better(fa, na);
    if (win) favOk++;
    favour.push(`L${id}:${win ? 'Y' : 'n'}(${r2(fa.a)}/${Math.round(fa.s)} vs ${r2(na.a)}/${Math.round(na.s)})`);
  }
  add('spread: single best <= 6/15', Object.values(best).every((n) => n <= 6), best);
  add('favours beat others >= 10/15', favOk >= Math.min(10, lv.length), `${favOk}/${lv.length} ` + favour.join(' '));
  // information only (not a criterion): the same comparison with boss seconds as a third key, because
  // every cell wins first try and many arena squads sit at the 999 cap, so the SPEC2 keys often tie
  let ext = 0;
  for (const id of lv) {
    const sc = (w) => { const cs = M.A.filter((c) => c.weapon === w && c.id === id); return [mean(cs.map((c) => c.attempts)), -mean(cs.map(lastArena)), mean(cs.map((c) => c.runs[c.runs.length - 1].bossSec ?? 999))]; };
    const fav = LEVELS.find((l) => l.id === id).favours || [];
    const avg = (ws) => { const v = ws.map(sc); return [0, 1, 2].map((k) => mean(v.map((x) => x[k]))); };
    const f = avg(fav), n = avg(W.filter((w) => !fav.includes(w)));
    const k = [0, 1, 2].find((i) => Math.abs(f[i] - n[i]) > 1e-9);
    if (k != null && f[k] < n[k]) ext++;
  }
  console.log(`INFO  favours with boss-seconds tie-break: ${ext}/${lv.length}`);
  rows.push({ id: 'info: favours incl. boss seconds', pass: null, detail: `${ext}/${lv.length}` });
}
// ---- heroes (matrix B) ----
if (M.B) {
  const runs = (h) => M.B.filter((c) => c.hero === h).flatMap((c) => c.runs);
  const uses = Object.fromEntries(HS.map((h) => [h, r2(mean(runs(h).map((r) => r.uses)))]));
  add('heroes: ability used >= 2/level', Object.values(uses).every((u) => u >= 2), uses);
  const vexD = M.B.filter((c) => c.hero === 'vex').map((c) => c.runs[0].start - M.B.find((p) => p.hero === 'pip' && p.id === c.id && p.seed === c.seed).runs[0].start);
  add('heroes: Vex starts +6', vexD.length > 0 && vexD.every((v) => v === 6), `deltas ${[...new Set(vexD)].join(',')}`);
  const ratio = (h) => { const rs = runs(h).filter((r) => r.coins > 0); return r2(rs.reduce((s, r) => s + r.paid, 0) / rs.reduce((s, r) => s + r.coins, 0)); };
  const bon = ratio('bonbon'), pipR = ratio('pip');
  add('heroes: Bonbon payout +25%', Math.abs(bon / pipR - 1.25) < 0.01, `bonbon ${bon} vs pip ${pipR} (paid / result coins)`);
  const att = Object.fromEntries(HS.map((h) => [h, M.B.filter((c) => c.hero === h).reduce((s, c) => s + c.attempts, 0)]));
  const ma = median(Object.values(att));
  add('heroes: none > 1.5x median attempts', Object.values(att).every((a) => a <= 1.5 * ma), { median: ma, ...att });
  const arena = Object.fromEntries(HS.map((h) => [h, Math.round(mean(M.B.filter((c) => c.hero === h).map(lastArena)))]));
  const mr = median(Object.values(arena));
  add('heroes: arena squad <= 1.5x median', Object.values(arena).every((a) => a <= 1.5 * mr), { median: mr, ...arena });
  const share = Object.fromEntries(HS.map((h) => [h, r2(mean(runs(h).map((r) => r.abilityShare)))]));
  add('heroes: ability <= 35% of kills', Object.values(share).every((s) => s <= 0.35), share);
  const sum = (h, k) => runs(h).reduce((s, r) => s + (r.fx[k] || 0), 0);
  const fx = { rally: sum('pip', 'rally'), meteorKills: sum('cinder', 'abilityKills'), whiteoutFrozen: sum('rime', 'frozen'), shieldBlocked: sum('bonbon', 'blocked'), fortressKills: sum('bolt', 'abilityKills'), shockwavePushed: sum('vex', 'pushed') };
  add('heroes: every ability effect > 0', Object.values(fx).every((v) => v > 0), fx);
}
// ---- gauntlets + bosses (distinct.js) ----
// tie-aware ranks (members lost, then clear time): best = 1 + how many are strictly better, worst = N - how
// many are strictly worse. A strong entry needs best <= 3, a weak entry worst >= N - 2.
const cmpG = (a, b) => a.lost - b.lost || a.clear - b.clear;
const rankOf = (tab, id) => { const v = Object.values(tab), me = tab[id]; return { best: 1 + v.filter((o) => cmpG(o, me) < 0).length, worst: v.length - v.filter((o) => cmpG(o, me) > 0).length }; };
if (X && X.wg) {
  const bad = [], ok = [];
  for (const w of WEAPON_DEFS) {
    for (const s of w.strong) if (X.wg[s.id]) { const r = rankOf(X.wg[s.id], w.id); (r.best <= 3 ? ok : bad).push(`${w.id} strong ${s.id} #${r.best}`); }
    for (const s of w.weak) if (X.wg[s.id]) { const r = rankOf(X.wg[s.id], w.id); (r.worst >= W.length - 2 ? ok : bad).push(`${w.id} weak ${s.id} #${r.worst}`); }
  }
  add('gauntlets: weapons strong/weak', bad.length === 0, `${ok.length} ok; failing: ${bad.join(', ') || 'none'}`);
}
if (X && X.hg) {
  const bad = [], ok = [];
  for (const h of HERO_DEFS) {
    for (const s of h.strong) if (X.hg[s.id]) { const r = rankOf(X.hg[s.id], h.id); (r.best <= 3 ? ok : bad).push(`${h.id} strong ${s.id} #${r.best}`); }
    for (const s of h.weak) if (X.hg[s.id]) { const r = rankOf(X.hg[s.id], h.id); (r.worst >= HS.length - 2 ? ok : bad).push(`${h.id} weak ${s.id} #${r.worst}`); }
  }
  add('gauntlets: heroes strong/weak', bad.length === 0, `${ok.length} ok; failing: ${bad.join(', ') || 'none'}`);
}
if (X && X.boss) {
  const B = X.boss, types = Object.keys(B);
  const order = (t) => Object.entries(B[t]).map(([w, v]) => [w, v.sec ?? 1e9]).sort((a, b) => a[1] - b[1]);
  const pos = (t, w) => { const o = order(t), s = B[t][w].sec ?? 1e9; return { best: o.filter(([, v]) => v < s).length + 1, worst: o.filter(([, v]) => v > s).length + 1 }; };
  const spec = types.filter((t) => pos(t, 'spectra').best === 1).length;
  add('bosses: Spectra fastest >= 4/5', spec >= 4, `${spec}/${types.length}`);
  const emb = types.filter((t) => pos(t, 'emberstorm').worst <= 2).length;
  add('bosses: Ember slowest/2nd >= 3', emb >= 3, `${emb}/${types.length}`);
  if (B.ironhorn) add('bosses: Gearworks top 2 Ironhorn', pos('ironhorn', 'gearworks').best <= 2, order('ironhorn').map(([w, v]) => `${w}:${v}`).join(' '));
  if (B.tempestking) add('bosses: Thunder bottom 2 Tempest', pos('tempestking', 'thunderclap').worst <= 2, order('tempestking').map(([w, v]) => `${w}:${v}`).join(' '));
  const slow = types.flatMap((t) => Object.entries(B[t]).filter(([, v]) => !(v.sec <= 75)).map(([w, v]) => `${t}/${w}:${v.sec ?? 'X'}`));
  add('bosses: all killed within 75 s', slow.length === 0, slow.join(' ') || `max ${Math.max(...types.flatMap((t) => Object.values(B[t]).map((v) => v.sec)))} s`);
}
if (DET.length >= 2) {
  const key = (o) => JSON.stringify(o.Apro);
  add('determinism: A-pro Low = High = rerun', DET.every((o) => key(o) === key(DET[0])), DET.map((o) => o.quality).join(' / '));
}
const failed = rows.filter((r) => r.pass === false).length;
const nCrit = rows.filter((r) => r.pass !== null).length;
console.log(`\n${nCrit - failed}/${nCrit} criteria pass`);
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify({ criteria: rows }, null, 1) + '\n');
process.exit(failed ? 1 : 0);
