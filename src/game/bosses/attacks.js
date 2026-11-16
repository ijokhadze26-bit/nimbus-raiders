// Shared boss attacks (Oculon, Mother Murk, Tempest King use them; each boss tunes them with data).
// Every attack returns { update(dt) -> done, cancel() }. Damage is resolved on the logic step when a
// telegraph's warning ends (always >= 0.9 s), so a squad that moves sideways can always get out.
//   volley(boss, o)      orbs (or bolts) land on target circles: scatter / spiral patterns
//   strikes(boss, o)     striped lane warnings, then lightning (or an orb rain) slams down each strip
//   summon(boss, o)      green swelling burst, then a Murkling wave pours out of the boss (horde.spawnWave)
//   safeSpot(boss, o)    update 3: the whole arena glows red except one glowing safe circle (>= 1.8 s); then a
//                        blast hits everyone outside it (at most SAFE_SPOT.maxLoss of the squad, never a wipe)
import { SAFE_SPOT } from '../../data/bosses.js';

export const clampX = (x, lim = 4.2) => Math.max(-lim, Math.min(lim, x));

/**
 * Target-circle volley. o: { count, radius, telegraph, flight, stagger, spread, pattern:'scatter'|'spiral',
 * turn, maxR, attack, color, orbColor, core, projectile:'orb'|'bolt', from(i) -> {x,y,z}, arc, size,
 * ringColor, onLaunch(i), onImpact(i, kills, mark) }. Update 3: projectile 'drop' (o.drop 'ember' | 'rock' | 'ice'
 * falls from the sky onto the mark) and 'cane' (a spinning candy cane thrown from o.from(i)).
 */
export function volley(boss, o) {
  const game = boss.game, T = game.telegraph, rng = game.rng, fx = boss.effects;
  const n = Math.max(1, o.count | 0);
  const dur = Math.max(0.9, o.telegraph);
  const flight = Math.min(o.flight ?? 0.7, dur - 0.1);
  const stagger = o.stagger ?? 0.18;
  const attack = o.attack || 'orb';
  const c0 = boss.squadCenter();
  const sx = c0.x, sz = c0.z;
  const spin = rng.range(0, Math.PI * 2);
  const shots = [];
  let t = 0;
  const place = (k) => {
    let x, z;
    if (o.pattern === 'spiral') {
      const a = spin + k * (o.turn ?? 1.1);
      const d = 0.2 + (k / Math.max(1, n - 1)) * (o.maxR ?? 3);
      x = sx + Math.cos(a) * d; z = sz + Math.sin(a) * d * 0.75;
    } else if (k === 0) {
      x = sx + rng.range(-0.4, 0.4); z = sz + rng.range(-0.6, 0.3);
    } else {
      // later shots re-aim at the live squad: a squad that stands still gets peppered
      const c = boss.squadCenter();
      const sp = o.spread ?? 2.2;
      x = c.x + rng.range(-sp, sp); z = c.z + rng.range(-sp, sp) * 0.6;
    }
    const mark = T.circle(clampX(x), z, o.radius, dur, { attack, color: o.color });
    shots.push({ start: t, mark, launched: false, hit: false });
  };
  return {
    update(dt) {
      t += dt;
      while (shots.length < n && t >= shots.length * stagger) place(shots.length);
      let pending = false;
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        const lt = t - s.start;
        if (!s.launched && lt >= dur - flight) {
          s.launched = true;
          if (o.projectile === 'drop') fx.x.drop(o.drop || 'ember', s.mark.x, s.mark.z, dur - lt, o.size ?? 1);
          else if (o.projectile === 'cane') { const p = o.from(i); fx.x.cane(p.x, p.y, p.z, s.mark.x, s.mark.z, dur - lt, o.arc ?? 4); }
          else if (o.projectile !== 'bolt') {
            const p = o.from(i);
            fx.orb(p.x, p.y, p.z, s.mark.x, s.mark.z, dur - lt, { color: o.orbColor || o.color, core: o.core, arc: o.arc ?? 3.5, size: o.size ?? 0.75 });
          }
          if (o.onLaunch) o.onLaunch(i);
        }
        if (!s.hit && lt >= dur) {
          s.hit = true;
          const h = s.mark;
          const kills = boss.killInCircle(h.x, h.z, h.r);
          if (o.projectile === 'bolt') {
            fx.bolt(h.x, h.z, 20, { color: o.orbColor || '#fff27a', width: 1.6, life: 0.4 });
            fx.bolt(h.x - h.r * 0.45, h.z + h.r * 0.3, 18, { color: o.orbColor || '#fff27a', width: 1.0, life: 0.3 });
            fx.bolt(h.x + h.r * 0.45, h.z - h.r * 0.3, 18, { color: o.orbColor || '#fff27a', width: 1.0, life: 0.34 });
          }
          fx.ring(h.x, h.z, h.r * 1.5, { color: o.ringColor || '#ffffff' });
          fx.glow(h.x, 0.4, h.z, o.orbColor || o.color || '#7fe9ff', h.r * 3, 0.35);
          game.events.emit('boss:attack', { attack, pos: { x: h.x, y: 0, z: h.z } });
          game.events.emit('fx:shake', { amount: kills > 0 ? 0.5 : 0.3 });
          if (o.onImpact) o.onImpact(i, kills, h);
        }
        if (!s.hit) pending = true;
      }
      return shots.length >= n && !pending && t - shots[n - 1].start >= dur + (o.tail ?? 0.35);
    },
    cancel() { for (const s of shots) T.cancel(s.mark); },
  };
}

