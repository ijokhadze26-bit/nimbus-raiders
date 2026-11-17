// @smoke --seconds 0 --shots 0
// Update 3 stage 3 review checks (scripts/balance/CHANGELOG.md "Update 3 review"): one bossless level per world 2-5
// (L16, L26, L36, L46), casual bot seed 1, Pip + Thunderclap, campaign upgrades (snapshots3 U[id]):
// 1. the squad's firepower still matters at the climax: from 60 u before the final rush to the end, at least
//    MIN_SHARE of the enemies die to something other than contact (guns, the blasts they set off, abilities,
//    helpers) - the late hordes stay killable;
// 2. every level horde is played at its data size: what horde.js spawns (overflow included) adds up to the
//    events' counts within 2% (a full field holds the rest back instead of cutting it) and the final rush
//    alone gets at least 94% of its count (a held-back remainder still due when the squad is 25 u from the
//    finish is dropped: it could no longer reach the squad).
const g = window.__game, d = g.debug;
g.loop.stop();
const snap = await (await fetch('/scripts/balance/snapshots3.json')).json();
const MIN_SHARE = 0.3;
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const H = g.horde;
const kill0 = H.kill, spawn0 = H.spawnWave;
let causes = null, inWin = false, spawned = 0, rushGot = 0, rushEv = null;
H.kill = function (e, cause) { if (inWin && e.state === 0) causes[cause] = (causes[cause] || 0) + 1; return kill0.call(this, e, cause); };
H.spawnWave = function (ev, split) {
  const n0 = this.list.length;
  const r = spawn0.call(this, ev, split);
  const n = this.list.length - n0;
  spawned += n;
  if (rushEv && (ev === rushEv || (ev.rush && ev.at >= rushEv.at - 1))) rushGot += n;
  return r;
};
g.save.reset();
for (const id of [16, 26, 36, 46]) {
  d.setUpgrades(snap.U[id].upgrades);
  d.setLoadout('pip', 'thunderclap');
  d.setAutopilot('casual', 1, { crates: 'never', ability: true, loadout: 'keep' });
  causes = {}; inWin = false; spawned = 0; rushGot = 0;
  d.startLevel(id);
  const def = g.run.def;
  rushEv = def.events.find((e) => e.type === 'horde' && e.rush);
  const want = def.events.filter((e) => e.type === 'horde').reduce((a, e) => a + e.count, 0);
  let guard = 0;
  while (g.state === 'playing' && guard++ < 2400) {
    d.simulate(0.25);
    if (!inWin && -g.squad.leader.z >= rushEv.at - 60) inWin = true;
  }
  inWin = false;
  const all = Object.values(causes).reduce((a, b) => a + b, 0);
  const share = all ? 1 - (causes.contact || 0) / all : 0;
  const won = !!(g.lastResult && g.lastResult.win);
  info[id] = { win: won, squad: g.lastResult && g.lastResult.squad, share: Math.round(share * 100) / 100, causes, spawned, want, rush: `${rushGot}/${rushEv.count}`, deferred: H.waveStats.deferred };
  ok(all > 100 && share >= MIN_SHARE, `L${id}: only ${Math.round(share * 100)}% of the climax kills were not contact (${JSON.stringify(causes)})`);
  // a lost run never meets the rest: only a run that reached the finish must have spawned everything
  if (won) {
    ok(Math.abs(spawned - want) <= want * 0.02 + 2, `L${id}: spawned ${spawned} of ${want} horde enemies`);
    ok(rushGot >= rushEv.count * 0.94, `L${id}: final rush spawned ${rushGot} of ${rushEv.count}`);
  }
}
H.kill = kill0; H.spawnWave = spawn0;
delete H.kill; delete H.spawnWave; // back to the prototype methods
d.setAutopilot(false);
g.save.reset();
return { pass: fails.length === 0, fails, info };
