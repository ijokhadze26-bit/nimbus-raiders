// Pickups on the road: power tokens ({type:'powerup', at, lane, kind}) and coin runs ({type:'coins', at, lane,
// count, pattern:'line'|'zigzag'}). Any member (or Pip) touching one collects it. Coins are one InstancedMesh;
// tokens are pooled groups. Magnet pulls coins + tokens from both lanes with streaks (one instanced draw).
// Emits coin:collect { amount, pos } and pickup:collect { kind, pos } (then powers.start(kind)).
import * as THREE from 'three';
import { LANES, TARGET_CLAMP } from '../config.js';
import { buildPowerToken, coinGeometry, coinMaterial, streakTexture, streakGeometry, POWER_STYLE } from '../models/pickups.js';
import { markInstances } from '../core/pool.js';

const SPAWN_AHEAD = 110;
const MAX_COINS = 256, MAX_STREAKS = 96;
const COIN_R = 0.6, TOKEN_R = 0.95;
const COIN_GAP = 1.5;
const MAGNET_AHEAD = 34;
const COIN_FLY = 0.3, TOKEN_FLY = 0.4;
const LIVE = 0, PULLED = 1, FLY = 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();
const COIN_STREAK = new THREE.Color('#ffd34d');

export class Pickups {
  init(game) {
    this.game = game;
    this.coins = [];
    this.coinFree = [];
    this.tokens = [];
    this.tokenPool = new Map();
    this.cursor = { powerup: 0, coins: 0 };
    this.time = 0;
    this.run = null;
    this.c = { x: 0, z: 0, r: 0 };
    this.coinMesh = new THREE.InstancedMesh(coinGeometry(), coinMaterial(), MAX_COINS);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    this.streaks = new THREE.InstancedMesh(streakGeometry(), new THREE.MeshBasicMaterial({
      map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }), MAX_STREAKS);
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    this.streaks.renderOrder = 4;
    this.streaks.setColorAt(0, COIN_STREAK);
    game.scene.add(this.coinMesh, this.streaks);
  }

  reset(run) {
    for (const cn of this.coins) this.coinFree.push(cn);
    this.coins.length = 0;
    for (const tk of this.tokens) this.releaseToken(tk);
    this.tokens.length = 0;
    this.cursor.powerup = 0; this.cursor.coins = 0;
    this.time = 0;
    this.run = run;
  }

  skipAll() {
    const run = this.run;
    if (!run) return;
    this.cursor.powerup = run.eventsOf('powerup').length;
    this.cursor.coins = run.eventsOf('coins').length;
    for (const cn of this.coins) this.coinFree.push(cn);
    this.coins.length = 0;
    for (const tk of this.tokens) this.releaseToken(tk);
    this.tokens.length = 0;
  }

  /** Live (uncollected) tokens and coins ahead (autopilot). */
  upcoming() { return this.tokens; }

  // ---------------- spawning ----------------
  laneX(e) {
    if (e.x !== undefined) return e.x;
    return (LANES[e.lane] ?? 0) + (e.dx || 0);
  }