/**
 * Lane strikes. o: { count, halfW, telegraph, stagger, attack, color, boltColor, rain (orb rain instead of
 * bolts), from(i), onImpact(i) }. Strip 0 sits on the squad; later strips land on the live squad or on the
 * side it is drifting toward, so moving pays off but standing still never does.
 */
export function strikes(boss, o) {
  const game = boss.game, T = game.telegraph, fx = boss.effects;
  const n = Math.max(1, o.count | 0);
  const hw = o.halfW;
  const dur = Math.max(0.9, o.telegraph);
  const stagger = o.stagger ?? 0.4;
  const attack = o.attack || 'lightning';
  const strips = [];
  let t = 0;
  const place = (k) => {
    const c = boss.squadCenter();
    const L = game.squad.leader;
    let x = c.x;
    if (k % 2 === 1) {
      const dir = Math.abs(L.vx) > 0.5 ? Math.sign(L.vx) : (c.x > 0 ? -1 : 1);
      x = c.x + dir * (hw * 2 + 0.3);
    }
    x = clampX(x, 5 - hw * 0.6);
    const zFar = c.z - c.r - 3.5, zNear = c.z + c.r + 2.5;
    const mark = T.lane(x - hw, x + hw, zNear, zFar, dur, { attack, color: o.color });
    strips.push({ start: t, mark, x, zFar, zNear, hit: false, rained: false });
  };
  return {
    update(dt) {
      t += dt;
      while (strips.length < n && t >= strips.length * stagger) place(strips.length);
      let pending = false;
      for (let i = 0; i < strips.length; i++) {
        const s = strips[i];
        const lt = t - s.start;
        if (o.rain && !s.rained && lt >= dur - 0.6) {
          s.rained = true;
          const p = o.from(i);
          for (let k = 0; k < 4; k++) {
            const z = s.zFar + ((k + 0.5) / 4) * (s.zNear - s.zFar);
            fx.orb(p.x, p.y, p.z, s.x, z, dur - lt + k * 0.02, { color: o.boltColor || o.color, arc: 2.5, size: 0.65 });
          }
        }
        if (!s.hit && lt >= dur) {
          s.hit = true;
          const kills = boss.killInBox(s.x, hw, s.zFar, s.zNear);
          const len = s.zNear - s.zFar;
          for (let k = 0; k < 4; k++) {
            const z = s.zFar + ((k + 0.5) / 4) * len;
            if (!o.rain) fx.bolt(s.x + (k % 2 ? 0.25 : -0.25) * hw, z, 18, { color: o.boltColor || '#fff27a', width: 0.9 + hw * 0.3, life: 0.3 + k * 0.03 });
            fx.ring(s.x, z, hw * 1.6, { color: o.boltColor || '#fff6b0', life: 0.35 });
          }
          game.events.emit('boss:attack', { attack, pos: { x: s.x, y: 0, z: (s.zFar + s.zNear) / 2 } });
          game.events.emit('fx:shake', { amount: kills > 0 ? 0.55 : 0.35 });
          if (o.onImpact) o.onImpact(i, kills);
        }
        if (!s.hit) pending = true;
      }
      return strips.length >= n && !pending && t - strips[n - 1].start >= dur + 0.4;
    },
    cancel() { for (const s of strips) T.cancel(s.mark); },
  };
}

