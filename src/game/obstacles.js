// Obstacles: spinning blades (static or sliding within the lane; kill members they sweep, max 1 per 0.06s,
// cannot be shot) and road gaps (the world removes the tiles and dresses the hole; members over a hole fall,
// see squad.fallCheck). Level events: blade {at, lane, speed?, moving?:{range, speed}|true, dx?},
// gap {at, lane, length, inner?, style?}. Emits obstacle:kill { kind:'blade'|'gap', pos }.
// Road shapes built on gaps:
//   inner  = how far from the centre line the void starts (default: the whole lane). An L and an R gap
//            with the same inner over the same stretch make a narrow bridge; a short one is an edge bite.
//   style 'cliff' = the road is still there when it comes into view and breaks away as the squad closes in
//            (visual only: the void is real from the start, so the autopilot and every test see one rule).
//            Emits cliff:collapse { lane, pos } once when it goes.
import { LANES, MEMBER_CLAMP } from '../config.js';
import { buildBladeVisual, BLADE_R, ROTOR_Y } from '../models/obstacles.js';
import { TILE_LEN } from '../models/props.js';

const SPAWN_AHEAD = 110;
const GAP_AHEAD = 230;      // tiles vanish beyond the visible road (world draws ~196 ahead)
const KILL_CD = 0.06;
const TOUCH = 0.2;          // member body radius added to the blade radius
const SPIN = 9;             // rad/s default rotor speed
const EDGE = 0.3;           // broken lips overhang the hole: fall only once clearly over the void
const SIDE = 0.22;          // |x| beyond the divider half-width where a lane hole starts
const COLLAPSE_AT = 40;     // a cliff breaks away when its near edge is this far ahead of Pip
const GLINT_A = 3.8;        // world angle where the rotor catches the sun (front-left, toward the camera)

/**
 * True when x lies over the void of gap g (any z). Gaps made elsewhere (hazard kinds push plain
 * { lane, from, to } objects) have no `side`: their lane hole starts at the divider. `pad` widens the void.
 */
export function inVoid(g, x, pad = 0) {
  if (g.lane === 'M') return x > -g.xa - pad && x < g.xb + pad;
  if (g.lane !== 'L' && g.lane !== 'R') return true;
  const side = (g.side ?? SIDE) - pad;
  return g.lane === 'R' ? x > side : x < -side;
}

export class Obstacles {
  init(game) {
    this.game = game;
    this.blades = [];
    this.gaps = [];
    this.pool = [];
    this.cursor = { blade: 0, gap: 0 };
    this.time = 0;
    this.run = null;
    this.c = { x: 0, z: 0, r: 0 };
    this.overGap = this.overGap.bind(this);
    this.repaired = new Set(); // bridge tags built this run
    game.events.setRate('obstacle:kill', 24);
  }

  reset(run) {
    for (const b of this.blades) this.release(b);
    this.blades.length = 0;
    this.gaps.length = 0;
    this.cursor.blade = 0; this.cursor.gap = 0;
    this.time = 0;
    this.run = run;
    this.repaired.clear();
    this.game.world.setGaps(this.gaps);
  }

  skipAll() {
    const run = this.run;
    if (!run) return;
    this.cursor.blade = run.eventsOf('blade').length;
    this.cursor.gap = run.eventsOf('gap').length;
    for (const b of this.blades) this.release(b);
    this.blades.length = 0;
    this.gaps.length = 0;
    this.game.world.setGaps(this.gaps);
  }

  release(b) {
    if (!b.visual) return;
    this.game.scene.remove(b.visual.group);
    this.pool.push(b.visual);
    b.visual = null;
  }

  makeBlade(e) {
    const v = this.pool.length ? this.pool.pop() : buildBladeVisual();
    this.game.scene.add(v.group);
    const mv = e.moving ? (typeof e.moving === 'object' ? e.moving : {}) : null;
    let baseX = e.x ?? ((LANES[e.lane] ?? 0) + (e.dx || 0));
    baseX = Math.max(-MEMBER_CLAMP + 0.4, Math.min(MEMBER_CLAMP - 0.4, baseX));
    const sp = e.speed ? (e.speed > 4 ? e.speed : SPIN * e.speed) : SPIN;
    const b = {
      x: baseX, baseX, z: -e.at, at: e.at,
      range: mv ? (mv.range ?? 1.1) : 0, mspeed: mv ? (mv.speed ?? 1.2) : 0, phase: (e.at * 0.37) % 6.28,
      angle: (e.at * 1.3) % 6.28, spin: sp * (baseX > 0 ? -1 : 1), cd: 0, flash: 0, visual: v,
    };
    v.track.visible = !!mv;
    if (mv) v.track.scale.set(2 * b.range + 1.3, 1, 1);
    v.mat.emissiveIntensity = 0;
    return b;
  }

