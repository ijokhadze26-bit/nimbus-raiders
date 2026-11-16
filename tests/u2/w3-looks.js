// Update 3 stage 1 world looks: the 8 world themes on High and Low (sky / sea / road / trim glow / weather /
// fog follow the theme and switch back cleanly to a sky theme), the per-world Murkling skins (vertex colours
// swapped in place, sky restores the original colours, types stay readable), boss skins (model recolour +
// name on the card and HP bar, restore on an unskinned fight, glacius / gumdrop stand-ins), the world run
// tracks (bindings pick the track, every track renders non-silent offline), the finish arch on a boss-less
// finish level (visible at -length, crossing it wins with extra sparkles) and the world intro banner.
// When run by the screenshot harness, window.__shot(name) saves a picture of each look.
const g = window.__game, d = g.debug;
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const { horde, getLevel } = await import('/src/data/levels.js');
const { WORLDS } = await import('/src/data/worlds.js');
const { THEMES } = await import('/src/data/themes.js');
const { TRACKS, runTrackFor } = await import('/src/audio/tracks.js');
const { Music } = await import('/src/audio/music.js');
const { buildMurklingGeometry } = await import('/src/models/murklings.js');
const { ENEMY_TYPES } = await import('/src/data/enemies.js');
const fails = [], info = { themes: {}, bosses: {}, tracks: {} };
g.loop.stop();
d.setAutopilot(false);
const NEW = ['forge', 'forgeNight', 'frost', 'frostDusk', 'candy', 'candyDusk', 'citadel', 'citadelNight'];
const worldOfTheme = (t) => WORLDS.find((w) => w.themes.includes(t));
const frames = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.sync(1 / 60); g.engine.render(); } };
const mix = { grunt: 0.35, runner: 0.2, tank: 0.1, shield: 0.15, bomber: 0.2 };
const hex = (c) => '#' + c.getHexString();
if (g.audio && !g.audio.music) g.audio.unlock();

// ---- themes x quality ----
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  for (const id of NEW) {
    const w = worldOfTheme(id);
    d.startCustom({ theme: id, world: w.id, length: 400, speed: 9, events: [horde(46, 46, mix, 'both', { hpMul: 40 })] });
    d.give('troops', 24);
    d.simulate(1.6);
    frames(3);
    const W = g.world, t = THEMES[id];
    const row = { theme: W.theme.id, skin: g.horde.view.skin, weather: W.weather.mesh.visible ? W.weather.mesh.geometry.drawRange.count : 0,
      trim: hex(W.trimMat.color), fog: hex(g.scene.fog.color), calls: g.engine.renderer.info.render.calls };
    info.themes[`${id}/${q}`] = row;
    if (W.theme.id !== id) fails.push(`${id}/${q}: world theme is ${W.theme.id}`);
    if (g.run.world !== w.key) fails.push(`${id}/${q}: run.world ${g.run.world} != ${w.key}`);
    if (g.horde.view.skin !== w.key) fails.push(`${id}/${q}: enemy skin ${g.horde.view.skin}`);
    if (row.trim !== t.road.trim) fails.push(`${id}/${q}: trim ${row.trim} != ${t.road.trim}`);
    if (t.weather && !row.weather) fails.push(`${id}/${q}: weather not drawn`);
    if (q === 'low' && t.weather && row.weather > t.weather.count * 0.5) fails.push(`${id}/low: ${row.weather} weather points`);
    if (g.audio && g.audio.music && g.audio.music.want !== w.music) fails.push(`${id}/${q}: music wants ${g.audio.music.want}, not ${w.music}`);
    if (!(g.horde.list.length > 0)) fails.push(`${id}/${q}: no enemies spawned`);
    if (q === 'high' && (id === w.themes[0] || id === 'forgeNight' || id === 'citadelNight')) { d.simulate(1.2); frames(2); await shot(`run-${id}`); }
  }
  if (q === 'low') await shot('run-citadelNight-low');
}
g.applyQuality('high');

