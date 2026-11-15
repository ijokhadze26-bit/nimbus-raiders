// Per-enemy and boss status (SPEC2 §6.4): burn pools, slow, freeze (+ Glacier shatter), sticky caramel, zone
// pull. Gameplay only (identical on every quality). tickHorde(dt) is the first line of horde.update: it runs
// the zones (pull + crush), then per alive enemy: burn tick -> timers -> pull move -> speed factor -> view.
//   burn(e, pool, dur)       adds to the pool (caller applies vsMul) and resets the timer (x hero burnTimeMul)
//   slow(e, pct, dur)        the strongest slow wins, the timer refreshes
//   freeze(e, dur, {shatter = true})   the longest freeze wins; shatter is OR-ed (Glacier: free kill on touch)
//   sticky(e, pct, dur)      caramel after leaving a puddle
//   freezeWindow(t) / onPlace(e)       enemies placed inside the window spawn frozen (no shatter; Whiteout)
//   bossBurn(pool, dur)      boss burn pool (caller applies bossMul); tickBoss(boss, dt) runs inside BaseBoss
import { MEMBER_CLAMP } from '../config.js';
import { applyDamage, ALIVE } from './hordeops.js';

const BURN_SRC = { el: 'neutral', shieldHits: 1, bypassShield: true, cause: 'burn', events: false };

export class Status {
  init(game) {
    this.game = game;
    this.freezeUntil = -1;
  }

  reset() { this.freezeUntil = -1; }

  burnTimeMul() { const h = this.game.heroes; return h ? h.burnTimeMul : 1; }

  burn(e, pool, dur) {
    if (!e || e.state !== ALIVE || !(pool > 0)) return;
    e.burnPool += pool;
    e.burnT = Math.max(0.05, dur * this.burnTimeMul());
  }

  slow(e, pct, dur) {
    if (!e || e.state !== ALIVE) return;
    e.slowPct = e.slowT > 0 ? Math.max(e.slowPct, pct) : pct;
    e.slowT = Math.max(e.slowT, dur);
  }

  freeze(e, dur, { shatter = true } = {}) {
    if (!e || e.state !== ALIVE) return;
    e.freezeT = Math.max(e.freezeT, dur);
    if (shatter) e.shatter = 1;
  }

  sticky(e, pct, dur) {
    if (!e || e.state !== ALIVE) return;
    e.stickyPct = e.stickyT > 0 ? Math.max(e.stickyPct, pct) : pct;
    e.stickyT = Math.max(e.stickyT, dur);
  }

  freezeWindow(t) { this.freezeUntil = Math.max(this.freezeUntil, this.game.time + t); }

  /** horde.place() hook: a new enemy inside the freeze window starts frozen until it ends (no shatter). */
  onPlace(e) {
    const left = this.freezeUntil - this.game.time;
    if (left > 0) e.freezeT = left;
  }

  bossBurn(pool, dur) {
    const b = this.game.boss;
    if (!b || !(pool > 0)) return;
    b.burnPool += pool;
    b.burnT = Math.max(0.05, dur * this.burnTimeMul());
  }

  /** First line of horde.update (before movement). */
  tickHorde(dt) {
    const game = this.game, h = game.horde;
    const list = h.list;
    for (let i = 0; i < list.length; i++) { const e = list[i]; e.px = 0; e.pz = 0; e.pud = 0; }
    if (game.zones) game.zones.update(dt);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.state !== ALIVE) continue;
      // 1. burn: the pool drains over the remaining burn time (front-loaded burns land before contact)
      if (e.burnPool > 0) {
        const d = e.burnT > dt ? e.burnPool * (dt / e.burnT) : e.burnPool;
        e.burnPool -= d;
        e.burnT -= dt;
        if (e.burnT <= 0 || e.burnPool < 1e-6) { e.burnPool = 0; e.burnT = 0; }
        if (d > 0) applyDamage(h, e, d, d, BURN_SRC);
        if (e.state !== ALIVE) continue;
      }
      // 2. timers
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slowPct = 0; } }
      if (e.stickyT > 0) { e.stickyT -= dt; if (e.stickyT <= 0) { e.stickyT = 0; e.stickyPct = 0; } }
      if (e.freezeT > 0) { e.freezeT -= dt; if (e.freezeT <= 0) { e.freezeT = 0; e.shatter = 0; } }
      // 3. zone pull (black holes)
      if (e.px || e.pz) {
        e.x += e.px * dt; e.z += e.pz * dt;
        if (e.x > MEMBER_CLAMP) e.x = MEMBER_CLAMP; else if (e.x < -MEMBER_CLAMP) e.x = -MEMBER_CLAMP;
      }
      // 4. speed factor (movement multiplies by it)
      if (e.freezeT > 0) e.spd = 0;
      else {
        let s = e.slowT > 0 ? e.slowPct : 0;
        if (e.stickyT > 0 && e.stickyPct > s) s = e.stickyPct;
        if (e.pud > s) s = e.pud;
        e.spd = Math.max(0, 1 - s);
      }
      // 5. view
      e.ice = e.freezeT > 0 ? 1 : e.slowT > 0 ? 0.45 : 0;
      e.burn = e.burnPool > 0 ? Math.min(1, e.burnPool / (e.hp + 1e-6)) : 0;
    }
  }

  /** Inside BaseBoss.update: burn pool tick + freeze timer. */
  tickBoss(boss, dt) {
    if (boss.frozenT > 0) boss.frozenT = Math.max(0, boss.frozenT - dt);
    if (boss.burnPool > 0) {
      const d = boss.burnT > dt ? boss.burnPool * (dt / boss.burnT) : boss.burnPool;
      boss.burnPool -= d;
      boss.burnT -= dt;
      if (boss.burnT <= 0 || boss.burnPool < 1e-6) { boss.burnPool = 0; boss.burnT = 0; }
      if (d > 0) boss.damage(d * (boss.frozenT > 0 ? 1.25 : 1));
    }
  }
}
