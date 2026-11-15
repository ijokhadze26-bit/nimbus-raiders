// Gearworks behaviour. FOUNDATION STUB (owned by the WEAPONS builder): fires the legacy ladder so the game
// still plays like the shipped build. The final version extends WeaponBehaviour (./base.js) directly and
// implements SPEC2 §2 for 'gearworks'; it must keep this file's export name.
import { LegacyWeapon } from './legacy.js';
import { buildGearTurret } from '../../models/weapons/gearturret.js';

export class Gearworks extends LegacyWeapon {
  init() {
    super.init();
    this.game.helpers.registerVisual('gearturret', buildGearTurret);
  }
}