// ---- back to a sky theme: everything restored ----
d.startCustom({ theme: 'noon', length: 300, events: [horde(46, 20, mix)] });
d.simulate(1); frames(2);
{
  const W = g.world;
  if (W.weather.mesh.visible) fails.push('noon: weather still visible');
  if (hex(W.trimMat.emissive) !== THEMES.noon.road.trimGlow) fails.push(`noon: trim glow ${hex(W.trimMat.emissive)}`);
  if (g.horde.view.skin !== 'sky') fails.push(`noon: enemy skin ${g.horde.view.skin}`);
  // sky skin = the original geometry colours, byte for byte
  ENEMY_TYPES.forEach((t, i) => {
    const a = g.horde.view.meshes[i].mesh.geometry.attributes.color.array, b = buildMurklingGeometry(t).attributes.color.array;
    if (a.length !== b.length || a.some((v, k) => Math.abs(v - b[k]) > 1e-6)) fails.push(`sky skin ${t}: colours not restored`);
  });
  if (g.audio && g.audio.music && g.audio.music.want !== 'run') fails.push(`noon: music wants ${g.audio.music.want}`);
}
// endless / practice stay on the sky look
d.startEndless(5); if (g.run.world !== 'sky' || g.horde.view.skin !== 'sky') fails.push(`endless world ${g.run.world}`);
d.startPractice({}); if (g.run.world !== 'sky') fails.push(`practice world ${g.run.world}`);

// ---- skins keep types readable: runner orange-ish, bomber red-ish ----
const { MURKLING_SKINS } = await import('/src/models/murklings.js');
const Color = g.scene.fog.color.constructor; // THREE.Color without a bare 'three' import
const hue = (c) => { const o = {}; new Color(c).getHSL(o, 'srgb'); return o; };
for (const [k, s] of Object.entries(MURKLING_SKINS)) {
  const r = hue(s.runner.body), b = hue(s.bomber.body);
  if (!(r.h > 0.04 && r.h < 0.12)) fails.push(`${k}: runner body hue ${r.h.toFixed(3)} not orange`);
  if (!(b.h < 0.03 || b.h > 0.95)) fails.push(`${k}: bomber body hue ${b.h.toFixed(3)} not red`);
}

// ---- boss skins ----
const BOSSES = [
  ['grawlstone', 'forge', 'forge', 'MAGMA GRAWLSTONE'], ['grawlstone', 'frost', 'frost', 'GLACIUS'], ['grawlstone', 'candy', 'candy', 'GUMDROP GOLIATH'],
  ['ironhorn', 'frost', 'frostDusk', 'FROSTHORN'], ['mothermurk', 'candy', 'candyDusk', 'CANDY QUEEN'], ['oculon', 'citadel', 'citadel', 'OCULON'],
  ['glacius', null, 'frost', 'GLACIUS'], ['gumdrop', null, 'candy', 'GUMDROP GOLIATH'], ['grawlstone', null, 'noon', 'GRAWLSTONE'],
];
const colourSum = (root) => { let s = 0; root.traverse((o) => { const c = o.isMesh && o.material && o.material.vertexColors && o.geometry.attributes.color; if (c) for (let i = 0; i < c.array.length; i += 97) s += c.array[i]; }); return Math.round(s * 1000) / 1000; };
const origSum = {};
for (const [type, skin, theme, name] of BOSSES) {
  g.beginRun({ id: 98, name: 'Boss Look', theme, length: 14, speed: 9, stars: [10, 25], reward: 0, boss: { type, hp: 99999, tier: 1, skin }, events: [] }, 'test', 1, { hero: g.loadout.hero, weapon: g.loadout.weapon });
  d.give('troops', 30);
  d.simulate(3.2); frames(4);
  const b = g.boss;
  const bar = document.querySelector('.boss-bar .boss-name .n');
  const sum = b ? colourSum(b.root) : 0;
  info.bosses[`${type}:${skin}`] = { name: b && b.name, subtitle: b && b.subtitle, bar: bar && bar.textContent, sum, state: b && b.state };
  if (!b) { fails.push(`${type}:${skin}: no boss`); continue; }
  if (b.name !== name) fails.push(`${type}:${skin}: name ${b.name} != ${name}`);
  if (!bar || bar.textContent !== name) fails.push(`${type}:${skin}: HP bar shows ${bar && bar.textContent}`);
  if (!skin && type === 'grawlstone') origSum[type] = sum;
  if (window.__shot && (skin || type === 'glacius' || type === 'gumdrop')) {
    await new Promise((r) => setTimeout(r, 1500)); // the boss card hides first
    d.simulate(0.8); frames(2);
    await shot(`boss-${type}-${skin || 'standin'}`);
  }
}
// unskinned Grawlstone after skinned fights has its original colours back (cached model restored)
g.bosses.clear();
{
  const { buildGrawlstone } = await import('/src/models/bosses/grawlstone.js');
  const fresh = colourSum(buildGrawlstone().root);
  if (Math.abs(fresh - origSum.grawlstone) > 1e-3) fails.push(`grawlstone colours not restored: ${origSum.grawlstone} vs fresh ${fresh}`);
}

