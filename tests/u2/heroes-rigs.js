// SPEC2 §3.7 / §9 heroes-rigs: every hero rig builds and disposes cleanly 20 times (renderer geometry count
// returns to its start), stays within <= 12 draw objects and <= 3500 triangles High (<= 2200 Low), sets a
// muzzle, a hand socket and the ability pose length; the leader swap disposes the old rig; Pip is untouched.
const g = window.__game, d = g.debug;
g.loop.stop();
const { buildHero } = await import('/src/models/heroes/index.js');
const { HERO_IDS } = await import('/src/data/heroes.js');
const fails = [], info = {};
const R = g.engine.renderer, cam = g.camera;
const tris = (o) => {
  let n = 0, objs = 0;
  o.traverse((c) => {
    if (c.isSprite) { objs++; n += 2; return; }
    if (!c.isMesh) return;
    objs++;
    const geo = c.geometry;
    n += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  });
  return { tris: Math.round(n), objs };
};
for (const lod of ['high', 'low']) {
  for (const id of HERO_IDS) {
    // budget + contract
    const rig = buildHero(id, { lod });
    const t = tris(rig.root);
    const key = `${id}-${lod}`;
    info[key] = t;
    const maxT = lod === 'high' ? 3500 : 2200;
    if (t.objs > 12) fails.push(`${key}: ${t.objs} draw objects`);
    if (id !== 'pip' && t.tris > maxT) fails.push(`${key}: ${t.tris} triangles > ${maxT}`);
    const m = rig.muzzle;
    if (!m || ![m.x, m.y, m.z].every(Number.isFinite) || !(m.z < 0) || !(m.y > 0)) fails.push(`${key}: muzzle ${JSON.stringify(m)}`);
    if (!rig.handSocket || !rig.handSocket.isObject3D) fails.push(`${key}: no handSocket`);
    if (!(rig.scale > 0) || typeof rig.animate !== 'function' || typeof rig.dispose !== 'function') fails.push(`${key}: contract`);
    if (!(rig.abilityDuration > 0)) fails.push(`${key}: abilityDuration`);
    if (!rig.gun || !rig.gunMat || rig.legs.length !== 2 || rig.arms.length !== 2) fails.push(`${key}: gun / limbs`);
    for (const ab of [0, 0.05, 0.3, 0.7, 1]) rig.animate(1.234, 1, 0.5, 0, ab);
    rig.dispose();
    // build + draw + dispose x20: GPU geometry count returns to the start value
    const scene = new g.scene.constructor();
    const g0 = R.info.memory.geometries;
    for (let i = 0; i < 20; i++) {
      const r = buildHero(id, { lod });
      scene.add(r.root);
      R.render(scene, cam);
      scene.remove(r.root);
      r.dispose();
    }
    const g1 = R.info.memory.geometries;
    if (g1 !== g0) fails.push(`${key}: geometries ${g0} -> ${g1} after 20 builds`);
  }
}
// distinct shapes: no two heroes share the same triangle count
const counts = HERO_IDS.map((id) => info[id + '-high'].tris);
if (new Set(counts).size !== counts.length) fails.push('two hero rigs have identical triangle counts: ' + counts.join(','));
// leader swap through the loadout: one rig in the scene, the old one disposed, muzzle follows the hero
const cycle = () => { for (const id of [...HERO_IDS, 'pip']) { d.setLoadout(id, 'thunderclap'); d.startLevel(1); d.simulate(0.2); g.engine.render(); } };
cycle();                                  // first pass fills level / weapon caches
const before = R.info.memory.geometries;
cycle();
const sq = g.squad;
if (sq.pip.id !== 'pip' || Math.abs(sq.pipScale - 1.25) > 1e-9) fails.push('Pip not restored as leader: ' + sq.pip.id + ' ' + sq.pipScale);
let leaders = 0;
g.scene.traverse((o) => { if (o === sq.pip.root) leaders++; });
info.leaderGeoDelta = R.info.memory.geometries - before;
if (info.leaderGeoDelta > 0) fails.push('geometries grow with every hero swap cycle: +' + info.leaderGeoDelta);
if (leaders !== 1) fails.push('leader roots in scene ' + leaders);
// Pip's numbers unchanged (rig contract additions only)
const pip = sq.pip;
if (JSON.stringify(pip.muzzle) !== JSON.stringify({ x: 0.32 / 1.25, y: 0.9 / 1.25, z: -0.75 / 1.25 })) fails.push('Pip muzzle changed');
pip.animate(0.5, 1, 0, 0, 0);
const pose = [pip.body.position.y, pip.body.rotation.x, pip.legs[0].rotation.x, pip.arms[1].rotation.x].map((v) => Math.round(v * 1e6) / 1e6);
const f = 11.5, s = Math.sin(0.5 * f);
const want = [Math.abs(s) * 0.07, -0.14, s * 0.8, 1.45 + Math.sin(0.5 * f * 2) * 0.03].map((v) => Math.round(v * 1e6) / 1e6);
if (JSON.stringify(pose) !== JSON.stringify(want)) fails.push(`Pip run pose changed ${pose} vs ${want}`);
d.toTitle();
return { pass: fails.length === 0, fails, info };
