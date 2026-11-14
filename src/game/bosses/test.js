// Debug helper: debug.bossTest(type, opts) starts a throwaway arena run (mode 'test', no save progress)
// that reaches the given boss within a few seconds, with an optional squad size / weapon tier.
import { bossDef } from '../../data/bosses.js';
import { MAX_TIER } from '../../data/weapons.js';

const THEMES = { grawlstone: 'noon', oculon: 'sunset', mothermurk: 'dusk', ironhorn: 'dawn', tempestking: 'storm' };

export function bossTest(game, type, o = {}) {
  const d = bossDef(type);
  const def = {
    id: 0, name: 'Boss Test', theme: o.theme || THEMES[type] || 'noon', length: 14, speed: 9,
    stars: [10, 25], reward: 0, boss: { type, hp: o.hp || d.hp, tier: o.tier || 1 }, events: [],
  };
  game.beginRun(def, 'test');
  if (o.squad > 1) game.squad.add(o.squad - 1, 'barrel');
  if (o.weapon > 1) game.weapons.setTier(Math.min(MAX_TIER, o.weapon));
  // run up to the arena and through the entrance (logic only; caller renders)
  if (o.arrive !== false) game.debug.simulate(o.wait ?? 1.6);
  return game.debug.state();
}
