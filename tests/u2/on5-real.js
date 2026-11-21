// @smoke --seconds 0 --shots 0 --size 390x844
// Online stage 2, the REAL sabotage (src/online/game/sabotage.js) with the REAL UI (src/online/ui/sab*.js), no stub:
// 1. A scripted rival sends FOG with 0.4 s of lag: the warning card shows FOG! / FROM ANN when it is received, the
//    fog lands 1.0 s (played clock) after receipt, the card goes, the fog mod is written, my samples carry the
//    'sabotaged' flag.
// 2. My meter fills from kills (the ring grows), a charge makes the button ready, a tap (pointerdown) sends: the feed
//    says "<KIND> SENT TO ANN", link.test.events has k 's', a = code + 100 x tenths(clock), to = Ann's slot.
// 3. A boss kill gives a BIG one: BIG on the button (gold), the BIG! chip and the feed line; a tap sends it to -1.
//    The BOSS n DOWN! banner promises no coins (a match pays none). The fog layer shows only while the fog runs.
// 4. A rival's flags (frozen / big) show in the bar.
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const W = await import('/src/online/ui/sabwords.js');
const { SAB, sabDecode } = await import('/src/online/game/sabdata.js');
const { FLAG } = await import('/src/online/codec.js');
const { versus, ui } = k;
const STEP = 1 / 60;
const log = [];
for (const type of ['sab:charge', 'sab:sent', 'sab:warn', 'sab:wait', 'sab:land', 'sab:end', 'sab:drop']) g.events.on(type, (p) => log.push({ type, t: versus.t, clock: versus.link ? versus.link.clock() : 0, ...p }));
const of = (type) => log.filter((e) => e.type === type);
const R = { flags: 0 };
const curve = (t) => ({ dist: 9.3 * t, n: 70, x: -2, form: 0, boss: 0, zone: 1, flags: R.flags, danger: 0 });
const keep = () => { g.heroes.guard = 99; if (g.squad.count < 120) g.squad.setCount(120, 'test'); };
const btn = () => k.q('.sab-btn');
const shown = (sel) => k.shown(sel);
const feed = () => k.qa('.sab-feed .sf-line').map((e) => e.textContent);
const down = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3 }));
const r3 = (x) => Math.round(x * 1000) / 1000;

