// Candy Kingdom hazards (update 3):
//   jelly   { at, side:'L'|'R'|'both', frac?, pad?, gap?, height? }  a bouncy pad right before a hole across the
//           whole road (cut ~230 u ahead via reserve): any of the squad touching the pad launches everyone
//           over the hole (mods.airborne + lift arc). Miss it entirely and the jelly's wobbling rim still catches
//           Pip and the half of the squad nearest the pad; the far half falls (never a one-mistake run end).
//   syrup   { at, length, lane:'L'|'R'|'both', slow?, ease? }  sticky river: while Pip wades through it the run
//           slows (mods.speedMul) and steering is heavy (mods.easeMul); enemies in it are slowed too.
//   gumball { at, lane, count, spacing, roll, hp, zigzag? }  giant gumballs wait at the far end and roll down
//           the lane at the squad (they meet ~14 u before the rest spot); shootable (tracer damage like barrels,
//           main shots are absorbed), they crush members they roll over.
//   choco   { at, lane, count, spacing, period, on, warn, zigzag? }  chocolate falls pour over a lane on a cycle
//           (drips warn first): members in a pour drown slowly and every bullet hitting a pour is stopped.
import * as THREE from 'three';
import { LANES, ROAD_HALF, HIT } from '../../config.js';
import { TILE_LEN } from '../../models/props.js';
import {
  jellyPadGeometry, jellyMaterial, jellyArrowMaterial, jellyArrowTexture, tiledPlane, syrupMaterial, syrupSheenMaterial,
  syrupRimGeometry, syrupRimMaterial, GUM_COLORS, gumballGeometry, gumballMaterial, gumGlossGeometry, gumGlossMaterial,
  gumShadowGeometry, gumShadowMaterial, CHOCO_H, chocoCurtainGeometry, chocoMaterial, chocoTexture, chocoSpoutGeometry,
  chocoSpoutMaterial, chocoPoolGeometry, chocoPoolMaterial,
} from '../../models/hazards/candy.js';

const _c = { x: 0, z: 0, r: 0 };
const other = (lane) => (lane === 'L' ? 'R' : 'L');
const hasHit = (bl, t) => { for (let i = 0; i < bl.nh; i++) if (bl.hits[i] === t) return true; return false; };

const inRect = (x, z, x0, x1, d0, d1) => x > x0 && x < x1 && -z > d0 && -z < d1;
/** True when any of the squad (Pip or a sampled member) stands inside the rectangle. */
function touches(sys, x0, x1, d0, d1) {
  const sq = sys.game.squad, L = sq.leader, ms = sq.members;
  if (!sq.pipGone && inRect(L.x, L.z, x0, x1, d0, d1)) return true;
  const stride = Math.max(1, Math.floor(ms.length / 60));
  for (let i = 0; i < ms.length; i += stride) if (inRect(ms[i].x, ms[i].z, x0, x1, d0, d1)) return true;
  return false;
}

