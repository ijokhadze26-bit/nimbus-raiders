// Boulder: a big rock resting in one lane. When the squad runs into it from behind it rolls ahead down the lane
// (faster than the run) and crushes every enemy in its path; each heavy one (Bulwark, Hive, elite) costs it
// momentum. After ROLL.travel u, or when it slows down, it veers off the road edge and falls into the sea (a
// gap swallows it too). Harmless to the squad. Event { type:'prop', kind:'boulder', at, lane:'L'|'R' }.
import { buildBoulder, BOULDER_R, rockColor } from '../../models/props/boulder.js';
import { ROAD_HALF } from '../../config.js';

export const ROLL = { boost: 8, travel: 68, minV: 7, heavyLoss: 0.8, loss: 0.994, offV: 7, touch: 0.45 };
const R = BOULDER_R;
const pool = (sys) => sys.view('boulderPool', () => ({ free: [] }));

export const boulder = {
  kind: 'boulder',
  create(sys, ev) {
    const world = (sys.game.run && sys.game.run.world) || 'sky';
    const p = pool(sys), key = world + (sys.low ? 'L' : 'H');
    const i = p.free.findIndex((v) => v.key === key);
    const vis = i >= 0 ? p.free.splice(i, 1)[0] : Object.assign(buildBoulder(world, sys.low), { key });
    vis.arrow.visible = true; vis.shadow.visible = true; vis.rock.rotation.set(0, ev.at * 0.7, 0);
    sys.game.scene.add(vis.group);
    const lane = ev.lane === 'R' ? 'R' : 'L';
    const o = { state: 'rest', x: sys.laneX(lane), z: -ev.at, y: 0, v: 0, vx: 0, vy: 0, travel: 0, rot: 0, kills: 0, heavy: 0, dust: 0, vis };
    o.test = (e) => {
      if ((e.y || 0) > 1.8) return false;
      const dx = e.x - o.x, dz = e.z - o.z, r = R + e.def.r;
      if (dx * dx + dz * dz >= r * r) return false;
      if (sys.heavy(e)) { o.heavy++; o.v *= ROLL.heavyLoss; } else o.v *= ROLL.loss; // a thick horde slows it too
      return true;
    };
    return o;
  },
  /** Pip or any of the squad touching it from behind starts the roll. */
  touched(sys, o) {
    const sq = sys.game.squad, L = sq.leader, ms = sq.members, r2 = (R + ROLL.touch) * (R + ROLL.touch);
    const near = (m) => { const dx = m.x - o.x, dz = m.z - o.z; return dz > -0.3 && dx * dx + dz * dz < r2; };
    if (!sq.pipGone && near(L)) return true;
    const stride = Math.max(1, Math.floor(ms.length / 80));
    for (let i = 0; i < ms.length; i += stride) if (near(ms[i])) return true;
    return false;
  },
  update(sys, o, dt) {
    const g = sys.game, L = g.squad.leader;
    if (o.state === 'rest') {
      if (sys.live && o.z > L.z - 4 && boulder.touched(sys, o)) {
        o.state = 'roll';
        o.v = (g.run ? g.run.speed : 9) + ROLL.boost;
        sys.stats.triggered.boulder = (sys.stats.triggered.boulder || 0) + 1;
        g.events.emit('prop:trigger', { kind: 'boulder', x: o.x, z: o.z });
        sys.sfx('propRoll');
        sys.shake(0.15);
      }
      return o.z < L.z + 16;
    }
    if (o.state === 'fall') {
      o.vy -= 30 * dt; o.y += o.vy * dt;
      o.z -= o.v * 0.6 * dt; o.x += o.vx * dt; o.rot += (o.v * dt) / R;
      return o.y > -16;
    }
    // rolling (on the lane, or veering off the edge)
    o.z -= o.v * dt;
    o.x += o.vx * dt;
    o.travel += o.v * dt;
    o.rot += (o.v * dt) / R;
    const n = sys.crush(o.test, 'boulder');
    if (n) { o.kills += n; sys.shake(Math.min(0.25, 0.04 * n)); }
    if (o.state === 'roll' && (o.travel > ROLL.travel || o.v < ROLL.minV)) {
      o.state = 'off'; o.vx = (o.x < 0 ? -1 : 1) * ROLL.offV; o.v = Math.max(o.v * 0.8, ROLL.minV * 0.8);
    }
    if (Math.abs(o.x) > ROAD_HALF + 0.4 || g.obstacles.overGap(o.x, o.z)) { o.state = 'fall'; o.vy = 0; sys.sfx('rumble'); }
    o.dust -= dt;
    if (o.dust <= 0) {
      o.dust = sys.low ? 0.12 : 0.05;
      const B = sys.fxB();
      if (B) { B.dust(o.x + (Math.random() - 0.5) * R, o.z + R * 0.6, 0); if (B.D && !sys.low && Math.random() < 0.3) B.D.spawn(o.x, 0.3, o.z + R, (Math.random() - 0.5) * 3, 3, 2, 0.6, 0.12, rockColor(g.run ? g.run.world : 'sky')); } // visual only
    }
    return o.z > L.z - 140;
  },
  sync(sys, o) {
    const v = o.vis;
    if (!v) return;
    v.group.position.set(o.x, o.y, o.z);
    v.rock.rotation.x = -o.rot;
    v.arrow.visible = o.state === 'rest';
    if (v.arrow.visible) v.arrow.material.opacity = 0.55 + 0.35 * Math.sin(sys.time * 6);
    v.shadow.visible = o.state !== 'fall';
  },
  release(sys, o) {
    if (!o.vis) return;
    sys.game.scene.remove(o.vis.group);
    pool(sys).free.push(o.vis);
    o.vis = null;
  },
  warm() { return buildBoulder('sky', true).group; },
};
