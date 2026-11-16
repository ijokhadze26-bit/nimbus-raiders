// GLACIUS, the Frozen Peaks boss (L30): a frost giant. Attacks (data in data/bosses.js):
//   freeze   blue lane warning on the squad (phase 2: a second one where it is drifting), then the lane freezes
//            for ~3 s: members inside freeze and break a few per second, Pip is slowed inside and cannot walk
//            back in. Step out quickly.
//   icewall  throws crystal walls that land just in front of the squad (the landing shards hit the front rows
//            under the warning); a wall soaks every bullet aimed through it until shot apart or melted, and
//            for its first few seconds Pip cannot walk into its lane (a squad already behind it can slide out)
//   icicles  icicles fall onto warning circles on / around the squad
//   pound    both fists hit the ice: frost shock crests race down 1-3 lane warnings toward the squad
// Phase 2 below 50%: the rune and crown blaze, frost aura, more of everything; the shared safe-spot step
// (attacks.safeSpot) runs once at the phase change: queued by BaseBoss itself when it has the safe-spot
// scheduler (`safeAuto` set), otherwise started here, and skipped when attacks.js has no safeSpot.
import * as THREE from 'three';
import { BaseBoss } from './base.js';
import * as attacks from './attacks.js';
import { buildGlacius } from '../../models/bosses/glacius.js';
import { FrostFx, frostPools } from './frostfx.js';

const GLOW1 = new THREE.Color('#7fe8ff'), GLOW2 = new THREE.Color('#e8fbff'), WHITE = new THREE.Color('#ffffff');
const CRYS1 = new THREE.Color('#2c6ea8'), CRYS2 = new THREE.Color('#5ab8ff');
const BLUE = '#2a7dff', ICE_RED = '#ff3a5a';
// the shared safe-spot step in Glacius colours (icy blast; the sheet keeps its default danger colour)
const SAFE_OPTS = { blast: '#9feeff' };
const clampX = (x, lim = 4.2) => Math.max(-lim, Math.min(lim, x));

export class Glacius extends BaseBoss {
  static preload(game) { game.bosses.model('glacius', buildGlacius); }

  constructor(game, cfg) { super(game, cfg); this.mini = !!cfg.mini; }

  buildModel() {
    const m = this.game.bosses.model('glacius', buildGlacius);
    m.root.position.set(0, 0, 0); m.root.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.scale.setScalar(1);
    m.head.rotation.set(0, 0, 0);
    this.pose = { raise: 0, throw: 0, side: 1, pound: 0, roar: 0, lean: 0 };
    this.glow = GLOW1.clone();
    this.crys = CRYS1.clone();
    this.frost = new FrostFx(this, frostPools(m));
    this.prevLX = null;
    this.zonePool = [];
    this.safePending = false;
    return m;
  }

  onLanded() {
    const g = this.game, low = g.engine && g.engine.quality === 'low';
    g.events.emit('fx:shake', { amount: 0.95 });
    g.gates.burst(this.x, 0.4, this.z + 2, 8, 1.4, '#e4f6ff', low ? 14 : 30);
    this.effects.ring(this.x, this.z + 1.5, 10, { color: '#bfefff', life: 0.6 });
    this.effects.glow(this.x, 1, this.z + 2, '#8fe8ff', 14, 0.5);
  }

  // ---------------- attacks ----------------
  startAttack(id, spec) {
    if (this.safePending) {
      this.safePending = false;
      if (typeof attacks.safeSpot === 'function') { const a = attacks.safeSpot(this, this.safeSpotOpts()); if (a) return a; }
    }
    if (id === 'icewall') return this.wallAttack(spec);
    if (id === 'icicles') return this.icicleAttack(spec);
    if (id === 'pound') return this.poundAttack(spec);
    return this.freezeAttack(spec);
  }

  /** Lane x for strip k: 0 on the squad, odd ones on the side it is drifting toward. */
  laneX(k, hw) {
    const c = this.squadCenter(), L = this.game.squad.leader;
    let x = c.x;
    if (k % 2 === 1) {
      const dir = Math.abs(L.vx || 0) > 0.5 ? Math.sign(L.vx) : (c.x > 0 ? -1 : 1);
      x = c.x + dir * (hw * 2 + 1.0);
    }
    return clampX(x, 5 - hw * 0.6);
  }

