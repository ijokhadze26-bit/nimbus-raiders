// Storm Citadel hazards (update 3):
//   platform  { at, length, w?, amp?, period? }  a hole across the whole road (cut ~230 u ahead) with a deck
//             sliding side to side over it: while the squad crosses, members off the deck fall (mods.airborne
//             pauses obstacles' fall check; sys.fallUnless keeps the deck solid). The deck is at least as wide as
//             the blob plus a margin, so following it is the task, not squeezing onto it.
//   lightning { at, length, every, r, warn }  strikes marked in advance (violet circles, a charge orb gathers),
//             then a bolt kills inside (FALLER).
//   wind      { at, length, dir:1|-1, push?, period? }  gust zone: arrows + streaks, pushes the squad sideways
//             (mods.pushX, gusting) with weaker steering; members shoved past the road edge are blown off.
//   collapse  { at, length, weak:'L'|'R', warn?, fast?, slow? }  a bridge segment (stone slabs over a hole)
//             shakes once Pip steps on it, then crumbles from the back: the cracked `weak` lane faster than the
//             squad runs (its stragglers fall), the solid lane slower (safe).
import * as THREE from 'three';
import { ROAD_HALF } from '../../config.js';
import { TILE_LEN } from '../../models/props.js';
import { FALLER, TMP } from './common.js';
import { InstPool } from '../../models/hazards/common.js';
import { tiledPlane } from '../../models/hazards/candy.js';
import {
  platformGeometry, platformMaterial, platformGlowGeometry, glowTrimMaterial, railGeometry, railMaterial, underGlowMaterial,
  boltGeometry, boltMaterial, orbGeometry, orbMaterial, flatDisc, impactMaterial, windArrowTexture, windArrowMaterial,
  streakGeometry, streakMaterial, windsockGeometry, windsockMaterial, slabGeometry, slabMaterial, slabCrackGeometry,
  slabCrackMaterial,
} from '../../models/hazards/citadel.js';

