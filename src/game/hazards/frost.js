// Frozen Peaks hazards (update 3):
//   ice       { at, length, lane:'L'|'R'|'both', slide? }  slippery sheet: while Pip is on it steering slides
//             (mods.slide: the leader keeps its sideways momentum and only slowly takes the new line).
//   snow      { at, length, fog?, wind? }  snowstorm zone: fog pulls in (mods.fogMul ~0.35) + heavy wind-blown flakes.
//   icicle    { at, length, every, r, warn }  falling icicles: a blue shadow telegraph grows, the spike drops and shatters.
//   avalanche { at, from:'L'|'R', push?, dur?, warn? }  a snow wave from one side (telegraphed): for ~1.5 s it pushes
//             the squad sideways (mods.pushX, weaker steering); members shoved past the road edge fall off.
import * as THREE from 'three';
import { FALLER, TMP } from './common.js';
import { InstPool } from '../../models/hazards/common.js';
import {
  iceMaterial, sheenMaterial, rimMaterial, icePlaneGeometry, iceRimGeometry, buildSnowstorm, icicleGeometry,
  icicleMaterial, shadowGeometry, shadowMaterial, avalancheGeometry, avalancheMaterial,
} from '../../models/hazards/frost.js';

const { m: _m, q: _q, p: _p, s: _s } = TMP;
const _e = new THREE.Euler();
const EDGE = 4.4;            // members beyond this |x| on the pushed side are swept off the road

// ---------------- ice ----------------
export const ice = {
  kind: 'ice',
  create(sys, ev) {
    const r = sys.laneRange(ev.lane || 'both', {});
    const len = ev.length || 24;
    const o = { x0: r.x0, x1: r.x1, from: ev.at, to: ev.at + len, slide: ev.slide ?? 0.85, on: false, dust: 0 };
    const w = r.x1 - r.x0;
    const group = new THREE.Group();
    const geo = icePlaneGeometry(w, len);
    const sheet = new THREE.Mesh(geo, iceMaterial());
    const sheen = new THREE.Mesh(geo, sheenMaterial());
    sheet.position.set((r.x0 + r.x1) / 2, 0.03, -len / 2);
    sheen.position.set(sheet.position.x, 0.035, sheet.position.z);
    sheet.renderOrder = 1; sheen.renderOrder = 1;
    const rim = new THREE.Mesh(iceRimGeometry(r.x0, r.x1, len, sys.low), rimMaterial());
    group.add(sheet, sheen, rim);
    group.position.z = -o.from;
    sys.game.scene.add(group);
    o.vis = { group, geo, rim };
    return o;
  },
  update(sys, o) {
    const dist = sys.dist, L = sys.game.squad.leader;
    if (dist > o.to + 25) return false;
    o.on = dist >= o.from && dist <= o.to && L.x >= o.x0 - 0.2 && L.x <= o.x1 + 0.2;
    if (o.on) sys.mods.slide = Math.max(sys.mods.slide, o.slide);
    return true;
  },
  sync(sys, o, dt) {
    if (!o.on || sys.low) return;
    o.dust -= dt;
    const B = sys.fxB(), L = sys.game.squad.leader;
    if (B && o.dust <= 0 && Math.abs(L.vx) > 1.5) { o.dust = 0.08; B.sparkle(L.x, 0.15, L.z + 0.6, 0xdff6ff, 2, 0.6, 0, 0.4); }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    o.vis.geo.dispose(); o.vis.rim.geometry.dispose();
    o.vis = null;
  },
  pre(sys) { sheenMaterial().map.offset.x = (sys.time * 0.12) % 1; },
  warm() { const g = icePlaneGeometry(1, 1); return [new THREE.Mesh(g, iceMaterial()), new THREE.Mesh(g, sheenMaterial()), new THREE.Mesh(iceRimGeometry(0, 1, 1, true), rimMaterial())]; },
};

