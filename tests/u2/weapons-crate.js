// SPEC2 §9 WEAPONS / crates: running through a crate of another weapon swaps the weapon (Mk kept, bullets of
// the new weapon fire next), plays the crate burst and the swap; a crate of the same weapon gives +1 Mk; the
// crate model shows the weapon's own colour, its Mk I gun and its short name (3 meshes, <= 300 triangles);
// Void holes outlive the swap. Also checks the crate on Low still renders all three meshes.
const g = window.__game, d = g.debug;
g.loop.stop();
const { crate } = await import('/src/data/levels.js');
const { weaponDef } = await import('/src/data/weapons.js');
const fails = [], info = {};
const frames = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.sync(1 / 60); } };
function run(events, weapon = 'thunderclap', mk = 2) {
  d.setAutopilot(false);
  d.setLoadout('pip', weapon);
  d.startCustom({ length: 400, speed: 9, events });
  d.setMk(mk);
  frames(2);
}
const swaps = [], takes = [];
const offA = g.events.on('weapon:swap', (p) => swaps.push({ ...p }));
const offB = g.events.on('crate:take', (p) => takes.push({ ...p }));
// 1. different weapon: swap, Mk kept
run([crate(30, 'L', 'glacier')]);
const cx = g.crates.upcoming()[0].x;
g.input.targetX = cx; // steer into the crate's lane
const vis = [];
for (let i = 0; i < 60 * 4 && g.weapons.id !== 'glacier'; i++) {
  frames(1);
  for (const c of g.crates.live) if (c.v && !vis.length) {
    let meshes = 0; c.v.root.traverse((o) => { if (o.isMesh) meshes++; });
    vis.push({ meshes, color: '#' + c.v.shell.material.color.getHexString(), label: c.v.label.key, weapon: c.v.weapon });
  }
}
info.swap = { weapon: g.weapons.id, mk: g.weapons.mk, swaps: swaps.length, takes: takes.length, crateVisual: vis[0] };
if (g.weapons.id !== 'glacier') fails.push('crate did not swap to glacier');
if (g.weapons.mk !== 2) fails.push('Mk not kept: ' + g.weapons.mk);
if (swaps.length !== 1 || takes.length !== 1) fails.push(`events swap ${swaps.length} take ${takes.length}`);
if (!vis.length) fails.push('crate visual never showed');
else {
  if (vis[0].meshes !== 3) fails.push('crate meshes ' + vis[0].meshes);
  if (vis[0].color !== weaponDef('glacier').look.mk[0].color.toLowerCase()) fails.push('crate colour ' + vis[0].color);
  if (!String(vis[0].label).startsWith(weaponDef('glacier').short)) fails.push('crate label ' + vis[0].label);
}
frames(30);
const recipes = g.fx.weaponFx.stats.recipes;
if (!(recipes.crate >= 1)) fails.push('no crate burst');
const glacierShots = g.bullets.active.filter((b) => b.owner === g.weapons.behaviours.glacier).length;
if (!glacierShots) fails.push('no glacier shards after the swap');
// 2. same weapon: +1 Mk
run([crate(30, 'R', 'thunderclap')], 'thunderclap', 3);
const rx = g.crates.upcoming()[0].x;
g.input.targetX = rx;
for (let i = 0; i < 60 * 4 && g.weapons.mk === 3; i++) frames(1);
info.same = { mk: g.weapons.mk };
if (g.weapons.mk !== 4) fails.push('same-weapon crate did not raise the Mk');
// 3. a Void hole survives the crate swap
run([crate(30, 'L', 'sugarrush')], 'voidsiphon', 3);
const lx = g.crates.upcoming()[0].x;
g.zones.addHole(lx, g.squad.leader.z - 8, 4, 1, 5, 9, 1, 'voidsiphon');
g.input.targetX = lx;
for (let i = 0; i < 60 * 4 && g.weapons.id !== 'sugarrush'; i++) frames(1);
if (g.weapons.id !== 'sugarrush') fails.push('void -> sugar crate did not swap');
if (!g.zones.holes.length) fails.push('the hole did not survive the swap');
// 4. Low: the crate keeps its three meshes
g.applyQuality('low');
run([crate(30, 'L', 'spectra')]);
let lowMeshes = 0;
for (let i = 0; i < 60 * 2 && !lowMeshes; i++) {
  frames(1);
  for (const c of g.crates.live) if (c.v) { c.v.root.traverse((o) => { if (o.isMesh && o.visible) lowMeshes++; }); break; }
}
info.lowMeshes = lowMeshes;
if (lowMeshes !== 3) fails.push('Low crate meshes ' + lowMeshes);
g.applyQuality('high');
offA(); offB();
g.input.targetX = 0;
d.toTitle();
return { pass: fails.length === 0, fails, info };
