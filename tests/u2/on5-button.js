// @smoke --seconds 0 --shots 0
// Online stage 2, sabotage UI: the SABOTAGE button (src/online/ui/sabbtn.js) against the stub of game.versus.sab
// (tests/u2/lib/sabstub.js: the exact API of STAGE2 in front of the real one; on5-real.js runs the real one).
// 1. Hidden in single-player and before GO; shown after GO; gone after my fall; never in the single-player HUD later.
// 2. Shows the icon of `next`, x2 at 2 charges, the wait seconds, BIG (gold) with a big one, NOW! when the target is in
//    danger and a send is possible; a READY chip on sab:charge.
// 3. Sits on the side opposite the ability button and swaps with it (ui.applyHand); nothing overlaps the ability /
//    formation / dodge buttons or the weapon badge.
// 4. A tap (pointerdown) and Q call send() once each; a refused send shakes and plays 'deny'.
// 5. DOM writes only on change: <= 10 per 60 frames of steady fill, 0 with nothing changing.
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { installSabStub } = await import('/tests/u2/lib/sabstub.js');
const { versus, ui } = k;
const hud = ui.hud;
const sfx = [];
g.events.on('hazard:sfx', (p) => sfx.push(p.sfx));
const btn = () => k.q('.sab-btn');
const shown = () => { const b = btn(); return !!b && b.isConnected && getComputedStyle(b).display !== 'none'; };
const tag = (cls) => { const e = k.q('.sab-btn ' + cls); return !!e && getComputedStyle(e).display !== 'none'; };
const box = (sel) => { const e = typeof sel === 'string' ? k.q(sel) : sel; if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
const overlap = (a, b) => !!(a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1);
const keep = () => { if (g.squad.count < 40) g.squad.setCount(40, 'test'); g.heroes.guard = 99; };
const app = document.getElementById('app').getBoundingClientRect();
const down = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7 }));
const keyQ = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true }));
const save0 = g.save.data.settings.abilitySide;
let stub = null;

