// Update 3 stage 4 controls (STAGE4.md A): dodge roll, combo meter, formation button.
// 1. Formation: LINE at run start; F / the HUD button cycle LINE -> WEDGE -> CIRCLE; with 160 Raiders the shapes
//    differ as specified (Line widest + shallow, Wedge narrower than Line with its middle ahead of its sides, Circle
//    the most compact), the morph is smooth (no member jumps), squad.center() covers every member, damage
//    multipliers (Line 1.12 horde, Wedge 1.2 boss, Circle 0.9 + a ~25% shrug-off of enemy touches only).
// 2. Dodge: W / ArrowUp / a quick upward pointer flick roll (a sideways drag or slow drag does not, the flick does
//    not steer); the next loss event inside 0.6 s is skipped (once), gap / gate losses never; 4 s cooldown.
// 3. Combo: +1 per kill, reset by any loss, tiers x1.1 (25) / x1.2 (60) / x1.3 (120) on damage (hordeK / bossK)
//    and coins (fractional bonus), run.stats.maxCombo, combo:tier / combo:lost events.
// 4. HUD: combo meter shows / hides, formation label follows, dodge chip ring + tap, abilitySide 'left' layout.
// 5. Played: L3 + L12 casual autopilot runs with formation switches + dodges on High and Low throw nothing.
// When run by the screenshot harness (shots3.mjs) window.__shot saves the HUD, each formation and a mid-air roll.
const g = window.__game, d = g.debug, ui = g.ui;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const frames = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.sync(1 / 60); ui.hud.update(1 / 60); } };
const shot = async (name) => { if (window.__shot) { await new Promise((r) => setTimeout(r, 2100)); // CSS banners / pops settle (real time; game time is frozen)
    g.sync(1 / 60); ui.hud.update(1 / 60); g.engine.render(); await window.__shot(name); } };
const key = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };
const shape = () => {
  const ms = g.squad.members, L = g.squad.leader;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, mid = 0, nm = 0, side = 0, ns = 0;
  for (const m of ms) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); z0 = Math.min(z0, m.z); z1 = Math.max(z1, m.z); }
  const w = x1 - x0;
  for (const m of ms) { const u = Math.abs(m.x - L.x) / (w / 2); if (u < 0.2) { mid += m.z; nm++; } else if (u > 0.7) { side += m.z; ns++; } }
  return { w: +w.toFixed(2), depth: +(z1 - z0).toFixed(2), midZ: +(mid / Math.max(1, nm) - L.z).toFixed(2), sideZ: +(side / Math.max(1, ns) - L.z).toFixed(2) };
};
const covers = () => { const c = g.squad.center({ x: 0, z: 0, r: 0 }); let worst = 0; for (const m of g.squad.members) worst = Math.max(worst, Math.hypot(m.x - c.x, m.z - c.z) - c.r); return worst; };
const shotCase = !!window.__shot;
try { localStorage.removeItem('nimbusRaiders.hint.dodge'); } catch { /* */ }