  freezeAttack(spec) {
    const game = this.game, T = game.telegraph, self = this;
    const p2 = this.phase === 2;
    const n = p2 ? spec.count2 : spec.count, hw = p2 ? spec.halfW2 : spec.halfW;
    const dur = this.warnTime(spec.telegraph);
    const strips = [];
    let t = 0;
    const place = (k) => {
      const c = self.squadCenter(), x = self.laneX(k, hw);
      const zFar = c.z - c.r - 3.5, zNear = c.z + c.r + 2.5;
      strips.push({ start: t, x, zFar, zNear, mark: T.lane(x - hw, x + hw, zNear, zFar, dur, { attack: 'freeze', color: BLUE }), hit: false });
    };
    return {
      update(dt) {
        t += dt;
        while (strips.length < n && t >= strips.length * spec.stagger) place(strips.length);
        let pending = false;
        for (const s of strips) {
          const lt = t - s.start;
          if (!s.hit && lt >= dur) {
            s.hit = true;
            self.frost.freezeLane(s.x - hw, s.x + hw, s.zNear, s.zFar, spec.life);
            self.pose.pound = 0.6;
            for (let k = 0; k < 3; k++) self.effects.glow(s.x, 0.5, s.zFar + ((k + 0.5) / 3) * (s.zNear - s.zFar), '#9feeff', hw * 3, 0.4);
            game.events.emit('boss:attack', { attack: 'frostlane', pos: { x: s.x, y: 0, z: (s.zFar + s.zNear) / 2 } });
            game.events.emit('fx:shake', { amount: 0.3 });
          }
          if (!s.hit) pending = true;
        }
        self.pose.raise = pending ? Math.min(1, t / dur) * 0.7 : 0;
        return strips.length >= n && !pending && t - strips[n - 1].start >= dur + 0.35;
      },
      cancel() { for (const s of strips) T.cancel(s.mark); },
    };
  }

  wallAttack(spec) {
    const game = this.game, T = game.telegraph, self = this;
    const p2 = this.phase === 2;
    const n = p2 ? spec.count2 : spec.count, hw = spec.halfW;
    const dur = this.warnTime(spec.telegraph);
    const walls = [];
    let t = 0;
    const L = game.squad.leader;
    const place = (k) => {
      const x = self.laneX(k, hw);
      const wz = L.z - spec.ahead;
      // the landing shards reach the front rows: the warning covers the wall footprint + the squad's front
      const zFar = wz - 0.7, zNear = L.z + spec.reach;
      walls.push({ start: t, x, wz, zFar, zNear, mark: T.lane(x - hw, x + hw, zNear, zFar, dur, { attack: 'icewall' }), hit: false, thrown: false });
    };
    return {
      update(dt) {
        t += dt;
        while (walls.length < n && t >= walls.length * spec.stagger) place(walls.length);
        let pending = false;
        for (let i = 0; i < walls.length; i++) {
          const w = walls[i], lt = t - w.start;
          if (!w.thrown && lt >= dur - spec.flight) {
            w.thrown = true;
            self.pose.throw = 1; self.pose.side = i % 2 ? -1 : 1;
            const hand = self.handPos(self.pose.side);
            self.effects.orb(hand.x, hand.y, hand.z, w.x, w.wz, dur - lt, { color: '#bfefff', core: '#ffffff', arc: 5, size: 1.1 });
          }
          if (!w.hit && lt >= dur) {
            w.hit = true;
            const kills = self.killInBox(w.x, hw, w.zFar, w.zNear);
            self.frost.wall(w.x, hw, w.wz, Math.max(1, self.maxHp * spec.hpFrac), spec.life).block = spec.block ?? 2.5;
            game.gates.burst(w.x, 0.6, w.wz, hw * 1.6, 1.6, '#dff6ff', game.engine.quality === 'low' ? 6 : 14);
            self.effects.ring(w.x, w.wz, hw * 2, { color: '#cfefff' });
            game.events.emit('boss:attack', { attack: 'icewall', pos: { x: w.x, y: 0, z: w.wz } });
            game.events.emit('fx:shake', { amount: kills > 0 ? 0.55 : 0.4 });
          }
          if (!w.hit) pending = true;
        }
        return walls.length >= n && !pending && t - walls[n - 1].start >= dur + 0.4;
      },
      cancel() { for (const w of walls) T.cancel(w.mark); },
    };
  }