  makeGap(e) {
    const from = Math.floor(e.at / TILE_LEN) * TILE_LEN;
    const to = Math.max(from + TILE_LEN, Math.ceil((e.at + (e.length || 8)) / TILE_LEN) * TILE_LEN);
    // lane 'M' = a hole down the middle (a fork): void from -xa to +xb, a strip of road left on either side
    const lane = e.lane === 'L' || e.lane === 'R' || e.lane === 'M' ? e.lane : 'C';
    const inner = (lane === 'L' || lane === 'R') && e.inner > SIDE ? Math.min(e.inner, MEMBER_CLAMP - 0.6) : 0;
    const lim = MEMBER_CLAMP - 1.0;
    // side = |x| beyond which the lane is void; open = the tiles are gone (cliffs open when the squad closes in)
    return { lane, from, to, at: e.at, inner, side: inner || SIDE, xa: lane === 'M' ? Math.min(lim, e.xa ?? 1.5) : 0, xb: lane === 'M' ? Math.min(lim, e.xb ?? 1.5) : 0,
      tag: e.tag || '', world: this.run ? this.run.worldId || 0 : 0, style: e.style === 'cliff' ? 'cliff' : 'hole', open: e.style !== 'cliff', sign: e.sign !== false && !(e.chain && !e.first), label: e.label || '', signText: e.signText || '',
      // chained pieces (a funnel's steps) are drawn as one hole: only the ends get a broken lip and chevrons
      capNear: !(e.chain && !e.first), capFar: !(e.chain && !e.last) };
  }

  /** Predicted x of a blade t seconds from now (autopilot). */
  bladeX(b, t = 0) {
    return b.range ? b.baseX + Math.sin((this.time + t) * b.mspeed + b.phase) * b.range : b.baseX;
  }

