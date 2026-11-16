// Horde behaviour (update 3, stage 3 "enemies"): the five new Murkling types and the smarter-enemy rules per
// world (data/enemies.js HORDE_AI). Called from horde.js; all state lives on the pooled enemy objects and on
// the horde (shots, pulses, fire histogram), nothing allocates per frame.
//   Boomling   kill -> SWELL state (telegraphed ring, swelling model) -> boom(): squad members + enemies in r
//   Mendling   heal pulse every `every` s (enemies within r regain pct of max hp)
//   Hive       pops small Murklings while charging, capped
//   Spitling   holds near..far u ahead of the squad and lobs goo (ground marker >= 0.9 s, kills on landing);
//              each live glob is also a game.hazards.danger circle so the autopilot sidesteps it
//   Flapling   altitude (hovers over gates / gaps / hazards), dives into the squad
//   AI         at <= 10 Hz per enemy (staggered): Dashling sprint, sidestep of incoming fire (a 10 Hz bullet
//              histogram across the road), Shieldbearer shield turning (front-only blocking, hordeops.js)
// Randomness: the horde's own seeded h.arng (never Math.random in the simulation).
import { ENEMIES, ENEMY_INDEX, ELITE, HORDE_AI } from '../data/enemies.js';
import { MEMBER_CLAMP } from '../config.js';

export const SWELL = 2;
const AI_DT = 0.1;
const BINS = 24, BIN_W = 0.5, BIN_X0 = -6;     // fire histogram across the road (x in [-6, 6])
const FIRE_BAND = 45;                         // bullets this far ahead of the leader count as incoming fire
const DASH_V = 7, DASH_T = 0.3;
const MAX_SHOTS = 24, MAX_PULSES = 16;
const GRUNT = ENEMY_INDEX.grunt;

/** Smarter-enemy rules of a run: def.ai, else the campaign world, else world 1 (none). */
export function aiFor(run) {
  if (!run) return HORDE_AI[1];
  const d = run.def || {};
  const lvl = d.ai ?? (run.mode === 'level' && d.world >= 1 ? d.world : 1);
  return HORDE_AI[Math.max(1, Math.min(5, lvl | 0))] || HORDE_AI[1];
}

export function initAi(h) {
  h.fire = new Float32Array(BINS);
  h.fireN = 0; h.fireX = 0; h.fireT = 0;
  h.shots = [];
  h.shotPool = [];
  h.pulses = [];
  h.aiStats = { dodges: 0, sprints: 0, heals: 0, healed: 0, broods: 0, spits: 0, splatKills: 0, booms: 0, boomKills: 0, dives: 0 };
}

export function resetAi(h) {
  for (const s of h.shots) h.shotPool.push(s);
  h.shots.length = 0;
  h.pulses.length = 0;
  h.fire.fill(0); h.fireN = 0; h.fireT = 0;
  for (const k in h.aiStats) h.aiStats[k] = 0;
}

/** horde.place() hook: per-type behaviour state + this run's AI flags. */
export function onPlace(h, e, elite) {
  const d = e.def, ai = h.ai, r = h.arng;
  e.elite = !!elite;
  e.size = elite ? ELITE.size : 1;
  if (elite) { e.hp *= ELITE.hp; e.maxHp = e.hp; }
  e.aiT = r.next() * AI_DT;
  e.dodge = !!(ai.dodge && (d.id === 'grunt' || d.id === 'runner') && r.next() < ai.dodge);
  e.dashT = 0; e.dashV = 0; e.dcd = 0; e.spr = 1;
  e.turn = !!(ai.turn && d.shieldHits);
  e.yaw = 0;
  e.glow = 0; e.sw = 0;
  e.y = d.fly ? d.fly.y : 0;
  e.dived = false;
  e.shots = 0; e.brood = 0;
  e.sp = d.spit ? d.spit.first : d.heal ? r.next() * d.heal.every : d.brood ? 0.4 + r.next() * 0.5 : 0;
  e.stopD = d.spit ? d.spit.near + r.next() * (d.spit.far - d.spit.near) : 0;
  e.beh = !!(d.spit || d.brood || d.fly || e.dodge || e.turn || (ai.sprint && d.id === 'runner') || (ai.gruntSprint && d.id === 'grunt'));
}

