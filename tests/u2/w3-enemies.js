// @smoke --seconds 0 --shots 0
// Update 3 stage 3 "enemies": the five new Murklings (Boomling swell + burst, Mendling heal aura, Broodling
// Hive pops capped, Spitling holds its range and lobs telegraphed goo that the autopilot sees as danger,
// Flapling hovers then dives), ELITE versions (x3 hp, bigger, gold rim attribute, halo on High only, counted
// in run.stats.elites), the smarter-enemy rules switching on by world (sprint, sidestep, shield turning +
// front-only shields; endless / custom runs = world 1), and the wave split (probe / held rush: counts, the
// hold at the edge of view, the pause, the x1.25 rush speed, 3 waves for the final rush, no split for boss
// summons / endless / custom runs / waves:false), deterministic, on High and Low.
// When run by the screenshot harness, window.__shot(name) saves a picture of each type + an elite group.
const g = window.__game, d = g.debug;
g.loop.stop();
d.setAutopilot(false);
const { horde } = await import('/src/data/levels.js');
const { ENEMIES, ENEMY_TYPES, ENEMY_INDEX, ELITE, HORDE_AI, WAVES } = await import('/src/data/enemies.js');
const { MURKLING_SKINS, buildMurklingGeometry } = await import('/src/models/murklings.js');
const ops = await import('/src/game/hordeops.js');
const { aiFor } = await import('/src/game/hordeai.js');
const { SFX } = await import('/src/audio/sfxdefs.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const frames = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.sync(1 / 60); } };
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const H = () => g.horde;
const r2 = (v) => Math.round(v * 100) / 100;
const NEW = ['blaster', 'healer', 'spawner', 'sniper', 'flyer'];
const run = (def) => { d.startCustom({ theme: 'noon', length: 900, speed: 9, ...def }); g.weapons.enabled = false; };
const spawn = (ev) => { const n0 = H().list.length; H().spawnWave({ lane: 'both', ...ev }); return H().list.slice(n0); };
const near = (k) => -g.squad.leader.z + k; // event `at` k u ahead of Pip

// ---------------- data, models, skins, sounds ----------------
for (const t of NEW) {
  ok(ENEMY_TYPES.includes(t) && ENEMIES[t] && ENEMY_INDEX[t] >= 5, `${t}: not a registered type`);
  const geo = buildMurklingGeometry(t);
  const tris = geo.attributes.position.count / 3;
  ok(tris > 40 && tris < 420, `${t}: ${tris} triangles`);
  for (const k of Object.keys(MURKLING_SKINS)) {
    ok(!!MURKLING_SKINS[k][t], `${t}: no ${k} skin`);
    ok(buildMurklingGeometry(t, k).attributes.color.count === geo.attributes.color.count, `${t}/${k}: skin changes the vertex count`);
  }
}
for (const k of ['swell', 'heal', 'brood', 'spit', 'splat', 'dive', 'rush']) ok(!!SFX[k], `sfx ${k} missing`);
ok(HORDE_AI.length === 6 && Object.keys(HORDE_AI[1]).length === 0, 'world 1 has smarter-enemy rules');

for (const q of ['high', 'low']) {
  g.applyQuality(q);
  const I = (info[q] = {});

  // ---------------- Boomling ----------------
  {
    run({ speed: 9 });
    d.give('troops', 60);
    frames(2);
    const before = g.squad.count;
    const [b] = spawn({ at: near(5), count: 1, mix: { blaster: 1 }, width: 0.5 });
    b.x = g.squad.leader.x;
    let swelled = false, ringMax = 0;
    for (let i = 0; i < 120 && H().aiStats.booms === 0; i++) {
      frames(1);
      if (b.state === 2) { swelled = true; ringMax = Math.max(ringMax, H().view.extras.rings.count); ok(H().count === 0, 'swelling Boomling still counted alive'); }
    }
    const lost = before - g.squad.count;
    I.boomling = { swelled, ringMax, lost, kills: H().aiStats.boomKills };
    ok(swelled && ringMax >= 2, `${q} boomling: no telegraphed swell (${swelled}, rings ${ringMax})`);
    ok(H().aiStats.booms === 1 && lost >= 1 && lost <= ENEMIES.blaster.boom.kills, `${q} boomling contact blast lost ${lost}`);
    // shot far away: harmless to the squad, takes the Murklings around it along
    const far = spawn({ at: near(34), count: 9, mix: { grunt: 1 }, width: 2, hpMul: 50 });
    const [b2] = spawn({ at: near(34), count: 1, mix: { blaster: 1 }, width: 0.5 });
    b2.x = far[0].x; b2.z = far[0].z - 0.4;
    const c0 = g.squad.count, k0 = g.run.kills;
    H().kill(b2, 'weapon');
    frames(30);
    I.boomFar = { squadLost: c0 - g.squad.count, kills: g.run.kills - k0 };
    ok(c0 === g.squad.count, `${q} far boomling hurt the squad`);
    ok(g.run.kills - k0 >= 3, `${q} far boomling burst killed ${g.run.kills - k0 - 1} Murklings`);
  }

  // ---------------- Mendling ----------------
  {
    run({ speed: 0.001 });
    frames(2);
    const gs = spawn({ at: near(30), count: 8, mix: { grunt: 1 }, width: 2, hpMul: 10 });
    const [m] = spawn({ at: near(31), count: 1, mix: { healer: 1 }, width: 0.5 });
    m.x = gs[0].x;
    for (const e of gs) e.hp = e.maxHp * 0.4;
    const hp0 = gs.reduce((s, e) => s + e.hp, 0);
    frames(130);
    const hp1 = gs.reduce((s, e) => s + e.hp, 0);
    I.mendling = { hp0: r2(hp0), hp1: r2(hp1), heals: H().aiStats.heals, healed: H().aiStats.healed };
    ok(hp1 > hp0 * 1.15 && hp1 <= gs.reduce((s, e) => s + e.maxHp, 0) + 1e-6, `${q} mendling healed ${r2(hp0)} -> ${r2(hp1)}`);
    ok(H().aiStats.heals >= 2 && m.hp === m.maxHp, `${q} mendling pulses ${H().aiStats.heals}`);
  }

  // ---------------- Broodling Hive ----------------
  {
    run({ speed: 0.001 });
    d.give('troops', 30);
    frames(2);
    const [hv] = spawn({ at: near(46), count: 1, mix: { spawner: 1 }, width: 0.5, hpMul: 200 });
    frames(60 * 4);
    const early = H().aiStats.broods;
    frames(60 * 12);
    const small = H().list.filter((e) => e.def.id === 'grunt' && e.size < 1).length;
    I.hive = { early, total: H().aiStats.broods, small, brood: hv.brood };
    ok(early >= 2, `${q} hive popped only ${early} in 4 s`);
    ok(hv.brood <= ENEMIES.spawner.brood.cap && H().aiStats.broods === hv.brood, `${q} hive cap: ${hv.brood}`);
    ok(small >= 1 || g.run.stats.membersLost > 0 || g.squad.count < 40, `${q} hive: no small Murklings seen`);
  }

  // ---------------- Spitling ----------------
  {
    run({ speed: 9 });
    d.give('troops', 50);
    frames(2);
    const sn = spawn({ at: near(60), count: 3, mix: { sniper: 1 }, width: 4 });
    let held = null, dangerSeen = 0, minT = 9;
    for (let i = 0; i < 60 * 9; i++) {
      frames(1);
      const L = g.squad.leader;
      if (!held && H().aiStats.spits > 0) held = sn.map((e) => r2(L.z - e.z));
      for (const s of H().shots) minT = Math.min(minT, s.T);
      if (g.hazards.danger.some((z) => z.spit)) dangerSeen++;
    }
    const st = H().aiStats;
    I.spitling = { held, spits: st.spits, splatKills: st.splatKills, dangerSeen, minT };
    ok(held && held.every((a) => a >= 28 && a <= ENEMIES.sniper.spit.far + 1), `${q} spitlings hold at ${held}`);
    ok(st.spits >= 6 && minT >= 0.9, `${q} spitlings fired ${st.spits} (min warning ${minT})`);
    ok(st.splatKills >= 1 && st.splatKills <= st.spits * ENEMIES.sniper.spit.kills, `${q} goo killed ${st.splatKills}`);
    ok(dangerSeen > 30, `${q} goo markers not in hazards.danger (${dangerSeen})`);
    ok(sn.every((e) => e.shots === ENEMIES.sniper.spit.shots || e.state !== 0), `${q} spitlings shots ${sn.map((e) => e.shots)}`);
  }

  // ---------------- Flapling ----------------
  {
    run({ speed: 9 });
    d.give('troops', 40);
    frames(2);
    const fl = spawn({ at: near(45), count: 4, mix: { flyer: 1 }, width: 3 });
    const y0 = Math.min(...fl.map((e) => e.y));
    const c0 = g.squad.count;
    let lowest = 9;
    for (let i = 0; i < 60 * 5; i++) { frames(1); for (const e of fl) if (e.state === 0 && g.squad.leader.z - e.z < 3) lowest = Math.min(lowest, e.y); }
    I.flapling = { y0: r2(y0), lowest: r2(lowest), dives: H().aiStats.dives, lost: c0 - g.squad.count };
    ok(y0 >= 2, `${q} flaplings start at y ${y0}`);
    ok(H().aiStats.dives >= 1 && lowest < 1, `${q} flaplings did not dive (${lowest})`);
    ok(c0 - g.squad.count >= 1, `${q} flaplings never reached the squad`);
  }

  // ---------------- Elites ----------------
  {
    run({ speed: 0.001 });
    frames(2);
    const es = spawn({ at: near(30), count: 20, mix: { grunt: 0.5, runner: 0.5 }, width: 6, elite: 0.5 });
    const el = es.filter((e) => e.elite);
    ok(el.length === 10, `${q} elite: 0.5 of 20 made ${el.length}`);
    ok(el.every((e) => e.maxHp === ENEMIES[e.def.id].hp * ELITE.hp && e.size === ELITE.size), `${q} elite hp / size`);
    ok(es.filter((e) => !e.elite).every((e) => e.maxHp === ENEMIES[e.def.id].hp && e.size === 1), `${q} plain hp / size`);
    const tk = spawn({ at: near(40), count: 6, mix: { grunt: 0.5, tank: 0.5 }, width: 4, eliteTypes: ['tank'] });
    ok(tk.every((e) => e.elite === (e.def.id === 'tank')), `${q} eliteTypes`);
    frames(2);
    const v = H().view, gi = ENEMY_INDEX.grunt;
    const gm = v.meshes[gi];
    let lit = 0; for (let i = 0; i < gm.n; i++) if (gm.el.array[i] > 0.5) lit++;
    const nEl = H().list.filter((e) => e.state === 0 && e.elite && e.type === gi).length;
    I.elite = { elites: H().info().elites, rim: lit, halos: v.extras.halos.count };
    ok(lit === nEl && lit > 0, `${q} elite rim attribute on ${lit} of ${nEl} elite Murklings`);
    ok(q === 'high' ? v.extras.halos.count === H().info().elites : v.extras.halos.count === 0, `${q} halos ${v.extras.halos.count}`);
    await shot(`elites-${q}`);
    const k0 = g.run.stats.elites || 0;
    for (const e of [...es, ...tk]) H().kill(e, 'weapon');
    ok((g.run.stats.elites || 0) - k0 === 13, `${q} run.stats.elites counted ${(g.run.stats.elites || 0) - k0}`);
    // one of each new type up close for the screenshots
    run({ speed: 0.001, theme: q === 'high' ? 'forge' : 'citadel', world: q === 'high' ? 2 : 5 });
    frames(2);
    NEW.forEach((t, k) => { const [e] = spawn({ at: near(9), count: 1, mix: { [t]: 1 }, width: 0.5 }); e.x = -3.6 + k * 1.8; e.z = g.squad.leader.z - 9; });
    NEW.forEach((t, k) => { const [e] = spawn({ at: near(14), count: 1, mix: { [t]: 1 }, width: 0.5, elite: 1 }); e.x = -3.6 + k * 1.8; e.z = g.squad.leader.z - 14; });
    g.timeScale = 1e-4; frames(2); await shot(`types-${q}`); g.timeScale = 1;
  }

  // ---------------- smarter enemies by world ----------------
  {
    const rules = [];
    for (let w = 1; w <= 5; w++) { run({ world: w, events: [] }); rules.push(H().ai); }
    ok(!rules[0].sprint && !rules[0].dodge && !rules[0].turn, 'world 1 has AI rules');
    ok(rules[1].sprint && rules[1].dodge && !rules[1].turn, 'world 2: sprint + sidestep, no shield turn');
    ok(rules[2].turn && rules[3].turn && rules[4].turn && rules[4].gruntSprint && rules[4].dodge > rules[1].dodge, 'worlds 3-5 rules');
    d.startEndless(3); ok(H().ai === HORDE_AI[1], 'endless is not on world 1 rules');
    d.startCustom({ theme: 'citadel' }); ok(H().ai === HORDE_AI[1], 'custom run without world/ai got AI rules');
    ok(aiFor({ mode: 'level', def: { ai: 4 } }) === HORDE_AI[4], 'def.ai not honoured');

    const sprintRun = (w) => {
      run({ world: w, speed: 0.001, events: [] });
      frames(2);
      const [rn] = spawn({ at: near(20), count: 1, mix: { runner: 1 }, width: 0.5 });
      let z0 = null, t = 0, spr = 1;
      for (let i = 0; i < 240; i++) { frames(1); const a = g.squad.leader.z - rn.z; if (a < 10 && a > 4) { if (z0 === null) z0 = rn.z; t += 1 / 60; spr = Math.max(spr, rn.spr); } }
      return { spr, v: z0 === null || !t ? 0 : r2((rn.z - z0) / t) };
    };
    const s1 = sprintRun(1), s2 = sprintRun(2);
    I.sprint = { w1: s1, w2: s2 };
    ok(s1.spr === 1 && s2.spr === HORDE_AI[2].sprint && s2.v > s1.v * 1.35, `${q} sprint w1 ${JSON.stringify(s1)} w2 ${JSON.stringify(s2)}`);

    const dodgeRun = (w) => {
      run({ world: w, speed: 9, events: [] });
      g.weapons.enabled = true;
      d.give('troops', 40);
      frames(2);
      spawn({ at: near(48), count: 40, mix: { grunt: 0.6, runner: 0.4 }, width: 8, hpMul: 400 });
      frames(60 * 3);
      return { dodges: H().aiStats.dodges, dodgers: H().list.filter((e) => e.dodge).length };
    };
    const d1 = dodgeRun(1), d2 = dodgeRun(2);
    I.sidestep = { w1: d1, w2: d2 };
    ok(d1.dodges === 0 && d1.dodgers === 0, `${q} world 1 sidesteps ${JSON.stringify(d1)}`);
    ok(d2.dodges >= 3 && d2.dodgers >= 6 && d2.dodgers <= 22, `${q} world 2 sidesteps ${JSON.stringify(d2)}`);

    for (const w of [1, 3]) {
      run({ world: w, speed: 0.001, events: [] });
      frames(2);
      g.input.setTarget(-4.5);
      frames(90);
      const [sh] = spawn({ at: near(30), count: 1, mix: { shield: 1 }, width: 0.5, hpMul: 50 });
      sh.x = 3.6;
      frames(40);
      const yaw = sh.yaw, want = Math.atan2(g.squad.leader.x - sh.x, g.squad.leader.z - sh.z);
      // front hit (from the squad side) is blocked, a flank hit from behind its shoulder goes through (world 3 only)
      const s0 = sh.shield, hp0 = sh.hp;
      ops.applyDamage(H(), sh, 1, 1, { el: 'neutral', shieldHits: 1, cause: 'weapon', sx: g.squad.leader.x, sz: g.squad.leader.z, events: false });
      const front = { shield: s0 - sh.shield, hp: r2(hp0 - sh.hp) };
      const s1b = sh.shield, hp1 = sh.hp;
      ops.applyDamage(H(), sh, 1, 1, { el: 'neutral', shieldHits: 1, cause: 'weapon', sx: sh.x + 12, sz: sh.z - 2, events: false });
      const flank = { shield: s1b - sh.shield, hp: r2(hp1 - sh.hp) };
      I[`shield_w${w}`] = { yaw: r2(yaw), front, flank };
      ok(front.shield === 1 && front.hp === 0, `${q} w${w} front hit not blocked ${JSON.stringify(front)}`);
      if (w === 1) ok(yaw === 0 && flank.shield === 1 && flank.hp === 0, `${q} w1 shield turned / flank went through ${JSON.stringify(I.shield_w1)}`);
      else ok(yaw < -0.2 && Math.abs(yaw - want) < 0.05 && flank.shield === 0 && flank.hp > 0, `${q} w3 shield did not turn / flank blocked ${JSON.stringify(I.shield_w3)}`);
    }
  }

  // ---------------- waves ----------------
  {
    const rushes = [];
    const off = g.events.on('horde:rush', (p) => rushes.push({ t: g.time, ...p }));
    run({ world: 2, speed: 9, events: [horde(150, 60, { grunt: 1 }, 'both', { hpMul: 1 })] });
    d.give('troops', 300);
    frames(2);
    const t0 = g.time;
    let ws = null;
    for (let i = 0; i < 600 && !ws; i++) { frames(1); if (H().waves.length) ws = H().waves.slice().sort((a, b) => a.k - b.k); }
    ok(ws && ws.length === 2, `${q} waves: ${ws && ws.length}`);
    if (ws) {
      const [w0, w1] = ws;
      const of = (w) => H().list.filter((e) => e.wave === w && e.state === 0);
      ok(w0.n === 18 && w1.n === 42 && w0.go && !w1.go, `${q} wave split ${w0.n}/${w1.n} go ${w0.go}/${w1.go}`);
      ok(Math.min(...of(w0).map((e) => e.z)) > Math.max(...of(w1).map((e) => e.z)), `${q} rush blob not behind the probe`);
      // hold at the edge of view
      let a0 = null, a1 = null, locked = 0;
      for (let i = 0; i < 60 * 8 && !w1.go; i++) {
        frames(1);
        if (w1.locked) {
          locked++;
          const front = g.squad.leader.z - Math.max(...of(w1).map((e) => e.z));
          if (locked === 10) a0 = front;
          if (locked === 70) a1 = front;
        }
      }
      I.hold = { a0: r2(a0), a1: r2(a1), locked };
      ok(a0 !== null && a1 !== null && Math.abs(a1 - a0) < 0.6 && a0 < 42 && a0 > 30, `${q} held wave drifts ${a0} -> ${a1}`);
      // released after the probe broke + the world-2 pause; then charges at x1.25
      ok(w1.go && rushes.length === 1 && rushes[0].index === 1, `${q} no release (${rushes.length})`);
      ok(w1.wait >= WAVES.pause[2] - 0.02 || w1.holdT > 8.9, `${q} pause ${r2(w1.wait)} < ${WAVES.pause[2]}`);
      const e1 = of(w1).sort((a, b) => a.z - b.z)[0];
      ok(e1 && e1.wmul === 1.25, `${q} rush speed mul ${e1 && e1.wmul}`);
      if (e1) {
        frames(3);
        const z0 = e1.z; frames(30);
        const v = (e1.z - z0) / 0.5;
        I.rushSpeed = r2(v);
        ok(Math.abs(v - 5.5 * 1.25) < 0.25, `${q} rush wave speed ${r2(v)} (want ${5.5 * 1.25})`);
      }
    }
    // final rush: 3 waves; no split for summons, custom runs, waves:false; a world's own pause
    run({ world: 5, speed: 9, events: [horde(120, 100, { grunt: 1 }, 'both', { rush: true })] });
    frames(60 * 6);
    const rw = H().waves.slice().sort((a, b) => a.k - b.k);
    ok(rw.length === 3 && rw.map((w) => w.n).join() === '25,35,40' && rw[1].delay === WAVES.pause[5] && rw[2].speed === 1.3, `${q} final rush waves ${rw.map((w) => w.n)}`);
    run({ world: 3, speed: 9, events: [horde(120, 60, { grunt: 1 }, 'both', { waves: false })] });
    frames(60 * 2); ok(H().waves.length === 0 && H().waveStats.split === 0, `${q} waves:false split`);
    run({ speed: 9, events: [horde(120, 60, { grunt: 1 })] }); // custom run, no world
    frames(60 * 2); ok(H().waveStats.split === 0, `${q} custom run split`);
    run({ world: 2, speed: 9, events: [] });
    frames(2); H().spawnWave({ at: near(30), count: 60, mix: { grunt: 1 }, lane: 'both' }); // boss summon path
    ok(H().waves.length === 0, `${q} summon split`);
    run({ world: 2, speed: 9, events: [horde(120, 12, { grunt: 1 })] });
    frames(60 * 2); ok(H().waveStats.split === 0, `${q} tiny horde split`);
    off();
  }
}
g.applyQuality('high');

// ---------------- determinism: same level twice, same horde ----------------
const sig = () => {
  d.startCustom({ world: 4, theme: 'candy', length: 500, speed: 10, events: [
    horde(90, 80, { grunt: 0.4, runner: 0.2, blaster: 0.1, healer: 0.1, sniper: 0.1, flyer: 0.1 }, 'both', { elite: 0.2 }),
    horde(160, 40, { shield: 0.5, spawner: 0.2, grunt: 0.3 }, 'both', { rush: true }),
  ] });
  d.give('troops', 80);
  d.simulate(14);
  let s = 0;
  for (const e of H().list) s += e.x * 3.1 + e.z * 1.7 + e.hp + (e.elite ? 5 : 0);
  return `${r2(s)}|${g.squad.count}|${g.run.kills}|${JSON.stringify(H().aiStats)}`;
};
const sA = sig(), sB = sig();
info.determinism = sA;
ok(sA === sB, `not deterministic: ${sA} vs ${sB}`);

return { pass: fails.length === 0, fails, info };
