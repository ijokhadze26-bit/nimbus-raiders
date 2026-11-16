// SPEC2 §9 heroes-abilities: each ability's measurable effect, the shared budget and boss caps, recharge within
// cd +- 0.1 s, the bot using every ability on a real level, and every ability effect spawning >= 1 particle or
// mesh on Low quality.
const g = window.__game, d = g.debug;
g.loop.stop();
const { horde } = await import('/src/data/levels.js');
const { heroDef } = await import('/src/data/heroes.js');
const { MKREF } = await import('/src/data/weapons.js');
const { vsMul } = await import('/src/data/matchups.js');
const { ENEMY_TYPES } = await import('/src/data/enemies.js');
const fails = [], info = {};
const FAV = { pip: 'thunderclap', cinder: 'emberstorm', rime: 'glacier', bonbon: 'sugarrush', bolt: 'gearworks', vex: 'voidsiphon' };
const alive = () => g.horde.list.filter((e) => e.state === 0);
const ready = () => { const a = g.heroes.ability; a.ready = true; a.left = 0; };
const steps = (sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { g.step(1 / 60); g.sync(1 / 60); } };
/** Custom run with a still horde (no shooting, enemies slowed to 0 so positions stay put). */
function setup(hero, events, { squad = 50, mk = 3, still = true } = {}) {
  d.setAutopilot(false);
  d.setLoadout(hero, FAV[hero]);
  d.startCustom({ length: 2000, events });
  g.weapons.enabled = false;
  d.setMk(mk);
  if (squad > g.squad.count) d.give('troops', squad - g.squad.count);
  d.simulate(0.05);
  if (still) for (const e of alive()) { e.charging = false; g.status.slow(e, 1, 60); }
  g.heroes.guard = 0;
  ready();
}
const place = (es, fn) => { const L = g.squad.leader; es.forEach((e, i) => { const p = fn(i); e.x = p[0]; e.z = L.z - p[1]; }); };

// ---------------- Rally Call ----------------
setup('pip', [], { squad: 50 });
let c0 = g.squad.count;
if (!d.useAbility()) fails.push('rally: not used');
const ra = heroDef('pip').ability;
const want = Math.max(ra.min, Math.min(ra.max, Math.round(ra.frac * c0)));
if (g.squad.count - c0 !== want) fails.push(`rally added ${g.squad.count - c0}, want ${want}`);
info.rally = { from: c0, added: g.squad.count - c0 };

// ---------------- Meteor Drop ----------------
setup('cinder', [horde(30, 24, { grunt: 1 }, 'both', { hpMul: 1 })], { squad: 50 });
let es = alive().slice(0, 24);
if (!d.useAbility()) fails.push('meteor: not used');
let m = g.heroes.abilities.meteor.pending[0];
// 12 inside r <= 4, 12 on a ring at r = 8 (in front of and behind the target, inside the road)
place(es, (i) => {
  if (i < 12) { const a = i / 12 * Math.PI * 2, r = 1 + (i % 4); return [m.x * 0.5 + Math.cos(a) * r * 0.5, g.squad.leader.z - m.z - Math.sin(a) * r * 0.8]; }
  const a = -0.4 + ((i - 12) % 6) * 0.16, s = i < 18 ? 1 : -1;
  return [m.x + 8 * Math.sin(a), g.squad.leader.z - m.z + s * 8 * Math.cos(a)];
});
const inside = es.filter((e) => Math.hypot(e.x - m.x, e.z - m.z) <= 5), outside = es.filter((e) => Math.hypot(e.x - m.x, e.z - m.z) >= 7.5);
let tg = 0;
for (let i = 0; i < 50; i++) { g.step(1 / 60); tg = Math.max(tg, g.telegraph.active.length); }
const killedIn = inside.filter((e) => e.state !== 0).length, killedOut = outside.filter((e) => e.state !== 0).length;
if (!inside.length || killedIn !== inside.length) fails.push(`meteor: killed ${killedIn}/${inside.length} inside r 5`);
if (killedOut) fails.push(`meteor: killed ${killedOut} at r 8`);
if (tg) fails.push('meteor ring went into game.telegraph');
info.meteor = { inside: inside.length, outside: outside.length, killedIn, killedOut, last: g.heroes.abilities.meteor.last };
// budget: tough enemies all inside, the hp they lose (divided by their matchup) <= the budget
setup('cinder', [horde(30, 20, { grunt: 1 }, 'both', { hpMul: 5000 })], { squad: 60, mk: 3 });
es = alive();
d.useAbility();
m = g.heroes.abilities.meteor.pending[0];
place(es, (i) => [m.x + ((i % 5) - 2) * 0.6, g.squad.leader.z - m.z + Math.floor(i / 5) * 0.8 - 1.2]);
const hp0 = es.map((e) => e.hp);
steps(0.5); g.heroes.abilities.meteor.update(1, g);   // land exactly once
let lost = 0;
es.forEach((e, i) => { lost += (hp0[i] - e.hp) / vsMul('emberstorm', ENEMY_TYPES[e.type]); });
const budget = 1.5 * 60 * MKREF[3] * g.weapons.dmgMul * 1.25;
if (lost > budget * 1.001 + 1e-6) fails.push(`meteor dealt ${lost.toFixed(1)} > budget ${budget.toFixed(1)}`);
if (lost < budget * 0.95) fails.push(`meteor dealt only ${lost.toFixed(1)} of ${budget.toFixed(1)}`);
info.meteorBudget = { lost: Math.round(lost), budget: Math.round(budget) };
// boss cap 6%
d.setAutopilot(false); d.setLoadout('cinder', 'emberstorm');
// weapons off before anything fires (final weapons leave flames, burn pools and holes that would kill the boss)
d.bossTest('grawlstone', { hero: 'cinder', weapon: 'emberstorm', mk: 5, squad: 900, arrive: false });
g.weapons.enabled = false;
d.simulate(1.6 + 2.5);
let bhp = g.boss.hp; ready();
d.useAbility(); d.simulate(1.0);
let bl = (bhp - g.boss.hp) / g.boss.maxHp;
if (!(bl > 0) || bl > 0.06 + 1e-9) fails.push(`meteor boss loss ${bl}`);
info.meteorBoss = Math.round(bl * 1000) / 1000;
// the bot does not steer away from the meteor ring
d.setLoadout('cinder', 'emberstorm');
d.startCustom({ length: 2000, events: [] });
d.setAutopilot('pro', 1);
d.simulate(1); ready();
const x0 = g.squad.leader.x;
d.useAbility(); d.simulate(0.65);
if (Math.abs(g.squad.leader.x - x0) > 0.3) fails.push(`bot steered ${(g.squad.leader.x - x0).toFixed(2)} away from the meteor`);
d.setAutopilot(false);