/** Once per step before the enemy loop: the 10 Hz incoming-fire histogram (only when an AI rule reads it). */
export function preStep(h, dt) {
  const ai = h.ai;
  if (!ai.dodge && !ai.turn) return;
  h.fireT -= dt;
  if (h.fireT > 0) return;
  h.fireT += AI_DT;
  const f = h.fire, L = h.game.squad.leader;
  f.fill(0);
  let n = 0, sx = 0;
  const list = h.game.bullets.active;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.vz >= 0 || b.z > L.z + 1 || b.z < L.z - FIRE_BAND) continue;
    const k = Math.floor((b.x - BIN_X0) / BIN_W);
    if (k < 0 || k >= BINS) continue;
    f[k]++; n++; sx += b.x;
  }
  h.fireN = n;
  h.fireX = n ? sx / n : h.game.squad.leader.x;
}

const fireAt = (f, k) => (k < 0 || k >= BINS ? 0 : f[k]);

/** Charging enemy with a behaviour: returns its speed factor this step (0 = it holds, z handled here). */
export function step(h, e, dt, ahead) {
  const d = e.def, ai = h.ai;
  let mul = e.spr;
  // ---- continuous parts (cheap, every step) ----
  if (e.dashT > 0) { e.dashT -= dt; if (e.dashT <= 0) e.dashV = 0; }
  if (e.dcd > 0) e.dcd -= dt;
  if (e.turn) turnShield(h, e, dt);
  if (d.fly) mul *= fly(h, e, dt, ahead);
  if (d.brood) brood(h, e, dt, ahead);
  else if (d.spit) { const m = spit(h, e, dt, ahead); if (m >= 0) mul = m; }
  // ---- decisions at <= 10 Hz, staggered by the per-enemy phase ----
  e.aiT -= dt;
  if (e.aiT <= 0) {
    e.aiT += AI_DT;
    if (ai.sprint && d.id === 'runner') sprint(h, e, ahead, ai.sprint, ai.sprintR);
    else if (ai.gruntSprint && d.id === 'grunt') sprint(h, e, ahead, ai.gruntSprint, ai.sprintR);
    if (e.dodge && e.dcd <= 0 && e.dashT <= 0 && ahead > 4 && ahead < 32 && h.fireN) sidestep(h, e);
  }
  return mul;
}

function sprint(h, e, ahead, mul, range) {
  const on = ahead < range && ahead > -1;
  if (on && e.spr === 1) h.aiStats.sprints++;
  e.spr = on ? mul : 1;
}

function sidestep(h, e) {
  const f = h.fire, k = Math.floor((e.x - BIN_X0) / BIN_W);
  if (fireAt(f, k - 1) + fireAt(f, k) + fireAt(f, k + 1) < 2) return;
  const left = fireAt(f, k - 2) + fireAt(f, k - 3) + fireAt(f, k - 4), right = fireAt(f, k + 2) + fireAt(f, k + 3) + fireAt(f, k + 4);
  let dir = left < right ? -1 : right < left ? 1 : (h.arng.next() < 0.5 ? -1 : 1);
  if (e.x > MEMBER_CLAMP - 1) dir = -1; else if (e.x < -MEMBER_CLAMP + 1) dir = 1;
  e.dashV = dir * DASH_V;
  e.dashT = DASH_T;
  e.dcd = h.ai.dodgeCd * (0.8 + 0.4 * h.arng.next());
  h.aiStats.dodges++;
}

/** Shieldbearer: turns (rate-limited) to face the densest incoming fire (or the squad when nobody shoots). */
function turnShield(h, e, dt) {
  const L = h.game.squad.leader;
  const tx = h.fireN ? h.fireX : L.x;
  const dz = Math.max(2, L.z - e.z);
  const want = Math.max(-1.25, Math.min(1.25, Math.atan2(tx - e.x, dz)));
  const max = h.ai.turn * dt;
  e.yaw += Math.max(-max, Math.min(max, want - e.yaw));
}