// ---------------- jelly (bounce pad over a hole) ----------------
export const jelly = {
  kind: 'jelly',
  layout(ev) {
    const pad = ev.pad || 3.5;
    const g0 = Math.ceil((ev.at + pad + 0.5) / TILE_LEN) * TILE_LEN;
    const g1 = g0 + Math.max(TILE_LEN * 2, Math.ceil((ev.gap || 6) / TILE_LEN) * TILE_LEN);
    const f = ev.frac ?? 0.7;
    let x0 = -ROAD_HALF, x1 = ROAD_HALF;
    if (ev.side === 'L') x1 = -ROAD_HALF + 2 * ROAD_HALF * f;
    else if (ev.side === 'R') x0 = ROAD_HALF - 2 * ROAD_HALF * f;
    return { from: ev.at, to: ev.at + pad, g0, g1, x0, x1 };
  },
  reserve(sys, ev) {
    const l = jelly.layout(ev);
    const gap = { lane: 'C', from: l.g0, to: l.g1, at: l.g0, hazard: 'jelly' };
    sys.addGap(gap);
    return gap;
  },
  create(sys, ev) {
    const l = jelly.layout(ev);
    const gap = sys.reserved.get(ev) || jelly.reserve(sys, ev);
    sys.reserved.delete(ev);
    const o = { ...l, gap, state: 'idle', launch: 0, span: 1, h: ev.height || 3.0, squish: 0, zone: null };
    // while the jelly carries the squad over its own hole, only that hole is "solid" (other gaps still bite)
    o.hole = (x, z) => -z >= l.g0 - 0.5 && -z <= l.g1 + 0.5;
    if (ev.side === 'L') o.zone = { kind: 'lane', x0: l.x1, x1: 8, zNear: -l.from + 1, zFar: -l.to, pad: 0.5, w: 4 };
    else if (ev.side === 'R') o.zone = { kind: 'lane', x0: -8, x1: l.x0, zNear: -l.from + 1, zFar: -l.to, pad: 0.5, w: 4 };
    const w = l.x1 - l.x0, len = l.to - l.from;
    const group = new THREE.Group();
    const pad = new THREE.Mesh(jellyPadGeometry(w, len, sys.low), jellyMaterial());
    const arrows = new THREE.Mesh(tiledPlane(w - 0.9, len - 0.9, 1.6), jellyArrowMaterial());
    arrows.position.set(0, 0.44, -len / 2);
    arrows.renderOrder = 2;
    pad.add(arrows);
    group.add(pad);
    group.position.set((l.x0 + l.x1) / 2, 0, -l.from);
    sys.game.scene.add(group);
    o.vis = { group, pad, arrows };
    return o;
  },
  launch(sys, o) {
    const sq = sys.game.squad, c = sq.center(_c), dist = sys.dist;
    o.state = 'air'; o.launch = dist; o.squish = 1;
    o.span = Math.max(4, o.gap.to + 1.2 + (c.z + c.r - sq.leader.z) - dist);
    sys.sfx('pop', { pitch: 0.55 }); sys.sfx('powerUp');
  },
  /** Missed the pad entirely: the far half of the drawn squad falls (Pip never), the rest bounce off the rim. */
  miss(sys, o) {
    const g = sys.game, sq = g.squad, ms = sq.members, n = ms.length, L = sq.leader;
    if (n > 1 && !g.shielded()) {
      const ds = ms.map((m) => Math.max(0, o.x0 - m.x, m.x - o.x1)).sort((a, b) => a - b); // once per miss
      const th = ds[Math.floor(n / 2)], x0 = o.x0, x1 = o.x1, lx = L.x, lz = L.z;
      const w = Math.max(1, sq.count / (n + (sq.pipGone ? 0 : 1)));
      const lost = sq.fallCheck((x, z) => !(x === lx && z === lz) && Math.max(0, x0 - x, x - x1) > th);
      // the unseen reserves go with the drawn ones (like sys.killIn)
      let gone = lost, extra = Math.floor(lost * (w - 1));
      if (extra > 0 && sq.count > extra) { sq.remove(extra, 'gap'); gone += extra; }
      if (gone) sys.stats.kills.jelly = (sys.stats.kills.jelly || 0) + gone;
    }
    jelly.launch(sys, o);
  },
  update(sys, o) {
    const dist = sys.dist, sq = sys.game.squad, L = sq.leader;
    if (o.state === 'idle') {
      if (dist > o.gap.to + 30) return false;
      if (o.zone && dist > o.from - 40) sys.danger.push(o.zone);
      if (dist < o.from - 0.5 || !sys.live) return true;
      o.state = 'watch';
    }
    if (o.state === 'watch') {
      // the jelly owns the fall check of its hole from here: the pad launches, a full miss loses the far half
      sys.mods.airborne = true;
      if (o.zone) sys.danger.push(o.zone);
      if (!sys.live) return true;
      if (touches(sys, o.x0 - 0.2, o.x1 + 0.2, o.from, o.to)) jelly.launch(sys, o);
      else if (dist >= o.g0 - 0.3) jelly.miss(sys, o);
      sys.fallUnless(o.hole);
      return true;
    }
    if (o.state === 'air') {
      const c = sq.center(_c);
      const u = (dist - o.launch) / o.span;
      sys.mods.airborne = true;
      sys.fallUnless(o.hole);
      if (u < 1) sys.mods.lift = Math.max(sys.mods.lift, o.h * 4 * u * (1 - u));
      else if (-(c.z + c.r) > o.gap.to + 0.4) {
        o.state = 'done';
        const B = sys.fxB();
        if (B && !sys.low) B.sparkle(L.x, 0.3, L.z, 0xff9ad6, 10, 1.6, 0, 0.6);
        sys.sfx('pop', { pitch: 0.8 });
      }
      return true;
    }
    return dist <= o.gap.to + 30;
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v) return;
    o.squish = Math.max(0, o.squish - dt * 2.2);
    const t = sys.time, s = o.squish;
    const wob = s > 0 ? Math.sin(t * 30) * s : 0.05 * Math.sin(t * 4 + o.from);
    v.pad.scale.set(1 + 0.04 * wob, 1 - 0.45 * s + 0.12 * wob, 1 + 0.03 * wob);
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.pad.geometry.dispose(); o.vis.arrows.geometry.dispose(); o.vis.arrows.material.dispose();
    o.vis = null;
  },
  pre(sys) { jellyArrowTexture().offset.y = (sys.time * 1.4) % 1; },
  warm(sys) { return [new THREE.Mesh(jellyPadGeometry(4, 3, true), jellyMaterial()), new THREE.Mesh(tiledPlane(1, 1), jellyArrowMaterial())]; },
};