  /** True when (x, z) is over the void of an active gap. */
  overGap(x, z) {
    const d = -z;
    const gs = this.gaps;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      if (d <= g.from + EDGE || d >= g.to - EDGE) continue;
      if (inVoid(g, x)) return true;
    }
    return false;
  }

  /** Like overGap, but only where the tiles are really gone (a cliff that has not broken away yet holds). */
  overOpen(x, z) {
    const d = -z;
    const gs = this.gaps;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      if (g.open === false || d <= g.from + EDGE || d >= g.to - EDGE) continue;
      if (inVoid(g, x)) return true;
    }
    return false;
  }

  /**
   * Shoot-to-build bridges: closes every hole carrying `tag` (the planks are back; nobody can fall there any
   * more). Returns the number of holes closed. Emits bridge:built { from, to } for the fx.
   */
  repair(tag) {
    if (!tag) return 0;
    this.repaired.add(tag);
    let n = 0, from = Infinity, to = -Infinity;
    for (let i = this.gaps.length - 1; i >= 0; i--) {
      const g = this.gaps[i];
      if (g.tag !== tag) continue;
      from = Math.min(from, g.from); to = Math.max(to, g.to);
      this.gaps.splice(i, 1); n++;
    }
    if (n) {
      this.game.world.setGaps(this.gaps);
      this.game.events.emit('bridge:built', { from, to, pos: { x: 0, y: 0, z: -(from + to) / 2 } });
    }
    return n;
  }

  update(dt) {
    const game = this.game;
    const run = this.run;
    if (!run) return;
    this.time += dt;
    const squad = game.squad;
    const L = squad.leader;
    const dist = -L.z;
    const be = run.eventsOf('blade');
    while (this.cursor.blade < be.length && be[this.cursor.blade].at - dist < SPAWN_AHEAD) this.blades.push(this.makeBlade(be[this.cursor.blade++]));
    const ge = run.eventsOf('gap');
    let changed = false;
    while (this.cursor.gap < ge.length && ge[this.cursor.gap].at - dist < GAP_AHEAD) {
      const e = ge[this.cursor.gap++];
      if (e.tag && this.repaired.has(e.tag)) continue; // its bridge was already built
      this.gaps.push(this.makeGap(e)); changed = true;
    }
    for (let i = this.gaps.length - 1; i >= 0; i--) if (this.gaps[i].to < dist - 40) { this.gaps.splice(i, 1); changed = true; }
    if (changed) game.world.setGaps(this.gaps);
    for (let i = 0; i < this.gaps.length; i++) {
      const g = this.gaps[i];
      if (g.open !== false || g.from - dist > COLLAPSE_AT) continue;
      g.open = true;
      const x = g.lane === 'C' ? 0 : g.lane === 'M' ? (g.xb - g.xa) / 2 : (g.lane === 'R' ? 1 : -1) * (g.side + (MEMBER_CLAMP + 0.25 - g.side) / 2);
      if (game.events.wants('cliff:collapse')) game.events.emit('cliff:collapse', { lane: g.lane, from: g.from, to: g.to, pos: { x, y: 0, z: -g.from } });
    }

    const live = run.active && squad.count > 0;
    const c = squad.center(this.c);
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const b = this.blades[i];
      b.angle += b.spin * dt;
      if (b.range) b.x = this.bladeX(b);
      if (b.cd > 0) b.cd -= dt;
      if (live) this.bladeContact(b, c);
      if (b.z > L.z + 16) { this.release(b); this.blades[i] = this.blades[this.blades.length - 1]; this.blades.pop(); }
    }

    // update 3: a jelly launch (game.hazards.mods.airborne) carries the squad over holes
    if (live && this.gaps.length && !(game.hazards && game.hazards.mods.airborne)) {
      const back = -(c.z + c.r) - 1, front = dist + 1;
      for (const g of this.gaps) {
        if (g.from < front && g.to > back) { squad.fallCheck(this.overGap); break; }
      }
    }
  }

  bladeContact(b, c) {
    if (b.cd > 0) return;
    const squad = this.game.squad;
    const L = squad.leader;
    const R = BLADE_R + TOUCH, R2 = R * R;
    if (b.z < L.z - R - 0.5 || b.z > c.z + c.r + R) return;
    if (Math.abs(b.x - c.x) > c.r + R + 0.5 && Math.abs(b.x - L.x) > R + 0.5) return;
    const ms = squad.members;
    let victim = -1, best = R2;
    for (let i = 0; i < ms.length; i++) {
      const dx = ms[i].x - b.x, dz = ms[i].z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; victim = i; }
    }
    const lx = L.x - b.x, lz = L.z - b.z;
    const leaderHit = !squad.pipGone && lx * lx + lz * lz < R2;
    if (victim < 0 && !leaderHit) return;
    b.cd = KILL_CD;
    b.flash = 1;
    let px, pz;
    if (victim < 0) {
      // Pip touched it: the raider closest to him takes the hit (Pip is the squad's last life)
      let k = -1, kd = Infinity;
      for (let i = 0; i < ms.length; i++) {
        const dx = ms[i].x - L.x, dz = ms[i].z - L.z, d2 = dx * dx + dz * dz;
        if (d2 < kd) { kd = d2; k = i; }
      }
      victim = k;
    }
    if (victim >= 0) { px = ms[victim].x; pz = ms[victim].z; } else { px = L.x; pz = L.z; }
    const ev = this.game.events;
    if (ev.wants('obstacle:kill')) ev.emit('obstacle:kill', { kind: 'blade', pos: { x: px, y: ROTOR_Y, z: pz } });
    this.game.gates.burst(px, ROTOR_Y, pz, 0.4, 0.3, '#ffe9a8', 4);
    if (victim >= 0) squad.killMember(victim, 'blade'); else squad.remove(1, 'blade');
  }

  // ---------------- visuals ----------------
  sync(dt) {
    const t = this.time;
    for (const b of this.blades) {
      const v = b.visual;
      if (!v) continue;
      v.group.position.set(b.x, 0, b.z);
      v.rotor.rotation.y = b.angle;
      v.blur.rotation.y = b.angle - Math.sign(b.spin) * 0.35;
      v.danger.rotation.y = t * 0.35;
      v.track.position.x = b.baseX - b.x;
      b.flash = Math.max(0, b.flash - dt * 6);
      v.mat.emissiveIntensity = b.flash * 0.9;
      // glint: either arm sweeping past the sun-facing spot
      const g = Math.pow(Math.max(0, Math.cos(2 * (b.angle - GLINT_A))), 18);
      v.glint.material.opacity = 0.15 + g * 0.85;
      const s = 0.55 + g * 0.9;
      v.glint.scale.set(s, s, 1);
      v.glint.position.set(Math.cos(GLINT_A) * 1.55, ROTOR_Y + 0.12, -Math.sin(GLINT_A) * 1.55);
    }
  }

  dispose() {}
}
