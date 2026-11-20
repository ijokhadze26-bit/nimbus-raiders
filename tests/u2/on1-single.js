// @smoke --seconds 0 --shots 0
// Online stage 1: single-player Endless is unchanged by the online hooks in src/game/** (STAGE1 hard rule).
// BASE was measured on the base commit 46503b2 BEFORE any edit (same script: the hash of every event Endless
// generated, a hash of the squad / distance / kills every 30 s and the end state of a 150 s autopilot run, for
// seed 4242 with the pro bot and seed 77 with the casual bot, Pip + Thunderclap, a fresh save).
// The same numbers must come out (a) before the online chunk is loaded and (b) after it was loaded and a versus
// match was played and left (nothing of a match may leak into the next single-player run).
const g = window.__game, d = g.debug;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const BASE = {
  '4242:pro': { ev0: 'e7e747a1', ev: '37959e83', zone: 2, marks: '6dfe26e3', last: [1334.06, 999, 781], end: { state: 'playing', dist: 1334.1, squad: 999, kills: 781, mk: 5, coins: 224, time: 148.88 } },
  '77:casual': { ev0: '924fec16', ev: '89fb594e', zone: 2, marks: 'e1e26fb2', last: [1362.53, 998, 670], end: { state: 'playing', dist: 1362.5, squad: 998, kills: 670, mk: 5, coins: 269, time: 148.88 } },
};
function endless(seed, prof) {
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot(prof, 1);
  d.startEndless(seed);
  const ev0 = hash(JSON.stringify(g.run.byType));
  const marks = [];
  let s, n = 0;
  do { s = d.simulate(30); n++; marks.push([Math.round(g.run.dist * 100) / 100, g.squad.count, g.run.kills]); } while (s.state === 'playing' && n < 5);
  return { ev0, ev: hash(JSON.stringify(g.run.byType)), zone: g.endless.zone, marks: hash(JSON.stringify(marks)), last: marks[marks.length - 1],
    end: { state: s.state, dist: s.dist, squad: s.squad, kills: s.kills, mk: s.mk, coins: s.coins, time: Math.round(g.run.time * 1000) / 1000 } };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  g.save.reset();
  ok(g.versus === undefined, 'game.versus exists before the online chunk was loaded');
  // (a) the online chunk is not loaded
  for (const [seed, prof] of [[4242, 'pro'], [77, 'casual']]) {
    const key = `${seed}:${prof}`, r = endless(seed, prof);
    info['before ' + key] = r;
    ok(same(r, BASE[key]), `endless ${key} differs from the base commit: ${JSON.stringify(r)}`);
  }
  // (b) the same page after the online chunk is in and a match was played
  const { installOnline } = await import('/src/online/index.js');
  const { createTestLink } = await import('/src/online/game/testlink.js');
  const { versus } = await installOnline(g, g.ui);
  ok(g.versus === versus, 'installOnline did not set game.versus');
  d.setAutopilot('pro', 3);
  versus.start(createTestLink({ game: g, seed: 4242, rivals: [{ slot: 1, name: 'Rival' }] }), { hero: 'pip', weapon: 'thunderclap' });
  versus.simulate(50);
  ok(g.run.mode === 'versus' && g.run.hpRamp > 1 && versus.t > 49 && versus.view().peers[0].n > 0 && versus.ramp.stats.waves > 0, 'the versus match did not run');
  versus.stop();
  ok(!versus.live && !versus.ghost.mesh.visible && g.state === 'title', 'the match was not left cleanly');
  for (const [seed, prof] of [[4242, 'pro'], [77, 'casual']]) {
    // the bot's own dice count its runs (autopilot.runs): setAutopilot(prof, 1) restarts them, as in (a)
    const key = `${seed}:${prof}`, r = endless(seed, prof);
    info['after ' + key] = r;
    ok(same(r, BASE[key]), `endless ${key} after a versus match differs from the base commit: ${JSON.stringify(r)}`);
    ok(!g.run.hpRamp || g.run.hpRamp === 1, 'run.hpRamp leaked into a single-player run');
  }
} catch (e) {
  fails.push('threw: ' + (e.stack || e.message).slice(0, 600));
} finally {
  if (g.versus && g.versus.live) g.versus.stop();
  d.setAutopilot(false);
  d.toTitle();
  g.save.reset();
}
return { pass: fails.length === 0, fails, info };
