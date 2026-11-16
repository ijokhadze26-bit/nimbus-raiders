// Which world a run belongs to (update 3): drives the enemy skin (hordeview), run music (audio/bindings), the
// world intro banner (hud) and the finish arch colours. Order: def.world (1..5) -> a campaign level's id ->
// the theme's world ('forgeNight' -> forge) -> Sky Bridge (endless, practice, boss tests, custom runs).
import { WORLDS, WORLD_BY_KEY, TOTAL_LEVELS, worldOf } from '../data/worlds.js';
import { themeWorld } from '../data/themes.js';

export function worldFor(def, mode) {
  if (def && def.world >= 1 && WORLDS[def.world - 1]) return WORLDS[def.world - 1];
  if (def && mode === 'level' && def.id >= 1 && def.id <= TOTAL_LEVELS) return worldOf(def.id);
  return WORLD_BY_KEY[themeWorld(def && def.theme)] || WORLDS[0];
}

/** True for a campaign level start (the world intro banner shows). */
export function isCampaign(def, mode) {
  return mode === 'level' && !!def && def.id >= 1 && def.id <= TOTAL_LEVELS;
}
