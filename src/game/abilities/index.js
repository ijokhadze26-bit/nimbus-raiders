// Ability registry: ability id (data/heroes.js def.ability.id) -> { use(game, hero, mk) -> bool, update?(dt, game, hero), reset?(game) }.
// Numbers come from data/heroes.js; damage goes through horde.applyDamage / boss.damageTyped / barrels.damage
// (shared budget, boss caps: SPEC2 §3). Friendly markers never go into game.telegraph.
import { rally } from './rally.js';
import { meteor } from './meteor.js';
import { whiteout } from './whiteout.js';
import { sugarshield } from './sugarshield.js';
import { fortress } from './fortress.js';
import { shockwave } from './shockwave.js';

export const ABILITIES = { rally, meteor, whiteout, sugarshield, fortress, shockwave };
