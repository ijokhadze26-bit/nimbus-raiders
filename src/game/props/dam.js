// Dam: a water tank behind a little dam wall beside one lane, its chute shut by a red sluice gate. Shoot the
// gate (hp) and a flood pours down that lane toward the squad for ~2 s: small enemies in it are washed off the
// road (at most FLOOD.maxWash per flood), heavy ones (Bulwarks, Hives, elites) are shoved back and battered. The squad is only pushed a little
// toward the middle if it stands in the water. Event { type:'prop', kind:'dam', at, lane:'L'|'R', hp }.
import { buildDam, DAM, waterTexture } from '../../models/props/dam.js';
import { HP_STYLE } from '../../models/props/common.js';
import { drawLabel, labelReady } from '../../models/labels.js';
import { ROAD_HALF, DIVIDER } from '../../config.js';
import { applyDamage } from '../hordeops.js';

// maxWash: most small enemies one flood washes away (a huge late horde is thinned, not erased); the rest in it
// are shoved back like the heavy ones
export const FLOOD = { len: 30, grow: 20, time: 2.0, drain: 26, push: 3.0, back: 9, batter: 0.35, maxWash: 60 };
const SRC = { el: 'neutral', shieldHits: 99, bypassShield: true, cause: 'prop', events: false };
const pool = (sys) => sys.view('damPool', () => ({ free: [] }));

function visual(sys, side, w) {
  const p = pool(sys), key = `${side}`;
  const i = p.free.findIndex((v) => v.key === key);
  const v = i >= 0 ? p.free.splice(i, 1)[0] : Object.assign(buildDam(side, w), { key });
  v.tag.label.key = null; v.tag.hp = -1;
  v.tag.mesh.visible = true; v.gate.visible = true; v.jet.visible = false; v.flood.visible = false; v.crest.visible = false;
  v.gate.position.set(side * (DAM.chuteX + 0.05), DAM.chuteY, 0); v.gate.rotation.set(0, 0, 0);
  sys.game.scene.add(v.group);
  return v;
}

export const dam = {
  kind: 'dam',
  create(sys, ev) {
    const lane = ev.lane === 'R' ? 'R' : 'L', side = lane === 'R' ? 1 : -1;
    const x0 = lane === 'R' ? DIVIDER.width / 2 : -ROAD_HALF, x1 = lane === 'R' ? ROAD_HALF : -DIVIDER.width / 2;
    const vis = visual(sys, side, x1 - x0);
    const z = -ev.at;
    vis.group.position.set(0, 0, z);
    vis.flood.position.x = vis.crest.position.x = (x0 + x1) / 2;
    const hp = ev.hp || 40;
    return { state: 'shut', shoot: true, hp, max: hp, tx: side * 3.4, th: 1.6, z, side, x0, x1, flash: 0, t: 0, front: 0, tail: 0, gx: 0, gy: 0, gvx: 0, gvy: 0, vis };
  },
  trigger(sys, o) {
    o.state = 'flood'; o.t = 0; o.front = 0.5; o.tail = 0; o.washed = 0;
    o.gvx = o.side * -5; o.gvy = 6; // the gate is blown off toward the road
    const B = sys.fxB();
    if (B) { B.impact(o.side * DAM.chuteX, o.z, 0x5fd0ff); B.sparkle(o.side * DAM.chuteX, DAM.chuteY, o.z, 0xbff0ff, sys.low ? 6 : 14, 1.4); }
    sys.sfx('propSplash');
    sys.shake(0.25);
  },
  update(sys, o, dt) {
    o.t += dt;
    if (o.state === 'flood') {
      o.front = Math.min(FLOOD.len, o.front + FLOOD.grow * dt);
      if (o.t > FLOOD.time) o.tail = Math.min(o.front, o.tail + FLOOD.drain * dt);
      if (o.tail >= o.front) o.state = 'done';
      else dam.wash(sys, o, dt);
    }
    if (o.state !== 'shut') { o.gvy -= 22 * dt; o.gx += o.gvx * dt; o.gy += o.gvy * dt; }
    return o.z < sys.game.squad.leader.z + 16 || o.state === 'flood';
  },
  /** The water: sweeps the small enemies in it away, shoves + batters the heavy ones, nudges the squad. */
  wash(sys, o, dt) {
    const zNear = o.z + o.front, zFar = o.z + o.tail, x0 = o.x0, x1 = o.x1;
    const inside = (x, z) => x > x0 && x < x1 && z < zNear && z > zFar - 0.5;
    const h = sys.game.horde;
    let heavy = 0;
    const room = FLOOD.maxWash - o.washed;
    let taken = 0;
    const n = sys.crush((e) => {
      if (!inside(e.x, e.z) || (e.y || 0) > 1.6) return false;
      if (!sys.heavy(e) && taken < room) { taken++; return true; }
      e.z -= FLOOD.back * dt;
      if (!sys.heavy(e)) return false;
      heavy++;
      applyDamage(h, e, e.maxHp * FLOOD.batter * dt, e.maxHp * FLOOD.batter * dt, SRC);
      return false;
    }, 'dam');
    o.washed += n;
    if (n && !sys.low) { const B = sys.fxB(); if (B && Math.random() < 0.5) B.sparkle((x0 + x1) / 2, 0.5, zNear - 0.5, 0xbff0ff, 4, 1.2); } // visual only
    const L = sys.game.squad.leader, hz = sys.game.hazards;
    if (hz && hz.mods && sys.live && inside(L.x, L.z)) hz.mods.pushX += -o.side * FLOOD.push;
    o.heavy = heavy;
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v) return;
    o.flash = Math.max(0, o.flash - dt * 7);
    if (o.state === 'shut') {
      v.gate.material.emissiveIntensity = 0.6 * o.flash;
      v.gate.position.x = o.side * (DAM.chuteX + 0.05) + o.flash * 0.04 * o.side;
      const hp = Math.max(0, Math.ceil(o.hp));
      if (hp !== v.tag.hp && labelReady(v.tag.label)) { v.tag.hp = hp; drawLabel(v.tag.label, String(hp), HP_STYLE); }
      return;
    }
    v.tag.mesh.visible = false;
    v.gate.material.emissiveIntensity = 0;
    v.gate.position.set(o.side * (DAM.chuteX + 0.05) + o.gx, DAM.chuteY + o.gy, 0);
    v.gate.rotation.z += dt * 9 * o.side;
    v.gate.visible = DAM.chuteY + o.gy > -6;
    const on = o.state === 'flood';
    v.jet.visible = on && o.t < FLOOD.time + 0.3;
    v.flood.visible = v.crest.visible = on;
    if (!on) return;
    v.flood.position.z = o.tail;
    v.flood.scale.z = Math.max(0.01, o.front - o.tail);
    v.crest.position.set(v.crest.position.x, 0.05, o.front);
    const s = 0.8 + 0.25 * Math.sin(sys.time * 18);
    v.crest.scale.y = s; v.crest.scale.z = s;
  },
  post(sys) { const t = waterTexture(); t.offset.y = -(sys.time * 3.2) % 1; t.repeat.y = 5; },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    pool(sys).free.push(o.vis);
    o.vis = null;
  },
  warm() { return buildDam(-1, 4.8).group; },
};
