// @smoke --seconds 0 --shots 0
// Online stage 1, match UI: the end of a match (verdict handling in versus.js, the 'vsresult' screen, leaving).
// 1. WIN: YOU WIN! moment over the run, then 'vsresult' (never the single-player result): ribbon, why, both players'
//    time + distance, REMATCH + LEAVE and nothing else (no RETRY / NEXT / MAP / HOME, no coins). Nothing is saved.
// 2. LOSE: "WAITING FOR THE RESULT" while the verdict is out, then YOU LOSE / SQUAD DOWN, the rival STILL STANDING.
// 3. DRAW, a win by distance, a win because the rival lost connection, a loss by my own connection (CONNECTION LOST).
// 4. Provisional verdict, then the revised one: the screen shows the later result (also when it arrives before the
//    screen); anything else after a verdict is ignored; an old link cannot touch the next match.
// 5. REMATCH follows flow.rematchState(): NAME WANTS A REMATCH, WAITING FOR NAME after my tap (one call), RIVAL LEFT /
//    YOU LOST YOUR SEAT greyed out; the flow's 'change' listener is gone when the screen closes; the next match the
//    flow starts runs clean (card, bar, no old result).
// 6. LEAVE and Esc on the result call flow.leave and drop the link.
// 7. No pause in a match: the pause button, Esc and P ask LEAVE MATCH?; STAY keeps playing (the game never stopped),
//    LEAVE reports 'quit', leaves the link and calls flow.leave; a match that ends under the dialog closes it.
// 8. Four players: YOU CAME 2ND OF 4, four rows in finishing order.
const g = window.__game, d = g.debug;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const k = await (await import('/tests/u2/lib/on3kit.js')).on3(g);
const { versus, flow, ui } = k;
const W = await import('/src/online/ui/vswords.js');
const log = [];
for (const e of ['versus:end', 'versus:revised']) g.events.on(e, (p) => log.push([e, p.result]));
const rival = (o = {}) => ({ slot: 1, name: 'Mika', ...o });
const P = (rows) => rows.map(([slot, T, dd, by]) => ({ slot, T, d: dd, by }));
const panel = () => k.q('.screen-vsresult .panel');
const ribbon = () => k.text('.screen-vsresult .ribbon');
const head = () => k.text('.screen-vsresult .vsr-why b');
const why = () => k.text('.screen-vsresult .vsr-why span');
const rows = () => k.qa('.screen-vsresult .vsr-places li:not(.vsr-h)').map((li) => ({ me: li.classList.contains('me'), slot: Number(li.dataset.slot), text: li.textContent.replace(/\s+/g, ' ').trim(), pl: li.querySelector('.vsr-pl').textContent }));
const note = () => k.text('.screen-vsresult .vsr-rm');
const btn = (act) => k.q(`.screen-vsresult [data-act="${act}"]`);
const acts = () => k.qa('.screen-vsresult [data-act]').map((b) => b.dataset.act).sort().join(',');
const onResult = () => g.state === 'result' && ui.current === 'vsresult' && k.shown('.screen-vsresult') && !ui.screens.result.el.isConnected;
const toResult = () => k.frames(10, () => g.state === 'result');
const key = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const play = (o = {}, secs = 6) => { const link = k.start({ referee: false, rivals: [rival()], ...o }); k.frames(secs); return link; };
const save0 = JSON.stringify(g.save.data);

