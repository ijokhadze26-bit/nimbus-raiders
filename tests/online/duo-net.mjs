// Two real pages on a bad network (SPEC4 §12 stage 1, §5.7): a rival whose internet drops (a short blip, then for
// good), what the dropped player sees on return, and a whole match at phone size with 400 ms delay, jitter and loss.
// Run with `node scripts/duo.mjs net`.

const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
const shown = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;
const rows = (p) => p.ev(() => [...document.querySelectorAll('.vsr-places li:not(.vsr-h)')].map((li) => [li.dataset.slot, li.querySelector('.vsr-tm') ? li.querySelector('.vsr-tm').textContent : 'standing', li.querySelector('.vsr-ds') ? li.querySelector('.vsr-ds').textContent : '']));

export const scenarios = [
  {
    name: 'rival goes offline: a blip clears the chip, a long drop counts down to a WIN; CONNECTION LOST on return',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(12, async () => (await A.view()).t >= 5);
      // --- a short blip: the chip comes after 3 s of silence and goes when the rival is back ---
      await B.offline(true);
      const chip = await duo.play(6, async () => (await A.view()).chipDc, 1);
      ok(/RIVAL LOST CONNECTION · WIN IN \d+/.test(chip || ''), `A's chip during the blip: "${chip}"`);
      const b0 = await B.view();
      ok(b0.chipNet && b0.live && b0.state === 'playing', 'B reads RECONNECTING and keeps playing');
      await A.shot('chip'); await B.shot('reconnecting');
      await B.offline(false);
      await duo.play(3, async () => { const [a, b] = [await A.view(), await B.view()]; return !a.chipDc && !b.chipNet; }, 1);
      const [a1, b1] = [await A.view(), await B.view()];
      ok(!a1.chipDc && !b1.chipNet && a1.live && b1.live && a1.peers[0].alive, `the blip is over and the match goes on: ${JSON.stringify([a1.chipDc, b1.chipNet, a1.live, b1.live])}`);
      await duo.play(2);
      ok(Math.abs((await A.view()).peers[0].dist - (await B.view()).dist) < 30, 'A sees B moving again');
      // --- B drops for good: countdown 10..0 on A, then A wins ---
      await B.offline(true);
      const seen = [];
      const won = await duo.play(20, async () => {
        const v = await A.view();
        const m = /WIN IN (\d+)/.exec(v.chipDc || '');
        if (m && seen[seen.length - 1] !== Number(m[1])) seen.push(Number(m[1]));
        return v.result ? v : null;
      }, 1);
      note(`countdown seen on A: ${seen.join(' ')}`);
      ok(seen.length >= 8 && seen[0] === 10 && seen.every((n, i) => i === 0 || n === seen[i - 1] - 1), `the chip counts down from 10: ${seen.join(' ')}`);
      ok(won, 'A gets a verdict');
      const a2 = await duo.play(6, async () => { const v = await A.view(); return shown(v) ? v : null; }, 1);
      eq([a2.result.result, a2.result.reason, a2.ribbon, a2.why], ['win', 'dc', 'YOU WIN!', 'RIVAL LOST CONNECTION'], 'A\'s screen');
      await A.shot('dc-win');
      const b2 = await B.view();
      ok(b2.live && b2.state === 'playing' && !b2.result && b2.chipNet, `B, still offline, is still playing: ${JSON.stringify({ live: b2.live, state: b2.state, result: b2.result })}`);
      // --- B's internet returns: the match went to A meanwhile ---
      await B.offline(false);
      const b3 = await duo.play(12, async () => { const v = await B.view(); return shown(v) ? v : null; }, 1);
      ok(b3, `B gets its result on return: ${JSON.stringify(await B.view())}`);
      eq([b3.result.result, b3.result.reason, b3.ribbon, b3.why], ['lose', 'dc', 'YOU LOSE', 'CONNECTION LOST'], 'B\'s screen');
      await B.shot('connection-lost');
    },
  },
  {
    name: 'a fall while offline: both screens first guess, then show the result that counts (RESULT UPDATED)',
    async run(duo, { ok, eq, note }) {
      const A = await duo.page('A'), B = await duo.page('B');
      await duo.lobby(A, B);
      await bots(A, B);
      await duo.ready(A, B);
      await duo.go(A, B);
      await duo.play(12, async () => (await A.view()).t >= 5);
      // B's internet drops, then B's squad falls: nobody can know yet
      await B.offline(true);
      await duo.play(1);
      await B.ev(() => window.__game.squad.setCount(0, 'horde'));
      // A plays on for 2.5 s and falls too (well outside the 1 s tie window): A really outlasted B
      await duo.play(2.5);
      await A.ev(() => window.__game.squad.setCount(0, 'horde'));
      // both pages can only guess: B has no connection, A cannot see B's fall
      const guess = await duo.play(30, async () => { const vs = [await A.view(), await B.view()]; return shown(vs[0]) && shown(vs[1]) ? vs : null; });
      ok(guess, `both pages show a first result: A ${JSON.stringify((await A.view()).result)} B ${JSON.stringify((await B.view()).result)}`);
      const [a1, b1] = guess;
      note(`first: A ${JSON.stringify(a1.result)} "${a1.why}"; B ${JSON.stringify(b1.result)} "${b1.why}"`);
      eq([a1.result.result, a1.result.provisional, a1.ribbon], ['lose', true, 'YOU LOSE'], 'A\'s first screen (B is taken to be still running)');
      eq([b1.result.result, b1.result.reason, b1.result.provisional, b1.why], ['lose', 'offline', true, 'CONNECTION LOST'], 'B\'s first screen');
      ok(/Checking the result/.test(await A.text('.vsr .vsr-why')) && /will update/.test(await B.text('.vsr .vsr-why')), 'both say the result is still being checked');
      await A.shot('guess'); await B.shot('guess');
      // B is back: its fall record lands, and both screens are corrected
      await B.offline(false);
      const fixed = await duo.play(15, async () => { const vs = [await A.view(), await B.view()]; return vs[0].result.revised && vs[1].result.revised ? vs : null; }, 1);
      ok(fixed, `both pages get the corrected result: A ${JSON.stringify((await A.view()).result)} B ${JSON.stringify((await B.view()).result)}`);
      const [a2, b2] = [await A.view(), await B.view()];
      note(`then: A ${JSON.stringify(a2.result)} "${a2.why}"; B ${JSON.stringify(b2.result)} "${b2.why}"`);
      eq([a2.result.result, a2.result.reason, a2.result.provisional, a2.ribbon, a2.why], ['win', 'standing', false, 'YOU WIN!', 'LAST SQUAD STANDING'], 'A\'s corrected screen');
      eq([b2.result.result, b2.result.reason, b2.result.provisional, b2.ribbon, b2.why], ['lose', 'fell', false, 'YOU LOSE', 'SQUAD DOWN'], 'B\'s corrected screen');
      ok(/RESULT UPDATED/.test(await A.text('.vsr')) && /RESULT UPDATED/.test(await B.text('.vsr')), 'both screens say RESULT UPDATED');
      eq(await A.ev(() => window.__game.save.data.online.hist.map((h) => h.r).join('')), 'w', 'A\'s history holds the corrected result, once');
      eq(await B.ev(() => window.__game.save.data.online.hist.map((h) => h.r).join('')), 'l', 'B\'s history holds one loss');
      await A.shot('updated'); await B.shot('updated');
      // and a rematch still works from here
      await A.click('.vsr-rematch'); await B.click('.vsr-rematch');
      const [a3, b3] = await duo.go(A, B);
      ok(a3.seed === b3.seed && a3.seed !== a1.seed, `rematch after the correction: ${a3.seed}`);
    },
  },
  {
    name: 'phone size, 400 ms delay + jitter + loss on both: same result on both screens, the ghost never jumps',
    async run(duo, { ok, eq, note }) {
      const net = 'lat400,jit300,loss5';
      const A = await duo.page('A', { size: [390, 844], net }), B = await duo.page('B', { size: [390, 844], net });
      await duo.signIn(A, 'Ann'); await duo.signIn(B, 'Ben');
      const code = await duo.create(A);
      await duo.join(B, code);
      await bots(A, B);
      await duo.ready(A, B);
      const [a0, b0] = await duo.go(A, B);
      ok(a0.seed === b0.seed, `one road: ${a0.seed} / ${b0.seed}`);
      const chips = []; // (looked at twice a second, from the countdown on: a slow link is not a lost one)
      await duo.play(30, async () => {
        const [a, b] = [await A.view(), await B.view()];
        if (a.chipDc || b.chipDc) chips.push(`${a.clock}: ${a.chipDc} / ${b.chipDc}`);
        return a.t >= 20 && b.t >= 20;
      });
      const [a1, b1] = [await A.view(), await B.view()];
      ok(a1.live && b1.live && !chips.length, `no false "lost connection" chip on a slow link: ${chips.slice(0, 3).join('; ')}`);
      ok(Math.abs(a1.peers[0].dist - b1.dist) < 40 && Math.abs(b1.peers[0].dist - a1.dist) < 40, `rival distances follow: A sees ${a1.peers[0].dist} (B at ${b1.dist}), B sees ${b1.peers[0].dist} (A at ${a1.dist})`);
      await A.shot('slow-mid');
      const ghosts = [await A.ev(() => window.__duo.ghost), await B.ev(() => window.__duo.ghost)];
      for (const [i, g] of ghosts.entries()) {
        note(`page ${'AB'[i]}: ghost on screen ${g.shown} of ${g.steps} steps; biggest move in one 0.1 s step ${g.rel.toFixed(2)} u along the road, ${g.x.toFixed(2)} u sideways`);
        ok(g.steps > 150 && g.shown > g.steps * 0.6, `page ${'AB'[i]}: the ghost was on screen for most of the match (${g.shown} of ${g.steps} steps)`);
        ok(g.rel <= 2.6 && g.x <= 1.7, `page ${'AB'[i]}: the ghost jumped (${g.rel.toFixed(2)} u along the road, ${g.x.toFixed(2)} u sideways in one step)`);
      }
      await B.ev(() => window.__game.squad.setCount(0, 'horde'));
      const done = await duo.play(30, async () => { const vs = [await A.view(), await B.view()]; return shown(vs[0]) && shown(vs[1]) ? vs : null; });
      ok(done, `both result screens: A ${JSON.stringify(await A.view())}`);
      const [a2, b2] = done;
      eq([a2.result.result, a2.result.reason, a2.ribbon], ['win', 'standing', 'YOU WIN!'], 'A\'s screen');
      eq([b2.result.result, b2.result.reason, b2.ribbon], ['lose', 'fell', 'YOU LOSE'], 'B\'s screen');
      const [ta, tb] = [await rows(A), await rows(B)];
      eq(ta.find((r) => r[0] === '1'), tb.find((r) => r[0] === '1'), 'B\'s time and distance read the same on both screens');
      note(`B's fall on both screens: ${JSON.stringify(tb.find((r) => r[0] === '1'))}`);
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
];