// ---------------- snow (snowstorm) ----------------
const RAMP = 14;
function storm(sys) {
  return sys.view('snow', () => { const v = buildSnowstorm(); sys.game.scene.add(v.points); v.k = 0; v.shown = 0; return v; });
}
export const snow = {
  kind: 'snow',
  create(sys, ev) { storm(sys); return { from: ev.at, to: ev.at + (ev.length || 70), fog: ev.fog ?? 0.35, wind: ev.wind ?? -3.5, k: 0 }; },
  update(sys, o) {
    const dist = sys.dist;
    if (dist > o.to + RAMP + 5) { o.k = 0; return false; }
    const kin = (dist - (o.from - RAMP)) / RAMP, kout = (o.to + RAMP - dist) / RAMP;
    o.k = Math.max(0, Math.min(1, kin, kout));
    if (o.k > 0) sys.mods.fogMul = Math.min(sys.mods.fogMul, 1 - (1 - o.fog) * o.k);
    return true;
  },
  sync(sys, o) { const v = storm(sys); if (o.k > v.k) { v.k = o.k; v.wind = o.wind; } },
  release(sys, o) { o.k = 0; },
  pre(sys) { storm(sys).k = 0; },
  post(sys, dt) {
    const v = storm(sys), g = sys.game;
    v.shown += (v.k - v.shown) * Math.min(1, dt * 3);
    if (!g.run) v.shown = 0;
    const on = v.shown > 0.01;
    v.points.visible = on;
    if (!on) return;
    const u = v.uniforms, cam = g.camera.position;
    u.uTime.value = sys.time; u.uCamZ.value = cam.z; u.uCamX.value = cam.x;
    u.uScale.value = (g.engine.renderer.domElement.height || 800) * 0.9;
    u.uWind.value = v.wind || -3.5;
    u.uOpacity.value = Math.min(1, v.shown * 1.1);
    v.points.geometry.setDrawRange(0, Math.round(v.max * (sys.low ? 0.35 : 1)));
  },
  warm(sys) { const v = buildSnowstorm(); v.points.visible = true; return v.points; },
};

// ---------------- icicle (falling icicles) ----------------
const ICICLE = {
  reason: 'icicle', color: '#3fa9ff', fallT: 0.42, height: 13, killRate: 45,
  land(sys, d) {
    const B = sys.fxB();
    if (B) B.impact(d.x, d.z, 0xbfeaff);
    sys.game.gates.burst(d.x, 0.4, d.z, 1.2, 0.8, '#d8f4ff', sys.low ? 5 : 12);
    sys.sfx('shieldBreak');
  },
};
function iciclePools(sys) {
  return sys.view('icicle', () => ({
    spikes: new InstPool(sys.game.scene, icicleGeometry(), icicleMaterial(), 16),
    shadows: new InstPool(sys.game.scene, shadowGeometry(), shadowMaterial(), 16),
  }));
}
export const icicle = {
  kind: 'icicle',
  create(sys, ev) { iciclePools(sys); return FALLER.create(sys, ev, ICICLE); },
  update: FALLER.update,
  sync(sys, o) {
    const v = iciclePools(sys), H = o.cfg.height;
    _e.set(0, 0, 0); _q.setFromEuler(_e);
    for (const d of o.drops) {
      const k = Math.min(1, d.t / d.warn);
      if (!d.landed) {
        const sr = d.r * (0.35 + 0.65 * k);
        _m.compose(_p.set(d.x, 0.05, d.z), _q, _s.set(sr, 1, sr));
        v.shadows.put(_m);
      }
      if (d.u <= 0) continue;
      const y = d.landed ? Math.max(-1.2, -(d.t - d.warn) * 4) : H * (1 - d.u * d.u);
      _m.compose(_p.set(d.x, y, d.z), _q, _s.set(1, 1, 1));
      v.spikes.put(_m);
    }
  },
  release: FALLER.release,
  pre(sys) { const v = iciclePools(sys); v.spikes.begin(); v.shadows.begin(); },
  post(sys) { const v = iciclePools(sys); v.spikes.end(); v.shadows.end(); },
  warm() { return [new THREE.InstancedMesh(icicleGeometry(), icicleMaterial(), 1), new THREE.InstancedMesh(shadowGeometry(), shadowMaterial(), 1)]; },
};

