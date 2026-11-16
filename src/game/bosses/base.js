// BaseBoss: hp + hitbox (bullet target), entrance drop with shake, intro roar, weighted attack scheduler
// (cooldowns scaled by level tier, faster in phase 2 below 50% hp), damage flash, death sequence with slow-mo,
// then game.win(). Subclasses implement: buildModel(), startAttack(id, spec) -> attack { update(dt) -> done },
// and optionally animate(dt, t), onPhase2(), onDeath(), enterUpdate(f) (entrance pose, default: drop from the
// sky), onLanded(). Steering: the boss sways toward the squad unless `lockX` is set (charges, sweeps).
// Shared attack visuals live in game.bosses.effects (orbs, bolts, rings, puddles, laser).
// Update 3: `def.phases` (hp fractions, default [0.5]) -> boss:phase { phase, phases } + onPhase(n) (onPhase2 for
// phase 2); RAGE below 25% hp (boss:rage, attacks RAGE.cadence x as often, red pulse + aura, onRage()); world
// bosses (cfg.mini falsy) queue the shared SAFE SPOT step (attacks.safeSpot) at every phase change (a subclass
// opts out with `this.safeAuto = false`); burning / freezing strips via addBurn() (rate-limited kills, autopilot
// danger zones); attackList() lets a skinned / world variant swap its attack table.
import { bossDef, cadenceFor, RAGE } from '../../data/bosses.js';
import { safeSpot } from './attacks.js';
import { bossMul } from '../../data/matchups.js';
import { HIT } from '../../config.js';
import { applySkin, tintGlows, boulderTint } from './skins.js';
import { themeWorld } from '../../data/themes.js';
import * as THREE from 'three';

const AURA_RAGE = new THREE.Color('#ff2a1a'), AURA_GUARD = new THREE.Color('#a8c4ff');

