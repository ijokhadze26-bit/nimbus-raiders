// Three and four REAL pages in one friend room through the bridge (STAGE5 "INTEGRATOR" point 2): everyone READY ->
// one match on one road; falls in a set order -> the same places 1-4 on every result screen; the 4th and the 3rd
// WATCH the rest on their result screen (live cards, then the table); a tie for first; a LEAVE and a dropped line in
// the middle; a bad network on one page. Every page is on autopilot and kept alive until the scenario wipes it.
// Run with `node scripts/duo.mjs four`.

const bots = (...ps) => Promise.all(ps.map((p) => p.ev(() => window.__game.debug.setAutopilot('pro', 1))));
/** A squad floor (`keep`) the scenario lifts with wipe(): nobody falls by accident. */
const arm = (...ps) => Promise.all(ps.map((p) => p.ev(() => {
  const g = window.__game;
  if (window.__keep !== undefined) return;
  window.__keep = 80;
  g.runMods.ext.push(() => { if (window.__keep && g.run && g.run.active && g.run.mode === 'versus') { g.heroes.guard = 99; if (g.squad.count < window.__keep) g.squad.setCount(window.__keep, 'test'); } });
})));
const wipe = (p, extra = 0) => p.ev((d) => { const g = window.__game; window.__keep = 0; if (d) g.run.dist += d; g.squad.setCount(0, 'horde'); }, extra);
const resultUp = (v) => v.state === 'result' && v.screen === 'vsresult' && !!v.result && !!v.ribbon;
const table = (v) => resultUp(v) && !v.watching;
/** The result table of a page: [{ slot, place, tm, ds, tag, me }] in screen order. */
const rows = (p) => p.ev(() => [...document.querySelectorAll('.screen-vsresult .vsr-places li:not(.vsr-h)')].map((li) => ({
  slot: Number(li.dataset.slot), place: li.querySelector('.vsr-pl').textContent, me: li.classList.contains('me'),
  tm: li.querySelector('.vsr-tm') ? li.querySelector('.vsr-tm').textContent : 'standing',
  ds: li.querySelector('.vsr-ds') ? li.querySelector('.vsr-ds').textContent : '', tag: (li.querySelector('.vsr-nm em') || {}).textContent || '',
})));
/** Plays until p shows the watching mode of its result screen (the fall needs the match to run on). */
async function watchingOf(duo, p) {
  const v = await duo.play(10, async () => { const x = await p.view(); return resultUp(x) && x.watching ? x : null; }, 1);
  if (!v) throw new Error(`${p.pid}: no watching mode: ${JSON.stringify(await p.view())}`);
  return v;
}
const order = (rs) => rs.map((r) => `${r.place}:${r.slot}`).join(' ');

/** n pages (the last one 360x640), signed in, seated in one room, on autopilot, READY: the match is live on all. */
export async function room(duo, names, opts = {}) {
  const ps = [];
  for (const [i, n] of names.entries()) ps.push(await duo.page(n[0], { ...(i === names.length - 1 ? { size: [360, 640] } : {}), ...(opts[n[0]] || {}) }));
  for (const [i, p] of ps.entries()) await duo.signIn(p, names[i]);
  const code = await duo.create(ps[0]);
  for (const p of ps.slice(1)) await duo.join(p, code);
  await duo.until(async () => { const v = await ps[0].view(); return v.room && v.room.seats.filter(Boolean).length === ps.length; }, `${ps.length} seats on the host page`);
  await arm(...ps);
  await bots(...ps);
  if (opts.beforeReady) await opts.beforeReady(ps, code);
  await duo.ready(...ps);
  const vs = await duo.go(...ps);
  return { ps, code, vs };
}
/** Plays until every page shows its result TABLE (not the watching mode). */
export async function tables(duo, ps, max = 40) {
  const done = await duo.play(max, async () => { const vs = await Promise.all(ps.map((p) => p.view())); return vs.every(table) ? vs : null; });
  if (!done) throw new Error(`no result table on every page: ${JSON.stringify(await Promise.all(ps.map((p) => p.view())))}`);
  return done;
}
/** The same order of slots and the same time / distance for every fallen row on every page (my own row included). */
async function sameTable(ps, eq, note) {
  const all = await Promise.all(ps.map(rows));
  for (const [i, p] of ps.entries()) note(`${p.pid}: ${all[i].map((r) => `${r.place}:${r.slot}:${r.tm}:${r.ds}${r.tag ? `:${r.tag}` : ''}`).join(' ')}`);
  for (const [i, p] of ps.entries()) {
    eq(order(all[i]), order(all[0]), `${p.pid}'s places vs ${ps[0].pid}'s`);
    for (const r of all[i]) {
      const o = all[0].find((x) => x.slot === r.slot);
      if (r.tm !== 'standing' && o.tm !== 'standing') eq([r.tm, r.ds], [o.tm, o.ds], `${p.pid}: slot ${r.slot}'s time and distance`);
    }
  }
  return all[0];
}

