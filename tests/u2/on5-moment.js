// @smoke --seconds 0 --shots 0
// Online stage 2, the big moment at the end of a match (src/online/ui/vsmoment.js), with the stub of game.versus.sab.
// 1. My fall: SQUAD DOWN! (red), tint, letterbox, camera push (22% toward camLook, eased), then YOU LOSE under it.
// 2. The last rival down: RIVAL DOWN! + the name, a white flash, the 'star' sound, letterbox, push; then YOU WIN!
//    (gold, turning rays; still on Low) and confetti from run:win.
// 3. DRAW!, a provisional verdict then the revised one, three rivals (only the last one gives RIVAL DOWN!).
// 4. All of it gone on the result screen, on HOME, on a rematch; a second match starts clean; the camera wrap is
//    installed once and does nothing outside a moment (single-player untouched).
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { installSabStub } = await import('/tests/u2/lib/sabstub.js');
const { versus, flow, ui } = k;
const mo = ui.matchUi.moment;
const sfx = [];
g.events.on('hazard:sfx', (p) => sfx.push(p.sfx));
const P = (rows) => rows.map(([slot, T, dd, by]) => ({ slot, T, d: dd, by }));
const rival = (o = {}) => ({ slot: 1, name: 'Mika', ...o });
const toResult = () => k.frames(12, () => g.state === 'result');
const keep = () => { if (g.squad.count < 40) g.squad.setCount(40, 'test'); g.heroes.guard = 99; };
const clean = () => !k.shown('.vs-down') && !k.shown('.vs-moment') && !k.q('.vm-bars').classList.contains('on') && !k.q('.vm-tint').classList.contains('on') && !mo.cam;
const pushRatio = () => {
  g.updateCamera(1 / 60);
  const a = g.camera.position.distanceTo(g.camLook), b = g.camPos.distanceTo(g.camLook);
  return b > 0 ? a / b : 1;
};
const stub = installSabStub(g);

