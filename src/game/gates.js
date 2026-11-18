// Gates: +N/-N add gates and the x/÷ ladder, optional moving. Shoot to increment (1 per bullet),
// punch + color lerp red->blue, pass logic (leader crossing), unchosen gate shatters.
// Update 3 stage 3: HIDDEN gates (event flag `hidden`, set by data/harder.js behind a screening horde): a dim
// grey '?' panel that ignores raise hits until it is revealed - when no live enemy stands between the squad and
// it (checked from REVEAL_NEAR u out, so the screen has to be shot through) or after REVEAL_HITS real hits.
// Passing it still applies its real op (a blind gamble).
// Stage 4 road layout (data/roadplan.js, rules in gatefeat.js): 3-lane rows (lanes L3/C3/R3, narrower gates),
// RAMP gates (raised on a hump the squad runs over: rampY), CHAIN gates (a follow-up row waits as a dim '?' with a
// chain badge until the row before it is passed, then offers what that pick unlocked).
// Update 3 stage 5: colours come from models/gatecolors.js (COLOURBLIND setting: blue ▲ good / orange ▼ striped bad).
import * as THREE from 'three';
import { GATE, FORMATION, HIT } from '../config.js';
import { buildGateVisual, shardGeometry } from '../models/gate.js';
import { buildRamp, buildLinks, RAMP_H } from '../models/gateramp.js';
import { drawLabel, signed, labelReady } from '../models/labels.js';
import { hasHit } from './bullets.js';
import { markInstances } from '../core/pool.js';
import { laneX, laneWidth, chainIndex, chainSpawn, resolveChain, rampY } from './gatefeat.js';
import { gatePalette, stripeTexture, drawMarks } from '../models/gatecolors.js';