  icicleAttack(spec) {
    const game = this.game, T = game.telegraph, rng = game.rng, self = this;
    const p2 = this.phase === 2;
    const n = this.tierCount(p2 ? spec.count2 : spec.count, 0.25);
    const dur = this.warnTime(spec.telegraph);
    const shots = [];
    let t = 0;
    const place = (k) => {
      const c = self.squadCenter();
      const sp = k === 0 ? 0.4 : spec.spread;
      const x = clampX(c.x + rng.range(-sp, sp)), z = c.z + rng.range(-sp, sp) * 0.6;
      shots.push({ start: t, mark: T.circle(x, z, spec.radius, dur, { attack: 'icicle', color: BLUE }), dropped: false, hit: false });
    };
    return {
      update(dt) {
        t += dt;
        while (shots.length < n && t >= shots.length * spec.stagger) place(shots.length);
        let pending = false;
        for (const s of shots) {
          const lt = t - s.start, h = s.mark;
          if (!s.dropped && lt >= dur - 0.42) { s.dropped = true; self.frost.icicle(h.x, h.z, 0.9 + h.r * 0.25); }
          if (!s.hit && lt >= dur) {
            s.hit = true;
            const kills = self.killInCircle(h.x, h.z, h.r);
            self.effects.ring(h.x, h.z, h.r * 1.5, { color: '#dff6ff' });
            if (game.engine.quality !== 'low') game.gates.burst(h.x, 0.3, h.z, h.r, 1.2, '#e8f8ff', 6);
            game.events.emit('boss:attack', { attack: 'icicle', pos: { x: h.x, y: 0, z: h.z } });
            game.events.emit('fx:shake', { amount: kills > 0 ? 0.35 : 0.2 });
          }
          if (!s.hit) pending = true;
        }
        self.pose.raise = pending ? Math.min(1, t / 0.5) : 0;
        return shots.length >= n && !pending && t - shots[n - 1].start >= dur + 0.3;
      },
      cancel() { for (const s of shots) T.cancel(s.mark); },
    };
  }

  poundAttack(spec) {
    const game = this.game, T = game.telegraph, self = this;
    const p2 = this.phase === 2;
    const n = p2 ? spec.count2 : spec.count, hw = spec.halfW;
    const dur = this.warnTime(spec.telegraph);
    const c = this.squadCenter();
    // lane 0 on the squad, lane 1 (phase 2) on the side it is drifting toward, a wide safe gap between
    const xs = [this.laneX(0, hw)];
    if (n > 1) {
      const L = game.squad.leader;
      const dir = Math.abs(L.vx || 0) > 0.5 ? Math.sign(L.vx) : (c.x > 0 ? -1 : 1);
      xs.push(clampX(xs[0] + dir * (hw * 2 + spec.gap), 5 - hw * 0.6));
      if (Math.abs(xs[1] - xs[0]) < hw * 2 + spec.gap - 0.01) xs[1] = clampX(xs[0] - dir * (hw * 2 + spec.gap), 5 - hw * 0.6);
    }
    const zFar = this.homeZ + 3, zNear = c.z + c.r + 2.5;
    const marks = xs.map((x) => T.lane(x - hw, x + hw, zNear, zFar, dur, { attack: 'pound', color: ICE_RED }));
    let t = 0, launched = false, hit = false;
    this.lockX = 0;
    return {
      update(dt) {
        t += dt;
        self.pose.raise = Math.min(1, t / (dur * 0.75));
        if (!launched && t >= dur - spec.travel) {
          launched = true;
          self.pose.pound = 1; self.pose.raise = 0;
          for (const x of xs) { self.effects.crest(x, hw, zFar, zNear, spec.travel, '#7fd0ff'); self.frost.spikeWave(x, hw, zFar, zNear, spec.travel); }
          game.events.emit('fx:shake', { amount: 0.7 });
        }
        if (launched) self.pose.raise = 0;
        if (!hit && t >= dur) {
          hit = true;
          let kills = 0;
          for (const x of xs) {
            kills += self.killInBox(x, hw, zFar, zNear);
            for (let k = 0; k < 3; k++) self.effects.ring(x, zNear - (k + 0.5) * 2.2, hw * 1.7, { color: '#dff6ff', life: 0.35 });
          }
          game.events.emit('boss:attack', { attack: 'pound', pos: { x: self.x, y: 0, z: self.z + 3 } });
          game.events.emit('fx:shake', { amount: kills > 0 ? 0.6 : 0.4 });
        }
        if (t >= dur + 0.45) { self.lockX = null; return true; }
        return false;
      },
      cancel() { for (const m of marks) T.cancel(m); self.lockX = null; },
    };
  }

