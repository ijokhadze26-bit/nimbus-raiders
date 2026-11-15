// Debug helper: debug.bossTest(type, opts) starts a throwaway arena run (mode 'test', no save progress) that
// reaches the given boss within a few seconds. opts: { weapon: id | Mk number (old form), mk, hero, squad,
// hp, tier (boss tier), theme, arrive, wait }. Loadout defaults to the current one (game.loadout).
import { bossDef } from '../../data/bosses.js';
import { MAX_MK } from '../../data/weapons.js';

const THEMES = { grawlstone: 'noon', oculon: 'sunset', mothermurk: 'dusk', ironhorn: 'dawn', tempestking: 'storm' };

export function bossTest(game, type, o = {}) {
  const d = bossDef(type);
  const def = {
    id: 0, name: 'Boss Test', theme: o.theme || THEMES[type] || 'noon', length: 14, speed: 9,
    stars: [10, 25], reward: 0, boss: { type, hp: o.hp || d.hp, tier: o.tier || 1 }, events: [],
  };
  const weapon = typeof o.weapon === 'string' ? o.weapon : game.loadout.weapon;
  const mk = o.mk ?? (typeof o.weapon === 'number' ? o.weapon : 1);
  game.beginRun(def, 'test', 1, { hero: o.hero || game.loadout.hero, weapon, mk: Math.max(1, Math.min(MAX_MK, mk | 0)) });
  if (o.squad > game.squad.count) game.squad.add(o.squad - game.squad.count, 'barrel');
  // run up to the arena and through the entrance (logic only; caller renders)
  if (o.arrive !== false) game.debug.simulate(o.wait ?? 1.6);
  return game.debug.state();
}