// ---------------- syrup (sticky river) ----------------
export const syrup = {
  kind: 'syrup',
  create(sys, ev) {
    const r = sys.laneRange(ev.lane || 'both', {});
    const len = ev.length || 16;
    const o = { x0: r.x0, x1: r.x1, from: ev.at, to: ev.at + len, slow: ev.slow ?? 0.6, ease: ev.ease ?? 0.4, k: 0, on: false, bub: 0, zone: null };
    if (ev.lane === 'L' || ev.lane === 'R') o.zone = { kind: 'lane', x0: r.x0, x1: r.x1, zNear: -o.from, zFar: -o.to, pad: 0.2, w: 0.25 };
    const w = r.x1 - r.x0;
    const group = new THREE.Group();
    const geo = tiledPlane(w, len, 4);
    const surf = new THREE.Mesh(geo, syrupMaterial());
    const sheen = new THREE.Mesh(geo, syrupSheenMaterial());
    surf.position.set((r.x0 + r.x1) / 2, 0.03, -len / 2);
    sheen.position.set(surf.position.x, 0.036, surf.position.z);
    surf.renderOrder = 1; sheen.renderOrder = 1;
    const rim = new THREE.Mesh(syrupRimGeometry(r.x0, r.x1, len, sys.low), syrupRimMaterial());
    group.add(surf, sheen, rim);
    group.position.z = -o.from;
    sys.game.scene.add(group);
    o.vis = { group, geo, rim };
    return o;
  },
  update(sys, o, dt) {
    const dist = sys.dist, L = sys.game.squad.leader, m = sys.mods;
    if (dist > o.to + 25) return false;
    o.on = dist >= o.from && dist <= o.to && L.x >= o.x0 - 0.2 && L.x <= o.x1 + 0.2;
    o.k += ((o.on ? 1 : 0) - o.k) * Math.min(1, dt * 7);
    if (o.k > 0.01) {
      m.speedMul = Math.min(m.speedMul, 1 - (1 - o.slow) * o.k);
      m.easeMul *= 1 - (1 - o.ease) * o.k;
    }
    if (o.zone && dist > o.from - 40) sys.danger.push(o.zone);
    // enemies wading through the syrup are slowed as well (status slow: refreshed while they stand in it)
    const h = sys.game.horde, st = sys.game.status;
    if (h && st && h.alive && dist > o.from - 90 && dist < o.to + 4) {
      const z0 = -o.to, z1 = -o.from, list = h.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.z > z0 && e.z < z1 && e.x > o.x0 - 0.3 && e.x < o.x1 + 0.3) st.slow(e, 0.5, 0.25);
      }
    }
    return true;
  },
  sync(sys, o, dt) {
    if (sys.low || !o.vis) return;
    o.bub -= dt;
    const B = sys.fxB();
    if (!B || o.bub > 0) return;
    o.bub = 0.22 + Math.random() * 0.25; // visual only
    const x = o.x0 + 0.3 + Math.random() * (o.x1 - o.x0 - 0.6), z = -(o.from + Math.random() * (o.to - o.from));
    B.sparkle(x, 0.1, z, 0xffc870, 1, 0.3, 0, 0.5);
    if (o.on) { const L = sys.game.squad.leader; B.sparkle(L.x, 0.1, L.z + 0.5, 0xe89a2a, 2, 0.6, 0, 0.3); }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.geo.dispose(); o.vis.rim.geometry.dispose();
    o.vis = null;
  },
  pre(sys) { const t = sys.time; syrupMaterial().map.offset.set(Math.sin(t * 0.2) * 0.03, -t * 0.02); syrupSheenMaterial().map.offset.x = (t * 0.08) % 1; },
  warm(sys) { const g = tiledPlane(1, 1); return [new THREE.Mesh(g, syrupMaterial()), new THREE.Mesh(g, syrupSheenMaterial()), new THREE.Mesh(syrupRimGeometry(0, 1, 1, true), syrupRimMaterial())]; },
};