  /** Look of the shared safe-spot step (read by BaseBoss when it runs the step itself). */
  safeSpotOpts() { return SAFE_OPTS; }

  /** World position of a fist (throw origin). */
  handPos(side) { return { x: this.x + side * 3.2, y: 6.5, z: this.z + 1.2 }; }

  // ---------------- per-step logic ----------------
  update(dt) {
    super.update(dt);
    const fr = this.frost;
    fr.update(dt);
    const game = this.game, squad = game.squad, L = squad.leader;
    const fighting = this.state === 'fight' || this.state === 'intro';
    // frozen lanes: Pip wades slowly inside and cannot walk back in; members inside break a few per second
    if (this.prevLX !== null && fighting) {
      const lane = fr.frozenAt(L.x, L.z, 0.15), px = this.prevLX;
      if (lane && px > lane.x0 && px < lane.x1) L.x = px + (L.x - px) * 0.45;
      else if (lane) L.x = px < lane.x0 ? lane.x0 - 0.15 : lane.x1 + 0.15;
    }
    // fresh ice walls (first spec.block s): Pip cannot walk into a wall's lane from outside (one behind it may
    // slide out); afterwards the wall only soaks bullets until it is shot apart or melts
    if (this.prevLX !== null && fighting) {
      const px = this.prevLX;
      for (const w of fr.walls) {
        if (!w.active || w.end >= 0 || w.t > w.block) continue;
        const x0 = w.x - w.hw, x1 = w.x + w.hw;
        if (px <= x0 && L.x > x0) L.x = x0;
        else if (px >= x1 && L.x < x1) L.x = x1;
      }
    }
    this.prevLX = L.x;
    if (fighting) for (const lane of fr.lanes) {
      if (!lane.active || lane.t >= lane.life || squad.count <= 0) continue;
      const ms = squad.members;
      let n = 0, last = -1;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m.x > lane.x0 && m.x < lane.x1 && m.z > lane.zFar && m.z < lane.zNear) { n++; last = i; }
      }
      if (!n) { lane.budget = 0; continue; }
      lane.budget += dt * Math.min(this.def.freezeCap, 1.2 + n * this.def.freezeRate);
      while (lane.budget >= 1 && last >= 0 && squad.count > 0) {
        lane.budget -= 1;
        const m = ms[last];
        game.gates.burst(m.x, 0.6, m.z, 0.4, 0.6, '#dff6ff', 3);
        squad.killMember(last, 'boss');
        last--;
        while (last >= 0 && !(ms[last].x > lane.x0 && ms[last].x < lane.x1 && ms[last].z > lane.zFar && ms[last].z < lane.zNear)) last--;
      }
    }
    // autopilot: frozen lanes + the shot-shadow behind each standing wall
    this.dangerZones.length = 0;
    if (this.state === 'fight') {
      for (const l of fr.lanes) if (l.active && l.t < l.life) this.pushZone(l.x0, l.x1, l.zNear, l.zFar);
      for (const w of fr.walls) if (w.active && w.end < 0) this.pushZone(w.x - w.hw * 0.8, w.x + w.hw * 0.8, L.z + 10, w.z);
    }
  }

  /** Appends a pooled lane-shaped danger zone (no per-step allocation). */
  pushZone(x0, x1, zNear, zFar) {
    const zones = this.dangerZones, pool = this.zonePool;
    const z = pool[zones.length] || (pool[zones.length] = { kind: 'lane', x0: 0, x1: 0, zNear: 0, zFar: 0, x: 0, z: 0 });
    z.x0 = x0; z.x1 = x1; z.zNear = zNear; z.zFar = zFar; z.x = (x0 + x1) / 2; z.z = (zNear + zFar) / 2;
    zones.push(z);
  }

  onPhase2() {
    this.pose.roar = 1;
    // a BaseBoss with the safe-spot scheduler (bosses-upgrade: `safeAuto`) queues the step itself
    this.safePending = !this.mini && this.safeAuto === undefined;
    const g = this.game;
    this.effects.ring(this.x, this.z + 1, 11, { color: '#dff6ff', life: 0.7 });
    g.gates.burst(this.x, 4, this.z + 2.5, 6, 4, '#bfefff', g.engine.quality === 'low' ? 10 : 24);
  }

  onDeath() { this.frost.clear(); }

  disposeExtra() { this.frost.dispose(); }

  // ---------------- visuals ----------------
  animate(dt, t) {
    const m = this.model, p = this.pose, low = this.game.engine.quality === 'low';
    p.throw = Math.max(0, p.throw - dt * 2.6);
    p.pound = Math.max(0, p.pound - dt * 2.2);
    p.roar = Math.max(0, p.roar - dt * 0.9);
    const intro = this.state === 'intro' ? Math.sin(Math.min(1, this.t / 1.25) * Math.PI) : 0;
    const roar = Math.max(intro, p.roar);
    const breathe = Math.sin(t * 1.4);
    m.body.position.y = breathe * 0.06 - p.pound * 0.4;
    m.body.rotation.x = p.pound * 0.2 - p.raise * 0.08 - roar * 0.08;
    m.body.rotation.z = Math.sin(t * 0.7) * 0.025;
    m.head.rotation.x = -roar * 0.4 + p.pound * 0.15;
    m.head.rotation.y = Math.sin(t * 0.5) * 0.1;
    for (let i = 0; i < 2; i++) {
      const arm = m.arms[i], side = i === 0 ? -1 : 1;
      const thr = p.side === side ? p.throw : 0;
      const raise = Math.max(p.raise, roar * 0.7);
      let rx = -0.1 + breathe * 0.04 - raise * 2.5;
      rx = rx * (1 - p.pound) + -1.05 * p.pound;
      rx = rx * (1 - thr) + -2.2 * thr * (1 - thr * 0.4);
      arm.rotation.x = rx;
      arm.rotation.z = side * (0.1 + raise * 0.3 + roar * 0.35);
    }
    // glow: cyan -> blazing white-blue in phase 2, white flash on hits
    const p2 = this.phase === 2, k = Math.min(1, dt * 3);
    this.glow.lerp(p2 ? GLOW2 : GLOW1, k);
    this.crys.lerp(p2 ? CRYS2 : CRYS1, k);
    const pulse = p2 ? 0.8 + 0.2 * Math.sin(t * 9) : 0.9 + 0.1 * Math.sin(t * 3);
    m.glowMat.color.copy(this.glow).multiplyScalar(pulse).lerp(WHITE, this.flash * 0.4);
    m.core.material.color.copy(m.glowMat.color);
    m.core.material.opacity = 0.55 + 0.3 * pulse;
    m.crystalMat.emissive.copy(this.crys).multiplyScalar(0.85 + 0.25 * Math.sin(t * 2.2) + this.flash * 0.4);
    const fl = this.flash;
    m.mat.emissive.setRGB(fl * 0.14, fl * 0.16, fl * 0.2);
    m.aura.visible = !low;
    m.aura.material.opacity = (p2 ? 0.28 + 0.08 * Math.sin(t * 4) : 0.1) + p.raise * 0.15;
    if (this.state === 'dying' || this.state === 'dead') {
      // death: cracks blaze white, he shudders and sinks through the ice as shards burst off
      const f = Math.min(1, this.t / 1.55);
      m.body.position.x = Math.sin(t * 60) * 0.2 * (1 - f);
      m.root.position.y = this.y - f * f * 7.5;
      m.root.rotation.x = -f * 0.35;
      m.glowMat.color.copy(WHITE);
      m.mat.emissive.setRGB(0.4 * (1 - f), 0.5 * (1 - f), 0.6 * (1 - f));
      if (Math.random() < (low ? 0.12 : 0.3)) this.game.gates.burst(this.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 6, this.z + 1.6, 1.5, 1.5, '#dff6ff', 6);
    } else {
      m.root.rotation.set(0, 0, 0);
      m.body.position.x = 0;
    }
    this.frost.sync(this.game.time);
  }
}
