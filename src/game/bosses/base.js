// BaseBoss: hp + hitbox (bullet target), entrance drop with shake, intro roar, weighted attack scheduler
// (cooldowns scaled by level tier, faster in phase 2 below 50% hp), damage flash, death sequence with slow-mo,
// then game.win(). Subclasses implement: buildModel(), startAttack(id, spec) -> attack { update(dt) -> done },
// and optionally animate(dt, t), onPhase2(), onDeath(), enterUpdate(f) (entrance pose, default: drop from the
// sky), onLanded(). Steering: the boss sways toward the squad unless `lockX` is set (charges, sweeps).
// Shared attack visuals live in game.bosses.effects (orbs, bolts, rings, puddles, laser).
import { bossDef, cadenceFor } from '../../data/bosses.js';

const DROP_TIME = 0.85, INTRO_TIME = 1.25, DEATH_TIME = 1.55;
// Soft enrage: past ENRAGE_AFTER s of fighting, attacks come 1 + (t - ENRAGE_AFTER) / ENRAGE_RAMP times as
// often and warnings shrink toward the 0.9 s floor, so a squad too small to win (a small blob could dodge
// Ironhorn's half-road charges for minutes) is settled in about a minute. Normal fights (12-25 s) never reach it.
const ENRAGE_AFTER = 40, ENRAGE_RAMP = 25;

export class BaseBoss {
  constructor(game, cfg) {
    this.game = game;
    this.def = bossDef(cfg.type);
    this.type = this.def.type;
    this.name = this.def.name;
    this.tier = cfg.tier || 1;
    this.maxHp = cfg.hp || this.def.hp;
    this.hp = this.maxHp;
    this.phase = 1;
    this.state = 'enter';
    this.t = 0;
    this.time = 0;
    this.x = 0; this.y = 40; this.z = 0;
    this.flash = 0;
    this.cooldown = this.def.firstAttack;
    this.attack = null;
    this.lockX = null;
    // hazards still live after their telegraph ended, shaped like telegraph handles
    // ({ kind:'lane', x0, x1, zNear, zFar } | { kind:'circle', x, z, r }); the autopilot dodges them too
    this.dangerZones = [];
    this.effects = game.bosses.effects;
    this.kind = 'boss';
    this.priority = 9;
    this.hitTarget = { z: 0, boss: this };
    this.hitPos = { x: 0, y: 0, z: 0 };
    this.c = { x: 0, z: 0, r: 0 };
    this.model = this.buildModel();
    this.root = this.model.root;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    game.scene.add(this.root);
    this.offTarget = game.bullets.addTargetSystem(this);
    const L = game.squad.leader;
    this.z = L.z - this.def.distance;
    this.homeZ = this.z;
    this.root.position.set(0, this.y, this.z);
  }

  get targetable() { return this.state === 'intro' || this.state === 'fight'; }
  get alive() { return this.state !== 'dying' && this.state !== 'dead'; }

  // ---------------- subclass hooks ----------------
  buildModel() { throw new Error('buildModel() not implemented'); }
  startAttack() { return null; }
  animate() {}
  onPhase2() {}
  onDeath() {}
  disposeExtra() {}
  /** Entrance pose for f = 0..1 (default: drop from the sky). */
  enterUpdate(f) { this.y = 40 * (1 - f * f); }
  /** Called once when the entrance ends (default: landing dust + big shake). */
  onLanded() {
    this.game.events.emit('fx:shake', { amount: 0.9 });
    this.game.gates.burst(this.x, 0.2, this.z + 1.5, 7, 0.6, '#c9c2b4', 24);
  }

  // ---------------- scheduler ----------------
  pickAttack() {
    const list = this.def.attacks.filter((a) => a.minPhase <= this.phase);
    let total = 0;
    for (const a of list) total += a.weight;
    let r = this.game.rng.next() * total;
    for (const a of list) { r -= a.weight; if (r <= 0) return a; }
    return list[list.length - 1];
  }

