// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 2, sabotage UI on the small phone (360 x 640): incoming warnings, the frozen frame, the feed
// (src/online/ui/sabwarn.js) and the rival flags in the versus bar (hudvs.js), against tests/u2/lib/sabstub.js.
// 1. Every kind: the warning reads its head + FROM ANN in its colour, flashes and plays 'warn' at once; the bar drains
//    over `lands` on the played clock; on sab:land a second flash + the kind's sound, then the card goes.
// 2. Up to 3 warnings stack, newest on top (the older ones one line); none covers the boss bar, the combo meter or
//    the hazard line. sab:wait takes the card off and says so in the feed; a rival's out drops its cards.
// 3. Frozen: an icy frame + FROZEN! with the seconds left while view().frozen > 0, gone after. A warning parked in
//    the same step (sab:wait) makes no alarm. Fog / blackout layers show while view().fog / blackout > 0.
// 4. Feed: FOG SENT TO ANN, SABOTAGE CRATE! +1, BIG SABOTAGE READY!, ANN IS IN DANGER! (once per episode, 10 s apart),
//    ANN IS OUT! 3 LEFT; 3 lines at most, ~3 s each; never over the power pills; long lines wrap, never under the
//    combo meter; unseen while the boss bar is still up after a kill (never over it).
// 5. Rival flags: purple bolt / snowflake / gold star with one rival (all three), one icon per row with three rivals,
//    inside the bar, names not crushed; DOM writes only when a flag changes.
// 6. Everything is cleared on my fall and in the next match.
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { installSabStub } = await import('/tests/u2/lib/sabstub.js');
const W = await import('/src/online/ui/sabwords.js');
const { FLAG } = await import('/src/online/codec.js');
const { versus, ui } = k;
const hud = ui.hud;
const sfx = [];
g.events.on('hazard:sfx', (p) => sfx.push(p.sfx));
const app = document.getElementById('app').getBoundingClientRect();
const R = { n: 60, lead: 5, danger: 0, flags: 0 };
const curve = () => ({ dist: Math.max(0, (g.run ? g.run.dist : 0) + R.lead), n: R.n, x: -2, form: 0, boss: 0, zone: 1, flags: R.flags, danger: R.danger });
const keep = () => { if (g.squad.count < 60) g.squad.setCount(60, 'test'); g.heroes.guard = 99; };
const cards = () => k.qa('.sab-warns .sab-warn');
const feed = () => k.qa('.sab-feed .sf-line').map((e) => e.textContent);
const rect = (e) => { if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
const overlap = (a, b) => !!(a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1);
const inFrame = (r) => !!r && r.left >= app.left - 0.5 && r.right <= app.right + 0.5 && r.top >= app.top - 0.5 && r.bottom <= app.bottom + 0.5;
const flashF = () => (g.fx && g.fx.screen ? g.fx.screen.f : 1);
let stub = null;

try {
  ok(Math.round(app.width) === 360, 'this scenario runs on a 360 px frame');
  stub = installSabStub(g);
  k.start({ referee: false, rivals: [{ slot: 1, name: 'Ann', curve }] });
  k.frames(3, () => { keep(); return false; });

  // ---- 1. each kind ----
  for (const code of W.SAB_CODES) {
    const kind = W.sabKind(code);
    sfx.length = 0;
    if (g.fx) g.fx.screen.f = 0;
    const id = stub.warn(code, 'Ann');
    k.frame();
    const c = cards()[0];
    const head = c && c.querySelector('.sw-head').textContent, from = c && c.querySelector('.sw-from').textContent;
    ok(c && head === kind.head && from === 'FROM ANN' && c.dataset.code === String(code), `warning ${code}: "${head}" "${from}"`);
    ok(c && c.style.getPropertyValue('--kc') === kind.color && getComputedStyle(c).borderTopColor !== 'rgba(0, 0, 0, 0)', `warning ${code} colour ${c && c.style.getPropertyValue('--kc')}`);
    ok(sfx.includes('warn') && flashF() > 0.2, `warning ${code}: no warn sound / flash (${sfx}, ${flashF()})`);
    ok(inFrame(rect(c)) && c.querySelector('.sw-head').scrollWidth <= c.querySelector('.sw-head').clientWidth + 1, `warning ${code}: clipped or outside the frame`);
    k.frames(0.5, () => { keep(); return false; });
    const bar = c.querySelector('.sw-bar u').style.transform;
    ok(/scaleX\(0\.(4|5|55|45|6)\)/.test(bar), `warning ${code}: bar after 0.5 s reads ${bar}`);
    k.frames(0.5, () => { keep(); return false; });
    sfx.length = 0;
    if (g.fx) g.fx.screen.f = 0;
    stub.land(id); k.frame();
    ok(c.classList.contains('hit') && sfx.includes(kind.sfx) && flashF() > 0.2, `landing ${code}: ${c.className} ${sfx} ${flashF()}`);
    k.frames(0.6, () => { keep(); return false; });
    ok(!c.isConnected && cards().length === 0, `landing ${code}: the card stays`);
    stub.endEffect(code); k.frames(0.05);
  }

  // ---- 2. stacking + geometry ----
  const ids = [stub.warn(2, 'Ann'), stub.warn(4, 'Ann'), stub.warn(5, 'Ann')];
  k.frame();
  let cs = cards();
  ok(cs.length === 3 && cs[0].dataset.code === '5' && !cs[0].classList.contains('small') && cs[1].classList.contains('small') && cs[2].classList.contains('small'), 'three warnings: ' + cs.map((c) => c.dataset.code + c.className).join(' | '));
  stub.warn(1, 'Ann'); k.frame();
  cs = cards();
  ok(cs.length === 3 && cs.map((c) => c.dataset.code).join(',') === '1,5,4', 'a fourth warning: ' + cs.map((c) => c.dataset.code).join(','));
  const stackBox = rect(k.q('.sab-warns'));
  info.stack = stackBox && [Math.round(stackBox.top), Math.round(stackBox.bottom), Math.round(stackBox.left), Math.round(stackBox.right)];
  // the hazard line and the combo meter (both shown by hand: their spots are what counts)
  hud.banner.classList.add('hidden');
  g.events.emit('hazard:hint', { kind: 'sudden', text: 'SUDDEN DEATH! The horde keeps growing', color: '#ff5a4d' });
  hud.hazardHint.dodge(false);
  const combo = k.q('.combo-meter'); if (combo) combo.classList.add('on');
  await k.wait(450);
  const stackNow = rect(k.q(".sab-warns")), hint = rect(k.q(".hazard-hint")), cm = rect(combo);
  info.stack = [Math.round(stackNow.top), Math.round(stackNow.bottom), Math.round(hint.top), Math.round(hint.bottom)];
  ok(hint && !overlap(hint, stackNow) && !overlap(cm, stackNow), `warnings overlap the hazard line or the combo meter: hint ${hint && Math.round(hint.bottom)}, combo ${cm && Math.round(cm.bottom)}, warnings ${info.stack}`);
  // a MK UP banner is up and the hazard line sits under it: the warnings step under both
  hud.banner.classList.remove('hidden'); hud.banner.innerHTML = '<div class="sub">MK UP</div><div class="name">MK III</div>';
  g.events.emit('hazard:hint', { kind: 'sudden', text: 'SUDDEN DEATH! The horde keeps growing', color: '#ff5a4d' });
  await k.wait(450);
  const hint2 = rect(k.q('.hazard-hint')), tb = rect(hud.banner.querySelector('.name')), sbx = rect(k.q('.sab-warns'));
  info.below = { banner: tb && Math.round(tb.bottom), hint: hint2 && [Math.round(hint2.top), Math.round(hint2.bottom)], warns: sbx && [Math.round(sbx.top), Math.round(sbx.bottom)] };
  ok(k.q('.hazard-hint').classList.contains('below') && !overlap(hint2, sbx) && !overlap(tb, sbx) && sbx.bottom <= app.bottom - 150, 'warnings under a MK UP banner: ' + JSON.stringify(info.below));
  hud.banner.classList.add('hidden'); hud.hazardHint.hide(); hud.hazardHint.dodge(false);
  // a boss arena: the boss bar is up and the warnings sit under it
  hud.el.classList.add('boss-phase'); hud.bossBar.classList.remove('hidden');
  await k.wait(450);
  const bb = rect(hud.bossBar), sb2 = rect(k.q('.sab-warns')), cm2 = rect(combo);
  info.arena = { boss: bb && Math.round(bb.bottom), combo: cm2 && Math.round(cm2.bottom), warns: sb2 && Math.round(sb2.top) };
  ok(bb && sb2 && !overlap(bb, sb2) && !overlap(cm2, sb2) && sb2.bottom <= app.bottom - 200, 'in an arena the warnings cover the boss bar / combo meter: ' + JSON.stringify(info.arena));
  hud.el.classList.remove('boss-phase'); hud.bossBar.classList.add('hidden'); if (combo) combo.classList.remove('on'); hud.hazardHint.hide();
  // sab:wait: the card goes, the feed says why
  stub.hold(ids[1]); k.frame();
  ok(!cards().some((c) => c.dataset.code === '4') && feed().includes('SPEED UP COMES AFTER THE BOSS'), 'sab:wait: ' + JSON.stringify(feed()));
  // a rival's out ('gone') drops what it had in flight
  stub.drop('gone', { from: 1 }); k.frame();
  ok(cards().length === 0, 'cards left after the sender is gone: ' + cards().length);
  k.frames(3.2, () => { keep(); return false; });
  ok(feed().length === 0, 'the feed did not empty after ~3 s: ' + JSON.stringify(feed()));

  // ---- 3. frozen ----
  const fid = stub.warn(5, 'Ann'); k.frames(1); stub.land(fid); k.frame();
  ok(k.shown('.sab-ice') && k.text('.sab-ice .si-txt') === 'FROZEN!2', 'frozen frame: ' + k.text('.sab-ice .si-txt'));
  k.frames(1.2, () => { keep(); return false; });
  ok(k.shown('.sab-ice') && k.text('.sab-ice .si-n') === '1', 'frozen seconds: ' + k.text('.sab-ice .si-n'));
  const ice = rect(k.q('.sab-ice .si-txt')), bubble = rect(k.q('.sab-btn'));
  ok(inFrame(ice) && !overlap(ice, bubble) && !overlap(ice, rect(k.q('.hud-ability-mount .ability-btn'))), 'FROZEN! is clipped or over a button');
  k.frames(1, () => { keep(); return false; });
  ok(!k.shown('.sab-ice'), 'the frozen frame stays after the freeze');

  // ---- 3b. a warning parked in the same step (sab:wait right after sab:warn): no alarm, the feed says it ----
  sfx.length = 0;
  if (g.fx) g.fx.screen.f = 0;
  const pw = stub.warn(3, 'Ann'); stub.hold(pw); k.frame();
  ok(!sfx.includes('warn') && flashF() < 0.2 && cards().length === 0 && feed().at(-1) === 'RED GATE COMES AFTER THE BOSS', `a parked warning: sfx ${sfx}, flash ${flashF()}, cards ${cards().length}, feed ${JSON.stringify(feed())}`);
  k.frames(3.2, () => { keep(); return false; });

  // ---- 3c. fog and blackout show on the screen (plain-opacity layers under the HUD) ----
  const air = (c) => k.q('.sab-air.' + c).classList.contains('on');
  stub.set({ fog: 4 }); k.frame(); await k.wait(700);
  ok(air('fog') && !air('dark') && getComputedStyle(k.q('.sab-air.fog')).opacity === '1', 'fog layer: ' + k.q('.sab-air.fog').className);
  ok(Number(getComputedStyle(k.q('.sab-air.fog')).zIndex) < Number(getComputedStyle(hud.el).zIndex), 'the fog layer is over the HUD');
  stub.set({ fog: 0, blackout: 3 }); k.frame();
  ok(!air('fog') && air('dark'), 'blackout layer: ' + k.q('.sab-air.dark').className);
  stub.set({ blackout: 0 }); k.frame();
  ok(!air('fog') && !air('dark'), 'the layers stay after the effects');
  stub.unset('fog', 'blackout');

  // ---- 4. feed ----
  stub.sent(2, ['Ann']); k.frame();
  ok(feed().at(-1) === 'FOG SENT TO ANN' && sfx.includes('tierUp'), 'sent line: ' + JSON.stringify(feed()));
  stub.charge('crate'); k.frame();
  ok(feed().at(-1) === 'SABOTAGE CRATE! +1', 'crate line: ' + JSON.stringify(feed()));
  sfx.length = 0;
  stub.charge('boss', { code: 11 }); k.frame();
  ok(feed().at(-1) === 'BIG SABOTAGE READY!' && sfx.includes('powerUp'), 'big line: ' + JSON.stringify(feed()) + ' ' + sfx);
  stub.sent(11, ['Ann']); k.frame();
  ok(feed().length === 3 && feed()[0] === 'SABOTAGE CRATE! +1' && feed().at(-1) === 'HORDE STORM SENT TO ANN', 'four lines: ' + JSON.stringify(feed()));
  // never over the hazard line: while it shows only the 2 newest lines do
  ok(!overlap(rect(k.q('.sab-feed')), { left: 0, right: 360, top: 118, bottom: 160 }), 'three feed lines reach the hazard line: ' + JSON.stringify(rect(k.q('.sab-feed'))));
  g.events.emit('hazard:hint', { kind: 'sudden', text: 'SUDDEN DEATH! The horde keeps growing', color: '#ff5a4d' });
  hud.hazardHint.dodge(false);
  await k.wait(450);
  ok(!overlap(rect(k.q('.sab-feed')), rect(k.q('.hazard-hint'))) && k.qa('.sab-feed .sf-line').filter((e) => getComputedStyle(e).display !== 'none').length === 1, 'the feed is over the hazard line');
  // in an arena: under the boss bar, the warnings under the feed
  hud.el.classList.add('boss-phase'); hud.bossBar.classList.remove('hidden');
  const aw = stub.warn(2, 'Ann'); k.frame();
  await k.wait(450);
  const af = rect(k.q('.sab-feed')), aws = rect(k.q('.sab-warns')), abb = rect(hud.bossBar), ah = rect(k.q('.hazard-hint')), acm = rect(k.q('.combo-meter.on'));
  info.arenaFeed = { feed: af && [Math.round(af.top), Math.round(af.bottom)], warns: aws && [Math.round(aws.top), Math.round(aws.bottom)], hint: ah && Math.round(ah.bottom) };
  ok(af && aws && !overlap(af, aws) && !overlap(af, abb) && !overlap(af, ah) && !overlap(af, acm) && !overlap(aws, ah) && aws.bottom <= app.bottom - 200, 'arena feed / warnings overlap: ' + JSON.stringify(info.arenaFeed));
  stub.land(aw); hud.el.classList.remove('boss-phase'); hud.bossBar.classList.add('hidden'); hud.hazardHint.hide(); k.frames(0.6);
  // long lines wrap (never cut) and stay left of the combo meter; with the boss bar still up after a kill (the run
  // is back on the road) the feed sits under it
  k.frames(3.2, () => { keep(); return false; });
  const cmL = k.q('.combo-meter'); if (cmL) cmL.classList.add('on');
  stub.sent(12, ['Wolfgang Max']); const lw = stub.warn(3, 'Wolfgang Max'); stub.hold(lw); k.frame();
  await k.wait(450);
  const long = k.qa('.sab-feed .sf-line'), cmR = rect(cmL);
  info.long = long.map((e) => { const r = rect(e); return [e.textContent, r && Math.round(r.right), r && Math.round(r.bottom), e.scrollHeight, e.clientHeight]; });
  ok(cmR && long.length === 2 && feed().includes('BLACKOUT SENT TO WOLFGANG MAX') && feed().includes('RED GATE COMES AFTER THE BOSS'), 'long lines: ' + JSON.stringify(feed()));
  ok(long.every((e) => !overlap(rect(e), cmR) && e.scrollHeight <= e.clientHeight + 1), `a long line is cut or under the combo meter (combo left ${cmR && Math.round(cmR.left)}): ${JSON.stringify(info.long)}`);
  hud.bossBar.classList.remove('hidden');
  stub.charge('boss', { code: 11 }); const bw = stub.warn(2, 'Ann'); k.frame();
  await k.wait(450);
  const pf = rect(k.q('.sab-feed')), pbb = rect(hud.bossBar), pw2 = rect(k.q('.sab-warns'));
  const unseen = getComputedStyle(k.q('.sab-feed')).visibility === 'hidden';
  info.afterKill = { feed: pf && [Math.round(pf.top), Math.round(pf.bottom)], unseen, bar: pbb && Math.round(pbb.bottom), warns: pw2 && Math.round(pw2.top) };
  ok(pbb && pw2 && (unseen || !overlap(pf, pbb)) && !overlap(pw2, pbb), 'after the kill the feed / warnings are on the boss bar: ' + JSON.stringify(info.afterKill));
  hud.bossBar.classList.add('hidden'); k.frame();
  ok(getComputedStyle(k.q('.sab-feed')).visibility === 'visible' && feed().at(-1) === 'BIG SABOTAGE READY!', 'the feed does not come back when the boss bar goes');
  stub.land(bw); if (cmL) cmL.classList.remove('on'); k.frames(0.6, () => { keep(); return false; });
  // never over the power pills
  g.events.emit('power:start', { kind: 'testpill', duration: 6 });
  k.frame(); await k.wait(450);
  // (the column's own box: a pill pops in with a scale animation, its untransformed spot is what counts)
  const pills = k.q('.hud-powers .pw:not(.out)') ? [rect(k.q('.hud-powers'))].filter(Boolean) : [], fb = rect(k.q('.sab-feed'));
  info.feed = { pills: pills.map((p) => [Math.round(p.left), Math.round(p.right), Math.round(p.top), Math.round(p.bottom)]), feed: fb && [Math.round(fb.left), Math.round(fb.right), Math.round(fb.top), Math.round(fb.bottom)] };
  ok(pills.length >= 1 && fb && pills.every((p) => !overlap(p, fb)) && inFrame(fb), 'the feed is over a power pill: ' + JSON.stringify(info.feed));
  const coins = rect(k.q('.vs-rivals')), cm3 = rect(k.q('.combo-meter.on'));
  ok(!overlap(fb, coins) && !overlap(fb, cm3), 'the feed is over the rival card / combo meter');
  g.events.emit('power:end', { kind: 'testpill' });
  k.frames(3.2, () => { keep(); return false; });
  // danger: one line per episode, at most once per 10 s
  R.danger = 7; k.frames(0.4, () => { keep(); return false; });
  ok(feed().filter((l) => l === 'ANN IS IN DANGER!').length === 1, 'danger line: ' + JSON.stringify(feed()));
  R.danger = 1; k.frames(0.4, () => { keep(); return false; });
  R.danger = 8; k.frames(0.4, () => { keep(); return false; });
  ok(feed().filter((l) => l === 'ANN IS IN DANGER!').length === 1, 'a second danger line within 10 s: ' + JSON.stringify(feed()));
  R.danger = 1; k.frames(10, () => { keep(); return false; });
  R.danger = 6; k.frames(0.4, () => { keep(); return false; });
  ok(feed().includes('ANN IS IN DANGER!'), 'no danger line for a new episode after 10 s: ' + JSON.stringify(feed()));
  R.danger = 0;

  // ---- 6. my fall clears the warnings ----
  stub.warn(3, 'Ann'); k.frame();
  k.wipe(); k.frames(0.2);
  ok(cards().length === 0 && !k.shown('.sab-ice'), 'warnings left after my fall');
  k.end();

  // ---- 5. rival flags: one rival ----
  R.flags = 0; R.n = 120;
  k.start({ referee: false, rivals: [{ slot: 1, name: 'Raider-4762', curve }] });
  k.frames(2, () => { keep(); return false; });
  ok(cards().length === 0 && feed().length === 0, 'the next match did not start clean');
  ok(!k.q('.vs-rivals .vs-fl .vs-fi'), 'a flag shows with flags 0');
  const wr = k.watch([k.q('.vs-rivals')]);
  R.flags = FLAG.sabotaged | FLAG.frozen | FLAG.bigReady; k.frames(0.3, () => { keep(); return false; });
  let icons = k.qa('.vs-rivals .vs-fi').map((e) => e.classList[1]);
  ok(icons.join(',') === 'frozen,bigReady,sabotaged', 'one rival, all flags: ' + icons);
  const card = rect(k.q('.vs-rivals .vs-r')), fl = rect(k.q('.vs-rivals .vs-fl'));
  ok(inFrame(fl) && fl.right <= app.right - 1 && !overlap(fl, rect(k.q('.hud-pause'))), 'the flag badge leaves the frame: ' + JSON.stringify(fl));
  ok(k.q('.vs-rivals .vs-name').scrollWidth <= k.q('.vs-rivals .vs-name').clientWidth + 1, 'the name is cut by the flags');
  info.flags1 = { card: [Math.round(card.left), Math.round(card.right), Math.round(card.top)], badge: [Math.round(fl.left), Math.round(fl.right), Math.round(fl.top)] };
  wr.take();
  let fw = 0;
  for (let i = 0; i < 120; i++) { keep(); k.frame(); fw += wr.take().length; }
  ok(fw <= 4, `flags unchanged but the bar wrote ${fw} times in 120 frames`);
  R.flags = FLAG.bigReady; k.frames(0.3, () => { keep(); return false; });
  icons = k.qa('.vs-rivals .vs-fi').map((e) => e.classList[1]);
  ok(icons.join(',') === 'bigReady', 'one rival, big only: ' + icons);
  R.flags = 0; k.frames(0.3, () => { keep(); return false; });
  ok(!k.q('.vs-rivals .vs-fi'), 'flags did not clear');
  wr.stop();
  k.end();

  // ---- 5b. three rivals ----
  const c2 = () => ({ ...curve(), n: 7, flags: FLAG.sabotaged | FLAG.bigReady });
  const c3 = () => ({ ...curve(), n: 999, flags: FLAG.frozen | FLAG.sabotaged });
  R.flags = FLAG.sabotaged;
  k.start({ referee: false, rivals: [{ slot: 1, name: 'Ann', curve }, { slot: 2, name: 'Raider-4821', curve: c2 }, { slot: 3, name: 'Zoe', curve: c3 }] });
  k.frames(3, () => { keep(); return false; });
  const rows = k.qa('.vs-rivals .vs-r');
  const per = rows.map((r) => [...r.querySelectorAll('.vs-fi')].map((e) => e.classList[1]).join('+'));
  ok(per.join(',') === 'sabotaged,bigReady,frozen', 'three rivals, one icon each (frozen > big > sabotaged): ' + per);
  ok(rows.every((r) => inFrame(rect(r)) && r.querySelector('.vs-n').clientWidth >= 44 && r.querySelector('.vs-d').scrollWidth <= r.querySelector('.vs-d').clientWidth + 1 && r.querySelector('.vs-cnt').scrollWidth <= r.querySelector('.vs-cnt').clientWidth + 1), 'three rivals: a row is clipped or a name has no room');
  ok(rect(k.q('.vs-rivals')).bottom <= 84, 'three rivals: the rows reach too low');
  info.rows3 = rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  // a rival that is not the last falls: one feed line
  k.versus.link.test.rivalFall(2, {}); k.frames(0.2, () => { keep(); return false; });
  ok(feed().includes('RAIDER-4821 IS OUT! 3 LEFT') && !rows[1].querySelector('.vs-fi'), 'out line: ' + JSON.stringify(feed()));
  k.end();
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (stub) stub.remove();
  k.end();
}
return { pass: fails.length === 0, fails, info };
