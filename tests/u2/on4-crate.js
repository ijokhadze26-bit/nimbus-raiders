// @smoke --seconds 0 --shots 0
// Online stage 2, sabotage crates and the state message (src/online/game/sabcrate.js, crates.js, versus.js):
// 1. Two matches with the same seed and different steering get identical sabotage crates (at, lane) for zones 1-3;
//    another seed differs. Each is 12 u clear of every gate / barrel / crate row of its zone.
// 2. Taking one gives a charge (sab:charge 'crate'): no weapon swap, no Mk, no coins; its visual is the purple one.
// 3. Single-player endless and a level have no kind 'sabotage' crate, and a weapon crate still swaps the weapon.
// 4. versus.js: flags bits 2-4 (sabotaged / frozen / big held) and the 0..35 charge go out with the samples, the
//    rivals' charge is kept; a second match in the same page starts with an empty meter and queue and no hold.
const g = window.__game, d = g.debug;
const { on4 } = await import('/tests/u2/lib/on4kit.js');
const { sabCrate } = await import('/src/online/game/sabcrate.js');
const { Rng } = await import('/src/core/rng.js');
const k = await on4(g);
const { SAB } = k.data;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };

try {
  // ---- 1. same seed, same crates ----
  const crates = (seed, ap) => {
    k.start({ seed, ap });
    for (let z = 1; z < 3; z++) { k.run(2, () => k.tough()); if (!(k.toArena() && k.killBoss())) fails.push(`zone ${z + 1} not reached (seed ${seed})`); }
    const placed = k.sab.crates.placed.map((c) => `${c.zone}:${c.at}:${c.lane}`).join(' ');
    const evs = g.run.eventsOf('crate').filter((e) => e.kind === 'sabotage');
    // the clearance rule against the zone's generated rows
    let clear = true;
    for (const c of evs) for (const t of ['gate', 'barrel', 'crate']) for (const e of g.run.eventsOf(t)) if (e !== c && !e.sab && Math.abs(e.at - c.at) < SAB.crate.clear) clear = false;
    const sorted = g.run.eventsOf('crate').every((e, i, a) => i === 0 || a[i - 1].at <= e.at);
    k.end();
    return { placed, n: evs.length, clear, sorted };
  };
  const A = crates(41, 'pro'), B = crates(41, false), C = crates(42, 'casual');
  info.crates = { A: A.placed, C: C.placed };
  ok(A.n === 3 && A.placed.split(' ').length === 3 && A.clear && A.sorted, `crates of seed 41: ${JSON.stringify(A)}`);
  ok(A.placed === B.placed, `same seed, other steering, other crates: ${A.placed} vs ${B.placed}`);
  ok(A.placed !== C.placed, `another seed, same crates: ${C.placed}`);
  // sabCrate is pure: same rng seed + same rows = same crate; a sab row never counts
  const rows = [{ type: 'horde', at: 200 }, { type: 'coins', at: 260 }, { type: 'gate', at: 205 }, { type: 'gate', at: 330, sab: true }, { type: 'coins', at: 335 }];
  const c1 = sabCrate(new Rng(9), rows), c2 = sabCrate(new Rng(9), rows.slice().reverse());
  ok(c1 && c2 && c1.at === c2.at && c1.lane === c2.lane && [260, 335].includes(c1.at) && c1.kind === 'sabotage' && c1.weapon === 'voidsiphon', `sabCrate: ${JSON.stringify(c1)} ${JSON.stringify(c2)}`);

  // ---- 2. taking one ----
  k.start({ seed: 41, ap: false });
  const cr = g.run.eventsOf('crate').find((e) => e.kind === 'sabotage');
  let w0 = g.weapons.id, mk0 = g.weapons.mk, coinsAt = null, look = null;
  const offC = g.events.on('coin:collect', (p) => { if (p.amount === 25) coinsAt = p; });
  k.log.length = 0;
  k.until(() => {
    k.tough();
    g.input.targetX = g.input.startTarget = cr.x;
    if (!k.of('crate:take').length) { k.sab.test.clear(); w0 = g.weapons.id; mk0 = g.weapons.mk; }
    const live = g.crates.live.find((c) => c.kind === 'sabotage');
    if (live && live.v) look = live.v.weapon;
    return k.of('crate:take').length > 0;
  }, 60);
  offC();
  const take = k.of('crate:take')[0], ch = k.of('sab:charge').find((x) => x.source === 'crate');
  info.take = { at: cr.at, lane: cr.lane, take, ch, look };
  ok(take && take.kind === 'sabotage' && take.weapon === 'voidsiphon' && ch && ch.ready === 1 && !ch.lost && k.sab.ready === 1, `crate take: ${JSON.stringify(info.take)}`);
  ok(g.weapons.id === w0 && g.weapons.mk === mk0 && coinsAt === null, `a sabotage crate changed the weapon / paid coins: ${g.weapons.id} Mk ${g.weapons.mk}`);
  ok(look === 'sabotage', `the crate's look: ${look}`);
  k.end();

  // ---- 3. single-player ----
  d.setAutopilot('pro', 1);
  d.startEndless(41);
  ok(g.run.eventsOf('crate').every((e) => !e.kind), 'single-player endless has a sabotage crate');
  d.skipToBoss();
  for (let i = 0; i < 600 && !(g.run.phase === 'boss' && g.boss && g.boss.state === 'fight'); i++) { g.heroes.guard = 99; d.simulate(1 / 60); }
  d.killBoss();
  for (let i = 0; i < 600 && g.endless.zone < 2; i++) { g.heroes.guard = 99; d.simulate(1 / 60); }
  const wc = g.run.eventsOf('crate');
  ok(g.endless.zone === 2 && wc.length >= 1 && wc.every((e) => !e.kind && e.weapon !== undefined), `single-player zone 2 crates: ${JSON.stringify(wc)}`);
  d.toTitle();
  d.startLevel(3);
  ok(g.run.eventsOf('crate').every((e) => !e.kind), 'a level has a sabotage crate');
  d.toTitle();
  // a weapon crate still swaps (a custom level with one crate in the middle lane path)
  d.setAutopilot(false);
  d.setLoadout('pip', 'thunderclap');
  d.startCustom({ length: 200, events: [{ type: 'crate', at: 40, lane: 'L', x: -2.5, weapon: 'voidsiphon' }] });
  g.input.targetX = g.input.startTarget = -2.5;
  for (let i = 0; i < 400 && g.crates.taken === 0; i++) d.simulate(1 / 60);
  ok(g.crates.taken === 1 && g.weapons.id === 'voidsiphon', `weapon crate in a level: taken ${g.crates.taken}, weapon ${g.weapons.id}`);
  d.toTitle();

  // ---- 4. flags, charge, a second match ----
  let link = k.start({ seed: 43 });
  k.run(2, () => k.tough());
  const last = () => link.test.sent.at(-1);
  ok((last().flags & 28) === 0 && last().charge === k.sab.charge(), `flags before any sabotage: ${JSON.stringify(last())}`);
  link.test.sab(1, 2);
  k.run(0.25, () => k.tough());
  ok((last().flags & 4) !== 0 && (last().flags & 8) === 0, `sabotaged bit while one is incoming: ${last().flags}`);
  k.run(1.2, () => k.tough());
  ok((last().flags & 4) !== 0, `sabotaged bit while fog runs: ${last().flags}`);
  link.test.sab(2, 5);
  k.run(1.25, () => k.tough());
  ok((last().flags & 8) !== 0, `frozen bit: ${last().flags}`);
  k.sab.test.giveBig(12);
  k.run(0.15, () => k.tough());
  ok((last().flags & 16) !== 0, `big held bit: ${last().flags}`);
  k.sab.test.clear(); k.sab.test.give(undefined, 1); k.sab.sent = 1; k.sab.fill = 50; // cost 100: 12 + floor(0.5 x 12) = 18
  k.run(0.12, () => k.tough());
  const ch2 = last().charge;
  ok(ch2 >= 18 && ch2 <= 21 && ch2 <= k.sab.charge(), `charge field: ${ch2} (now ${k.sab.charge()})`);
  k.sab.test.give(undefined, 2);
  k.run(0.12, () => k.tough());
  ok(last().charge === 35, `charge with 2 stored: ${last().charge}`);
  // rivals' charge and flags are kept
  link.test.rivals[0].curve = (t) => ({ dist: 9 * t, n: 30, x: 0, form: 0, boss: 0, zone: 1, flags: 4 | 16, danger: 0, charge: 22 });
  k.run(0.6, () => k.tough());
  const p1 = k.versus.view().peers[0];
  ok(p1.flags === 20 && p1.charge === 22, `rival flags / charge: ${p1.flags} / ${p1.charge}`);
  // leave it mid-freeze with sabotages queued, then a second match in the same page
  k.run(1, () => k.tough());
  link.test.sab(3, 5);
  k.run(1.1, () => k.tough());
  link.test.sab(1, 4);
  k.run(0.2, () => k.tough());
  ok(g.runMods.holdFn !== null && k.sab.view().incoming === 1, 'the setup of the second-match check');
  link = k.start({ seed: 44 });
  const v = k.sab.view();
  info.second = { ...v };
  ok(g.runMods.holdFn === null && v.ready === 0 && v.fill === 0 && v.big === 0 && v.incoming === 0 && v.frozen === 0 && v.fog === 0 && v.speed === 0 && v.blackout === 0 && v.wait === 0 && k.sab.seen.size === 0, `a second match is not clean: ${JSON.stringify(v)}`);
  k.run(2, () => k.tough());
  ok(k.of('sab:land').length === 0 && k.sab.view().on && k.versus.view().peers.every((p) => p.charge === 0), 'the old sabotage landed in the second match');
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  k.end();
}
return { pass: fails.length === 0, fails, info };