// ---------------- gumball (rolling, shootable) ----------------
const GUM_R = 1.5, ROLL_LEN = 14;
/** Bullet target for every live gumball (registered once per session, like barrels: tracers carry damage). */
function gumTarget(sys) {
  return sys.view('gumTarget', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const t = {
      kind: 'gumball', bit: HIT.BARREL, priority: 7, balls: [],
      sweep(bl, x, zHi, zLo) {
        let best = null;
        for (const b of t.balls) {
          if (b.state !== 'rest' && b.state !== 'roll') continue;
          const front = b.z + b.r;
          if (front > zHi + b.r * 2 || front < zLo || Math.abs(x - b.x) > b.r) continue;
          if (best && b.z <= best.z) continue;
          if (bl.nh && hasHit(bl, b)) continue;
          best = b;
        }
        return best;
      },
      hit(b, bl) {
        b.flash = 1;
        const run = sys.game.run;
        if (!run || !run.active || !(bl.bdmg > 0)) return true; // main shots are absorbed (tracers carry the damage)
        b.hp -= bl.bdmg;
        pos.x = bl.x; pos.y = bl.y + 0.3; pos.z = b.z + b.r;
        const ev = sys.game.events;
        if (ev.wants('bullet:hit')) ev.emit('bullet:hit', { kind: 'barrel', pos });
        if (b.hp <= 0) gumball.burst(sys, b);
        return true;
      },
    };
    sys.game.bullets.addTargetSystem(t);
    return t;
  });
}
const gumPool = (sys) => sys.view('gumPool', () => ({ free: [] }));

