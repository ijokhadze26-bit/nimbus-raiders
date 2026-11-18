// @smoke --seconds 0 --shots 0
// Update 3 stage 4 (STAGE4 §C, builder "props"): road objects - crane, dam, bell, boulder.
// 1. plan: no objects on L1-2, 1-2 on every level from L3 (all four kinds used), each tied to a horde, never
//    within CLEAR of a gate / barrel / crate / gap / blade / hazard / power-up / coin line / other object, before
//    the final rush / arena, shootables carry hp; L3-L6 teach the kinds once each with a hint; idempotent.
// 2. each kind on a scratch level, High then Low: the squad shoots the crane hook and the crate crushes the
//    horde under its ring; shooting the dam gate floods its lane (small enemies washed away, a Bulwark shoved
//    back, the squad only nudged); the bell stuns every enemy on screen for ~1.5 s (they stand still, stars
//    show); running into the boulder rolls it through the horde (kills), passing beside it leaves it alone.
//    None of them ever costs the squad a member. Main projectiles fly past every object (tracers break them).
// 3. a real level (L6) with the pro bot: its objects spawn, get used, hints show, nothing lingers after.
// window.__shot saves pictures (shots3.mjs).
const g = window.__game, d = g.debug;
g.loop.stop();
const shot = async (name) => { if (window.__shot) { g.sync(1 / 60); g.engine.render(); await window.__shot(name); } };
const L = await import('/src/data/levels.js');
const PP = await import('/src/data/propplan.js');
const HP = await import('/src/data/hazardplan.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const steps = (n, x) => { for (let i = 0; i < n; i++) { if (x != null) g.input.setTarget(typeof x === 'function' ? x() : x); g.step(1 / 60); } };
const ps = g.props;

// ---------------- 1. plan ----------------
const used = {};
for (const lv of L.LEVELS) {
  const pr = PP.propsOf(lv);
  if (lv.id < PP.PROP_MIN_LEVEL) { ok(pr.length === 0, `L${lv.id}: ${pr.length} objects before L3`); continue; }
  ok(pr.length >= 1 && pr.length <= 2, `L${lv.id}: ${pr.length} objects`);
  const span = lv.layout ?? lv.length, rush = lv.events.find((e) => e.rush);
  for (const p of pr) {
    used[p.kind] = (used[p.kind] || 0) + 1;
    ok(PP.PROP_KINDS.includes(p.kind), `L${lv.id}: kind ${p.kind}`);
    ok(p.at < span - 30 && (!rush || p.at < rush.at), `L${lv.id}: ${p.kind}@${p.at} in the rush / arena`);
    ok(p.kind === 'boulder' || p.hp > 0, `L${lv.id}: ${p.kind} without hp`);
    ok(p.kind === 'bell' || p.lane === 'L' || p.lane === 'R', `L${lv.id}: ${p.kind} lane ${p.lane}`);
    ok(lv.events.some((h) => h.type === 'horde' && h.at - p.at > -12 && h.at - p.at < 45), `L${lv.id}: ${p.kind}@${p.at} has no horde near`);
    const [fb, fa] = PP.FOOT[p.kind];
    for (const e of lv.events) {
      if (e === p || e.type === 'horde') continue;
      const c = PP.CLEAR[e.type] || [5, 5];
      const a = e.at - c[0], b = e.at + (e.length || (e.type === 'coins' ? 12 : 0)) + c[1];
      if (p.at - fb < b && p.at + fa > a) fails.push(`L${lv.id}: ${p.kind}@${p.at} too close to ${e.type}${e.kind ? ':' + e.kind : ''}@${e.at}`);
    }
  }
  info['L' + lv.id] = pr.map((p) => p.kind.slice(0, 2)).join('');
}
for (const k of PP.PROP_KINDS) ok(used[k] >= 8, `kind ${k} used only ${used[k] || 0} times`);
for (const [k, id] of Object.entries(PP.TEACH)) ok(PP.propsOf(L.getLevel(id)).some((p) => p.kind === k && p.hint === PP.PROP_HINTS[k]), `L${id} does not teach ${k}`);
ok(L.LEVELS.reduce((n, lv) => n + PP.propsOf(lv).filter((p) => p.hint).length, 0) === 4, 'hints are not exactly one per kind');
const n36 = PP.propsOf(L.getLevel(36)).length;
ok(PP.propsOf(PP.planProps(L.getLevel(36))).length === n36, 'planProps is not idempotent');
info.used = used;

// ---------------- 2. kinds on scratch levels ----------------
d.setAutopilot(false);
d.setLoadout('pip', 'thunderclap');
const lost = {};
g.events.on('squad:change', (p) => { if (p.delta < 0) lost[p.reason] = (lost[p.reason] || 0) - p.delta; });
const clear = () => { for (const k in lost) delete lost[k]; };
const custom = (events, extra = {}) => { d.startCustom({ length: 240, speed: 10, events, ...extra }); clear(); };
const live = (kind) => ps.list.find((o) => o.ev.kind === kind);
const until = (fn, n = 900, x) => { for (let i = 0; i < n && !fn(); i++) steps(1, x); return fn(); };
// tough hordes (hpMul) so the squad's guns do not clear them before the object acts
const horde = (at, count, lane, mix = { grunt: 1 }, hpMul = 400) => ({ type: 'horde', at, count, lane, mix, hpMul });

for (const q of ['high', 'low']) {
  g.applyQuality(q);
  const tag = q === 'low' ? '-low' : '';
  const R = (info[q] = {});

  // crane: shot down, the crate lands on the horde under its ring; nobody of the squad is hurt
  custom([{ type: 'prop', kind: 'crane', at: 50, lane: 'L', hp: 9999 }, horde(64, 40, 'L')]);
  d.give('troops', 40);
  g.weapons.enabled = false;
  steps(100, -2.5);
  await shot('crane-idle' + tag);
  let o = live('crane');
  ok(o && o.state === 'hang' && o.shoot, `${q} crane: not hanging (${o && o.state})`);
  // the squad's tracers chip the hook; the drop is set off once the charge streams under the ring
  g.weapons.enabled = true;
  const hp0 = o.hp;
  const under = () => g.horde.list.filter((e) => e.state === 0 && Math.hypot(e.x - o.tx, e.z - o.z) < 2.4).length;
  until(() => under() >= 6, 400, -2.5);
  ok(o.hp < hp0 - 5, `${q} crane: tracers did not chip the hook (hp ${o.hp})`);
  ps.fire(o);
  until(() => o.state === 'drop' && o.y < 3.0, 120, -2.5);
  if (o.state === 'drop') await shot('crane-drop' + tag);
  until(() => o.state === 'landed', 120, -2.5);
  steps(6, -2.5);
  await shot('crane-land' + tag);
  R.crane = ps.stats.kills.crane || 0;
  ok(o.state === 'landed' && R.crane >= 4, `${q} crane: crate ${o.state}, crushed ${R.crane}`);
  ok(!lost.crane && !lost.prop, `${q} crane: squad lost ${JSON.stringify(lost)}`);

  custom([{ type: 'prop', kind: 'crane', at: 50, lane: 'L', hp: 25 }]);
  d.give('troops', 30);
  until(() => live('crane') && live('crane').state !== 'hang', 400, -2.5);
  ok(live('crane') && live('crane').state !== 'hang' && ps.stats.triggered.crane === 1, `${q} crane: a 25 hp hook was not shot down`);

  // main projectiles pass every object (a hook with the squad's full fire on it and no tracers stays whole)
  custom([{ type: 'prop', kind: 'crane', at: 40, lane: 'L', hp: 1 }]);
  const blocker = g.bullets.systems.find((s) => s.kind === 'prop');
  steps(5, -2.5);
  o = live('crane');
  ok(blocker && o && blocker.sweep({ bdmg: 0, nh: 0, hits: [] }, o.tx, o.z + 1, o.z - 1) === null && blocker.sweep({ bdmg: 1, nh: 0, hits: [] }, o.tx, o.z + 1, o.z - 1) === o, `${q}: prop target does not tell tracers from main shots`);

  // dam: the gate is shot open, the flood runs down its lane: grunts washed away, a Bulwark shoved back
  custom([{ type: 'prop', kind: 'dam', at: 64, lane: 'R', hp: 9999 }, horde(66, 36, 'R'), { ...horde(70, 1, 'R', { tank: 1 }) }]);
  d.give('troops', 30);
  g.weapons.enabled = false;
  steps(170, 2.5);
  if (q === 'high') await shot('dam-idle');
  o = live('dam');
  ok(o && o.state === 'shut', `${q} dam: not shut (${o && o.state})`);
  g.weapons.enabled = true;
  o.hp = 20;
  until(() => o.state !== 'shut', 600, 2.5);
  ok(o.state === 'flood', `${q} dam: not opened (${o.state}, hp ${o.hp})`);
  const tank = g.horde.list.find((e) => e.def.id === 'tank' && e.state === 0);
  const tz0 = tank ? tank.z : 0;
  let pushedBack = false;
  for (let i = 0; i < 200 && o.state === 'flood'; i++) {
    steps(1, 2.5);
    if (tank && tank.state === 0 && tank.z < tz0 - 0.5) pushedBack = true;
    if (i === 30) await shot('dam-flood' + tag);
  }
  R.dam = ps.stats.kills.dam || 0;
  ok(R.dam >= 4, `${q} dam: washed away ${R.dam}`);
  ok(!tank || pushedBack || tank.state !== 0, `${q} dam: the Bulwark was neither shoved back nor beaten`);
  ok(o.state === 'done', `${q} dam: flood never drained (${o.state})`);
  // the squad standing in the water: pushed a little toward the middle, nobody lost
  custom([{ type: 'prop', kind: 'dam', at: 30, lane: 'L', hp: 9999 }]);
  g.weapons.enabled = false;
  until(() => live('dam') && -g.squad.leader.z > 8, 300, -2.5);
  ps.fire(live('dam'));
  let push = 0;
  for (let i = 0; i < 150; i++) { steps(1, -3); push = Math.max(push, g.hazards.mods.pushX); }
  ok(push > 1 && push < 6, `${q} dam: squad push in the water ${push}`);
  ok(Object.keys(lost).length === 0, `${q} dam: squad lost ${JSON.stringify(lost)}`);

  // bell: rung, every enemy on screen stands still for ~1.5 s with stars over it
  custom([{ type: 'prop', kind: 'bell', at: 48, hp: 9999 }, horde(64, 50, 'both'), horde(92, 30, 'L')]);
  d.give('troops', 30);
  g.weapons.enabled = false;
  steps(170, 0);
  if (q === 'high') await shot('bell-idle');
  o = live('bell');
  g.weapons.enabled = true;
  o.hp = 20;
  until(() => o.state !== 'idle', 600, 0);
  ok(o.state === 'rung', `${q} bell: not rung (${o.state})`);
  const alive = g.horde.list.filter((e) => e.state === 0);
  const zs = alive.map((e) => e.z);
  g.weapons.enabled = false;
  steps(40, 0);
  await shot('bell-stun' + tag);
  g.sync(1 / 60);
  const still = alive.filter((e, i) => e.state === 0 && Math.abs(e.z - zs[i]) < 0.05).length;
  const starMesh = ps.views.bellStars;
  ok(o.stunned >= 30 && still >= alive.filter((e) => e.state === 0).length * 0.95, `${q} bell: stunned ${o.stunned}, still ${still}/${alive.length}`);
  ok(starMesh && starMesh.visible && starMesh.count > 0 && starMesh.count <= (q === 'low' ? 70 : 240), `${q} bell: stars ${starMesh && starMesh.count}`);
  steps(80, 0);
  g.sync(1 / 60);
  const moved = alive.filter((e, i) => e.state === 0 && Math.abs(e.z - zs[i]) > 0.2).length;
  ok(moved > 0 && !starMesh.visible, `${q} bell: the stun did not wear off (moved ${moved}, stars ${starMesh.visible})`);
  R.bell = o.stunned;

  // boulder: pushed from behind it rolls through the horde; passing beside it leaves it resting
  custom([{ type: 'prop', kind: 'boulder', at: 26, lane: 'L' }, horde(70, 45, 'L'), { ...horde(76, 1, 'L', { tank: 1 }) }]);
  d.give('troops', 25);
  g.weapons.enabled = false;
  steps(100, -2.5);
  if (q === 'high') await shot('boulder-idle');
  o = live('boulder');
  until(() => o.state !== 'rest', 300, -2.5);
  ok(o.state === 'roll', `${q} boulder: not pushed (${o.state})`);
  let snapped = false;
  for (let i = 0; i < 300 && o.state !== 'fall'; i++) { steps(1, -2.5); if (!snapped && o.kills > 3) { snapped = true; await shot('boulder-roll' + tag); } }
  R.boulder = o.kills;
  ok(o.kills >= 8 && o.heavy >= 1, `${q} boulder: crushed ${o.kills} (heavy ${o.heavy})`);
  ok(o.state === 'fall' || o.state === 'off', `${q} boulder: never left the road (${o.state}, travel ${Math.round(o.travel)})`);
  ok(!lost.horde || lost.horde < 10, `${q} boulder: the squad still met the horde (${lost.horde})`);
  custom([{ type: 'prop', kind: 'boulder', at: 26, lane: 'L' }]);
  steps(240, 2.5);
  ok(!live('boulder') || live('boulder').state === 'rest', `${q} boulder: rolled although nobody touched it`);
}
g.applyQuality('high');

// ---------------- 3. a real level with the bot ----------------
const hints = [];
const offHint = g.events.on('hazard:hint', (p) => hints.push(p.text));
d.setAutopilot('pro', 3, { crates: 'never', ability: true, loadout: 'keep' });
d.setUpgrades({ squad: 4, damage: 4, rate: 4, tier: 1 });
d.startLevel(6);
let s, guard = 0;
do { s = d.simulate(20); guard++; } while (s.state === 'playing' && guard < 20);
const st = d.props();
info.L6 = { win: !!(s.result && s.result.win), spawned: st.spawned, triggered: st.triggered, kills: st.kills };
ok(Object.values(st.spawned).reduce((a, b) => a + b, 0) === PP.propsOf(L.getLevel(6)).length, `L6: spawned ${JSON.stringify(st.spawned)}`);
ok(Object.values(st.triggered).reduce((a, b) => a + b, 0) >= 1, `L6: the bot used no object (${JSON.stringify(st.triggered)})`);
ok(hints.includes(PP.PROP_HINTS.dam), `L6: dam hint not shown (${hints})`);
if (typeof offHint === 'function') offHint();
d.setAutopilot(false);
d.toTitle();
ok(ps.list.length === 0 && !(ps.views.bellStars && ps.views.bellStars.visible), 'props left behind after the run');
return { pass: fails.length === 0, fails, info };
