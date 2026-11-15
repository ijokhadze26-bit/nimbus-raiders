// SPEC2 §9 WEAPONS / audio: every def.sfx name exists in SFX; every weapon recipe (and the Ember loop) renders
// on an OfflineAudioContext without throwing; fire sounds keep gap >= 0.06 and pri 0, hit sounds max <= 3;
// the Emberstorm roar loop starts with firing and stops on pause and on a weapon swap (spy on the engine's
// loops), restarts on resume, and stops when Ember stops firing. Specials map to the weapon's own sounds.
const g = window.__game, d = g.debug;
g.loop.stop();
const W = await import('/src/data/weapons.js');
const { SFX } = await import('/src/audio/sfxdefs.js');
const { WEAPON_SFX } = await import('/src/audio/sfxweapons.js');
const { bindWeapons } = await import('/src/audio/bindweapons.js');
const fails = [], info = {};
for (const def of W.WEAPON_DEFS) {
  for (const [k, n] of Object.entries(def.sfx)) {
    if (!SFX[n]) fails.push(`${def.id} sfx.${k} ${n} missing`);
    if (k === 'fire' && (SFX[n].gap < 0.06 || SFX[n].pri !== 0)) fails.push(`${n}: fire sound gap ${SFX[n].gap} pri ${SFX[n].pri}`);
  }
}
for (const n of ['wpn_ice_hit', 'wpn_gear_ting', 'wpn_storm_arc', 'wpn_sugar_pop']) if (!(WEAPON_SFX[n].max <= 3)) fails.push(n + ' max ' + WEAPON_SFX[n].max);
// every recipe renders offline
const ctx = new OfflineAudioContext(1, 44100, 44100);
let rendered = 0;
for (const [n, def] of Object.entries(WEAPON_SFX)) {
  try {
    const end = def.fn(ctx, ctx.destination, 0.01, 1, { mk: 3, n: 1 });
    if (!(end > 0)) fails.push(n + ' returned no end time');
    if (def.loop) { const h = def.loop(ctx, ctx.destination, 0.01, { mk: 5 }); h.stop(0.5); }
    rendered++;
  } catch (e) { fails.push(n + ' threw ' + e.message); }
}
const buf = await ctx.startRendering();
let peak = 0; const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
info.offline = { recipes: rendered, peak: Math.round(peak * 1000) / 1000 };
if (!(peak > 0.01)) fails.push('offline render is silent');
// the Ember loop with a spy audio
const loops = new Map(), played = [];
const spy = {
  sfxOn: true, ready: true,
  sfxEngine: { loops, startLoop(n, o) { loops.set(n, o); return true; }, stopLoop(n) { loops.delete(n); }, stopAllLoops() { loops.clear(); } },
  fx(n, o) { played.push(n); return true; },
};
const offs = bindWeapons(spy, g);
d.setAutopilot(false);
d.setLoadout('pip', 'emberstorm');
d.startCustom({ length: 600, speed: 9, events: [] });
d.give('troops', 10);
const steps = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.events.now = g.time; } };
steps(30);
const started = loops.has('wpn_ember_loop');
g.pause(); const afterPause = loops.has('wpn_ember_loop');
g.resume(); steps(20); const afterResume = loops.has('wpn_ember_loop');
g.weapons.setWeapon('glacier'); const afterSwap = loops.has('wpn_ember_loop');
steps(30); const glacierLoop = loops.has('wpn_ember_loop');
g.weapons.setWeapon('emberstorm'); steps(20); const back = loops.has('wpn_ember_loop');
g.weapons.enabled = false; steps(40); const afterStop = loops.has('wpn_ember_loop');
info.loop = { started, afterPause, afterResume, afterSwap, glacierLoop, back, afterStop, mk: loops.get('wpn_ember_loop') };
if (!started) fails.push('ember loop did not start with firing');
if (afterPause) fails.push('ember loop kept playing on pause');
if (!afterResume) fails.push('ember loop did not restart on resume');
if (afterSwap) fails.push('ember loop kept playing after a swap');
if (glacierLoop) fails.push('ember loop played for glacier');
if (!back) fails.push('ember loop did not restart after swapping back');
if (afterStop) fails.push('ember loop kept playing after firing stopped');
// specials -> the weapon's own sounds
played.length = 0;
const want = { ignite: 'wpn_ember_ignite', freeze: 'wpn_ice_freeze', shatter: 'wpn_ice_shatter', land: 'wpn_sugar_pop', puddle: 'wpn_sugar_goo', split: 'wpn_prism_split', bounce: 'wpn_gear_ting', chain: 'wpn_storm_arc', hole: 'wpn_void_hole', 'hole:end': 'wpn_void_pop' };
const wOf = { ignite: 'emberstorm', freeze: 'glacier', shatter: 'glacier', land: 'sugarrush', puddle: 'sugarrush', split: 'spectra', bounce: 'gearworks', chain: 'thunderclap', hole: 'voidsiphon', 'hole:end': 'voidsiphon' };
for (const k of Object.keys(want)) { g.events.now += 1; g.events.emit('weapon:special', { weapon: wOf[k], kind: k, pos: { x: 0, y: 0, z: 0 }, n: 1 }); }
g.events.emit('turret:drop', { kind: 'gearturret', pos: { x: 0, y: 0, z: 0 } }, true);
for (const [k, n] of Object.entries(want)) if (!played.includes(n)) fails.push(`special ${k} did not play ${n}`);
if (!played.includes('wpn_gear_turret')) fails.push('turret drop sound missing');
info.played = played;
for (const f of offs) f();
d.toTitle();
return { pass: fails.length === 0, fails, info };
