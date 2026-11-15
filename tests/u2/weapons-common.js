// SPEC2 §9 WEAPONS / common visual + budget rules, for all seven weapons:
//   - every Mk step swaps the bullet geometry (setStyleGeometry) and changes look.mk; MK_SCALE is applied;
//     the main bullet's world bounding box grows at every step Mk I -> V (volume strictly increasing);
//   - budgets: bullet styles <= 120 triangles, raider guns <= 60 High / <= 36 Low, hero guns <= 160, mini
//     turret <= 400, crate <= 300 in 3 meshes; the raider gun silhouette changes with every Mk;
//   - every def.sfx name exists in SFX; the seven weapons' main bullets are all different geometries.
const g = window.__game, d = g.debug;
g.loop.stop();
const W = await import('/src/data/weapons.js');
const { SFX } = await import('/src/audio/sfxdefs.js');
const { buildProjectileGeometry, triCount } = await import('/src/models/weapons/projectiles.js');
const { buildGunGeometry, buildHeroGunGeometry, gunTris } = await import('/src/models/weapons/guns.js');
const { gearTurretTris, buildGearTurret } = await import('/src/models/weapons/gearturret.js');
const { buildCrate, crateTris } = await import('/src/models/crate.js');
const fails = [], info = {};
const B = g.bullets;
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
d.startCustom({ length: 600, speed: 0, events: [] });
g.weapons.enabled = false;
for (const id of W.WEAPON_IDS) {
  const row = { vol: [], scale: [], tris: {}, gun: [], hero: [] };
  g.weapons.setWeapon(id, { silent: true });
  const beh = g.weapons.beh;
  let prevGeo = null, prevLook = null;
  for (let mk = 1; mk <= 5; mk++) {
    g.weapons.setMk(mk, { silent: true, force: true });
    const geo = B.meshes[beh.style].geometry;
    if (geo === prevGeo) fails.push(`${id} Mk ${mk}: bullet geometry not swapped`);
    const lk = JSON.stringify(W.weaponDef(id).look.mk[mk - 1]);
    if (lk === prevLook) fails.push(`${id} Mk ${mk}: look.mk unchanged`);
    prevGeo = geo; prevLook = lk;
    // one volley -> the first spawned main bullet's world box
    const n0 = B.active.length;
    const r = beh.row(mk);
    beh.fire({ x: 0, y: 0.6, z: g.squad.leader.z - 1, lead: 0, dmg: 0.01, unit: 0.01, shots: 1, show: true, mk, range: r.range || 60, pierce: 0, idx: 0 });
    const b = B.active.slice(n0).find((x) => x.style === beh.style);
    if (!b) { fails.push(`${id} Mk ${mk}: no main bullet`); continue; }
    geo.computeBoundingBox();
    const s = geo.boundingBox.max.clone().sub(geo.boundingBox.min);
    const vol = s.x * b.sx * s.y * b.sy * s.z * b.sz;
    row.vol.push(Math.round(vol * 10000) / 10000);
    row.scale.push(Math.round((b.sx / W.MK_SCALE[mk - 1]) * 1000) / 1000);
    for (const p of ['main', 'child', 'tracer']) row.tris[p + mk] = triCount(buildProjectileGeometry(id, mk, p));
    row.gun.push(gunTris(buildGunGeometry(id, mk, 'high')) + '/' + gunTris(buildGunGeometry(id, mk, 'low')));
    row.hero.push(gunTris(buildHeroGunGeometry(id, mk)));
    if (gunTris(buildGunGeometry(id, mk, 'high')) > 60) fails.push(`${id} Mk ${mk} raider gun ${gunTris(buildGunGeometry(id, mk, 'high'))} tris > 60`);
    if (gunTris(buildGunGeometry(id, mk, 'low')) > 36) fails.push(`${id} Mk ${mk} raider gun Low ${gunTris(buildGunGeometry(id, mk, 'low'))} tris > 36`);
    if (gunTris(buildHeroGunGeometry(id, mk)) > 160) fails.push(`${id} Mk ${mk} hero gun ${gunTris(buildHeroGunGeometry(id, mk))} tris > 160`);
    if (mk > 1) {
      const a = buildGunGeometry(id, mk - 1, 'high'), c = buildGunGeometry(id, mk, 'high');
      a.computeBoundingBox(); c.computeBoundingBox();
      const va = a.boundingBox.max.clone().sub(a.boundingBox.min), vc = c.boundingBox.max.clone().sub(c.boundingBox.min);
      if (!(vc.x * vc.y * vc.z > va.x * va.y * va.z)) fails.push(`${id} Mk ${mk}: raider gun not bigger than Mk ${mk - 1}`);
    }
    for (const x of B.active.slice(n0)) x.dead = true;
    d.simulate(1 / 60);
  }
  for (const k in row.tris) if (row.tris[k] > 120) fails.push(`${id} ${k} bullet ${row.tris[k]} tris > 120`);
  for (let i = 1; i < row.vol.length; i++) if (!(row.vol[i] > row.vol[i - 1])) fails.push(`${id}: bullet box does not grow Mk ${i} -> ${i + 1} (${row.vol[i - 1]} -> ${row.vol[i]})`);
  if (new Set(row.scale).size !== 1) fails.push(`${id}: MK_SCALE not applied uniformly ${row.scale}`);
  for (const k of Object.values(W.weaponDef(id).sfx)) if (!SFX[k]) fails.push(`${id} sfx ${k} missing`);
  info[id] = { vol: row.vol, gun: row.gun, hero: row.hero, maxBulletTris: Math.max(...Object.values(row.tris)) };
}
// distinct looks: seven different main geometries (vertex count + first colour)
const sig = W.WEAPON_IDS.map((id) => { const geo = buildProjectileGeometry(id, 3, 'main'); return geo.attributes.position.count + ':' + Array.from(geo.attributes.color.array.slice(0, 3)).map((v) => v.toFixed(2)).join(','); });
if (new Set(sig).size !== W.WEAPON_IDS.length) fails.push('two weapons share a bullet look: ' + sig.join(' | '));
// turret + crate budgets
info.turretTris = gearTurretTris();
if (info.turretTris > 400) fails.push('mini turret ' + info.turretTris + ' tris');
const t = buildGearTurret();
let tm = 0; t.root.traverse((o) => { if (o.isMesh) tm++; });
info.crate = {};
for (const id of W.WEAPON_IDS) {
  const tr = crateTris(id);
  info.crate[id] = tr;
  if (tr > 300) fails.push(`crate (${id}) ${tr} tris > 300`);
}
const c = buildCrate('glacier');
let cm = 0; c.root.traverse((o) => { if (o.isMesh) cm++; });
info.crateMeshes = cm; info.turretMeshes = tm;
if (cm > 3) fails.push('crate draws ' + cm + ' meshes');
d.toTitle();
return { pass: fails.length === 0, fails, info };
