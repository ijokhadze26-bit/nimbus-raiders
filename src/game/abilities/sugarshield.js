// Bonbon - Sugar Shield (SPEC2 §3.4). The squad is invincible for `duration` s: heroes.invulnT makes
// heroes.absorb cancel every member loss except gap falls, gate maths, the run start and abilities, and
// game.shielded() makes touching enemies pop (as with the shield power-up). The candy bubble is drawn by
// fx/heroes.js while invulnT > 0.
import { heroDef } from '../../data/heroes.js';

export const sugarshield = {
  use(game, hero) {
    const a = heroDef('bonbon').ability;
    hero.invulnT = Math.max(hero.invulnT, a.duration);
    return true;
  },
  update() {},
  reset() {},
};
