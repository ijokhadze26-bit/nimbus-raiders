// Preview demo loops for the info previews (SPEC2 §5): each weapon plays its firing pattern (def.preview.pattern)
// against 3 dummy Murklings with its real projectile + gun geometry; heroes run in place holding a weapon and
// play their ability pose + effect every 4 s. Generic over the builders' exports: it only uses the projectile
// pools / FX api of ui/preview.js, the item's def numbers (mkRow) and models/weapons/gearturret.js +
// models/fortress.js for the two turret looks. FX randomness is cosmetic (never gameplay).
// Contract: createDemo(ctx) -> { update(dt, t), dispose() }.
import { mkRow, MK_SCALE } from '../data/weapons.js';
import { buildGearTurret } from '../models/weapons/gearturret.js';
import { buildFortress } from '../models/fortress.js';
import { part } from '../models/util.js';
import { toonMaterial } from '../models/materials.js';

const RAINBOW = ['#ff5a7a', '#ffb34d', '#fff08a', '#7dff6a', '#4dc3ff', '#a26bff'];
const CANDY = ['#ff8ad8', '#8affc8', '#fff08a', '#b48aff'];
const rnd = (a, b) => a + Math.random() * (b - a);

export function createDemo(ctx) {
  return ctx.item.kind === 'weapon' ? weaponDemo(ctx) : heroDemo(ctx);
}

function weaponDemo(ctx) {
  const { fx, weapon: def, mk } = ctx;
  const R = ctx.R;
  const row = mkRow(def, mk), look = def.look.mk[mk - 1], S = MK_SCALE[mk - 1];
  const pattern = (def.preview && def.preview.pattern) || 'chain';
  const make = PATTERNS[pattern] || PATTERNS.chain;
  const p = make({ ...ctx, R, row, look, S, fx });
  return {
    update(dt, t) { p.update(dt, t); R.update(dt); },
    dispose() { p.dispose?.(); },
  };
}

