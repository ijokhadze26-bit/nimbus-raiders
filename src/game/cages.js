// Rescue cages (stage 4): events { type:'cage', at, lane:'L'|'R', count, hp } (data/roadplan.js). A cage stands in
// one lane with a padlock (hp): bullets chip it like a barrel (tracers carry the barrel damage, b.bdmg; main
// projectiles are absorbed). At 0 the lock pops, the door swings open and the trapped Raiders step out and cheer;
// when Pip reaches the cage they join the squad from the cage spot (squad.add 'cage', run.stats.rescued). A cage
// the squad passes still locked stays shut (nothing lost). Never collides with the squad. Deterministic: no
// randomness in the simulation; visual jitter uses a hash.
import { HIT, LANES } from '../config.js';
import { hasHit } from './bullets.js';
import { buildCageVisual, CAGE } from '../models/cage.js';
import { drawLabel, labelReady } from '../models/labels.js';

const SPAWN_AHEAD = 110, LOCK_HALF = 0.75, JOIN_DZ = 1.5;
const hash = (i) => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };

export class Cages {
  init(game) {
    this.game = game;
    this.kind = 'cage';
    this.bit = HIT.BARREL;
    this.priority = 7;
    this.live = [];
    this.pool = { high: [], low: [] };
    this.events = [];
    this.cursor = 0;
    this.hitPos = { x: 0, y: 0, z: 0 };
    game.bullets.addTargetSystem(this);
  }

  reset(run) {
    for (const c of this.live) this.release(c);
    this.live.length = 0;
    this.events = run ? run.eventsOf('cage') : [];
    this.cursor = 0;
  }

  get low() { return this.game.engine && this.game.engine.quality === 'low'; }

  acquire() {
    const key = this.low ? 'low' : 'high';
    const v = this.pool[key].pop() || buildCageVisual(key === 'low');
    v.key = key;
    v.group.visible = true;
    v.label.key = null;
    v.hinge.rotation.y = 0;
    v.lock.visible = true; v.lock.position.set(0, CAGE.lockY, CAGE.lockZ); v.lock.rotation.set(0, 0, 0); v.lock.scale.setScalar(1);
    v.prisoners.visible = true; v.prisoners.position.set(0, 0, 0);
    v.ring.visible = true; v.labelMesh.visible = true;
    this.game.scene.add(v.group);
    return v;
  }

  release(c) {
    if (!c.visual) return;
    this.game.scene.remove(c.visual.group);
    this.pool[c.visual.key].push(c.visual);
    c.visual = null;
  }

  spawn(dist) {
    const ev = this.events;
    while (this.cursor < ev.length && ev[this.cursor].at - dist < SPAWN_AHEAD) {
      const e = ev[this.cursor++];
      const hp = Math.max(1, e.hp || 20);
      const c = { id: e.at, x: LANES[e.lane] ?? 0, z: -e.at, hp, maxHp: hp, count: e.count | 0 || 3, state: 'locked', t: 0, punch: 0, flash: 0, dirty: true, visual: null };
      c.visual = this.acquire();
      this.live.push(c);
      if (this.game.gates && this.game.gates.hint) this.game.gates.hint(e);
    }
  }

