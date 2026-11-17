// @smoke --seconds 0 --shots 0
// Update 3 quick autopilot check (stage 3 balance, STAGE3.md): 4 levels per world, 3 loadouts, up to 5 attempts
// (attempt k = bot seed s + 100 k, lib.untilWin). Upgrades: U[L] of the casual campaign (scripts/balance/
// snapshots3.json, written from campaign3.js) or none (?ups=none). Query: ?profs=casual,pro&ups=snap|none
// &levels=3,6,...&loads=pip/thunderclap,cinder/emberstorm,vex/voidsiphon&seed=1&tries=5.
// Returns { [prof]: { [hero/weapon]: { [id]: attempts (6 = not won in 5) } } } + the arena / finish squads.
const g = window.__game, d = g.debug;
g.loop.stop();
const { untilWin } = await import('/scripts/balance/lib.js');
const q = new URLSearchParams(location.search);
const profs = (q.get('profs') || 'casual,pro').split(',');
const levels = (q.get('levels') || '3,6,9,10,13,16,19,20,23,26,29,30,33,36,39,40,43,46,49,50').split(',').map(Number);
const loads = (q.get('loads') || 'pip/thunderclap,cinder/emberstorm,vex/voidsiphon').split(',').map((s) => s.split('/'));
const seed = Number(q.get('seed') || 1), tries = Number(q.get('tries') || 5);
const none = { squad: 0, damage: 0, rate: 0, tier: 0, coins: 0 };
let snap = null;
if (q.get('ups') !== 'none') snap = await (await fetch('/scripts/balance/snapshots3.json')).json();
g.save.reset();
const out = {}, squads = {};
for (const prof of profs) {
  out[prof] = {}; squads[prof] = {};
  for (const [hero, weapon] of loads) {
    const k = `${hero}/${weapon}`, row = {}, sq = {};
    for (const id of levels) {
      const ups = snap ? snap.U[id].upgrades : none;
      const u = untilWin(g, { id, hero, weapon, prof, seed, tries, ups });
      row[id] = u.attempts;
      const w = u.runs.find((r) => r.win);
      sq[id] = w ? (w.arena ?? w.squad) : `X${u.runs[u.runs.length - 1].bossLeft ?? ''}`;
    }
    out[prof][k] = row; squads[prof][k] = sq;
  }
}
d.setAutopilot(false);
g.save.reset();
return { attempts: out, squads };