const FROZEN_MUL = 1.25;

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
    // update 3: a world skin renames the boss (cfg.name / subtitle from bossLook) and recolours the model
    this.name = cfg.name || this.def.name;
    this.subtitle = cfg.subtitle || this.def.subtitle;
    this.skin = cfg.skin || null;
    this.tier = cfg.tier || 1;
    this.maxHp = cfg.hp || this.def.hp;
    this.hp = this.maxHp;
    this.phase = 1;
    this.phaseAt = this.def.phases || [0.5];
    this.rage = false;
    this.guardMul = 1;      // damage taken multiplier (the Tempest King braces behind a storm shield in safe-spot steps)
    this.mini = !!cfg.mini;
    // world bosses dodge-step at each phase change; Grawlstone stand-ins and minis don't
    this.safeAuto = !cfg.mini && cfg.safeSpot !== false;
    this.safeQueued = false;
    // world flavour of this fight: the skin, else the run's world ('sky' | 'forge' | 'frost' | 'candy' | 'citadel')
    this.flavor = cfg.skin || (game.run && game.run.world) || 'sky';
    this.burns = [];
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
    this.bit = HIT.BOSS;
    this.priority = 9;
    // update 2 status (ticked by status.tickBoss): burn pool, freeze (no new attack starts while frozenT > 0)
    this.burnPool = 0; this.burnT = 0; this.frozenT = 0;
    this.hitTarget = { z: 0, boss: this };
    this.hitPos = { x: 0, y: 0, z: 0 };
    this.c = { x: 0, z: 0, r: 0 };
    this.model = this.buildModel();
    this.root = this.model.root;
    const th = game.world && game.world.theme;
    this.skinState = applySkin(this.root, this.skin, th && themeWorld(th.id) !== 'sky' ? th.blob : null);
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

  /** Called once when hp drops below RAGE.at (after the shared rage effects). */
  onRage() {}
  /** Phase n (2, 3, ...) starts. Default: onPhase2() for phase 2. */
  onPhase(n) { if (n === 2) this.onPhase2(); }
  /** Look of the shared safe-spot step for this boss (colours, sound name). */
  safeSpotOpts() { return {}; }
  /** Attack table (a world variant may swap it). */
  attackList() { return this.def.attacks; }

  // ---------------- scheduler ----------------
  pickAttack() {
    const list = this.attackList().filter((a) => a.minPhase <= this.phase);
    let total = 0;
    for (const a of list) total += a.weight;
    let r = this.game.rng.next() * total;
    for (const a of list) { r -= a.weight; if (r <= 0) return a; }
    return list[list.length - 1];
  }

  nextCooldown() {
    const [a, b] = this.def.cooldown;
    const cd = this.game.rng.range(a, b) / (cadenceFor(this.def, this.tier, this.phase) * (1 + this.enrage()) * (this.rage ? RAGE.cadence : 1));
    return this.safeQueued ? Math.min(cd, 0.6) : cd;
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
        game.events.emit('boss:spawn', { type: this.type, name: this.name, subtitle: this.subtitle, skin: this.skin, hp: this.maxHp });
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
        const frozen = this.frozenT > 0; // Whiteout: a running attack finishes, no new one starts
        if (!frozen) this.cooldown -= dt;
        if (this.cooldown <= 0 && !frozen) {
          if (this.safeQueued) {
            this.safeQueued = false;
            this.attack = safeSpot(this, this.safeSpotOpts());
          } else {
            const spec = this.pickAttack();
            this.attack = this.startAttack(spec.id, spec);
          }
          if (!this.attack) this.cooldown = this.nextCooldown();
        }
      }
    } else if (this.state === 'dying') {
      if (this.t >= DEATH_TIME) { this.state = 'dead'; this.root.visible = false; game.win(); }
    }
    if (game.status && this.targetable) game.status.tickBoss(this, dt);
    if (this.burns.length) this.tickBurns(dt);
    const fxx = this.effects && this.effects.x;
    if (fxx && (this.rage || this.guardMul < 1 || fxx.rageAura)) fxx.aura().on = this.alive && (this.rage || this.guardMul < 1);
    this.root.position.set(this.x, this.y, this.z);
  }

  sync(dt) {
    this.animate(dt, this.time);
    if (this.skinState) {
      tintGlows(this.skinState);
      const b = this.boulders && this.boulders[0];
      if (b && b.mesh) boulderTint(this.skinState, b.mesh.material.color);
    }
    // rage: a red heat pulse over the model's own hit flash + a red aura behind it
    const raging = this.rage && this.alive;
    const a = (raging || this.guardMul < 1) && this.effects && this.effects.x ? this.effects.x.aura() : null;
    if (a) {
      a.s.material.color.copy(this.guardMul < 1 ? AURA_GUARD : AURA_RAGE);
      a.x = this.x; a.y = (this.def.hitY ?? 3) + this.y; a.z = this.z - 1;
      a.size = (this.def.hitbox.halfW + 1) * 4.2;
    }
    const mat = this.model && this.model.mat;
    if (raging && mat && mat.emissive) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 10);
      mat.emissive.r += 0.16 + 0.22 * k; mat.emissive.g += 0.02 * k;
    }
  }

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
    if (this.game.events.wants('bullet:hit')) this.game.events.emit('bullet:hit', { kind: 'boss', pos: p, weapon: b.owner ? b.owner.id : 'helper' });
    this.damageTyped(b.dmg, b.el);
    return true;
  }

  /** Element-aware damage (SPEC2 §1.5): matchup multiplier, +25% while frozen. el 'neutral' = 1. */
  damageTyped(d, el = 'neutral') {
    this.damage(d * bossMul(el, this.type) * (this.frozenT > 0 ? FROZEN_MUL : 1));
  }

  damage(d) {
    if (!this.targetable || d <= 0) return;
    const run = this.game.run;
    if (!run || !run.active) return; // a lost run cannot be won by bullets still in the air
    this.hp = Math.max(0, this.hp - d * this.guardMul);
    if (this.time - (this.lastFlash || -1) > 0.16) { this.flash = 1; this.lastFlash = this.time; }
    if (this.hp > 0) this.game.events.emit('boss:hp', { hp: Math.ceil(this.hp), max: this.maxHp });
    while (this.hp > 0 && this.phase <= this.phaseAt.length && this.hp <= this.maxHp * this.phaseAt[this.phase - 1]) {
      this.phase++;
      this.game.events.emit('boss:phase', { phase: this.phase, phases: this.phaseAt.length + 1, name: this.name });
      this.game.events.emit('fx:shake', { amount: 0.5 });
      if (this.safeAuto) { this.safeQueued = true; if (!this.attack) this.cooldown = Math.min(this.cooldown, 0.6); }
      this.onPhase(this.phase);
    }
    if (!this.rage && this.hp > 0 && this.hp <= this.maxHp * RAGE.at) this.enterRage();
    if (this.hp <= 0) this.die();
  }

  /** RAGE (update 3): faster attacks from now on, a roar, a red flash on the HUD, a red glow on the model. */
  enterRage() {
    this.rage = true;
    const game = this.game;
    game.events.emit('boss:rage', { type: this.type, name: this.name, pos: { x: this.x, y: 3, z: this.z } });
    game.events.emit('fx:shake', { amount: 0.7 });
    if (this.effects) {
      this.effects.ring(this.x, this.z + 2, 11, { color: '#ff3a2a', life: 0.7 });
      this.effects.glow(this.x, (this.def.hitY ?? 3), this.z + 1, '#ff3a2a', 16, 0.6);
    }
    // the next attack comes quickly (a long cooldown rolled before the rage is cut down)
    if (!this.attack) this.cooldown = Math.min(this.cooldown, 0.8);
    this.onRage();
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
    this.burns.length = 0;
    this.safeQueued = false;
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

  /** Warning time for an attack: shrinks a little with tier, phase 2+ and rage, never below 0.9 s. */
  warnTime(base, p2 = 0) { return Math.max(0.9, base - 0.03 * (this.tier - 1) - (this.phase >= 2 ? p2 : 0) - (this.rage ? RAGE.warnCut : 0) - Math.min(0.5, 0.25 * this.enrage())); }

  /**
   * Burning (lava) / freezing (frost) strip x0..x1 x zFar..zNear for `life` s: members standing in it die one by
   * one (`rate` per s at most, after a short grace); the autopilot sees it as a danger zone. kind 'lava' | 'frost'.
   */
  addBurn(kind, x0, x1, zFar, zNear, life, rate) {
    if (this.effects && this.effects.x) this.effects.x.strip(kind, x0, x1, zFar, zNear, life);
    const zone = { kind: 'lane', x0, x1, zNear, zFar };
    this.dangerZones.push(zone);
    this.burns.push({ zone, t: 0, life, rate, acc: 0, kind });
    return zone;
  }

  tickBurns(dt) {
    const game = this.game, squad = game.squad;
    const shielded = game.shielded && game.shielded();
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t += dt;
      if (b.t >= b.life || !this.alive) { this.dropZone(b.zone); this.burns.splice(i, 1); continue; }
      if (b.t < 0.3 || b.t > b.life - 0.25 || shielded || squad.count <= 0) continue;
      const z = b.zone;
      let victim = null;
      for (const m of squad.members) if (m.x > z.x0 && m.x < z.x1 && m.z > z.zFar && m.z < z.zNear) { victim = m; break; }
      const L = squad.leader;
      if (!victim && L.x > z.x0 && L.x < z.x1 && L.z > z.zFar && L.z < z.zNear) victim = L;
      if (!victim) { b.acc = 0; continue; }
      b.acc += b.rate * dt;
      if (b.acc >= 1) {
        b.acc -= 1;
        this.killMemberObj(victim, 'boss');
        const B = game.fx && game.fx.B;
        if (B) B.sparkle(victim.x, 0.6, victim.z, b.kind === 'lava' ? 0xff7a1e : 0xbff0ff, 4, 0.5, 0, 1.4);
      }
    }
  }

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
    const b = this.boulders && this.boulders[0];
    if (b && b.mesh && this.skinState) b.mesh.material.color.setRGB(1, 1, 1);
    this.offTarget();
    this.game.scene.remove(this.root);
    if (this.effects) this.effects.clear();
    this.disposeExtra();
  }
}