/** Front-only shield rule (hordeops.applyDamage): true when a hit from (sx, sz) lands on the shield face. */
export function shieldFaces(e, sx, sz) {
  const dx = sx - e.x, dz = sz - e.z, l = Math.hypot(dx, dz);
  if (l < 1e-3) return true;
  return (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / l > 0.34; // within ~70 degrees of the shield normal
}

// ---------------- Flapling ----------------
function fly(h, e, dt, ahead) {
  const F = e.def.fly;
  const diving = ahead < F.dive;
  if (diving && !e.dived) { e.dived = true; h.aiStats.dives++; if (h.game.events.wants('enemy:dive')) h.game.events.emit('enemy:dive', { x: e.x, z: e.z }); }
  const ty = diving ? 0.3 : F.y;
  e.y += (ty - e.y) * Math.min(1, dt * (diving ? 7 : 3));
  return diving ? 1.3 : 1;
}

// ---------------- Mendling ----------------
/** Heal aura (horde.js runs it for every alive Mendling, charging or not, unless the freeze power is on). */
export function heal(h, e, dt) {
  e.glow = Math.max(0, e.glow - dt * 2.2);
  e.sp -= dt;
  if (e.sp > 0) return;
  const H = e.def.heal;
  e.sp += H.every;
  const pct = H.pct * (e.elite ? 1.5 : 1);
  const fn = h._healFn || (h._healFn = (o) => {
    if (o === h._healer || o.hp >= o.maxHp) return;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * h._healPct);
    h._healN++;
  });
  h._healer = e; h._healPct = pct; h._healN = 0;
  h.forEachInRadius(e.x, e.z, H.r, fn);
  const n = h._healN;
  h._healer = null;
  e.glow = 1;
  h.aiStats.heals++; h.aiStats.healed += n;
  pulse(h, e.x, e.z, H.r, 0);
  if (h.game.events.wants('enemy:heal')) h.game.events.emit('enemy:heal', { x: e.x, z: e.z, n });
}

/** Expanding ring (kind 0 = heal) drawn by hordefx.js. */
function pulse(h, x, z, r, kind) {
  const p = h.pulses;
  if (p.length >= MAX_PULSES) p.shift();
  p.push({ x, z, r, t: 0, kind });
}

export function updatePulses(h, dt) {
  const p = h.pulses;
  for (let i = p.length - 1; i >= 0; i--) { p[i].t += dt; if (p[i].t > 0.6) p.splice(i, 1); }
}

// ---------------- Broodling Hive ----------------
function brood(h, e, dt, ahead) {
  const B = e.def.brood;
  e.glow = Math.max(0, e.glow - dt * 3);
  const cap = e.elite ? ELITE.broodCap : B.cap;
  if (e.brood >= cap || ahead > B.range || ahead < 1) return;
  e.sp -= dt;
  if (e.sp > 0.3) return;
  e.glow = Math.max(e.glow, 1 - e.sp / 0.3); // pods swell just before a pop
  if (e.sp > 0) return;
  e.sp += B.every;
  if (h.list.length >= h.maxEnemies) return;
  const r = h.arng;
  const k = ENEMY_INDEX[B.type] ?? GRUNT;
  const c = h.place(k, e.x + (r.next() - 0.5) * 0.9, e.z + e.def.r + 0.25, e.ox * 0.6, e.hpm, false);
  if (c) { c.size = B.size; c.charging = true; c.wave = null; c.wmul = 1.15; }
  e.brood++;
  e.glow = 1;
  h.aiStats.broods++;
  if (h.game.events.wants('enemy:spawn')) h.game.events.emit('enemy:spawn', { x: e.x, z: e.z });
}

// ---------------- Spitling ----------------
/** Returns -1 (move normally) or the speed factor (0 while it holds its range and spits). */
function spit(h, e, dt, ahead) {
  const S = e.def.spit, game = h.game;
  e.glow = Math.max(0, e.glow - dt * 2);
  if (e.shots >= S.shots + (h.ai.spitMul ? 1 : 0) || !game.run || game.run.phase !== 'run') return -1;
  if (ahead > e.stopD || ahead < 3) return -1;
  // hold: keep the range (it walks back as fast as the squad comes on)
  e.z += h.dLz;
  e.sp -= dt;
  if (e.sp < 0.35) e.glow = Math.max(e.glow, 1 - e.sp / 0.35);
  if (e.sp > 0) return 0;
  e.sp += S.every * (h.ai.spitMul || 1);
  e.shots++;
  lob(h, e);
  return 0;
}

function lob(h, e) {
  const S = e.def.spit, game = h.game, squad = game.squad, r = h.arng;
  if (squad.count <= 0) return;
  const ms = squad.members;
  const m = ms.length ? ms[Math.min(ms.length - 1, Math.floor(r.next() * ms.length))] : squad.leader;
  const s = h.shotPool.length ? h.shotPool.pop() : { x0: 0, z0: 0, x1: 0, z1: 0, t: 0, T: 1, r: 1, kills: 1, zone: { kind: 'circle', x: 0, z: 0, r: 1, pad: 0.35, spit: true } };
  if (h.shots.length >= MAX_SHOTS) h.shotPool.push(h.shots.shift());
  s.x0 = e.x; s.z0 = e.z + 0.5;
  s.T = Math.max(0.9, S.flight);
  s.x1 = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, m.x + (r.next() - 0.5) * 0.8));
  s.z1 = m.z - h.fwd * s.T; // where that member will be when it lands
  s.r = S.r; s.t = 0;
  s.kills = e.elite ? ELITE.spitKills : S.kills;
  s.zone.x = s.x1; s.zone.z = s.z1; s.zone.r = s.r;
  h.shots.push(s);
  h.aiStats.spits++;
  e.glow = 1;
  if (game.events.wants('enemy:spit')) game.events.emit('enemy:spit', { x: e.x, z: e.z });
}