// ---------------- Whiteout ----------------
setup('rime', [horde(30, 30, { grunt: 1 }, 'both', { hpMul: 50 })], { still: false });
d.simulate(0.3); ready();
d.useAbility();
const L = g.squad.leader;
const onScreen = alive().filter((e) => L.z - e.z <= 75 && L.z - e.z >= -8);
const bad = onScreen.filter((e) => !(e.freezeT > 0) || e.shatter !== 0);
if (!onScreen.length || bad.length) fails.push(`whiteout: ${bad.length}/${onScreen.length} not frozen (or shatter)`);
// touching a Whiteout-frozen grunt costs one raider (Guard 0)
g.heroes.guard = 0; c0 = g.squad.count;
const fe = onScreen[0]; fe.x = L.x; fe.z = L.z - 0.2;
g.step(1 / 60); g.step(1 / 60);
if (g.squad.count !== c0 - 1) fails.push(`whiteout touch cost ${c0 - g.squad.count} raiders`);
info.whiteout = { frozen: onScreen.length };
d.bossTest('oculon', { hero: 'rime', weapon: 'glacier', mk: 3, squad: 60 });
g.weapons.enabled = false; d.simulate(2.5); ready(); d.useAbility();
if (!(g.boss.frozenT > 3.9)) fails.push('whiteout boss frozenT ' + g.boss.frozenT);

// ---------------- Sugar Shield ----------------
setup('bonbon', [horde(30, 60, { grunt: 1 }, 'both', { hpMul: 50 })], { squad: 60, still: false });
c0 = g.squad.count;
d.useAbility();
d.simulate(4.5);
const left60 = alive().filter((e) => e.z < g.squad.leader.z + 3).length;
if (g.squad.count !== c0) fails.push(`sugar shield lost ${c0 - g.squad.count} raiders`);
if (g.horde.list.filter((e) => e.state === 0).length >= 60) fails.push('sugar shield: no contact happened');
info.sugar = { count: g.squad.count, from: c0, aliveAhead: left60 };

// ---------------- Deploy Fortress ----------------
setup('bolt', [horde(30, 80, { grunt: 1 }, 'both', { hpMul: 3 })], { squad: 40, still: false });
g.weapons.enabled = true;
d.useAbility();
g.weapons.enabled = false;  // weapons cease fire; road turrets keep the 'firing' flag only while weapons.enabled
const fa = heroDef('bolt').ability;
let ft = d.zones().roadTurrets.find((r) => r.kind === 'fortress');
const life = fa.life * g.heroes.turretLifeMul;
if (!ft || Math.abs(ft.life - life) > 0.05) fails.push('fortress life ' + (ft && ft.life) + ' want ' + life);
g.weapons.enabled = true;
const kA = g.run.killsBy.ability;
d.simulate(life - 0.2);
ft = d.zones().roadTurrets.find((r) => r.kind === 'fortress');
if (!ft) fails.push('fortress gone before its life');
const shots = ft ? ft.shots : 0;
d.simulate(0.4);
if (d.zones().roadTurrets.find((r) => r.kind === 'fortress')) fails.push('fortress outlived its life');
if (!(shots > 0) || !(g.run.killsBy.ability > kA)) fails.push(`fortress shots ${shots}, ability kills ${g.run.killsBy.ability - kA}`);
info.fortress = { life, shots, kills: g.run.killsBy.ability - kA };

