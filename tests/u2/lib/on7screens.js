// Body of tests/u2/on7-screens.js (390 x 844) and on7-screens-small.js (360 x 640): a whole bot match through the real
// match screens (installMatchUi, the fake flow of on3kit), on the bot link's real-match clock path (now / t0, like
// quickflow will make it: GO 4 s after the start). Checks what a player sees at each step and that no word on the page
// says BOT; window.__shot(name) (a screenshot driver, not the u2 runner) saves pictures.
//   VS card (both names) -> GO -> the versus bar with the rival's name and squad, its ghost on my road -> a warning of
//   its first sabotage with its name -> it falls: RIVAL DOWN! with its name -> YOU WIN! -> the result screen.
export async function screens(g, tag) {
  const { on3 } = await import('/tests/u2/lib/on3kit.js');
  const { createBotLink, pickBot, botForm } = await import('/src/online/bot.js');
  const k = await on3(g);
  const { versus, flow, ui } = k;
  const fails = [], info = { tag }, seen = [];
  const ok = (c, what) => { if (!c) fails.push(what); };
  const noBot = (where) => { const t = document.body.innerText; seen.push(where); if (/\bBOT\b/i.test(t)) fails.push(`"BOT" on the page at ${where}: ${(t.match(/.{0,30}\bBOT\b.{0,30}/i) || [''])[0]}`); };
  const shot = async (name) => { if (!window.__shot) return; g.snapCamera(); g.sync(1 / 60); g.engine.render(); await window.__shot(`${tag}-${name}`); };
  const inView = (sel) => { const e = k.q(sel); if (!e) return false; const r = e.getBoundingClientRect(), a = document.getElementById('app').getBoundingClientRect(); return r.width > 0 && r.left >= a.left - 1 && r.right <= a.right + 1 && r.top >= a.top - 1 && r.bottom <= a.bottom + 1; };
  const app = document.getElementById('app').getBoundingClientRect();
  info.size = `${Math.round(app.width)}x${Math.round(app.height)}`;

  let ms = 0;
  const seed = 77, pick = { ...pickBot({ seed, avoid: 'Nino' }), level: 0 };
  let link = null;
  flow.startMatch = () => {
    flow.calls.start++;
    link = flow.link = createBotLink({ seed, pick, game: g, now: () => ms, t0: 4000 });
    versus.start(link, flow.picks);
    return link;
  };
  const frames = (s, until) => { for (let i = 0; i < Math.round(s * 60); i++) { ms += 1000 / 60; if (versus.live) k.tough(); k.frame(); if (until && until()) return true; } return !!(until && until()); };
  k.tough = () => { g.heroes.guard = 99; if (g.run && g.run.active && g.squad.count < 60) g.squad.setCount(60, 'start'); };

  try {
    botForm.reset();
    k.d.setLoadout('pip', 'thunderclap');
    k.d.setAutopilot('pro', 3);
    flow.rs = { can: true, mine: false, others: [{ slot: 1, name: pick.name, here: true, wants: false }], waitingFor: null, lost: false, hostLeft: false };
    flow.startMatch();
    frames(0.5);
    const card = k.text('.vs-card');
    ok(k.shown('.vs-card') && card.includes(pick.name.toUpperCase()) && card.includes('NINO'), 'VS card: ' + card);
    ok(inView('.vs-card'), 'the VS card is not inside the screen');
    ok(link.clock() < 0 && link.peers[0].bot === true && link.t0 === 4000, `before GO: clock ${link.clock()}`);
    noBot('vs card');
    await shot('1-vscard');
    info.card = card;

    frames(4);
    ok(versus.go && link.clock() > 0, 'no GO after the 4 s card');
    await k.wait(900); // (the card leaves on real time after GO!, like on3-card)
    frames(18);
    ok(!k.shown('.vs-card'), 'the VS card is still up after GO');
    const row = k.q('.vs-rivals .vs-r');
    const name = row && row.querySelector('.vs-name').textContent, cnt = row && row.querySelector('.vs-cnt').textContent;
    ok(row && name.toUpperCase() === pick.name.toUpperCase() && Number(cnt.replace(/\D/g, '')) === versus.v.peers[0].n && versus.v.peers[0].n > 1, `bar: ${name} ${cnt} (rival squad ${versus.v.peers[0].n})`);
    ok(inView('.vs-rivals'), 'the versus bar is not inside the screen');
    const gh = versus.ghost.mesh;
    ok(gh.visible && gh.count > 0, `the ghost is not on the road (count ${gh.count}, rival ${Math.round(versus.v.peers[0].dist)} u, me ${Math.round(g.run.dist)} u)`);
    noBot('bar + ghost');
    await shot('2-bar-ghost');
    info.bar = `${name} ${cnt}, ghost ${gh.count} Raiders, rival ${Math.round(versus.v.peers[0].dist)} u / me ${Math.round(g.run.dist)} u`;

    const warned = frames(30, () => k.shown('.sab-warns .sab-warn'));
    const warn = k.text('.sab-warns .sab-warn');
    ok(warned && warn && warn.toUpperCase().includes(pick.name.toUpperCase()), `no warning of its first sabotage (sent ${JSON.stringify(link.bot.test.events[0] || null)}): ${warn}`);
    noBot('warning');
    await shot('3-warning');
    info.warn = warn;

    frames(3);
    link.bot.test.fallAt(link.clock() + 2);
    const down = frames(6, () => k.shown('.vs-down') && /RIVAL DOWN/.test(k.text('.vs-down')));
    ok(down && k.text('.vs-down .vd-sub') === pick.name.toUpperCase(), 'RIVAL DOWN!: ' + k.text('.vs-down'));
    noBot('rival down');
    await shot('4-rival-down');
    const won = frames(3, () => k.text('.vs-moment') === 'YOU WIN!');
    ok(won, 'YOU WIN!: ' + k.text('.vs-moment'));
    noBot('you win');
    await shot('5-you-win');
    const res = frames(8, () => g.state === 'result' && ui.current === 'vsresult' && k.shown('.screen-vsresult'));
    const panel = k.text('.screen-vsresult .panel');
    ok(res && k.text('.screen-vsresult .ribbon') === 'YOU WIN!' && panel.toUpperCase().includes(pick.name.toUpperCase()), 'result: ' + panel);
    noBot('result');
    await shot('6-result');
    info.result = panel;
    ok(botForm.get().run === 1, 'the win was not recorded: ' + JSON.stringify(botForm.get()));
  } catch (e) {
    fails.push('threw: ' + (e.stack || e.message));
  }
  info.checked = seen.join(', ');
  k.end();
  botForm.reset();
  return { pass: fails.length === 0, fails, info };
}
