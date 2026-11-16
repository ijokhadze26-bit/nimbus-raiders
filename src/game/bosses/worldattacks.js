// Update 3 world-flavoured boss attacks (shared: Ironhorn's magma stomp, the Candy Queen, the Tempest King's
// phases 2-3). Same contract as attacks.js: each returns { update(dt) -> done, cancel() }, damage resolves when a
// >= 0.9 s telegraph ends.
//   emberRain(boss, o)    Volcanic Forge: glowing embers drop from the sky onto orange circles around the squad
//   rockSlam(boss, o)     Sky Bridge: Grawlstone-style boulders crash onto big circles (follow-ups chase the squad)
//   caneVolley(boss, o)   Candy Kingdom: spinning candy canes arc onto pink circles
//   freezeLane(boss, o)   Frozen Peaks: an icy lane warning, a frost blast, then a frozen strip that keeps
//                         freezing members who stand in it (boss.addBurn 'frost')
//   gumballRoll(boss, o)  Candy Kingdom: a giant gumball rolls down a warned lane through the squad
import { volley, clampX } from './attacks.js';

/** o: { count, radius, telegraph, stagger, spread, from? , onImpact? }. */
export function emberRain(boss, o) {
  const B = boss.game.fx && boss.game.fx.B;
  return volley(boss, {
    count: o.count, radius: o.radius, telegraph: o.telegraph, flight: 0.65, stagger: o.stagger ?? 0.12, spread: o.spread ?? 3,
    attack: 'embers', color: '#ff6a12', projectile: 'drop', drop: 'ember', size: 1.1, ringColor: '#ffb040', orbColor: '#ff7a1e',
    onImpact(i, kills, h) { if (B) B.sparkle(h.x, 0.4, h.z, 0xff8a2a, 6, 1.2, 0, 2.5); if (o.onImpact) o.onImpact(i, kills, h); },
  });
}

/** o: { count, radius, telegraph, gap }. */
export function rockSlam(boss, o) {
  const B = boss.game.fx && boss.game.fx.B;
  return volley(boss, {
    count: o.count, radius: o.radius, telegraph: o.telegraph, flight: 0.45, stagger: o.gap ?? 0.55, spread: 0.6,
    attack: 'slam', projectile: 'drop', drop: 'rock', size: o.radius * 0.85, ringColor: '#e8dcc4', orbColor: '#d8c8a8',
    onImpact(i, kills, h) { if (B) B.slam(h.x, h.z, h.r); if (o.onImpact) o.onImpact(i, kills, h); },
  });
}

/** o: { count, radius, telegraph, flight, stagger, spread, from(i) }. */
export function caneVolley(boss, o) {
  return volley(boss, {
    count: o.count, radius: o.radius, telegraph: o.telegraph, flight: o.flight ?? 0.75, stagger: o.stagger ?? 0.14, spread: o.spread ?? 2.8,
    attack: 'cane', color: '#ff3a8a', projectile: 'cane', arc: 5, from: o.from, ringColor: '#ffffff', orbColor: '#ff5aa0',
    onLaunch: o.onLaunch,
  });
}

