// What a sabotage does to MY run when it lands (STAGE2 "Effects"). Simulation only: no DOM, fx or audio (the UI
// shows it from the sab:* events). Timers run on the played clock (Versus.t). Written by Sabotage.step, which runs in
// the versus step right after ramp.step, so after hazards.update reset the mods this step (forwardSpeed and the
// world read them next).
//   1 EXTRA WAVE   ramp.wave(clamp(round(0.35 E), 12, 120)), x0.3 (min 4) in a boss arena
//   2 FOG          6 s of mods.fogMul <= 0.4
//   3 RED GATE     a full row of two -N gates spliced into the road ahead (N = max(4, round(0.2 x squad)))
//   4 SPEED UP     5 s of mods.speedMul x 1.35 (after the ramp's pace; run.speed is never touched)
//   5 FREEZE       2 s: the leader's x is held through runMods.holdFn (covers the autopilot), then released
//                  without a jump (the drag re-anchors where the squad stands)
//   11 HORDE STORM ramp.wave(90, 1, 0.33) (x0.3 in an arena) + 4 s of fog
//   12 BLACKOUT    5 s of mods.dark >= 0.8 and mods.fogMul <= 0.3
// Fog and blackout are visual only: nothing in the sim reads them (or the graphics quality).
import { SAB } from './sabdata.js';
import { spliceSorted } from './sabcrate.js';
import { gate } from '../../data/beats.js';

const C = SAB.code;
const TIMED = ['fog', 'speed', 'freeze', 'blackout'];

export class SabEffects {
  constructor(game, versus) {
    this.game = game; this.versus = versus;
    this.left = { fog: 0, speed: 0, freeze: 0, blackout: 0 };
    this.fogBy = C.fog;
    this.heldX = 0; this.holding = false;
    this.lastHit = -Infinity; // played clock of the last wave / gate / storm landing (the 'sabotaged' flag)
    this.hold = () => this.heldX;
    this.stats = { waves: 0, waveCount: 0, reds: 0, landed: 0 };
  }

  reset() {
    this.release();
    for (const k of TIMED) this.left[k] = 0;
    this.fogBy = C.fog; this.lastHit = -Infinity;
    Object.assign(this.stats, { waves: 0, waveCount: 0, reds: 0, landed: 0 });
  }

  arena() { const run = this.game.run; return !!run && run.phase === 'boss'; }

  /** Enemies of an EXTRA WAVE now (arena-scaled). */
  waveCount() {
    const g = this.game, W = SAB.wave, E = g.endless.gen ? g.endless.gen.knobs(g.run.dist).E : 20;
    const n = Math.max(W.min, Math.min(W.max, Math.round(W.frac * E)));
    return this.arena() ? Math.max(SAB.arenaMin, Math.round(n * SAB.arenaMul)) : n;
  }

  /** Where a red gate row would go now (null = no room left in this zone). */
  redSpot() {
    const run = this.game.run, R = SAB.red, ev = run.eventsOf('gate');
    const end = run.length - R.preBoss;
    for (let at = Math.ceil(run.dist + R.ahead); at < end; at += R.step) {
      let ok = true;
      for (let i = 0; i < ev.length; i++) if (Math.abs(ev[i].at - at) < R.clear) { ok = false; break; }
      if (ok) return at;
    }
    return null;
  }

  /** True when kind `code` can land now (the road kinds wait out an arena; a red gate also needs room). */
  canLand(code) {
    if (code !== C.red && code !== C.speed && code !== C.freeze) return true;
    if (this.arena()) return false;
    return code !== C.red || this.redSpot() != null;
  }

