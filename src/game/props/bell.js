// Bell: a big bronze bell on a stone arch across the bridge. Shoot it (hp) and it rings: every enemy on screen
// is stunned for STUN s (frozen in place, no shatter: game.status.freeze) with spinning stars over their heads,
// sound rings and a shake. One ring per bell. Event { type:'prop', kind:'bell', at, hp }.
import * as THREE from 'three';
import { buildBell, buildStars, BELL } from '../../models/props/bell.js';
import { HP_STYLE } from '../../models/props/common.js';
import { drawLabel, labelReady } from '../../models/labels.js';
import { ALIVE } from '../hordeops.js';

export const STUN = 1.5;
const REACH_AHEAD = 85, REACH_BEHIND = 8;   // "on screen": this far ahead of / behind Pip
const STAR_CAP = { high: 240, low: 70 };
const pool = (sys) => sys.view('bellPool', () => ({ free: [] }));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

function stars(sys) {
  return sys.view('bellStars', () => {
    const mesh = buildStars(STAR_CAP.high);
    mesh.visible = false;
    sys.game.scene.add(mesh);
    return mesh;
  });
}

export const bell = {
  kind: 'bell',
  create(sys, ev) {
    const p = pool(sys), key = sys.low ? 'L' : 'H';
    const i = p.free.findIndex((v) => v.key === key);
    const vis = i >= 0 ? p.free.splice(i, 1)[0] : Object.assign(buildBell(sys.low), { key });
    vis.tag.label.key = null; vis.tag.hp = -1; vis.tag.mesh.visible = true;
    for (const r of vis.rings) r.visible = false;
    sys.game.scene.add(vis.group);
    const z = -ev.at;
    vis.group.position.set(0, 0, z);
    const hp = ev.hp || 50;
    return { state: 'idle', shoot: true, hp, max: hp, tx: 0, th: 1.2, z, flash: 0, t: 0, swing: 0, swingV: 0, ph: ev.at * 0.21, stunned: 0, vis };
  },
  trigger(sys, o) {
    o.state = 'rung'; o.t = 0; o.swingV = 3.2;
    const g = sys.game, L = g.squad.leader, list = g.horde.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.state !== ALIVE || e.z < L.z - REACH_AHEAD || e.z > L.z + REACH_BEHIND) continue;
      g.status.freeze(e, STUN, { shatter: false });
      n++;
    }
    o.stunned = n;
    sys.stats.stunned += n;
    sys.stunT = Math.max(sys.stunT, STUN);
    const B = sys.fxB();
    if (B) B.sparkle(0, BELL.pivotY - 1.2, o.z, 0xffe14d, sys.low ? 8 : 20, 2.2, 0, 1.4);
    sys.sfx('propBell');
    sys.shake(0.35);
    g.events.emit('prop:stun', { count: n, duration: STUN });
  },
  update(sys, o, dt) {
    o.t += dt;
    if (o.state === 'idle') o.swing = 0.03 * Math.sin(sys.time * 1.1 + o.ph);
    else { o.swingV += (-o.swing * 14 - o.swingV * 0.9) * dt; o.swing += o.swingV * dt; }
    return o.z < sys.game.squad.leader.z + 16;
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v) return;
    o.flash = Math.max(0, o.flash - dt * 7);
    v.pivot.rotation.x = o.swing;
    if (o.state === 'idle') {
      v.bell.material.emissiveIntensity = 0.5 * o.flash;
      const hp = Math.max(0, Math.ceil(o.hp));
      if (hp !== v.tag.hp && labelReady(v.tag.label)) { v.tag.hp = hp; drawLabel(v.tag.label, String(hp), HP_STYLE); }
      return;
    }
    v.tag.mesh.visible = false;
    v.bell.material.emissiveIntensity = Math.max(0, 0.7 - o.t * 0.6) * (0.6 + 0.4 * Math.sin(o.t * 30));
    for (let i = 0; i < v.rings.length; i++) {
      const f = (o.t - i * 0.22) / 0.8, r = v.rings[i];
      r.visible = f > 0 && f < 1;
      if (!r.visible) continue;
      r.scale.setScalar(1.5 + f * 11);
      r.material.opacity = 0.9 * (1 - f);
    }
  },
  /** Stun stars over every frozen enemy while a bell's stun lasts (one InstancedMesh). */
  post(sys) {
    if (!(sys.stunT > 0) && !sys.views.bellStars) return;
    const mesh = stars(sys);
    if (!(sys.stunT > 0)) { mesh.visible = false; mesh.count = 0; return; }
    const list = sys.game.horde.list, low = sys.low;
    const cap = low ? STAR_CAP.low : STAR_CAP.high, per = low ? 1 : 2;
    const t = sys.time, fade = Math.min(1, sys.stunT / 0.25);
    let n = 0;
    for (let i = 0; i < list.length && n + per <= cap; i++) {
      const e = list[i];
      if (e.state !== ALIVE || !(e.freezeT > 0)) continue;
      const y = 0.95 + e.def.r * 0.9 + (e.y || 0) + (e.elite ? 0.2 : 0);
      for (let k = 0; k < per; k++) {
        const a = t * 6 + e.ph + (k * Math.PI * 2) / per;
        _p.set(e.x + Math.cos(a) * 0.38, y + Math.sin(a * 2) * 0.05, e.z + Math.sin(a) * 0.38);
        _q.setFromEuler(_e.set(-0.5, 0, a * 0.5));
        _s.setScalar(fade);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n++, _m);
      }
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) mesh.instanceMatrix.needsUpdate = true;
  },
  /** A bell stun is a daze, not ice: the frozen tint status.tickHorde gave stunned (no-shatter) enemies is toned down. */
  step(sys) {
    if (!(sys.stunT > 0)) return;
    const list = sys.game.horde.list;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.state === ALIVE && e.freezeT > 0 && !e.shatter) e.ice = 0.12; }
  },
  resetAll(sys) { const m = sys.views.bellStars; if (m) { m.visible = false; m.count = 0; } },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    pool(sys).free.push(o.vis);
    o.vis = null;
  },
  warm() { return [buildBell(true).group, buildStars(4)]; },
};
