// Gates: +N/-N add gates and the x/÷ ladder, optional moving. Shoot to increment (1 per bullet),
// punch + color lerp red->blue, pass logic (leader crossing), unchosen gate shatters.
import * as THREE from 'three';
import { GATE, LANES, COLORS, FORMATION, HIT } from '../config.js';
import { buildGateVisual, shardGeometry } from '../models/gate.js';
import { drawLabel, signed, labelReady } from '../models/labels.js';
import { hasHit } from './bullets.js';
import { markInstances } from '../core/pool.js';

const RED = new THREE.Color(COLORS.bad), BLUE = new THREE.Color(COLORS.good);
const RED_GLOW = new THREE.Color('#ff6b7a'), BLUE_GLOW = new THREE.Color('#7fd0ff');
const _c = new THREE.Color(), _c2 = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const MAX_SHARDS = 160;

export function rungLabel(r) { const g = GATE.rungs[r]; return (g.op === 'mul' ? '×' : '÷') + g.k; }

/** Applies a gate op to a count (shared with autopilot). */
export function applyGate(g, before, value = g.value, rung = g.rung) {
  let after;
  if (g.op === 'add') after = before + value;
  else { const r = GATE.rungs[rung]; after = r.op === 'mul' ? before * r.k : before / r.k; }
  return Math.max(0, Math.min(FORMATION.cap, Math.round(after)));
}

/** Predicted state after `hits` more bullet hits (for autopilot). */
export function predictGate(g, hits) {
  if (g.op === 'add') return { value: Math.min(g.max, g.value + g.step * Math.floor(hits)), rung: 0 };
  const total = g.hits + Math.floor(hits);
  return { value: 0, rung: Math.min(GATE.rungs.length - 1, g.rung + Math.floor(total / g.hitsPerStep)) };
}

let nextId = 1;

