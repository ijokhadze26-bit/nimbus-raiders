// SPEC2 §3.8 / §9 heroes-audio: every hero def.sfx name exists in SFX with the right priority; spying on the
// audio entry points, ability:use / ability:ready / hero:guard / run start play the hero's own sounds; the six
// _ability recipes are pairwise different (and so are the other three sets).
const g = window.__game, d = g.debug;
g.loop.stop();
const { SFX } = await import('/src/audio/sfxdefs.js');
const { HERO_DEFS } = await import('/src/data/heroes.js');
const fails = [], info = {};
for (const h of HERO_DEFS) {
  for (const k of ['ability', 'ready', 'guard', 'select']) {
    const n = h.sfx[k];
    if (!n || !SFX[n]) { fails.push(`${h.id}.${k}: ${n} missing in SFX`); continue; }
    const want = k === 'ability' ? 2 : 1;
    if (SFX[n].pri !== want) fails.push(`${n} pri ${SFX[n].pri}`);
  }
}
for (const k of ['ability', 'ready', 'guard', 'select']) {
  const src = HERO_DEFS.map((h) => String(SFX[h.sfx[k]] && SFX[h.sfx[k]].fn));
  if (new Set(src).size !== src.length) fails.push(`the six _${k} recipes are not pairwise different`);
}
// recipes run on an offline context without throwing and stay within their length limits
const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
for (const h of HERO_DEFS) {
  for (const k of ['ability', 'ready', 'guard', 'select']) {
    const n = h.sfx[k];
    try {
      const end = SFX[n].fn(ctx, ctx.destination, 0, 1, {});
      const max = k === 'ability' ? 1.25 : 0.55;
      info[n] = Math.round(end * 100) / 100;
      if (!(end > 0) || end > max) fails.push(`${n} lasts ${end}`);
    } catch (e) { fails.push(`${n} threw ${e.message}`); }
  }
}
// bindings: spy on the audio entry points
const a = g.audio;
const played = [];
const spy = (name) => { const f = a[name].bind(a); a[name] = (n, o) => { played.push(n); return f(n, o); }; return f; };
const orig = { fx: spy('fx'), play: spy('play') };
const ev = g.events;
const check = (what, fn, want) => { played.length = 0; fn(); if (!played.includes(want)) fails.push(`${what} did not play ${want} (got ${played.join(',') || 'nothing'})`); };
for (const h of HERO_DEFS) {
  check(`${h.id} ability:use`, () => ev.emit('ability:use', { hero: h.id, ability: h.ability.id, pos: { x: 0, y: 1, z: 0 } }), h.sfx.ability);
  check(`${h.id} ability:ready`, () => ev.emit('ability:ready', { hero: h.id, ability: h.ability.id }), h.sfx.ready);
}
// guard + run start come from the live hero
d.setLoadout('vex', 'voidsiphon');
check('run start', () => d.startLevel(2), 'hero_vex_select');
check('vex hero:guard', () => ev.emit('hero:guard', { left: 1, max: 6, pos: { x: 0, y: 0, z: 0 } }), 'hero_vex_guard');
// a real use goes through the same binding
const ab = g.heroes.ability; ab.ready = true; ab.left = 0;
check('real Shockwave', () => d.useAbility(), 'hero_vex_ability');
a.fx = orig.fx; a.play = orig.play;
d.toTitle();
return { pass: fails.length === 0, fails, info };
