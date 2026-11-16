// @smoke --seconds 0 --shots 0
// Update 3 stage 2 "bosses-new": GLACIUS (L30) and GUMDROP GOLIATH (L35) are real boss classes (no Grawlstone
// stand-ins): data + matchups + level cfgs resolve to them with their own colours, every attack telegraphs,
// lands and resolves on High and Low (freeze lane: slow breaks + Pip cannot walk back in; ice wall: soaks
// bullets, shot apart; icicles; pound; bounce returns home; split spawns gummies; spit leaves a slowing
// syrup puddle), danger zones for the autopilot, phase 2, death -> win, cached models reused, Low drops the
// extra sprites / spikes, the new sounds render, and the HUD progress bar ends in a flag on boss-less levels.
const g = window.__game, d = g.debug;
g.loop.stop();
d.setAutopilot(false);
const B = await import('/src/data/bosses.js');
const M = await import('/src/data/matchups.js');
const L = await import('/src/data/levels.js');
const { BOSS_CLASSES } = await import('/src/game/bosses/index.js');
const { SFX } = await import('/src/audio/sfxdefs.js');
const { NEW_BOSS_ATTACK_SFX } = await import('/src/audio/sfxbossnew.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const frames = (n) => { for (let i = 0; i < n; i++) { g.step(1 / 60); g.sync(1 / 60); } };
const until = (fn, max = 900) => { let i = 0; for (; i < max && !fn(); i++) frames(1); return i < max; };
const attacks = [];
const off = g.events.on('boss:attack', (p) => attacks.push(p.attack));

// ---------------- data ----------------
ok(!('BOSS_STANDINS' in B), 'BOSS_STANDINS still exported');
for (const [type, skin, name] of [['glacius', 'frost', 'GLACIUS'], ['gumdrop', 'candy', 'GUMDROP GOLIATH']]) {
  const look = B.bossLook({ type, skin });
  ok(look.type === type && look.skin === null && look.name === name, `bossLook ${type}/${skin}: ${JSON.stringify(look)}`);
  ok(B.bossLook({ type, skin: 'citadel' }).skin === 'citadel', `${type}: a foreign skin still recolours`);
  ok(!!BOSS_CLASSES[type], `${type}: no class registered`);
  for (const el of M.ELEMENTS) ok(typeof M.BOSS_MUL[el][type] === 'number', `BOSS_MUL ${el}.${type} missing`);
  for (const a of B.BOSSES[type].attacks) ok(a.telegraph == null || a.telegraph >= 0.9, `${type}.${a.id} telegraph < 0.9`);
}
ok(L.getLevel(30).boss.type === 'glacius' && L.getLevel(35).boss.type === 'gumdrop', 'L30 / L35 boss types');
for (const k of Object.values(NEW_BOSS_ATTACK_SFX)) ok(!!SFX[k], `sfx ${k} missing`);

// ---------------- sounds render ----------------
{
  const sr = 22050, oc = new OfflineAudioContext(1, sr * 1.2, sr);
  for (const k of new Set(Object.values(NEW_BOSS_ATTACK_SFX))) SFX[k].fn(oc, oc.destination, 0.01, 1, {});
  const buf = await oc.startRendering();
  let peak = 0; for (const v of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
  info.sfxPeak = Math.round(peak * 1000) / 1000;
  ok(peak > 0.01, 'new boss sounds are silent');
}

// ---------------- fights ----------------
const spec = (b, id) => b.def.attacks.find((a) => a.id === id);
const force = (b, id) => { b.cooldown = 99; b.attack = b.startAttack(id, spec(b, id)); };
const finish = (b) => { const done = until(() => !b.attack, 600); b.cooldown = 99; return done; };
const arena = (type, squad = 160) => {
  d.setLoadout('pip', 'thunderclap');
  d.bossTest(type, { squad, hp: 5e7, tier: 5, arrive: false });
  until(() => g.boss && g.boss.state === 'fight');
  const b = g.boss; b.cooldown = 99;
  return b;
};
const roots = {};
for (const q of ['high', 'low']) {
  g.applyQuality(q);
  // ---- Glacius ----
  {
    const b = arena('glacius');
    const tag = `glacius/${q}`;
    ok(b && b.constructor.name === 'Glacius', `${tag}: class ${b && b.constructor.name}`);
    ok(b.name === 'GLACIUS' && b.skin === null, `${tag}: name ${b.name} skin ${b.skin}`);
    if (roots.glacius) ok(roots.glacius === b.root, `${tag}: model not cached`); else roots.glacius = b.root;
    const fr = b.frost, Ld = g.squad.leader;
    // freeze: lane on the squad, members break slowly, Pip cannot walk back in
    attacks.length = 0;
    const tel0 = g.telegraph.active.length;
    force(b, 'freeze');
    frames(2);
    ok(g.telegraph.active.length > tel0, `${tag}: freeze has no warning`);
    until(() => fr.lanes.some((l) => l.active), 200);
    const lane = fr.lanes.find((l) => l.active);
    ok(!!lane && attacks.includes('frostlane'), `${tag}: no frozen lane`);
    if (lane) {
      ok(b.dangerZones.some((z) => z.kind === 'lane' && Math.abs(z.x0 - lane.x0) < 1e-6), `${tag}: frozen lane not a danger zone`);
      const c0 = g.squad.count;
      frames(60);
      const lost = c0 - g.squad.count;
      info[`${tag} freeze lost/1s`] = lost;
      ok(lost > 0 && lost < c0 * 0.5, `${tag}: freeze lost ${lost} of ${c0} in 1 s`);
      ok(q === 'high' ? lane.spikes.count > 0 : lane.spikes.count === 0, `${tag}: lane spikes ${lane.spikes.count}`);
      // walk back in: blocked at the edge
      b.prevLX = lane.x0 - 1; Ld.x = (lane.x0 + lane.x1) / 2;
      b.update(0);
      ok(Ld.x <= lane.x0 - 0.1, `${tag}: Pip walked into the frozen lane (x ${Ld.x.toFixed(2)}, lane ${lane.x0.toFixed(2)})`);
    }
    finish(b); until(() => !fr.lanes.some((l) => l.active), 400);
    // ice wall: lands in front, soaks bullets, shot apart
    force(b, 'icewall');
    until(() => fr.walls.some((w) => w.active), 200);
    const wall = fr.walls.find((w) => w.active);
    ok(!!wall && attacks.includes('icewall'), `${tag}: no ice wall`);
    if (wall) {
      Ld.x = wall.x; // stand behind it
      frames(40);
      ok(wall.hp < wall.maxHp, `${tag}: wall took no bullets (${wall.hp}/${wall.maxHp})`);
      ok(b.dangerZones.some((z) => z.kind === 'lane' && Math.abs((z.x0 + z.x1) / 2 - wall.x) < 1e-6), `${tag}: wall shadow not a danger zone`);
      // the wall blocks the squad: Pip cannot walk into its lane from outside, but can slide out from behind it
      b.prevLX = wall.x - wall.hw - 0.6; Ld.x = wall.x;
      b.update(0);
      ok(Math.abs(Ld.x - (wall.x - wall.hw)) < 1e-6, `${tag}: Pip walked into the wall's lane (x ${Ld.x.toFixed(2)}, wall ${wall.x.toFixed(2)})`);
      b.prevLX = wall.x + wall.hw + 0.6; Ld.x = wall.x - wall.hw - 1;
      b.update(0);
      ok(Math.abs(Ld.x - (wall.x + wall.hw)) < 1e-6, `${tag}: Pip walked through the wall (x ${Ld.x.toFixed(2)})`);
      b.prevLX = wall.x; Ld.x = wall.x + wall.hw + 0.5;
      b.update(0);
      ok(Math.abs(Ld.x - (wall.x + wall.hw + 0.5)) < 1e-6, `${tag}: Pip cannot leave from behind the wall`);
      // after its first few seconds the wall only soaks bullets
      const t0 = wall.t; wall.t = wall.block + 0.05;
      b.prevLX = wall.x - wall.hw - 0.6; Ld.x = wall.x;
      b.update(0);
      ok(Math.abs(Ld.x - wall.x) < 1e-6, `${tag}: wall still blocks after ${wall.block} s`);
      wall.t = t0;
      Ld.x = wall.x; b.prevLX = wall.x;
      wall.hp = Math.min(wall.hp, 1);
      until(() => wall.end >= 0, 120);
      ok(wall.broken && attacks.includes('iceBreak'), `${tag}: wall not shot apart`);
    }
    finish(b);
    // icicles + pound: kill a squad that stands still
    for (const id of ['icicles', 'pound']) {
      const c0 = g.squad.count;
      force(b, id);
      ok(finish(b), `${tag}: ${id} never finished`);
      ok(attacks.includes(id === 'icicles' ? 'icicle' : 'pound'), `${tag}: ${id} never landed`);
      info[`${tag} ${id} lost`] = c0 - g.squad.count;
      ok(c0 - g.squad.count > 0, `${tag}: ${id} hit nobody standing still`);
      g.squad.add(Math.max(0, 160 - g.squad.count), 'barrel');
      frames(30);
    }
    ok(b.lockX === null, `${tag}: lockX left at ${b.lockX}`);
    // phase 2: queues the shared safe-spot step once (here when BaseBoss has no safe-spot scheduler, else in
    // BaseBoss: never both), more lanes
    b.damage(b.hp - b.maxHp * 0.45);
    const own = b.safeAuto === undefined;
    ok(b.phase === 2 && b.safePending === own && (own || b.safeQueued), `${tag}: phase ${b.phase}, safePending ${b.safePending}, safeQueued ${b.safeQueued}`);
    force(b, 'freeze'); finish(b);
    ok(!b.safePending, `${tag}: safe-spot step not consumed`);
    force(b, 'freeze'); until(() => fr.lanes.filter((l) => l.active).length >= 2, 200);
    ok(fr.lanes.filter((l) => l.active).length >= 2, `${tag}: phase 2 freeze has < 2 lanes`);
    finish(b);
    ok(b.model.aura.visible === (q === 'high'), `${tag}: aura visible ${b.model.aura.visible}`);
    // death -> win
    b.kill();
    until(() => g.state !== 'playing', 300);
    ok(!!(g.lastResult && g.lastResult.win), `${tag}: no win after the kill`);
    ok(!fr.lanes.some((l) => l.active) && !fr.walls.some((w) => w.active), `${tag}: props left after death`);
  }
  // ---- Gumdrop Goliath ----
  {
    const b = arena('gumdrop');
    const tag = `gumdrop/${q}`;
    ok(b && b.constructor.name === 'GumdropGoliath', `${tag}: class ${b && b.constructor.name}`);
    ok(b.name === 'GUMDROP GOLIATH' && b.skin === null, `${tag}: name ${b.name} skin ${b.skin}`);
    if (roots.gumdrop) ok(roots.gumdrop === b.root, `${tag}: model not cached`); else roots.gumdrop = b.root;
    attacks.length = 0;
    // bounce: lands on the squad, crushes the circle, hops home
    const c0 = g.squad.count;
    force(b, 'bounce');
    let maxY = 0, minZ = 0;
    for (let i = 0; i < 400 && b.attack; i++) { frames(1); maxY = Math.max(maxY, b.y); minZ = Math.max(minZ, b.z - b.homeZ); }
    b.cooldown = 99;
    ok(attacks.includes('bounce') && attacks.includes('gumjump'), `${tag}: bounce events ${attacks.join(',')}`);
    ok(maxY > 3 && minZ > 10, `${tag}: no hop (max y ${maxY.toFixed(1)}, travel ${minZ.toFixed(1)})`);
    ok(Math.abs(b.z - b.homeZ) < 1e-6 && b.y === 0 && !b.hop, `${tag}: not home after the bounce (z ${b.z - b.homeZ}, y ${b.y})`);
    info[`${tag} bounce lost`] = c0 - g.squad.count;
    ok(c0 - g.squad.count > 0, `${tag}: bounce hit nobody standing still`);
    frames(20);
    ok(b.lockX === null, `${tag}: lockX left at ${b.lockX}`);
    // split: a wave of gummies
    const e0 = g.horde.list.length;
    force(b, 'split');
    until(() => attacks.includes('summon'), 200);
    ok(g.horde.list.length > e0 + 5, `${tag}: split spawned ${g.horde.list.length - e0}`);
    finish(b);
    g.horde.skipAll && g.horde.skipAll();
    // spit: syrup puddle that slows Pip and is a danger zone
    g.squad.add(Math.max(0, 160 - g.squad.count), 'barrel');
    force(b, 'spit');
    until(() => b.syrup.some((s) => s.active && s.t > 0.3) && !g.telegraph.active.some((h) => !h.done), 300);
    const s = b.syrup.find((o) => o.active);
    ok(!!s && attacks.includes('spit'), `${tag}: no syrup puddle`);
    if (s) {
      ok(b.slowAt(s.x, s.z) < 1 && b.slowAt(s.x + s.r * 3, s.z) === 1, `${tag}: slowAt wrong`);
      ok(b.dangerZones.some((z) => z.kind === 'circle' && z.x === s.x && z.soft), `${tag}: puddle not a soft danger zone`);
      ok(s.mesh.material.map !== s.gooMap && b.effects.puddles.includes(s), `${tag}: puddle is not a strawberry BossEffects puddle`);
      // a lethal warning is up: the slow-only puddle steps back so the bot dodges the warning first
      const h = g.telegraph.circle(s.x + 3, s.z, 1.2, 1.0, { attack: 'test' });
      b.update(0);
      ok(!b.dangerZones.some((z) => z.x === s.x), `${tag}: puddle still a danger zone under a lethal warning`);
      g.telegraph.cancel(h);
      b.update(0);
    }
    finish(b);
    b.damage(b.hp - b.maxHp * 0.45);
    ok(b.phase === 2, `${tag}: no phase 2`);
    g.squad.add(Math.max(0, 160 - g.squad.count), 'barrel');
    force(b, 'bounce'); ok(finish(b), `${tag}: phase 2 bounce never finished`);
    ok(b.model.glints.visible === (q === 'high'), `${tag}: glints visible ${b.model.glints.visible}`);
    g.squad.add(Math.max(0, 60 - g.squad.count), 'barrel');
    // killed mid-hop: drops to the road over a few frames (no one-frame snap), then melts
    force(b, 'bounce');
    until(() => b.y > 3, 300);
    const y0 = b.y;
    b.kill();
    frames(1);
    info[`${tag} mid-hop death y`] = Math.round(y0 * 10) / 10 + '->' + Math.round(b.y * 10) / 10;
    ok(y0 > 3 && b.y > 0.5, `${tag}: snapped to the ground when killed mid-hop (y ${y0.toFixed(1)} -> ${b.y.toFixed(1)})`);
    until(() => b.y === 0, 400);
    ok(b.y === 0 && b.state === 'dying', `${tag}: never landed after the mid-hop death (y ${b.y}, ${b.state})`);
    until(() => g.state !== 'playing', 300);
    ok(!!(g.lastResult && g.lastResult.win), `${tag}: no win after the kill (${JSON.stringify(g.lastResult)})`);
  }
}
g.applyQuality('high');
off();

// ---------------- level cfgs spawn the real classes ----------------
for (const id of [30, 35]) {
  d.startLevel(id); d.skipToBoss();
  until(() => g.boss && g.boss.state === 'fight', 900);
  const b = g.boss;
  ok(!!b && b.type === L.getLevel(id).boss.type && b.skin === null, `L${id}: boss ${b && b.type} skin ${b && b.skin}`);
  const bar = document.querySelector('.boss-bar .boss-name .n');
  ok(!!bar && bar.textContent === B.BOSSES[L.getLevel(id).boss.type].name, `L${id}: HP bar ${bar && bar.textContent}`);
  ok(document.querySelector('.hud-boss-ico').dataset.end === 'skull', `L${id}: end icon not a skull`);
}

// ---------------- HUD end icon: flag on a boss-less finish level ----------------
d.startLevel(31);
{
  const ico = document.querySelector('.hud-boss-ico');
  ok(!!L.getLevel(31).finish && ico.dataset.end === 'flag' && ico.classList.contains('finish'), `L31 end icon ${ico.dataset.end}`);
}
d.startEndless(3);
ok(document.querySelector('.hud-boss-ico').dataset.end === 'skull', 'endless end icon not a skull');
d.toTitle();
return { pass: fails.length === 0, fails, info };