try {
  // ---- 1. single-player first: no button anywhere ----
  d.setAutopilot('pro', 1); d.startLevel(1);
  for (let i = 0; i < 30; i++) { g.step(1 / 60); ui.update(1 / 60); }
  ok(!btn(), 'a sabotage button is in the single-player HUD before any match');
  d.toTitle();

  // ---- before GO: hidden ----
  stub = installSabStub(g);
  let c = -3;
  k.start({ referee: false, clock: () => (c != null ? c : versus.simT), rivals: [{ slot: 1, name: 'Mika' }] });
  k.frames(0.5);
  ok(btn() && !shown() && !stub.view().on, 'the button shows before GO');
  c = 0.1; k.frames(0.3);
  ok(shown() && stub.view().on, 'the button does not show after GO');
  c = null; // (the match clock follows the game from here)

  // ---- 2. what it shows ----
  stub.set({ next: 2, ready: 0, fill: 0.5 }); k.frames(0.1);
  ok(btn().getAttribute('aria-label') === 'Send FOG (Q)' && !btn().classList.contains('ready') && !tag('.sb-x2') && !tag('.sb-big'), 'empty button: ' + btn().className + ' / ' + btn().getAttribute('aria-label'));
  ok(btn().style.getPropertyValue('--f') === '180.0deg', 'ring at half: ' + btn().style.getPropertyValue('--f'));
  stub.set({ ready: 1, fill: 0.2, next: 5 }); k.frames(0.1);
  ok(btn().classList.contains('ready') && btn().classList.contains('can') && btn().getAttribute('aria-label') === 'Send FREEZE (Q)', 'one charge: ' + btn().className);
  stub.set({ ready: 2 }); k.frames(0.1);
  ok(btn().classList.contains('x2') && tag('.sb-x2') && k.text('.sab-btn .sb-x2') === 'x2' && btn().style.getPropertyValue('--f') === '360.0deg', 'two charges: ' + btn().className);
  stub.set({ wait: 4.2 }); k.frames(0.1);
  ok(k.text('.sab-btn .sb-wait') === '5' && !btn().classList.contains('can'), `waiting: "${k.text('.sab-btn .sb-wait')}" ${btn().className}`);
  stub.set({ wait: 0 }); k.frames(0.1);
  ok(k.text('.sab-btn .sb-wait') === '' && btn().classList.contains('can'), 'the wait number did not clear');
  stub.set({ big: 11 }); k.frames(0.1);
  ok(btn().classList.contains('big') && tag('.sb-big') && k.text('.sab-btn .sb-big') === 'BIG' && btn().getAttribute('aria-label') === 'Send HORDE STORM (Q)', 'big one: ' + btn().className);
  stub.set({ big: 0, ready: 1, targetDanger: 7 }); k.frames(0.1);
  ok(btn().classList.contains('now') && tag('.sb-now') && k.text('.sab-btn .sb-now') === 'NOW!', 'NOW! with the target in danger: ' + btn().className);
  stub.set({ wait: 3 }); k.frames(0.1);
  ok(!btn().classList.contains('now') && !tag('.sb-now'), 'NOW! shows while a send is not possible');
  stub.set({ wait: 0, targetDanger: 2 }); k.frames(0.1);
  ok(!btn().classList.contains('now'), 'NOW! did not clear');
  stub.charge('meter'); k.frame();
  ok(k.q('.sab-btn .sb-chip').classList.contains('show') && k.text('.sab-btn .sb-chip') === 'READY', 'no READY chip on sab:charge');
  k.frames(1.6);
  ok(!k.q('.sab-btn .sb-chip').classList.contains('show'), 'the READY chip stays');

  // ---- 3. the side opposite the ability button ----
  for (const side of ['right', 'left']) {
    g.save.data.settings.abilitySide = side; ui.applyHand(); k.frames(0.1);
    const b = box(btn()), ab = box('.hud-ability-mount .ability-btn') || box('.hud-ability-mount'), wpn = box('.hud-weapon'), form = box('.form-btn'), dodge = box('.dodge-btn');
    const mid = app.left + app.width / 2;
    const sabLeft = b && b.right < mid, abLeft = ab && ab.right < mid;
    info['side-' + side] = { sab: b && [Math.round(b.left), Math.round(b.top), Math.round(b.width)], ability: ab && [Math.round(ab.left), Math.round(ab.top)], weapon: wpn && [Math.round(wpn.left), Math.round(wpn.top)] };
    ok(b && ab && sabLeft !== abLeft && sabLeft === (side === 'right'), `ability ${side}: the sabotage button is not on the other side ` + JSON.stringify(info['side-' + side]));
    ok(b && Math.abs(b.width - 62) <= 1 && b.left >= app.left && b.right <= app.right && b.bottom <= app.bottom, 'the button is not 62 px inside the frame: ' + JSON.stringify(b));
    ok(!overlap(b, ab) && !overlap(b, wpn) && !overlap(b, form) && !overlap(b, dodge), `ability ${side}: the button overlaps another control`);
    ok(wpn && b.bottom <= wpn.top + 1, `ability ${side}: the button is not above the weapon badge`);
  }
  g.save.data.settings.abilitySide = save0 || 'right'; ui.applyHand();

  // ---- 4. tap and Q ----
  stub.set({ ready: 1, wait: 0 }); stub.unset('wait', 'ready', 'targetDanger'); k.frames(0.1);
  let n0 = stub.calls.send;
  down(btn()); btn().click(); // (the click after a pointerdown is swallowed)
  ok(stub.calls.send === n0 + 1 && stub.calls.results.at(-1).ok && stub.calls.results.at(-1).to === 1, 'a tap did not send once: ' + JSON.stringify(stub.calls));
  k.frames(0.1);
  ok(k.text('.sab-btn .sb-wait') === '6' && !btn().classList.contains('ready'), 'after a send: ' + k.text('.sab-btn .sb-wait'));
  sfx.length = 0;
  down(btn());
  ok(stub.calls.send === n0 + 2 && !stub.calls.results.at(-1).ok && stub.calls.results.at(-1).why === 'empty', 'refused send: ' + JSON.stringify(stub.calls.results.at(-1)));
  ok(btn().classList.contains('deny') && sfx.includes('deny'), `a refused send did not shake / deny: ${btn().className} ${sfx}`);
  ok(getComputedStyle(btn()).animationName === 'sb-deny', 'the shake animation does not run: ' + getComputedStyle(btn()).animationName);
  stub.test.give(4, 1); stub.set({ wait: 0 }); stub.unset('wait'); k.frames(0.1);
  n0 = stub.calls.send;
  keyQ();
  ok(stub.calls.send === n0 + 1 && stub.calls.results.at(-1).ok && stub.calls.results.at(-1).code === 4, 'Q did not send: ' + JSON.stringify(stub.calls.results.at(-1)));
  const input = document.createElement('input'); document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true }));
  input.remove();
  ok(stub.calls.send === n0 + 1, 'Q typed into an input sent a sabotage');

  // ---- 5. DOM writes ----
  stub.test.clear(); stub.set({ ready: 0, fill: 0, wait: 0 }); k.frames(0.2);
  const w = k.watch([btn()]);
  let writes = 0, fill = 0;
  for (let i = 0; i < 300; i++) { keep(); fill += 0.15 / 60; stub.set({ fill }); k.frame(); writes += w.take().length; }
  info.btnWritesPer60 = Math.round(writes / 5 * 10) / 10;
  ok(writes > 0 && writes / 5 <= 10, `the button wrote ${writes / 5} times per 60 frames of steady fill (budget 10)`);
  let still = 0;
  for (let i = 0; i < 120; i++) { keep(); k.frame(); still += w.take().length; }
  w.stop();
  ok(still === 0, `the button wrote ${still} times with nothing changing`);

  // ---- 1b. my fall hides it; afterwards single-player has none ----
  k.wipe(); k.frames(0.3);
  ok(!shown() && !stub.view().on, 'the button shows after my fall');
  k.end();
  d.setAutopilot('pro', 1); d.startLevel(1);
  for (let i = 0; i < 30; i++) { g.step(1 / 60); ui.update(1 / 60); }
  ok(!btn() && !k.q('.sab-warn') && !k.text('.sab-feed'), 'sabotage pieces in the single-player HUD after a match');
  d.toTitle();

  stub.remove(); stub = null;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (stub) stub.remove();
  g.save.data.settings.abilitySide = save0; ui.applyHand();
  k.end();
}
return { pass: fails.length === 0, fails, info };
