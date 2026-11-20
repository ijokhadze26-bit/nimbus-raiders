// @smoke --seconds 0 --shots 0 --size 360x640
// Online stage 1, match UI: the versus bar in the HUD (src/online/ui/hudvs.js) on the small phone (360 x 640).
// 1. The bar replaces "LV 0 ONLINE": match time, the rival's name, squad size and how far ahead / behind it is; the
//    values follow the rival. No coin pill (a match pays nothing).
// 2. DANGER: a rival with danger >= 5 pulses with DANGER!; my own danger shows the red frame + red squad bubble.
// 3. Silence: "RIVAL LOST CONNECTION · WIN IN n" counts down with the link and clears when the rival is back.
//    My own connection: RECONNECTING. No chip otherwise.
// 4. DOM writes: only when a value changes (a budget per 60 frames of steady play; 0 with the game frozen).
// 5. A fallen rival reads DOWN. SUDDEN DEATH from 3:00, STORM from 4:30 as a tag next to the clock.
// 6. After the match the single-player HUD is untouched (LV n, coins, pause works); a second match starts clean.
// 7. Two and three rivals fit in 360 px: rows inside the frame, nothing overlapping, numbers not clipped.
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { versus, flow, ui } = k;
const hud = ui.hud, bar = ui.matchUi.bar;
const R = { lead: 8, n: 45, danger: 0 };
const curve = () => ({ dist: Math.max(0, (g.run ? g.run.dist : 0) + R.lead), n: R.n, x: -2.2, form: 0, boss: 0, zone: 1, flags: 0, danger: R.danger });
const rival = (o = {}) => ({ slot: 1, name: 'Mika', curve, ...o });
const row = (i = 0) => k.qa('.vs-rivals .vs-r')[i];
const rowText = (i = 0) => { const r = row(i); return r ? { name: r.querySelector('.vs-name').textContent, n: r.querySelector('.vs-cnt').textContent, d: r.querySelector('.vs-d').textContent, cls: r.className } : null; };
const gap = (i = 0) => { const t = rowText(i).d; return t === 'EVEN' || t === '=' ? 0 : (t[0] === '▲' ? 1 : t[0] === '▼' ? -1 : NaN) * parseInt(t.slice(1), 10); };
const fits = (e) => e.scrollWidth <= e.clientWidth + 1;
const keep = (n) => { if (g.squad.count < n) g.squad.setCount(n, 'test'); g.heroes.guard = 99; };
const app = document.getElementById('app').getBoundingClientRect();
info.size = [Math.round(app.width), Math.round(app.height)];