  update(dt) {
    const game = this.game, run = game.run;
    if (!run) return;
    const L = game.squad.leader;
    this.spawn(-L.z);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      c.t += dt;
      c.punch = Math.max(0, c.punch - dt * 5);
      c.flash = Math.max(0, c.flash - dt * 4);
      if (c.state === 'locked' && L.z < c.z - 0.5) { c.state = 'missed'; c.t = 0; c.dirty = true; }
      else if (c.state === 'open' && L.z <= c.z + JOIN_DZ) this.join(c);
      if (c.z > L.z + 25) { this.release(c); this.live.splice(i, 1); }
    }
  }

  open(c) {
    c.state = 'open'; c.t = 0; c.dirty = true; c.flash = 1;
    const pos = { x: c.x, y: CAGE.lockY * CAGE.scale, z: c.z + CAGE.lockZ * CAGE.scale };
    if (this.game.gates) this.game.gates.burst(pos.x, pos.y - 0.3, pos.z, 0.8, 0.6, '#ffc531', 12);
    this.game.events.emit('cage:open', { count: c.count, pos });
    this.game.shake && this.game.shake.add && this.game.shake.add(0.12);
  }

  /** The freed Raiders join as Pip reaches the cage: they start at the cage and run into their slots. */
  join(c) {
    c.state = 'joined'; c.t = 0; c.dirty = true;
    const squad = this.game.squad, run = this.game.run;
    const before = squad.members.length;
    const added = squad.add(c.count, 'cage');
    for (let i = before; i < squad.members.length; i++) {
      const m = squad.members[i];
      m.x = c.x + (hash(i + c.id) - 0.5) * 1.6; m.z = c.z + 0.6 + hash(i * 3 + c.id) * 0.8;
    }
    if (run) run.stats.rescued = (run.stats.rescued || 0) + Math.max(0, added);
    this.game.events.emit('cage:join', { count: added, pos: { x: c.x, y: 1, z: c.z } });
  }

  // ---- bullet target system (the padlock) ----
  sweep(b, x, z0, z1) {
    let best = null;
    for (let i = 0; i < this.live.length; i++) {
      const c = this.live[i];
      if (c.state !== 'locked') continue;
      const lz = c.z + CAGE.lockZ * CAGE.scale;
      if (lz > z0 || lz < z1 || Math.abs(x - c.x) > LOCK_HALF) continue;
      if (best && lz <= best.lz) continue;
      if (b.nh && hasHit(b, c)) continue;
      c.lz = lz;
      best = c;
    }
    return best;
  }

  hit(c, b) {
    c.punch = 1;
    const run = this.game.run;
    if (!run || !run.active || !(b.bdmg > 0)) return true;
    c.hp -= b.bdmg; c.flash = Math.max(c.flash, 0.6); c.dirty = true;
    const p = this.hitPos; p.x = b.x; p.y = CAGE.lockY * CAGE.scale; p.z = c.z + CAGE.lockZ * CAGE.scale;
    this.game.events.emit('cage:hit', { hp: Math.max(0, Math.ceil(c.hp)), pos: p });
    if (this.game.events.wants('bullet:hit')) this.game.events.emit('bullet:hit', { kind: 'barrel', pos: p });
    if (c.hp <= 0) this.open(c);
    return true;
  }

  /** Locked cages ahead (autopilot). */
  upcoming() { return this.live.filter((c) => c.state === 'locked'); }

  // ---- visuals ----
  sync(dt) {
    const time = this.game.time;
    for (const c of this.live) {
      const v = c.visual;
      if (!v) continue;
      v.group.position.set(c.x, 0, c.z);
      if (c.state === 'locked') {
        const sh = c.punch * 0.08;
        v.lock.position.set(Math.sin(time * 60) * sh, CAGE.lockY + Math.abs(Math.sin(time * 4)) * 0.04, CAGE.lockZ);
        v.lock.rotation.z = Math.sin(time * 47) * c.punch * 0.25;
        v.lock.scale.setScalar(1 + c.flash * 0.18);
        v.prisoners.position.y = Math.abs(Math.sin(time * 5 + c.id)) * 0.06; // waving / hopping to be saved
        v.ring.material.opacity = 0.25 + 0.2 * Math.sin(time * 5);
      } else if (c.state === 'open') {
        const f = Math.min(1, c.t / 0.45);
        v.hinge.rotation.y = -f * 1.9;
        v.lock.position.set(0.6 * f, CAGE.lockY + 2.2 * f - 3 * f * f, CAGE.lockZ + 1.2 * f);
        v.lock.rotation.z = f * 5;
        v.lock.visible = f < 1;
        // the prisoners step out in front of the cage and cheer
        v.prisoners.position.set(0, Math.abs(Math.sin(time * 9)) * 0.3, Math.min(1, c.t / 0.6) * 1.9);
      } else if (c.state === 'joined') {
        v.prisoners.visible = false; v.lock.visible = false; v.ring.visible = false;
      } else {
        v.ring.visible = false;
      }
      if (c.dirty && labelReady(v.label)) { this.drawCageLabel(c); c.dirty = false; }
      v.labelMesh.visible = c.state === 'locked' || c.state === 'open';
    }
  }

  drawCageLabel(c) {
    const v = c.visual;
    const frac = Math.max(0, Math.min(1, c.hp / c.maxHp)), fq = Math.round(frac * 16);
    const open = c.state !== 'locked';
    drawLabel(v.label, open ? 'FREE!' : '+' + c.count, {
      fill: '#ffffff', stroke: open ? '#0e6b3a' : '#7a4a00', size: 74, strokeWidth: 14, y: open ? 0.5 : 0.38, key: open ? 'open' : 'q' + fq,
      after: open ? null : (ctx, w, h) => {
        const bw = w * 0.62, bh = 16, bx = (w - bw) / 2, by = h - 34;
        ctx.fillStyle = 'rgba(40,20,0,0.5)'; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
        ctx.fillStyle = '#ffc531'; ctx.fillRect(bx, by, bw * (fq / 16), bh);
      },
    });
  }

  dispose() {}
}
