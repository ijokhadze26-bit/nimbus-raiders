// Shared boss attacks (Oculon, Mother Murk, Tempest King use them; each boss tunes them with data).
// Every attack returns { update(dt) -> done, cancel() }. Damage is resolved on the logic step when a
// telegraph's warning ends (always >= 0.9 s), so a squad that moves sideways can always get out.
//   volley(boss, o)      orbs (or bolts) land on target circles: scatter / spiral patterns
//   strikes(boss, o)     striped lane warnings, then lightning (or an orb rain) slams down each strip
//   summon(boss, o)      green swelling burst, then a Murkling wave pours out of the boss (horde.spawnWave)

export const clampX = (x, lim = 4.2) => Math.max(-lim, Math.min(lim, x));

/**
 * Target-circle volley. o: { count, radius, telegraph, flight, stagger, spread, pattern:'scatter'|'spiral',
 * turn, maxR, attack, color, orbColor, core, projectile:'orb'|'bolt', from(i) -> {x,y,z}, arc, size,
 * ringColor, onLaunch(i), onImpact(i, kills, mark) }.
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
          if (o.projectile !== 'bolt') {
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