// ---------------- Shockwave ----------------
setup('vex', [horde(30, 30, { grunt: 2, tank: 1 }, 'both', { hpMul: 50 })], { squad: 50 });
es = alive();
place(es, (i) => [((i % 6) - 2.5) * 1.4, 5 + Math.floor(i / 6) * 4]);
const z0 = es.reduce((s, e) => s + e.z, 0) / es.length;
d.useAbility();
const z1 = es.reduce((s, e) => s + e.z, 0) / es.length;
if (z0 - z1 < 6) fails.push(`shockwave pushed the mean z only ${(z0 - z1).toFixed(2)}`);
info.shockwave = { push: Math.round((z0 - z1) * 100) / 100 };
// L14 with 900 raiders: no enemy loses more than 25% of its max hp to one Shockwave
d.setLoadout('vex', 'voidsiphon');
d.startLevel(14);
g.weapons.enabled = false;
d.give('troops', 900 - g.squad.count); d.setMk(5);
for (let i = 0; i < 400 && alive().filter((e) => g.squad.leader.z - e.z < 30).length < 20; i++) g.step(1 / 60);
g.weapons.enabled = false;
const near = alive();
const before = near.map((e) => e.hp);
ready(); d.useAbility();
let worst = 0;
near.forEach((e, i) => { worst = Math.max(worst, (before[i] - Math.max(0, e.hp)) / e.maxHp); });
if (worst > 0.25 + 1e-6) fails.push(`shockwave: an enemy lost ${(worst * 100).toFixed(1)}% of its max hp`);
info.shockwave.L14 = { pushed: g.heroes.abilities.shockwave.last.pushed, worst: Math.round(worst * 1000) / 1000 };
d.bossTest('ironhorn', { hero: 'vex', weapon: 'voidsiphon', mk: 5, squad: 900, arrive: false });
g.weapons.enabled = false; d.simulate(1.6 + 2.5);
bhp = g.boss.hp; ready(); d.useAbility(); g.step(1 / 60);
bl = (bhp - g.boss.hp) / g.boss.maxHp;
if (!(bl > 0) || bl > 0.03 + 1e-9) fails.push(`shockwave boss loss ${bl}`);
info.shockwaveBoss = Math.round(bl * 1000) / 1000;

// ---------------- recharge: within cd +- 0.1 s ----------------
info.recharge = {};
for (const h of Object.keys(FAV)) {
  setup(h, [], { squad: 30 });
  d.useAbility();
  const cd = heroDef(h).ability.cd;
  d.simulate(cd - 0.1);
  const early = g.heroes.ability.ready;
  d.simulate(0.2);
  if (early || !g.heroes.ability.ready) fails.push(`${h} recharge: ready at cd-0.1 ${early}, at cd+0.1 ${g.heroes.ability.ready}`);
  info.recharge[h] = cd;
}

// ---------------- the bot uses every ability on a real level ----------------
info.bot = {};
for (const h of Object.keys(FAV)) {
  d.setLoadout(h, FAV[h]);
  d.setAutopilot('pro', 1, { ability: true, crates: 'never' });
  d.startLevel(8);
  d.simulate(150);
  info.bot[h] = { used: g.heroes.used, result: g.lastResult && g.lastResult.win };
  if (!(g.heroes.used >= 1)) fails.push(`bot never used ${h}'s ability on L8`);
}
d.setAutopilot(false);

// ---------------- Low quality: every ability shows >= 1 particle or mesh ----------------
g.applyQuality('low');
info.low = {};
for (const h of Object.keys(FAV)) {
  setup(h, [horde(30, 30, { grunt: 1 }, 'both', { hpMul: 50 })], { squad: 40 });
  g.sync(1 / 60); steps(0.1);
  const n0 = g.fx.P.n;
  d.useAbility();
  let peak = g.fx.P.n - n0, mesh = false;
  for (let i = 0; i < 60; i++) {
    g.step(1 / 60); g.sync(1 / 60);
    peak = Math.max(peak, g.fx.P.n - n0);
    const hf = g.fx.heroFx;
    if (hf.rock.visible || hf.bubble.visible || g.helpers.roadList.some((r) => r.kind === 'fortress')) mesh = true;
  }
  info.low[h] = { particles: peak, mesh };
  if (!(peak >= 1) && !mesh) fails.push(`${h}: no particle or mesh on Low`);
}
g.applyQuality('high');
d.toTitle();
return { pass: fails.length === 0, fails, info };
