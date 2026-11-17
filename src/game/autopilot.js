// Bot steering for tests/balance. Priorities: dodge active telegraphs > pass the best gate (accounts for the
// value it can still shoot onto the gate) > avoid the enemy-dense side when small / aim at the horde when
// strong > line up with worthwhile barrels (and never run into an unbroken one) > in the boss arena, stand
// in front of the boss. Blades and gaps are a hard filter on the final x: the whole formation (not just Pip)
// is tested against each hazard; power tokens (and coins when idle) are grabbed when the path is safe.
// Update 3 world hazards: their telegraphs (flagged `hazard`) are not dodged as boss attacks; the squad keeps out
// of game.hazards.danger zones instead (same hard filter as blades / gaps, zones may carry pad / shift / w, and
// look: lined up for only this late, e.g. a bridge whose danger is at its far end; cap / capDrawn: a zone that
// kills at most cap real (capDrawn drawn) members, e.g. a Spitling goo shot / a gumball, never outweighs a gap).
// Skill profiles (balance tests): 'pro' plays perfectly; 'casual' / 'novice' react late, misjudge close gate
// calls, often judge a gate by its current number, dodge telegraphs late (or not at all), wobble and clip
// hazard edges. Their randomness comes from the bot's own seeded rng (one seed per run), never game.rng.
import { applyGate, predictGate, REVEAL_HITS } from './gates.js';
import { Rng } from '../core/rng.js';
import { ALIVE } from './horde.js';
import { TARGET_CLAMP, MEMBER_CLAMP } from '../config.js';
import { BLADE_R } from '../models/obstacles.js';
import { ENEMY_INDEX } from '../data/enemies.js';
import { BOT_DEFAULTS, barrelValue, crateGoal, avoidCrates, hordeFire, easeLookAhead, abilityTick } from './autopilot2.js';

const LOOK = 75;
const HAZ_LOOK = 24;     // start lining up this far before a blade / gap
// pro lines up 15 u before a hazard (stage 3 balance: at 24 u it left its gate / horde line too early on the
// hazard-dense worlds and fell behind the casual bot, e.g. L22 1 / 4 -> 4 / 4 wins)
const PRO_HAZ_LOOK = 15;
const GATE_ALIGN = 30;   // the chosen gate overrides everything but telegraphs this far before it
const SCREEN_EAT = 0.5;   // share of the time to shoot through a screening horde that the raise window loses
const BLADE_PAD = 0.4, GAP_PAD = 0.35, GAP_SIDE = 0.22;

// react: output delay (s) | wrongGate: chance to take the worse gate when the call is close (scores within
// closeCall) | ignorePredict: chance per row to judge gates by their current value (no shooting value)
// dodgeDelay: telegraph seen this late (s, includes react) | dodgeMiss: chance to ignore a telegraph
// clip: chance per hazard to cut its edge by clipPad (u) | hazLook: lines up for hazards this late (u)
// jitter: hand wobble amplitude (u; pro 0.1 so a pro retry is not an exact replay)
// barrelSkip / pickupSkip: chance per item to not bother
// hordeNaive: judges a horde by headcount (pro weighs its hp against the squad's firepower)
export const BOT_PROFILES = {
  pro: { react: 0, wrongGate: 0, closeCall: 0, ignorePredict: 0, dodgeDelay: 0, dodgeMiss: 0, clip: 0, clipPad: 0, hazLook: PRO_HAZ_LOOK, jitter: 0.1, barrelSkip: 0, pickupSkip: 0 },
  casual: { react: 0.35, wrongGate: 0.2, closeCall: 0.3, ignorePredict: 0.5, dodgeDelay: 0.4, dodgeMiss: 0.08, clip: 0.3, clipPad: 0.7, hazLook: 15, jitter: 0.35, barrelSkip: 0.15, pickupSkip: 0.3, hordeNaive: true },
  novice: { react: 0.6, wrongGate: 0.35, closeCall: 0.45, ignorePredict: 0.8, dodgeDelay: 0.6, dodgeMiss: 0.6, clip: 0.5, clipPad: 1.0, hazLook: 11, jitter: 0.6, barrelSkip: 0.35, pickupSkip: 0.6, hordeNaive: true },
};

