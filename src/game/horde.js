// Horde: all Murklings. Spawns blobs from level 'horde' events, idles until the squad is near, charges +Z,
// steers toward the squad, resolves bullet hits (z-grid), contact kills (tank multi-kill, bomber blasts),
// chain explosions. Rendering lives in hordeview.js (one InstancedMesh per type).
// Update 3 (stage 3): new types + elites + smarter enemies per world (hordeai.js), level hordes split into
// probe / pause / rush waves (hordewaves.js). Boss summons (attacks.js -> spawnWave(ev)) are never split.
// Update 2: status (burn / slow / freeze / pull) ticks first (game.status.tickHorde); every hp change goes
// through hordeops.applyDamage (matchups, shields, carry); the spatial queries live in hordeops.js too.
import { HORDE, LANES, MEMBER_CLAMP } from '../config.js';
import { ENEMIES, ENEMY_TYPES, ENEMY_INDEX } from '../data/enemies.js';
import { ZGrid } from '../core/grid.js';
import { HordeView } from './hordeview.js';
import { hasHit } from './bullets.js';
import { HIT } from '../config.js';
import * as ops from './hordeops.js';
import * as AI from './hordeai.js';
import { planFor, splitCounts, makeWave, updateWaves, waveInfo, fitScreen, HOLD_AT, queueOverflow, spawnOverflow } from './hordewaves.js';
import { Rng } from '../core/rng.js';

export const ALIVE = 0, DYING = 1, SWELL = AI.SWELL;
const KILL_CAT = { bullet: 'weapon', weapon: 'weapon', burn: 'weapon', shatter: 'weapon', ability: 'ability', helper: 'helper' };
const CONTACT = 0.55;       // + type radius (SPEC §5)
const AGGRO = 52;           // idle blobs start charging when the squad is this close
const MAX_ENEMIES = 900;
const DIE_TIME = 0.17;
const CHAIN_DELAY = 0.11;
const DEFS = ENEMY_TYPES.map((t) => ENEMIES[t]);
const WAVE_GAP = 2.6;     // empty road between a wave's sub-blob and the next one

export class Horde {
  init(game) {
    this.game = game;
    this.list = [];
    this.free = [];
    this.grid = new ZGrid(1);
    this.mgrid = new ZGrid(1);
    this.blasts = [];       // pending explosions { x, z, r, t, kills, members }
    this.events = [];
    this.cursor = 0;
    this.alive = 0;
    this.time = 0;
    this.stamp = 0;
    this.kind = 'enemy';
    this.bit = HIT.ENEMY;
    this.priority = 5;
    this.last = { killed: false, used: 0, blocked: false };
    this.leaderRef = { leader: true, x: 0, z: 0, hitStamp: -1 };
    this.diePos = { x: 0, y: 0.5, z: 0 };
    this.hitPos = { x: 0, y: 0.5, z: 0 };
    this.maxEnemies = MAX_ENEMIES;
    this.waves = [];
    this.overflow = [];     // level horde remainders that did not fit under MAX_ENEMIES (hordewaves.spawnOverflow)
    this.waveStats = { split: 0, released: 0, deferred: 0 };
    this.lastHint = -99;
    this.prevLz = null; this.dLz = 0; this.fwd = 0;
    this.arng = new Rng(1);
    this.ai = AI.aiFor(null);
    AI.initAi(this);
    for (const [n, r] of [['enemy:heal', 6], ['enemy:spawn', 8], ['enemy:spit', 8], ['enemy:splat', 8], ['enemy:dive', 6], ['enemy:swell', 10]]) game.events.setRate(n, r);
    this.view = new HordeView(game, MAX_ENEMIES);
    game.bullets.addTargetSystem(this);
  }

  reset(run) {
    for (const e of this.list) this.free.push(e);
    this.list.length = 0;
    this.blasts.length = 0;
    this.events = run ? run.eventsOf('horde') : [];
    this.cursor = 0;
    this.alive = 0;
    this.grid.clear();
    this.waves.length = 0;
    this.overflow.length = 0;
    this.waveStats.split = 0; this.waveStats.released = 0; this.waveStats.deferred = 0;
    this.lastHint = -99;
    this.prevLz = null;
    this.arng.seed(run ? (run.def.id | 0) * 31337 + 7 : 1);
    this.ai = AI.aiFor(run);
    AI.resetAi(this);
    this.view.reset();
  }