export const scenarios = [
  {
    name: 'four players: one road, falls 4th / 3rd / 2nd, the fallen watch the rest, the same table on all four',
    async run(duo, { ok, eq, note }) {
      const { ps, vs } = await room(duo, ['Ann', 'Ben', 'Cyd', 'Dan']);
      const [A, B, C, D] = ps;
      ok(vs.every((v) => v.seed === vs[0].seed && v.seed > 0), `one road: ${vs.map((v) => v.seed)}`);
      await duo.play(1.5);
      const names = await D.ev(() => [...document.querySelectorAll('.vs-card .vc-name')].map((n) => n.textContent));
      eq(names.slice().sort(), ['ANN', 'BEN', 'CYD', 'DAN'], 'D\'s VS card shows all four');
      await D.shot('card');
      await duo.play(16, async () => (await A.view()).t >= 7);
      const a1 = await A.view();
      eq(a1.peers.map((p) => p.name), ['Ben', 'Cyd', 'Dan'], 'A\'s three rivals');
      ok(a1.peers.every((p) => p.alive && p.n > 0), `rivals' squads on A: ${JSON.stringify(a1.peers)}`);
      const ghosts = await A.ev(() => window.__game.versus.ghost.peers.filter((p) => p.shown > 0).length);
      eq(ghosts, 3, 'A draws 3 ghosts');
      await A.shot('bar');
      // D falls: 4th, watching
      await wipe(D);
      const d = await watchingOf(duo, D);
      eq(d.ribbon, 'YOU CAME 4TH', 'D\'s ribbon');
      await duo.play(2);
      let w = await duo.watchView(D);
      ok(w && w.mode === 'fallen' && w.cards.length === 4, `D's watch cards: ${JSON.stringify(w)}`);
      const meCard = w.cards.find((c) => c.slot === 3), aCard = w.cards.find((c) => c.slot === 0);
      ok(meCard.down && meCard.name === 'YOU', `D's own card: ${JSON.stringify(meCard)}`);
      const aNow = await A.view();
      ok(!aCard.down && Math.abs(aCard.dist - aNow.dist / 1) < 40 && aCard.n > 0, `D sees A live: card ${JSON.stringify(aCard)} / A at ${aNow.dist}`);
      await D.shot('watching');
      // C falls: 3rd, watching too; D's card of C goes OUT
      await duo.play(1.5);
      await wipe(C);
      const c = await watchingOf(duo, C);
      eq(c.ribbon, 'YOU CAME 3RD', 'C\'s ribbon');
      // D's GG reaches C's watch (an emote from a fallen page): on C's feed, a bubble on D's card
      ok(await duo.emote(D, 3), 'D sent GG from its result screen');
      await duo.play(2.5);
      w = await duo.watchView(D);
      ok(w.cards.find((x) => x.slot === 2).down, `D's card of C is down: ${JSON.stringify(w.cards[2])}`);
      const wc = await duo.watchView(C);
      ok(wc.feed.some((l) => /DAN · GG/.test(l)), `C's feed: ${JSON.stringify(wc.feed)}`);
      const bub = await C.ev(() => window.__game.ui.matchUi.emotes.test.shown.slice(-1)[0] || null);
      ok(bub && bub.slot === 3 && bub.where === 'result', `C's bubble of D's GG: ${JSON.stringify(bub)}`);
      await C.shot('watching'); await D.shot('watching-2');
      // B falls: 2nd (its verdict brings the final table), A wins; the watchers' screens turn into the table
      await duo.play(1.5);
      await wipe(B);
      const [ra, rb, rc, rd] = await tables(duo, ps);
      eq([ra.ribbon, rb.ribbon, rc.ribbon, rd.ribbon], ['YOU WIN!', 'YOU LOSE', 'YOU LOSE', 'YOU LOSE'], 'ribbons');
      const t0 = await sameTable(ps, eq, note);
      eq(t0.map((r) => r.slot), [0, 1, 2, 3], 'places by fall order');
      eq(t0.map((r) => r.place), ['1', '2', '3', '4'], 'place numbers');
      for (const p of ps) await p.shot('table');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'three players, two fall 0.6 s apart for first: the further one wins on every screen',
    async run(duo, { ok, eq, note }) {
      const { ps } = await room(duo, ['Ann', 'Ben', 'Cyd']);
      const [A, B, C] = ps;
      await duo.play(16, async () => (await A.view()).t >= 6);
      await wipe(C);
      await duo.play(3);
      // A falls first but 30 m further on; B falls 0.6 s later
      await wipe(A, 30);
      await duo.play(0.6);
      await wipe(B);
      const [a, b, c] = await tables(duo, ps);
      note(`A ${JSON.stringify(a.result)} B ${JSON.stringify(b.result)}`);
      ok(a.result.t < b.result.t && b.result.t - a.result.t <= 1, `the falls inside 1 s: ${a.result.t} / ${b.result.t}`);
      eq([a.ribbon, b.ribbon, c.ribbon], ['YOU WIN!', 'YOU LOSE', 'YOU LOSE'], 'ribbons');
      eq([a.result.reason, b.result.reason], ['distance', 'distance'], 'decided by distance');
      const t0 = await sameTable(ps, eq, note);
      eq(t0.map((r) => r.slot), [0, 1, 2], 'A, B, C');
      for (const p of ps) await p.shot('tie');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'four players: one LEAVEs, one drops offline (OUT IN n, a dc after 13 s), the fallen see LOST CONNECTION only',
    async run(duo, { ok, eq, note }) {
      const { ps } = await room(duo, ['Ann', 'Ben', 'Cyd', 'Dan']);
      const [A, B, C, D] = ps;
      await duo.play(16, async () => (await A.view()).t >= 6);
      // D leaves through the pause button
      await D.click('.hud-pause');
      await duo.until(async () => (await D.view()).top === 'confirm', 'D: LEAVE MATCH?');
      await D.click('[data-screen="confirm"] [data-act="yes"]');
      await duo.until(async () => (await D.view()).view === 'hub', 'D on the hub');
      await duo.play(3);
      const live = await Promise.all([A, B, C].map((p) => p.view()));
      ok(live.every((v) => v.live && v.state === 'playing' && v.peers.find((p) => p.name === 'Dan' && !p.alive)), `the three play on, Dan is out: ${JSON.stringify(live.map((v) => v.peers))}`);
      // B falls (watching), then C's line drops for good
      await wipe(B);
      await watchingOf(duo, B);
      await C.offline(true);
      const chip = await duo.play(8, async () => { const v = await A.view(); return /OUT IN \d+|WIN IN \d+/.test(v.chipDc || '') ? v.chipDc : null; }, 1);
      ok(/CYD LOST CONNECTION · (OUT|WIN) IN \d+/.test(chip || ''), `A's chip: "${chip}"`);
      const wb = await duo.watchView(B);
      const cCard = wb.cards.find((x) => x.slot === 2);
      ok(cCard.silent && !cCard.down, `B's card of C: LOST CONNECTION, not out yet: ${JSON.stringify(cCard)}`);
      await A.shot('chip'); await B.shot('lost');
      ok(!duo.hub.admin.get(`matches/${await A.ev(() => window.__game.versus.link.mid)}/out/2`), 'no dc record yet');
      // A writes C's dc after 13 s: A is the last one standing and wins; B's watch ends with the table
      const [a, b] = await tables(duo, [A, B], 25);
      eq([a.ribbon, b.ribbon], ['YOU WIN!', 'YOU LOSE'], 'ribbons');
      const mid = await A.ev(() => window.__game.versus.link.mid);
      const out = duo.hub.admin.get(`matches/${mid}/out`);
      note(`out records ${JSON.stringify(out)}`);
      eq([out[2] && out[2].by, out[3] && out[3].by], ['dc', 'quit'], 'C\'s dc and D\'s quit');
      const t0 = await sameTable([A, B], eq, note);
      ok(t0.find((r) => r.slot === 3).tag === 'LEFT', `D's row says LEFT: ${JSON.stringify(t0)}`);
      ok(/CONNECTION|OFFLINE/.test(t0.find((r) => r.slot === 2).tag), `C's row says it lost its connection: ${JSON.stringify(t0)}`);
      await A.shot('table'); await B.shot('table');
      await C.offline(false);
      ok(await duo.play(15, async () => resultUp(await C.view()), 1), 'C gets its result on return');
      eq(order(await rows(C)), order(t0), 'C\'s table after its return');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
  {
    name: 'four players, one on lat400, jit300, loss5: the same places everywhere, no false disconnect',
    async run(duo, { ok, eq, note }) {
      const { ps } = await room(duo, ['Ann', 'Ben', 'Cyd', 'Dan'], { A: { net: 'lat400,jit300,loss5' } });
      const [A, B, C, D] = ps;
      let chips = 0;
      const watchChips = async () => { for (const p of ps) if ((await p.view()).chipDc) chips++; };
      await duo.play(20, async () => { await watchChips(); return (await B.view()).t >= 8; });
      await wipe(C);
      await duo.play(3, async () => { await watchChips(); return false; });
      await wipe(B);
      await duo.play(3, async () => { await watchChips(); return false; });
      await wipe(D);
      await tables(duo, ps);
      eq(chips, 0, 'a LOST CONNECTION chip showed');
      const t0 = await sameTable(ps, eq, note);
      eq(t0.map((r) => r.slot), [0, 3, 1, 2], 'A wins, then D, B, C');
      await A.shot('net-table');
      eq(duo.denials.length, 0, `rule refusals: ${JSON.stringify(duo.denials.slice(0, 3))}`);
    },
  },
];