try {
  ok(versus.sab && typeof versus.sab.view === 'function' && !versus.sab.__sabStub, 'the real sabotage is not game.versus.sab');
  const link = k.start({ referee: false, rivals: [{ slot: 1, name: 'Ann', curve, lag: 0.12 }] });
  k.frames(3, () => { keep(); return false; });
  ok(shown('.sab-btn') && versus.sab.view().on, 'the button does not show after GO');

  // ---- 1. FOG from Ann, 0.4 s of lag ----
  log.length = 0;
  const sentAt = link.clock();
  link.test.sab(1, SAB.code.fog, { lag: 0.4 });
  k.frames(0.6, () => { keep(); return of('sab:warn').length > 0; });
  k.frame();
  const card = k.q('.sab-warns .sab-warn');
  const w = of('sab:warn')[0];
  ok(w && w.code === 2 && w.name === 'Ann' && w.lands === 1, 'no FOG warning: ' + JSON.stringify(log));
  ok(w && w.clock - sentAt >= 0.4 - 1e-6 && w.clock - sentAt <= 0.4 + STEP + 1e-6, `received ${w && r3(w.clock - sentAt)} s after the send (want 0.4)`);
  ok(card && card.querySelector('.sw-head').textContent === 'FOG!' && card.querySelector('.sw-from').textContent === 'FROM ANN', 'warning card: ' + (card && card.textContent));
  k.frames(1.3, () => { keep(); return of('sab:land').length > 0; });
  const l = of('sab:land')[0];
  info.fog = { recv: w && r3(w.t), land: l && r3(l.t), dt: w && l && r3(l.t - w.t) };
  ok(l && l.code === 2 && l.id === w.id && l.t - w.t >= 1 - 1e-6 && l.t - w.t <= 1 + STEP + 1e-6, 'FOG did not land 1.0 s after receipt: ' + JSON.stringify(info.fog));
  k.frame();
  ok(versus.sab.view().fog > 5.5 && g.hazards.mods.fogMul <= 0.4 + 1e-9, `fog on me: ${versus.sab.view().fog} s, fogMul ${g.hazards.mods.fogMul}`);
  ok(k.q('.sab-air.fog').classList.contains('on'), 'the fog layer does not show while the fog runs');
  k.frames(0.6, () => { keep(); return false; });
  ok(!k.q('.sab-warns .sab-warn'), 'the FOG card stays after it landed');
  k.frames(0.5, () => { keep(); return false; });
  const fl = link.test.sent.slice(-3).map((s) => s.flags & FLAG.sabotaged);
  ok(fl.every(Boolean), 'my samples do not say sabotaged while the fog runs: ' + fl);

  // ---- 2. the meter fills from kills, a tap sends ----
  versus.sab.test.clear();
  const kills0 = g.run.kills, rings = new Set();
  k.frames(70, () => { keep(); rings.add(btn().style.getPropertyValue('--f')); return versus.sab.view().ready >= 1; });
  const v = versus.sab.view();
  info.meter = { kills: g.run.kills - kills0, t: r3(versus.t), ready: v.ready, rings: rings.size, next: v.next };
  ok(v.ready >= 1 && g.run.kills > kills0, 'the meter never gave a charge: ' + JSON.stringify(info.meter));
  ok(rings.size >= 4, 'the ring did not grow while the meter filled: ' + [...rings].slice(0, 8).join(' '));
  k.frames(0.2, () => { keep(); return false; });
  ok(btn().classList.contains('ready') && btn().classList.contains('can'), 'a charge does not make the button ready: ' + btn().className);
  ok(btn().getAttribute('aria-label') === `Send ${W.sabKind(v.next).name} (Q)`, 'the button does not show the loaded kind: ' + btn().getAttribute('aria-label'));
  const code = v.next, n0 = link.test.events.length;
  down(btn());
  const sendClock = link.clock();
  k.frames(0.1);
  const e = link.test.events[n0];
  info.send = e && { a: e.a, to: e.to, k: e.k, dec: sabDecode(e.a), clock: r3(sendClock) };
  ok(e && e.k === 's' && e.to === 1 && sabDecode(e.a).code === code && Math.abs(sabDecode(e.a).sent - sendClock) <= 0.1 + 1e-6, 'the tap sent: ' + JSON.stringify(info.send));
  ok(link.test.events.length === n0 + 1, 'one tap sent more than once');
  ok(feed().includes(W.sentWords(code, ['Ann'])), 'the feed after a send: ' + JSON.stringify(feed()));
  ok(versus.sab.view().wait > 5, 'no 6 s gap after a send: ' + versus.sab.view().wait);
  k.frames(0.1);
  ok(k.text('.sab-btn .sb-wait') === '6', 'wait number after a send: ' + k.text('.sab-btn .sb-wait'));

  // ---- 3. a boss kill gives a BIG one ----
  d.skipToBoss();
  k.frames(20, () => { keep(); return g.run.phase === 'boss' && g.boss && g.boss.state === 'fight'; });
  ok(g.run.phase === 'boss' && g.boss && g.boss.state === 'fight', 'never reached the boss arena');
  const zone = g.endless.zone;
  ok(!k.q('.sab-air.fog').classList.contains('on'), 'the fog layer stays after the fog');
  d.killBoss();
  k.frames(20, () => { keep(); return g.endless.zone > zone && g.run.phase === 'run'; });
  // the BOSS n DOWN! banner of endless: an online match pays no coins, so it promises none
  const bannerText = ui.hud.banner.textContent;
  info.banner = bannerText;
  ok(/BOSS \d+ DOWN!/.test(bannerText) && !/COIN/.test(bannerText), 'the boss banner in a match: ' + bannerText);
  k.frames(0.2, () => { keep(); return false; });
  const b = versus.sab.view(), ch = of('sab:charge').filter((x) => x.source === 'boss');
  info.big = { zone: g.endless.zone, big: b.big, charge: ch.length, chip: k.text('.sab-btn .sb-chip'), cls: btn().className };
  ok(b.big === SAB.code.storm && ch.length === 1 && !ch[0].lost, 'no HORDE STORM after the boss: ' + JSON.stringify(info.big));
  ok(btn().classList.contains('big') && shown('.sab-btn .sb-big') && btn().getAttribute('aria-label') === 'Send HORDE STORM (Q)', 'BIG is not on the button: ' + btn().className);
  ok(feed().includes(W.BIG_WORDS), 'the feed after the boss: ' + JSON.stringify(feed()));
  k.frames(6, () => { keep(); return versus.sab.view().can; });
  const n1 = link.test.events.length;
  down(btn());
  k.frames(0.1);
  const eb = link.test.events[n1];
  ok(eb && eb.to === -1 && sabDecode(eb.a).code === SAB.code.storm && versus.sab.view().big === 0, 'the big send: ' + JSON.stringify(eb));
  ok(feed().includes(W.sentWords(SAB.code.storm, ['Ann'])), 'the feed after a big send: ' + JSON.stringify(feed()));

  // ---- 4. the rival's flags in the bar ----
  R.flags = FLAG.frozen | FLAG.bigReady;
  k.frames(0.8, () => { keep(); return false; });
  const icons = k.qa('.vs-rivals .vs-fi').map((x) => x.className.replace('vs-fi', '').trim());
  ok(icons.includes('frozen') && icons.includes('bigReady') && !icons.includes('sabotaged'), 'rival flags in the bar: ' + icons);
  R.flags = 0;
  k.frames(0.8, () => { keep(); return false; });
  ok(k.qa('.vs-rivals .vs-fi').length === 0, 'rival flags stay after they cleared');

  // ---- my fall: the button goes, nothing pending lands ----
  link.test.sab(1, SAB.code.wave);
  k.frames(0.3);
  ok(of('sab:warn').some((x) => x.code === 1), 'the last wave was not received');
  const landed = of('sab:land').length;
  k.wipe();
  k.frames(2);
  ok(of('sab:land').length === landed && !shown('.sab-btn') && !k.q('.sab-warns .sab-warn'), 'after my fall: a landing, the button or a card');
  ok(g.runMods.holdFn === null, 'a hold after my fall');
} catch (err) {
  fails.push('threw: ' + (err.stack || err.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