const CAND = [];
for (let x = -TARGET_CLAMP; x <= TARGET_CLAMP + 1e-6; x += 0.4) CAND.push(Math.round(x * 100) / 100);

export class Autopilot {
  init(game) {
    this.game = game;
    this.enabled = false;
    this.targetX = 0;
    this.choice = null;
    this.c = { x: 0, z: 0, r: 0 };
    this.rng = new Rng(1);
    this.rng2 = new Rng(1);       // update 2 decisions (crates, abilities): never shifts the shipped dice
    this.seedBase = 1;
    this.runs = 0;
    this.opts = { ...BOT_DEFAULTS };
    this.setProfile('pro');
  }

  /** Profile options (SPEC2 §6.10): { crates: 'never'|'favoured'|'always'|'auto', ability: bool, loadout: 'keep'|'auto' }. */
  setOptions(opts = {}) { this.opts = { ...BOT_DEFAULTS, ...opts }; return this.opts; }

  /** 'pro' | 'casual' | 'novice' (true = 'pro'). */
  setProfile(name) {
    const id = BOT_PROFILES[name] ? name : 'pro';
    this.profileName = id;
    this.p = BOT_PROFILES[id];
    return id;
  }

  reset() {
    this.choice = null;
    this.targetX = this.game.squad.leader.x;
    this.rng.seed(this.seedBase * 1013 + ++this.runs * 7919);
    this.rng2.seed(this.seedBase * 4099 + this.runs * 131 + 7);
    this.crateRolls = new Map();
    this.abClock = 0; this.abNext = 0; this.abPending = -1;
    this.rolls = new WeakMap();   // per row / hazard / telegraph dice (stable while it is on screen)
    this.seen = new WeakMap();    // danger zone -> time first seen
    this.telRolls = new WeakMap();
    this.clock = 0;
    this.buf = [];                // delayed outputs [{t, x}]
    this.wob = 0; this.wobT = 0; this.wobGoal = 0;
  }

  /** One die per object (rolled the first time it is asked). */
  roll(obj, key) {
    let r = this.rolls.get(obj);
    if (!r) { r = {}; this.rolls.set(obj, r); }
    if (r[key] === undefined) r[key] = this.rng.next();
    return r[key];
  }

