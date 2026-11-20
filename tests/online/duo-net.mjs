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
      await duo.play(30, async () => (await A.view()).t >= 20 && (await B.view()).t >= 20);
      const [a1, b1] = [await A.view(), await B.view()];
      ok(a1.live && b1.live && !a1.chipDc && !b1.chipDc, `no false "lost connection" chip on a slow link: ${a1.chipDc} / ${b1.chipDc}`);
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