  spawnCoins(e) {
    const n = Math.max(1, Math.min(40, e.count || 6));
    const x0 = this.laneX(e);
    const amp = e.lane === 'C' || e.lane === undefined ? 3 : 1.3;
    for (let i = 0; i < n && this.coins.length < MAX_COINS; i++) {
      const cn = this.coinFree.length ? this.coinFree.pop() : {};
      let x = x0;
      if (e.pattern === 'zigzag') x = x0 + Math.sin(i * 0.95) * amp;
      cn.x = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, x));
      cn.z = -(e.at + i * COIN_GAP);
      cn.y = 0.75; cn.state = LIVE; cn.t = 0; cn.sp = 0; cn.dx = 0; cn.dz = 0;
      cn.ph = (e.at * 0.31 + i * 0.7) % 6.28;
      this.coins.push(cn);
    }
  }

  spawnToken(e) {
    const kind = POWER_STYLE[e.kind] ? e.kind : 'shield';
    const list = this.tokenPool.get(kind);
    const v = list && list.length ? list.pop() : buildPowerToken(kind);
    v.root.visible = true;
    v.root.scale.setScalar(1);
    this.game.scene.add(v.root);
    const x = Math.max(-TARGET_CLAMP, Math.min(TARGET_CLAMP, this.laneX(e)));
    this.tokens.push({ kind, x, z: -e.at, y: 1.15, state: LIVE, t: 0, sp: 0, dx: 0, dz: 0, ph: (e.at * 0.53) % 6.28, visual: v });
  }

  releaseToken(tk) {
    const v = tk.visual;
    if (!v) return;
    this.game.scene.remove(v.root);
    if (!this.tokenPool.has(tk.kind)) this.tokenPool.set(tk.kind, []);
    this.tokenPool.get(tk.kind).push(v);
    tk.visual = null;
  }

  // ---------------- logic ----------------
  update(dt) {
    const game = this.game;
    const run = this.run;
    if (!run) return;
    this.time += dt;
    const sq = game.squad, L = sq.leader;
    const dist = -L.z;
    const pe = run.eventsOf('powerup');
    while (this.cursor.powerup < pe.length && pe[this.cursor.powerup].at - dist < SPAWN_AHEAD) this.spawnToken(pe[this.cursor.powerup++]);
    const ce = run.eventsOf('coins');
    while (this.cursor.coins < ce.length && ce[this.cursor.coins].at - dist < SPAWN_AHEAD) this.spawnCoins(ce[this.cursor.coins++]);

    const live = run.active && sq.count > 0;
    const magnet = !!(game.powers && game.powers.has('magnet'));
    const c = sq.center(this.c);
    const tx = c.x, tz = (L.z + c.z) / 2;          // pull target: middle of the squad
    const zBack = c.z + c.r + 0.6;
    const speed = Math.max(4, sq.speed);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const cn = this.coins[i];
      if (cn.state === FLY) {
        cn.t += dt;
        cn.z -= sq.speed * dt * 0.9;
        if (cn.t >= COIN_FLY) this.dropCoin(i);
        continue;
      }
      if (cn.state === LIVE && cn.z > L.z + 10) { this.dropCoin(i); continue; }
      if (!live) continue;
      if (cn.state === LIVE && magnet && cn.z > L.z - MAGNET_AHEAD && cn.z < zBack + 3) { cn.state = PULLED; cn.sp = speed + 4; }
      if (cn.state === PULLED) this.pull(cn, tx, tz, dt);
      if (this.touches(cn.x, cn.z, COIN_R, c) || (cn.state === PULLED && this.near(cn, tx, tz, 0.9))) this.collectCoin(cn);
    }
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const tk = this.tokens[i];
      if (tk.state === FLY) {
        tk.t += dt;
        if (tk.t >= TOKEN_FLY) { this.releaseToken(tk); this.tokens.splice(i, 1); }
        continue;
      }
      if (tk.z > L.z + 10) { this.releaseToken(tk); this.tokens.splice(i, 1); continue; }
      if (!live) continue;
      if (tk.state === LIVE && magnet && tk.z > L.z - MAGNET_AHEAD && tk.z < zBack + 3) { tk.state = PULLED; tk.sp = speed + 3; }
      if (tk.state === PULLED) this.pull(tk, tx, tz, dt);
      if (this.touches(tk.x, tk.z, TOKEN_R, c) || (tk.state === PULLED && this.near(tk, tx, tz, 1.1))) this.collectToken(tk);
    }
  }

  pull(o, tx, tz, dt) {
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz) || 0.001;
    o.sp += 46 * dt;
    const step = Math.min(d, o.sp * dt);
    o.dx = dx / d; o.dz = dz / d;
    o.x += o.dx * step; o.z += o.dz * step;
  }

  near(o, tx, tz, r) { const dx = tx - o.x, dz = tz - o.z; return dx * dx + dz * dz < r * r; }

  /** Any member (or Pip) within r of (x, z)? */
  touches(x, z, r, c) {
    const sq = this.game.squad, L = sq.leader;
    if (z < L.z - r - 0.6 || z > c.z + c.r + r + 0.4) return false;
    const lx = L.x - x, lz = L.z - z, rl = r + 0.15;
    if (!sq.pipGone && lx * lx + lz * lz < rl * rl) return true;
    if (Math.abs(x - c.x) > c.r + r + 0.4) return false;
    const r2 = r * r, ms = sq.members;
    for (let i = 0; i < ms.length; i++) {
      const dx = ms[i].x - x, dz = ms[i].z - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  collectCoin(cn) {
    cn.state = FLY; cn.t = 0;
    const run = this.run;
    if (run) run.coins += 1;
    this.game.events.emit('coin:collect', { amount: 1, pos: { x: cn.x, y: cn.y, z: cn.z } });
  }

  collectToken(tk) {
    tk.state = FLY; tk.t = 0;
    const pos = { x: tk.x, y: tk.y, z: tk.z };
    this.game.events.emit('pickup:collect', { kind: tk.kind, pos });
    if (this.game.powers) this.game.powers.start(tk.kind);
  }

  dropCoin(i) {
    const cn = this.coins[i];
    this.coins[i] = this.coins[this.coins.length - 1];
    this.coins.pop();
    this.coinFree.push(cn);
  }

  // ---------------- visuals ----------------
  sync(dt) {
    const t = this.time;
    const sq = this.game.squad, L = sq.leader;
    const arr = this.coinMesh.instanceMatrix.array;
    let n = 0, ns = 0;
    for (let i = 0; i < this.coins.length; i++) {
      const cn = this.coins[i];
      let y = cn.y + Math.sin(t * 3 + cn.ph) * 0.08, s = 1, rot = t * 3.4 + cn.ph;
      if (cn.state === FLY) {
        const f = cn.t / COIN_FLY;
        y = cn.y + f * 1.6;
        s = f < 0.3 ? 1 + f * 1.4 : Math.max(0.01, 1.42 * (1 - (f - 0.3) / 0.7));
        rot = t * 18 + cn.ph;
      } else if (cn.state === PULLED) {
        rot = t * 12 + cn.ph;
        if (ns < MAX_STREAKS) this.writeStreak(ns++, cn, 0.26, COIN_STREAK);
      }
      _e.set(0, rot, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(cn.x, y, cn.z), _q, _s.set(s, s, s));
      _m.toArray(arr, n * 16);
      n++;
    }
    this.coinMesh.count = n;
    if (n) markInstances(this.coinMesh.instanceMatrix, n);
    for (const tk of this.tokens) {
      const v = tk.visual;
      if (!v) continue;
      const bob = Math.sin(t * 2.6 + tk.ph) * 0.14;
      v.spin.rotation.y = t * 2.2 + tk.ph;
      v.spin.rotation.z = Math.sin(t * 1.7 + tk.ph) * 0.12;
      v.halo.material.opacity = 0.6 + 0.25 * Math.sin(t * 4 + tk.ph);
      const hs = 2.4 + 0.25 * Math.sin(t * 4 + tk.ph);
      v.halo.scale.set(hs, hs, 1);
      v.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + tk.ph));
      if (tk.state === FLY) {
        const f = Math.min(1, tk.t / TOKEN_FLY), e = f * f;
        v.root.position.set(tk.x + (L.x - tk.x) * e, tk.y + bob + Math.sin(f * Math.PI) * 1.2, tk.z + (L.z - tk.z) * e);
        v.root.scale.setScalar(f < 0.25 ? 1 + f * 1.6 : Math.max(0.01, 1.4 * (1 - (f - 0.25) / 0.75)));
        v.pillar.visible = v.ring.visible = false;
        v.spin.rotation.y = t * 16;
      } else {
        v.root.position.set(tk.x, tk.y + bob, tk.z);
        const pulled = tk.state === PULLED;
        v.pillar.visible = v.ring.visible = !pulled;
        v.pillar.position.y = -tk.y - bob;
        v.ring.position.y = -tk.y - bob + 0.03;
        if (pulled && ns < MAX_STREAKS) this.writeStreak(ns++, tk, 0.6, _c.set(POWER_STYLE[tk.kind].glow));
      }
    }
    this.streaks.count = ns;
    if (ns) {
      markInstances(this.streaks.instanceMatrix, ns);
      if (this.streaks.instanceColor) markInstances(this.streaks.instanceColor, ns);
    }
  }

  /** Streak trailing behind a pulled pickup (tail points away from where it is heading). */
  writeStreak(i, o, w, color) {
    const len = Math.min(2.6, 0.5 + o.sp * 0.09);
    const yaw = Math.atan2(-o.dx, -o.dz);
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(o.x, (o.y || 0.75) - 0.05, o.z), _q, _s.set(w, 1, len));
    this.streaks.setMatrixAt(i, _m);
    this.streaks.setColorAt(i, color);
  }

  dispose() {}
}
