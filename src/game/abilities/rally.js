// Pip - Rally Call: instantly adds clamp(round(frac * count), min, max) raiders and refills Guard.
// (FOUNDATION delivers the working gameplay; the HEROES builder owns this file and adds the presentation.)
import { heroDef } from '../../data/heroes.js';

export const rally = {
  use(game, hero) {
    const a = heroDef('pip').ability;
    const n = Math.max(a.min, Math.min(a.max, Math.round(a.frac * game.squad.count)));
    game.squad.add(n, 'ability');
    hero.refillGuard();
    return true;
  },
  update() {},
  reset() {},
};