const BLUE_GLOW = new THREE.Color('#7fd0ff'); // shard tint (colours: gatecolors.js palette)
const _c = new THREE.Color(), _c2 = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const MAX_SHARDS = 160;
const HIDDEN = new THREE.Color('#5d6384'), HIDDEN_GLOW = new THREE.Color('#9aa3c7');
const CHAIN = new THREE.Color('#6c4bc4'), CHAIN_GLOW = new THREE.Color('#b99cff');
export const REVEAL_NEAR = 46, REVEAL_HITS = 30;

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
    this.ramps = [];             // live ramp gates (rampY)
    this.chainMap = null;        // chainId -> events per link (autopilot look-ahead)
    this.chainPick = new Map();  // 'chainId:link' -> family picked one row earlier
    this.lanes3 = [];
  }

  reset(run) {
    for (const g of this.live) this.releaseVisual(g);
    this.live.length = 0;
    this.rows.length = 0;
    this.ramps.length = 0;
    this.events = run ? run.eventsOf('gate') : [];
    this.chainMap = chainIndex(this.events);
    this.chainPick.clear();
    this.lanes3 = run ? run.eventsOf('lanes3') : [];
    this.l3cursor = 0;
    this.hinted = new Set();
    if (this.game.world.setLanes3) this.game.world.setLanes3(this.lanes3);
    this.cursor = 0;
    this.time = 0;
    this.shardData.length = 0;
    this.shards.count = 0;
  }

  /** Ground height of the ramps under (x, z): squad members and Pip follow it. */
  rampY(x, z) { return this.ramps.length ? rampY(this, x, z) : 0; }

  /** A road feature's first appearance names itself on the HUD hint line (roadplan sets e.hint). */
  hint(e) {
    if (!e.hint || this.hinted.has(e.hint)) return;
    this.hinted.add(e.hint);
    this.game.events.emit('hazard:hint', { text: e.hint, color: '#7fe3ff' });
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
    v.body.position.y = 0; v.body.scale.set(1, 1, 1);
    if (v.ramp) v.ramp.visible = false;
    if (v.links) v.links.visible = false;
    this.game.scene.add(v.group);
    return v;
  }

  releaseVisual(g) {
    if (!g.visual) return;
    if (g.ramp) { const i = this.ramps.indexOf(g); if (i >= 0) this.ramps.splice(i, 1); }
    this.game.scene.remove(g.visual.group);
    this.pools.get(g.visual.width).push(g.visual);
    g.visual = null;
  }

  makeGate(e) {
    const width = laneWidth(e.lane);
    const g = {
      id: nextId++, op: e.op === 'add' ? 'add' : 'ladder', lane: e.lane,
      baseX: laneX(e.lane), x: laneX(e.lane), z: -e.at, width, halfW: width / 2,
      ramp: !!e.ramp, chain: e.chain || 0, link: e.link | 0, alt: e.alt || null, chainWait: false,
      value: e.value | 0, step: e.step ?? GATE.step, max: e.max ?? ((e.value | 0) + GATE.maxExtra),
      rung: 0, hits: 0, credit: 0, hitsPerStep: e.hitsPerStep ?? GATE.hitsPerStep,
      moving: e.moving || null, phase: (e.at * 0.37) % 6.283,
      state: 'live', t: 0, colorT: 0, punch: 0, flash: 0, visual: null, row: null, dirty: true, labelBlue: false,
      hidden: !!e.hidden, revealHits: 0, chk: 0,
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
    const v = (g.visual = this.acquireVisual(width));
    if (g.ramp) {
      if (!v.ramp) { v.ramp = buildRamp(width); v.group.add(v.ramp); }
      v.ramp.visible = true; v.body.position.y = RAMP_H;
      this.ramps.push(g);
    }
    if (g.chain) {
      if (!v.links) { v.links = buildLinks(); v.body.add(v.links); }
      v.links.visible = true;
      chainSpawn(this, g);
    }
    this.hint(e);
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
    while (this.l3cursor < this.lanes3.length && this.lanes3[this.l3cursor].at + L.z < 60) this.hint(this.lanes3[this.l3cursor++]);
    for (const g of this.live) {
      if (g.moving && g.state === 'live') g.x = g.baseX + Math.sin(this.time * g.moving.speed + g.phase) * g.moving.range;
      g.t += dt;
      g.punch = Math.max(0, g.punch - dt * 5);
      g.flash = Math.max(0, g.flash - dt * 4);
      if (g.hidden && g.state === 'live' && (g.chk -= dt) <= 0) { g.chk = 0.1; this.checkReveal(g, L); }
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
      if (row.gates[0] && row.gates[0].chain) resolveChain(this, row, chosen);
    }
    // cleanup gates well behind / finished (a ramp stays under the squad's back rows until they are over it)
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      const done = (g.state !== 'live' && g.t > 0.9 && !g.ramp) || g.z > L.z + 25;
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

  /** A hidden gate shows itself once nothing alive stands between the squad and it (or after enough hits). */
  checkReveal(g, L) {
    const horde = this.game.horde;
    if (g.chainWait) return; // a chain follow-up waits for the pick one row earlier (gatefeat.resolveChain)
    if (g.revealHits >= REVEAL_HITS) { this.reveal(g); return; }
    if (L.z - g.z > REVEAL_NEAR) return;
    if (!horde || horde.densityAt(g.x, g.halfW + 0.3, g.z, L.z) === 0) this.reveal(g);
  }

  reveal(g) {
    if (!g.hidden) return;
    g.hidden = false; g.dirty = true; g.flash = 1; g.punch = 1.4;
    const P = this.palette();
    this.burst(g.x, g.ramp ? 0.3 + RAMP_H : 0.3, g.z, g.width, GATE.height, g.colorT > 0.5 ? P.goodGlow : P.badGlow, 10);
    this.game.events.emit('gate:reveal', { id: g.id, pos: { x: g.x, y: 1.2, z: g.z } });
  }

  pass(g) {
    if (g.hidden) this.reveal(g);
    const squad = this.game.squad;
    const before = squad.count;
    const after = applyGate(g, before);
    g.state = 'passed'; g.t = 0; g.flash = 1;
    const pos = { x: g.x, y: 1.2, z: g.z };
    this.game.events.emit('gate:pass', { op: g.op === 'add' ? 'add' : GATE.rungs[g.rung].op, value: g.op === 'add' ? g.value : GATE.rungs[g.rung].k, before, after, pos });
    squad.setCount(after, 'gate');
  }

  shatter(g) {
    const P = this.palette();
    _c.copy(P.bad).lerp(P.good, g.colorT);
    this.burst(g.x, g.ramp ? 0.3 + RAMP_H : 0.3, g.z, g.width, GATE.height, _c, Math.round(10 * (g.width / GATE.width) + 8));
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
    if (g.hidden) { g.revealHits += b.gw; g.flash = Math.max(g.flash, 0.3); return true; } // no raise while hidden
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
  /** Current gate palette (normal / colourblind); a switch redraws every live label. */
  palette() {
    const P = gatePalette(!!this.game.save?.data?.settings?.colorblind);
    if (P !== this.pal) { this.pal = P; for (const g of this.live) g.dirty = true; }
    return P;
  }

  sync(dt) {
    const P = this.palette();
    for (const g of this.live) {
      const v = g.visual;
      if (!v) continue;
      const target = this.targetColorT(g);
      g.colorT += (target - g.colorT) * Math.min(1, dt * 8);
      if (g.chainWait) { _c.copy(CHAIN); _c2.copy(CHAIN_GLOW); } else if (g.hidden) { _c.copy(HIDDEN); _c2.copy(HIDDEN_GLOW); } else {
        _c.copy(P.bad).lerp(P.good, g.colorT);
        _c2.copy(P.badGlow).lerp(P.goodGlow, g.colorT);
      }
      if (!v.glassMap) v.glassMap = v.panelMat.map;
      const map = P.cb && !g.hidden && !g.chainWait && g.colorT <= 0.5 ? stripeTexture(v.glassMap) : v.glassMap; // colourblind: bad = striped
      if (v.panelMat.map !== map) v.panelMat.map = map;
      const fl = g.flash;
      v.panelMat.color.copy(_c).lerp(_c2, 0.25 + fl * 0.5);
      v.frameMat.color.copy(_c2);
      v.frameMat.emissive.copy(_c);
      v.frameMat.emissiveIntensity = (g.hidden ? 0.15 : 0.55) + fl * 0.8;
      v.stripMat.color.copy(_c2);
      v.group.position.set(g.x, 0, g.z);
      const pu = g.punch;
      const ps = 1 + Math.sin(Math.min(1, pu) * Math.PI) * 0.22 * Math.min(1, pu + 0.2);
      v.labelMesh.scale.setScalar(ps);
      if ((g.colorT > 0.5) !== g.labelBlue) g.dirty = true;
      if (g.dirty && labelReady(v.label)) { this.drawGateLabel(g); g.dirty = false; }
      if (g.state === 'live') {
        v.panelMat.opacity = 0.62 + fl * 0.25;
        v.body.scale.set(1, 1, 1);
        v.labelMesh.material.opacity = 1;
        v.panel.visible = true;
      } else if (g.state === 'passed') {
        const f = Math.min(1, g.t / 0.5);
        v.panelMat.opacity = 0.9 * (1 - f);
        v.labelMesh.material.opacity = 1 - f;
        v.labelMesh.scale.setScalar(1 + f * 0.8);
        v.body.scale.set(1 + f * 0.15, 1 - f * 0.9, 1);
      } else {
        v.panel.visible = false;
        const f = Math.min(1, g.t / 0.45);
        v.labelMesh.material.opacity = 1 - f;
        v.body.scale.set(1, Math.max(0.01, 1 - f), 1);
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
    const P = this.palette(), cb = P.cb;
    const stroke = blue ? P.goodStroke : P.badStroke;
    const marks = cb ? (ctx, w) => drawMarks(ctx, w, blue, stroke) : null; // colourblind: ▲ good / ▼ bad
    const dy = cb ? 0.06 : 0, ck = cb ? 'cb' : '';
    if (g.chainWait) {
      drawLabel(v.label, '?', { fill: '#ffe27a', stroke: '#4a2a86', size: 130, strokeWidth: 20, y: 0.52, key: 'chain' });
    } else if (g.hidden) {
      drawLabel(v.label, '?', { fill: '#e6e9f7', stroke: '#2a2f4a', size: 130, strokeWidth: 20, y: 0.52, key: 'hidden' });
    } else if (g.op === 'add') {
      drawLabel(v.label, signed(g.value), { fill: '#ffffff', stroke, size: cb ? 108 : 118, strokeWidth: 20, y: 0.52 + dy, key: ck, after: marks });
    } else if (g.hitsPerStep >= 10000) {
      // fixed ×/÷ gate (levels.js FIX): no 'shoot to climb' bar, so it never looks like a ladder
      drawLabel(v.label, rungLabel(g.rung), { fill: '#ffffff', stroke, size: cb ? 108 : 118, strokeWidth: 20, y: 0.5 + dy, key: ck, after: marks });
    } else {
      const frac = g.rung < GATE.rungs.length - 1 ? g.hits / g.hitsPerStep : 1;
      const fq = Math.round(frac * 20);
      drawLabel(v.label, rungLabel(g.rung), {
        fill: '#ffffff', stroke, size: cb ? 100 : 112, strokeWidth: 20, y: 0.44 + dy * 0.6, key: 'p' + fq + ck,
        after: (ctx, w, h) => {
          if (marks) marks(ctx, w);
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
