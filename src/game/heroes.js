// HeroSystem (SPEC2 §3, §6.5): the run's hero - data-driven passive mods other systems read, Guard points,
// the ability cooldown and useAbility(). Everything is gameplay (identical on every quality, game time only).
//   mods: rateMul, dmgMul (generic), dmgMulFor(weaponId) (generic x favourite 1.15 x Cinder fire 1.25),
//         rangeMul, pierceAdd(weaponId), coinMul, startBonus, easeMul, turretLifeMul, turretRateMul, burnTimeMul
//   absorb(reason): true = this member loss is cancelled (Sugar Shield invulnerability, or a Guard point for an
//         enemy touch / Fizzbomb blast); squad.remove / killMember call it once per member
//   ability: { id, ready, left, cd, activeT } ; useAbility() -> abilities[id].use(game, hero, mk) -> bool
// Events: ability:ready {hero}, ability:use {hero, ability, pos}, ability:start {hero, ability, duration},
//         ability:end {hero, ability}, hero:guard {left, pos}.
import { HERO_DEF_BY_ID, DEFAULT_HERO, GUARD_REGEN, FAVOURITE_BONUS, ABILITY_START } from '../data/heroes.js';
import { ABILITIES } from './abilities/index.js';

const NO_ABSORB_INVULN = new Set(['gap', 'gate', 'start', 'ability']);
const GUARDED = new Set(['horde', 'bomb']);

export class HeroSystem {
  init(game) {
    this.game = game;
    this.ability = { id: 'rally', ready: false, left: 0, cd: 20, activeT: 0 };
    this.abilities = {};
    for (const id in ABILITIES) this.abilities[id] = ABILITIES[id];
    this.apply(HERO_DEF_BY_ID[DEFAULT_HERO]);
    this.guard = this.guardMax; this.guardT = 0;
    this.invulnT = 0;
    this.pos = { x: 0, y: 1, z: 0 };
    this.used = 0;
  }

  /** Copies a hero def's stats + passive mods onto this system (data-driven). */
  apply(def) {
    this.def = def;
    this.id = def.id;
    const m = def.passive.mods || {};
    this.rateMul = m.rateMul ?? 1;
    this.dmgMul = m.dmgMul ?? 1;
    this.fireMul = m.fireMul ?? 1;
    this.rangeMul = m.rangeMul ?? 1;
    this.pierceList = m.pierceAdd ? m.pierceAdd.weapons : [];
    this.pierceN = m.pierceAdd ? m.pierceAdd.n : 0;
    this.coinMul = m.coinMul ?? 1;
    this.startBonus = m.startBonus ?? 0;
    this.easeMul = def.speed ?? 1;
    this.turretLifeMul = m.turretLifeMul ?? 1;
    this.turretRateMul = m.turretRateMul ?? 1;
    this.burnTimeMul = m.burnTimeMul ?? 1;
    this.guardMax = def.health ?? 0;
    const a = def.ability;
    this.ability.id = a.id; this.ability.cd = a.cd;
  }

  /** Damage multiplier for a weapon's hits: generic x favourite (+15%) x Cinder's fire bonus on Emberstorm. */
  dmgMulFor(weaponId) {
    let k = this.dmgMul;
    if (weaponId === this.def.favourite) k *= 1 + FAVOURITE_BONUS;
    if (weaponId === 'emberstorm') k *= this.fireMul;
    return k;
  }

  pierceAdd(weaponId) { return this.pierceN && this.pierceList.includes(weaponId) ? this.pierceN : 0; }

  /** Run start (before the squad is built: startBonus feeds its size). */
  reset(run, heroId = DEFAULT_HERO) {
    this.apply(HERO_DEF_BY_ID[heroId] || HERO_DEF_BY_ID[DEFAULT_HERO]);
    this.guard = this.guardMax; this.guardT = 0;
    this.invulnT = 0;
    this.used = 0;
    const ab = this.ability;
    const start = run ? (ABILITY_START[run.mode] ?? ABILITY_START.level) : 0;
    ab.left = ab.cd * (1 - start);
    ab.ready = ab.left <= 0;
    ab.activeT = 0;
    for (const id in this.abilities) this.abilities[id].reset?.(this.game);
    if (this.game.squad.leaderRig) this.game.squad.leaderRig.ability = 0;
  }

  /** Called once per member loss (squad.remove / killMember). true = the loss is cancelled. */
  absorb(reason) {
    const run = this.game.run;
    if (!run || !run.active) return false;
    if (this.invulnT > 0 && !NO_ABSORB_INVULN.has(reason)) return true;
    if (GUARDED.has(reason) && this.guard >= 1) {
      this.guard -= 1;
      const L = this.game.squad.leader;
      this.pos.x = L.x; this.pos.z = L.z;
      if (this.game.events.wants('hero:guard')) this.game.events.emit('hero:guard', { left: this.guard, max: this.guardMax, pos: this.pos });
      return true;
    }
    return false;
  }

  refillGuard() { this.guard = this.guardMax; this.guardT = 0; }

  update(dt) {
    const run = this.game.run;
    if (!run || !run.active) return;
    // Guard refills 1 point every GUARD_REGEN s
    if (this.guard < this.guardMax) {
      this.guardT += dt;
      if (this.guardT >= GUARD_REGEN) { this.guardT -= GUARD_REGEN; this.guard = Math.min(this.guardMax, this.guard + 1); }
    } else this.guardT = 0;
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
    const ab = this.ability;
    if (!ab.ready) {
      ab.left = Math.max(0, ab.left - dt);
      if (ab.left <= 0) { ab.ready = true; this.game.events.emit('ability:ready', { hero: this.id, ability: ab.id }); }
    }
    if (ab.activeT > 0) {
      ab.activeT = Math.max(0, ab.activeT - dt);
      if (ab.activeT <= 0) this.game.events.emit('ability:end', { hero: this.id, ability: ab.id });
    }
    const impl = this.abilities[ab.id];
    if (impl && impl.update) impl.update(dt, this.game, this);
    const rig = this.game.squad.leaderRig;
    if (rig) { const dur = this.def.ability.duration || 0.6; rig.ability = ab.activeT > 0 ? 1 - ab.activeT / dur : 0; }
  }

  /** Uses the ability when ready and the run is live. Returns true when it fired. */
  useAbility() {
    const game = this.game, run = game.run, ab = this.ability;
    if (!run || !run.active || !ab.ready || game.state !== 'playing') return false;
    const impl = this.abilities[ab.id];
    if (!impl || !impl.use(game, this, game.weapons.mk)) return false;
    ab.ready = false;
    ab.left = ab.cd;
    this.used++;
    const L = game.squad.leader;
    const duration = this.def.ability.duration || 0;
    ab.activeT = duration;
    game.events.emit('ability:use', { hero: this.id, ability: ab.id, pos: { x: L.x, y: 1, z: L.z } });
    game.events.emit('ability:start', { hero: this.id, ability: ab.id, duration });
    return true;
  }

  state() {
    const ab = this.ability;
    return { hero: this.id, ability: ab.id, ready: ab.ready, left: Math.round(ab.left * 100) / 100, cd: ab.cd, activeT: Math.round(ab.activeT * 100) / 100, guard: this.guard, guardMax: this.guardMax };
  }
}