  get count() { return this.alive; }

  /** Skip all not-yet-spawned waves (debug skipToBoss). */
  skipAll() {
    this.cursor = this.events.length;
    for (const e of this.list) if (e.state === ALIVE || e.state === SWELL) { if (e.state === ALIVE) this.alive--; e.state = DYING; e.t = DIE_TIME; }
    this.waves.length = 0;
    this.overflow.length = 0;
    AI.resetAi(this);
  }

  alloc() {
    return this.free.length ? this.free.pop() : { type: 0, def: null, x: 0, z: 0, vx: 0, hp: 1, maxHp: 1, shield: 0, state: 0, t: 0, ph: 0, ox: 0, charging: false, flash: 0, sflash: 0, cd: 0, ckills: 0, slow: 1,
      burnPool: 0, burnT: 0, slowPct: 0, slowT: 0, freezeT: 0, shatter: 0, stickyT: 0, stickyPct: 0, px: 0, pz: 0, pud: 0, spd: 1, ice: 0, burn: 0,
      hpm: 1, wave: null, wmul: 1, elite: false, size: 1, aiT: 0, dodge: false, dashT: 0, dashV: 0, dcd: 0, spr: 1, turn: false, yaw: 0, glow: 0, sw: 0,
      y: 0, dived: false, shots: 0, brood: 0, sp: 0, stopD: 0, beh: false };
  }

  // ---------------- spawning ----------------
  /** split = a level horde event (horde.update): may become probe / pause / rush waves (hordewaves.js). */
  spawnWave(ev, split = false) {
    const rng = this.game.rng;
    const room = MAX_ENEMIES - this.list.length, want = ev.count | 0;
    // a full field: a level horde waits (all of it when there is hardly any room) instead of being cut short
    if (split && room < Math.min(want, 40)) { queueOverflow(this, ev, want, true); return; }
    const count = Math.max(1, Math.min(want, room));
    if (split && count < want) queueOverflow(this, ev, want - count);
    const lane = ev.lane || 'both';
    // toughness: per event (endless ramps it) or per level (data/levels.js enemyHp); looks are unchanged
    const def = this.game.run && this.game.run.def;
    const hpMul = ev.hpMul ?? (def && def.enemyHp) ?? 1;
    const cx = lane === 'both' || lane === 'C' ? 0 : LANES[lane];
    const width = ev.width ?? (lane === 'both' || lane === 'C' ? 9.2 : 4.3);
    // type list from mix
    const mix = ev.mix || { grunt: 1 };
    const keys = Object.keys(mix).filter((k) => ENEMIES[k]);
    const total = keys.reduce((s, k) => s + mix[k], 0) || 1;
    const types = [];
    let acc = 0;
    for (const k of keys) {
      acc += mix[k] / total;
      const n = Math.round(acc * count) - types.length;
      for (let i = 0; i < n; i++) types.push(ENEMY_INDEX[k]);
    }
    while (types.length < count) types.push(ENEMY_INDEX[keys[0]] ?? 0);
    // shuffle, then each (sub-)blob is stable-sorted by front priority (tanks + shields lead the charge)
    for (let i = types.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = types[i]; types[i] = types[j]; types[j] = t; }
    const elite = eliteFlags(ev, types);
    let plan = split ? planFor(this.game, ev) : null;
    if (plan && count < plan.length * 4) plan = null; // too few for waves (every wave needs some)
    const n0 = this.list.length;
    let back;
    if (!plan) {
      back = this.layout(types, elite, 0, types.length, cx, width, -ev.at + (ev.depth ? ev.depth / 2 : Math.sqrt(count) * 0.32), hpMul, null);
    } else {
      const counts = splitCounts(plan, types.length);
      let z = -ev.at + Math.sqrt(counts[0]) * 0.32, start = 0, prev = null;
      for (let k = 0; k < counts.length; k++) {
        const w = makeWave(k, counts[k], plan[k], prev, ev);
        w.last = k === counts.length - 1;
        back = this.layout(types, elite, start, start + counts[k], cx, width, z, hpMul, w);
        z = back - WAVE_GAP;
        start += counts[k];
        this.waves.push(w);
        prev = w;
      }
      this.waveStats.split++;
    }
    fitScreen(this.list, n0, back, ev); // a hidden gate's screen (every wave) stays in front of its gate
    this.game.events.emit('horde:incoming', { count });
  }

