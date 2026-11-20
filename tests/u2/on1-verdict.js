// @smoke --seconds 0 --shots 0
// Online stage 1: how a versus match ends (the LINK seam, with the scripted link of src/online/game/testlink.js).
// 1. WIN: the rival falls, I outlive the 1 s tie window -> 'out' -> versus:peerdown, slow motion, verdict win,
//    run:win { mode: 'versus' }, result screen, versus.result.result === 'win'; link.fall was never called.
// 2. LOSE: my squad is wiped -> link.fall once ({ t, d, by: 'dead' }) at that moment, the run waits for the verdict
//    (no result screen while it is missing), verdict lose -> result screen, versus.result.
// 3. TIE inside 1 s: further distance wins (the rival falls 0.5 s after me but went less far -> I win although I fell).
// 4. DRAW: a verdict 'draw' ends the run and is kept in versus.result.
// 5. Forfeited while standing (verdict lose, reason 'dc'): the run ends, no fall is reported by me.
// 6. No verdict ever (network gone): the run still ends as a loss after VS.end.verdictWait.
// 7. stop() while alive reports my fall as 'quit', leaves the link and goes back to the title; HOME (toTitle) does too.
// 8. Samples: 10 a second with the fields of the contract; none after my fall. link.tick is called every step.
// 9. Four players: three rivals, places from the verdict land in view().peers.
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { installOnline } = await import('/src/online/index.js');
const { createTestLink } = await import('/src/online/game/testlink.js');
const { VS } = await import('/src/online/game/vsdata.js');
const { versus } = await installOnline(g, g.ui);
const log = [];
for (const k of ['versus:start', 'versus:go', 'versus:peerdown', 'versus:end', 'run:win', 'run:lose', 'fx:slowmo']) g.events.on(k, (p) => log.push([k, p]));
const names = () => log.map((l) => l[0]).join(' ');
const start = (opts = {}) => {
  log.length = 0;
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('pro', 1);
  const link = createTestLink({ game: g, seed: 7, ...opts });
  versus.start(link, { hero: 'pip', weapon: 'thunderclap' });
  return link;
};
const pump = (seconds, until) => { for (let i = 0; i < seconds * 60 && g.state === 'playing' && !(until && until()); i++) versus.pump(1 / 60, 1 / 60); };
const wipe = () => g.squad.setCount(0, 'horde');