export const gumball = {
  kind: 'gumball',
  create(sys, ev) {
    const T = gumTarget(sys);
    const n = Math.max(1, ev.count || 1), sp = ev.spacing || 12;
    const lane = ev.lane === 'R' ? 'R' : 'L';
    const o = { balls: [], roll: ev.roll || 6, rate: ev.rate || 40, from: ev.at, to: ev.at + (ev.length || ROLL_LEN + 6 + (n - 1) * sp) };
    for (let i = 0; i < n; i++) {
      const ln = ev.zigzag && i % 2 ? other(lane) : lane;
      const x = Math.max(-3.4, Math.min(3.4, LANES[ln] + (ev.dx || 0)));
      const restD = ev.at + ROLL_LEN + 2 + i * sp;
      const b = { x, z: -restD, restD, r: GUM_R, hp: ev.hp || 80, max: ev.hp || 80, state: 'rest', t: 0, rot: 0, flash: 0, vis: null };
      const rr = (b.r + 0.25) * (b.r + 0.25);
      b.test = (mx, mz) => { const dx = mx - b.x, dz = mz - b.z; return dx * dx + dz * dz < rr; };
      b.zone = { kind: 'lane', x0: x - b.r, x1: x + b.r, zNear: 0, zFar: 0, pad: 0.45 };
      b.vis = gumball.visual(sys, GUM_COLORS[(Math.round(restD * 7) + i) % GUM_COLORS.length]);
      o.balls.push(b);
      T.balls.push(b);
    }
    return o;
  },
  visual(sys, color) {
    const pool = gumPool(sys);
    let v = pool.free.pop();
    if (v && v.low !== sys.low) { v.ball.material.dispose(); v = null; } // made for the other quality: drop it
    if (!v) {
      const group = new THREE.Group();
      const ball = new THREE.Mesh(gumballGeometry(sys.low), gumballMaterial(color));
      ball.scale.setScalar(GUM_R);
      const gloss = new THREE.Mesh(gumGlossGeometry(), gumGlossMaterial());
      gloss.position.set(-0.53 * GUM_R, 0.6 * GUM_R, 0.66 * GUM_R); // on the surface, toward the camera / sky
      const shadow = new THREE.Mesh(gumShadowGeometry(), gumShadowMaterial());
      shadow.scale.setScalar(GUM_R * 0.95);
      shadow.renderOrder = 1;
      group.add(ball, gloss);
      v = { group, ball, gloss, shadow, low: sys.low };
    }
    v.ball.material.color.set(color); v.ball.material.emissive.set(color);
    v.group.visible = true; v.shadow.visible = true;
    sys.game.scene.add(v.group, v.shadow);
    return v;
  },
  burst(sys, b) {
    b.state = 'burst'; b.t = 0;
    sys.budget.delete(b);
    const B = sys.fxB(), col = b.vis ? b.vis.ball.material.color.getHex() : 0xff3b6b;
    if (B) {
      B.impact(b.x, b.z, col);
      B.sparkle(b.x, b.r, b.z, 0xffffff, sys.low ? 6 : 14, 1.6, 0, 1.2);
      if (B.D) {
        const n = sys.low ? 6 : 14;
        for (let i = 0; i < n; i++) { // visual only
          const a = (i / n) * Math.PI * 2;
          B.D.spawn(b.x + Math.cos(a) * 0.6, b.r, b.z + Math.sin(a) * 0.6, Math.cos(a) * 4, 3 + Math.random() * 3, Math.sin(a) * 4, 1.0, 0.3 + Math.random() * 0.2, col);
        }
      }
    }
    sys.sfx('barrelBreak');
    sys.shake(0.12);
  },
  update(sys, o, dt) {
    const dist = sys.dist, L = sys.game.squad.leader, run = sys.game.run;
    const speed = Math.max(1, sys.speed);
    let alive = 0;
    for (const b of o.balls) {
      if (b.state === 'rest') {
        // starts rolling so that it meets the squad ~ROLL_LEN u before its rest spot
        if (run && run.phase === 'run' && b.restD - dist < ROLL_LEN * (speed + o.roll) / o.roll) { b.state = 'roll'; sys.sfx('rumble'); }
      }
      if (b.state === 'roll') {
        b.z += o.roll * dt;
        b.rot += (o.roll * dt) / b.r;
        sys.killIn(b.test, o.rate, 'gumball', b);
        if (b.z > L.z + 14) { b.state = 'gone'; sys.budget.delete(b); }
      }
      if (b.state === 'rest' || b.state === 'roll') {
        if (b.z - b.r < L.z + 2 && L.z - b.z < 60) { b.zone.zNear = L.z + 4; b.zone.zFar = b.z - b.r; sys.danger.push(b.zone); }
      } else if (b.state === 'burst') { b.t += dt; if (b.t > 0.4) b.state = 'gone'; }
      if (b.state !== 'gone') alive++;
    }
    return alive > 0 && dist < o.to + 80;
  },
  sync(sys, o, dt) {
    for (const b of o.balls) {
      const v = b.vis;
      if (!v) continue;
      const show = b.state === 'rest' || b.state === 'roll';
      v.group.visible = show; v.shadow.visible = show;
      if (!show) continue;
      b.flash = Math.max(0, b.flash - dt * 6);
      const bob = b.state === 'rest' ? 0.05 * Math.sin(sys.time * 3 + b.restD) : Math.abs(Math.sin(b.rot * 2)) * 0.06;
      v.group.position.set(b.x, b.r + bob, b.z);
      v.ball.rotation.x = b.rot;
      const hurt = 1 - Math.max(0, b.hp) / b.max;
      v.ball.material.emissiveIntensity = 0.22 + 0.9 * b.flash + 0.25 * hurt;
      v.shadow.position.set(b.x, 0.03, b.z);
    }
  },
  release(sys, o) {
    const T = gumTarget(sys), pool = gumPool(sys);
    for (const b of o.balls) {
      const i = T.balls.indexOf(b);
      if (i >= 0) T.balls.splice(i, 1);
      sys.budget.delete(b);
      if (!b.vis) continue;
      sys.game.scene.remove(b.vis.group, b.vis.shadow);
      pool.free.push(b.vis);
      b.vis = null;
    }
    o.balls.length = 0;
  },
  warm(sys) {
    return [new THREE.Mesh(gumballGeometry(true), gumballMaterial(GUM_COLORS[0])), new THREE.Mesh(gumGlossGeometry(), gumGlossMaterial()), new THREE.Mesh(gumShadowGeometry(), gumShadowMaterial())];
  },
};