const { m: _m, q: _q, p: _p, s: _s } = TMP;
const _e = new THREE.Euler();
const _col = new THREE.Color(), STONE_C = new THREE.Color('#8a86a6');
const _c = { x: 0, z: 0, r: 0 };
const TAU = Math.PI * 2;
const EDGE = 4.45;
const hash = (a) => { const s = Math.sin(a * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Road span of a hazard-made hole across the whole road, on tile boundaries. */
function holeSpan(ev, min = 4) {
  const g0 = Math.floor(ev.at / TILE_LEN) * TILE_LEN;
  return [g0, g0 + Math.max(min, Math.ceil((ev.length || 16) / TILE_LEN) * TILE_LEN)];
}
function reserveHole(sys, ev, tag) {
  const [g0, g1] = holeSpan(ev);
  const gap = { lane: 'C', from: g0, to: g1, at: g0, hazard: tag };
  const view = sys.addGap(gap);
  return { gap, view };
}
/** While any of the squad is over [g0, g1] (with margins) the hazard carries the fall check. */
function overSpan(sys, g0, g1) {
  const c = sys.game.squad.center(_c);
  return sys.dist + 2 >= g0 - 1.5 && -(c.z + c.r) <= g1 + 1.5;
}
/** The autopilot reads the zone from 40 u before the hole until the back of the blob has left it. */
function zoneTime(sys, g0, g1) {
  const c = sys.game.squad.center(_c);
  return sys.dist > g0 - 40 && -(c.z + c.r) <= g1 + 1;
}

// ---------------- platform (moving deck over a hole) ----------------
export const platform = {
  kind: 'platform',
  reserve(sys, ev) { return reserveHole(sys, ev, 'platform'); },
  create(sys, ev) {
    const res = sys.reserved.get(ev) || platform.reserve(sys, ev);
    sys.reserved.delete(ev);
    const [g0, g1] = holeSpan(ev);
    const R = Math.max(0, sys.game.squad.center(_c).r - 0.3);
    const w = Math.max(3, Math.min(9.2, Math.max(ev.w || 6, 2 * R * 0.8 + 1.4)));
    const amp = Math.min(ev.amp ?? 1.5, Math.max(0.2, 5.4 - w / 2));
    const o = { g0, g1, w, amp, period: ev.period || 4.4, ph: (ev.at % 5) * 0.7, x: 0, active: false, gap: res.gap };
    o.zoneL = { kind: 'lane', x0: -9, x1: -w / 2, zNear: -g0 + 1, zFar: -g1, pad: 0.35, w: 2 };
    o.zoneR = { kind: 'lane', x0: w / 2, x1: 9, zNear: -g0 + 1, zFar: -g1, pad: 0.35, w: 2 };
    o.solid = (x, z) => { const d = -z; return d >= g0 - 0.5 && d <= g1 + 0.5 && Math.abs(x - o.x) < o.w / 2 + 0.1; };
    const len = g1 - g0;
    const root = new THREE.Group();
    const deck = new THREE.Group();
    const slab = new THREE.Mesh(platformGeometry(w, len - 0.3, sys.low), platformMaterial());
    const glow = new THREE.Mesh(platformGlowGeometry(w, len - 0.3), glowTrimMaterial());
    deck.add(slab, glow);
    if (!sys.low) {
      const under = new THREE.Mesh(flatDisc(), underGlowMaterial());
      under.scale.set(w * 0.45, 1, len * 0.4);
      under.position.set(0, -1.0, -(len - 0.3) / 2);
      under.rotation.x = Math.PI;
      deck.add(under);
    }
    deck.position.z = -0.15;
    const rails = new THREE.Mesh(railGeometry(len), railMaterial());
    root.add(deck, rails);
    root.position.z = -g0;
    sys.game.scene.add(root);
    o.vis = { root, deck, slab, glow };
    o.x = platform.xAt(sys, o);
    return o;
  },
  xAt(sys, o, dt = 0) { return o.amp * Math.sin(((sys.time + dt) * TAU) / o.period + o.ph); },
  update(sys, o) {
    const dist = sys.dist;
    if (dist > o.g1 + 30) return false;
    o.x = platform.xAt(sys, o);
    o.active = overSpan(sys, o.g0, o.g1);
    if (o.active) { sys.mods.airborne = true; sys.fallUnless(o.solid); }
    if (zoneTime(sys, o.g0, o.g1)) {
      // where the deck will be when the squad reaches it (at most ~0.6 s ahead: the bot keeps re-aiming)
      const ta = Math.max(0, Math.min(0.6, (o.g0 - dist) / Math.max(1, sys.speed)));
      const px = platform.xAt(sys, o, ta), hw = o.w / 2 - 0.15;
      o.zoneL.x1 = px - hw; o.zoneR.x0 = px + hw;
      sys.danger.push(o.zoneL, o.zoneR);
    }
    return true;
  },
  sync(sys, o) {
    const v = o.vis;
    if (!v) return;
    v.deck.position.x = o.x;
    v.glow.material.opacity = 0.75 + 0.25 * Math.sin(sys.time * 5 + o.g0);
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.root);
    o.vis.slab.geometry.dispose(); o.vis.glow.geometry.dispose();
    o.vis = null;
  },
  warm(sys) { return [new THREE.Mesh(platformGeometry(4, 4, true), platformMaterial()), new THREE.Mesh(platformGlowGeometry(4, 4), glowTrimMaterial()), new THREE.Mesh(railGeometry(8), railMaterial()), new THREE.Mesh(flatDisc(), underGlowMaterial())]; },
};

// ---------------- lightning (marked strikes) ----------------
const BOLT_T = 0.3;
const LIGHTNING = {
  reason: 'lightning', color: '#b48aff', fallT: 0.12, height: 16, killRate: 50,
  land(sys, d) {
    const B = sys.fxB();
    if (B) { B.impact(d.x, d.z, 0xc8a8ff); B.sparks(d.x, 0.4, d.z, 0xe6d8ff, sys.low ? 3 : 8, 1.2); }
    sys.sfx('lightning');
    const L = sys.game.squad.leader;
    if (Math.abs(L.z - d.z) < 14) sys.shake(0.16);
    const f = sys.game.world.flash; // storm themes: the sky light flickers with the strike (cosmetic)
    if (f) f.k = Math.max(f.k, 0.7);
  },
};
function stormPools(sys) {
  return sys.view('lightning', () => ({
    bolts: new InstPool(sys.game.scene, boltGeometry(), boltMaterial(), 12),
    orbs: new InstPool(sys.game.scene, orbGeometry(), orbMaterial(), 16),
    glows: new InstPool(sys.game.scene, flatDisc(), impactMaterial(), 16),
  }));
}
export const lightning = {
  kind: 'lightning',
  create(sys, ev) { stormPools(sys); return FALLER.create(sys, ev, LIGHTNING); },
  update: FALLER.update,
  sync(sys, o) {
    const v = stormPools(sys);
    for (const d of o.drops) {
      if (!d.landed) {
        // a charge orb gathers above the mark, sinking and swelling as the strike nears
        const k = Math.min(1, d.t / d.warn);
        _q.identity();
        _m.compose(_p.set(d.x, 7 - 4.5 * k, d.z), _q, _s.setScalar(0.4 + 0.9 * k));
        v.orbs.put(_m);
        continue;
      }
      const age = d.t - d.warn;
      if (age > BOLT_T + 0.2) continue;
      const k = Math.max(0, 1 - age / BOLT_T);
      if (age < BOLT_T) {
        _e.set(0, hash(d.x * 3 + d.z) * TAU, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(d.x, 0, d.z), _q, _s.set(0.4 + 0.8 * k, 1, 0.4 + 0.8 * k));
        v.bolts.put(_m);
      }
      _q.identity();
      const gr = d.r * (1.1 + 0.6 * (1 - k));
      _m.compose(_p.set(d.x, 0.05, d.z), _q, _s.set(gr, 1, gr));
      v.glows.put(_m);
    }
  },
  release: FALLER.release,
  pre(sys) { const v = stormPools(sys); v.bolts.begin(); v.orbs.begin(); v.glows.begin(); },
  post(sys) { const v = stormPools(sys); v.bolts.end(); v.orbs.end(); v.glows.end(); },
  warm() { return [new THREE.InstancedMesh(boltGeometry(), boltMaterial(), 1), new THREE.InstancedMesh(orbGeometry(), orbMaterial(), 1), new THREE.InstancedMesh(flatDisc(), impactMaterial(), 1)]; },
};

// ---------------- wind (gust zone) ----------------
const STREAKS = 30;
const windPool = (sys) => sys.view('wind', () => ({ streaks: new InstPool(sys.game.scene, streakGeometry(), streakMaterial(), STREAKS) }));
export const wind = {
  kind: 'wind',
  create(sys, ev) {
    windPool(sys);
    const dir = ev.dir < 0 || ev.dir === 'L' ? -1 : 1;     // the push direction (+1 = toward +x)
    const len = ev.length || 36;
    const o = { from: ev.at, to: ev.at + len, dir, push: ev.push || 6, period: ev.period || 2.4, ph: (ev.at % 3) * 1.3, rate: ev.rate || 16, k: 0, gust: 0, on: false };
    o.test = (x) => x * dir > EDGE;
    o.zone = { kind: 'lane', x0: dir > 0 ? 3.1 : -9, x1: dir > 0 ? 9 : -3.1, zNear: -o.from + 2, zFar: -o.to, pad: 0.3, shift: dir * 1.0 };
    const group = new THREE.Group();
    const geo = tiledPlane(2 * ROAD_HALF - 0.4, len, 2.6);
    const arrows = new THREE.Mesh(geo, windArrowMaterial());
    arrows.position.set(0, 0.05, -len / 2);
    arrows.scale.x = dir;
    arrows.renderOrder = 2;
    group.add(arrows);
    for (const x of [-ROAD_HALF - 0.5, ROAD_HALF + 0.5]) {
      for (const z of sys.low ? [0] : [0, -len]) {
        const sock = new THREE.Mesh(windsockGeometry(sys.low), windsockMaterial());
        sock.position.set(x, 0, z);
        sock.scale.x = dir;
        group.add(sock);
      }
    }
    group.position.z = -o.from;
    sys.game.scene.add(group);
    o.vis = { group, geo, arrows };
    return o;
  },
  update(sys, o, dt) {
    const dist = sys.dist, m = sys.mods;
    if (dist > o.to + 20) return false;
    o.on = dist >= o.from && dist <= o.to;
    o.k += ((o.on ? 1 : 0) - o.k) * Math.min(1, dt * 4);
    o.gust = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((sys.time * TAU) / o.period + o.ph));
    if (o.k > 0.02) {
      m.pushX += o.dir * o.push * o.gust * o.k;
      m.easeMul *= 1 - 0.35 * o.k;
      if (o.on) sys.killIn(o.test, o.rate, 'wind', o);
    }
    if (dist > o.from - 40) sys.danger.push(o.zone);
    return true;
  },
  sync(sys, o) {
    const v = o.vis;
    if (!v) return;
    v.arrows.material.opacity = 0.22 + 0.35 * o.gust;
    // streaks blow across the zone near the camera (procedural, no per-frame allocation)
    const camZ = sys.game.camera.position.z, P = windPool(sys);
    const z0 = Math.min(-o.from + 4, camZ - 4), z1 = Math.max(-o.to, camZ - 60);
    if (z0 <= z1) return;
    const n = sys.low ? 10 : STREAKS, t = sys.time;
    _q.identity();
    for (let i = 0; i < n; i++) {
      const a = hash(i + o.from), b = hash(i * 2.3 + 7), c = hash(i * 5.1 + 3);
      const z = -o.from - a * (o.to - o.from);
      if (z > z0 || z < z1) continue;
      const u = (c + t * (0.55 + 0.35 * b) * (0.6 + 0.6 * o.gust)) % 1;
      const len = 1.4 + 2.2 * b * o.gust;
      _m.compose(_p.set(o.dir * (-8 + 16 * u), 0.4 + 3.4 * b, z), _q, _s.set(len, 1, 1));
      P.streaks.put(_m);
    }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.geo.dispose(); o.vis.arrows.material.dispose();
    o.vis = null;
  },
  pre(sys) { windPool(sys).streaks.begin(); windArrowTexture().offset.x = -(sys.time * 1.2) % 1; },
  post(sys) { windPool(sys).streaks.end(); },
  warm(sys) { return [new THREE.Mesh(tiledPlane(1, 1), windArrowMaterial()), new THREE.InstancedMesh(streakGeometry(), streakMaterial(), 1), new THREE.Mesh(windsockGeometry(true), windsockMaterial())]; },
};