try {
  // ---- 1. win ----
  let link = start({ rivals: [{ slot: 1, name: 'Mika', fallAt: 10 }] });
  ok(versus.live && g.run.mode === 'versus' && g.run.def.versus === true && g.state === 'playing', 'match did not start');
  ok(log[0] && log[0][0] === 'versus:start' && log[0][1].seed === 7 && log[0][1].peers.length === 1, 'versus:start missing: ' + names());
  pump(10.05);
  ok(g.run.active && !versus.result, 'ended before the rival fell');
  pump(0.4, () => versus.v.peers[0].alive === false);
  const down = log.find((l) => l[0] === 'versus:peerdown');
  ok(down && down[1].slot === 1 && down[1].name === 'Mika', 'versus:peerdown missing: ' + names());
  ok(log.some((l) => l[0] === 'fx:slowmo' && l[1].scale === VS.end.rivalSlow.scale), 'no slow motion when the last rival fell');
  ok(g.run.active && !versus.result, 'won before the tie window was over');
  pump(1.5, () => !!versus.result);
  ok(versus.result && versus.result.result === 'win' && versus.result.place === 1 && versus.result.seed === 7, 'win result: ' + JSON.stringify(versus.result));
  ok(versus.t > 11 && versus.t < 11.6, `win decided at ${versus.t} (rival fell at 10 s: 1 s window + the delivery lag)`);
  const win = log.find((l) => l[0] === 'run:win');
  ok(win && win[1].mode === 'versus' && g.run.phase === 'won', 'run:win { mode: versus } missing: ' + names());
  ok(versus.live && g.state === 'playing', 'the result screen came at once');
  pump(4);
  ok(g.state === 'result' && !versus.live, `after the win: state ${g.state}, live ${versus.live}`);
  ok(link.test.falls.length === 0, 'the winner reported a fall');
  ok(g.lastResult && g.lastResult.win === true && g.lastResult.mode === 'versus', 'lastResult ' + JSON.stringify(g.lastResult));
  info.win = { result: versus.result, t: versus.t };
  d.toTitle();

  // ---- 2. lose + 8. samples ----
  link = start({ rivals: [{ slot: 1, name: 'Mika' }] });
  pump(12);
  const sent = link.test.pushed, s = link.test.sent[link.test.sent.length - 1];
  ok(sent >= 118 && sent <= 121, `${sent} samples in 12 s (want 10 a second)`);
  ok(s && ['t', 'dist', 'n', 'form', 'flags', 'boss', 'zone', 'charge', 'danger', 'x'].every((k) => typeof s[k] === 'number'), 'sample fields: ' + JSON.stringify(s));
  ok(s && Math.abs(s.t - versus.t) < 0.11 && Math.abs(s.dist - g.run.dist) < 2 && s.n === g.squad.count && s.zone === 1, 'sample values: ' + JSON.stringify(s));
  ok(link.test.ticks >= 12 * 60, `link.tick called ${link.test.ticks} times in 720 frames`);
  const peer = versus.view().peers[0];
  ok(peer.n > 0 && peer.dist > 80 && peer.alive === true, 'view().peers not fed: ' + JSON.stringify(peer));
  ok(versus.view().me.n === g.squad.count && Math.abs(versus.view().t - 12) < 0.1, 'view() me / t wrong');
  const tFall = versus.t, dFall = Math.round(g.run.dist);
  link.test.setClock(tFall); // the rival's clock stops with mine: no verdict can come yet
  wipe();
  ok(link.test.falls.length === 1 && link.test.falls[0].by === 'dead' && Math.abs(link.test.falls[0].t - tFall) < 1e-9 && link.test.falls[0].d === dFall, 'fall report: ' + JSON.stringify(link.test.falls));
  ok(log.some((l) => l[0] === 'run:lose' && l[1].mode === 'versus'), 'run:lose { mode: versus } missing');
  ok(log.some((l) => l[0] === 'fx:slowmo' && l[1].scale === VS.end.loseSlow.scale), 'no slow motion at my fall');
  pump(4);
  ok(g.state === 'playing' && versus.live && !versus.result, 'the result screen did not wait for the verdict');
  ok(link.test.pushed === sent, 'samples were sent after my fall');
  link.test.setClock(null); // the rival plays on, passes my time by the tie window -> the referee says lose
  pump(3, () => !!versus.result);
  ok(versus.result && versus.result.result === 'lose' && versus.result.place === 2 && Math.abs(versus.result.t - tFall) < 0.06 && versus.result.d === dFall, 'lose result: ' + JSON.stringify(versus.result));
  pump(4);
  ok(g.state === 'result' && !versus.live && link.test.falls.length === 1, `after the loss: state ${g.state}, falls ${link.test.falls.length}`);
  info.lose = versus.result;
  d.toTitle();

  // ---- 3. tie inside 1 s: distance decides ----
  link = start({ rivals: [{ slot: 1, name: 'Mika', fallAt: 8.5, curve: (t) => ({ dist: 3 * t, n: 20, x: 0, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 }) }] });
  pump(8);
  wipe();
  pump(3, () => !!versus.result);
  ok(versus.result && versus.result.result === 'win' && versus.result.place === 1, 'tie by distance: ' + JSON.stringify(versus.result));
  ok(g.run.phase === 'lost' && !log.some((l) => l[0] === 'run:win'), 'a fallen winner must not restart the run as won');
  pump(4);
  ok(g.state === 'result', 'tie: no result screen');
  d.toTitle();
  // ... and the other way round: the rival fell first by 0.5 s but went further
  link = start({ rivals: [{ slot: 1, name: 'Mika', fallAt: 7.5, curve: (t) => ({ dist: 40 * t, n: 20, x: 0, form: 0, boss: 0, zone: 1, flags: 0, danger: 0 }) }] });
  pump(8);
  wipe();
  pump(3, () => !!versus.result);
  ok(versus.result && versus.result.result === 'lose' && versus.result.place === 2, 'tie lost by distance: ' + JSON.stringify(versus.result));
  d.toTitle();

  // ---- 4. draw ----
  link = start({ referee: false, rivals: [{ slot: 1, name: 'Mika' }] });
  pump(5);
  wipe();
  link.test.rivalFall(1, { T: versus.t, d: Math.round(g.run.dist) });
  link.test.verdict({ result: 'draw', place: 1, places: [{ slot: 0, T: versus.t, d: 46, by: 'dead' }, { slot: 1, T: versus.t, d: 46, by: 'dead' }], reason: null });
  ok(versus.result && versus.result.result === 'draw', 'draw result: ' + JSON.stringify(versus.result));
  ok(log.some((l) => l[0] === 'versus:end' && l[1].result === 'draw'), 'versus:end { draw } missing');
  pump(4);
  ok(g.state === 'result' && !versus.live, 'draw: no result screen');
  d.toTitle();

  // ---- 5. forfeited while standing ----
  link = start({ referee: false, rivals: [{ slot: 1, name: 'Mika' }] });
  pump(5);
  link.test.verdict({ result: 'lose', place: 2, places: [], reason: 'dc' });
  ok(versus.result && versus.result.result === 'lose' && versus.result.reason === 'dc' && !g.run.active, 'forfeit: ' + JSON.stringify(versus.result));
  ok(link.test.falls.length === 0, 'a forfeited player reported its own fall');
  pump(4);
  ok(g.state === 'result', 'forfeit: no result screen');
  d.toTitle();

  // ---- 6. no verdict ever ----
  link = start({ referee: false, rivals: [{ slot: 1, name: 'Mika' }] });
  pump(3);
  wipe();
  pump(VS.end.verdictWait - 1);
  ok(g.state === 'playing' && !versus.result, 'gave up on the verdict too early');
  pump(4);
  ok(g.state === 'result' && versus.result && versus.result.result === 'lose' && versus.result.reason === 'noverdict', 'no verdict: ' + JSON.stringify(versus.result) + ' ' + g.state);
  d.toTitle();

  // ---- 7. stop / HOME ----
  link = start({ rivals: [{ slot: 1, name: 'Mika' }] });
  pump(4);
  versus.stop();
  ok(link.test.falls.length === 1 && link.test.falls[0].by === 'quit' && link.test.falls[0].t > 3.9, 'stop(): ' + JSON.stringify(link.test.falls));
  ok(link.test.left && !versus.live && g.state === 'title' && !versus.ghost.mesh.visible, `stop(): left ${link.test.left}, live ${versus.live}, state ${g.state}`);
  versus.stop(); // idempotent
  link = start({ rivals: [{ slot: 1, name: 'Mika' }] });
  pump(4);
  g.quitToMenu();
  ok(link.test.falls.length === 1 && link.test.falls[0].by === 'quit' && link.test.left && !versus.live, 'HOME in a match: ' + JSON.stringify(link.test.falls));

  // ---- 9. four players ----
  link = start({ rivals: [{ slot: 1, name: 'A', fallAt: 4 }, { slot: 2, name: 'B', fallAt: 6 }, { slot: 3, name: 'C', fallAt: 9 }] });
  pump(5);
  let ps = versus.view().peers;
  ok(ps.length === 3 && !ps[0].alive && ps[0].place === 4 && ps[1].alive && g.run.active && !versus.result, '4 players at 5 s: ' + JSON.stringify(ps.map((p) => [p.name, p.alive, p.place])));
  pump(8, () => !!versus.result);
  ps = versus.view().peers;
  ok(versus.result && versus.result.result === 'win' && versus.result.places.length === 4 && versus.result.places.map((p) => p.slot).join('') === '0321', '4 players result: ' + JSON.stringify(versus.result));
  ok(ps[0].place === 4 && ps[1].place === 3 && ps[2].place === 2, '4 players places: ' + JSON.stringify(ps.map((p) => p.place)));
  ok(log.filter((l) => l[0] === 'versus:peerdown').length === 3 && log.filter((l) => l[0] === 'fx:slowmo' && l[1].scale === VS.end.rivalSlow.scale).length === 1, 'peerdown x3, one slow motion (the last rival)');
  info.four = versus.result;
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (versus.live) versus.stop();
  d.setAutopilot(false);
  d.toTitle();
}
return { pass: fails.length === 0, fails, info };