  /** Lands kind `code` now. Returns { dur, count } for the sab:land event. */
  land(code) {
    const g = this.game, ramp = this.versus.ramp, t = this.versus.t;
    this.stats.landed++;
    switch (code) {
      case C.wave: { const n = this.waveCount(); ramp.wave(n); this.hit(t, n); return { dur: 0, count: n }; }
      case C.fog: this.left.fog = SAB.fog.dur; this.fogBy = C.fog; return { dur: SAB.fog.dur, count: 0 };
      case C.red: return this.red(t);
      case C.speed: this.left.speed = SAB.speed.dur; return { dur: SAB.speed.dur, count: 0 };
      case C.freeze: {
        this.left.freeze = SAB.freeze.dur;
        if (!this.holding) { this.heldX = g.squad.leader.x; this.holding = true; }
        g.runMods.holdFn = this.hold;
        return { dur: SAB.freeze.dur, count: 0 };
      }
      case C.storm: {
        const S = SAB.storm, n = this.arena() ? Math.max(SAB.arenaMin, Math.round(S.count * SAB.arenaMul)) : S.count;
        ramp.wave(n, 1, S.elite);
        this.hit(t, n);
        if (this.left.fog < S.fogDur) { this.left.fog = S.fogDur; this.fogBy = C.storm; }
        return { dur: S.fogDur, count: n };
      }
      case C.blackout: this.left.blackout = SAB.blackout.dur; return { dur: SAB.blackout.dur, count: 0 };
      default: return { dur: 0, count: 0 };
    }
  }

  hit(t, n) { this.lastHit = t; this.stats.waves++; this.stats.waveCount += n; }

  red(t) {
    const g = this.game, run = g.run, R = SAB.red, at = this.redSpot();
    if (at == null) return { dur: 0, count: 0 };
    const N = Math.max(R.min, Math.round(R.frac * g.squad.count));
    const ev = run.eventsOf('gate'), ramp = this.versus.ramp;
    for (const lane of ['L', 'R']) {
      const i = spliceSorted(ev, gate(at, lane, 'add', { value: -N, max: -1, sab: true }), g.gates.cursor);
      ramp.spliced(i, 1); // ramp.redden walks the rows by index: keep its place (and the rival's red rows)
    }
    this.lastHit = t; this.stats.reds++;
    return { dur: 0, count: -N, at };
  }

  /** One sabotage step (after ramp.step): timers down by raw, the running effects written into the mods. */
  step(raw) {
    const mods = this.game.hazards.mods, L = this.left, ended = [];
    for (const k of TIMED) {
      if (L[k] <= 0) continue;
      L[k] = Math.max(0, L[k] - raw);
      if (L[k] > 0) continue;
      if (k === 'freeze') this.release();
      ended.push(k === 'fog' ? this.fogBy : C[k]);
    }
    if (L.fog > 0) mods.fogMul = Math.min(mods.fogMul, SAB.fog.fogMul);
    if (L.speed > 0) mods.speedMul *= SAB.speed.mul;
    if (L.blackout > 0) { mods.dark = Math.max(mods.dark, SAB.blackout.dark); mods.fogMul = Math.min(mods.fogMul, SAB.blackout.fogMul); }
    return ended;
  }

  /** Releases a freeze: steering is back, re-anchored where the squad stands (no jump). */
  release() {
    const g = this.game;
    if (g.runMods.holdFn === this.hold) g.runMods.holdFn = null;
    if (!this.holding) return;
    this.holding = false;
    this.left.freeze = 0;
    if (!g.autopilot.enabled) { const inp = g.input; inp.targetX = inp.startTarget = this.heldX; inp.startPx = inp.lastPx; }
  }

  /** My fall, the match end, leaving: every effect stops at once. Returns the codes that were running. */
  stopAll() {
    const ended = [];
    for (const k of TIMED) if (this.left[k] > 0) ended.push(k === 'fog' ? this.fogBy : C[k]);
    this.release();
    for (const k of TIMED) this.left[k] = 0;
    return ended;
  }

  /** The 'sabotaged' part from the effects: a timed one running or a wave / gate / storm in the last 3 s. */
  busy(t) { const L = this.left; return L.fog > 0 || L.speed > 0 || L.freeze > 0 || L.blackout > 0 || t - this.lastHit < SAB.flagHold; }
}
