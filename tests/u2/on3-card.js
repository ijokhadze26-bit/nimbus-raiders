// @smoke --seconds 0 --shots 0
// Online stage 1, match UI: the VS card and the countdown (src/online/ui/vscard.js), driven by the scripted link.
// 1. From versus:start the card shows BOTH players' picks (name, hero, weapon, Pip outfit, gun paint) in their seat
//    colours; a hero that is not Pip shows no outfit; the run waits at the start line; the middle reads VS, 3, 2, 1.
//    The number is written only when it changes (no DOM writes while the clock stands still).
// 2. At GO the middle reads GO!, the run moves, and the card is gone a moment later.
// 3. During the countdown the HUD already is the match HUD (leave button, rival row GET READY, no "LV 0 ONLINE").
// 4. A late start (the clock is already past GO) gets no card.
// 5. Four players: four cards. Names are escaped.
// 6. Leaving during the countdown hides the card, reports 'quit' and calls flow.leave.
// 7. A second match in the same page starts clean; Low graphics shows the same card.
const g = window.__game;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { versus, flow, ui } = k;
const { SLOT_COLORS } = await import('/src/online/game/vsdata.js');
const cards = () => k.qa('.vs-card .vc-p');
const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
const mid = () => k.text('.vs-card .vc-num');
let c = -4;
const clock = () => c;
const run = (seconds) => { for (let i = 0; i < seconds * 60; i++) { c += 1 / 60; k.frame(); } };

