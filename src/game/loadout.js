// Loadout (SPEC2 §6.1): the hero + weapon the next run uses (game.loadout {hero, weapon}) and every look that
// follows from it - the leader rig (Pip wears the equipped outfit), the raider palette + hero tell, and the gun
// paint on the squad's and the leader's guns. Extracted from game.js (was applySkins / tierColor).
// The saved selection (save.heroes.selected / save.arsenal.selected) is copied in whenever it changes; debug /
// tests may override the runtime loadout without touching the save (set()).
import * as THREE from 'three';
import { HERO_DEF_BY_ID, DEFAULT_HERO } from '../data/heroes.js';
import { WEAPON_BY_ID, DEFAULT_WEAPON } from '../data/weapons.js';
import { heroLook, heroRaiderColors, isPrism, paintColor, prismColor } from './skins.js';

const MK_GLOW = [0.25, 0.3, 0.4, 0.45, 0.6]; // gun emissive per Mk (SPEC2 §2: III glows, V 0.6)
const _pc = new THREE.Color();

export class Loadout {
  constructor(game) {
    this.game = game;
    this.hero = DEFAULT_HERO;
    this.weapon = DEFAULT_WEAPON;
    this.saved = { hero: null, weapon: null };
    this.lookHero = null;
    this.outfit = 'classic';
    this.paint = 'factory';
    this.payload = { hero: this.hero, weapon: this.weapon };
  }

  /** Copies the saved selection in when it changed (boot, save:changed). */
  syncFromSave() {
    const d = this.game.save && this.game.save.data;
    if (!d) return;
    const hero = d.heroes?.selected || DEFAULT_HERO, weapon = d.arsenal?.selected || DEFAULT_WEAPON;
    if (hero !== this.saved.hero || weapon !== this.saved.weapon) {
      this.saved.hero = hero; this.saved.weapon = weapon;
      this.set(hero, weapon);
    } else this.applyLook();
  }

  /** Runtime loadout (no save write). Unknown ids fall back to the starters ('ref' is allowed for tests). */
  set(hero, weapon) {
    this.hero = HERO_DEF_BY_ID[hero] ? hero : DEFAULT_HERO;
    this.weapon = WEAPON_BY_ID[weapon] || weapon === 'ref' ? weapon : DEFAULT_WEAPON;
    this.payload.hero = this.hero; this.payload.weapon = this.weapon;
    this.game.events.emit('loadout:change', this.payload);
    if (!this.game.run) this.applyLook();
    return { hero: this.hero, weapon: this.weapon };
  }

  /** Leader rig + raider palette for `heroId` (default: the run's hero, else the loadout's) + the gun paint. */
  applyLook(heroId) {
    const g = this.game, sq = g.squad;
    const run = g.run;
    const hero = heroId || (run && run.hero) || this.hero;
    const sk = g.save?.data?.skins;
    this.outfit = sk?.hero || 'classic';
    this.paint = sk?.weapon || 'factory';
    this.lookHero = hero;
    if (hero === 'pip') {
      const look = heroLook(this.outfit);
      sq.leaderRig.setHero('pip', look.id, look.pip ? { ...look.pip, glow: look.glow } : null);
      sq.setRaiderLook('pip:' + look.id, look.raider || undefined, null);
    } else {
      const def = HERO_DEF_BY_ID[hero];
      sq.leaderRig.setHero(hero, '-');
      sq.setRaiderLook(hero, heroRaiderColors(def.raider), def.raiderTell);
    }
    this.applyGun(g.weapons.id, g.weapons.mk);
  }

  /** Gun model + paint colour for weapon / Mk on the squad and the leader. */
  applyGun(weaponId, mk) {
    const sq = this.game.squad;
    sq.setGun(weaponId, mk);
    sq.gunGlowBase = MK_GLOW[mk - 1] ?? 0.25;
    if (!(this.game.powers && this.game.powers.has('rapid'))) sq.gunMat.emissiveIntensity = sq.gunGlowBase;
    sq.setGunColor(paintColor(this.paint, weaponId, mk));
  }

  /** Main gun colour of the current weapon at mk (HUD / fx accents keep the weapon's own colours instead). */
  gunColor(mk = this.game.weapons.mk) { return paintColor(this.paint, this.game.weapons.id, mk); }

  /** Per frame: the Prism paint cycles the gun hue. */
  sync(time) {
    if (isPrism(this.paint)) this.game.squad.setGunColor(prismColor(_pc, time, this.game.weapons.mk));
  }
}
