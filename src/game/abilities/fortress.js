// Bolt - Deploy Fortress (SPEC2 §3.5). A big turret drops beside the squad (opposite side of the road from the
// leader, `back` u behind it) and rides with it for `life` s (x1.6 with Bolt's Overclock, applied by helpers),
// firing `rate` piercing shells per second (x1.25 Overclock). Shell damage is squad-scaled at the moment of
// use: k * max(count, minCount) * MKREF[mk] * shop dmgMul / rate, element neutral, cause 'ability'.
import { heroDef } from '../../data/heroes.js';
import { buildFortress } from '../../models/fortress.js';
import { budgetFor, clampRoad } from './common.js';

function ensureVisual(game) {
  const H = game && game.helpers;
  if (H && !H.builders.has('fortress')) H.registerVisual('fortress', () => buildFortress({ quality: () => game.engine.quality }));
}

export const fortress = {
  last: null,       // the live road entry (tests)

  use(game, hero, mk) {
    ensureVisual(game);
    const a = heroDef('bolt').ability;
    const L = game.squad.leader;
    const side = -Math.sign(L.x || 1);
    const dmg = budgetFor(game, a.k, mk, Math.max(game.squad.count, a.minCount)) / a.rate;
    this.last = game.helpers.addRoad('fortress', clampRoad(L.x + side * a.side), L.z + a.back, {
      follow: true, dx: side * a.side, dz: a.back, life: a.life, rate: a.rate, dmg, pierce: a.pierce,
      el: 'neutral', cause: 'ability', style: 'shell', scale: a.shellScale, max: 1,
    });
    return true;
  },
  update() {},
  reset(game) { ensureVisual(game); this.last = null; },
};
