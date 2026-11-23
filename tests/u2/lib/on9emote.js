// The on9-emote scenario (tests/u2/on9-emote.js at 390x844, on9-emote-small.js at 360x640): src/online/ui/emotes.js.
// 1. A scripted match (on3kit, testlink): the button sits clear of SABOTAGE, the ability button and the rival row; a tap
//    opens the fan and never steers; a send goes out as { k: 'e', a, to: -1 } with my bubble; a second inside 2 s and
//    a 21st are refused (shake); a rival's emote pops under its bar row, one per second per sender; a = 9, 1.5, 'x'
//    are ignored; MUTE hides them and is stored (a reload starts muted); key E opens the fan; on the result screen
//    the dock stays and a rival's GG pops over its result row.
// 2. A bot match (bot.js link, Math.random stubbed): a reply to my emote, a GG after the verdict, at most 3.
// 3. The real network (in-page hub, the real rules, a friend room with a plain second player): my emote is one `ev`
//    item { k: 'e', a } in the hub; the plain player's emote pops over its bar row.
import * as N from '/tests/u2/lib/on9kit.js';

const down = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5, clientX: 0, clientY: 0 }));
const rectOf = (el) => el.getBoundingClientRect();
const over = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;

export async function emoteScenario(g) {
  const fails = [], info = { size: `${innerWidth}x${innerHeight}` };
  const ok = (c, what) => { if (!c) fails.push(what); };
  const MUTE = 'nimbusRaiders.online.mute';
  const rnd = Math.random;
  try { localStorage.removeItem(MUTE); } catch { /* blocked */ }
  const { mutedSaved, EMOTE } = await import('/src/online/ui/emotes.js');
  const { on3 } = await import('/tests/u2/lib/on3kit.js');
  const k = await on3(g);
  const { versus, ui, mu } = k;
  const E = mu.emotes;
  const shot = async (name) => { if (!window.__shot) return; g.snapCamera(); g.sync(1 / 60); g.engine.render(); await N.wait(300); await window.__shot(`emote-${name}-${innerWidth}x${innerHeight}`); };
  const tick = (s) => { for (let t = 0; t < s - 1e-9; t += 0.25) E.update(Math.min(0.25, s - t)); };   // the emote clock only
  const dock = () => k.q('.emo-dock'), btn = () => k.q('.emo-btn');
  const keep = () => { g.heroes.guard = 99; if (g.squad.count < 60) g.squad.setCount(60, 'test'); };
  try {
    // ---------- 1. a scripted match ----------
    const curve = (t) => ({ dist: 9 * t, n: 40, x: 0, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 });
    const link = k.start({ rivals: [{ slot: 1, name: 'Mika', curve }] });
    k.frames(3, () => { keep(); return false; });
    ok(versus.live && dock().style.display !== 'none' && dock().classList.contains('match'), 'no emote button in the match: ' + dock().className);
    ok(btn().hasAttribute('data-ui') && btn().getBoundingClientRect().width === 48, 'the button is not a 48 px data-ui button');
    const b = rectOf(btn()), sab = k.q('.sab-btn'), abil = k.q('.hud-ability-mount > *'), row = k.q('.vs-rivals .vs-r');
    ok(row && row.dataset.slot === '1', 'the rival row has no data-slot: ' + (row && row.outerHTML.slice(0, 80)));
    for (const [n, el] of [['SABOTAGE', sab], ['ability', abil], ['rival row', row]]) if (el && el.getClientRects().length) ok(!over(b, rectOf(el)), `the emote button covers the ${n} button`);
    const app = document.getElementById('app').getBoundingClientRect();
    ok(b.left >= app.left && b.right <= app.right && b.bottom <= app.bottom && b.top >= app.top, 'the button is off the screen');
    // a tap opens the fan and never steers
    const tx0 = g.input.targetX;
    down(btn());
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 5, clientX: 300, clientY: 500, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, clientX: 300, clientY: 500, bubbles: true }));
    k.frames(0.2, () => { keep(); return false; });
    ok(E.open && dock().classList.contains('open'), 'the fan did not open');
    ok(Math.abs(g.input.targetX - tx0) < 1e-6, `a tap on the emote button steered (${tx0} -> ${g.input.targetX})`);
    const picks = [...k.q('.emo-fan').querySelectorAll('.emo-pick')];
    ok(picks.length === 4 && picks.every((p) => p.querySelector('svg') && p.getClientRects().length) && k.q('.emo-mute').getClientRects().length, 'the fan: ' + picks.length);
    await N.wait(250); // (the fan pops in)
    const fanR2 = rectOf(k.q('.emo-fan'));
    ok(fanR2.left >= app.left - 0.5 && fanR2.right <= app.right + 0.5 && fanR2.top >= app.top + 100 && fanR2.bottom <= app.bottom, `the fan sticks out (${Math.round(fanR2.left)},${Math.round(fanR2.top)} .. ${Math.round(fanR2.right)},${Math.round(fanR2.bottom)})`);
    for (const [n, el] of [['SABOTAGE', sab], ['ability', abil], ['rival row', row]]) if (el && el.getClientRects().length) ok(!over(fanR2, rectOf(el)), `the open fan covers the ${n} button`);
    await shot('fan');
    // send: one event { k: 'e', a, to: -1 }, my bubble
    const n0 = link.test.events.length;
    down(picks[0]);
    ok(link.test.events.length === n0 + 1 && link.test.events[n0].k === 'e' && link.test.events[n0].a === 0 && link.test.events[n0].to === -1, 'the send: ' + JSON.stringify(link.test.events.slice(n0)));
    ok(!E.open && k.q('.emo-layer .emo-bub.mine'), 'no bubble of mine / the fan stayed open');
    // a second inside 2 s is refused
    down(btn()); down(k.q('.emo-pick[data-emo="3"]'));
    ok(link.test.events.length === n0 + 1 && E.test.refused === 1 && btn().classList.contains('deny'), `a second emote inside 2 s: events ${link.test.events.length - n0}, refused ${E.test.refused}`);
    // up to 20 a match, the 21st refused
    for (let i = 1; i < 20; i++) { tick(2.05); ok(E.send(i % 4), `send ${i + 1} refused`); }
    tick(2.05);
    ok(!E.send(1) && E.test.sent.length === 20 && link.test.events.filter((e) => e.k === 'e').length === 20, `the 21st: sent ${E.test.sent.length}`);
    // a rival's emote: under its bar row, the 'pop' sound, one per second per sender
    const s0 = E.test.shown.length;
    link.test.event({ k: 'e', a: 1, f: 1, to: -1, q: 1 });
    ok(E.test.shown.length === s0 + 1 && E.test.shown[s0].where === 'bar' && E.test.shown[s0].a === 1, 'a rival emote did not show: ' + JSON.stringify(E.test.shown.slice(s0)));
    const bub = [...k.qa('.emo-layer .emo-bub')].filter((x) => !x.classList.contains('mine')).pop();
    const rr = rectOf(row), base = rectOf(ui.root), bx = bub && parseFloat(bub.style.left) + base.left, by = bub && parseFloat(bub.style.top) + base.top;
    ok(bub && bub.classList.contains('down') && by >= rr.bottom && by <= rr.bottom + 12 && bx >= rr.left - 1 && bx <= rr.right + 1, `the bubble is not under the rival row: ${bx},${by} row ${[rr.left, rr.bottom, rr.right]}`);
    await shot('received');
    link.test.event({ k: 'e', a: 2, f: 1, to: -1, q: 2 });
    ok(E.test.shown.length === s0 + 1, 'a second emote of one sender inside 1 s showed');
    tick(1.05);
    for (const bad of [9, 1.5, 'x', -1, null]) link.test.event({ k: 'e', a: bad, f: 1, to: -1, q: 3 });
    link.test.event({ k: 'z', a: 1, f: 1, to: -1 });
    ok(E.test.shown.length === s0 + 1, 'a bad emote showed: ' + JSON.stringify(E.test.shown.slice(s0 + 1)));
    link.test.event({ k: 'e', a: 2, f: 1, to: -1, q: 4 });
    ok(E.test.shown.length === s0 + 2, 'an emote after 1 s did not show');
    tick(2.3);
    ok(!k.q('.emo-layer .emo-bub'), 'the bubbles stay longer than 2.2 s');
    // MUTE: nothing shows, kept for the next page
    down(btn()); down(k.q('.emo-mute'));
    ok(E.test.muted && dock().classList.contains('muted') && /UNMUTE/.test(k.text('.emo-mute')) && localStorage.getItem(MUTE) === '1' && mutedSaved(), 'MUTE: ' + k.text('.emo-mute'));
    tick(1.1);
    link.test.event({ k: 'e', a: 0, f: 1, to: -1, q: 5 });
    ok(E.test.shown.length === s0 + 2 && !k.q('.emo-layer .emo-bub'), 'a muted emote showed');
    await shot('muted');
    down(k.q('.emo-mute'));
    ok(!E.test.muted && localStorage.getItem(MUTE) === null && !mutedSaved(), 'UNMUTE');
    // key E opens the fan (not while typing)
    E.update(0); if (E.open) down(btn());
    const inp = document.createElement('input'); document.body.appendChild(inp);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    inp.remove();
    ok(!E.open, 'E typed into a text box opened the fan');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    ok(E.open, 'key E did not open the fan');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    // the result screen: the dock stays, a GG pops over the rival's result row
    link.test.rivalFall(1, { d: 50 });
    k.frames(9, () => { keep(); return g.state === 'result' && ui.current === 'vsresult'; });
    k.frames(0.5);
    ok(ui.current === 'vsresult' && dock().style.display !== 'none' && dock().classList.contains('result'), `the dock on the result screen: ${ui.current} ${dock().className} ${dock().style.display}`);
    tick(1.1);
    link.test.event({ k: 'e', a: 3, f: 1, to: -1, q: 6 });
    const last = E.test.shown[E.test.shown.length - 1];
    ok(last && last.where === 'result' && last.a === 3, 'a GG on the result screen: ' + JSON.stringify(last));
    const li = k.q('.vsr-places li[data-slot="1"]'), gb = [...k.qa('.emo-layer .emo-bub')].pop();
    const lr = li && rectOf(li), gx = gb && parseFloat(gb.style.left) + rectOf(ui.root).left, gy = gb && parseFloat(gb.style.top) + rectOf(ui.root).top;
    ok(lr && gb && gx > lr.left && gx < lr.right && gy > lr.top && gy < lr.bottom, `the GG is not over the rival result row: ${gx},${gy} row ${lr && [lr.left, lr.top, lr.right, lr.bottom]}`);
    const panelBtns = [...k.qa('.screen-vsresult .res-btns button')].filter((x) => x.getClientRects().length);
    for (const pb of panelBtns) ok(!over(rectOf(btn()), rectOf(pb)), 'the emote button covers ' + pb.textContent.trim());
    await shot('result');
    k.end();
    k.frames(0.2);
    ok(dock().style.display === 'none', 'the dock stays after the match was left');

    // ---------- 2. a bot match: a reply now and then, a GG after the verdict, at most 3 ----------
    const { createBotLink, pickBot, botForm } = await import('/src/online/bot.js');
    let ms = 0;
    const pick = { ...pickBot({ seed: 9, avoid: 'Nino' }), level: 0 };
    let blink = null;
    k.flow.startMatch = () => { blink = k.flow.link = createBotLink({ seed: 9, pick, game: g, now: () => ms, t0: 1000 }); versus.start(blink, k.flow.picks); return blink; };
    g.debug.setLoadout('pip', 'thunderclap'); g.debug.setAutopilot('pro', 3);
    k.flow.startMatch();
    const frames = (s, until) => { for (let i = 0; i < Math.round(s * 60); i++) { ms += 1000 / 60; keep(); k.frame(); if (until && until()) return true; } return false; };
    frames(2);
    Math.random = () => 0.1;     // the 35 % reply and the 50 % GG both happen; delays are their shortest + 15 %
    const b0 = E.test.shown.length;
    ok(E.send(0), 'no send in the bot match');
    frames(1.0);
    ok(E.test.shown.length === b0, 'the reply came before 1 s');
    frames(0.4);
    const rep = E.test.shown[b0];
    ok(rep && rep.slot === blink.peers[0].slot && [0, 1, 3].includes(rep.a) && rep.where === 'bar', 'no reply from the rival: ' + JSON.stringify(E.test.shown.slice(b0)));
    for (let i = 0; i < 4; i++) { tick(2.05); E.send(1); }
    frames(3);
    const replies = E.test.shown.length - b0;
    blink.bot.test.fallAt(blink.clock() + 0.5);
    frames(8, () => g.state === 'result' && ui.current === 'vsresult');
    frames(3.5);
    const after = E.test.shown.length - b0;
    ok(replies === 3 && after === 3, `bot emotes: ${replies} replies, ${after} in all (at most 3)`);
    Math.random = rnd;
    // a GG after the verdict when the match had none yet
    k.end(); botForm.reset();
    ms = 0; // (a fresh match clock: the bot's GO is 1 s after its start again)
    k.flow.startMatch();
    frames(2);
    Math.random = () => 0.1;
    const c0 = E.test.shown.length;
    blink.bot.test.fallAt(blink.clock() + 0.5);
    frames(8, () => g.state === 'result');
    frames(3.5);
    Math.random = rnd;
    const gg = E.test.shown[c0];
    ok(gg && gg.a === 3, 'no GG after the verdict: ' + JSON.stringify(E.test.shown.slice(c0)));
    ok(!/\bBOT\b/i.test(document.body.innerText), 'a word on the page says BOT');
    k.end(); botForm.reset();

    // ---------- 3. the real network: a friend room with a plain second player ----------
    const hub = await N.makeHub();
    const carl = await (await import('/tests/u2/lib/on2kit.js')).player(hub, 'carl', 'Carl');
    const room = await carl.create({});
    const P = await N.openHub(g, hub, 'me-1', 'Sky Rider');
    await P.flow.joinRoom(room.code);
    await N.until(() => P.flow.room && P.flow.room.state.me === 1);
    room.ready(true); P.flow.ready(true);
    await N.until(() => !!P.flow.link, 6000);
    const mine = P.flow.link;
    await N.until(() => room.state && room.state.mid, 3000);
    const clink = carl.match(room);
    await N.wait(300);
    ok(!!mine && versus.link === mine, 'the real match did not start: ' + !!mine);
    for (let i = 0; i < 30; i++) g.ui.update(1 / 60);
    ok(dock().style.display !== 'none', 'no emote button in the real match');
    tick(0.1);
    down(btn()); down(k.q('.emo-pick[data-emo="1"]'));
    await N.until(() => Object.keys(hub.admin.get(`rooms/${room.code}/ev/${mine.mid}`) || {}).length > 0, 3000);
    const items = Object.values(hub.admin.get(`rooms/${room.code}/ev/${mine.mid}`) || {});
    ok(items.length === 1 && items[0].k === 'e' && items[0].a === 1 && items[0].to === -1 && items[0].f === mine.slot, 'the ev item in the hub: ' + JSON.stringify(items));
    const r0 = E.test.shown.length;
    clink.sendEvent({ k: 'e', a: 2, to: -1 });
    await N.until(() => E.test.shown.length > r0, 3000);
    ok(E.test.shown.length === r0 + 1 && E.test.shown[r0].slot === clink.slot && E.test.shown[r0].a === 2 && E.test.shown[r0].where === 'bar', 'the plain player emote: ' + JSON.stringify(E.test.shown.slice(r0)));
    ok(hub.denials.length === 0, 'denied writes: ' + JSON.stringify(hub.denials.slice(0, 2)));
    info.hub = items.length;
    clink.leave();
    P.flow.leave('title');
    await room.leave().catch(() => {});
  } catch (e) {
    fails.push('crashed: ' + (e.stack || e.message));
  }
  Math.random = rnd;
  try { localStorage.removeItem(MUTE); } catch { /* blocked */ }
  try { k.end(); } catch { /* already */ }
  info.shown = mu_count(g);
  return { pass: fails.length === 0, fails, info };
}

const mu_count = (g) => (g.ui.matchUi && g.ui.matchUi.emotes ? g.ui.matchUi.emotes.test.shown.length : null);
