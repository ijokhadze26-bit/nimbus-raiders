// Weapon id -> behaviour class. 'ref' = the test-only reference weapon (debug.setLoadout(h, 'ref')): the base
// straight bullet at K = 1, element neutral, no special.
import { WeaponBehaviour } from './base.js';
import { Emberstorm } from './emberstorm.js';
import { GlacierLance } from './glacier.js';
import { SugarRush } from './sugarrush.js';
import { SpectraPrism } from './spectra.js';
import { Gearworks } from './gearworks.js';
import { Thunderclap } from './thunderclap.js';
import { VoidSiphon } from './voidsiphon.js';

export class RefWeapon extends WeaponBehaviour {}

export const BEHAVIOURS = {
  emberstorm: Emberstorm, glacier: GlacierLance, sugarrush: SugarRush, spectra: SpectraPrism,
  gearworks: Gearworks, thunderclap: Thunderclap, voidsiphon: VoidSiphon, ref: RefWeapon,
};

export function behaviourClass(id) { return BEHAVIOURS[id] || WeaponBehaviour; }
