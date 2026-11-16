// @smoke --seconds 0 --shots 0
// Update 3 stage 2 "bosses-upgrade": RAGE at 25% for every boss (flag, boss:rage, HUD flash + red bar, aura,
// attacks ~1.6x as often, warnings never under 0.9 s), the shared SAFE SPOT step (world bosses at each phase
// change, minis never; >= 1.8 s, r 1.8-2.4 away from the squad, loss capped at 35% and never a wipe, shield = no
// loss, the pro autopilot walks into it and loses less than a squad that stays put), Ironhorn's forge lava trails
// + magma-stomp embers (frost trails as Frosthorn, nothing in the sky), lava strips burn members standing in them
// (rate-limited), the Candy Queen's jelly brood / syrup / candy canes, and the Tempest King's 3 phases (PHASE n
// banner, forge + frost attacks in phase 2, candy + sky attacks in phase 3, a safe spot at each change, bar marks).
// Review fixes: the safe circle always stays inside the red sheet and the sheet's hole is really cut out (triangle
// area = sheet - circle), the gumball kills nothing before its warning ends (even at the 0.9 s floor), kill()
// works through the storm shield, and the Candy Queen's brood wears jelly coats.
// Runs on High and Low. When run by the screenshot harness, window.__shot(name) saves pictures of each look.
const g = window.__game, d = g.debug;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, wait = 380, keep = '') => {
  if (!window.__shot) return;
  await sleep(wait);
  // HUD alerts run on wall-clock time (the scenario simulates faster): hide the ones this picture is not about
  for (const sel of ['.boss-card', '.phase-alert', '.rage-alert', '.safe-call']) if (!keep.includes(sel)) document.querySelectorAll(sel).forEach((e) => e.classList.add('hidden'));
  if (keep.includes('.safe-call') && g.telegraph.active.some((h) => h.kind === 'safe')) document.querySelector('.safe-call').classList.remove('hidden');
  g.sync(1 / 60); g.engine.render(); await window.__shot(name);
};
const { RAGE, SAFE_SPOT } = await import('/src/data/bosses.js');
const { sheetArea, sheetHalfW, SAFE_HW } = await import('/src/game/telegraph.js');
const { safeSpot } = await import('/src/game/bosses/attacks.js');
g.loop.stop();
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
const fails = [], info = {};
const step = (sec, fn) => { for (let i = 0; i < Math.round(sec * 30) && g.state === 'playing'; i++) { g.step(1 / 30); if (fn) fn(); } g.sync(1 / 30); };
const evs = [];
for (const n of ['boss:rage', 'boss:phase', 'boss:safespot', 'boss:attack']) g.events.on(n, (p) => evs.push({ n, p }));
const hudOn = (sel) => { const e = document.querySelector(sel); return !!e && !e.classList.contains('hidden'); };
/** Arena run against one boss (logic only), returns the boss once it is fighting. */
function arena(boss, theme = 'noon', world = 1, troops = 60, opts = {}) {
  d.setAutopilot(opts.bot || false, 7);
  d.startCustom({ theme, world, length: 14, boss });
  if (troops > 1) d.give('troops', troops - 1);
  for (let i = 0; i < 400 && (!g.boss || g.boss.state !== 'fight'); i++) g.step(1 / 30);
  if (opts.noGuns !== false) g.weapons.enabled = false;
  evs.length = 0;
  return g.boss;
}

