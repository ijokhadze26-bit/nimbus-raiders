// Rival ghosts: every rival squad of an online match as see-through Raiders on MY road (SPEC4 §5.4, map-bots §2).
// - ONE InstancedMesh for all rivals (the ~110-triangle low Raider, its own tiny shader: a flat seat colour with a
//   brighter rim, no lights, no shadow, no depth write). Hidden when there is nothing to draw, so a single-player
//   frame never pays for it.
// - Each rival has a Track (track.js): its samples are played back a little late and smoothly, never jumping.
// - Same road for everyone, so a rival simply stands at its own distance: z = -(its distance). A rival far ahead is
//   pinned at the edge of the view and faded; a rival behind fades out (the bar at the top shows it); a ghost that
//   overlaps my own squad goes fainter so my Raiders stay readable.
// - A bigger rival squad draws more Raiders (about 2.6 x sqrt(count), capped) spread over the squad's real footprint
//   in its real formation.
// - High adds the extras: a little bob, the rim light and the rival's name floating over its leader. Low draws the
//   same mesh without them (flat tint, fewer Raiders, no name).
import * as THREE from 'three';
import { FORMATION, MEMBER_CLAMP } from '../../config.js';
import { buildRaiderLowGeometry } from '../../models/raider.js';
import { createLabel, drawLabel } from '../../models/labels.js';
import { SLOT_X, SLOT_Z } from '../../game/squad.js';
import { FORM_DEF, FORMATIONS } from '../../game/formation.js';
import { markInstances } from '../../core/pool.js';
import { Track } from './track.js';
import { VS, SLOT_COLORS } from './vsdata.js';

const MAX_PEERS = 3;
const C = FORMATION.spacing * 0.525; // phyllotaxis scale (squad.js / formation.js)
const MAX_HALF_W = MEMBER_CLAMP - 0.3;
const FALL_TIME = 0.7;

const VERT = `
attribute vec4 aTint;
varying vec4 vTint; varying float vRim; varying float vY;
void main() {
  vTint = aTint;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  vY = position.y;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float uRim;
varying vec4 vTint; varying float vRim; varying float vY;
void main() {
  float rim = mix(1.0, 0.72 + 0.9 * vRim * vRim, uRim);
  vec3 c = vTint.rgb * (0.8 + 0.35 * clamp(vY, 0.0, 1.0)) + vec3(0.16) * vRim * vRim * uRim;
  gl_FragColor = vec4(c, min(1.0, vTint.a * rim));
  #include <colorspace_fragment>
}`;