/**
 * Summon: a >= 0.9 s green swelling burst (boss:telegraph 'summon'), then a Murkling wave spawns from the
 * boss body and charges the squad. o: { count, mix, windup, width, lane, ahead, hpMul, color, onWindup(f), onSpawn() }.
 */
export function summon(boss, o) {
  const game = boss.game, fx = boss.effects;
  const windup = Math.max(0.9, o.windup ?? 1.0);
  const color = o.color || '#7dff6a';
  let t = 0, spawned = false, pulse = 0;
  game.events.emit('boss:telegraph', { attack: 'summon', pos: { x: boss.x, y: 0, z: boss.z + 2 }, duration: windup });
  return {
    update(dt) {
      t += dt;
      if (o.onWindup) o.onWindup(Math.min(1, t / windup));
      if (!spawned) {
        pulse -= dt;
        if (pulse <= 0) { pulse = 0.28; fx.ring(boss.x, boss.z + 2.5, 3 + t * 2.5, { color, life: 0.5 }); }
      }
      if (!spawned && t >= windup) {
        spawned = true;
        const h = game.horde;
        if (h && h.spawnWave) {
          const before = h.list.length;
          h.spawnWave({ at: -(boss.z + (o.ahead ?? 3.2)), count: o.count, mix: o.mix, lane: o.lane || 'both', width: o.width ?? 8.6 });
          // the queen's brood is tougher at higher tiers (toughness only; looks and contact rules unchanged)
          if (o.hpMul > 1) for (let i = before; i < h.list.length; i++) h.list[i].hp *= o.hpMul;
        }
        fx.ring(boss.x, boss.z + 3, 7, { color, life: 0.6 });
        fx.glow(boss.x, 2.5, boss.z + 3, color, 10, 0.5);
        game.events.emit('boss:attack', { attack: 'summon', pos: { x: boss.x, y: 0, z: boss.z + 3 } });
        game.events.emit('fx:shake', { amount: 0.45 });
        if (o.onSpawn) o.onSpawn();
      }
      return spawned && t >= windup + (o.tail ?? 0.7);
    },
    cancel() {},
  };
}

/** Runs attacks one after another (each a factory () => attack). */
export function sequence(...steps) {
  let i = 0, cur = null;
  return {
    update(dt) {
      while (i < steps.length) {
        if (!cur) cur = steps[i]();
        if (!cur) { i++; continue; }
        if (!cur.update(dt)) return false;
        cur = null; i++;
        dt = 0;
      }
      return true;
    },
    cancel() { if (cur && cur.cancel) cur.cancel(); },
  };
}

/**
 * SAFE SPOT (update 3, world bosses at each phase change). The arena is telegraphed except a glowing circle of
 * radius 1.8-2.4 (bigger squads get the bigger one) at a random x at least 2.5 u from the squad and clear of live
 * danger zones; after >= 1.8 s a blast hits outside it. Members of a big blob that cannot fit count as safe
 * within a huddle allowance (r + 0.75 * (blob radius - r)), so a squad centred on the spot loses little and one
 * that stays put loses up to maxLoss (35%) of its count. game.shielded() (shield power-up, Sugar Shield) = no loss.
 * o: { telegraph, maxLoss, color, safeColor, blast (ring colour), bolts (lightning on the blast), onBlast(kills) }.
 */