for (const q of ['high', 'low']) {
  g.applyQuality(q);
  // ---------------- rage on every boss ----------------
  for (const [type, theme, world, skin] of [['grawlstone', 'storm', 1, null], ['oculon', 'citadel', 5, 'citadel'], ['mothermurk', 'candy', 4, 'candy'], ['ironhorn', 'forge', 2, null], ['tempestking', 'citadelNight', 5, null], ['glacius', 'frost', 3, 'frost']]) {
    const b = arena({ type, hp: 100000, tier: 5, skin }, theme, world, 40);
    if (!b || b.state !== 'fight') { fails.push(`${type}/${q}: no fight`); continue; }
    b.damage(b.hp - 30000);                    // 30%: past every phase change, not raging yet
    if (b.rage) fails.push(`${type}/${q}: rage at 30%`);
    b.safeQueued = false;
    const mean = () => { let s = 0; for (let i = 0; i < 60; i++) s += b.nextCooldown(); return s / 60; };
    const calm = mean();
    b.damage(6000);                            // 24%
    const angry = mean();
    const ratio = calm / angry;
    const ev = evs.find((e) => e.n === 'boss:rage');
    if (!b.rage || !ev) fails.push(`${type}/${q}: no rage at 24% (${b.rage}, ${!!ev})`);
    if (Math.abs(ratio - RAGE.cadence) > 0.25) fails.push(`${type}/${q}: rage cadence x${ratio.toFixed(2)}`);
    step(0.4);
    if (!hudOn('.rage-alert')) fails.push(`${type}/${q}: no RAGE! flash`);
    if (!document.querySelector('.boss-bar').classList.contains('rage')) fails.push(`${type}/${q}: boss bar not raging`);
    const aura = b.effects.x.rageAura;
    if (!aura || !aura.on || !aura.s.visible) fails.push(`${type}/${q}: no rage aura`);
    if (q === 'high' && (type === 'ironhorn' || type === 'tempestking' || type === 'mothermurk')) await shot(`rage-${type}`, 200, '.rage-alert');
    // warnings never under 0.9 s, even raging and deep into the soft enrage
    b.t = 75;
    let minWarn = 9, n = 0;
    // (troops topped up: a wiped squad would end the run and leave a result screen over the next pictures)
    step(10, () => { if (g.squad.count < 15) d.give('troops', 30); for (const h of g.telegraph.active) { if (h.t < 0.05) n++; minWarn = Math.min(minWarn, h.duration); } });
    if (n > 0 && minWarn < 0.9) fails.push(`${type}/${q}: a ${minWarn.toFixed(2)} s warning while raging`);
    info[`rage-${type}-${q}`] = { ratio: Math.round(ratio * 100) / 100, minWarn: Math.round(minWarn * 100) / 100, warnings: n };
  }

  // ---------------- safe spot ----------------
  const safeRun = (bot, shield) => {
    const b = arena({ type: 'tempestking', hp: 100000, tier: 6 }, 'citadel', 5, 160, { bot });
    if (shield) d.give('shield');
    b.cooldown = 99; b.attack = null;        // nothing but the safe spot
    b.damage(35000);
    if (!b.safeQueued) fails.push(`safe/${q}: not queued at the phase change`);
    b.cooldown = 0;
    let mark = null, before = 0, c = null;
    for (let i = 0; i < 60 && !mark; i++) { g.step(1 / 30); mark = g.telegraph.active.find((h) => h.kind === 'safe'); }
    if (!mark) { fails.push(`safe/${q}: no safe telegraph`); return null; }
    c = b.squadCenter(); before = g.squad.count;
    const r = { x: mark.x, r: mark.r, dur: mark.duration, dx: Math.abs(mark.x - c.x), hud: false };
    if (Math.abs(mark.x) + mark.r > SAFE_HW - 0.05) fails.push(`safe/${q}: circle x ${mark.x} r ${mark.r} crosses the sheet edge`);
    b.cooldown = 99;
    step(0.5); r.hud = hudOn('.safe-call');
    return { b, mark, before, r };
  };
  const finish = (s) => { for (let i = 0; i < 90 && !s.mark.fired; i++) g.step(1 / 30); step(0.2); s.b.cooldown = 99; return s.before - g.squad.count; };
  const still = safeRun(false);
  if (still) {
    const { r } = still;
    if (r.dur < 1.8) fails.push(`safe/${q}: ${r.dur} s warning`);
    if (r.r < SAFE_SPOT.r0 - 1e-6 || r.r > SAFE_SPOT.r1 + 1e-6) fails.push(`safe/${q}: radius ${r.r}`);
    if (r.dx < 2.4) fails.push(`safe/${q}: spot only ${r.dx.toFixed(2)} u from the squad`);
    if (!r.hud) fails.push(`safe/${q}: no MOVE TO THE SAFE SPOT call`);
    step(0.6); await shot(q === 'high' ? 'safe-spot' : 'safe-spot-low', 100, '.safe-call');
    const lost = finish(still);
    if (!(lost > 0) || lost > Math.ceil(still.before * SAFE_SPOT.maxLoss) || g.squad.count < 1) fails.push(`safe/${q}: standing still lost ${lost} of ${still.before}`);
    info[`safe-${q}`] = { ...r, stillLost: lost };
    const pro = safeRun('pro');
    if (pro) {
      const lp = finish(pro);
      info[`safe-${q}`].proLost = lp;
      if (lp >= lost) fails.push(`safe/${q}: pro autopilot lost ${lp} >= standing still ${lost}`);
      if (q === 'high') await shot('safe-spot-blast', 60);
    }
    const sh = safeRun(false, true);
    if (sh) { const ls = finish(sh); if (ls !== 0) fails.push(`safe/${q}: shielded squad lost ${ls}`); }
  }
  // the red sheet's hole is really cut out (triangulated area = sheet - circle), also at the road edge
  {
    const bad = [];
    for (const [x, r] of [[-3.3, 2.4], [-3.0, 2.35], [-3.3, 2.1], [3.0, 2.4], [3.3, 2.4], [0, 1.8], [-2.8, 2.4], [2.9, 2.1]]) {
      const h = g.telegraph.safe(x, -60, r, 2);
      const a = sheetArea(h.v.sheet.geometry), want = 2 * sheetHalfW(x, r) * 25 - Math.PI * r * r;
      if (Math.abs(a - want) / want > 0.01) bad.push(`${x}/${r}: ${a.toFixed(1)} vs ${want.toFixed(1)}`);
      g.telegraph.cancel(h);
    }
    g.telegraph.update(0);
    if (bad.length) fails.push(`safe sheet/${q}: hole not cut ${bad.join(', ')}`);
    // every picked spot keeps |x| + r inside the sheet (squad on the left, the middle and the right)
    const b = arena({ type: 'tempestking', hp: 100000, tier: 6 }, 'citadel', 5, 160);
    b.cooldown = 99;
    let worst = 0;
    for (let k = 0; k < 30; k++) {
      g.squad.leader.x = [-4, -2, 0, 2, 4][k % 5];
      for (const m of g.squad.members) m.x = g.squad.leader.x;
      const a = safeSpot(b);
      worst = Math.max(worst, Math.abs(a.mark.x) + a.mark.r);
      a.cancel();
    }
    g.telegraph.update(0);
    if (worst > SAFE_HW - 0.05) fails.push(`safe/${q}: a spot reaches ${worst.toFixed(2)} (sheet half-width ${SAFE_HW})`);
    info[`safe-edge-${q}`] = Math.round(worst * 100) / 100;
  }
  // kill() works through the Tempest King's storm shield (guardMul < 1 during his safe-spot step)
  {
    const b = arena({ type: 'tempestking', hp: 100000, tier: 6 }, 'citadel', 5, 60);
    b.cooldown = 99; b.attack = null;
    b.damage(35000); b.cooldown = 0;
    for (let i = 0; i < 60 && !(b.attack && b.attack.safe); i++) g.step(1 / 30);
    g.step(1 / 30);
    const guard = b.guardMul;
    b.kill();
    if (!(guard < 1) || b.alive) fails.push(`storm shield/${q}: guard ${guard}, alive after kill() ${b.alive}`);
    step(2.5);
  }
  // the gumball kills nothing before its lane warning ends, even raging deep into the soft enrage (0.9 s floor)
  {
    const b = arena({ type: 'tempestking', hp: 100000, tier: 6 }, 'citadelNight', 5, 160);
    b.cooldown = 99; b.attack = null;
    b.damage(b.hp - 20000);                  // phase 3 + rage
    b.safeQueued = false; b.cooldown = 99;
    b.t = 75;
    b.attack = b.startAttack('gumball', b.def.attacks.find((a) => a.id === 'gumball'));
    const mark = g.telegraph.active.find((h) => h.kind === 'lane' && h.attack === 'gumball');
    const n0 = g.squad.count;
    let early = 0;
    for (let i = 0; i < 120 && b.attack; i++) { g.step(1 / 30); b.cooldown = 99; if (mark && !mark.fired) early = Math.max(early, n0 - g.squad.count); }
    const lost = n0 - g.squad.count;
    if (!mark || mark.duration > 0.95 || early > 0 || lost <= 0) fails.push(`gumball/${q}: warn ${mark && mark.duration.toFixed(2)} s, ${early} died before it ended, ${lost} in all`);
    info[`gumball-${q}`] = { warn: mark && Math.round(mark.duration * 100) / 100, early, lost };
  }
  // minis never dodge-step
  {
    const b = arena({ type: 'oculon', hp: 100000, tier: 6, skin: 'citadel', mini: true }, 'citadel', 5, 40);
    b.damage(51000);
    let safe = 0;
    step(5, () => { if (g.telegraph.active.some((h) => h.kind === 'safe')) safe++; });
    if (b.safeAuto || safe) fails.push(`mini/${q}: safe spot on a mini-boss`);
  }

  // ---------------- Ironhorn: forge lava, frost trails, sky none ----------------
  for (const [theme, world, skin, trail] of [['forge', 2, null, 'lava'], ['frost', 3, 'frost', 'frost'], ['dawn', 1, null, null]]) {
    const b = arena({ type: 'ironhorn', hp: 100000, tier: 5, skin }, theme, world, 60, { bot: 'pro' });
    b.cooldown = 99;
    b.attack = b.startAttack('charge', b.def.attacks.find((a) => a.id === 'charge'));
    let burns = 0, shotTaken = false;
    for (let i = 0; i < 150; i++) {
      g.step(1 / 30);
      burns = Math.max(burns, b.burns.length);
      if (!shotTaken && b.burns.length && (q === 'high' || trail === 'lava')) { shotTaken = true; step(0.35); await shot(`${trail}-charge${q === 'low' ? '-low' : ''}`, 60); }
    }
    if (b.trail !== trail) fails.push(`ironhorn ${theme}/${q}: trail ${b.trail} != ${trail}`);
    if (!!burns !== !!trail) fails.push(`ironhorn ${theme}/${q}: ${burns} trails`);
    b.attack = b.startAttack('stomp', b.def.attacks.find((a) => a.id === 'stomp'));
    let circles = 0;
    let emberShot = false;
    for (let i = 0; i < 120; i++) {
      g.step(1 / 30);
      const n = g.telegraph.active.filter((h) => h.kind === 'circle').length;
      circles = Math.max(circles, n);
      if (b.attack === null) b.cooldown = 99;
      if (!emberShot && n >= 3 && q === 'high' && trail === 'lava' && b.effects.x.drops.some((o) => o.active)) { emberShot = true; await shot('magma-stomp-embers', 40); }
    }
    if (trail === 'lava' && circles < 3) fails.push(`ironhorn forge/${q}: magma stomp rained ${circles} embers`);
    if (trail !== 'lava' && circles) fails.push(`ironhorn ${theme}/${q}: embers outside the forge`);
  }
  // a lava strip burns members standing in it, at most `rate` per second
  {
    const b = arena({ type: 'ironhorn', hp: 100000, tier: 5 }, 'forge', 2, 80);
    b.cooldown = 99;
    const c = b.squadCenter(), n0 = g.squad.count;
    b.addBurn('lava', c.x - 1, c.x + 1, c.z - 3, c.z + 3, 2.3, 5);
    step(2.5);
    const lost = n0 - g.squad.count;
    if (lost < 3 || lost > 12) fails.push(`lava burn/${q}: ${lost} lost standing in a 2.3 s strip (rate 5)`);
    info[`burn-${q}`] = lost;
  }

  // ---------------- Candy Queen ----------------
  {
    const b = arena({ type: 'mothermurk', hp: 100000, tier: 6, skin: 'candy' }, 'candy', 4, 60, { bot: 'pro' });
    const ids = b.attackList().map((a) => a.id);
    if (b.name !== 'CANDY QUEEN' || !ids.includes('cane')) fails.push(`candy/${q}: ${b.name} ${ids}`);
    b.cooldown = 99;
    const r = {};
    for (const id of ['cane', 'puddle', 'summon']) {
      b.attack = b.startAttack(id, b.attackList().find((a) => a.id === id));
      let canes = 0, syrup = 0, en0 = g.horde.count, en = 0, shotTaken = false, coats = 0, jellyShot = false;
      for (let i = 0; i < 100; i++) {
        g.step(1 / 30);
        if (!b.attack) b.cooldown = 99;
        canes = Math.max(canes, b.effects.x.canes.filter((o) => o.active).length);
        syrup = Math.max(syrup, b.effects.puddles.filter((p) => p.active && p.rim.material.color.getHexString() === 'ffb07a').length);
        en = Math.max(en, g.horde.count - en0);
        coats = Math.max(coats, b.effects.x.brood.length);
        if (id === 'summon' && i === 50) { g.sync(1 / 30); const jm = b.effects.x.jellies; if (!jm || jm.count !== b.effects.x.brood.length || !jm.visible) fails.push(`candy/${q}: ${jm && jm.count} jelly coats drawn for ${b.effects.x.brood.length}`); }
        if (!jellyShot && q === 'high' && id === 'summon' && coats >= 10 && i > 40) { jellyShot = true; g.sync(1 / 30); await shot('candy-queen-jelly-brood', 40); }
        if (!shotTaken && q === 'high' && id === 'cane' && canes >= 3) { shotTaken = true; g.sync(1 / 30); await shot('candy-queen-canes', 40); }
      }
      r[id] = { canes, syrup, enemies: en, coats };
    }
    if (!r.cane.canes) fails.push(`candy/${q}: no candy canes`);
    if (!r.puddle.syrup) fails.push(`candy/${q}: no syrup puddle`);
    if (!r.summon.enemies) fails.push(`candy/${q}: no jelly brood`);
    if (r.summon.coats < Math.min(10, r.summon.enemies)) fails.push(`candy/${q}: ${r.summon.coats} jelly coats for ${r.summon.enemies} minions`);
    if (r.cane.coats || r.puddle.coats) fails.push(`candy/${q}: jelly coats outside the summon`);
    info[`candy-${q}`] = r;
    if (q === 'high') { step(0.6); await shot('candy-queen', 60); }
  }

  // ---------------- Tempest King: 3 phases ----------------
  {
    const b = arena({ type: 'tempestking', hp: 100000, tier: 6 }, 'citadelNight', 5, 220, { bot: 'pro', noGuns: false });
    const marks = document.querySelectorAll('.boss-marks i').length;
    if (marks !== 3) fails.push(`tempest/${q}: ${marks} bar marks`);
    const seen = { 1: new Set(), 2: new Set(), 3: new Set() };
    const record = () => { if (b.attack && b.attack !== record.last) { record.last = b.attack; } };
    g.events.on('boss:attack', (p) => { if (g.boss === b) seen[b.phase].add(p.attack); });
    step(9, record);
    if (q === 'high') await shot('tempest-phase1', 60);
    b.damage(b.hp - 65000);
    step(0.3);
    const ph2 = evs.find((e) => e.n === 'boss:phase' && e.p.phase === 2);
    if (!ph2 || ph2.p.phases !== 3) fails.push(`tempest/${q}: no 3-phase boss:phase 2`);
    if (!hudOn('.phase-alert') || !/PHASE 2/.test(document.querySelector('.phase-alert').textContent)) fails.push(`tempest/${q}: no PHASE 2 banner`);
    if (q === 'high') await shot('tempest-phase2-banner', 250, '.phase-alert');
    if (g.squad.count < 120) d.give('troops', 160);
    let p2shot = false;
    for (let i = 0; i < 14 * 30 && g.state === 'playing'; i++) {
      g.step(1 / 30);
      if (g.squad.count < 60) d.give('troops', 120);
      // a phase-2 world attack on screen: ember drops falling or a frozen lane
      if (!p2shot && q === 'high' && (b.effects.x.drops.some((o) => o.active && o.kind === 'ember' && o.t > 0.25) || b.effects.x.strips.some((o) => o.active && o.kind === 'frost' && o.t > 0.3))) { p2shot = true; await shot('tempest-phase2', 20); }
    }
    b.damage(b.hp - 32000);
    step(0.3);
    if (!hudOn('.phase-alert') || !/PHASE 3/.test(document.querySelector('.phase-alert').textContent)) fails.push(`tempest/${q}: no PHASE 3 banner`);
    if (q === 'high') await shot('tempest-phase3-banner', 250, '.phase-alert');
    if (g.squad.count < 120) d.give('troops', 160);
    let p3shot = false;
    for (let i = 0; i < 16 * 30 && g.state === 'playing'; i++) {
      g.step(1 / 30);
      if (g.squad.count < 60) d.give('troops', 120);
      // the candy gumball rolling or the Grawlstone rocks falling
      if (!p3shot && q === 'high' && (b.effects.x.gums.some((o) => o.active && o.t > 0.3) || b.effects.x.drops.some((o) => o.active && o.kind === 'rock' && o.t > 0.15))) { p3shot = true; await shot('tempest-phase3', 20); }
    }
    const safes = evs.filter((e) => e.n === 'boss:safespot').length;
    if (safes !== 2) fails.push(`tempest/${q}: ${safes} safe spots (want one per phase change)`);
    for (const a of ['embers', 'freeze']) if (!seen[2].has(a)) fails.push(`tempest/${q}: phase 2 never used ${a}`);
    for (const a of ['roll', 'slam']) if (!seen[3].has(a)) fails.push(`tempest/${q}: phase 3 never used ${a === 'roll' ? 'the gumball' : 'the rock slam'}`);
    if ([...seen[1]].some((a) => a === 'embers' || a === 'freeze')) fails.push(`tempest/${q}: world attacks in phase 1`);
    info[`tempest-${q}`] = { p1: [...seen[1]], p2: [...seen[2]], p3: [...seen[3]], safes, squad: g.squad.count };
    b.kill();
    step(3);
    if (g.state !== 'result' && g.state !== 'playing') fails.push(`tempest/${q}: state ${g.state} after the kill`);
  }
}
g.applyQuality('high');
d.setAutopilot(false);
g.toTitle();
return { pass: fails.length === 0, fails, info };
