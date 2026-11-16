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

export function makeWave(k, n, spec, prev, ev) {
  return { k, n, alive: 0, go: k === 0, engaged: false, locked: false, goT: 0, wait: 0, holdT: 0, delay: spec.delay ?? 1.6, speed: spec.speed ?? 1, prev, rush: !!ev.rush, last: false, at: ev.at };
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
