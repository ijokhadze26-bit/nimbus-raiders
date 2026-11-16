// Hero / ability effects (SPEC2 §3, §6.9). installHeroFx(fx) -> { update(dt), warmObjects() }.
// Listens to ability:use / ability:impact / ability:ready / hero:guard / turret:drop and reads the gameplay
// state it shows (meteor.pending, heroes.invulnT, status.freezeUntil) every frame, so a simulate() jump never
// leaves a stale effect. Visual only: Math.random is fine here, nothing feeds back into the simulation.
// Meshes: meteor rock (toon) + its target ring (additive; a friendly marker, never game.telegraph) and the
// Sugar Shield candy bubble (striped shell + additive rim, the rim is skipped on Low). Everything else is
// pooled particles through fx.B / fx.P, scaled by B.n() so Low halves counts but always keeps >= 1.
import * as THREE from 'three';
import { SOFT, RING, STREAK, STAR, FLAT_RING, FLAT_DISC, SHARD, PUFF } from './particles.js';
import { toonMaterial } from '../models/materials.js';
import { part, merge } from '../models/util.js';
import { stripes } from '../models/heroes/common.js';
import { registerWarm } from '../game/warmup.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a, b) => (Math.random() < 0.5 ? a : b);

let looks = null;
function getLooks() {
  if (looks) return looks;
  const rock = merge([
    part(new THREE.DodecahedronGeometry(0.9, 0), '#5a2a1c', {}),
    part(new THREE.DodecahedronGeometry(0.55, 0), '#ff7a1f', { p: [0.35, -0.3, 0.3], bright: 1.6 }),
    part(new THREE.DodecahedronGeometry(0.5, 0), '#ffb03a', { p: [-0.4, -0.25, -0.2], bright: 1.7 }),
    part(new THREE.DodecahedronGeometry(0.45, 0), '#3a1a12', { p: [0.1, 0.45, -0.35] }),
  ]);
  const ring = new THREE.RingGeometry(0.86, 1, 40);
  ring.rotateX(-Math.PI / 2);
  const ringIn = new THREE.CircleGeometry(1, 32);
  ringIn.rotateX(-Math.PI / 2);
  const mint = new THREE.Color('#8affc8'), pink = new THREE.Color('#ff8ad8'), lemon = new THREE.Color('#fff0a0');
  const bubble = stripes(new THREE.SphereGeometry(1, 24, 16), (x, y, z) => {
    const a = Math.atan2(z, x) + y * 2.2;
    const k = ((a / TAU) * 8 + 8) % 1;
    return k < 0.42 ? pink : k < 0.5 ? lemon : mint;
  });
  const rim = new THREE.SphereGeometry(1.06, 20, 12);
  looks = {
    rock, ring, ringIn, bubble, rim,
    rockMat: toonMaterial(),
    ringMat: new THREE.MeshBasicMaterial({ color: '#ff7a1f', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    bubbleMat: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    rimMat: new THREE.MeshBasicMaterial({ color: '#ffb3e6', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
  };
  return looks;
}

// every lazily shown mesh compiles at boot (programs never grow mid-run)
registerWarm(() => {
  const L = getLooks();
  return [new THREE.Mesh(L.rock, L.rockMat), new THREE.Mesh(L.ring, L.ringMat), new THREE.Mesh(L.bubble, L.bubbleMat), new THREE.Mesh(L.rim, L.rimMat)];
});

export function installHeroFx(fx) {
  return new HeroFx(fx);
}

class HeroFx {
  constructor(fx) {
    this.fx = fx;
    this.game = fx.game;
    const L = getLooks(), scene = this.game.scene;
    this.rock = new THREE.Mesh(L.rock, L.rockMat);
    this.rock.castShadow = true;
    this.ring = new THREE.Mesh(L.ring, L.ringMat);
    this.ringIn = new THREE.Mesh(L.ringIn, L.ringMat);
    this.ring.renderOrder = 3; this.ringIn.renderOrder = 3;
    this.bubble = new THREE.Mesh(L.bubble, L.bubbleMat);
    this.rim = new THREE.Mesh(L.rim, L.rimMat);
    this.bubble.renderOrder = 9; this.rim.renderOrder = 9;
    this.root = new THREE.Group();
    for (const m of [this.rock, this.ring, this.ringIn, this.bubble, this.rim]) { m.visible = false; m.frustumCulled = false; this.root.add(m); }
    scene.add(this.root);
    this.compiledQ = null;
    this.trailAcc = 0; this.snowAcc = 0; this.bubbleT = 0;
    this.rally = { left: 0, n: 0 };
    this.c = { x: 0, z: 0, r: 0 };
    this.bind();
  }

  get low() { return this.fx.quality === 'low'; }
  get vz() { return -this.game.squad.speed; }

  bind() {
    const ev = this.game.events, g = this.game;
    ev.on('ability:use', (p) => this.onUse(p));
    ev.on('ability:impact', (p) => (p.ability === 'meteor' ? this.meteorImpact(p) : this.shockwave(p)));
    ev.on('ability:ready', () => {
      const L = g.squad.leader;
      const P = this.fx.P;
      const k = P.spawn(FLAT_RING, L.x, 0.08, L.z, 0, 0, this.vz, 0.45, 0.4, 2.2, 0xffd34d, 0.9, 0.5);
      if (k >= 0) P.d.fade[k] = 0.3;
      this.fx.B.sparkle(L.x, 1.6, L.z, 0xffd34d, 6, 0.8, this.vz, 0.8);
    });
    ev.on('hero:guard', (p) => this.guardPop(p.pos));
    ev.on('turret:drop', (p) => { if (p.kind === 'fortress') this.fortressDrop(p.pos); });
    ev.on('run:start', () => { this.clear(); this.precompile(); });
  }

  clear() {
    this.rock.visible = false; this.ring.visible = false; this.ringIn.visible = false;
    this.bubble.visible = false; this.rim.visible = false;
    this.rally.left = 0; this.bubbleT = 0;
  }

  /**
   * A quality switch recompiles lit materials lazily (engine.flushQuality); hidden effect meshes and pooled
   * Fortress turrets would then compile on their first show, mid-fight. Re-warm them once per quality, at
   * run start (under the screen transition).
   */
  precompile() {
    const g = this.game, e = g.engine;
    if (!e || e.quality === this.compiledQ) return;
    this.compiledQ = e.quality;
    try {
      e.precompile(this.root);
      const H = g.helpers;
      if (H && H.builders.has('fortress')) {
        const v = H.visual('fortress');
        g.scene.add(v.root); e.precompile(v.root); g.scene.remove(v.root);
        H.pool.fortress.push(v);
      }
    } catch (err) { console.warn('[heroFx] precompile', err); }
  }

  onUse(p) {
    const g = this.game, B = this.fx.B, P = this.fx.P, L = g.squad.leader, vz = this.vz;
    switch (p.ability) {
      case 'rally': {
        for (let i = 0; i < 2; i++) {
          const k = P.spawn(FLAT_RING, L.x, 0.09, L.z + 1.2, 0, 0, vz, 0.55 + i * 0.15, 0.6, 6 + i * 2.5, i ? 0xbff0ff : 0x2f8cff, 0.95, 0.4, 0, 0, 0, -1, i * 0.1);
          if (k >= 0) P.d.fade[k] = 0.25;
        }
        P.spawn(RING, L.x, 1.6, L.z, 0, 0, vz, 0.4, 0.5, 3.2, 0x7fe0ff, 0.9, 0.6);
        B.sparkle(L.x, 2.2, L.z, 0x2f8cff, 10, 1.2, vz, 1.4);
        const a = g.heroes.abilities.rally.last;
        this.rally.left = 0.08; this.rally.n = a ? a.added : 5;
        break;
      }
      case 'whiteout': {
        this.fx.screen.flash('#ffffff', 0.85, 1.6);
        const k = P.spawn(FLAT_RING, L.x, 0.1, L.z - 2, 0, 0, vz, 0.7, 1, 14, 0xbff4ff, 0.95, 0.4);
        if (k >= 0) P.d.fade[k] = 0.3;
        // crystal burst from the raised rifle
        for (let i = 0, n = B.n(14); i < n; i++) {
          const a = Math.random() * TAU, sp = rnd(3, 7);
          P.spawn(SHARD, L.x, 2.6, L.z, Math.cos(a) * sp, rnd(2, 6), Math.sin(a) * sp + vz, rnd(0.5, 0.8), rnd(0.25, 0.4), 0.1, pick(0x9fe8ff, 0xffffff), 1, 0.35, 9);
        }
        P.spawn(STAR, L.x, 2.8, L.z, 0, 0, vz, 0.3, 0.8, 3, 0xffffff, 1, 0.8);
        // snow gust sweeping across the road ahead
        for (let i = 0, n = B.n(36); i < n; i++) {
          const z = L.z - rnd(2, 40), side = Math.random() < 0.5 ? -1 : 1;
          const kk = P.spawn(PUFF, side * rnd(4, 8), rnd(0.4, 3.5), z, -side * rnd(9, 16), rnd(-0.5, 0.5), rnd(-2, 2), rnd(0.6, 1.1), rnd(0.4, 0.7), rnd(1.2, 2.2), 0xeef8ff, 0.8, 0.15, 0, 1.2, 0.02, 0xffffff, rnd(0, 0.25));
          if (kk >= 0) P.d.fade[kk] = 0.35;
        }
        break;
      }
      case 'sugarshield': {
        this.bubbleT = 0;
        B.sparkle(L.x, 1.4, L.z + 1, 0xff8ad8, 18, 2, vz, 1.4);
        B.sparkle(L.x, 1.4, L.z + 1, 0x8affc8, 10, 1.6, vz, 1.2);
        P.spawn(RING, L.x, 1.2, L.z + 1, 0, 0, vz, 0.35, 0.6, 5, 0xffb3e6, 0.9, 0.5);
        break;
      }
      case 'shockwave': {
        P.spawn(STAR, L.x - 0.6, 0.6, L.z - 0.8, 0, 0, vz, 0.18, 0.8, 2.4, 0xffffff, 1, 0.8);
        break;
      }
      case 'meteor': {
        // Hot Hands flare from the raised fists
        for (let i = 0, n = B.n(10); i < n; i++) {
          P.spawn(PUFF, L.x + rnd(-0.4, 0.4), 2.4, L.z, rnd(-1, 1), rnd(2, 4), vz + rnd(-1, 1), rnd(0.3, 0.45), 0.3, 0.8, 0xffd34d, 1, 0.6, -2, 2, 0.02, 0xff3b1f);
        }
        break;
      }
      default: break;
    }
  }

  meteorImpact(p) {
    const B = this.fx.B, P = this.fx.P, D = this.fx.D, x = p.pos.x, z = p.pos.z, r = p.r || 5;
    B.explosion(x, 0.6, z, 2.1, 0x3a1a12);
    B.slam(x, z, r * 0.8);
    this.fx.screen.flash('#ffb03a', 0.4, 2.6);
    const fr = P.spawn(FLAT_RING, x, 0.12, z, 0, 0, 0, 0.6, 1, r * 2.3, 0xff7a1f, 1, 0.5);
    if (fr >= 0) P.d.fade[fr] = 0.3;
    const sc = P.spawn(FLAT_DISC, x, 0.06, z, 0, 0, 0, 3, r * 1.2, r * 1.5, 0x2a1410, 0.55);
    if (sc >= 0) P.d.fade[sc] = 0.55;
    // ring of ground flames + lava chunks
    for (let i = 0, n = B.n(18); i < n; i++) {
      const a = (i / 18) * TAU + rnd(-0.15, 0.15), rr = r * rnd(0.55, 1);
      const k = P.spawn(PUFF, x + Math.cos(a) * rr, 0.3, z + Math.sin(a) * rr, 0, rnd(1.5, 3), 0, rnd(0.6, 1.1), rnd(0.4, 0.6), rnd(0.9, 1.4), pick(0xffd34d, 0xffb03a), 1, 0.5, -1.5, 1.5, 0.02, 0xd8321e, rnd(0, 0.3));
      if (k >= 0) P.d.fade[k] = 0.35;
    }
    for (let i = 0, n = B.n(8); i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(3, 7);
      D.spawn(x, 0.8, z, Math.cos(a) * sp, rnd(6, 11), Math.sin(a) * sp, rnd(1, 1.4), rnd(0.25, 0.45), pick(0x5a2a1c, 0xff7a1f));
    }
  }

  shockwave(p) {
    const B = this.fx.B, P = this.fx.P, x = p.pos.x, z = p.pos.z, vz = this.vz;
    // three ground ring waves racing forward + a dust wall along the front
    for (let i = 0; i < 3; i++) {
      const k = P.spawn(FLAT_RING, x, 0.1 + i * 0.01, z - 1, 0, 0, -18 - i * 6, 0.65, 1, 9 + i * 3, i === 1 ? 0xffc531 : 0xc48aff, 0.95, 0.45, 0, 0, 0, -1, i * 0.07);
      if (k >= 0) P.d.fade[k] = 0.3;
    }
    B.slam(x, z - 1.2, 2.2);
    for (let i = 0, n = B.n(16); i < n; i++) {
      const a = -Math.PI / 2 + rnd(-1.2, 1.2), sp = rnd(10, 18);
      const k = P.spawn(PUFF, x + Math.cos(a) * 1.5, 0.4, z - 1.5, Math.cos(a) * sp * 0.6, rnd(0.5, 1.5), Math.sin(a) * sp, rnd(0.6, 0.9), 0.5, rnd(1.4, 2), 0xe3d5b8, 0.9, 0, -0.3, 2.4, 0.02, 0xf7f1e4);
      if (k >= 0) P.d.fade[k] = 0.3;
    }
    for (let i = 0, n = B.n(10); i < n; i++) {
      P.spawn(STREAK, x + rnd(-3, 3), 0.5, z - 2, rnd(-3, 3), rnd(1, 3), -rnd(16, 26) + vz, 0.35, 0.14, 0.05, pick(0xc48aff, 0xffffff), 1, 0.7, 4, 0.5, 0.05);
    }
  }

  guardPop(pos) {
    const P = this.fx.P, B = this.fx.B, vz = this.vz;
    const x = pos ? pos.x : this.game.squad.leader.x, z = pos ? pos.z : this.game.squad.leader.z;
    P.spawn(RING, x, 1.2, z, 0, 0, vz, 0.3, 0.4, 2.2, 0xff5a8a, 0.95, 0.5);
    P.spawn(STAR, x, 1.4, z, 0, 0, vz, 0.15, 0.4, 1.4, 0xffffff, 1, 0.8);
    B.sparkle(x, 1.3, z, 0xff8ab0, 5, 0.8, vz, 0.8);
  }

  fortressDrop(pos) {
    const B = this.fx.B, P = this.fx.P;
    B.landing(pos.x, pos.z, 1.2);
    B.sparkle(pos.x, 1.2, pos.z, 0xffd34d, 12, 1.2, this.vz, 1.2);
    // beacon: a light pillar where it lands
    P.spawn(SOFT, pos.x, 1.2, pos.z, 0, 0, this.vz, 0.5, 1.5, 3, 0x2fd6c8, 0.8, 0.9);
    for (let i = 0, n = B.n(6); i < n; i++) P.spawn(STREAK, pos.x + rnd(-0.3, 0.3), 0.3, pos.z, 0, rnd(8, 14), this.vz, 0.4, 0.16, 0.06, pick(0x2fd6c8, 0xffffff), 1, 0.8, 0, 0, 0.06);
  }

  update(dt) {
    const g = this.game, P = this.fx.P, B = this.fx.B, low = this.low;
    const H = g.heroes;
    const playing = g.state === 'playing' || g.state === 'paused' || g.state === 'result';
    // ---- meteor: falling rock + target ring (gameplay state: abilities.meteor.pending) ----
    const met = H && H.abilities.meteor;
    const m = playing && met && met.pending.length ? met.pending[0] : null;
    this.rock.visible = !!m; this.ring.visible = !!m; this.ringIn.visible = !!m;
    if (m) {
      const u = Math.min(1, m.t / m.fall);
      const x = m.x + (1 - u) * 4, y = 0.9 + (1 - u * u) * 18, z = m.z - (1 - u) * 7;
      this.rock.position.set(x, y, z);
      this.rock.rotation.set(m.t * 5, m.t * 3, 0);
      this.rock.scale.setScalar(0.9 + u * 0.4);
      this.ring.position.set(m.x, 0.08, m.z);
      this.ring.scale.setScalar(m.r * (1.15 - 0.15 * u));
      this.ringIn.position.set(m.x, 0.07, m.z);
      this.ringIn.scale.setScalar(m.r * u);
      looks.ringMat.opacity = 0.55 + 0.35 * Math.abs(Math.sin(m.t * 18));
      this.trailAcc += dt * (low ? 40 : 90);
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        const k = P.spawn(PUFF, x + rnd(-0.5, 0.5), y + rnd(0, 0.6), z + rnd(-0.5, 0.5), rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(0.3, 0.5), rnd(0.5, 0.8), rnd(1.2, 1.8), pick(0xffd34d, 0xff7a1f), 1, 0.55, 0, 1, 0, 0x5a2a1c);
        if (k >= 0) P.d.fade[k] = 0.3;
      }
    } else this.trailAcc = 0;

    // ---- Sugar Shield bubble (heroes.invulnT) ----
    const inv = playing && H ? H.invulnT : 0;
    const on = inv > 0;
    this.bubble.visible = on; this.rim.visible = on && !low;
    if (on) {
      this.bubbleT += dt;
      const c = g.squad.center(this.c);
      const pop = Math.min(1, this.bubbleT / 0.25);
      const ease = 1 + 2.70158 * Math.pow(pop - 1, 3) + 1.70158 * Math.pow(pop - 1, 2);
      const r = Math.max(1.8, c.r + 1.1) * Math.max(0.05, ease) * (1 + Math.sin(this.bubbleT * 6) * 0.03);
      const blink = inv < 1.2 ? (Math.sin(this.bubbleT * 28) > 0 ? 1 : 0.35) : 1;
      this.bubble.position.set(c.x, r * 0.45, c.z);
      this.bubble.scale.set(r, r * 0.8, r);
      this.bubble.rotation.y = this.bubbleT * 0.8;
      this.rim.position.copy(this.bubble.position);
      this.rim.scale.copy(this.bubble.scale);
      looks.bubbleMat.opacity = 0.3 * blink;
      looks.rimMat.opacity = 0.45 * blink;
      if (Math.random() < dt * (low ? 4 : 10)) B.sparkle(c.x + rnd(-r, r) * 0.7, rnd(0.5, r), c.z + rnd(-r, r) * 0.6, pick(0xff8ad8, 0x8affc8), 1, 0.4, this.vz, 0.5);
    } else this.bubbleT = 0;

    // ---- Whiteout: snow keeps falling while the freeze window lasts ----
    const st = g.status;
    if (playing && st && st.freezeUntil > g.time && H && H.ability.id === 'whiteout') {
      const L = g.squad.leader;
      this.snowAcc += dt * (low ? 12 : 28);
      while (this.snowAcc >= 1) {
        this.snowAcc -= 1;
        const k = P.spawn(STAR, rnd(-6, 6), rnd(4, 8), L.z - rnd(-2, 30), rnd(-1.5, 1.5), -rnd(2, 3.5), 0, rnd(1.2, 2), rnd(0.12, 0.22), 0.08, 0xffffff, 0.95, 0.3);
        if (k >= 0) P.d.spin[k] = rnd(-3, 3);
      }
    } else this.snowAcc = 0;

    // ---- Rally: sparkles on the raiders that just popped in ----
    if (this.rally.left > 0) {
      this.rally.left -= dt;
      if (this.rally.left <= 0) {
        const ms = g.squad.members, n = Math.min(this.rally.n, ms.length), vz = this.vz;
        for (let i = 0, k = n > 0 ? B.n(Math.min(n, 24)) : 0; i < k; i++) { // (squad may be gone by now)
          const mm = ms[ms.length - 1 - Math.floor(Math.random() * n)];
          P.spawn(STAR, mm.x, 1.0, mm.z, 0, 1.2, vz, 0.5, 0.45, 0.1, pick(0x7fe0ff, 0xffffff), 1, 0.4);
        }
        B.sparkle(g.squad.leader.x, 1, g.squad.leader.z + 1.5, 0x7fe0ff, 8, 2, vz, 1);
      }
    }
  }

  /** Warm-up / tests: the meshes this module may show. */
  warmObjects() { return [this.rock, this.ring, this.bubble, this.rim]; }
}

