// Pip - Rally Call (SPEC2 §3.1): instantly adds clamp(round(frac * count), min, max) raiders and refills Guard.
// The new raiders pop in through squad.add (the same path as gates); fx/heroes.js draws the ring pulse and
// the sparkles on them from `last`.
import { heroDef } from '../../data/heroes.js';

export const rally = {
  last: null,       // { added, from } (tests / fx)

  use(game, hero) {
    const a = heroDef('pip').ability;
    const from = game.squad.count;
    const n = Math.max(a.min, Math.min(a.max, Math.round(a.frac * from)));
    game.squad.add(n, 'ability');
    hero.refillGuard();
    this.last = { added: game.squad.count - from, from };
    return true;
  },
  update() {},
  reset() { this.last = null; },
};
