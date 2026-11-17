// Horde: all Murklings. Spawns blobs from level 'horde' events, idles until the squad is near, charges +Z,
// steers toward the squad, resolves bullet hits (z-grid), contact kills (tank multi-kill, bomber blasts),
// chain explosions. Rendering lives in hordeview.js (one InstancedMesh per type).
// Update 2: status (burn / slow / freeze / pull) ticks first (game.status.tickHorde); every hp change goes
// through hordeops.applyDamage (matchups, shields, carry); the spatial queries live in hordeops.js too.
import { HORDE, LANES, MEMBER_CLAMP } from '../config.js';
import { ENEMIES, ENEMY_TYPES, ENEMY_INDEX } from '../data/enemies.js';
import { ZGrid } from '../core/grid.js';
import { HordeView } from './hordeview.js';
import { hasHit } from './bullets.js';
import { HIT } from '../config.js';
import * as ops from './hordeops.js';

export const ALIVE = 0, DYING = 1;
const KILL_CAT = { bullet: 'weapon', weapon: 'weapon', burn: 'weapon', shatter: 'weapon', ability: 'ability', helper: 'helper' };
const CONTACT = 0.55;       // + type radius (SPEC §5)
const AGGRO = 52;           // idle blobs start charging when the squad is this close
const MAX_ENEMIES = 900;
const DIE_TIME = 0.17;
const FALL_TIME = 0.75; // a Murkling dropping into the void
const CHAIN_DELAY = 0.11;
const DEFS = ENEMY_TYPES.map((t) => ENEMIES[t]);

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
    this.view.reset();
  }

  get count() { return this.alive; }

  /** Skip all not-yet-spawned waves (debug skipToBoss). */
  skipAll() { this.cursor = this.events.length; for (const e of this.list) if (e.state === ALIVE) { e.state = DYING; e.t = DIE_TIME; this.alive--; } }

  alloc() {
    return this.free.length ? this.free.pop() : { type: 0, def: null, x: 0, z: 0, vx: 0, hp: 1, maxHp: 1, shield: 0, state: 0, t: 0, ph: 0, ox: 0, charging: false, flash: 0, sflash: 0, cd: 0, ckills: 0, slow: 1,
      burnPool: 0, burnT: 0, slowPct: 0, slowT: 0, freezeT: 0, shatter: 0, stickyT: 0, stickyPct: 0, px: 0, pz: 0, pud: 0, spd: 1, ice: 0, burn: 0 };
  }

  // ---------------- spawning ----------------
  spawnWave(ev) {
    const rng = this.game.rng;
    const count = Math.max(1, Math.min(ev.count | 0, MAX_ENEMIES - this.list.length));
    if (count <= 0) return;
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
    // shuffle then stable-sort by front priority (tanks + shields lead the charge)
    for (let i = types.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = types[i]; types[i] = types[j]; types[j] = t; }
    const keyed = types.map((t, i) => ({ t, k: DEFS[t].front * 1000 + i }));
    keyed.sort((a, b) => a.k - b.k);
    // pack rows from the front (largest z) backward
    let z = -ev.at + (ev.depth ? ev.depth / 2 : Math.sqrt(count) * 0.32);
    let row = [], rowW = 0, rowIdx = 0;
    const flush = () => {
      if (!row.length) return;
      let depth = 0;
      for (const t of row) depth = Math.max(depth, DEFS[t].spacing);
      const stagger = rowIdx & 1 ? 0.18 : -0.18;
      let x = cx - rowW / 2 + stagger;
      for (const t of row) {
        const d = DEFS[t];
        x += d.spacing / 2;
        this.place(t, x + rng.range(-0.14, 0.14), z - depth / 2 + rng.range(-0.24, 0.24), x - cx, hpMul);
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
    for (const { t } of keyed) {
      const w = DEFS[t].spacing;
      if (rowW + w > rowWidth() && row.length) flush();
      row.push(t); rowW += w;
    }
    flush();
    this.game.events.emit('horde:incoming', { count });
  }

  place(type, x, z, ox, hpMul = 1) {
    const d = DEFS[type];
    const e = this.alloc();
    e.type = type; e.def = d;
    e.x = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, x)); e.z = z; e.vx = 0; e.ox = ox;
    e.hp = d.hp * hpMul; e.maxHp = e.hp; e.shield = d.shieldHits || 0;
    e.state = ALIVE; e.t = 0; e.fall = false; e.ph = this.game.rng.next() * Math.PI * 2;
    e.charging = false; e.flash = 0; e.sflash = 0; e.cd = 0; e.ckills = 0; e.slow = 1;
    e.burnPool = 0; e.burnT = 0; e.slowPct = 0; e.slowT = 0; e.freezeT = 0; e.shatter = 0; e.stickyT = 0; e.stickyPct = 0;
    e.px = 0; e.pz = 0; e.pud = 0; e.spd = 1; e.ice = 0; e.burn = 0;
    if (this.game.status) this.game.status.onPlace(e);
    this.list.push(e);
    this.alive++;
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
    const ev = this.events;
    while (this.cursor < ev.length && ev[this.cursor].at - dist < HORDE.spawnAhead) this.spawnWave(ev[this.cursor++]);

    const frozen = !!(game.powers && game.powers.has && game.powers.has('freeze'));
    const voids = game.obstacles;
    const c = squad.center(this._c || (this._c = { x: 0, z: 0, r: 0 }));
    const base = HORDE.baseSpeed;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.t += dt;
      if (e.state === DYING) {
        if (e.t >= (e.fall ? FALL_TIME : DIE_TIME)) { list[i] = list[list.length - 1]; list.pop(); this.free.push(e); }
        continue;
      }
      if (e.cd > 0) e.cd -= dt;
      if (frozen) continue;
      const ahead = L.z - e.z; // > 0 while the enemy is in front of the leader
      if (!e.charging && ahead < AGGRO) e.charging = true;
      if (e.charging && e.freezeT <= 0) { // frozen: no charge, sway or step
        const d = e.def;
        let tvx = 0;
        if (ahead < HORDE.steerRange && ahead > -2) {
          const tx = Math.max(-4.6, Math.min(4.6, c.x + e.ox * 0.55));
          tvx = Math.max(-3, Math.min(3, (tx - e.x) * 1.7));
        }
        e.vx += (tvx - e.vx) * Math.min(1, dt * 4);
        e.x += e.vx * dt;
        e.z += base * d.speed * e.slow * e.spd * dt;
        e.slow = Math.min(1, e.slow + dt * 2);
        if (e.x > MEMBER_CLAMP) e.x = MEMBER_CLAMP; else if (e.x < -MEMBER_CLAMP) e.x = -MEMBER_CLAMP;
        // Murklings fall too: one that charges onto broken road drops into the void (lure a pack over a cliff)
        if (voids && voids.gaps.length && voids.overOpen(e.x, e.z)) { e.fall = true; this.kill(e, 'fall'); continue; }
      }
      if (e.z > L.z + HORDE.despawnBehind) {
        this.alive--;
        list[i] = list[list.length - 1]; list.pop(); this.free.push(e);
      }
    }
    // rebuild the enemy grid (alive only)
    const grid = this.grid;
    grid.clear();
    for (let i = 0; i < list.length; i++) if (list[i].state === ALIVE) grid.insert(list[i], list[i].z);

    if (run && run.active && squad.count > 0) this.contacts(c);
    this.updateBlasts(dt);
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
        if (e.state !== ALIVE) continue;
        const reach = CONTACT + e.def.r;
        const m = this.findMember(e.x, e.z, reach);
        if (!m) continue;
        if (squad.count <= 0) return;
        if (shielded) { this.kill(e, 'contact'); continue; }
        if (e.freezeT > 0 && e.shatter) { this.kill(e, 'shatter'); continue; } // Glacier freeze: shatters harmlessly
        const d = e.def;
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
    e.state = DYING; e.t = 0; e.flash = cause === 'fall' ? 0 : 1;
    if (cause !== 'fall') e.fall = false;
    this.alive--;
    const run = this.game.run;
    if (run) {
      run.kills++;
      if (run.killsBy) run.killsBy[KILL_CAT[cause] || 'other']++;
    }
    const p = this.diePos; p.x = e.x; p.y = 0.5; p.z = e.z;
    if (cause !== 'fall' && this.game.events.wants('enemy:die')) this.game.events.emit('enemy:die', { type: e.def.id, pos: p, color: this.view.bodyColors[e.type] || e.def.color });
    if (e.def.blastRadius && cause !== 'contact' && cause !== 'fall') this.queueBlast(e.x, e.z, e.def.blastRadius, cause === 'blast' ? CHAIN_DELAY : 0.02);
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
  nearestAhead(x, z, range) {
    let best = null, bs = Infinity;
    for (let k = Math.floor(z); k >= Math.floor(z - range); k--) {
      const b = this.grid.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const e = b[i];
        if (e.state !== ALIVE) continue;
        const s = (z - e.z) + Math.abs(e.x - x) * 1.5;
        if (s < bs) { bs = s; best = e; }
      }
      if (best && z - k > (z - best.z) + 6) break;
    }
    return best;
  }

  /** Weighted count of enemies with |x - ex| < halfW and z in [zFar, zNear]. */
  densityAt(x, halfW, zFar, zNear) {
    let n = 0;
    for (let k = Math.floor(zFar); k <= Math.floor(zNear); k++) {
      const b = this.grid.buckets.get(k);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const e = b[i];
        if (e.state === ALIVE && Math.abs(e.x - x) < halfW) n += e.def.hp > 4 ? 4 : 1;
      }
    }
    return n;
  }

  sync(dt) { this.view.sync(dt, this.list, this.time, !!(this.game.powers && this.game.powers.has && this.game.powers.has('freeze'))); }

  dispose() {}
}