// ---------------- avalanche ----------------
export const avalanche = {
  kind: 'avalanche',
  create(sys, ev) {
    const dir = ev.from === 'R' ? -1 : 1;    // pushes away from the side it comes from
    const o = { at: ev.at, dir, push: ev.push || 8, dur: ev.dur || 1.5, warn: ev.warn || 1.3, rate: ev.rate || 24, state: 'idle', t: 0, wx: -dir * 14, h: null };
    o.zone = { kind: 'lane', x0: dir > 0 ? 4.0 : -7, x1: dir > 0 ? 7 : -4.0, zNear: 0, zFar: 0, pad: 0.3, shift: dir * 2.0 };
    o.test = (x) => x * dir > EDGE;
    const wave = new THREE.Mesh(avalancheGeometry(16, sys.low), avalancheMaterial());
    wave.visible = false;
    sys.game.scene.add(wave);
    o.vis = { wave, spray: 0 };
    return o;
  },
  update(sys, o, dt) {
    const dist = sys.dist, L = sys.game.squad.leader, run = sys.game.run;
    const speed = Math.max(1, sys.speed);
    if (o.state === 'idle') {
      if (dist > o.at + 40) return false;
      if (run && run.phase === 'run' && dist >= o.at - speed * o.warn - 2) {
        o.state = 'warn'; o.t = 0;
        const zArrive = L.z - speed * o.warn;
        o.h = sys.tele('lane', -5, 5, zArrive + 6, zArrive - speed * o.dur * 0.7, o.warn, '#bfe6ff');
        sys.sfx('rumble');
      }
      return true;
    }
    o.t += dt;
    if (o.state === 'warn' && o.t >= o.warn) { o.state = 'push'; o.t = 0; sys.shake(0.35); sys.sfx('slam'); }
    if (o.state === 'push') {
      sys.mods.pushX += o.dir * o.push;
      sys.mods.easeMul *= 0.3;
      sys.killIn(o.test, o.rate, 'avalanche', o);
      if (o.t >= o.dur) { o.state = 'done'; o.t = 0; }
    }
    if (o.state === 'warn' || o.state === 'push') {
      o.zone.zNear = L.z + 14; o.zone.zFar = L.z - 8;
      sys.danger.push(o.zone);
    }
    return o.state !== 'done' || o.t < 1.2;
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v) return;
    const L = sys.game.squad.leader;
    if (o.state === 'idle') { v.wave.visible = false; return; }
    let x;
    if (o.state === 'warn') x = -o.dir * (13 - 5 * Math.min(1, o.t / o.warn));
    else if (o.state === 'push') x = -o.dir * 8 + o.dir * 17 * Math.min(1, o.t / o.dur);
    else x = o.dir * (9 + o.t * 8);
    v.wave.visible = true;
    v.wave.position.set(x, -0.2 + 0.15 * Math.sin(sys.time * 9), L.z + 2);
    v.wave.rotation.set(0, 0, -o.dir * sys.time * 2.5 * 0.2);
    v.spray -= dt;
    const B = sys.fxB();
    if (B && !sys.low && v.spray <= 0 && o.state !== 'done') {
      v.spray = 0.05;
      B.sparkle(x + o.dir * 1.2, 1.2, L.z + 2 + (Math.random() - 0.5) * 12, 0xffffff, 3, 1.4, 0, 0.8);
    }
  },
  release(sys, o) {
    if (o.h && !o.h.done && o.state === 'warn') sys.game.telegraph.cancel(o.h);
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.wave);
    o.vis = null;
  },
  warm() { return [new THREE.Mesh(avalancheGeometry(16, false), avalancheMaterial())]; },
};

export const FROST_KINDS = [ice, snow, icicle, avalanche];
