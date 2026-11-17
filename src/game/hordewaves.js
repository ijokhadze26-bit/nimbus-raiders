// Horde waves (update 3, stage 3 "enemies"). A campaign horde event no longer arrives as one steady blob: it
// splits into a probe group, a short pause, then the main RUSH (data/enemies.js WAVES; an event or level def
// can pass its own `waves: [{ frac, delay, speed }]`, `waves: false` keeps one blob). The final rush (rush:
// true) uses 3 waves. Boss summons, endless, practice and custom test runs (no def.world) are never split.
//   - every wave is its own sub-blob, laid out behind the previous one (horde.spawnWave)
//   - wave 0 charges like any horde; a later wave HOLDS once the squad is within HOLD_AT u of it (it keeps
//     that distance: it walks back as fast as the squad comes on, at the edge of view)
//   - it is released `delay` s after the previous wave broke (<= 25% of it left, or PREV_MAX s after it
//     engaged), then charges at x speed; road running out / the arena / a long hold release it early
//   - release emits 'horde:rush' (+ a small "INCOMING!" HUD line for big rushes, at most every 8 s)
//   - a hidden gate's screen (event `gateAt`) keeps all its waves in front of the gate (fitScreen) and its held
//     wave stands there instead of walking back, so the gate is uncovered by shooting through (gates.js reveal)
import { WAVES } from '../data/enemies.js';

export const HOLD_AT = 40;
const PREV_MAX = 3.6;
const PREV_LEFT = 0.25;
const FORCE_ROAD = 40;     // release when only this much road is left (the rush must land before the finish / arena)
const HOLD_MAX = 9;
const HINT_MIN = 40, HINT_GAP = 8;

/** Wave plan of a level horde event, or null (one blob). */
export function planFor(game, ev) {
  const run = game.run;
  if (!run || ev.waves === false) return null;
  const def = run.def || {};
  let w = ev.waves || def.waves;
  if (def.waves === false && !ev.waves) return null;
  if (!w) {
    if (run.mode !== 'level' || !(def.world >= 1) || (ev.count | 0) < WAVES.minCount) return null;
    const pause = WAVES.pause[def.world] ?? 1.6;
    w = ev.rush ? WAVES.rush(pause) : WAVES.normal(pause);
  }
  return Array.isArray(w) && w.length > 1 ? w : null;
}

/** Splits n spawn slots by the plan's fractions (every wave gets >= 1). */
export function splitCounts(plan, n) {
  const tot = plan.reduce((s, p) => s + (p.frac || 0), 0) || 1;
  const out = [];
  let acc = 0, used = 0;
  for (let i = 0; i < plan.length; i++) {
    acc += (plan[i].frac || 0) / tot;
    const k = i === plan.length - 1 ? n - used : Math.max(1, Math.min(n - used - (plan.length - 1 - i), Math.round(acc * n) - used));
    out.push(k); used += k;
  }
  return out;
}

/** stand: a hidden gate's screen (ev.gateAt) - its held wave stands in front of the gate instead of walking back. */
export function makeWave(k, n, spec, prev, ev) {
  return { k, n, alive: 0, go: k === 0, engaged: false, locked: false, goT: 0, wait: 0, holdT: 0, delay: spec.delay ?? 1.6, speed: spec.speed ?? 1, prev, rush: !!ev.rush, last: false, at: ev.at, stand: ev.gateAt != null };
}

const SCREEN_GAP = 1.2; // a screen's back row stays this far in front of its gate
/**
 * Hidden gate screen (event `gateAt`, data/harder.js): the waves are laid out one behind the other, so the rush
 * sub-blob would stand on (or past) the gate row and the gate would be screened by the probe only. Shifts the
 * enemies placed since index n0 toward the squad so the back row (z `back`) stays in front of the gate.
 */