// ---------------- choco (chocolate waterfalls) ----------------
const CHOCO_D = 1.2;   // half depth of a pour along z
function chocoPhase(sys, o, f, dt = 0) { const c = (sys.time + dt + f.ph) % o.period; return c < 0 ? c + o.period : c; }
function chocoHot(sys, o, f, t0, t1) {
  for (let t = Math.max(0, t0); t <= t1; t += 0.1) if (chocoPhase(sys, o, f, t) < o.on) return true;
  return false;
}
/** Bullet blocker: a pouring curtain stops every bullet crossing it (gates behind it go unshot meanwhile). */
function chocoTarget(sys) {
  return sys.view('chocoTarget', () => {
    const t = {
      kind: 'choco', bit: 0, priority: 9, falls: [],
      sweep(bl, x, zHi, zLo) {
        let best = null;
        for (const f of t.falls) {
          if (!f.pour || x < f.x0 || x > f.x1 || f.z > zHi || f.z < zLo) continue;
          if (!best || f.z > best.z) best = f;
        }
        return best;
      },
      hit(f, bl) {
        if (!sys.low && Math.random() < 0.08) { const B = sys.fxB(); if (B) B.sparks(bl.x, 0.7, f.z + 0.4, 0x8a4a24, 1, 0.4); } // visual only
        return true;
      },
    };
    sys.game.bullets.addTargetSystem(t);
    return t;
  });
}