try {
  ok(typeof g.updateCamera === 'function' && g.updateCamera.name === 'updateCameraVs' && Object.prototype.hasOwnProperty.call(g, 'updateCamera'), 'the camera is not wrapped on the instance');

  // ---- 1. my fall ----
  let link = k.start({ referee: false, rivals: [rival()] });
  k.frames(4, () => { keep(); return false; });
  const r0 = pushRatio();
  ok(Math.abs(r0 - 1) < 0.02, 'the camera is pushed before any moment: ' + r0);
  k.wipe(); k.frames(0.3);
  ok(k.shown('.vs-down') && k.text('.vs-down') === 'SQUAD DOWN!' && k.q('.vs-down').classList.contains('lose'), `my fall: "${k.text('.vs-down')}"`);
  ok(k.q('.vm-bars').classList.contains('on') && k.q('.vm-tint').classList.contains('on') && k.q('.vm-tint').classList.contains('lose') && !k.shown('.vs-moment'), 'my fall: no letterbox / tint, or a verdict too early');
  ok(getComputedStyle(k.q('.vm-tint')).filter === 'none' && getComputedStyle(k.q('.vm-tint')).backdropFilter === 'none', 'the tint uses a CSS filter');
  await k.wait(700);
  const r1 = pushRatio();
  info.push = Math.round(r1 * 1000) / 1000;
  ok(r1 > 0.74 && r1 < 0.81 && mo.cam, `the camera push after 0.7 s: ${r1} (want ~0.78)`);
  const barT = k.q('.vm-bar.t').getBoundingClientRect();
  ok(barT.top >= -1 && barT.height > 40 && barT.height < 90, 'letterbox bar: ' + JSON.stringify(barT));
  link.test.verdict({ result: 'lose', place: 2, places: P([[1, null, null, null], [0, versus.t, Math.round(versus.myD), 'dead']]), reason: 'fell' });
  k.frame();
  ok(k.text('.vs-moment') === 'YOU LOSE' && k.q('.vs-moment').classList.contains('lose') && k.q('.vs-moment').classList.contains('under') && k.shown('.vs-down'), `verdict after my fall: "${k.text('.vs-moment')}"`);
  await k.wait(700); // (both pop in with a scale animation)
  const dbe = k.q('.vs-down .vd-big'), mbe = k.q('.vs-moment .vm-big');
  const db = dbe.getBoundingClientRect(), mb = mbe.getBoundingClientRect();
  info.lose = { banner: [Math.round(db.top), Math.round(db.bottom), dbe.scrollWidth, dbe.clientWidth], verdict: [Math.round(mb.top), Math.round(mb.bottom), mbe.scrollWidth, mbe.clientWidth], bar: Math.round(k.q('.vm-bar.t').getBoundingClientRect().bottom) };
  ok(db.bottom <= mb.top + 2 && dbe.scrollWidth <= dbe.clientWidth + 1 && mbe.scrollWidth <= mbe.clientWidth + 1 && db.top > k.q('.vm-bar.t').getBoundingClientRect().bottom, 'the banner and the verdict overlap or are cut: ' + JSON.stringify(info.lose));
  toResult();
  ok(g.state === 'result' && ui.current === 'vsresult' && clean(), 'moment pieces left on the result screen');
  ok(Math.abs(pushRatio() - 1) < 0.02, 'the camera push outlived the moment');
  ui.matchUi.leave();

  // ---- 2. the last rival down -> YOU WIN! ----
  sfx.length = 0;
  link = k.start({ rivals: [rival({ fallAt: 5 })] });
  let flashMax = 0;
  k.frames(8, () => { keep(); if (g.fx) flashMax = Math.max(flashMax, g.fx.screen.f); return !!mo.banner; });
  ok(k.text('.vs-down .vd-big') === 'RIVAL DOWN!' && k.text('.vs-down .vd-sub') === 'MIKA' && k.q('.vs-down').classList.contains('rival'), `rival down: "${k.text('.vs-down')}"`);
  ok(flashMax > 0.6 && sfx.includes('star') && k.q('.vm-bars').classList.contains('on') && mo.cam, `rival down: flash ${flashMax}, sounds ${sfx}, cam ${mo.cam}`);
  ok(!k.shown('.hazard-hint') || !/RIVAL DOWN/.test(k.text('.hazard-hint')), 'the old RIVAL DOWN! hint shows over the banner');
  k.frames(3, () => { keep(); return !!versus.result; });
  k.frame();
  ok(versus.result && versus.result.result === 'win' && k.text('.vs-moment') === 'YOU WIN!' && k.q('.vs-moment').classList.contains('win'), `win: "${k.text('.vs-moment')}"`);
  ok(getComputedStyle(k.q('.vs-moment'), '::before').animationName === 'vm-rays', 'no turning rays on High: ' + getComputedStyle(k.q('.vs-moment'), '::before').animationName);
  ok(g.fx && g.fx.confetti.active > 0, 'no confetti on the win');
  toResult();
  ok(g.state === 'result' && clean(), 'win moment left on the result screen');

  // ---- 4a. rematch: clean ----
  flow.startMatch({ rivals: [rival()], referee: false });
  k.frame();
  ok(clean() && versus.live, 'a rematch does not start clean');
  k.frames(2, () => { keep(); return false; });
  // ---- 3. draw ----
  link = flow.link;
  k.wipe(); k.frame();
  link.test.rivalFall(1, { T: versus.t, d: versus.myD });
  link.test.verdict({ result: 'draw', place: 1, places: P([[0, versus.t, versus.myD, 'dead'], [1, versus.t, versus.myD, 'dead']]), reason: 'draw' });
  k.frame();
  ok(k.text('.vs-down') === 'SQUAD DOWN!' && k.text('.vs-moment') === 'DRAW!' && k.q('.vs-moment').classList.contains('draw'), `draw: "${k.text('.vs-down')}" / "${k.text('.vs-moment')}"`);
  k.end();

  // ---- 3b. provisional, then revised ----
  link = k.start({ referee: false, rivals: [rival()] });
  k.frames(2, () => { keep(); return false; });
  k.wipe(); k.frame();
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'offline', provisional: true });
  k.frame();
  ok(k.text('.vs-moment') === 'YOU LOSE', 'provisional: ' + k.text('.vs-moment'));
  link.test.verdict({ result: 'win', place: 1, places: [], reason: 'quit', revised: true });
  k.frame();
  ok(k.text('.vs-moment') === 'YOU WIN!' && k.q('.vs-moment').classList.contains('win') && k.text('.vs-down') === 'SQUAD DOWN!', 'revised: ' + k.text('.vs-moment'));

  // ---- 4b. HOME in the middle of a moment ----
  d.toTitle();
  ok(clean(), 'moment pieces left after HOME');

  // ---- 2b. Low graphics: still rays, no turning ----
  const q0 = g.engine.quality;
  g.applyQuality('low');
  link = k.start({ rivals: [rival({ fallAt: 4 })], picks: undefined });
  k.frames(8, () => { keep(); return !!versus.result; });
  k.frame();
  ok(k.text('.vs-moment') === 'YOU WIN!' && k.q('.vs-moment').classList.contains('low') && getComputedStyle(k.q('.vs-moment'), '::before').animationName === 'none' && getComputedStyle(k.q('.vs-moment'), '::before').backgroundImage.includes('conic'), 'Low graphics win: ' + k.q('.vs-moment').className);
  info.lowPush = Math.round(pushRatio() * 1000) / 1000;
  k.end();
  g.applyQuality(q0 || 'high');

  // ---- 3c. three rivals: only the last one gives RIVAL DOWN! ----
  link = k.start({ referee: false, rivals: [rival(), rival({ slot: 2, name: 'Zoe' }), rival({ slot: 3, name: 'Raider-4821' })] });
  k.frames(2, () => { keep(); return false; });
  link.test.rivalFall(2, {}); k.frames(0.2, () => { keep(); return false; });
  ok(!mo.banner && k.qa('.sab-feed .sf-line').some((e) => e.textContent === 'ZOE IS OUT! 3 LEFT'), 'first of three out: ' + mo.banner + ' ' + JSON.stringify(k.qa('.sab-feed .sf-line').map((e) => e.textContent)));
  link.test.rivalFall(1, {}); k.frames(0.2, () => { keep(); return false; });
  ok(!mo.banner && k.qa('.sab-feed .sf-line').some((e) => e.textContent === 'MIKA IS OUT! 2 LEFT'), 'second of three out');
  link.test.rivalFall(3, { by: 'quit' }); k.frames(0.2, () => { keep(); return false; });
  ok(mo.banner === 'rival' && k.text('.vs-down .vd-big') === 'RIVAL LEFT!' && k.text('.vs-down .vd-sub') === 'RAIDER-4821', 'the last of three: ' + k.text('.vs-down'));
  k.end();
  ok(clean(), 'moment pieces left after leaving');

  // ---- 4c. single-player afterwards: nothing of it ----
  d.setAutopilot('pro', 1); d.startLevel(1);
  for (let i = 0; i < 30; i++) { g.step(1 / 60); ui.update(1 / 60); }
  g.squad.setCount(0, 'test');
  for (let i = 0; i < 30; i++) { g.step(1 / 60); ui.update(1 / 60); }
  ok(clean() && Math.abs(pushRatio() - 1) < 0.02, 'a single-player loss shows the versus moment or pushes the camera');
  d.toTitle();
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  stub.remove();
  k.end();
}
return { pass: fails.length === 0, fails, info };