// every pattern: ({R, fx, row, look, S, mk, weapon, content}) -> { update(dt, t), dispose? }
const PATTERNS = {
  cone({ R, fx, row, look, S, mk }) {
    let cd = 0, cycle = 0, ring = 0;
    const flames = [];
    const half = (row.cone * Math.PI) / 360;
    return {
      update(dt) {
        cycle = (cycle + dt) % 3;
        const firing = cycle < 2.2;
        cd -= dt;
        const m = R.m;
        if (firing && cd <= 0) {
          cd = 0.085;
          R.kick(0.25);
          for (let i = 0; i < 3; i++) {
            const a = (i - 1) * half * 0.8 + rnd(-0.08, 0.08), sp = 6.4;
            flames.push(fx.proj('main', m.x, m.y, m.z - 0.1, Math.sin(a) * sp, rnd(-0.2, 0.3), -Math.cos(a) * sp, { life: 0.62, s: 0.6 * S, data: 0 }));
          }
          fx.spark(m.x, m.y + 0.04, m.z - 0.05, 0, 0, 0, '#4d9bff', 0.07, 0.06);
          fx.spark(m.x + rnd(-0.1, 0.1), m.y, m.z, rnd(-1, 1), rnd(0.5, 1.6), rnd(-3, -1.5), look.trail, 0.04, 0.4, 2);
          if (mk >= 5 && (ring -= 0.085) <= 0) { ring = 0.5; fx.ring(m.x, m.y - 0.2, m.z - 0.4, 0.1, 0.9, '#ffb05a', 0.35); }
        }
        for (let i = flames.length - 1; i >= 0; i--) {
          const f = flames[i];
          if (f.age >= f.life) { flames.splice(i, 1); continue; }
          const u = f.age / f.life;
          f.s = S * (0.6 + 0.8 * u) * (u > 0.6 ? 1 - (u - 0.6) * 1.8 : 1);
          const hit = R.touch(f, 0.75);
          if (hit >= 0) {
            f.hits |= 1 << hit;
            const d = R.D[hit];
            if (d.burn <= 0) R.hit(d, look.core, 3);
            d.burn = row.burnTime;
          }
        }
        for (const d of R.D) if (d.burn > 0 && Math.random() < dt * 10) {
          fx.spark(d.x + rnd(-0.3, 0.3), 0.9, d.z + rnd(-0.3, 0.3), 0, rnd(0.6, 1.2), 0, Math.random() < 0.6 ? '#ff7a1f' : '#6b5a52', rnd(0.05, 0.1), 0.6, -0.5);
        }
      },
    };
  },

  pierce({ R, fx, row, look, S, mk }) {
    let cd = 0.2, freezeT = 1.2, next = 0;
    const shards = [];
    return {
      update(dt) {
        cd -= dt; freezeT -= dt;
        const m = R.m;
        if (cd <= 0) {
          cd = 0.55;
          R.kick(0.8);
          R.flashMuzzle(look.color, look.core, 5);
          fx.ring(m.x, m.y, m.z - 0.2, 0.05, 0.45, look.color, 0.18);
          shards.push(fx.proj('main', 0, m.y - 0.25, m.z, 0, -2.1, -14, { life: 0.42, s: S, sz: 1.2 }));
        }
        for (let i = shards.length - 1; i >= 0; i--) {
          const s = shards[i];
          if (s.age >= s.life) { shards.splice(i, 1); continue; }
          if (s.y < 0.7) { s.vy = 0; s.y = 0.7; }
          const hit = R.touch(s, 0.55);
          if (hit < 0) continue;
          s.hits |= 1 << hit;
          const d = R.D[hit];
          R.hit(d, '#e8fbff', 6);
          fx.burst(d.x, 0.6, d.z, 4, '#ffffff', 1.2, 0.05, 0.6, 0.1);
          d.ice = Math.max(d.ice, 0.45);
          if (mk >= 4) fx.ring(d.x, 0.04, d.z, 0.2, 0.95, look.trail, 0.6);
        }
        if (freezeT <= 0) {
          freezeT = 3;
          const d = R.D[next++ % R.D.length];
          d.ice = 1.6;
          fx.ring(d.x, 0.06, d.z, 0.3, 1.2, '#bff4ff', 0.5);
          fx.burst(d.x, 0.9, d.z, 10, '#e8fbff', 2.6, 0.08, 0.5);
        }
      },
    };
  },

  lob({ R, fx, row, look, S, mk }) {
    let cd = 0.1, k = 0, puddleT = 0;
    const bombs = [];
    const T = 0.8;
    const throwAt = (x0, y0, z0, x1, z1, apex, t, data) => {
      const g = (8 * apex) / (t * t), vy = (0.35 - y0) / t + (g * t) / 2;
      return fx.proj('main', x0, y0, z0, (x1 - x0) / t, vy, (z1 - z0) / t, { g, life: t + 0.05, s: S * 1.1, spin: 9, data });
    };
    const splash = (x, z, r, big) => {
      const c = CANDY[(k + (big ? 0 : 1)) % CANDY.length];
      fx.disc(x, z, r * 0.9, c, 0.45, { grow: 0.25, y: 0.05 });
      fx.ring(x, 0.08, z, 0.2, r * 1.3, c, 0.4);
      for (let i = 0, n = fx.n(big ? 10 : 6); i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        fx.spark(x, 0.4, z, Math.cos(a) * 2.6, rnd(1.5, 3), Math.sin(a) * 2.6, CANDY[i % 4], mk >= 5 ? 0.11 : 0.08, 0.55, 7);
      }
      for (const d of R.D) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (r + 0.4) ** 2) R.hit(d, c, 2);
    };
    return {
      update(dt) {
        cd -= dt; puddleT -= dt;
        if (cd <= 0) {
          cd = 0.62;
          const d = R.D[k++ % R.D.length];
          R.kick(0.9);
          fx.burst(R.m.x, R.m.y + 0.1, R.m.z, 6, CANDY[k % 4], 1.8, 0.06, 0.35, 1);
          bombs.push(throwAt(R.m.x, R.m.y + 0.1, R.m.z, d.x + rnd(-0.25, 0.25), d.z + 0.5, 1.6, T, row.bounces));
        }
        for (let i = bombs.length - 1; i >= 0; i--) {
          const b = bombs[i];
          if (b.y > 0.36 && b.age < b.life) continue;
          bombs.splice(i, 1);
          b.dead = true;
          const r = row.splashR * 0.5 * (b.data === row.bounces ? 1 : 0.75);
          splash(b.x, b.z, r, b.data === row.bounces);
          if (b.data === row.bounces && puddleT <= 0) {
            puddleT = 0.9;
            fx.disc(b.x, b.z, row.puddleR * 0.45, '#d98a2b', Math.min(3, row.puddleTime * 0.6), { grow: 0.1, fade: 0.2, y: 0.03 });
          }
          if (b.data > 0) bombs.push(throwAt(b.x, 0.4, b.z, b.x + rnd(-0.2, 0.2), b.z - 1.1, 0.7, 0.4, b.data - 1));
        }
      },
    };
  },

  split({ R, fx, row, look, S, mk }) {
    let cd = 0.2, halo = 0;
    const beams = [], kids = [];
    return {
      update(dt) {
        cd -= dt; halo -= dt;
        const m = R.m, tgt = R.D[1];
        if (mk >= 5 && halo <= 0) { halo = 0.3; fx.ring(m.x, m.y, m.z - 0.1, 0.25, 0.42, RAINBOW[Math.floor(Math.random() * 6)], 0.3); }
        if (cd <= 0) {
          cd = 0.42;
          R.kick(0.6);
          R.flashMuzzle('#ffffff', '#ffffff', 3);
          const dx = tgt.x - m.x, dz = tgt.z - m.z, L = Math.hypot(dx, dz), sp = 18;
          beams.push(fx.proj('main', m.x, m.y - 0.3, m.z, (dx / L) * sp, -0.6, (dz / L) * sp, { life: 0.5, s: S, sz: row.beamLen / 3.5 }));
        }
        for (let i = beams.length - 1; i >= 0; i--) {
          const b = beams[i];
          if (b.age >= b.life) { beams.splice(i, 1); continue; }
          if (R.touch(b, 0.6) !== 1) continue;
          b.dead = true; beams.splice(i, 1);
          R.hit(tgt, '#ffffff', 2);
          for (let j = 0, n = fx.n(6); j < n; j++) fx.spark(tgt.x, 0.8, tgt.z, rnd(-2, 2), rnd(1, 2.5), rnd(-2, 2), RAINBOW[j % 6], 0.07, 0.45, 4);
          for (let j = 0; j < row.splits; j++) {
            const other = R.D[j === 0 ? 0 : j === 1 ? 2 : -1];
            const fan = (j / Math.max(1, row.splits - 1) - 0.5) * 2 * 0.28;
            let vx, vz;
            if (other) { const dx = other.x - tgt.x, dz = other.z - tgt.z, L = Math.hypot(dx, dz); vx = dx / L; vz = dz / L; } else { vx = Math.sin(fan + Math.PI); vz = -Math.cos(fan); }
            const c = fx.proj('child', tgt.x, 0.75, tgt.z, vx * 11, 0, vz * 11, { life: 0.45, s: S * 0.6, sz: row.beamLen / 3.5 });
            c.hits = 1 << 1;
            kids.push(c);
          }
        }
        for (let i = kids.length - 1; i >= 0; i--) {
          const c = kids[i];
          if (c.age >= c.life) { kids.splice(i, 1); continue; }
          const h = R.touch(c, 0.55);
          if (h >= 0) { c.hits |= 1 << h; c.dead = true; kids.splice(i, 1); R.hit(R.D[h], RAINBOW[h * 2], 3); }
        }
      },
    };
  },

  bounce({ R, fx, row, look, S, mk, content }) {
    let cd = 0.2, drop = 1.2, turret = null, tLife = 0, tShot = 0;
    const gears = [];
    const aim = (g, d, sp) => { const dx = d.x - g.x, dz = d.z - g.z, L = Math.hypot(dx, dz) || 1; g.vx = (dx / L) * sp; g.vz = (dz / L) * sp; g.vy = 0; };
    return {
      update(dt) {
        cd -= dt; drop -= dt;
        const m = R.m;
        if (cd <= 0) {
          cd = 0.8;
          R.kick(0.8);
          R.flashMuzzle('#ffb36b', '#fff3c4', 5);
          const g = fx.proj('main', m.x, 0.85, m.z, 0, 0, -9, { life: 1.4, s: S * 1.2, spin: 20, data: row.bounces });
          aim(g, R.D[0], 9);
          gears.push(g);
        }
        for (let i = gears.length - 1; i >= 0; i--) {
          const g = gears[i];
          if (g.age >= g.life) { gears.splice(i, 1); continue; }
          const h = R.touch(g, 0.55);
          if (h < 0) continue;
          g.hits |= 1 << h;
          const d = R.D[h];
          R.hit(d, '#ffd25a', 3);
          for (let j = 0; j < fx.n(4); j++) fx.arc(d.x, 0.8, d.z, d.x + rnd(-0.7, 0.7), 0.8 + rnd(0, 0.6), d.z + rnd(-0.7, 0.7), '#ffb36b', 0.025, 0.15);
          fx.ring(d.x, 0.8, d.z, 0.1, 0.6, '#fff3c4', 0.2);
          const next = R.D.findIndex((_, j) => !(g.hits & (1 << j)));
          if (g.data > 0 && next >= 0) {
            g.data--; g.age = 0; g.life = 0.9;
            aim(g, R.D[next], 8);
            fx.arc(g.x, 0.85, g.z, R.D[next].x, 0.85, R.D[next].z, '#ffc531', 0.02, 0.25);
          } else g.vx *= 0.6;
        }
        // mini turret drops every 4 s and fires one gear
        if (drop <= 0 && !turret) {
          drop = 4;
          turret = buildGearTurret({ lod: 'high' });
          turret.root.position.set(1.7, 2.4, 0.9);
          turret.root.scale.setScalar(1.3);
          content.root.add(turret.root);
          tLife = 2.6; tShot = 0.7;
        }
        if (turret) {
          tLife -= dt;
          const r = turret.root;
          if (r.position.y > 0) { r.position.y = Math.max(0, r.position.y - dt * 9); if (r.position.y === 0) { fx.ring(r.position.x, 0.05, r.position.z, 0.2, 1.1, '#d9a441', 0.4); fx.burst(r.position.x, 0.2, r.position.z, 6, '#c8d0dc', 1.6); } }
          else if ((tShot -= dt) <= 0) {
            tShot = 99;
            const g = fx.proj('child', r.position.x, 0.75, r.position.z - 0.3, 0, 0, -7, { life: 1, s: S, spin: 20, data: 0 });
            aim(g, R.D[2], 7);
            gears.push(g);
            fx.burst(r.position.x, 0.8, r.position.z - 0.3, 4, '#ffb36b', 1.2);
          }
          if (tLife < 0.3) r.scale.setScalar(Math.max(0.01, 1.3 * (tLife / 0.3)));
          if (tLife <= 0) { content.root.remove(r); turret.dispose?.(); turret = null; }
        }
      },
      dispose() { if (turret) { content.root.remove(turret.root); turret.dispose?.(); turret = null; } },
    };
  },

  chain({ R, fx, row, look, S, mk }) {
    let cd = 0.2;
    const bolts = [], queue = [];
    const zap = (a, b) => {
      fx.zap(a.x, 0.8, a.z, b.x, 0.8, b.z, '#6f6bff', 0.09 * S, 0.14, 4, 0.3);
      fx.zap(a.x, 0.8, a.z, b.x, 0.8, b.z, look.color, 0.035 * S, 0.12, 4, 0.22);
      if (mk >= 3) fx.zap(b.x, 0.8, b.z, b.x + rnd(-0.8, 0.8), 1.2, b.z + rnd(-0.6, 0.6), look.color, 0.02, 0.1, 2, 0.2);
    };
    return {
      update(dt) {
        cd -= dt;
        const m = R.m;
        if (cd <= 0) {
          cd = 0.6;
          R.kick(0.7);
          R.flashMuzzle('#6f6bff', '#ffffff', 4);
          fx.zap(m.x, m.y, m.z, m.x + rnd(-0.4, 0.4), m.y + rnd(-0.2, 0.3), m.z - 0.5, '#ffffff', 0.02, 0.08, 2, 0.15);
          const d = R.D[0], dx = d.x - m.x, dz = d.z - m.z, L = Math.hypot(dx, dz);
          bolts.push(fx.proj('main', m.x, m.y - 0.3, m.z, (dx / L) * 16, -0.8, (dz / L) * 16, { life: 0.5, s: S }));
        }
        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i];
          if (b.age >= b.life) { bolts.splice(i, 1); continue; }
          if (R.touch(b, 0.6) !== 0) continue;
          b.dead = true; bolts.splice(i, 1);
          R.hit(R.D[0], '#ffffff', 4);
          fx.ring(R.D[0].x, 0.8, R.D[0].z, 0.1, 0.8, look.color, 0.2);
          const jumps = Math.min(row.jumps, R.D.length - 1);
          for (let j = 0; j < jumps; j++) queue.push({ t: 0.07 * (j + 1), a: j, b: j + 1, last: j === jumps - 1 });
        }
        for (let i = queue.length - 1; i >= 0; i--) {
          const q = queue[i];
          if ((q.t -= dt) > 0) continue;
          queue.splice(i, 1);
          const a = R.D[q.a], b = R.D[q.b];
          zap(a, b);
          R.hit(b, look.color, 3);
          if (q.last && mk >= 5) fx.disc(b.x, b.z, 0.7, '#3a3550', 0.8, { y: 0.03 });
        }
      },
    };
  },

  hole({ R, fx, row, look, S, mk }) {
    let cd = 0.3, hole = null, orb = null, swirl = 0;
    const cx = 0.05, cz = -1.75;
    return {
      update(dt, t) {
        cd -= dt;
        const m = R.m;
        if (cd <= 0 && !orb && !hole) {
          cd = 0.9;
          R.kick(1);
          R.flashMuzzle('#b44bff', '#ff7ae6', 5);
          const dx = cx - m.x, dz = cz - m.z, L = Math.hypot(dx, dz);
          orb = fx.proj('main', m.x, m.y, m.z, (dx / L) * 4.2, -0.35, (dz / L) * 4.2, { life: L / 4.2, s: S * 1.4 });
        }
        if (orb) {
          orb.sy = 1 + Math.sin(t * 12) * 0.12;
          if (Math.random() < dt * 20) fx.spark(orb.x, orb.y, orb.z, rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4), '#ff4bd8', 0.05, 0.3);
          if (orb.age >= orb.life - 0.02) {
            orb.dead = true; orb = null;
            hole = { t: 0, dur: Math.max(1.6, row.holeTime + 0.4), r: row.pullR * 0.42 };
            fx.ring(cx, 0.1, cz, 0.1, hole.r * 1.2, '#ff4bd8', 0.35);
          }
        }
        if (hole) {
          hole.t += dt;
          const u = hole.t / hole.dur;
          if (hole.t < dt * 1.5) fx.disc(cx, cz, hole.r * 0.5, '#120822', hole.dur, { grow: 0.12, fade: 0.15, y: 0.04 });
          swirl += dt * 5;
          for (let a = 0; a < 3; a++) {
            const ang = swirl + (a * Math.PI * 2) / 3, r1 = hole.r * 0.9, r0 = hole.r * 0.25;
            fx.arc(cx + Math.cos(ang) * r1, 0.08, cz + Math.sin(ang) * r1, cx + Math.cos(ang + 1.3) * r0, 0.08, cz + Math.sin(ang + 1.3) * r0, '#ff4bd8', 0.05, dt * 1.5);
          }
          if (Math.random() < dt * (ctxLow() ? 8 : 16)) {
            const a = rnd(0, Math.PI * 2), r = hole.r * 1.3;
            fx.spark(cx + Math.cos(a) * r, rnd(0.2, 1.2), cz + Math.sin(a) * r, -Math.cos(a) * r * 2, 0, -Math.sin(a) * r * 2, '#c96bff', 0.05, 0.45);
          }
          if (mk >= 5 && Math.random() < dt * 10) { const a = rnd(0, 6.28); fx.spark(cx + Math.cos(a) * hole.r * 0.7, 0.15, cz + Math.sin(a) * hole.r * 0.7, -Math.sin(a) * 2, 0, Math.cos(a) * 2, '#fff08a', 0.035, 0.3); }
          for (const d of R.D) {
            const k = u < 0.85 ? Math.min(1, hole.t * 1.6) * 0.6 : Math.max(0, (1 - u) / 0.15) * 0.6;
            const tx = d.hx + (cx - d.hx) * k, tz = d.hz + (cz - d.hz) * k;
            d.lx = (tx - d.x) * 4; d.lz = (tz - d.z) * 4;
            d.x += (tx - d.x) * Math.min(1, dt * 6); d.z += (tz - d.z) * Math.min(1, dt * 6);
            if (Math.random() < dt * 3) R.hit(d, '#ff7ae6', 1);
          }
          if (u >= 1) {
            fx.ring(cx, 0.2, cz, hole.r * 1.2, 0.1, '#ff7ae6', 0.25);
            fx.burst(cx, 0.4, cz, 10, '#b44bff', 2.4, 0.07, 0.4);
            hole = null;
            for (const d of R.D) { d.lx = 0; d.lz = 0; }
          }
        } else for (const d of R.D) { d.x += (d.hx - d.x) * Math.min(1, dt * 5); d.z += (d.hz - d.z) * Math.min(1, dt * 5); }
      },
    };
    function ctxLow() { return R.fx.n(2) < 2; }
  },
};