export const choco = {
  kind: 'choco',
  create(sys, ev) {
    const T = chocoTarget(sys);
    const lane = ev.lane === 'R' ? 'R' : 'L';
    const n = Math.max(1, ev.count || 1), sp = ev.spacing || 10;
    const o = { falls: [], period: ev.period || 3.4, on: ev.on || 1.4, warn: ev.warn || 0.9, rate: ev.rate || 14, from: ev.at, to: ev.at + (n - 1) * sp + 4 };
    for (let i = 0; i < n; i++) {
      const ln = ev.zigzag && i % 2 ? other(lane) : lane;
      const r = sys.laneRange(ln, {});
      const f = { x0: r.x0, x1: r.x1, x: (r.x0 + r.x1) / 2, z: -(ev.at + 2 + i * sp), side: ln === 'L' ? -1 : 1, ph: (i * o.period) / Math.max(2, n) + (ev.at % 7) * 0.3, pour: false, warnK: 0, h: 0, drip: 0 };
      f.test = (mx, mz) => mx > f.x0 - 0.1 && mx < f.x1 + 0.1 && Math.abs(mz - f.z) < CHOCO_D;
      f.zone = { kind: 'lane', x0: f.x0, x1: f.x1, zNear: f.z + CHOCO_D, zFar: f.z - CHOCO_D, pad: 0.4 };
      f.vis = choco.buildFall(sys, f);
      o.falls.push(f);
      T.falls.push(f);
    }
    return o;
  },
  buildFall(sys, f) {
    const w = f.x1 - f.x0;
    const group = new THREE.Group();
    const postX = f.side * (ROAD_HALF + 0.55);
    const spout = new THREE.Mesh(chocoSpoutGeometry(Math.round(w * 10) / 10 + 0.6, f.side, sys.low), chocoSpoutMaterial());
    spout.position.x = postX;
    const curtain = new THREE.Mesh(chocoCurtainGeometry(Math.round((w - 0.2) * 10) / 10), chocoMaterial());
    curtain.position.set(f.x, CHOCO_H, 0);
    curtain.renderOrder = 3;
    curtain.visible = false;
    const pool = new THREE.Mesh(chocoPoolGeometry(), chocoPoolMaterial());
    pool.position.set(f.x, 0.04, 0);
    pool.scale.set(w * 0.55, 1, CHOCO_D * 1.4);
    pool.renderOrder = 1;
    group.add(spout, curtain, pool);
    group.position.z = f.z;
    sys.game.scene.add(group);
    return { group, curtain, pool };
  },
  update(sys, o) {
    const dist = sys.dist, sq = sys.game.squad, L = sq.leader;
    if (dist > o.to + 30) return false;
    const speed = Math.max(1, sys.speed);
    const c = sq.center(_c);
    const blobT = (c.r * 2 + 1.5) / speed;
    for (const f of o.falls) {
      const ph = chocoPhase(sys, o, f);
      const was = f.pour;
      f.pour = ph < o.on;
      f.warnK = ph >= o.period - o.warn ? (ph - (o.period - o.warn)) / o.warn : 0;
      if (f.pour && !was && Math.abs(L.z - f.z) < 40) sys.sfx('rumble');
      if (f.pour) sys.killIn(f.test, o.rate, 'choco', f);
      const ta = (L.z - f.z) / speed;
      if (ta + blobT > 0 && ta < 4 && chocoHot(sys, o, f, ta - 0.3, ta + blobT)) sys.danger.push(f.zone);
    }
    return true;
  },
  sync(sys, o, dt) {
    const low = sys.low, B = sys.fxB(), t = sys.time;
    for (const f of o.falls) {
      const v = f.vis;
      if (!v) continue;
      f.h += ((f.pour ? 1 : 0) - f.h) * Math.min(1, dt * (f.pour ? 9 : 5));
      const show = f.h > 0.03;
      v.curtain.visible = show;
      if (show) {
        // pours from the trough down; when it stops, the tail drops away
        v.curtain.scale.set(1, CHOCO_H * f.h, 1);
        v.curtain.position.y = f.pour ? CHOCO_H * (1 - f.h) : 0;
      }
      const pulse = 0.5 + 0.5 * Math.sin(t * (8 + 10 * f.warnK));
      v.pool.material.opacity = Math.max(0.85 * f.h, f.warnK * (0.25 + 0.35 * pulse), 0.12);
      if (!low && B) {
        f.drip -= dt;
        if (f.drip <= 0 && (f.warnK > 0 || f.pour)) { // visual only
          f.drip = f.pour ? 0.05 : 0.12;
          B.sparks(f.x0 + Math.random() * (f.x1 - f.x0), f.pour ? 0.3 : CHOCO_H, f.z + (Math.random() - 0.5) * 0.6, 0x6a3418, f.pour ? 2 : 1, 0.6);
        }
      }
    }
  },
  pre(sys) { chocoTexture().offset.y = (sys.time * 1.6) % 1; },
  release(sys, o) {
    const T = chocoTarget(sys);
    for (const f of o.falls) {
      const i = T.falls.indexOf(f);
      if (i >= 0) T.falls.splice(i, 1);
      if (!f.vis) continue;
      sys.game.scene.remove(f.vis.group);
      f.vis.pool.material.dispose();
      f.vis = null;
    }
    o.falls.length = 0;
  },
  warm(sys) {
    return [new THREE.Mesh(chocoSpoutGeometry(5, -1, true), chocoSpoutMaterial()), new THREE.Mesh(chocoCurtainGeometry(4.6), chocoMaterial()), new THREE.Mesh(chocoPoolGeometry(), chocoPoolMaterial())];
  },
};

export const CANDY_KINDS = [jelly, syrup, gumball, choco];