try {
  ok(Math.round(app.width) === 360, `this scenario runs on a 360 px frame (got ${app.width})`);
  // ---- 1. the bar follows the rival ----
  let link = k.start({ referee: false, rivals: [rival()] });
  k.frames(10.2);
  const lvl = hud.levelEl.textContent.trim();
  ok(hud.el.classList.contains('vs') && k.text('.vs-clock') === '0:10' && !/LV|ONLINE/.test(lvl), `clock "${k.text('.vs-clock')}", label "${lvl}"`);
  ok(getComputedStyle(hud.coinPill).display === 'none', 'the coin pill shows during a match');
  ok(k.shown('.hud-prog'), 'the progress bar to the next boss is gone');
  let r = rowText();
  ok(r && r.name === 'MIKA' && r.n === '45' && r.n === String(versus.view().peers[0].n), 'rival row: ' + JSON.stringify(r));
  ok(Math.abs(gap() - 8) <= 3, `rival 8 m ahead reads "${r && r.d}"`);
  R.lead = -12; R.n = 61; k.frames(2);
  r = rowText();
  ok(r.n === '61' && Math.abs(gap() + 12) <= 3, `rival 12 m behind with 61 reads ${JSON.stringify(r)}`);
  R.lead = 0; k.frames(2);
  ok(Math.abs(gap()) <= 2, `a level rival reads "${rowText().d}"`);
  info.row = rowText();

  // ---- 2. danger ----
  R.danger = 7; R.n = 4; k.frames(0.6);
  r = rowText();
  ok(r.cls.includes('danger') && r.d === 'DANGER!' && r.n === '4', 'rival in danger: ' + JSON.stringify(r));
  ok(getComputedStyle(row()).animationName === 'vs-danger', 'the danger row does not pulse');
  R.danger = 2; R.n = 50; k.frames(0.6);
  ok(!rowText().cls.includes('danger') && rowText().d !== 'DANGER!', 'danger did not clear: ' + JSON.stringify(rowText()));
  ok(!hud.el.classList.contains('vs-me-danger') && !bar.edge.classList.contains('on'), 'my own danger shows with a healthy squad');
  k.frames(Math.max(0, k.VS.danger.grace + 0.5 - versus.t));
  for (let i = 0; i < 20; i++) { g.squad.setCount(3, 'storm'); k.frame(); }
  ok(versus.view().me.danger >= 5 && hud.el.classList.contains('vs-me-danger') && bar.edge.classList.contains('on') && hud.bubble.classList.contains('vs-danger'), `my danger ${versus.view().me.danger} not shown`);
  g.squad.setCount(80, 'test'); g.heroes.guard = 99;
  k.frames(k.VS.danger.window + 0.6, () => { keep(80); return false; });
  ok(!hud.el.classList.contains('vs-me-danger') && !bar.edge.classList.contains('on') && !hud.bubble.classList.contains('vs-danger'), `my danger did not clear (${versus.view().me.danger})`);

  // ---- 3. silence chip + reconnecting ----
  ok(!k.shown('.vs-chips'), 'a chip shows with nothing wrong');
  link.test.silence(1, 3, 10); k.frames(0.2);
  ok(k.shown('.vs-chip.c-dc') && k.text('.vs-chip.c-dc') === 'RIVAL LOST CONNECTION · WIN IN 10', `silence chip: "${k.text('.vs-chip.c-dc')}"`);
  ok(rowText().cls.includes('silent'), 'the silent rival row is not marked');
  const dcBox = k.q('.vs-chip.c-dc').getBoundingClientRect();
  ok(dcBox.left >= app.left && dcBox.right <= app.right && dcBox.width > 150, `the chip does not fit the frame: ${Math.round(dcBox.left)}..${Math.round(dcBox.right)}`);
  const counts = [];
  for (const n of [9, 8, 7, 3, 0]) { link.test.silence(1, 13 - n, n); k.frames(0.2); counts.push(k.text('.vs-chip.c-dc .num')); }
  ok(counts.join(',') === '9,8,7,3,0', 'countdown read ' + counts.join(','));
  link.test.silence(1, 0, null); k.frames(0.6);
  ok(!k.shown('.vs-chip.c-dc') && !k.shown('.vs-chips') && !rowText().cls.includes('silent') && /^[▲▼]|EVEN/.test(rowText().d), 'the chip did not clear when the rival came back: ' + JSON.stringify(rowText()));
  link.test.status('lost'); k.frames(0.2);
  ok(k.shown('.vs-chip.c-net') && k.text('.vs-chip.c-net').startsWith('RECONNECTING') && g.state === 'playing' && versus.live, 'no RECONNECTING chip');
  const t0 = versus.t; k.frames(1);
  ok(versus.t > t0 + 0.9, 'the game stopped while reconnecting');
  link.test.status('on'); k.frames(0.2);
  ok(!k.shown('.vs-chip.c-net') && !k.shown('.vs-chips'), 'RECONNECTING did not clear');

  // ---- 4. DOM writes ----
  R.lead = 5; R.n = 50; R.danger = 0;
  k.frames(1);
  const w = k.watch([hud.levelEl, bar.rivalsEl, bar.chipsEl, bar.edge]);
  let n = 0;
  for (let i = 0; i < 600; i++) { keep(60); if (i % 20 === 0) R.n += 1; k.frame(); n += w.take().length; }
  info.writesPer60 = Math.round(n / 10 * 10) / 10;
  ok(n > 0 && n / 10 <= 14, `versus bar wrote to the DOM ${n / 10} times per 60 frames (budget 14)`);
  let frozen = 0;
  await k.wait(200);
  for (let i = 0; i < 90; i++) { ui.update(1 / 60); frozen += w.take().length; }
  w.stop();
  ok(frozen === 0, `versus bar wrote to the DOM ${frozen} times with the game frozen`);

  // ---- 5. DOWN, SUDDEN DEATH, STORM ----
  ok(!k.shown('.vs-phase'), 'a phase tag shows before 3:00');
  for (let i = 0; i < 90 && versus.t < k.VS.sudden.at + 1 && g.state === 'playing'; i++) { keep(400); versus.simulate(2.5); }
  keep(400); k.frames(0.3);
  ok(versus.t >= k.VS.sudden.at && k.shown('.vs-phase') && k.text('.vs-phase') === 'SUDDEN DEATH' && k.text('.vs-clock').startsWith('3:0'), `at ${versus.t.toFixed(1)} s the tag reads "${k.text('.vs-phase')}", clock ${k.text('.vs-clock')}`);
  ok(fits(k.q('.vs-phase')) && k.shown('.hud-prog'), 'SUDDEN DEATH is clipped next to one rival on 360 px');
  info.suddenBox = (() => { const b = k.q('.vs-phase').getBoundingClientRect(), rv = bar.rivalsEl.getBoundingClientRect(); return { tagRight: Math.round(b.right), rivalsLeft: Math.round(rv.left) }; })();
  ok(info.suddenBox.tagRight <= info.suddenBox.rivalsLeft, 'the SUDDEN DEATH tag runs under the rival card: ' + JSON.stringify(info.suddenBox));
  for (let i = 0; i < 60 && versus.t < k.VS.storm.at + 0.5 && g.state === 'playing'; i++) { keep(700); versus.simulate(Math.min(2.5, k.VS.storm.at + 0.6 - versus.t)); }
  keep(700); k.frames(0.2);
  ok(g.state === 'playing' && k.text('.vs-phase') === 'STORM' && k.q('.vs-phase').classList.contains('storm'), `at ${versus.t.toFixed(1)} s the tag reads "${k.text('.vs-phase')}" (${g.state})`);
  R.n = 999; R.lead = 120; keep(700); k.frames(1.2, () => { keep(700); return false; });
  r = rowText();
  ok(r.n === '999' && fits(row().querySelector('.vs-d')) && /^▲1\d\dm$/.test(r.d), '999 + a three-digit gap is clipped or wrong: ' + JSON.stringify(r));
  link.test.rivalFall(1, {}); keep(700); k.frames(0.2);
  r = rowText();
  ok(r.cls.includes('down') && r.d === 'DOWN' && getComputedStyle(row().querySelector('.vs-cnt')).display === 'none', 'fallen rival: ' + JSON.stringify(r));
  k.end();

  // ---- 6. single-player HUD untouched afterwards; a second match starts clean ----
  d.setAutopilot('pro', 1); d.startLevel(1);
  for (let i = 0; i < 60; i++) { g.step(1 / 60); ui.update(1 / 60); }
  ok(!hud.el.classList.contains('vs') && /LV 1/.test(hud.levelEl.textContent) && getComputedStyle(hud.coinPill).display !== 'none', 'single-player HUD after a match: ' + hud.levelEl.textContent);
  ok(k.q('.hud-pause').getAttribute('aria-label') === 'Pause' && !k.shown('.vs-rivals') && !k.shown('.vs-chips') && !bar.edge.classList.contains('on') && bar.rivalsEl.children.length === 0, 'match pieces left in the single-player HUD');
  k.q('.hud-pause').click();
  ok(g.state === 'paused' && ui.top() === 'pause', `the pause button does not pause a level after a match (${g.state}, ${ui.top()})`);
  g.resume();
  d.toTitle();
  R.lead = 3; R.n = 20;
  link = k.start({ referee: false, rivals: [rival({ name: 'Ana' })] });
  k.frame();
  ok(k.qa('.vs-rivals .vs-r').length === 1 && rowText().name === 'ANA' && k.text('.vs-clock') === '0:00' && !k.shown('.vs-phase') && !k.shown('.vs-chips') && !hud.el.classList.contains('vs-ph'), 'second match bar is not clean: ' + JSON.stringify(rowText()));
  k.frames(3.2);
  ok(rowText().n === '20' && k.text('.vs-clock') === '0:03', 'second match bar does not run: ' + JSON.stringify(rowText()) + ' ' + k.text('.vs-clock'));
  k.end();

  // ---- 7. two and three rivals on 360 px ----
  const c2 = () => ({ dist: Math.max(0, g.run.dist - 140), n: 7, x: 2.5, form: 0, boss: 0, zone: 1, flags: 0, danger: 7 });
  const c3 = () => ({ dist: Math.max(0, g.run.dist + 123), n: 999, x: 0.5, form: 1, boss: 0, zone: 1, flags: 0, danger: 0 });
  for (const many of [2, 3]) {
    const rivals = [rival(), rival({ slot: 2, name: 'Raider-4821', curve: c2 }), rival({ slot: 3, name: 'Zoe', curve: c3 })].slice(0, many);
    if (many === 2) rivals[1] = rival({ slot: 2, name: 'Zoe', curve: c3 });
    R.lead = 6; R.n = 120;
    link = k.start({ referee: false, rivals });
    k.frames(18, () => { keep(60); return false; });
    const rows = k.qa('.vs-rivals .vs-r');
    ok(rows.length === many && bar.rivalsEl.classList.contains('n' + many), `${many} rivals: ${rows.length} rows`);
    const centre = k.q('.hud-center').getBoundingClientRect(), box = bar.rivalsEl.getBoundingClientRect(), btn = k.q('.hud-pause').getBoundingClientRect();
    ok(box.right <= app.right - 4 && box.left >= centre.right + 2 && centre.left >= btn.right + 2 && centre.width >= 90, `${many} rivals: bar pieces overlap or leave the frame (button ..${Math.round(btn.right)}, centre ${Math.round(centre.left)}..${Math.round(centre.right)}, rivals ${Math.round(box.left)}..${Math.round(box.right)})`);
    ok(box.bottom <= 84, `${many} rivals: the rows reach down to ${Math.round(box.bottom)} px`);
    const texts = rows.map((_, i) => rowText(i));
    info['rows' + many] = texts;
    ok(rows.every((e) => fits(e.querySelector('.vs-d')) && fits(e.querySelector('.vs-cnt')) && e.querySelector('.vs-n').clientWidth >= 44), `${many} rivals: a number is clipped or a name has no room`);
    ok(texts[0].name === 'MIKA' && texts[0].n === '120' && /^▲\d+$/.test(texts[0].d), `${many} rivals, first row: ${JSON.stringify(texts[0])}`);
    const zoe = texts[many - 1];
    ok(zoe.name === 'ZOE' && zoe.n === '999' && /^▲1\d\d$/.test(zoe.d), `${many} rivals, Zoe: ${JSON.stringify(zoe)}`);
    if (many === 3) {
      ok(texts[1].cls.includes('danger') && texts[1].d === '!', 'three rivals, the one in danger: ' + JSON.stringify(texts[1]));
      link.test.silence(2, 3, 9); k.frames(0.2);
      ok(k.text('.vs-chip.c-dc') === 'RAIDER-4821 LOST CONNECTION · OUT IN 9', `silence of one of three: "${k.text('.vs-chip.c-dc')}"`);
      link.test.rivalFall(2, { by: 'dc' }); k.frames(0.2);
      ok(rowText(1).d === 'DOWN' && !k.shown('.vs-chip.c-dc'), 'one of three down: ' + JSON.stringify(rowText(1)));
      // the combo meter steps below the taller bar (it eases there: a CSS transition)
      await k.wait(450);
      const combo = k.q('.combo-meter');
      if (combo) ok(combo.getBoundingClientRect().top >= box.bottom - 1, `the combo meter (${Math.round(combo.getBoundingClientRect().top)}) sits under the rival rows (${Math.round(box.bottom)})`);
    }
    k.end();
  }
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
