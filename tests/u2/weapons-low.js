// SPEC2 §6.9 / §9 WEAPONS on Low quality: every weapon effect still spawns >= 1 particle or mesh (Low only
// halves counts): muzzle flashes, hit flashes, each weapon's own one-shot recipes (ignite, freeze, splash,
// puddle, split, bounce, turret, arc, hole), the zone meshes (puddles, holes) and the continuous emitters.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { WEAPON_IDS } = await import('/src/data/weapons.js');
const fails = [], info = {};
const WANT = {
  emberstorm: ['ignite'], glacier: ['freeze', 'frost'], sugarrush: ['splash', 'puddle'], spectra: ['split'],
  gearworks: ['bounce', 'turret'], thunderclap: ['arc'], voidsiphon: ['hole'],
};
g.applyQuality('low');
const F = g.fx, fl = F.flashes;
const mz = { calls: 0, parts: 0 }, hit = { calls: 0, parts: 0 };
const m0 = fl.muzzle.bind(fl), h0 = fl.weaponHit.bind(fl);
fl.muzzle = (...a) => { const n = F.P.n; m0(...a); mz.calls++; if (F.P.n > n) mz.parts++; };
fl.weaponHit = (...a) => { const n = F.P.n; h0(...a); hit.calls++; if (F.P.n > n) hit.parts++; };
for (const w of WEAPON_IDS) {
  d.setAutopilot(false);
  d.setLoadout('pip', w);
  d.startCustom({ length: 900, speed: 6, events: [horde(30, 60, { grunt: 0.6, shield: 0.2, tank: 0.2 }, 'both', { hpMul: 30 }), horde(70, 60, { grunt: 1 }, 'both', { hpMul: 30 })] });
  d.setMk(5);
  d.give('troops', 29);
  g.heroes.guard = 99;
  const S = F.weaponFx.stats;
  for (const k in S.recipes) S.recipes[k] = 0;
  for (const k in S.particles) S.particles[k] = 0;
  mz.calls = mz.parts = hit.calls = hit.parts = 0;
  let maxP = 0, zoneMesh = 0;
  for (let i = 0; i < 60 * 5.4; i++) {
    g.step(1 / 60); g.sync(1 / 60);
    maxP = Math.max(maxP, F.P.n);
    for (const m of g.zoneViews.meshes) if (m.visible && m.count > 0) zoneMesh = Math.max(zoneMesh, m.count);
  }
  const row = { muzzle: `${mz.parts}/${mz.calls}`, hits: `${hit.parts}/${hit.calls}`, maxParticles: maxP, recipes: { ...S.recipes }, particles: { ...S.particles }, zoneMesh };
  info[w] = row;
  if (!mz.calls || mz.parts !== mz.calls) fails.push(`${w}: muzzle flashes ${row.muzzle} spawned particles`);
  if (hit.calls && hit.parts !== hit.calls) fails.push(`${w}: hit flashes ${row.hits} spawned particles`);
  for (const k of WANT[w]) {
    if (!(S.recipes[k] >= 1)) fails.push(`${w}: no '${k}' effect on Low`);
    else if (!(S.particles[k] >= 1)) fails.push(`${w}: '${k}' spawned no particle on Low`);
  }
  if ((w === 'sugarrush' || w === 'voidsiphon') && !zoneMesh) fails.push(`${w}: no zone mesh drawn on Low`);
  if (!(maxP > 0)) fails.push(`${w}: no particles at all`);
}
fl.muzzle = m0; fl.weaponHit = h0;
g.applyQuality('high');
d.toTitle();
return { pass: fails.length === 0, fails, info };