  nextCooldown() {
    const [a, b] = this.def.cooldown;
    return this.game.rng.range(a, b) / (cadenceFor(this.def, this.tier, this.phase) * (1 + this.enrage()));
  }

  update(dt) {
    const game = this.game;
    this.t += dt;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 10);
    const L = game.squad.leader;
    if (this.state === 'enter') {
      const f = Math.min(1, this.t / (this.def.enterTime || DROP_TIME));
      this.enterUpdate(f);
      if (f >= 1) {
        this.y = 0; this.z = this.homeZ;
        this.state = 'intro'; this.t = 0;
        game.events.emit('boss:spawn', { type: this.type, name: this.name, hp: this.maxHp });
        game.events.emit('boss:hp', { hp: this.hp, max: this.maxHp });
        this.onLanded();
      }
    } else if (this.state === 'intro') {
      if (this.t >= INTRO_TIME) { this.state = 'fight'; this.t = 0; }
    } else if (this.state === 'fight') {
      // sway toward the squad a little (attacks may pin x)
      if (this.lockX === null) this.x += (L.x * (this.def.sway ?? 0.22) - this.x) * Math.min(1, dt * 1.2);
      else this.x += (this.lockX - this.x) * Math.min(1, dt * 7);
      if (this.attack) {
        if (this.attack.update(dt)) { this.attack = null; this.cooldown = this.nextCooldown(); }
      } else if (game.squad.count > 0 && game.run && game.run.active) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          const spec = this.pickAttack();
          this.attack = this.startAttack(spec.id, spec);
          if (!this.attack) this.cooldown = this.nextCooldown();
        }
      }
    } else if (this.state === 'dying') {
      if (this.t >= DEATH_TIME) { this.state = 'dead'; this.root.visible = false; game.win(); }
    }
    this.root.position.set(this.x, this.y, this.z);
  }

  sync(dt) { this.animate(dt, this.time); }

  // ---------------- damage ----------------
  sweep(b, x, z0, z1) {
    if (!this.targetable) return null;
    const front = this.z + this.def.hitbox.front;
    if (front > z0 || front < z1) return null;
    if (Math.abs(x - this.x) > this.def.hitbox.halfW) return null;
    this.hitTarget.z = front;
    return this.hitTarget;
  }

  hit(t, b) {
    const p = this.hitPos; p.x = b.x; p.z = t.z;
    p.y = this.def.hitY != null ? this.def.hitY + (Math.random() - 0.5) * 2.2 : b.y + 1.2;
    if (this.game.events.wants('bullet:hit')) this.game.events.emit('bullet:hit', { kind: 'boss', pos: p });
    this.damage(b.dmg);
    return true;
  }

  damage(d) {
    if (!this.targetable || d <= 0) return;
    const run = this.game.run;
    if (!run || !run.active) return; // a lost run cannot be won by bullets still in the air
    this.hp = Math.max(0, this.hp - d);
    if (this.time - (this.lastFlash || -1) > 0.16) { this.flash = 1; this.lastFlash = this.time; }
    if (this.hp > 0) this.game.events.emit('boss:hp', { hp: Math.ceil(this.hp), max: this.maxHp });
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && this.hp > 0) {
      this.phase = 2;
      this.game.events.emit('boss:phase', { phase: 2 });
      this.game.events.emit('fx:shake', { amount: 0.5 });
      this.onPhase2();
    }
    if (this.hp <= 0) this.die();
  }

  kill() { if (this.alive) { if (this.state === 'enter') { this.state = 'fight'; this.y = 0; this.z = this.homeZ; } this.damage(this.hp + 1); } }

  die() {
    if (!this.alive) return;
    const game = this.game;
    this.state = 'dying'; this.t = 0;
    if (this.attack && this.attack.cancel) this.attack.cancel();
    this.attack = null;
    this.lockX = null;
    this.dangerZones.length = 0;
    game.telegraph.reset();
    if (this.effects) this.effects.beamOff(true);
    const pos = { x: this.x, y: 3, z: this.z };
    game.events.emit('boss:hp', { hp: 0, max: this.maxHp }, true);
    game.events.emit('boss:defeated', { type: this.type, pos });
    game.events.emit('fx:slowmo', { scale: 0.2, duration: 1.4 });
    game.events.emit('fx:shake', { amount: 1 });
    this.onDeath();
  }

  // ---------------- helpers for attacks ----------------
  /** Kills squad members inside a circle (leader counts too). Returns kills. */
  killInCircle(x, z, r, reason = 'boss') {
    const squad = this.game.squad;
    const r2 = r * r;
    let n = 0;
    const ms = squad.members;
    for (let i = ms.length - 1; i >= 0 && squad.count > 0; i--) {
      const m = ms[i];
      const dx = m.x - x, dz = m.z - z;
      if (dx * dx + dz * dz < r2) { squad.killMember(i, reason); n++; }
    }
    const L = squad.leader;
    if (squad.count > 0) { const dx = L.x - x, dz = L.z - z; if (dx * dx + dz * dz < r2) { squad.remove(1, reason); n++; } }
    return n;
  }

  /** Kills members with |x - cx| < halfW and z in [z0, z1]. */
  killInBox(cx, halfW, z0, z1, reason = 'boss') {
    const squad = this.game.squad;
    let n = 0;
    const ms = squad.members;
    for (let i = ms.length - 1; i >= 0 && squad.count > 0; i--) {
      const m = ms[i];
      if (Math.abs(m.x - cx) < halfW && m.z >= z0 && m.z <= z1) { squad.killMember(i, reason); n++; }
    }
    const L = squad.leader;
    if (squad.count > 0 && Math.abs(L.x - cx) < halfW && L.z >= z0 && L.z <= z1) { squad.remove(1, reason); n++; }
    return n;
  }

  /** Members (leader included) with |x - cx| < halfW and z in [z0, z1], as a fresh array. */
  membersInBox(cx, halfW, z0, z1) {
    const squad = this.game.squad, out = [];
    for (const m of squad.members) if (Math.abs(m.x - cx) < halfW && m.z >= z0 && m.z <= z1) out.push(m);
    const L = squad.leader;
    if (Math.abs(L.x - cx) < halfW && L.z >= z0 && L.z <= z1) out.push(L);
    return out;
  }

  /** Kills one member object (or the leader) if it is still alive. */
  killMemberObj(m, reason = 'boss') {
    const squad = this.game.squad;
    if (squad.count <= 0) return;
    if (m === squad.leader) squad.remove(1, reason);
    else if (squad.members.includes(m)) squad.killMemberObj(m, reason);
  }

  squadCenter() { return this.game.squad.center(this.c); }

  /** Warning time for an attack: shrinks a little with tier (and optionally phase 2), never below 0.9 s. */
  warnTime(base, p2 = 0) { return Math.max(0.9, base - 0.03 * (this.tier - 1) - (this.phase === 2 ? p2 : 0) - Math.min(0.5, 0.25 * this.enrage())); }

  /** Soft-enrage level: 0 for the first ENRAGE_AFTER s of the fight, then +1 every ENRAGE_RAMP s. */
  enrage() { return this.state === 'fight' ? Math.max(0, this.t - ENRAGE_AFTER) / ENRAGE_RAMP : 0; }

  /** Count that grows with level tier: n + floor((tier - 1) * perTier). */
  tierCount(n, perTier = 0.5) { return n + Math.floor((this.tier - 1) * perTier); }

  dropZone(z) { const i = this.dangerZones.indexOf(z); if (i >= 0) this.dangerZones.splice(i, 1); }

  /** Pops every live Murkling (summoned minions die with their boss). */
  clearMinions() {
    const h = this.game.horde;
    if (!h) return;
    for (const e of h.list) if (e.state === 0) h.kill(e, 'blast');
  }

  /** Detaches the (cached, reused) model from the scene; geometry/materials stay alive for the next spawn. */
  dispose() {
    this.offTarget();
    this.game.scene.remove(this.root);
    if (this.effects) this.effects.clear();
    this.disposeExtra();
  }
}