// ---- tracks: every world track renders sound offline ----
for (const w of WORLDS) {
  const name = runTrackFor(w.key);
  if (name !== w.music) fails.push(`${w.key}: runTrackFor -> ${name}`);
  if (!TRACKS[name]) { fails.push(`no track ${name}`); continue; }
  const sr = 22050, len = 3;
  const oc = new OfflineAudioContext(2, sr * len, sr);
  const m = new Music(oc, oc.destination);
  m.play(name, { fade: 0.01 });
  m.scheduleUntil(len);
  const buf = await oc.startRendering();
  const ch = buf.getChannelData(0);
  let e = 0, bad = 0;
  for (let i = 0; i < ch.length; i++) { if (!Number.isFinite(ch[i])) bad++; else e += ch[i] * ch[i]; }
  const rms = Math.sqrt(e / ch.length);
  info.tracks[name] = Math.round(rms * 1000) / 1000;
  if (bad || !(rms > 0.005)) fails.push(`${name}: rms ${rms} (${bad} bad samples)`);
}

// ---- finish arch: level 1 copy without its boss ----
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  const def = { ...getLevel(1), id: 1, boss: null, finish: true };
  g.beginRun(def, 'level', 1, { hero: g.loadout.hero, weapon: g.loadout.weapon });
  const F = g.finish;
  if (!F.active || !F.group.visible) fails.push(`finish/${q}: arch hidden`);
  if (Math.abs(F.group.position.z + def.length) > 0.01) fails.push(`finish/${q}: arch at ${F.group.position.z}, not ${-def.length}`);
  F.group.traverse((o) => { if (o.isMesh && o.castShadow) fails.push(`finish/${q}: arch casts shadows`); });
  // run up to just before the arch
  g.squad.leader.z = -(def.length - 16);
  for (const m of g.squad.members) m.z = g.squad.leader.z + 1;
  for (const s of ['gates', 'horde', 'barrels', 'obstacles', 'pickups', 'crates']) if (g[s] && g[s].skipAll) g[s].skipAll();
  g.snapCamera();
  frames(2);
  info['bar' + q] = [document.querySelector('.boss-bar').className, g.state, g.run.phase, String(!!g.boss)].join(' ');
  if (q === 'high' && window.__shot) { await new Promise((r) => setTimeout(r, 2300)); await shot('finish-arch'); }
  const p0 = g.fx ? g.fx.P.n : 0;
  let won = false;
  const off = g.events.on('run:win', () => { won = true; });
  for (let i = 0; i < 60 * 3 && !won; i++) { g.step(1 / 60); g.sync(1 / 60); }
  off && off();
  frames(8);
  if (!won) fails.push(`finish/${q}: crossing the arch did not win`);
  if (g.fx && !(g.fx.P.n > p0)) fails.push(`finish/${q}: no sparkles at the arch`);
  if (q === 'high') await shot('finish-crossed');
}
g.applyQuality('high');
// a boss level never shows the arch
d.startLevel(10); if (g.finish.group.visible) fails.push('boss level shows the finish arch');

// ---- world intro banner ----
const wb = () => document.querySelector('.world-banner');
for (const id of [1, 12]) {
  d.startLevel(id);
  const el = wb(), w = WORLDS[id > 10 ? 1 : 0];
  const txt = el ? el.textContent : '';
  info['banner' + id] = txt;
  if (!el || el.classList.contains('hidden')) fails.push(`L${id}: no world banner`);
  else if (!txt.includes(`WORLD ${w.id} · ${w.name}`) || !txt.includes(g.run.name)) fails.push(`L${id}: banner "${txt}"`);
  if (id === 12) { g.loop.start ? g.loop.start() : 0; await new Promise((r) => setTimeout(r, 450)); g.loop.stop(); await shot('banner-L12'); }
}
d.startCustom({}); if (!wb().classList.contains('hidden')) fails.push('custom run shows the world banner');
await new Promise((r) => setTimeout(r, 2200));
d.startLevel(1);
await new Promise((r) => setTimeout(r, 2300));
if (!wb().classList.contains('hidden')) fails.push('world banner still up after 2.3 s');

d.toTitle();
g.loop.start && g.loop.start();
return { pass: fails.length === 0, fails, info };