export class Gates {
  init(game) {
    this.game = game;
    this.rows = [];
    this.live = [];          // all gates still in the world (any state)
    this.pools = new Map();  // width -> visuals[]
    this.cursor = 0;
    this.events = [];
    this.time = 0;
    this.kind = 'gate';
    this.bit = HIT.GATE;
    this.priority = 10;
    game.bullets.addTargetSystem(this);

    this.shards = new THREE.InstancedMesh(shardGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false }), MAX_SHARDS);
    this.shards.frustumCulled = false;
    this.shards.count = 0;
    this.shards.renderOrder = 3;
    this.shards.setColorAt(0, _c.set(1, 1, 1)); // instanceColor exists from the start: one shader program
    game.scene.add(this.shards);
    this.shardData = [];
    this.hitPos = { x: 0, y: 0, z: 0 };
  }

  reset(run) {
    for (const g of this.live) this.releaseVisual(g);
    this.live.length = 0;
    this.rows.length = 0;
    this.events = run ? run.eventsOf('gate') : [];
    this.cursor = 0;
    this.time = 0;
    this.shardData.length = 0;
    this.shards.count = 0;
  }

  /** Debug skip: drop every pending and spawned row without applying it (like horde/barrels skipAll). */
  skipAll() {
    this.cursor = this.events.length;
    for (const g of this.live) this.releaseVisual(g);
    this.live.length = 0;
    this.rows.length = 0;
  }

  acquireVisual(width) {
    let list = this.pools.get(width);
    if (!list) { list = []; this.pools.set(width, list); }
    const v = list.length ? list.pop() : buildGateVisual(width);
    v.group.visible = true;
    v.label.key = null;
    this.game.scene.add(v.group);
    return v;
  }

  releaseVisual(g) {
    if (!g.visual) return;
    this.game.scene.remove(g.visual.group);
    this.pools.get(g.visual.width).push(g.visual);
    g.visual = null;
  }

  makeGate(e) {
    const center = e.lane === 'C';
    const width = center ? GATE.widthCenter : GATE.width;
    const g = {
      id: nextId++, op: e.op === 'add' ? 'add' : 'ladder', lane: e.lane,
      baseX: LANES[e.lane] ?? 0, x: LANES[e.lane] ?? 0, z: -e.at, width, halfW: width / 2,
      value: e.value | 0, step: e.step ?? GATE.step, max: e.max ?? ((e.value | 0) + GATE.maxExtra),
      rung: 0, hits: 0, credit: 0, hitsPerStep: e.hitsPerStep ?? GATE.hitsPerStep,
      moving: e.moving || null, phase: (e.at * 0.37) % 6.283,
      state: 'live', t: 0, colorT: 0, punch: 0, flash: 0, visual: null, row: null, dirty: true, labelBlue: false,
    };
    if (g.op === 'ladder') {
      if (e.rung !== undefined) g.rung = Math.max(0, Math.min(GATE.rungs.length - 1, e.rung));
      else {
        const k = e.value || 2;
        const idx = GATE.rungs.findIndex((r) => r.op === e.op && r.k === k);
        g.rung = idx >= 0 ? idx : 3;
      }
    }
    g.colorT = this.targetColorT(g);
    g.visual = this.acquireVisual(width);
    return g;
  }

  targetColorT(g) {
    if (g.op === 'add') return g.value < 0 ? 0 : 1;
    return GATE.rungs[g.rung].op === 'mul' ? 1 : 0;
  }

  spawnRows(dist) {
    const ev = this.events;
    while (this.cursor < ev.length && ev[this.cursor].at - dist < GATE.spawnAhead) {
      const at = ev[this.cursor].at;
      const row = { z: -at, gates: [], resolved: false };
      while (this.cursor < ev.length && ev[this.cursor].at === at) {
        const g = this.makeGate(ev[this.cursor]);
        g.row = row;
        row.gates.push(g);
        this.live.push(g);
        this.cursor++;
      }
      this.rows.push(row);
    }
  }

  update(dt) {
    const game = this.game;
    this.time += dt;
    const L = game.squad.leader;
    this.spawnRows(-L.z);
    for (const g of this.live) {
      if (g.moving && g.state === 'live') g.x = g.baseX + Math.sin(this.time * g.moving.speed + g.phase) * g.moving.range;
      g.t += dt;
      g.punch = Math.max(0, g.punch - dt * 5);
      g.flash = Math.max(0, g.flash - dt * 4);
    }
    // pass detection
    for (const row of this.rows) {
      if (row.resolved || L.z > row.z) continue;
      row.resolved = true;
      let chosen = null, best = Infinity;
      for (const g of row.gates) {
        const d = Math.abs(L.x - g.x);
        if (d <= g.halfW + GATE.passTolerance && d < best) { best = d; chosen = g; }
      }
      for (const g of row.gates) {
        if (g === chosen) this.pass(g);
        else { g.state = 'shatter'; g.t = 0; this.shatter(g); }
      }
    }
    // cleanup gates well behind / finished
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      const done = (g.state !== 'live' && g.t > 0.9) || g.z > L.z + 25;
      if (done) { this.releaseVisual(g); this.live.splice(i, 1); }
    }
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].resolved && this.rows[i].gates.every((g) => !g.visual)) this.rows.splice(i, 1);
    // shards
    for (let i = this.shardData.length - 1; i >= 0; i--) {
      const s = this.shardData[i];
      s.t += dt; s.vy -= 12 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.t > s.life) { this.shardData[i] = this.shardData[this.shardData.length - 1]; this.shardData.pop(); }
    }
  }

  pass(g) {
    const squad = this.game.squad;
    const before = squad.count;
    const after = applyGate(g, before);
    g.state = 'passed'; g.t = 0; g.flash = 1;
    const pos = { x: g.x, y: 1.2, z: g.z };
    this.game.events.emit('gate:pass', { op: g.op === 'add' ? 'add' : GATE.rungs[g.rung].op, value: g.op === 'add' ? g.value : GATE.rungs[g.rung].k, before, after, pos });
    squad.setCount(after, 'gate');
  }

  shatter(g) {
    _c.copy(RED).lerp(BLUE, g.colorT);
    this.burst(g.x, 0.3, g.z, g.width, GATE.height, _c, Math.round(10 * (g.width / GATE.width) + 8));
  }

  /** Generic glass-shard burst (also used by shattering enemy shields and barrels). */
  burst(x, y, z, w, h, color, n) {
    _c2.set(color);
    for (let i = 0; i < n && this.shardData.length < MAX_SHARDS; i++) {
      this.shardData.push({
        x: x + (Math.random() - 0.5) * w, y: y + Math.random() * h, z,
        vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 4, vz: 1 + Math.random() * 4,
        rx: Math.random() * 6, ry: Math.random() * 6, sp: (Math.random() - 0.5) * 14,
        t: 0, life: 0.6 + Math.random() * 0.4, s: 0.6 + Math.random() * 0.9, r: _c2.r, gg: _c2.g, b: _c2.b,
      });
    }
  }

  // ---- bullet target system ----
  sweep(b, x, z0, z1) {
    let best = null;
    for (let i = 0; i < this.live.length; i++) {
      const g = this.live[i];
      if (g.state !== 'live') continue;
      if (g.z > z0 || g.z < z1) continue;
      if (Math.abs(x - g.x) > g.halfW - 0.05) continue;
      if (best && g.z <= best.z) continue;
      if (b.nh && hasHit(b, g)) continue;
      best = g;
    }
    return best;
  }

  hit(g, b) {
    // b.gw: how many real gate hits this bullet stands for (tracers carry the squad's whole gate rate; main
    // projectiles are absorbed with gw 0) -> whole hits are applied, the fraction carries to the next bullet
    g.punch = Math.max(g.punch, 0.8);
    if (!(b.gw > 0)) {
      if (this.game.events.wants('bullet:hit')) { const p = this.hitPos; p.x = b.x; p.y = b.y; p.z = g.z; this.game.events.emit('bullet:hit', { kind: 'gate', pos: p }); }
      return true;
    }
    g.credit += b.gw;
    const n = Math.floor(g.credit);
    g.credit -= n;
    if (g.op === 'add') {
      if (g.value < g.max) g.value = Math.min(g.max, g.value + g.step * n);
    } else {
      for (let i = 0; i < n && g.rung < GATE.rungs.length - 1; i++) {
        g.hits++;
        if (g.hits >= g.hitsPerStep) { g.hits = 0; g.rung++; g.punch = 1.4; }
      }
    }
    g.punch = Math.max(g.punch, 0.8);
    g.flash = Math.max(g.flash, 0.5);
    g.dirty = true;
    const p = this.hitPos; p.x = b.x; p.y = b.y; p.z = g.z;
    this.game.events.emit('gate:hit', { id: g.id, op: g.op === 'add' ? 'add' : GATE.rungs[g.rung].op, value: g.op === 'add' ? g.value : GATE.rungs[g.rung].k, pos: p });
    if (this.game.events.wants('bullet:hit')) this.game.events.emit('bullet:hit', { kind: 'gate', pos: p });
    return true;
  }

  /** Upcoming unresolved rows (for autopilot). */
  upcoming() { return this.rows.filter((r) => !r.resolved); }

  // ---- visuals ----
  sync(dt) {
    for (const g of this.live) {
      const v = g.visual;
      if (!v) continue;
      const target = this.targetColorT(g);
      g.colorT += (target - g.colorT) * Math.min(1, dt * 8);
      _c.copy(RED).lerp(BLUE, g.colorT);
      _c2.copy(RED_GLOW).lerp(BLUE_GLOW, g.colorT);
      const fl = g.flash;
      v.panelMat.color.copy(_c).lerp(_c2, 0.25 + fl * 0.5);
      v.frameMat.color.copy(_c2);
      v.frameMat.emissive.copy(_c);
      v.frameMat.emissiveIntensity = 0.55 + fl * 0.8;
      v.stripMat.color.copy(_c2);
      v.group.position.set(g.x, 0, g.z);
      const pu = g.punch;
      const ps = 1 + Math.sin(Math.min(1, pu) * Math.PI) * 0.22 * Math.min(1, pu + 0.2);
      v.labelMesh.scale.setScalar(ps);
      if ((g.colorT > 0.5) !== g.labelBlue) g.dirty = true;
      if (g.dirty && labelReady(v.label)) { this.drawGateLabel(g); g.dirty = false; }
      if (g.state === 'live') {
        v.panelMat.opacity = 0.62 + fl * 0.25;
        v.group.scale.set(1, 1, 1);
        v.labelMesh.material.opacity = 1;
        v.panel.visible = true;
      } else if (g.state === 'passed') {
        const f = Math.min(1, g.t / 0.5);
        v.panelMat.opacity = 0.9 * (1 - f);
        v.labelMesh.material.opacity = 1 - f;
        v.labelMesh.scale.setScalar(1 + f * 0.8);
        v.group.scale.set(1 + f * 0.15, 1 - f * 0.9, 1);
      } else {
        v.panel.visible = false;
        const f = Math.min(1, g.t / 0.45);
        v.labelMesh.material.opacity = 1 - f;
        v.group.scale.set(1, Math.max(0.01, 1 - f), 1);
      }
    }
    // shards
    const arr = this.shards.instanceMatrix.array;
    let n = 0;
    for (const s of this.shardData) {
      const k = Math.max(0.01, s.s * (1 - s.t / s.life));
      _e.set(s.rx + s.t * s.sp, s.ry + s.t * s.sp * 0.7, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(k, k, k));
      _m.toArray(arr, n * 16);
      _c.setRGB(s.r, s.gg, s.b).lerp(BLUE_GLOW, 0.3);
      this.shards.setColorAt(n, _c);
      n++;
    }
    this.shards.count = n;
    if (n) { markInstances(this.shards.instanceMatrix, n); markInstances(this.shards.instanceColor, n); }
  }

  drawGateLabel(g) {
    const v = g.visual;
    const blue = g.colorT > 0.5;
    g.labelBlue = blue;
    const stroke = blue ? '#0e3d9c' : '#8e0f22';
    if (g.op === 'add') {
      drawLabel(v.label, signed(g.value), { fill: '#ffffff', stroke, size: 118, strokeWidth: 20, y: 0.52 });
    } else if (g.hitsPerStep >= 10000) {
      // fixed ×/÷ gate (levels.js FIX): no 'shoot to climb' bar, so it never looks like a ladder
      drawLabel(v.label, rungLabel(g.rung), { fill: '#ffffff', stroke, size: 118, strokeWidth: 20, y: 0.5 });
    } else {
      const frac = g.rung < GATE.rungs.length - 1 ? g.hits / g.hitsPerStep : 1;
      const fq = Math.round(frac * 20);
      drawLabel(v.label, rungLabel(g.rung), {
        fill: '#ffffff', stroke, size: 112, strokeWidth: 20, y: 0.44, key: 'p' + fq,
        after: (ctx, w, h) => {
          const bw = w * 0.56, bh = 16, bx = (w - bw) / 2, by = h - 30;
          ctx.fillStyle = 'rgba(10,25,70,0.45)';
          roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 12); ctx.fill();
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, bx, by, Math.max(bh, bw * (fq / 20)), bh, 8); ctx.fill();
        },
      });
    }
  }

  dispose() {}
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