// ---------------- collapse (crumbling bridge) ----------------
const SLAB_W = ROAD_HALF - 0.04;
export const collapse = {
  kind: 'collapse',
  reserve(sys, ev) {
    const res = reserveHole(sys, ev, 'collapse');
    // the hole is hidden under the bridge: no "hole ahead" chevrons on the road before it
    if (res.view) { res.view.chev.visible = false; res.view.glow.visible = false; }
    return res;
  },
  create(sys, ev) {
    const res = sys.reserved.get(ev) || collapse.reserve(sys, ev);
    sys.reserved.delete(ev);
    const [g0, g1] = holeSpan(ev);
    const n = (g1 - g0) / TILE_LEN;
    const weak = ev.weak === 'R' ? 1 : 0;
    const o = { g0, g1, n, weak, warn: ev.warn ?? 0.8, fast: ev.fast || 1.45, slow: ev.slow || 0.85, state: 'idle', t: 0, fall: new Float32Array(2 * n).fill(-1), gap: res.gap };
    o.solid = (x, z) => {
      const d = -z;
      if (d < g0 || d >= g1) return false;
      const k = Math.min(n - 1, Math.floor((d - g0) / TILE_LEN));
      return o.fall[(x < 0 ? 0 : 1) * n + k] < 0.12;
    };
    // the fast front only catches the squad's tail deeper in: the bot lines up late (a barrel / gate just before
    // the bridge still gets its say)
    o.zone = { kind: 'lane', x0: weak ? 0 : -9, x1: weak ? 9 : 0, zNear: -g0 + 1, zFar: -g1, pad: 0.3, w: 1.5, look: 12 };
    const slabs = new THREE.InstancedMesh(slabGeometry(SLAB_W, sys.low), slabMaterial(), 2 * n);
    const cracks = new THREE.InstancedMesh(slabCrackGeometry(SLAB_W), slabCrackMaterial(), n);
    for (const im of [slabs, cracks]) { im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; }
    const road = sys.game.world.theme.road;
    for (let lane = 0; lane < 2; lane++) {
      for (let k = 0; k < n; k++) {
        _col.set(k & 1 ? road.b : road.a).multiplyScalar(1.3);
        if (lane === weak) _col.lerp(STONE_C, 0.4).multiplyScalar(0.75);
        slabs.setColorAt(lane * n + k, _col);
      }
    }
    sys.game.scene.add(slabs, cracks);
    o.vis = { slabs, cracks };
    collapse.place(sys, o, 0);
    return o;
  },
  update(sys, o, dt) {
    const dist = sys.dist;
    if (dist > o.g1 + 45) return false;
    if (o.state === 'idle' && dist >= o.g0 - 0.5 && sys.live) { o.state = 'shake'; o.t = 0; sys.sfx('rumble'); sys.shake(0.2); }
    if (o.state !== 'idle') {
      o.t += dt;
      const speed = Math.max(1, sys.speed);
      const fw = o.g0 + Math.max(0, o.t - o.warn) * speed * o.fast;
      const fs = o.g0 + Math.max(0, o.t - o.warn - 0.35) * speed * o.slow;
      let gone = 0;
      for (let lane = 0; lane < 2; lane++) {
        const front = lane === o.weak ? fw : fs;
        for (let k = 0; k < o.n; k++) {
          const i = lane * o.n + k;
          if (o.fall[i] < 0 && o.g0 + (k + 1) * TILE_LEN <= front) { o.fall[i] = 0; if (k % 3 === 0) sys.sfx('fall'); }
          else if (o.fall[i] >= 0) o.fall[i] += dt;
          if (o.fall[i] >= 0) gone++;
        }
      }
      if (gone === 2 * o.n) o.state = 'gone';
    }
    if (overSpan(sys, o.g0, o.g1)) { sys.mods.airborne = true; sys.fallUnless(o.solid); }
    if (zoneTime(sys, o.g0, o.g1)) sys.danger.push(o.zone);
    return true;
  },
  place(sys, o, t) {
    const v = o.vis, n = o.n, live = o.state !== 'idle';
    let nc = 0;
    for (let lane = 0; lane < 2; lane++) {
      const x = (lane ? 1 : -1) * (ROAD_HALF / 2);
      for (let k = 0; k < n; k++) {
        const i = lane * n + k, f = o.fall[i];
        const z = -(o.g0 + (k + 0.5) * TILE_LEN);
        let y = 0, rx = 0, rz = 0, sc = 1, jx = 0;
        if (f >= 0) {
          y = -7 * f * f; rx = f * (1.2 + hash(i) * 1.5) * (hash(i + 3) < 0.5 ? -1 : 1); rz = f * (hash(i + 9) - 0.5) * 2;
          if (f > 1.6) sc = 0;
        } else if (live && o.state !== 'gone') {
          const a = (lane === o.weak ? 0.07 : 0.03) * (0.6 + 0.4 * Math.sin(t * 50 + i));
          jx = Math.sin(t * 61 + i * 1.7) * a; y = Math.sin(t * 47 + i) * a * 0.6;
        }
        _e.set(rx, 0, rz); _q.setFromEuler(_e);
        _m.compose(_p.set(x + jx, y, z), _q, _s.set(sc, sc, sc));
        v.slabs.setMatrixAt(i, _m);
        if (lane === o.weak && sc > 0) v.cracks.setMatrixAt(nc++, _m);
      }
    }
    v.slabs.instanceMatrix.needsUpdate = true;
    if (v.slabs.instanceColor) v.slabs.instanceColor.needsUpdate = true;
    v.cracks.count = nc;
    v.cracks.instanceMatrix.needsUpdate = true;
  },
  sync(sys, o) {
    if (!o.vis) return;
    if (o.state !== 'idle') collapse.place(sys, o, sys.time);
    const B = sys.fxB();
    if (B && !sys.low && o.state === 'shake' && Math.random() < 0.3) { // visual only: dust off the crumbling edge
      const lane = Math.random() < 0.7 ? o.weak : 1 - o.weak;
      B.sparkle((lane ? 1 : -1) * (1 + Math.random() * 3.5), 0.1, -(o.g0 + Math.random() * (o.g1 - o.g0)), 0x9a94b8, 1, 0.5, 0, 0.6);
    }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.slabs, o.vis.cracks);
    o.vis.slabs.dispose(); o.vis.cracks.dispose();
    o.vis = null;
  },
  pre(sys) { slabCrackMaterial().opacity = 0.45 + 0.3 * Math.sin(sys.time * 6); },
  warm(sys) { return [new THREE.InstancedMesh(slabGeometry(SLAB_W, true), slabMaterial(), 1), new THREE.InstancedMesh(slabCrackGeometry(SLAB_W), slabCrackMaterial(), 1)]; },
};

export const CITADEL_KINDS = [platform, lightning, wind, collapse];