export function safeSpot(boss, o = {}) {
  const game = boss.game, T = game.telegraph, rng = game.rng, fx = boss.effects;
  boss.safeQueued = false; // a boss that starts its own safe spot consumes the one BaseBoss queued at the phase change
  const c0 = boss.squadCenter();
  const r = Math.min(SAFE_SPOT.r1, Math.max(SAFE_SPOT.r0, SAFE_SPOT.r0 + (c0.r - 1) * 0.2));
  const lim = 3.3;
  const zones = boss.dangerZones;
  const clear = (x) => !zones.some((zn) => T.contains(zn, x, c0.z, r * 0.6));
  // candidates across the road, away from the squad, not on a lava / frost strip
  const cand = [];
  for (let x = -lim; x <= lim + 1e-6; x += 0.3) if (Math.abs(x - c0.x) >= 2.5 && clear(x)) cand.push(x);
  let x = cand.length ? cand[rng.int(0, cand.length - 1)] : (c0.x > 0 ? -lim : lim);
  x = Math.round(x * 100) / 100;
  const z = c0.z;
  const dur = Math.max(1.8, (o.telegraph ?? SAFE_SPOT.telegraph) - 0.03 * (boss.tier - 1));
  const mark = T.safe(x, z, r, dur, { color: o.color, safeColor: o.safeColor });
  game.events.emit('boss:safespot', { duration: dur, pos: { x, y: 0, z } });
  let t = 0, fired = false;
  return {
    mark, safe: true,
    update(dt) {
      t += dt;
      if (!fired && t >= dur) {
        fired = true;
        const kills = game.shielded && game.shielded() ? 0 : safeBlast(boss, x, z, r, o.maxLoss ?? SAFE_SPOT.maxLoss);
        // the blast: rings + glows across the road outside the circle, lightning on a storm boss
        for (let k = -2; k <= 2; k++) {
          const bx = clampX(k * 2.2, 4.6);
          if (Math.abs(bx - x) < r + 0.6) continue;
          fx.ring(bx, z - 1, 2.6, { color: o.blast || '#ff6a4a', life: 0.5 });
          fx.glow(bx, 0.6, z - 1, o.blast || '#ff6a4a', 6, 0.45);
          if (o.bolts) fx.bolt(bx, z - 2 + (k & 1) * 2, 20, { color: o.bolts, width: 1.2, life: 0.35 });
        }
        fx.ring(x, z, r * 1.6, { color: o.safeColor || '#3dff8a', life: 0.6 });
        game.events.emit('boss:attack', { attack: 'safespot', pos: { x, y: 0, z } });
        game.events.emit('fx:shake', { amount: kills > 0 ? 0.9 : 0.6 });
        if (o.onBlast) o.onBlast(kills);
      }
      return fired && t >= dur + 0.5;
    },
    cancel() { T.cancel(mark); },
  };
}

/** Resolves a safe-spot blast: kills outside the (huddle-widened) circle, at most maxLoss of the count. */
function safeBlast(boss, x, z, r, maxLoss) {
  const squad = boss.game.squad;
  const c = boss.squadCenter();
  const rr = r + 0.75 * Math.max(0, c.r - r);
  const out = [];
  for (const m of squad.members) { const dx = m.x - x, dz = m.z - z; if (dx * dx + dz * dz > rr * rr) out.push(m); }
  const L = squad.leader;
  const lOut = (L.x - x) ** 2 + (L.z - z) ** 2 > rr * rr;
  const rendered = squad.members.length + 1;
  const frac = (out.length + (lOut ? 1 : 0)) / rendered;
  const loss = Math.min(squad.count - 1, Math.round(squad.count * maxLoss * frac));
  if (loss <= 0) return 0;
  // the rendered members outside die (farthest first); reserves behind the rendered cap make up the rest
  out.sort((a, b) => ((b.x - x) ** 2 + (b.z - z) ** 2) - ((a.x - x) ** 2 + (a.z - z) ** 2));
  const visible = Math.min(out.length, Math.round(loss * squad.members.length / Math.max(1, squad.count)) || Math.min(out.length, loss));
  let n = 0;
  for (let i = 0; i < visible && squad.count > 1; i++) { const before = squad.count; boss.killMemberObj(out[i], 'boss'); n += before - squad.count; }
  if (loss - n > 0 && squad.count > 1) n += -squad.remove(Math.min(loss - n, squad.count - 1), 'boss') || 0;
  return n;
}
