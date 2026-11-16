// SPEC2 §2.10 / §9 foundation-crate: a crate in the leader's lane swaps the weapon and keeps the Mk; a bot with
// crates 'never' leaves it; every level crate is placed, >= 12 u clear of every event extent (chosen z printed);
// endless rows (crates aside) equal the shipped EndlessGen output for seeds 1-3, zones 1-6.
const g = window.__game, d = g.debug;
g.loop.stop();
const L = await import('/src/data/levels.js');
const E = await import('/src/data/endless.js');
const fails = [], placed = {};
// ---- 1. swap keeps the Mk ----
d.setLoadout('pip', 'thunderclap');
d.setAutopilot(false);
d.startCustom({ length: 200, events: [L.crate(40, 'L', 'glacier')] });
g.input.reset(-2.5);
d.setMk(3);
let s = d.simulate(7);
if (s.weapon !== 'glacier' || s.mk !== 3) fails.push(`swap: ${s.weapon} Mk ${s.mk}`);
// same weapon -> +1 Mk
d.startCustom({ length: 200, events: [L.crate(40, 'R', 'thunderclap')] });
g.input.reset(2.5);
d.setMk(2);
s = d.simulate(7);
if (s.weapon !== 'thunderclap' || s.mk !== 3) fails.push(`same weapon: ${s.weapon} Mk ${s.mk}`);
// ---- 2. bot with crates 'never' leaves a crate on its path ----
d.setAutopilot('pro', 1, { crates: 'never' });
d.startCustom({ length: 200, events: [L.crate(40, 'L', 'glacier')] });
s = d.simulate(7);
if (s.weapon !== 'thunderclap') fails.push(`'never' bot took the crate (${s.weapon})`);
d.setAutopilot('pro', 1, { crates: 'always' });
d.startCustom({ length: 200, events: [L.crate(40, 'L', 'glacier')] });
s = d.simulate(7);
if (s.weapon !== 'glacier') fails.push(`'always' bot missed the crate (${s.weapon})`);
d.setAutopilot(false);
// ---- 3. every level crate placed and clear ----
for (const lv of L.LEVELS) {
  const want = lv.crates || L.CRATES[lv.id] || []; // update 3: every def carries its crate plan (16-50 generated)
  const st = d.startLevel(lv.id).crates;
  if (st.length !== want.length) fails.push(`L${lv.id}: ${st.length} crates, want ${want.length}`);
  for (const [lane, weapon] of want) if (!st.some((c) => c.lane === lane && c.weapon === weapon)) fails.push(`L${lv.id}: ${lane} ${weapon} missing`);
  for (const c of st) {
    for (const e of lv.events) {
      if (e.type === 'crate' && e.at === c.at && e.weapon === c.weapon) continue;
      const a = e.at, b = e.at + (e.length || 0);
      if (c.at > a - 12 && c.at < b + 12) fails.push(`L${lv.id}: crate ${c.weapon}@${c.at} within 12 u of ${e.type}@${a}`);
    }
  }
  if (st.length) placed['L' + lv.id] = st.map((c) => `${c.lane} ${c.weapon} z=${c.at}`).join(', ');
}
// ---- 4. endless rows unchanged (hpMul only compared where the shipped tier walk stayed below 6) ----
const base = await (await fetch('/tests/u2/baseline/endless-5d67da5.json')).json();
const strip = (e, cmpHp) => { const o = { ...e }; if (!cmpHp) delete o.hpMul; return JSON.stringify(o); };
for (const seed of [1, 2, 3]) {
  const gen = new E.EndlessGen(seed);
  const zones = [gen.fill(E.ENDLESS.startClear, E.ENDLESS.bossEvery - E.ENDLESS.preBoss)];
  for (let z = 2; z <= 6; z++) zones.push(gen.fill((z - 1) * E.ENDLESS.bossEvery + E.ENDLESS.postBoss, z * E.ENDLESS.bossEvery - E.ENDLESS.preBoss));
  zones.forEach((rows, zi) => {
    const b = base.seeds[seed][zi];
    if (rows.length !== b.length) { fails.push(`endless seed ${seed} zone ${zi + 1}: ${rows.length} rows vs ${b.length}`); return; }
    for (let i = 0; i < rows.length; i++) {
      const cmpHp = 1 + Math.floor((rows[i].at - 18) / 220) < 6;
      if (strip(rows[i], cmpHp) !== strip(b[i], cmpHp)) { fails.push(`endless seed ${seed} zone ${zi + 1} row ${i} differs`); break; }
    }
  });
}
// in-game endless: a crate per zone from zone 2, from its own Rng (same seed -> same crate)
d.setAutopilot('pro', 1);
d.startEndless(5);
const z2 = () => g.run.eventsOf('crate').map((c) => `${c.lane}${c.weapon}@${c.at}`).join(',');
let guard = 0;
while (g.endless.zone < 2 && g.state === 'playing' && guard++ < 40) d.simulate(5);
const first = z2();
if (g.endless.zone >= 2 && !g.run.eventsOf('crate').length) fails.push('endless zone 2 has no crate');
d.startEndless(5); guard = 0;
while (g.endless.zone < 2 && g.state === 'playing' && guard++ < 40) d.simulate(5);
if (z2() !== first) fails.push('endless crates differ between identical runs');
d.setAutopilot(false);
d.toTitle();
return { pass: fails.length === 0, fails, placed, endlessCrates: first };
