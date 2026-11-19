// @smoke --seconds 0 --shots 0
// Update 3 stage 2 "bosses-upgrade" quick autopilot check (slow, ~1 min): every boss / mini level (L5, L10, L15,
// L20, L25 Frosthorn trails, L30 Glacius stand-in with rage + safe spot, L35, L40, L45, L50) stays winnable with
// the upgraded bosses (rage, safe spots, lava Ironhorn, Candy Queen, 3-phase Tempest King). Shop state per level
// comes from a casual campaign with the foundation-campaign upgrade rule (Pip + Thunderclap); then 'pro' and
// 'casual' play each level with two loadouts (Pip + Thunderclap, Cinder + Emberstorm), up to 3 seeds each.
// Pass = every (level, profile, loadout) wins within 3 tries. Stage 3 balance (scripts/balance/CHANGELOG.md
// "Update 3"): the Candy Kingdom / Storm Citadel bosses (L40, L45, L50) are meant to be genuinely hard, so there
// the casual bot is reported only (casualHard) and only the pro bot must win within 3.
// After update 3 the owner asked for L50 to be the hardest level: there the pro bot gets FINAL_TRIES (casual keeps
// 3), Cinder + Emberstorm (both weak vs the Tempest King, shown in the Armory; it wins with full shop upgrades) is
// reported only (finalWeak), and a strong pick vs the storm lord (Cinder + Spectra) must win instead (scripts/balance/
// CHANGELOG2.md). `kept` stays like-for-like: the two LOADOUTS only.
// Reports per try: arena squad > squad left / fight
// seconds, safe spots (s) and rages (r); per level the mean share of the arena squad kept; per profile the share
// of the squad each safe-spot blast took. window.__bpGuard overrides the Tempest King's storm shield (safeGuard).
const g = window.__game, d = g.debug;
g.loop.stop();
const { upgradeCost } = await import('/src/data/shop.js');
const CHECK = window.__bpLevels || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const BD = await import('/src/data/bosses.js');
const tk = BD.bossDef('tempestking'), guard0 = tk.safeGuard;
if (window.__bpGuard != null) tk.safeGuard = window.__bpGuard;
const LOADOUTS = window.__bpLoadouts || [['pip', 'thunderclap'], ['cinder', 'emberstorm']];
const last = Math.max(...CHECK);
let bossT0 = null, safes = 0, rages = 0, sq0 = 0, safeN0 = 0, curProf = null;
const safeLoss = {}; // profile -> [share of the squad each safe-spot blast took]
g.events.on('run:phase', (p) => { if (p.phase === 'boss') { bossT0 = g.run.time; sq0 = g.squad.count; } });
g.events.on('boss:safespot', () => { safes++; safeN0 = g.squad.count; });
g.events.on('boss:attack', (p) => { if (p.attack === 'safespot' && safeN0 > 0 && curProf) (safeLoss[curProf] = safeLoss[curProf] || []).push((safeN0 - g.squad.count) / safeN0); });
g.events.on('boss:rage', () => rages++);
const buy = () => {
  for (let k = 0; k < 60; k++) {
    const ups = g.save.data.upgrades;
    let best = null, bc = Infinity;
    for (const u of ['damage', 'rate', 'squad', 'tier']) { const c = upgradeCost(u, ups[u]); if (c != null && c < bc) { bc = c; best = u; } }
    if (!best || g.save.data.coins < bc) break;
    g.save.spend(bc); g.save.data.upgrades[best]++;
  }
};
function play(prof, seed, id) {
  d.setAutopilot(prof, seed, { crates: 'never', ability: true, loadout: 'keep' });
  bossT0 = null; safes = 0; rages = 0; sq0 = 0;
  d.startLevel(id);
  let s, guard = 0;
  do { s = d.simulate(30); guard++; } while (s.state === 'playing' && guard < 20);
  const r = s.result || {};
  return { win: !!r.win, squad: r.win ? r.squad : 0, sq0, sec: bossT0 != null ? Math.round(g.run.time - bossT0) : null, left: r.bossHp ? Math.round(r.bossHp / r.bossMax * 100) : null, safes, rages };
}
// A: casual campaign (shop rule) to the last checked level -> upgrade snapshot at each checked level
g.save.reset();
d.setLoadout('pip', 'thunderclap');
const snap = {}, camp = [];
let seed = 1;
for (let id = 1; id <= last; id++) {
  if (CHECK.includes(id)) snap[id] = { ...g.save.data.upgrades };
  let tries = 0, r;
  do { tries++; r = play('casual', seed++, id); buy(); } while (!r.win && tries < 5);
  if (CHECK.includes(id)) camp.push(`L${id}:${tries}${r.win ? '' : 'X'}`);
}
// B: each checked level x profile x loadout with the snapshot upgrades (fresh coins, nothing bought mid-check)
const rows = [], fails = [], stat = [], casualHard = [];
const CASUAL_HARD = 40;
const FINAL = 50, FINAL_TRIES = 5, FINAL_WEAK = 'emberstorm', finalWeak = [];
for (const id of CHECK) {
  const lo = id === FINAL && !window.__bpLoadouts ? LOADOUTS.concat([['cinder', 'spectra']]) : LOADOUTS;
  for (const [hero, weapon] of lo) {
    for (const prof of ['pro', 'casual']) {
      g.save.update((dd) => { Object.assign(dd.upgrades, snap[id]); });
      d.setLoadout(hero, weapon, { save: true });
      const tries = [];
      let won = false;
      curProf = prof;
      const n = id === FINAL && prof === 'pro' ? FINAL_TRIES : 3;
      for (let k = 0; k < n && (!won || window.__bpAll); k++) {
        const r = play(prof, 7000 + id * 13 + k * 101 + (hero === 'pip' ? 0 : 50), id);
        tries.push(r.win ? `W${r.sq0}>${r.squad}/${r.sec}s s${r.safes}r${r.rages}` : `L${r.sq0}>${r.left != null ? 'b' + r.left + '%' : 'run'}/${r.sec}s s${r.safes}r${r.rages}`);
        stat.push({ id, prof, hero, weapon, win: r.win, kept: r.sq0 ? r.squad / r.sq0 : 0, sec: r.sec });
        won = won || r.win;
      }
      rows.push(`L${id} ${hero}+${weapon} ${prof}: ${tries.join(' ')}`);
      if (!won && id === FINAL && weapon === FINAL_WEAK) finalWeak.push(`L${id} ${hero}+${weapon} ${prof}`);
      else if (!won && (prof === 'pro' || id < CASUAL_HARD)) fails.push(`L${id} ${hero}+${weapon} ${prof}: ${n} losses`);
      else if (!won) casualHard.push(`L${id} ${hero}+${weapon}`);
    }
  }
}
g.save.reset();
d.setAutopilot(false);
tk.safeGuard = guard0;
// share of the arena squad kept per level (mean over every try): L50 should be the hardest fight
const kept = {};
for (const id of CHECK) { const l = stat.filter((x) => x.id === id && LOADOUTS.some(([h, w]) => h === x.hero && w === x.weapon)); kept[id] = Math.round(l.reduce((a, x) => a + x.kept, 0) / l.length * 100) + '%'; }
const safe = {};
for (const [p, l] of Object.entries(safeLoss)) safe[p] = { blasts: l.length, meanLoss: Math.round(l.reduce((a, x) => a + x, 0) / l.length * 100) + '%', maxLoss: Math.round(Math.max(...l) * 100) + '%' };
return { pass: fails.length === 0, fails, casualHard, finalWeak, camp, kept, safe, guard: tk.safeGuard, ups: snap, rows };