  /** Packs types[i0..i1) into rows from zFront backward (crowd taper); returns the z behind the last row. */
  layout(types, elite, i0, i1, cx, width, zFront, hpMul, wave) {
    const rng = this.game.rng;
    const keyed = [];
    for (let i = i0; i < i1; i++) keyed.push({ t: types[i], i, k: DEFS[types[i]].front * 1000 + i });
    keyed.sort((a, b) => a.k - b.k);
    const count = keyed.length;
    let z = zFront;
    let row = [], rowW = 0, rowIdx = 0;
    const flush = () => {
      if (!row.length) return;
      let depth = 0;
      for (const { t } of row) depth = Math.max(depth, DEFS[t].spacing);
      const stagger = rowIdx & 1 ? 0.18 : -0.18;
      let x = cx - rowW / 2 + stagger;
      for (const { t, i } of row) {
        const d = DEFS[t];
        x += d.spacing / 2;
        const e = this.place(t, x + rng.range(-0.14, 0.14), z - depth / 2 + rng.range(-0.24, 0.24), x - cx, hpMul, !!(elite && elite[i]));
        if (e && wave) { e.wave = wave; e.wmul = wave.speed; wave.alive++; }
        x += d.spacing / 2;
      }
      z -= depth * 0.9;
      row = []; rowW = 0; rowIdx++;
    };
    // rows taper toward the back so the blob reads as a crowd, not a block
    let avg = 0;
    for (const { t } of keyed) avg += DEFS[t].spacing;
    avg /= keyed.length;
    const estRows = Math.max(1, Math.ceil((avg * count) / width));
    const rowWidth = () => width * (estRows < 3 ? 1 : 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, (rowIdx + 0.7) / (estRows + 0.4))));
    for (const it of keyed) {
      const w = DEFS[it.t].spacing;
      if (rowW + w > rowWidth() && row.length) flush();
      row.push(it); rowW += w;
    }
    flush();
    return z;
  }

  place(type, x, z, ox, hpMul = 1, elite = false) {
    const d = DEFS[type];
    const e = this.alloc();
    e.type = type; e.def = d;
    e.x = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, x)); e.z = z; e.vx = 0; e.ox = ox;
    e.hp = d.hp * hpMul; e.maxHp = e.hp; e.shield = d.shieldHits || 0; e.hpm = hpMul;
    e.state = ALIVE; e.t = 0; e.ph = this.game.rng.next() * Math.PI * 2;
    e.charging = false; e.flash = 0; e.sflash = 0; e.cd = 0; e.ckills = 0; e.slow = 1;
    e.burnPool = 0; e.burnT = 0; e.slowPct = 0; e.slowT = 0; e.freezeT = 0; e.shatter = 0; e.stickyT = 0; e.stickyPct = 0;
    e.px = 0; e.pz = 0; e.pud = 0; e.spd = 1; e.ice = 0; e.burn = 0;
    e.wave = null; e.wmul = 1;
    AI.onPlace(this, e, elite);
    if (this.game.status) this.game.status.onPlace(e);
    this.list.push(e);
    this.alive++;
    return e;
  }

  // ---------------- simulation ----------------
  update(dt) {
    const game = this.game;
    if (game.status) game.status.tickHorde(dt);
    const run = game.run;
    this.time += dt;
    this.stamp++;
    const squad = game.squad;
    const L = squad.leader;
    const dist = -L.z;
    const dLz = this.prevLz == null ? 0 : L.z - this.prevLz; // leader z change this step (<= 0 while running)
    this.prevLz = L.z; this.dLz = dLz; this.fwd = dt > 0 ? Math.max(0, -dLz / dt) : 0;
    const ev = this.events;
    while (this.cursor < ev.length && ev[this.cursor].at - dist < HORDE.spawnAhead) this.spawnWave(ev[this.cursor++], true);
    if (this.overflow.length) spawnOverflow(this, dist, MAX_ENEMIES, HORDE.spawnAhead);
    if (this.waves.length) updateWaves(this, dt, dist);
    AI.preStep(this, dt);
    AI.updatePulses(this, dt);

    const frozen = !!(game.powers && game.powers.has && game.powers.has('freeze'));
    const c = squad.center(this._c || (this._c = { x: 0, z: 0, r: 0 }));
    const base = HORDE.baseSpeed;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.t += dt;
      if (e.state === DYING) {
        if (e.t >= DIE_TIME) { list[i] = list[list.length - 1]; list.pop(); this.free.push(e); }
        continue;
      }
      if (e.state === SWELL) { // a dead Boomling swelling up: bursts after def.boom.swell s, then pops
        if (AI.swellStep(this, e, dt)) { e.state = DYING; e.t = DIE_TIME * 0.35; this.emitDie(e); }
        continue;
      }
      if (e.cd > 0) e.cd -= dt;
      if (frozen) continue;
      const ahead = L.z - e.z; // > 0 while the enemy is in front of the leader
      const w = e.wave;
      if (w && !w.go) { // a held wave waits at the edge of view (keeps its distance to the squad)
        if (!w.locked && ahead < HOLD_AT) w.locked = true;
        if (w.locked && e.freezeT <= 0 && !w.stand) e.z += dLz; // a gate screen stands its ground
      } else if (!e.charging && ahead < AGGRO) { e.charging = true; if (w) w.engaged = true; }
      if (e.charging && e.freezeT <= 0) { // frozen: no charge, sway or step
        const d = e.def;
        let tvx = 0;
        if (ahead < HORDE.steerRange && ahead > -2) {
          const tx = Math.max(-4.6, Math.min(4.6, c.x + e.ox * 0.55));
          tvx = Math.max(-3, Math.min(3, (tx - e.x) * 1.7));
        }
        e.vx += (tvx - e.vx) * Math.min(1, dt * 4);
        const mul = e.beh ? e.wmul * AI.step(this, e, dt, ahead) : e.wmul;
        e.x += (e.vx + e.dashV) * dt;
        e.z += base * d.speed * e.slow * e.spd * mul * dt;
        e.slow = Math.min(1, e.slow + dt * 2);
        if (e.x > MEMBER_CLAMP) e.x = MEMBER_CLAMP; else if (e.x < -MEMBER_CLAMP) e.x = -MEMBER_CLAMP;
      }
      if (e.def.heal && e.freezeT <= 0) AI.heal(this, e, dt);
      if (e.z > L.z + HORDE.despawnBehind) {
        this.alive--;
        if (e.wave) e.wave.alive--;
        list[i] = list[list.length - 1]; list.pop(); this.free.push(e);
      }
    }
    // rebuild the enemy grid (alive only)
    const grid = this.grid;
    grid.clear();
    for (let i = 0; i < list.length; i++) if (list[i].state === ALIVE) grid.insert(list[i], list[i].z);

    if (run && run.active && squad.count > 0) this.contacts(c);
    this.updateBlasts(dt);
    AI.updateShots(this, dt);
  }

  contacts(c) {
    const squad = this.game.squad;
    const L = squad.leader;
    const zMin = L.z - 2, zMax = c.z + c.r + 2;
    // quick reject: anything near the squad at all?
    let any = false;
    for (let k = Math.floor(zMin); k <= Math.floor(zMax) && !any; k++) { const bk = this.grid.buckets.get(k); if (bk && bk.length) any = true; }
    if (!any) return;
    const mg = this.mgrid;
    mg.clear();
    const lr = this.leaderRef; lr.x = L.x; lr.z = L.z;
    mg.insert(lr, L.z);
    const ms = squad.members;
    for (let i = 0; i < ms.length; i++) mg.insert(ms[i], ms[i].z);
    const shielded = this.game.shielded ? this.game.shielded() : !!(this.game.powers && this.game.powers.has && this.game.powers.has('shield'));
    const k0 = Math.floor(zMin), k1 = Math.floor(zMax);
    for (let k = k0; k <= k1; k++) {
      const b = this.grid.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const e = b[i];
        if (e.state !== ALIVE || e.y > 1.1) continue; // a Flapling up high flies over the squad until it dives
        const reach = CONTACT + e.def.r;
        const m = this.findMember(e.x, e.z, reach);
        if (!m) continue;
        if (squad.count <= 0) return;
        if (shielded) { this.kill(e, 'contact'); continue; }
        if (e.freezeT > 0 && e.shatter) { this.kill(e, 'shatter'); continue; } // Glacier freeze: shatters harmlessly
        const d = e.def;
        if (d.boom) { this.kill(e, 'contact'); continue; } // swells, then the burst does the damage
        if (d.blastRadius) {
          this.kill(e, 'contact');
          this.blastMembers(e.x, e.z, d.blastRadius, d.blastKills);
          this.queueBlast(e.x, e.z, d.blastRadius, 0);
        } else if (d.contactKills) {
          e.slow = 0.25;
          if (e.cd <= 0) {
            this.killMember(m, 'horde');
            e.cd = d.contactInterval; e.ckills++; e.flash = 1;
            if (e.ckills >= d.contactKills) this.kill(e, 'contact');
          }
        } else {
          this.killMember(m, 'horde');
          this.kill(e, 'contact');
        }
      }
    }
  }

  findMember(x, z, reach) {
    const r2 = reach * reach;
    const mg = this.mgrid;
    const k0 = Math.floor(z - reach), k1 = Math.floor(z + reach);
    for (let k = k0; k <= k1; k++) {
      const b = mg.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const m = b[i];
        if (m.hitStamp === this.stamp) continue;
        const dx = m.x - x, dz = m.z - z;
        if (dx * dx + dz * dz < r2) return m;
      }
    }
    return null;
  }

  killMember(m, reason) {
    const squad = this.game.squad;
    m.hitStamp = this.stamp;
    if (m.leader) squad.remove(1, reason);
    else squad.killMemberObj(m, reason);
  }

  /** Bomber reaching the squad: kills up to n members within r (nearest first). */
  blastMembers(x, z, r, n) {
    const squad = this.game.squad;
    for (let k = 0; k < n && squad.count > 0; k++) {
      let best = null, bd = r * r;
      const mg = this.mgrid;
      for (let kk = Math.floor(z - r); kk <= Math.floor(z + r); kk++) {
        const b = mg.buckets.get(kk);
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const m = b[i];
          if (m.hitStamp === this.stamp) continue;
          const dx = m.x - x, dz = m.z - z, d2 = dx * dx + dz * dz;
          if (d2 < bd && !(m.leader && squad.members.length > 0)) { bd = d2; best = m; }
        }
      }
      if (!best) break;
      this.killMember(best, 'bomb');
    }
  }

  queueBlast(x, z, r, delay) { this.blasts.push({ x, z, r, t: delay }); }

  updateBlasts(dt) {
    const bl = this.blasts;
    for (let guard = 0; guard < 4 && bl.length; guard++) {
      let fired = false;
      for (let i = bl.length - 1; i >= 0; i--) {
        const b = bl[i];
        b.t -= guard === 0 ? dt : 0;
        if (b.t > 0) continue;
        bl[i] = bl[bl.length - 1]; bl.pop();
        this.detonate(b.x, b.z, b.r);
        fired = true;
      }
      if (!fired) break;
    }
  }

  detonate(x, z, r) {
    this.game.events.emit('enemy:explode', { pos: { x, y: 0.5, z }, radius: r });
    this.game.events.emit('fx:shake', { amount: 0.25 });
    this.view.blast(x, z, r);
    const r2 = r * r;
    for (let k = Math.floor(z - r); k <= Math.floor(z + r); k++) {
      const b = this.grid.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const e = b[i];
        if (e.state !== ALIVE) continue;
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz < r2) this.kill(e, 'blast');
      }
    }
  }

  kill(e, cause) {
    if (e.state !== ALIVE) return;
    e.state = DYING; e.t = 0; e.flash = 1;
    this.alive--;
    const run = this.game.run;
    if (run) {
      run.kills++;
      if (run.killsBy) run.killsBy[KILL_CAT[cause] || 'other']++;
    }
    if (e.wave) e.wave.alive--;
    if (e.elite && run) run.stats.elites = (run.stats.elites || 0) + 1;
    if (e.def.boom) { AI.startSwell(this, e); return; } // its death pop + burst come when the swell ends
    this.emitDie(e);
    if (e.def.blastRadius && cause !== 'contact') this.queueBlast(e.x, e.z, e.def.blastRadius, cause === 'blast' ? CHAIN_DELAY : 0.02);
  }

  emitDie(e) {
    const p = this.diePos; p.x = e.x; p.y = 0.5 + (e.y || 0); p.z = e.z;
    if (this.game.events.wants('enemy:die')) this.game.events.emit('enemy:die', { type: e.def.id, pos: p, color: this.view.bodyColors[e.type] || e.def.color, elite: e.elite });
  }

  // ---------------- bullet target system ----------------
  sweep(b, x, z0, z1) {
    let best = null;
    const k0 = Math.floor(z1 - 0.8), k1 = Math.floor(z0 + 0.8);
    const buckets = this.grid.buckets;
    for (let k = k1; k >= k0; k--) {
      const bucket = buckets.get(k);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const e = bucket[i];
        if (e.state !== ALIVE) continue;
        const r = e.def.r + 0.06;
        if (Math.abs(x - e.x) > r) continue;
        if (e.z - r > z0 || e.z + r < z1) continue;
        if (best && e.z <= best.z) continue;
        if (b.nh && hasHit(b, e)) continue;
        best = e;
      }
    }
    return best;
  }

  hit(e, b) { return ops.bulletHit(this, e, b); }

  // ---------------- update 2 delegates (hordeops.js) ----------------
  /** One damage path: { killed, used, blocked } (scratch object). */
  applyDamage(e, dmg, unit, src) { return (this.last = ops.applyDamage(this, e, dmg, unit, src)); }
  forEachInRadius(x, z, r, fn) { ops.forEachInRadius(this, x, z, r, fn); }
  nearestUnhit(x, z, r, hits, nh, aheadOf) { return ops.nearestUnhit(this, x, z, r, hits, nh, aheadOf); }
  /** Sugar aim: nearest alive enemy ahead of z within the lane band (hordeops.nearestAhead). */
  nearestAheadBand(x, z, band, maxDist) { return ops.nearestAhead(this, x, z, band, maxDist); }

  // ---------------- queries (helpers, autopilot) ----------------
  /** Nearest alive enemy ahead of z (smaller z) within range, preferring small lateral offset. */
  nearestAhead(x, z, range) { return ops.nearestAheadRange(this, x, z, range); }
  /** Weighted count of enemies with |x - ex| < halfW and z in [zFar, zNear]. */
  densityAt(x, halfW, zFar, zNear) { return ops.densityAt(this, x, halfW, zFar, zNear); }

  sync(dt) { this.view.sync(dt, this.list, this.time, !!(this.game.powers && this.game.powers.has && this.game.powers.has('freeze')), this); }

  /** Tests / debug: waves, AI tallies, live special objects. */
  info() {
    let elites = 0, swelling = 0;
    for (const e of this.list) { if (e.state === ALIVE && e.elite) elites++; if (e.state === SWELL) swelling++; }
    return { alive: this.alive, elites, swelling, shots: this.shots.length, pulses: this.pulses.length, waves: waveInfo(this), waveStats: { ...this.waveStats }, ai: { ...this.aiStats }, rules: { ...this.ai } };
  }

  dispose() {}
}

/**
 * Elite flags for a shuffled type list: `eliteTypes` makes every enemy of those types elite, `elite` (0..1) an
 * evenly spread share of the rest (no dice: the list is already shuffled, and every wave gets its share).
 */
function eliteFlags(ev, types) {
  const frac = Math.max(0, Math.min(1, ev.elite || 0)), et = ev.eliteTypes;
  if (!(frac > 0) && !(et && et.length)) return null;
  const f = new Uint8Array(types.length);
  for (let i = 0; i < types.length; i++) {
    if (et && et.includes(ENEMY_TYPES[types[i]])) f[i] = 1;
    else if (frac > 0 && Math.floor((i + 1) * frac) > Math.floor(i * frac)) f[i] = 1;
  }
  return f;
}