  update(dt = 1 / 60) {
    abilityTick(this, dt);
    const x = this.decide(dt);
    const p = this.p;
    if (!p.react && !p.jitter) return x;
    this.clock += dt;
    // hand wobble: a slow random walk toward a new offset every ~0.6 s
    if (p.jitter) {
      this.wobT -= dt;
      if (this.wobT <= 0) { this.wobT = this.rng.range(0.4, 0.9); this.wobGoal = this.rng.range(-1, 1) * p.jitter; }
      this.wob += (this.wobGoal - this.wob) * Math.min(1, dt * 3);
    }
    const out = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, x + this.wob));
    if (!p.react) return out;
    this.buf.push({ t: this.clock, x: out });
    let i = 0;
    while (i < this.buf.length - 1 && this.buf[i + 1].t <= this.clock - p.react) i++;
    if (i) this.buf.splice(0, i);
    return this.buf[0].x;
  }

  /** Telegraphs / live danger zones this player has noticed (late, or never for some). */
  perceived(tel, zones) {
    const p = this.p;
    if (!p.dodgeDelay && !p.dodgeMiss) return zones && zones.length ? tel.concat(zones) : tel;
    const late = Math.max(0, p.dodgeDelay - p.react);
    const out = [];
    for (const h of tel) {
      // telegraph handles are pooled: a handle whose clock went backwards is a new warning (new dice)
      let r = this.telRolls.get(h);
      if (!r || h.t < r.t) { r = { t: 0, miss: this.rng.next() }; this.telRolls.set(h, r); }
      r.t = h.t;
      if (h.t >= late && r.miss >= p.dodgeMiss) out.push(h);
    }
    if (zones) for (const z of zones) {
      if (!this.seen.has(z)) this.seen.set(z, this.clock);
      if (this.clock - this.seen.get(z) >= late && this.roll(z, 'miss') >= p.dodgeMiss) out.push(z);
    }
    return out;
  }

  decide() {
    const game = this.game;
    const L = game.squad.leader;
    const tel = this.bossTel(game.telegraph ? game.telegraph.active : []);
    // live boss hazards that outlast their warning (charges, laser sweeps, quake crests, goo puddles)
    const zones = game.boss && game.boss.dangerZones;
    let x = null, keep = 0;
    // a hero that dodges slower than Pip plans further ahead (0 for Pip: the shipped bot)
    const extra = easeLookAhead(game) * (game.run ? game.run.speed : 9);
    const look = this.p.hazLook + extra;
    this.look = look;
    const seen = tel.length || (zones && zones.length) ? this.perceived(tel, zones) : tel;
    if (seen.length) x = this.dodge(seen);
    if (x === null) {
      const gate = this.gateGoal();
      const near = gate && gate.dz < GATE_ALIGN + extra;
      // a gate decision is not overruled by a hazard well past it (there is time to sidestep after passing)
      this.look = near ? Math.min(look, gate.dz + 8) : look;
      // a wanted crate clearly before the gate row is taken first (crates sit >= 12 u from every row)
      const cg = crateGoal(this);
      if (near) x = cg && cg.dz < gate.dz - 6 ? cg.x : gate.x;
      keep = near && x === gate.x ? gate.gain : 0;
      if (x === null && cg) x = cg.x;
      if (x === null) x = this.pickupGoal(gate, false);
      if (x === null && game.props) x = game.props.botGoal(this, gate); // stage 4: push a boulder / shoot a road object
      if (x === null) x = this.hordeGoal();
      if (x === null) x = this.barrelGoal(gate);
      if (x === null) x = this.pickupGoal(gate, true);
      if (x === null && gate) x = gate.x;
      if (x === null && game.boss && game.run && game.run.phase === 'boss') x = game.boss.x;
      if (x !== null) x = avoidCrates(this, this.avoidBarrels(x));
    }
    if (x !== null) this.targetX = x;
    // a small capped hazard loss (a goo shot, a gumball) never costs the squad a much better gate it is lined up for
    // (hazardLoss counts drawn members; keep is a real squad count: x drawnWeight)
    if (!seen.length && !(keep > 0 && this.hazardLoss(this.targetX) * this.drawnWeight() * 2 < keep && this.uncapped === 0)) this.targetX = this.avoidHazards(this.targetX);
    this.targetX = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, this.targetX));
    return this.targetX;
  }

  /** Telegraphs minus world-hazard ones (those are read as game.hazards.danger zones, see hazardLoss). */
  bossTel(list) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].hazard) n++;
    if (!n) return list;
    const out = this.telBuf || (this.telBuf = []);
    out.length = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].hazard) out.push(list[i]);
    return out;
  }

  /**
   * Candidate x that keeps the most members out of the marked areas. Update 3 SAFE SPOT (kind 'safe'): contains()
   * is true outside its circle, so the same count steers the blob into it; the circle's exact centre is scored
   * too (the 0.4 u grid can straddle a small circle).
   */
  dodge(list) {
    const game = this.game;
    const L = game.squad.leader;
    const bossX = game.boss ? game.boss.x : 0;
    let best = null, bestScore = Infinity;
    for (const cx of CAND) {
      const score = this.dodgeLoss(list, cx - L.x) * 10 + Math.abs(cx - L.x) * 0.6 + Math.abs(cx - bossX) * 0.25;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    for (const h of list) {
      if (h.kind !== 'safe' || h.done) continue;
      const cx = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, h.x));
      const score = this.dodgeLoss(list, cx - L.x) * 10 + Math.abs(cx - L.x) * 0.6 + Math.abs(cx - bossX) * 0.25;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    return best;
  }

  /** Members (sampled; Pip counts 3) left inside the marked areas when the formation shifts by dx. */
  dodgeLoss(list, dx) {
    const squad = this.game.squad, L = squad.leader, T = this.game.telegraph, ms = squad.members;
    const stride = Math.max(1, Math.floor(ms.length / 90));
    let loss = 0;
    for (const h of list) {
      if (h.done) continue;
      const pad = 0.45;
      if (T.contains(h, L.x + dx, L.z, pad)) loss += 3;
      for (let i = 0; i < ms.length; i += stride) {
        const m = ms[i];
        if (T.contains(h, m.tx + dx, m.tz, pad)) loss += stride;
      }
    }
    return loss;
  }

  gateGoal() {
    const game = this.game;
    const L = game.squad.leader;
    const run = game.run;
    const speed = Math.max(1, run ? run.speed : 9);
    let row = null;
    for (const r of game.gates.upcoming()) { if (r.z < L.z + 0.2 && L.z - r.z < LOOK) { row = r; break; } }
    if (!row) return null;
    const t = Math.max(0, (L.z - row.z) / speed);
    const w = game.weapons;
    const bulletsPerSec = w.gateShotsPerSec();
    const count = game.squad.count;
    const p = this.p;
    const naive = p.ignorePredict && this.roll(row, 'naive') < p.ignorePredict;
    // a horde still standing between the squad and the row eats the bullets first: the raise window shrinks by
    // the time the squad needs to shoot through it (review fix: counting no hits at all behind > 24 enemies made
    // the pro bot take +3 over a ÷2 its fire turns into ×4 before the row, e.g. L22's last row)
    let screenHp = 0;
    if (!naive && game.horde) for (const e of game.horde.list) if (e.state === ALIVE && e.z < L.z && e.z > row.z) screenHp += e.hp + (e.shield || 0);
    const clearT = screenHp > 0 ? SCREEN_EAT * screenHp / Math.max(1, w.barrelDps()) : 0;
    let best = null, bestScore = -Infinity, second = null, secondScore = -Infinity;
    for (const g of row.gates) {
      if (g.state !== 'live') continue;
      // the squad lines up with its gate GATE_ALIGN u before it at the latest: count only the shots it will
      // surely put into the gate from then on (hordes / barrels may claim the bullets before that)
      let hits = naive ? 0 : bulletsPerSec * Math.max(0, Math.min(t, GATE_ALIGN / speed) - 0.5 - clearT) * 0.8;
      if (g.hidden) hits = Math.max(0, hits - (REVEAL_HITS - g.revealHits)); // a hidden gate takes no raise hits yet
      const pred = predictGate(g, hits);
      let score = applyGate(g, count, pred.value, pred.rung);
      if (g === this.choice) score *= 1.08; // hysteresis
      if (score > bestScore) { second = best; secondScore = bestScore; bestScore = score; best = g; }
      else if (score > secondScore) { secondScore = score; second = g; }
    }
    if (!best) return null;
    // a close call misread: the worse gate looks better to this player
    if (second && p.wrongGate && this.roll(row, 'wrong') < p.wrongGate
      && bestScore - secondScore <= p.closeCall * Math.max(1, Math.abs(bestScore))) best = second;
    this.choice = best;
    const inner = Math.max(0.2, best.halfW - 0.9);
    let x = best.x;
    if (best.moving) {
      const tt = game.gates.time + Math.min(t, 1.2);
      x = best.baseX + Math.sin(tt * best.moving.speed + best.phase) * best.moving.range;
    }
    if (best.lane === 'C') x = Math.max(-1.5, Math.min(1.5, L.x));
    return { x: Math.max(best.x - inner, Math.min(best.x + inner, x)), dz: L.z - row.z, gain: second ? bestScore - secondScore : 0 };
  }

  /**
   * Weak squad: steer to the thinner side of an incoming horde. Strong squad: face the horde. 'pro' weighs
   * the horde by its toughness (hp) against the squad's firepower; the others judge by headcount.
   */
  hordeGoal() {
    const game = this.game;
    const h = game.horde;
    if (!h || h.count === 0) return null;
    const L = game.squad.leader;
    const zNear = L.z + 1, zFar = L.z - 42;
    const count = game.squad.count;
    if (this.p.hordeNaive) {
      const total = h.densityAt(0, 6, zFar, zNear);
      if (total === 0) return null;
      const strong = count > total * 0.9 + 12;
      let best = null, bestScore = Infinity;
      for (const cx of CAND) {
        const d = h.densityAt(cx, 1.9, zFar, zNear);
        const score = (strong ? -d : d) + Math.abs(cx - L.x) * 0.15;
        if (score < bestScore) { bestScore = score; best = cx; }
      }
      return best;
    }
    // hp per 0.2 u column across the road
    const bins = this.bins || (this.bins = new Float32Array(52));
    const types = this.types || (this.types = new Float32Array(Object.keys(ENEMY_INDEX).length));
    bins.fill(0); types.fill(0);
    let mass = 0, near = Infinity, heads = 0, all = 0;
    for (const e of h.list) {
      if (e.state !== ALIVE || e.z < zFar || e.z > zNear) continue;
      all++;
      if (e.wave && !e.wave.go) continue; // a held wave (hordewaves.js) is not coming yet: judge the engaged ones
      const m = e.hp + (e.shield || 0);
      mass += m;
      types[e.type]++; heads++;
      if (L.z - e.z < near) near = L.z - e.z;
      bins[Math.max(0, Math.min(51, Math.round((e.x + 5.2) / 0.2)))] += m;
    }
    if (mass === 0) return null;
    const fire = hordeFire(game, types, heads);
    // shoot into the thick of it while it is far, sidestep to the thin side before contact (unless it melts)
    // (the headcount rule counts the held waves too: they are coming next, review fix)
    const strong = fire * 0.35 > mass || near > 16 || count > all * 0.9 + 12;
    let best = null, bestScore = Infinity;
    for (const cx of CAND) {
      let d = 0;
      const i0 = Math.max(0, Math.round((cx - 1.9 + 5.2) / 0.2)), i1 = Math.min(51, Math.round((cx + 1.9 + 5.2) / 0.2));
      for (let i = i0; i <= i1; i++) d += bins[i];
      const score = (strong ? -d : d) / mass * 40 + Math.abs(cx - L.x) * 0.15;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    return best;
  }

  barrelValue(b) { return barrelValue(this.game, b); }

  barrelGoal(gate) {
    const game = this.game;
    if (!game.barrels) return null;
    const L = game.squad.leader;
    const run = game.run;
    const speed = Math.max(1, run ? run.speed : 9);
    const dps = game.weapons.barrelDps();
    let best = null, bs = 0;
    for (const b of game.barrels.upcoming()) {
      const dz = L.z - b.z;
      if (dz < 4 || dz > 60) continue;
      if (gate && gate.dz < dz + 12) continue; // a gate comes first
      const time = (dz - 3) / speed;
      if (dps * time * 0.75 < b.hp) continue;   // can't break it in time
      if (this.p.barrelSkip && this.roll(b, 'skip') < this.p.barrelSkip) continue;
      const v = this.barrelValue(b) - Math.abs(b.x - L.x) * 2;
      if (v > bs) { bs = v; best = b; }
    }
    return best ? best.x : null;
  }

  /**
   * Members expected to die to blades / gaps if the leader goes to cx (formation slots shifted with it,
   * moving blades predicted at the moment each member reaches them). 0 = clean path.
   */
  hazardLoss(cx) {
    const game = this.game, obs = game.obstacles;
    const dz = game.hazards ? game.hazards.danger : null;
    if ((!obs || (!obs.blades.length && !obs.gaps.length)) && !(dz && dz.length)) return 0;
    const squad = game.squad, L = squad.leader, ms = squad.members;
    const speed = Math.max(1, game.run ? game.run.speed : 9);
    const dx = cx - L.x;
    const stride = Math.max(1, Math.floor(ms.length / 80));
    const c = squad.center(this.c);
    const back = c.z + c.r;
    let loss = 0;
    const p = this.p;
    for (const b of obs.blades) {
      const R = BLADE_R + 0.2 + BLADE_PAD - (p.clip && this.roll(b, 'clip') < p.clip ? p.clipPad : 0);
      if (L.z - b.z > (this.look || HAZ_LOOK) || b.z > back + R) continue;
      const hit = (x, z) => {
        const dz = z - b.z;
        if (dz < -R) return false;
        const bx = obs.bladeX(b, Math.max(0, dz / speed));
        return Math.abs(x - bx) < R;
      };
      if (!squad.pipGone && hit(cx, L.z)) loss += 3;
      for (let i = 0; i < ms.length; i += stride) if (hit(clampX(ms[i].tx + dx), ms[i].tz)) loss += stride;
    }
    const dist = -L.z;
    for (const g of obs.gaps) {
      if (g.from - dist > (this.look || HAZ_LOOK) || g.to < -back) continue;
      const side = GAP_SIDE - GAP_PAD + (p.clip && this.roll(g, 'clip') < p.clip ? p.clipPad : 0);
      const over = (x, z) => -z < g.to && (g.lane === 'C' || (g.lane === 'R' ? x > side : x < -side));
      if (!squad.pipGone && over(cx, L.z)) loss += 3;
      for (let i = 0; i < ms.length; i += stride) if (over(clampX(ms[i].tx + dx), ms[i].tz)) loss += stride;
    }
    let capped = 0;
    if (dz) for (const zn of dz) { const l = this.zoneLoss(zn, cx, dx, back, stride); loss += l; if (zn.cap != null || zn.capDrawn != null) capped += l; }
    this.uncapped = loss - capped; // loss from blades, gaps and uncapped zones (read by decide)
    return loss;
  }

  /**
   * World-hazard danger zone: members whose shifted x crosses it before the whole zone is behind them (a
   * column ahead of the squad, like the gap test). 'casual' / 'novice' miss some zones and clip their edges.
   */
  zoneLoss(zn, cx, dx, back, stride) {
    const p = this.p, squad = this.game.squad, L = squad.leader, ms = squad.members;
    if (p.dodgeMiss && this.roll(zn, 'miss') < p.dodgeMiss) return 0;
    if (p.dodgeDelay) { // noticed late, like a telegraph (dodgeDelay includes the output delay)
      if (!this.seen.has(zn)) this.seen.set(zn, this.clock);
      if (this.clock - this.seen.get(zn) < Math.max(0, p.dodgeDelay - p.react)) return 0;
    }
    const pad = (zn.pad ?? 0.3) - (p.clip && this.roll(zn, 'clip') < p.clip ? p.clipPad : 0);
    const circle = zn.kind === 'circle';
    const near = circle ? zn.z + zn.r : zn.zNear, far = circle ? zn.z - zn.r : zn.zFar;
    if (L.z - near > Math.min(this.look || HAZ_LOOK, zn.look || Infinity) || far > back + pad) return 0; // zn.look: a late-biting zone
    const sh = zn.shift || 0, w = zn.w ?? 1;
    const inX = circle ? (x) => Math.abs(x + sh - zn.x) < zn.r + pad : (x) => x + sh > zn.x0 - pad && x + sh < zn.x1 + pad;
    let loss = 0;
    if (!squad.pipGone && inX(cx) && L.z > far - pad) loss += 3;
    for (let i = 0; i < ms.length; i += stride) if (ms[i].tz > far - pad && inX(clampX(ms[i].tx + dx))) loss += stride;
    // a zone that kills at most cap real members (Spitling goo) / capDrawn drawn ones (a gumball: killIn takes
    // drawn members, each standing for drawnWeight real ones). loss is in drawn members like the rest.
    const cap = zn.capDrawn ?? (zn.cap != null ? zn.cap / this.drawnWeight() : null);
    if (cap != null && loss > cap) loss = cap;
    return loss * w;
  }

  /** Real squad members per drawn member (a big squad draws at most ~320; hazards/common.js killIn). */
  drawnWeight() {
    const sq = this.game.squad;
    return Math.max(1, sq.count / (sq.members.length + (sq.pipGone ? 0 : 1)));
  }

  /** Keeps x when it is clean, otherwise the nearby candidate that loses the fewest members. */
  avoidHazards(x) {
    const base = this.hazardLoss(x);
    if (base === 0) return x;
    const L = this.game.squad.leader;
    let best = x, bs = base * 10;
    for (const cx of CAND) {
      const s = this.hazardLoss(cx) * 10 + Math.abs(cx - x) * 0.6 + Math.abs(cx - L.x) * 0.2;
      if (s < bs) { bs = s; best = cx; }
    }
    return best;
  }

  /** Power tokens worth a detour (coins = true: nearest coin when nothing else matters). */
  pickupGoal(gate, coins) {
    const game = this.game, p = game.pickups;
    if (!p) return null;
    const L = game.squad.leader;
    const magnet = game.powers && game.powers.has('magnet');
    if (coins) {
      if (magnet) return null;
      let best = null, bd = Infinity;
      for (const cn of p.coins) {
        const dz = L.z - cn.z;
        if (cn.state !== 0 || dz < 1 || dz > 26) continue;
        if (gate && gate.dz < dz + 6) continue;
        if (dz < bd && this.hazardLoss(cn.x) === 0) { bd = dz; best = cn.x; }
      }
      return best;
    }
    const h = game.horde, count = game.squad.count;
    let best = null, bv = 0;
    for (const tk of p.tokens) {
      const dz = L.z - tk.z;
      if (tk.state !== 0 || dz < 0.5 || dz > 40) continue;
      if (magnet) continue;                                 // the magnet brings it anyway
      if (this.p.pickupSkip && this.roll(tk, 'skip') < this.p.pickupSkip) continue;
      if (gate && gate.dz < dz + 4) continue;              // a gate decision comes first
      if (this.hazardLoss(tk.x) > 0) continue;
      const brave = tk.kind === 'freeze' || tk.kind === 'shield';
      if (h && h.count && !brave && h.densityAt(tk.x, 1.9, L.z - 42, L.z + 1) > count * 0.6) continue;
      let v = 40 - Math.abs(tk.x - L.x) * 2 - dz * 0.2;
      if (game.powers && game.powers.has(tk.kind)) v *= 0.3;
      if (v > bv) { bv = v; best = tk.x; }
    }
    return best;
  }

  /** Shift x so the blob doesn't run into an unbroken barrel that is about to be reached. */
  avoidBarrels(x) {
    const game = this.game;
    if (!game.barrels) return x;
    const squad = game.squad, L = squad.leader;
    const c = squad.center(this.c);
    for (const b of game.barrels.upcoming()) {
      const dz = L.z - b.z;
      if (dz < -c.r * 2 - 1 || dz > 6.5) continue;
      const half = c.r * 0.9 + 1.0;
      if (Math.abs(x - b.x) < half) {
        const left = b.x - half, right = b.x + half;
        const goLeft = Math.abs(x - left) < Math.abs(x - right);
        let nx = goLeft ? left : right;
        if (nx < -TARGET_CLAMP || nx > TARGET_CLAMP) nx = goLeft ? right : left;
        x = nx;
      }
    }
    return x;
  }
}

function clampX(x) { return x < -MEMBER_CLAMP ? -MEMBER_CLAMP : x > MEMBER_CLAMP ? MEMBER_CLAMP : x; }