export function fitScreen(list, n0, back, ev) {
  if (ev.gateAt == null) return;
  const dz = -ev.gateAt + SCREEN_GAP - back;
  if (dz <= 0) return;
  for (let i = n0; i < list.length; i++) list[i].z += dz;
}

/** Once per step (before the enemy loop): release held waves; drop finished ones. */
export function updateWaves(h, dt, dist) {
  const game = h.game, run = game.run, waves = h.waves;
  const roadLeft = run ? run.length - dist : 0;
  const force = !run || run.phase !== 'run' || roadLeft < FORCE_ROAD;
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    if (w.go) {
      if (w.engaged) w.goT += dt;
      if (w.alive <= 0) { waves[i] = waves[waves.length - 1]; waves.pop(); } // a later wave keeps it as .prev
      continue;
    }
    if (w.locked) w.holdT += dt;
    const p = w.prev;
    const ready = !p || (p.go && (p.alive <= Math.ceil(p.n * PREV_LEFT) || p.goT >= PREV_MAX));
    if (ready) w.wait += dt;
    if (force || w.holdT > HOLD_MAX || (ready && w.wait >= w.delay)) release(h, w);
  }
}

function release(h, w) {
  w.go = true;
  const game = h.game;
  h.waveStats.released++;
  game.events.emit('horde:rush', { count: w.alive, index: w.k, rush: w.rush, last: w.last });
  if (w.alive >= HINT_MIN && h.time - h.lastHint > HINT_GAP && game.run && game.run.phase === 'run') {
    h.lastHint = h.time;
    game.events.emit('hazard:hint', { kind: 'horde', text: w.rush && w.last ? 'INCOMING! Final rush' : 'INCOMING! Here comes the rush', color: '#ff5a4a' });
  }
}

/** Debug / tests: live wave summary. */
export function waveInfo(h) {
  return h.waves.map((w) => ({ k: w.k, n: w.n, alive: w.alive, go: w.go, locked: w.locked, holdT: Math.round(w.holdT * 100) / 100, speed: w.speed, rush: w.rush }));
}

// ---------------- overflow (stage 3 review fix) ----------------
// A level horde that meets a full field (MAX_ENEMIES live, e.g. the final rush on top of a long-lived late horde)
// used to be cut to whatever room was left, so the data count was not what got played and a squad that thinned
// the previous horde met a BIGGER rush. Now the rest waits in horde.overflow and comes in as extra blobs (no
// waves) as soon as room exists: at its own spot, or just inside spawn range once the squad is past that.
const OVERFLOW_MIN = 40;   // a remainder spawns in chunks of at least this many (or all of it)
const OVERFLOW_END = 25;   // a remainder that would only appear this close to the finish is dropped

/** horde.spawnWave of a level event that had room for only part of it (whole: none of it): queue the rest. */
export function queueOverflow(h, ev, left, whole = false) {
  h.overflow.push({ ev, left, whole });
  h.waveStats.deferred += left;
}

/** Once per step: spawn queued remainders (oldest first) while room exists; dropped once the run phase ends. */
export function spawnOverflow(h, dist, max, ahead) {
  const run = h.game.run;
  if (!run || run.phase !== 'run' || dist > run.length - OVERFLOW_END) { h.overflow.length = 0; return; }
  const o = h.overflow[0];
  const n = Math.min(o.left, max - h.list.length);
  if (n < Math.min(o.left, OVERFLOW_MIN)) return;
  const at = Math.min(run.length, Math.max(o.ev.at, dist + ahead - 5));
  if (o.whole) { // a whole held-back event keeps its waves (and queues again whatever still does not fit)
    h.overflow.shift();
    h.waveStats.deferred -= o.left;
    h.spawnWave(at === o.ev.at ? o.ev : { ...o.ev, at, gateAt: undefined }, true);
    return;
  }
  o.left -= n;
  if (o.left <= 0) h.overflow.shift();
  h.spawnWave({ ...o.ev, count: n, at, waves: false, gateAt: undefined, depth: undefined }, false);
}