// ---------------- heroes ----------------
const ABILITY_EVERY = 4;
function heroDemo(ctx) {
  const { fx, content, hero, item, weapon, mk } = ctx;
  const rigH = content.rig, m = content.muzzle;
  const look = weapon.look.mk[mk - 1], S = MK_SCALE[mk - 1];
  const showAbility = item.kind === 'hero';
  const id = hero.ability.id;
  let shot = 0.3, abT = showAbility ? ABILITY_EVERY - 1.2 : -1, pose = -1, extra = null, flashed = false;
  const H = (rigH.scale || 1.25) / 1.25 * (hero.scale || 1);
  const cleanup = () => {
    if (!extra) return;
    content.root.remove(extra.obj);
    if (extra.dispose) extra.dispose();
    extra = null;
  };
  const start = () => {
    pose = 0; flashed = false;
    const by = id;
    if (by === 'rally') {
      fx.ring(0, 0.06, 0, 0.3, 2.8, '#4dc3ff', 0.7);
      fx.ring(0, 0.06, 0, 0.2, 2.0, '#ffffff', 0.5);
      for (let i = 0; i < fx.n(10); i++) { const a = rnd(0, 6.28), r = rnd(1, 2.4); fx.spark(Math.cos(a) * r, 0.2, Math.sin(a) * r, 0, rnd(1.5, 2.5), 0, i % 2 ? '#ffffff' : '#7ff3ff', 0.09, 0.8, 1); }
    } else if (by === 'meteor') {
      const rock = new ctx.THREE.Mesh(part(new ctx.THREE.IcosahedronGeometry(0.45, 0), '#6a3a2a'), toonMaterial({ emissive: '#ff5a1f', emissiveIntensity: 0.6 }));
      rock.position.set(0, 6, -2.6);
      content.root.add(rock);
      extra = { obj: rock, kind: 'meteor', t: 0, dispose() { rock.geometry.dispose(); rock.material.dispose(); } };
      fx.ring(0, 0.05, -2.6, 1.6, 1.7, '#ff7a1f', 0.7);
    } else if (by === 'whiteout') {
      fx.ring(0, 0.1, 0, 0.3, 3.4, '#e8fbff', 0.7);
      for (let i = 0; i < fx.n(18); i++) fx.spark(rnd(-3, 3), rnd(0.5, 3), rnd(-3, 2), rnd(-1.5, -0.5), rnd(-0.6, -0.2), 0, '#ffffff', 0.06, 1.2);
    } else if (by === 'sugarshield') {
      const T = ctx.THREE;
      const ball = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshBasicMaterial({ color: '#ff8ad8', transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
      ball.position.set(0, 0.85 * H, 0);
      ball.scale.setScalar(0.01);
      content.root.add(ball);
      extra = { obj: ball, kind: 'bubble', t: 0, dispose() { ball.geometry.dispose(); ball.material.dispose(); } };
    } else if (by === 'fortress') {
      const f = buildFortress({ lod: 'high' });
      f.root.position.set(1.6, 3, 0.4);
      content.root.add(f.root);
      extra = { obj: f.root, kind: 'fortress', t: 0, shots: 0, dispose() { f.dispose?.(); } };
    } else if (by === 'shockwave') {
      fx.ring(0, 0.06, 0, 0.4, 3.6, '#c99bff', 0.6);
      fx.ring(0, 0.06, 0, 0.3, 2.6, '#ffffff', 0.45);
      for (let i = 0; i < fx.n(16); i++) { const a = (i / 16) * 6.28; fx.spark(Math.cos(a) * 0.6, 0.15, Math.sin(a) * 0.6, Math.cos(a) * 5, rnd(0.5, 1.5), Math.sin(a) * 5, i % 2 ? '#a9b6cc' : '#ffc531', 0.08, 0.5, 4); }
    }
  };
  const updateExtra = (dt) => {
    if (!extra) return;
    extra.t += dt;
    const o = extra.obj, u = extra.t;
    if (extra.kind === 'meteor') {
      if (u < 0.7) {
        o.position.y = 6 - (u / 0.7) * 5.7; o.rotation.x += dt * 6;
        fx.spark(o.position.x + rnd(-0.2, 0.2), o.position.y + 0.3, o.position.z, 0, 1.5, 0, Math.random() < 0.5 ? '#ff7a1f' : '#ffd34d', 0.12, 0.35);
      } else if (!extra.boom) {
        extra.boom = true;
        o.visible = false;
        fx.ring(0, 0.08, -2.6, 0.3, 3.2, '#ff7a1f', 0.6);
        fx.ring(0, 0.08, -2.6, 0.2, 2.2, '#ffd34d', 0.45);
        fx.burst(0, 0.3, -2.6, 22, '#ff7a1f', 4.5, 0.11, 0.7, 0.9);
        fx.disc(0, -2.6, 1.5, '#3a2420', 1.6, { y: 0.03 });
      } else if (u > 1.8) cleanup();
    } else if (extra.kind === 'bubble') {
      const k = u < 0.25 ? u / 0.25 : u > 1.8 ? Math.max(0, 1 - (u - 1.8) / 0.3) : 1;
      o.scale.setScalar(Math.max(0.01, k * 1.15 * H * (1 + Math.sin(u * 8) * 0.03)));
      if (Math.random() < dt * 6) fx.ring(0, rnd(0.4, 1.5) * H, 0, 0.9 * H, 1.1 * H, Math.random() < 0.5 ? '#8affc8' : '#ff8ad8', 0.4);
      if (u > 2.1) cleanup();
    } else if (extra.kind === 'fortress') {
      if (o.position.y > 0) { o.position.y = Math.max(0, o.position.y - dt * 10); if (o.position.y === 0) { fx.ring(o.position.x, 0.05, o.position.z, 0.3, 1.6, '#ffd34d', 0.45); fx.burst(o.position.x, 0.2, o.position.z, 8, '#c8d0dc', 2); } }
      else if (u > 0.6 && extra.shots < 4 && u > 0.6 + extra.shots * 0.4) {
        extra.shots++;
        const x = o.position.x, z = o.position.z - 0.9;
        fx.burst(x, 1.0, z, 5, '#ffd25a', 1.6, 0.07, 0.25);
        fx.arc(x, 1.0, z, x, 1.0, z - 3.5, '#ff9a3d', 0.07, 0.15);
      }
      if (u > 2.6) o.scale.setScalar(Math.max(0.01, 1 - (u - 2.6) / 0.3));
      if (u > 2.9) cleanup();
    }
  };
  return {
    update(dt, t) {
      // hero shots (favourite / chosen weapon) between abilities
      shot -= dt;
      if (shot <= 0 && pose < 0) {
        shot = 0.45;
        fx.proj('main', m.x, m.y, m.z, 0, 0, -12, { life: 0.45, s: S * 0.9 });
        fx.spark(m.x, m.y, m.z - 0.1, 0, 0, -0.5, look.core, 0.14, 0.06);
      }
      if (showAbility) {
        abT += dt;
        if (abT >= ABILITY_EVERY) { abT = 0; start(); }
      }
      let ab = 0;
      if (pose >= 0) {
        pose += dt;
        ab = Math.min(1, pose / 0.9);
        if (id === 'whiteout' && !flashed && pose > 0.25) { flashed = true; ctx.flash?.('rgba(232, 251, 255, 0.9)'); }
        if (pose >= 0.9) pose = -1;
      }
      rigH.animate(t, 1, 0, 0, ab);
      updateExtra(dt);
    },
    dispose() { cleanup(); },
  };
}