/** After the enemy loop: globs in flight (danger zones for the autopilot), landing kills. */
export function updateShots(h, dt) {
  const shots = h.shots;
  if (!shots.length) return;
  const game = h.game, danger = game.hazards ? game.hazards.danger : null;
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    if (s.t < s.T) { if (danger) danger.push(s.zone); continue; }
    const k = squadHit(h, s.x1, s.z1, s.r, s.kills, 'spit');
    h.aiStats.splatKills += k;
    if (game.events.wants('enemy:splat')) game.events.emit('enemy:splat', { pos: { x: s.x1, y: 0.2, z: s.z1 }, kills: k });
    pulse(h, s.x1, s.z1, s.r * 1.2, 1);
    shots[i] = shots[shots.length - 1]; shots.pop();
    h.shotPool.push(s);
  }
}

// ---------------- Boomling ----------------
/** horde.kill() of a Boomling: it stops and swells (still in the list, no longer targetable / alive). */
export function startSwell(h, e) {
  e.state = SWELL;
  e.t = 0; e.sw = 0;
  e.vx = 0; e.dashV = 0;
  if (h.game.events.wants('enemy:swell')) h.game.events.emit('enemy:swell', { x: e.x, z: e.z });
}

/** SWELL step: returns true once it burst (the caller turns it into a DYING pop). */
export function swellStep(h, e, dt) {
  const B = e.def.boom;
  e.sw = Math.min(1, e.t / B.swell);
  if (e.t < B.swell) return false;
  boom(h, e);
  return true;
}

function boom(h, e) {
  const B = e.def.boom, game = h.game, r = B.r;
  h.aiStats.booms++;
  game.events.emit('enemy:explode', { pos: { x: e.x, y: 0.5, z: e.z }, radius: r });
  h.view.blast(e.x, e.z, r);
  const r2 = r * r;
  const list = h.list;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.state !== 0) continue;
    const dx = o.x - e.x, dz = o.z - e.z;
    if (dx * dx + dz * dz < r2) h.kill(o, 'blast');
  }
  if (game.run && game.run.active) h.aiStats.boomKills += squadHit(h, e.x, e.z, r, e.elite ? ELITE.boomKills : B.kills, 'bomb');
}

const PICK = [], PICKD = [];
/** Kills up to n squad members within r of (x, z), nearest first (Pip only once the formation is empty). */
export function squadHit(h, x, z, r, n, reason) {
  const game = h.game, squad = game.squad;
  if (squad.count <= 0 || (game.shielded && game.shielded())) return 0;
  const ms = squad.members, r2 = r * r;
  PICK.length = 0; PICKD.length = 0;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i], dx = m.x - x, dz = m.z - z, d2 = dx * dx + dz * dz;
    if (d2 >= r2) continue;
    if (PICK.length < n) { PICK.push(m); PICKD.push(d2); continue; }
    let w = 0; // replace the farthest kept one
    for (let k = 1; k < PICK.length; k++) if (PICKD[k] > PICKD[w]) w = k;
    if (d2 < PICKD[w]) { PICK[w] = m; PICKD[w] = d2; }
  }
  let killed = 0;
  for (let k = 0; k < PICK.length && squad.count > 0; k++) { const before = squad.count; squad.killMemberObj(PICK[k], reason); if (squad.count < before) killed++; }
  if (!ms.length && killed < n && squad.count > 0) {
    const L = squad.leader, dx = L.x - x, dz = L.z - z;
    if (dx * dx + dz * dz < r2) { const before = squad.count; squad.remove(1, reason); if (squad.count < before) killed++; }
  }
  PICK.length = 0;
  return killed;
}

export const TYPE_HAS_AI = Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, !!(ENEMIES[k].spit || ENEMIES[k].heal || ENEMIES[k].brood || ENEMIES[k].fly || ENEMIES[k].boom)]));