try {
  // ---- 1. both picks, frozen run, VS -> 3 -> 2 -> 1 ----
  let link = k.start({ clock, rivals: [{ slot: 1, name: 'Mika', hero: 'cinder', weapon: 'emberstorm', heroSkin: 'gold', weaponSkin: 'frost' }] });
  k.frame();
  ok(k.shown('.vs-card') && k.qa('.vs-card').length === 1, 'the VS card is not up at versus:start');
  let cs = cards();
  ok(cs.length === 2, `cards for ${cs.length} players (want 2)`);
  if (cs.length === 2) {
    const me = txt(cs[0]), rival = txt(cs[1]);
    info.me = me; info.rival = rival;
    ok(cs[0].classList.contains('me') && me.includes('NINO') && me.includes('YOU'), 'my card: ' + me);
    ok(me.includes('Pip') && me.includes('Neon Ninja') && me.includes('Thunderclap') && me.includes('Candy paint'), 'my picks (hero, outfit, weapon, paint): ' + me);
    ok(rival.includes('MIKA') && !rival.includes('YOU') && rival.includes('Cinder') && rival.includes('Emberstorm') && rival.includes('Frost paint'), 'rival picks: ' + rival);
    ok(!rival.includes('Royal Gold'), 'a hero that is not Pip shows a Pip outfit: ' + rival);
    ok(cs[0].style.getPropertyValue('--sc') === SLOT_COLORS[0] && cs[1].style.getPropertyValue('--sc') === SLOT_COLORS[1], 'seat colours on the cards');
    ok(cs[0].querySelectorAll('svg').length === 2 && cs[1].querySelectorAll('svg').length === 2, 'hero + weapon icons on each card');
  }
  ok(mid() === 'VS', `middle reads "${mid()}" before the count (want VS)`);
  k.frames(0.5);
  ok(g.state === 'playing' && versus.live && g.run.dist === 0 && versus.t === 0 && !versus.v.go, `the run moved during the countdown: dist ${g.run.dist}, t ${versus.t}`);
  const seen = [];
  for (const at of [-2.6, -1.6, -0.6]) { c = at; k.frames(0.1); seen.push(mid()); }
  ok(seen.join('') === '321', `countdown read ${seen.join(',')} (want 3,2,1)`);
  ok(k.shown('.vs-card .vc-p') && g.run.dist === 0, 'the picks are not on screen until GO');
  const w = k.watch([k.q('.vs-card')]);
  k.frames(0.5);
  const still = w.take().length;
  w.stop();
  ok(still === 0, `${still} DOM writes in the card while the clock stood still`);

  // ---- 3. the HUD during the countdown ----
  const lvl = txt(ui.hud.levelEl);
  ok(ui.hud.el.classList.contains('vs') && !/LV|ONLINE/.test(lvl) && lvl.startsWith('0:00'), `HUD label during the countdown: "${lvl}"`);
  ok(k.q('.hud-pause').getAttribute('aria-label') === 'Leave match', 'the pause button is not the leave button');
  ok(k.q('.vs-rivals .vs-r') && k.q('.vs-rivals .vs-r').classList.contains('pre') && k.text('.vs-rivals .vs-d') === 'GET READY' && k.text('.vs-rivals .vs-name') === 'MIKA', `rival row before GO: "${k.text('.vs-rivals .vs-r')}"`);

  // ---- 2. GO ----
  c = 0.001; k.frame();
  ok(mid() === 'GO!' && k.q('.vs-card').classList.contains('go') && versus.v.go, `at GO the middle reads "${mid()}"`);
  run(0.5);
  ok(g.run.dist > 2 && versus.t > 0.4, `the run does not move after GO: dist ${g.run.dist}`);
  await k.wait(900);
  run(0.05);
  ok(!k.shown('.vs-card') && cards().length === 0, 'the card is still up a second after GO');
  ok(!k.q('.vs-rivals .vs-r').classList.contains('pre'), 'rival row still says GET READY after GO');
  k.end();

  // ---- 4. late start ----
  c = 6;
  link = k.start({ clock, rivals: [{ slot: 1, name: 'Mika' }] });
  k.frame();
  ok(cards().length === 0, 'a late start still shows the picks');
  ok(versus.v.go && g.run.dist > 0, 'a late start does not run at once');
  k.end();
  await k.wait(900);

  // ---- 5. four players, escaped names ----
  c = -4;
  link = k.start({ clock, rivals: [{ slot: 1, name: '<i>Mika' }, { slot: 3, name: 'Zoe', hero: 'vex', weapon: 'voidsiphon' }, { slot: 2, name: 'Raider-4821', hero: 'rime', weapon: 'glacier', weaponSkin: 'prism' }] });
  k.frame();
  cs = cards();
  ok(cs.length === 4 && k.q('.vs-card').classList.contains('n4'), `four players: ${cs.length} cards`);
  ok(cs.map((e) => e.dataset.slot).join('') === '0123', 'cards are not in seat order (me first): ' + cs.map((e) => e.dataset.slot).join(''));
  ok(cs[1] && cs[1].querySelector('.vc-name').textContent === '<I>MIKA' && !cs[1].querySelector('.vc-name i'), 'a name was not escaped');
  ok(cs[3] && txt(cs[3]).includes('ZOE') && txt(cs[3]).includes('Titan Vex') && txt(cs[3]).includes('Void Siphon'), 'fourth card: ' + (cs[3] && txt(cs[3])));
  ok(cs[2] && txt(cs[2]).includes('Prism paint'), 'third card paint: ' + (cs[2] && txt(cs[2])));
  ok(k.qa('.vs-rivals .vs-r').length === 3, 'three rival rows in the bar');
  // every card inside the frame (once the cards have slid in: measured after their slide-in animations have ended,
  // not after a fixed time, so a busy machine cannot catch a card still on its way in)
  await Promise.race([Promise.all(cs.flatMap((e) => e.getAnimations()).map((a) => a.finished.catch(() => {}))), k.wait(5000)]);
  await k.wait(50);
  info.cardAnims = cs.flatMap((e) => e.getAnimations()).map((a) => a.playState).join(',');
  const app = document.getElementById('app').getBoundingClientRect();
  ok(cs.every((e) => { const r = e.getBoundingClientRect(); return r.left >= app.left - 1 && r.right <= app.right + 1 && r.top >= 60 && r.bottom <= app.bottom - 60 && r.width > 100; }), 'a card of four is off the frame: ' + JSON.stringify(cs.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); })) + ' in ' + JSON.stringify([app.left, app.top, app.right, app.bottom].map(Math.round)));

  // ---- 6. leaving during the countdown ----
  ui.matchUi.leave();
  ok(!k.shown('.vs-card') && !versus.live && g.state === 'title', `leave during the countdown: card ${k.shown('.vs-card')}, live ${versus.live}, state ${g.state}`);
  ok(flow.calls.leave.length === 1 && link.test.falls.length === 1 && link.test.falls[0].by === 'quit' && link.test.left, 'leave during the countdown did not report a quit / call the flow: ' + JSON.stringify([flow.calls.leave, link.test.falls]));
  ok(!ui.hud.el.classList.contains('vs') && k.q('.hud-pause').getAttribute('aria-label') === 'Pause', 'the HUD is still the match HUD after leaving');

  // ---- 7. a second match starts clean; Low graphics ----
  const before = g.engine.quality;
  g.applyQuality('low');
  c = -4;
  link = k.start({ clock, picks: { hero: 'bolt', weapon: 'gearworks', heroSkin: 'ninja', weaponSkin: null }, rivals: [{ slot: 1, name: 'Ana', hero: 'pip', weapon: 'spectra', heroSkin: 'lava' }] });
  k.frame();
  cs = cards();
  ok(k.qa('.vs-card').length === 1 && cs.length === 2 && mid() === 'VS', 'second match: no fresh card');
  ok(cs.length === 2 && txt(cs[0]).includes('Bolt') && txt(cs[0]).includes('Gearworks') && !txt(cs[0]).includes('Neon Ninja') && !txt(cs[0]).includes('paint'), 'second match, my card: ' + (cs[0] && txt(cs[0])));
  ok(cs.length === 2 && txt(cs[1]).includes('ANA') && txt(cs[1]).includes('Lava Core') && !txt(cs[1]).includes('MIKA'), 'second match, rival card: ' + (cs[1] && txt(cs[1])));
  ok(versus.t === 0 && g.run.dist === 0 && g.engine.quality === 'low', 'second match did not start at zero on Low');
  c = 0.001; k.frame(); run(0.3);
  ok(mid() === 'GO!' && g.run.dist > 0, 'second match: no GO');
  g.applyQuality(before);
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
