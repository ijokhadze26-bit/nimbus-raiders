// Bolt - Deploy Fortress. FOUNDATION STUB (owned by the HEROES builder): the ability is accepted (cooldown, events, pose)
// but has no effect yet. Numbers: data/heroes.js heroDef('bolt').ability; SPEC2 §3.
import { buildFortress } from '../../models/fortress.js';

export const fortress = {
  use() { return true; },
  update() {},
  reset(game) { if (game && game.helpers && !game.helpers.builders.has('fortress')) game.helpers.registerVisual('fortress', buildFortress); },
};