for (const q of ['high', 'low']) {
  g.applyQuality(q);
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot(false);
  // ---------------- 1. formation ----------------
  g.startLevel(3);
  ok(g.formation.mode === 'line', `${q}: run starts in LINE (${g.formation.mode})`);
  g.squad.setCount(160, 'barrel'); g.horde.skipAll(); g.gates.skipAll(); g.barrels.skipAll();
  const shapes = {};
  for (const mode of ['line', 'wedge', 'circle']) {
    if (mode !== 'line') {
      const before = g.squad.members.map((m) => [m.x, m.z]);
      key('f');
      ok(g.formation.mode === mode, `${q}: F -> ${mode} (${g.formation.mode})`);
      g.step(1 / 60);
      let jump = 0; g.squad.members.forEach((m, i) => { jump = Math.max(jump, Math.abs(m.x - before[i][0])); });
      ok(jump < 0.5, `${q}: ${mode} morph is smooth (max sideways step ${jump.toFixed(2)})`);
    }
    frames(60);
    shapes[mode] = shape();
    ok(covers() < 0.35, `${q}: ${mode} squad.center covers every member (${covers().toFixed(2)})`);
    if (q === 'high' && shotCase) await shot(`formation-${mode}`);
  }
  info['shapes_' + q] = shapes;
  const { line: Ln, wedge: W, circle: Ci } = shapes;
  ok(Ln.w > W.w + 0.6 && Ln.w > Ci.w + 0.6, `${q}: LINE is the widest (${Ln.w} vs wedge ${W.w}, circle ${Ci.w})`);
  ok(Ln.depth < Ci.depth && Ln.w / Ln.depth > 1.7, `${q}: LINE is flat (${Ln.w} x ${Ln.depth})`);
  ok(W.midZ < W.sideZ - 0.8, `${q}: WEDGE middle leads its sides (mid ${W.midZ}, sides ${W.sideZ})`);
  ok(Ci.w < Ln.w && Ci.w * Ci.depth < W.w * W.depth, `${q}: CIRCLE is the most compact`);
  key('f'); ok(g.formation.mode === 'line', `${q}: F wraps back to LINE`);
  const F = g.formation;
  F.set('line'); ok(Math.abs(F.hordeK - 1.12) < 1e-9 && F.bossK === 1, `${q}: LINE muls ${F.hordeK}/${F.bossK}`);
  F.set('wedge'); ok(F.hordeK === 1 && Math.abs(F.bossK - 1.2) < 1e-9, `${q}: WEDGE muls ${F.hordeK}/${F.bossK}`);
  F.set('circle'); ok(Math.abs(F.hordeK - 0.9) < 1e-9 && Math.abs(F.bossK - 0.9) < 1e-9, `${q}: CIRCLE muls`);
  // Circle shrug-off: ~25% of enemy touches, never gap / gate / blade
  g.squad.setCount(400, 'barrel');
  let n0 = g.squad.count;
  for (let i = 0; i < 200; i++) g.squad.killMember(0, 'horde');
  const kept = 200 - (n0 - g.squad.count);
  ok(kept > 30 && kept < 72, `${q}: CIRCLE shrugs off ~25% of touches (${kept}/200)`);
  n0 = g.squad.count; g.squad.remove(20, 'blade');
  ok(n0 - g.squad.count === 20, `${q}: CIRCLE does not shrug off blades`);
  F.set('line'); n0 = g.squad.count;
  for (let i = 0; i < 50; i++) g.squad.killMember(0, 'horde');
  ok(n0 - g.squad.count === 50, `${q}: LINE never shrugs off`);
  // damage hook: one enemy hit with LINE vs WEDGE vs CIRCLE
  g.startLevel(3); g.squad.setCount(30, 'barrel'); frames(300);
  const e = g.horde.list.find((x) => x.state === 0 && !x.shield);
  if (e) {
    const hp0 = e.hp = 1000; e.maxHp = 1000;
    F.set('line'); g.horde.applyDamage(e, 10, 10, { el: 'neutral', cause: 'weapon', events: false }); const dl = hp0 - e.hp;
    F.set('circle'); e.hp = hp0; g.horde.applyDamage(e, 10, 10, { el: 'neutral', cause: 'weapon', events: false }); const dc = hp0 - e.hp;
    ok(Math.abs(dl / dc - 1.12 / 0.9) < 0.01, `${q}: applyDamage follows the formation (${dl.toFixed(2)} vs ${dc.toFixed(2)})`);
    F.set('line');
  } else fails.push(`${q}: no enemy for the damage check`);

  // ---------------- 2. dodge ----------------
  g.startLevel(3); g.squad.setCount(50, 'barrel'); frames(30);
  const D = g.dodge;
  ok(D.ready && !D.state().rolling, `${q}: dodge ready at run start`);
  key('w');
  ok(D.state().rolling && D.state().armed && D.cd > 3.9, `${q}: W rolls (${JSON.stringify(D.state())})`);
  let c0 = g.squad.count; g.squad.remove(4, 'bomb');
  ok(g.squad.count === c0, `${q}: the first hit in the roll is skipped`);
  g.squad.remove(2, 'blade'); // (not 'bomb' again: Pip's Guard points would absorb it)
  ok(g.squad.count === c0 - 2, `${q}: only one hit is skipped per roll (${c0} -> ${g.squad.count})`);
  key('ArrowUp'); ok(D.used === 1, `${q}: cooldown blocks a second roll`);
  frames(Math.ceil(4.05 * 60));
  ok(D.ready, `${q}: ready again after 4 s`);
  key('ArrowUp'); ok(D.used === 2 && D.state().rolling, `${q}: ArrowUp rolls`);
  c0 = g.squad.count; g.squad.remove(1, 'gate'); g.squad.remove(1, 'gap');
  ok(g.squad.count === c0 - 2 && D.state().armed, `${q}: gate / gap losses are not dodged`);
  frames(40); // window over
  c0 = g.squad.count; g.squad.remove(1, 'blade');
  ok(g.squad.count === c0 - 1 && !D.state().rolling, `${q}: hit after the roll window counts`);
  // pointer flick on the game surface (input.js): quick + upward = roll, no steering; sideways drag = no roll
  frames(Math.ceil(4.05 * 60));
  const surf = g.input.surface, pe = (type, x, y) => surf.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  const pw = (type, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  const tx0 = g.input.targetX;
  pe('pointerdown', 200, 600); pw('pointermove', 205, 570); pw('pointermove', 210, 520); pw('pointerup', 210, 520);
  ok(D.used === 3, `${q}: an upward flick rolls (${D.used})`);
  ok(Math.abs(g.input.targetX - tx0) < 1e-6, `${q}: the flick does not steer (${tx0} -> ${g.input.targetX})`);
  frames(Math.ceil(4.05 * 60));
  pe('pointerdown', 100, 600); pw('pointermove', 180, 590); pw('pointermove', 260, 580); pw('pointerup', 260, 580);
  ok(D.used === 3 && g.input.targetX > tx0 + 0.5, `${q}: a sideways drag steers and does not roll`);
  // ---------------- 3. combo ----------------
  g.startLevel(3); g.squad.setCount(40, 'barrel'); frames(5);
  const Cb = g.combo, run = g.run;
  ok(Cb.n === 0 && Cb.mul === 1, `${q}: combo starts at 0`);
  let tiers = 0, lost = 0;
  const o1 = g.events.on('combo:tier', () => tiers++), o2 = g.events.on('combo:lost', () => lost++);
  run.kills += 24; Cb.update(); ok(Cb.n === 24 && Cb.tier === 0, `${q}: 24 kills = tier 0`);
  run.kills += 1; Cb.update(); ok(Cb.tier === 1 && Cb.mul === 1.1 && tiers === 1, `${q}: 25 kills = x1.1`);
  F.set('wedge'); ok(Math.abs(F.bossK - 1.32) < 1e-9 && Math.abs(F.hordeK - 1.1) < 1e-9, `${q}: combo x formation (${F.hordeK}, ${F.bossK})`);
  F.set('line');
  run.kills += 35; Cb.update(); ok(Cb.tier === 2 && Cb.mul === 1.2, `${q}: 60 kills = x1.2`);
  run.kills += 60; Cb.update(); ok(Cb.tier === 3 && Cb.mul === 1.3 && Math.abs(F.hordeK - 1.12 * 1.3) < 1e-9, `${q}: 120 kills = x1.3 (hordeK ${F.hordeK})`);
  const coins0 = run.coins;
  for (let i = 0; i < 10; i++) { run.coins += 1; g.events.emit('coin:collect', { amount: 1, pos: { x: 0, y: 0, z: 0 } }); }
  ok(run.coins - coins0 === 13, `${q}: x1.3 pays 13 coins for 10 (${run.coins - coins0})`);
  ok(run.stats.maxCombo === 120, `${q}: maxCombo ${run.stats.maxCombo}`);
  frames(1); ui.hud.update(1 / 60);
  const cm = ui.hud.controls.combo;
  ok(cm.classList.contains('on') && cm.querySelector('.cm-n').textContent === '120' && cm.querySelector('.cm-mul').textContent === 'x1.3', `${q}: HUD combo meter shows 120 x1.3`);
  if (q === 'high' && shotCase) {
    g.squad.setCount(48, 'barrel'); F.set('wedge'); frames(30); g.dodge.cd = 1.6; frames(1); await shot('hud-phone');
    g.dodge.cd = 0; F.set('line');
  }
  g.squad.remove(1, 'blade');
  ok(Cb.n === 0 && Cb.mul === 1 && lost === 1 && F.hordeK === 1.12, `${q}: a loss resets the combo (${Cb.n}, lost ${lost})`);
  frames(1);
  ok(cm.classList.contains('lost') && cm.classList.contains('on'), `${q}: COMBO LOST flash`);
  frames(90); ok(!cm.classList.contains('lost') && cm.classList.contains('on') === Cb.n > 0, `${q}: flash over, meter shown only with a combo (${Cb.n})`);
  const nb = Cb.n; run.kills += 3; Cb.update(); ok(Cb.n === nb + 3 && run.stats.maxCombo === 120, `${q}: combo rebuilds, max kept`);
  o1(); o2();
  // ---------------- 4. HUD ----------------
  const fb = ui.hud.controls.fbtn, db = ui.hud.controls.dbtn;
  frames(1);
  ok(fb.style.display !== 'none' && db.style.display !== 'none', `${q}: formation + dodge buttons visible in a run`);
  fb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); frames(1);
  ok(F.mode === 'wedge' && fb.querySelector('.fm-lbl').textContent === 'WEDGE', `${q}: formation button cycles + label (${F.mode})`);
  const u0 = D.used; db.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  ok(D.used === u0 + 1, `${q}: dodge chip rolls`);
  frames(1); ok(!db.classList.contains('ready'), `${q}: dodge chip shows cooldown`);
  g.save.update((x) => { x.settings.abilitySide = 'left'; }); g.events.emit('settings:changed', { settings: g.save.data.settings });
  ok(ui.hud.el.classList.contains('side-left'), `${q}: abilitySide left layout`);
  if (q === 'high') { const r1 = fb.getBoundingClientRect(); ok(r1.left < innerWidth / 2, `${q}: left-hand formation button at x ${r1.left}`); }
  g.save.update((x) => { x.settings.abilitySide = 'right'; }); g.events.emit('settings:changed', { settings: g.save.data.settings });
  ok(!ui.hud.el.classList.contains('side-left'), `${q}: abilitySide back to right`);
  if (q === 'high' && shotCase) { // mid-air roll with a big squad
    g.startLevel(3); g.squad.setCount(170, 'barrel'); g.horde.skipAll(); frames(60);
    key('w'); frames(14); await shot('dodge-midair');
  }

  // ---------------- 5. played ----------------
  for (const id of [3, 12]) {
    d.setAutopilot('casual', 3, { crates: 'auto', ability: true, loadout: 'keep' });
    g.startLevel(id);
    let k = 0, s, losses = 0;
    const off = g.events.on('combo:lost', () => losses++);
    do {
      s = d.simulate(5);
      k++;
      if (k % 3 === 0) g.formation.cycle();
      g.dodge.trigger();
    } while (s.state === 'playing' && k < 40);
    off();
    info[`L${id}_${q}`] = { state: s.state, win: s.result && s.result.win, squad: s.squad, coins: s.coins, maxCombo: g.run.stats.maxCombo, comboLosses: losses, bonusCoins: g.combo.bonusCoins, dodges: g.dodge.used, skipped: g.dodge.skipped, form: g.formation.changes };
    ok(s.state !== 'playing', `${q}: L${id} finished (${s.state})`);
    ok(g.run.stats.maxCombo > 10, `${q}: L${id} built a combo (${g.run.stats.maxCombo})`);
  }
  d.setAutopilot(false);
}
g.applyQuality('high');
g.toTitle();
g.loop.start && g.loop.start();
return { pass: fails.length === 0, fails, info };
