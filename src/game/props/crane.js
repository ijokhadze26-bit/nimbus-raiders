// Crane: a road-side crane holds a heavy crate over one lane above a dashed ring. Shoot the hook (hp) and
// the crate drops on the ring: every enemy under it is crushed (big thud, dust, wood chips). Harmless to the
// squad (the wreck flattens and sinks away). Event { type:'prop', kind:'crane', at, lane:'L'|'R', hp }.
import { buildCrane, CRANE } from '../../models/props/crane.js';
import { HP_STYLE } from '../../models/props/common.js';
import { drawLabel, labelReady } from '../../models/labels.js';

const GRAV = 34;
const BOTTOM = CRANE.crate / 2;
const pool = (sys) => sys.view('cranePool', () => ({ free: [] }));

function visual(sys, side, hookX) {
  const p = pool(sys), key = `${side}:${hookX}:${sys.low ? 1 : 0}`;
  const i = p.free.findIndex((v) => v.key === key);
  const v = i >= 0 ? p.free.splice(i, 1)[0] : Object.assign(buildCrane(side, hookX, sys.low), { key });
  v.tag.label.key = null; v.tag.hp = -1;
  v.tag.mesh.visible = true; v.ring.visible = true; v.crate.visible = true;
  v.crate.scale.set(1, 1, 1); v.crate.rotation.set(0, 0, 0);
  v.swing.rotation.set(0, 0, 0);
  sys.game.scene.add(v.group);
  return v;
}

export const crane = {
  kind: 'crane',
  create(sys, ev) {
    const lane = ev.lane === 'R' ? 'R' : 'L', side = lane === 'R' ? 1 : -1;
    const hookX = sys.laneX(lane), z = -ev.at;
    const vis = visual(sys, side, hookX);
    vis.group.position.set(0, 0, z);
    const hp = ev.hp || 40;
    return { state: 'hang', shoot: true, hp, max: hp, tx: hookX, th: 1.1, z, side, flash: 0, t: 0, y: CRANE.hangY, vy: 0, swing: 0, swingV: 0, ph: ev.at * 0.37, vis };
  },
  trigger(sys, o) {
    o.state = 'drop'; o.t = 0; o.vy = 0; o.swingV = 1.6 * o.side;
    sys.sfx('propCreak');
  },
  land(sys, o) {
    o.state = 'landed'; o.t = 0; o.y = BOTTOM;
    const R = CRANE.ringR, x = o.tx, z = o.z;
    const n = sys.crush((e) => { const dx = e.x - x, dz = e.z - z, r = R + e.def.r * 0.5; return dx * dx + dz * dz < r * r && (e.y || 0) < 2.6; }, 'crane');
    o.kills = n;
    const B = sys.fxB();
    if (B) {
      B.slam(x, z, R);
      if (B.D) {
        const k = sys.low ? 6 : 14;
        for (let i = 0; i < k; i++) { // wood chips + iron bits (visual only)
          const a = (i / k) * Math.PI * 2, sp = 3 + Math.random() * 4;
          B.D.spawn(x + Math.cos(a) * 0.6, 0.6, z + Math.sin(a) * 0.6, Math.cos(a) * sp, 4 + Math.random() * 5, Math.sin(a) * sp, 1.1, 0.2 + Math.random() * 0.18, i % 3 ? 0xb67a3c : 0x3d3f4a, 0.8);
        }
      }
    }
    sys.sfx('propThud');
    sys.shake(0.5);
  },
  update(sys, o, dt) {
    o.t += dt;
    if (o.state === 'drop') {
      o.vy -= GRAV * dt;
      o.y += o.vy * dt;
      if (o.y <= BOTTOM) crane.land(sys, o);
    }
    if (o.state === 'hang') o.swing = 0.035 * Math.sin(sys.time * 1.3 + o.ph);
    else { o.swingV += (-o.swing * 26 - o.swingV * 1.4) * dt; o.swing += o.swingV * dt; }
    return o.z < sys.game.squad.leader.z + 16;
  },
  sync(sys, o, dt) {
    const v = o.vis;
    if (!v) return;
    o.flash = Math.max(0, o.flash - dt * 7);
    v.swing.rotation.z = o.swing;
    v.hook.material.emissiveIntensity = 0.6 * o.flash;
    if (o.state === 'hang') {
      // the crate hangs from the swinging hook
      const arm = CRANE.jibY - o.y;
      v.crate.position.set(o.tx + Math.sin(o.swing) * arm, CRANE.jibY - Math.cos(o.swing) * arm, 0);
      v.crate.rotation.z = o.swing;
      v.crate.material.emissiveIntensity = 0.25 * o.flash;
      v.ring.material.opacity = 0.75 + 0.25 * Math.sin(sys.time * 5 + o.ph);
      const hp = Math.max(0, Math.ceil(o.hp));
      if (hp !== v.tag.hp && labelReady(v.tag.label)) { v.tag.hp = hp; drawLabel(v.tag.label, String(hp), HP_STYLE); }
    } else {
      v.tag.mesh.visible = false;
      v.crate.material.emissiveIntensity = 0;
      if (o.state === 'drop') { v.crate.position.set(o.tx, o.y, 0); v.crate.rotation.z *= 0.9; v.ring.material.opacity = 1; }
      else {
        // smashed: flattens on impact, then sinks into a pile of planks and goes
        v.ring.visible = false;
        const k = Math.min(1, o.t / 0.12), sink = Math.max(0, (o.t - 1.4) / 1.2);
        const sy = 1 - 0.62 * k - 0.3 * Math.min(1, sink);
        v.crate.scale.set(1 + 0.22 * k, Math.max(0.05, sy), 1 + 0.22 * k);
        v.crate.position.set(o.tx, (CRANE.crate * v.crate.scale.y) / 2, 0);
        v.crate.rotation.z = 0.08 * o.side;
        v.crate.visible = sink < 1;
      }
    }
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    pool(sys).free.push(o.vis);
    o.vis = null;
  },
  warm() { return buildCrane(-1, -2.5, true).group; },
};