try {
  // ---- the words (pure) ----
  for (const [res, reason] of [['win', 'standing'], ['win', 'distance'], ['win', 'dc'], ['win', 'quit'], ['win', 'cap'], ['lose', 'fell'], ['lose', 'distance'], ['lose', 'dc'], ['lose', 'offline'], ['lose', 'quit'], ['lose', 'cap'], ['lose', 'noverdict'], ['draw', 'draw'], ['lose', 'something-new'], ['win', null]]) {
    const w = W.verdictWords({ result: res, reason, place: res === 'lose' ? 2 : 1 }, { players: 2 });
    ok(w.title && w.head && w.text && w.text.length > 12 && w.tone === res && !/undefined|null/.test(w.head + w.text), `no words for ${res}/${reason}: ${JSON.stringify(w)}`);
  }
  ok(W.verdictWords({ result: 'lose', reason: 'dc' }).head === 'CONNECTION LOST' && W.verdictWords({ result: 'lose', reason: 'offline', provisional: true }).head === 'CONNECTION LOST', 'a loss by connection must read CONNECTION LOST');
  ok(W.clock(0) === '0:00' && W.clock(185.9) === '3:05' && W.clockTenths(125.34) === '2:05.3' && W.metres(1340.4) === '1,340m', 'time / distance formats');

  // ---- 1. win ----
  let link = k.start({ rivals: [rival({ fallAt: 5 })] });
  k.frames(8, () => !!versus.result);
  ok(versus.result && versus.result.result === 'win' && g.state === 'playing', 'win setup: ' + JSON.stringify(versus.result));
  ok(k.shown('.vs-moment') && k.text('.vs-moment') === 'YOU WIN!' && k.q('.vs-moment').classList.contains('win'), `no YOU WIN! moment over the run: "${k.text('.vs-moment')}"`);
  toResult();
  ok(onResult(), `after a win: state ${g.state}, screen ${ui.current}, single-player result attached ${ui.screens.result.el.isConnected}`);
  ok(!k.shown('.vs-moment') && !k.shown('.vs-card') && !k.shown('.vs-chips'), 'match overlays left on the result screen');
  ok(ribbon() === 'YOU WIN!' && head() === 'LAST SQUAD STANDING' && /rival's squad was wiped out/.test(why()) && panel().classList.contains('win') && panel().classList.contains('pop'), `win screen: ${ribbon()} / ${head()} / ${why()}`);
  let rs = rows();
  ok(rs.length === 2 && rs[0].me && rs[0].pl === '1' && rs[0].text.includes('YOU') && rs[0].text.includes(W.clockTenths(versus.result.t)) && rs[0].text.includes(W.metres(versus.result.d)), 'my row: ' + JSON.stringify(rs));
  ok(rs[1] && !rs[1].me && rs[1].pl === '2' && rs[1].text.includes('MIKA') && rs[1].text.includes('0:05.0') && /\d+m$/.test(rs[1].text), 'rival row: ' + JSON.stringify(rs[1]));
  ok(acts() === 'leave,rematch', 'buttons on the result: ' + acts());
  ok(!k.q('.screen-vsresult .res-coins') && !k.q('.screen-vsresult .coin-ico') && !/COIN|TROPH|SHARE/i.test(panel().textContent), 'coins / trophies / share on the stage 1 result');
  ok(btn('rematch') && !btn('rematch').classList.contains('is-disabled') && note() === '', `fresh REMATCH button: "${note()}"`);
  ok(JSON.stringify(g.save.data) === save0, 'a won match changed the save');
  info.win = { ribbon: ribbon(), head: head(), rows: rs };

  // ---- 5a. rematch states ----
  flow.rs = { ...flow.rs, others: [{ slot: 1, name: 'Mika', here: true, wants: true }] }; flow.emit('change');
  ok(note() === 'MIKA WANTS A REMATCH' && k.q('.vsr-rm').classList.contains('hot') && !btn('rematch').classList.contains('is-disabled'), `rival wants a rematch: "${note()}"`);
  flow.rs = { ...flow.rs, others: [{ slot: 1, name: 'Mika', here: true, wants: false }] }; flow.emit('change');
  ok(note() === '', 'the note did not clear');
  btn('rematch').click();
  ok(flow.calls.rematch === 1 && note() === 'WAITING FOR MIKA' && btn('rematch').classList.contains('is-disabled') && btn('rematch').classList.contains('is-waiting'), `after my tap: calls ${flow.calls.rematch}, "${note()}"`);
  btn('rematch').click();
  ok(flow.calls.rematch === 1, 'a second tap asked for a rematch again');
  flow.rs = { can: false, mine: true, others: [{ slot: 1, name: 'Mika', here: false, wants: false }], waitingFor: null, lost: false, hostLeft: false }; flow.emit('change');
  ok(note() === 'RIVAL LEFT' && btn('rematch').classList.contains('is-disabled') && btn('rematch').classList.contains('btn-grey'), `rival left: "${note()}"`);
  btn('rematch').click();
  ok(flow.calls.rematch === 1, 'REMATCH worked with nobody left');
  // the rival's connection dropped (not a real leave): the note says so; offline is not gone for good
  flow.rs = { ...flow.rs, others: [{ slot: 1, name: 'Mika', here: false, wants: false, offline: true }] }; flow.emit('change');
  ok(note() === 'RIVAL IS OFFLINE' && btn('rematch').classList.contains('is-disabled'), `rival offline: "${note()}"`);
  flow.rs = { can: false, mine: false, others: [], waitingFor: null, lost: true, hostLeft: false }; flow.emit('change');
  ok(note() === 'YOU LOST YOUR SEAT' && btn('rematch').classList.contains('is-disabled'), `lost seat: "${note()}"`);
  ok(flow.listeners.change.length === 1, `${flow.listeners.change.length} flow listeners while the result is up (want 1)`);

  // ---- 6. LEAVE ----
  const leaves = flow.calls.leave.length;
  btn('leave').click();
  ok(flow.calls.leave.length === leaves + 1 && g.state === 'title' && link.test.left && !versus.link && !versus.live, `LEAVE: calls ${flow.calls.leave.length - leaves}, state ${g.state}, link left ${link.test.left}`);
  ok(flow.listeners.change.length === 0, 'the flow listener outlived the result screen');
  ok(link.test.falls.length === 0, 'leaving the result of a won match reported a fall');
  await k.wait(300);
  ok(!ui.screens.vsresult.el.isConnected, 'the result screen is still attached after LEAVE');

  // ---- 2. lose ----
  link = play();
  const tFall = versus.t;
  link.test.setClock(tFall); // the rival's clock stands still: no verdict yet
  k.wipe();
  k.frames(1);
  ok(!k.shown('.vs-chip.c-wait'), 'WAITING FOR THE RESULT shows at once');
  k.frames(1.5);
  ok(g.state === 'playing' && k.shown('.vs-chip.c-wait') && k.text('.vs-chip.c-wait').startsWith('WAITING FOR THE RESULT'), 'no WAITING FOR THE RESULT chip while the verdict is out');
  link.test.verdict({ result: 'lose', place: 2, places: P([[1, null, null, null], [0, tFall, Math.round(versus.myD), 'dead']]), reason: 'fell' });
  k.frames(0.2); // (the bar reads the match 8 times a second)
  ok(!k.shown('.vs-chip.c-wait') && k.text('.vs-moment') === 'YOU LOSE', `after the verdict: chip ${k.shown('.vs-chip.c-wait')}, moment "${k.text('.vs-moment')}"`);
  toResult();
  rs = rows();
  ok(onResult() && ribbon() === 'YOU LOSE' && head() === 'SQUAD DOWN' && /wiped out first/.test(why()) && panel().classList.contains('lose'), `lose screen: ${ribbon()} / ${head()} / ${why()}`);
  ok(rs.length === 2 && !rs[0].me && rs[0].text.includes('MIKA') && rs[0].text.includes('STILL STANDING') && rs[1].me && rs[1].text.includes(W.clockTenths(tFall)), 'lose rows: ' + JSON.stringify(rs));
  key('Escape'); // Esc on the result = LEAVE
  ok(g.state === 'title' && flow.calls.leave.length === leaves + 2 && link.test.left, 'Esc on the result did not leave');

  // ---- 3. draw, distance, dc win, connection lost ----
  link = play();
  k.wipe();
  link.test.rivalFall(1, { T: versus.t, d: versus.myD });
  link.test.verdict({ result: 'draw', place: 1, places: P([[0, versus.t, versus.myD, 'dead'], [1, versus.t, versus.myD, 'dead']]), reason: 'draw' });
  k.frame();
  ok(k.text('.vs-moment') === 'DRAW!', 'draw moment: ' + k.text('.vs-moment'));
  toResult();
  rs = rows();
  ok(onResult() && ribbon() === 'DRAW' && head() === 'DEAD EVEN' && panel().classList.contains('draw') && rs.length === 2 && rs[0].pl === '=' && rs[1].pl === '=', `draw screen: ${ribbon()} / ${head()} / ${JSON.stringify(rs)}`);
  k.end();

  link = play();
  k.wipe();
  link.test.rivalFall(1, { T: versus.t + 0.6, d: 20 });
  link.test.verdict({ result: 'win', place: 1, places: P([[0, versus.t, versus.myD, 'dead'], [1, versus.t + 0.6, 20, 'dead']]), reason: 'distance' });
  toResult();
  rs = rows();
  ok(onResult() && ribbon() === 'YOU WIN!' && head() === 'YOU WENT FURTHER' && /same second/.test(why()) && rs[0].me && rs[1].text.includes('20m'), `distance win: ${ribbon()} / ${head()} / ${JSON.stringify(rs)}`);
  k.end();

  link = play();
  link.test.silence(1, 13, 0);
  link.test.rivalFall(1, { T: 3.2, d: 31, by: 'dc' });
  link.test.verdict({ result: 'win', place: 1, places: P([[0, null, null, null], [1, 3.2, 31, 'dc']]), reason: 'dc' });
  toResult();
  rs = rows();
  ok(onResult() && ribbon() === 'YOU WIN!' && head() === 'RIVAL LOST CONNECTION' && /internet dropped/.test(why()) && rs[1].text.includes('OFFLINE') && rs[1].text.includes('0:03.2'), `dc win: ${ribbon()} / ${head()} / ${JSON.stringify(rs)}`);
  k.end();

  link = play();
  link.test.verdict({ result: 'lose', place: 2, places: P([[1, null, null, null], [0, 5.9, 60, 'dc']]), reason: 'dc' }); // forfeited while standing
  toResult();
  ok(onResult() && ribbon() === 'YOU LOSE' && head() === 'CONNECTION LOST' && /internet dropped/.test(why()) && versus.result.reason === 'dc', `my connection lost: ${ribbon()} / ${head()} / ${why()}`);
  info.dc = { head: head(), why: why(), rows: rows() };
  k.end();

  // ---- 4. provisional, then revised ----
  log.length = 0;
  link = play();
  k.wipe();
  const myT = versus.t, myD = versus.myD;
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'offline', provisional: true });
  toResult();
  ok(onResult() && ribbon() === 'YOU LOSE' && head() === 'CONNECTION LOST' && /Checking the result/.test(why()) && versus.result.provisional === true, `provisional: ${ribbon()} / ${head()} / ${why()}`);
  ok(rows().length === 2 && rows().some((r) => r.me) && !k.q('.vsr-upd'), 'provisional rows: ' + JSON.stringify(rows()));
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'fell' }); // not marked revised: not a second result
  ok(versus.result.reason === 'offline' && log.length === 1, 'an unmarked second verdict replaced the result');
  link.test.verdict({ result: 'win', place: 1, places: P([[0, myT, myD, 'dead'], [1, myT - 2, 30, 'dc']]), reason: 'dc', provisional: false, revised: true });
  ok(versus.result.result === 'win' && versus.result.revised === true && versus.result.provisional === false && versus.result.t === Math.round(myT * 10) / 10 && versus.result.d === myD, 'revised result: ' + JSON.stringify(versus.result));
  ok(log.map((l) => l.join(':')).join(' ') === 'versus:end:lose versus:revised:win', 'events: ' + JSON.stringify(log));
  rs = rows();
  ok(onResult() && ribbon() === 'YOU WIN!' && head() === 'RIVAL LOST CONNECTION' && k.text('.vsr-upd') === 'RESULT UPDATED' && rs[0].me && rs[1].text.includes('OFFLINE'), `the screen did not follow the revised verdict: ${ribbon()} / ${head()} / ${JSON.stringify(rs)}`);
  ok(g.lastResult && g.lastResult.win === true && versus.view().peers[0].place === 2, 'lastResult / places after the revision');
  ok(acts() === 'leave,rematch' && k.qa('.screen-vsresult .panel').length === 1, 'the redrawn result lost its buttons or doubled');
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'fell', revised: true }); // one revision only
  ok(versus.result.result === 'win' && log.length === 2, 'a second revision was applied');
  const old = link;
  // the next match must not hear the old link
  link = play({}, 2);
  old.test.verdict({ result: 'win', place: 1, places: [], reason: 'dc', revised: true });
  ok(!versus.result && versus.live && g.state === 'playing', 'the last match touched the next one: ' + JSON.stringify(versus.result));
  // ... revised before the result screen is up
  k.wipe();
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'offline', provisional: true });
  k.frame();
  ok(k.text('.vs-moment') === 'YOU LOSE', 'provisional moment: ' + k.text('.vs-moment'));
  link.test.verdict({ result: 'win', place: 1, places: [], reason: 'quit', revised: true });
  k.frame();
  ok(g.state === 'playing' && k.text('.vs-moment') === 'YOU WIN!', `revised before the screen: moment "${k.text('.vs-moment')}"`);
  toResult();
  ok(onResult() && ribbon() === 'YOU WIN!' && head() === 'RIVAL LEFT' && k.text('.vsr-upd') === 'RESULT UPDATED', `revised before the screen: ${ribbon()} / ${head()}`);
  // a final verdict cannot be revised
  k.end();
  link = play({}, 2);
  k.wipe();
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'fell' });
  link.test.verdict({ result: 'win', place: 1, places: [], reason: 'dc', revised: true });
  ok(versus.result.result === 'lose', 'a final verdict was revised');
  toResult();
  // after leaving, a late verdict is nothing
  ui.matchUi.leave();
  let threw = null;
  try { versus.onVerdict({ result: 'win', place: 1, places: [], reason: 'dc', revised: true }); } catch (e) { threw = e.message; }
  ok(!threw && g.state === 'title' && versus.result.result === 'lose', 'a verdict after leaving: ' + threw);

  // ---- 5b. the rematch the flow starts ----
  link = k.start({ rivals: [rival({ fallAt: 3 })] });
  k.frames(12, () => g.state === 'result');
  ok(onResult() && ribbon() === 'YOU WIN!', 'rematch setup: no result');
  btn('rematch').click();
  const starts = flow.calls.start;
  let c = -3;
  flow.rs = { can: true, mine: false, others: [{ slot: 1, name: 'Mika', here: true, wants: false }], waitingFor: null, lost: false, hostLeft: false };
  const link2 = flow.startMatch({ seed: 99, clock: () => c, rivals: [rival()] }); // what the flow does on the room's next 'start'
  k.frame();
  ok(flow.calls.start === starts + 1 && g.state === 'playing' && ui.current === null && versus.live && !versus.result && versus.seed === 99, `rematch: state ${g.state}, screen ${ui.current}, result ${JSON.stringify(versus.result)}`);
  ok(k.shown('.vs-card') && k.qa('.vs-card .vc-p').length === 2 && k.text('.vs-clock') === '0:00' && !k.shown('.vs-moment'), 'rematch: card / bar are not fresh');
  await k.wait(300);
  ok(!ui.screens.vsresult.el.isConnected && flow.listeners.change.length === 0, 'the result screen stayed over the rematch');
  for (let i = 0; i < 240; i++) { c += 1 / 60; k.frame(); }
  ok(versus.t > 0.9 && g.run.dist > 5, 'the rematch does not run');
  link2.test.rivalFall(1, {});
  for (let i = 0; i < 600 && g.state !== 'result'; i++) { c += 1 / 60; k.frame(); }
  ok(onResult() && ribbon() === 'YOU WIN!' && note() === '' && !k.q('.vsr-upd') && !btn('rematch').classList.contains('is-disabled'), `second result: ${ribbon()} "${note()}"`);
  k.end();

  // ---- 7. leave match instead of pause ----
  link = play({}, 3);
  const t1 = versus.t, lv7 = flow.calls.leave.length;
  g.pause();
  ok(g.state === 'playing', 'a match was paused');
  k.q('.hud-pause').click();
  ok(ui.top() === 'confirm' && k.text('.screen-confirm .confirm-title') === 'LEAVE MATCH?' && k.text('.screen-confirm .confirm-text') === 'You will lose this match.', `pause button in a match: top ${ui.top()}, "${k.text('.screen-confirm .confirm-title')}"`);
  ok(g.state === 'playing' && ui.modals.indexOf('pause') < 0, 'the pause menu opened in a match');
  k.frames(1);
  ok(versus.t > t1 + 0.9 && versus.live, 'the match stood still under the LEAVE MATCH? dialog');
  k.q('.screen-confirm [data-act="no"]').click();
  ok(ui.top() !== 'confirm' && versus.live && g.state === 'playing' && link.test.falls.length === 0 && flow.calls.leave.length === lv7, 'STAY did not keep the match');
  key('Escape');
  ok(ui.top() === 'confirm', 'Esc does not ask LEAVE MATCH?');
  key('Escape');
  ok(ui.top() !== 'confirm' && versus.live, 'Esc does not close the dialog');
  key('p');
  ok(ui.top() === 'confirm' && g.state === 'playing', 'P does not ask LEAVE MATCH?');
  const before = flow.calls.leave.length;
  k.q('.screen-confirm [data-act="yes"]').click();
  ok(!versus.live && link.test.falls.length === 1 && link.test.falls[0].by === 'quit' && link.test.falls[0].t > 3.9 && link.test.left && flow.calls.leave.length === before + 1 && g.state === 'title', `LEAVE: falls ${JSON.stringify(link.test.falls)}, flow ${flow.calls.leave.length - before}, state ${g.state}`);
  ok(!ui.hud.el.classList.contains('vs') && ui.modals.length === 0, 'HUD / dialogs after leaving a match');
  key('Escape'); key('p');
  ok(g.state === 'title' && ui.top() !== 'confirm', 'the leave keys act outside a match');
  // a match that ends under the dialog
  link = play({}, 3);
  ui.matchUi.askLeave();
  link.test.rivalFall(1, {});
  link.test.verdict({ result: 'win', place: 1, places: P([[0, null, null, null], [1, 2.9, 25, 'dead']]), reason: 'standing' });
  toResult();
  ok(onResult() && ui.modals.length === 0, `the dialog stayed over the result: ${JSON.stringify(ui.modals)}`);
  k.end();

  // ---- 8. four players ----
  link = play({ rivals: [rival(), rival({ slot: 2, name: 'Raider-4821' }), rival({ slot: 3, name: 'Zoe' })] });
  k.wipe();
  const t4 = versus.t;
  link.test.rivalFall(2, { T: 2.2, d: 20, by: 'quit' });
  link.test.rivalFall(3, { T: 4.5, d: 44 });
  link.test.verdict({ result: 'lose', place: 2, places: P([[1, null, null, null], [0, t4, versus.myD, 'dead'], [3, 4.5, 44, 'dead'], [2, 2.2, 20, 'quit']]), reason: 'fell' });
  toResult();
  rs = rows();
  ok(onResult() && ribbon() === 'YOU LOSE' && head() === 'YOU CAME 2ND OF 4', `four players: ${ribbon()} / ${head()}`);
  ok(rs.length === 4 && rs.map((r) => r.slot).join('') === '1032' && rs.map((r) => r.pl).join('') === '1234' && rs[1].me && rs[0].text.includes('STILL STANDING') && rs[3].text.includes('LEFT') && rs[2].text.includes('ZOE'), 'four rows: ' + JSON.stringify(rs));
  const pb = panel().getBoundingClientRect(), appB = document.getElementById('app').getBoundingClientRect();
  await k.wait(600);
  const pb2 = panel().getBoundingClientRect();
  ok(pb2.top >= 0 && pb2.bottom <= appB.bottom && pb2.left >= appB.left && pb2.right <= appB.right, `the four-player result leaves the frame: ${Math.round(pb2.top)}..${Math.round(pb2.bottom)} of ${Math.round(appB.height)}`);
  info.four = { head: head(), rows: rs, panel: [Math.round(pb2.top), Math.round(pb2.bottom)], was: Math.round(pb.top) };
  ok(JSON.stringify(g.save.data) === save0, 'the matches changed the save');
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 700));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