export class Ghost {
  constructor(game) {
    this.game = game;
    this.peers = [];   // { slot, name, color, track, alive, fallT, tag, shown, rel, pinned }
    this.time = 0;
    const cap = MAX_PEERS * VS.ghost.perHigh;
    const geo = buildRaiderLowGeometry();
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTint', this.tint);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uRim: { value: 1 } }, transparent: true, depthWrite: false });
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, this.mat, cap));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    mesh.count = 0; mesh.visible = false;
    game.scene.add(mesh);
    this.tags = []; // name sprites (High only), built on first use
  }

  /** Compiles the ghost shader now (the menu), not on the first frame a rival shows up. */
  warm() {
    const m = this.mesh, was = m.count;
    m.count = 1;
    try { this.game.engine.precompile(m); } catch { /* compiled on first use instead */ }
    m.count = was; m.visible = was > 0;
  }

  /** Match start: one ghost per rival. peers = link.peers ([{ slot, name, ... }]). */
  begin(peers) {
    this.clear();
    for (const p of (peers || []).slice(0, MAX_PEERS)) {
      this.peers.push({ slot: p.slot, name: String(p.name || 'Rival'), color: new THREE.Color(SLOT_COLORS[p.slot % SLOT_COLORS.length]), track: new Track(), alive: true, fallT: 0, tag: null, shown: 0, rel: 0, pinned: 0 });
    }
  }

  clear() {
    for (const p of this.peers) if (p.tag) p.tag.visible = false;
    this.peers.length = 0;
    this.mesh.count = 0; this.mesh.visible = false;
  }

  peer(slot) { for (const p of this.peers) if (p.slot === slot) return p; return null; }

  /** A rival's newest bundle (link 'state'). */
  feed(slot, s, clock) { const p = this.peer(slot); if (p && p.alive) p.track.feed(s, clock); }

  /** A rival fell: its ghost pops away. */
  fall(slot) { const p = this.peer(slot); if (p && p.alive) { p.alive = false; p.fallT = FALL_TIME; } }

  /** Where a rival's ghost is drawn (HUD arrows / tests): { shown 0..1, rel metres ahead (+) or behind (-), pinned -1|0|1 }. */
  info(slot) { const p = this.peer(slot); return p ? { shown: p.shown, rel: p.rel, pinned: p.pinned, drawn: p.drawn | 0 } : null; }

  tagFor(p, i) {
    let t = this.tags[i];
    if (!t) {
      const label = createLabel(256, 64);
      const mat = new THREE.SpriteMaterial({ map: label.texture, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
      t = this.tags[i] = new THREE.Sprite(mat);
      t.label = label; t.scale.set(3.4, 0.85, 1); t.renderOrder = 6; t.visible = false;
      this.game.scene.add(t);
    }
    drawLabel(t.label, p.name.toUpperCase().slice(0, 12), { fill: '#' + p.color.getHexString(THREE.SRGBColorSpace), stroke: '#10224d', size: 40, strokeWidth: 9, shadow: false });
    return t;
  }

  /**
   * Once per rendered frame (Versus.pump): plays every track to `clock` and writes the instances.
   * dt = real frame seconds (animation only).
   */
  sync(dt, clock) {
    const g = this.game, G = VS.ghost, mesh = this.mesh;
    if (!this.peers.length) { if (mesh.visible) { mesh.count = 0; mesh.visible = false; } return; }
    const low = g.engine.quality === 'low';
    const per = low ? G.perLow : G.perHigh;
    this.time += dt;
    this.mat.uniforms.uRim.value = low ? 0 : 1;
    const run = g.run, L = g.squad.leader, myDist = -L.z;
    const arena = !!run && run.phase === 'boss';
    const arr = mesh.instanceMatrix.array, tint = this.tint.array;
    let n = 0;
    for (let pi = 0; pi < this.peers.length; pi++) {
      const p = this.peers[pi];
      let fall = 1;
      if (!p.alive) { p.fallT = Math.max(0, p.fallT - dt); fall = p.fallT / FALL_TIME; }
      const o = fall > 0 ? p.track.play(p.alive ? clock : p.track.lastClock ?? clock) : null;
      let a = 0;
      if (o && o.ok && o.n >= 0.5) {
        const rel = o.dist - myDist;
        let rc = rel, far = 1;
        p.pinned = 0;
        if (rel > G.ahead) { rc = G.ahead; p.pinned = 1; far = Math.max(G.farAlpha, 1 - (rel - G.ahead) / G.farFade * (1 - G.farAlpha)); }
        // overlap with my own squad (same stretch of road AND same lane): the ghost goes fainter there
        const over = (1 - smooth(G.near[0], G.near[1], Math.abs(rel))) * (1 - smooth(G.side[0], G.side[1], Math.abs(o.x - L.x)));
        const near = 1 - (1 - (low ? G.nearAlphaLow : G.nearAlpha)) * over;
        const back = rel < 0 ? Math.max(0, 1 + rel / G.behind) : 1;
        if (rel <= -G.behind) p.pinned = -1;
        const boss = arena && Math.abs(rel) > 3 ? 0 : 1; // my arena: only a rival fighting the same boss is shown
        a = G.alpha * o.alpha * far * near * back * boss * fall;
        p.rel = rel;
        if (a > 0.02) {
          const count = Math.round(o.n), nr = Math.min(count, FORMATION.maxRendered);
          const m = Math.max(1, Math.min(per, count, Math.round(G.perSqrt * Math.sqrt(count))));
          const F = FORM_DEF[FORMATIONS[o.form]] || FORM_DEF.line;
          const R = C * Math.sqrt(nr + 0.5);
          let sx = F.sx, sz = F.sz;
          if (sx * R > MAX_HALF_W && sx > 0.86) { const nx = Math.max(0.86, MAX_HALF_W / R); sz *= sx / nx; sx = nx; }
          const off = FORMATION.leaderGap + sz * R * 0.85;
          // a big squad would scatter its few ghosts over the whole road: the group stays together (spreadMax) and
          // its Raiders grow a little instead, so it still reads as ONE bigger squad
          const wide = m > 1 ? Math.sqrt((nr + 0.5) / (m - 0.5)) : 1;
          const spread = Math.min(G.spreadMax, wide);
          const gx = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, o.x)), gz = -(myDist + rc);
          const sc = G.scale * (0.55 + 0.45 * fall) * (p.pinned > 0 ? 0.85 : 1) * (1 + G.grow * Math.min(1, (wide - 1) / 3));
          const r = p.color.r, gr = p.color.g, b = p.color.b;
          for (let i = 0; i < m; i++) {
            let x = gx, z = gz, s = sc * 1.12;
            if (i > 0) {
              const dx = SLOT_X[i - 1] * sx * spread;
              x = Math.max(-MEMBER_CLAMP, Math.min(MEMBER_CLAMP, gx + dx));
              z = gz + off + SLOT_Z[i - 1] * sz * spread + F.k * Math.abs(dx);
              s = sc;
            }
            const y = G.lift + (low ? 0 : Math.abs(Math.sin(this.time * 11 + i * 1.7 + pi)) * 0.09) + (1 - fall) * 0.9;
            const k = (n + i) * 16;
            arr[k] = s; arr[k + 1] = 0; arr[k + 2] = 0; arr[k + 3] = 0;
            arr[k + 4] = 0; arr[k + 5] = s; arr[k + 6] = 0; arr[k + 7] = 0;
            arr[k + 8] = 0; arr[k + 9] = 0; arr[k + 10] = s; arr[k + 11] = 0;
            arr[k + 12] = x; arr[k + 13] = y; arr[k + 14] = z; arr[k + 15] = 1;
            const t = (n + i) * 4;
            tint[t] = r; tint[t + 1] = gr; tint[t + 2] = b; tint[t + 3] = a;
          }
          n += m;
          p.drawn = m;
          if (!low && G.tag) {
            const tag = p.tag || (p.tag = this.tagFor(p, pi));
            tag.position.set(gx, 2.35 + (1 - fall) * 0.9, gz);
            tag.material.opacity = Math.min(1, a * 2.2) * (1 - over); // no name inside my own squad
            tag.visible = true;
          } else if (p.tag) p.tag.visible = false;
        }
      }
      p.shown = a > 0.02 ? a / G.alpha : 0;
      if (!p.shown) { p.drawn = 0; if (p.tag) p.tag.visible = false; }
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) { markInstances(mesh.instanceMatrix, n); markInstances(this.tint, n); }
  }
}

function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