/** o: { halfW, telegraph, life, rate, count (lanes, default 1), stagger }. */
export function freezeLane(boss, o) {
  const game = boss.game, T = game.telegraph, fx = boss.effects;
  const n = Math.max(1, o.count | 0 || 1);
  const hw = o.halfW;
  const dur = Math.max(0.9, o.telegraph);
  const lanes = [];
  let t = 0;
  const place = (k) => {
    const c = boss.squadCenter();
    const L = game.squad.leader;
    let x = c.x;
    if (k % 2 === 1) x = c.x + (Math.abs(L.vx) > 0.5 ? Math.sign(L.vx) : (c.x > 0 ? -1 : 1)) * (hw * 2 + 0.3);
    x = clampX(x, 5 - hw * 0.6);
    const zFar = boss.z + 4, zNear = c.z + c.r + 2.5;
    lanes.push({ start: t, x, zFar, zNear, hit: false, mark: T.lane(x - hw, x + hw, zNear, zFar, dur, { attack: 'freeze', color: '#2a9dff' }) });
  };
  return {
    update(dt) {
      t += dt;
      while (lanes.length < n && t >= lanes.length * (o.stagger ?? 0.5)) place(lanes.length);
      let pending = false;
      for (const s of lanes) {
        if (!s.hit && t - s.start >= dur) {
          s.hit = true;
          const kills = boss.killInBox(s.x, hw, s.zFar, s.zNear);
          boss.addBurn('frost', s.x - hw, s.x + hw, s.zFar, s.zNear, o.life, o.rate);
          const len = s.zNear - s.zFar;
          for (let k = 0; k < 4; k++) {
            const z = s.zFar + ((k + 0.5) / 4) * len;
            fx.ring(s.x, z, hw * 1.7, { color: '#bff0ff', life: 0.4 });
            fx.glow(s.x, 0.6, z, '#8fe3ff', hw * 3.5, 0.4);
          }
          game.events.emit('boss:attack', { attack: 'freeze', pos: { x: s.x, y: 0, z: (s.zFar + s.zNear) / 2 } });
          game.events.emit('fx:shake', { amount: kills > 0 ? 0.5 : 0.3 });
        }
        if (!s.hit) pending = true;
      }
      return lanes.length >= n && !pending && t - lanes[n - 1].start >= dur + 0.4;
    },
    cancel() { for (const s of lanes) T.cancel(s.mark); },
  };
}

/**
 * o: { halfW, telegraph, launch }. The gumball rolls fast (it would reach the blob centre as the warning ends if
 * launched at o.launch) but leaves a little later, so its kill edge reaches the front of the blob exactly as the
 * warning ends; it kills nothing before then (the warning is never shorter than 0.9 s). While it rolls on past
 * the warning, its lane stays a danger zone (the autopilot does not step back into it).
 */
export function gumballRoll(boss, o) {
  const game = boss.game, T = game.telegraph, fx = boss.effects;
  const c = boss.squadCenter();
  const hw = o.halfW;
  const cx = clampX(c.x, 3.4);
  const zNear = c.z + c.r + 1.5, zFar = boss.z + 2.5;
  const dur = boss.warnTime(o.telegraph);
  const launch0 = Math.min(o.launch, dur - 0.3);
  const mark = T.lane(cx - hw, cx + hw, zNear, zFar, dur, { attack: 'gumball', color: '#ff3aa8' });
  const br = hw * 0.95;
  const speed = Math.max(1, c.z - zFar) / Math.max(0.3, dur - launch0);
  const launch = Math.max(launch0, dur - Math.max(0, c.z - c.r - br * 0.6 - zFar) / speed);
  const zone = { kind: 'lane', x0: cx - hw, x1: cx + hw, zNear, zFar };
  let t = 0, ball = null, lastZ = zFar, zoned = false;
  const unzone = () => { if (zoned) { boss.dropZone(zone); zoned = false; } };
  return {
    update(dt) {
      t += dt;
      if (!ball && t >= launch) {
        ball = fx.x.gumball(cx, zFar, br);
        ball.vz = speed;
        game.events.emit('boss:attack', { attack: 'roll', pos: { x: cx, y: 0, z: zFar } });
      }
      if (ball && ball.active) {
        ball.z += ball.vz * dt;
        const z = ball.z;
        if (t < dur) return false; // still the warning: the sweep starts as it ends (covers the path rolled so far)
        if (!zoned) { boss.dangerZones.push(zone); zoned = true; }
        zone.zFar = z - br;
        if (z > lastZ) boss.killInBox(cx, hw, lastZ - ball.r * 0.6, z + ball.r * 0.6);
        lastZ = z;
        if (z > zNear + 6) { ball.active = false; unzone(); }
      }
      return !!ball && !ball.active;
    },
    cancel() { T.cancel(mark); if (ball) ball.active = false; unzone(); },
  };
}
