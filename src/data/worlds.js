// Update 3: the campaign is 5 worlds of 10 levels (data only). Levels 1-15 are the hand-made ones in levels.js
// (L1-10 Sky Bridge, L11-15 open the Volcanic Forge); 16-50 come from levelgen.js. Boss levels end every world,
// each world has one mini-boss level halfway, every other level ends with a FINAL RUSH and a finish arch.
// Worlds unlock by beating the previous world's boss (progression is linear, so that is unlockedLevel >= first).

export const WORLDS = [
  { id: 1, key: 'sky', name: 'SKY BRIDGE', short: 'Sky', first: 1, last: 10, boss: 10, minis: [5],
    themes: ['noon', 'dawn', 'sunset', 'dusk', 'storm', 'night'], music: 'run', skin: 'sky', color: '#59c1ff',
    blurb: 'Bridges in the clouds. Learn gates, barrels and the horde.', hazards: ['blade', 'gap'] },
  { id: 2, key: 'forge', name: 'VOLCANIC FORGE', short: 'Forge', first: 11, last: 20, boss: 20, minis: [15],
    themes: ['forge', 'forgeNight'], music: 'forge', skin: 'forge', color: '#ff6a2b',
    blurb: 'Lava rivers, falling embers, cracking tiles and fire geysers.', hazards: ['lava', 'ember', 'crack', 'geyser'] },
  { id: 3, key: 'frost', name: 'FROZEN PEAKS', short: 'Frost', first: 21, last: 30, boss: 30, minis: [25],
    themes: ['frost', 'frostDusk'], music: 'frost', skin: 'frost', color: '#8fe3ff',
    blurb: 'Slippery ice, snowstorms, falling icicles and avalanches.', hazards: ['ice', 'snow', 'icicle', 'avalanche'] },
  { id: 4, key: 'candy', name: 'CANDY KINGDOM', short: 'Candy', first: 31, last: 40, boss: 40, minis: [35],
    themes: ['candy', 'candyDusk'], music: 'candy', skin: 'candy', color: '#ff7ad1',
    blurb: 'Jelly pads, sticky syrup, rolling gumballs and chocolate falls.', hazards: ['jelly', 'syrup', 'gumball', 'choco'] },
  { id: 5, key: 'citadel', name: 'STORM CITADEL', short: 'Citadel', first: 41, last: 50, boss: 50, minis: [45],
    themes: ['citadel', 'citadelNight'], music: 'citadel', skin: 'citadel', color: '#9a7dff',
    blurb: 'Moving platforms, lightning, wind gusts and falling bridges.', hazards: ['platform', 'lightning', 'wind', 'collapse'] },
];

export const WORLD_COUNT = WORLDS.length;
export const LEVELS_PER_WORLD = 10;
export const TOTAL_LEVELS = WORLD_COUNT * LEVELS_PER_WORLD;
export const WORLD_BY_KEY = Object.fromEntries(WORLDS.map((w) => [w.key, w]));

/** World of a campaign level id (1..50); ids outside clamp to the first / last world. */
export function worldOf(levelId) {
  const i = Math.max(0, Math.min(WORLD_COUNT - 1, Math.floor((Math.max(1, levelId | 0) - 1) / LEVELS_PER_WORLD)));
  return WORLDS[i];
}

/** 'boss' | 'mini' | 'intro' (first level of worlds 3-5: a short level that teaches the hazard) | 'normal'. */
export function levelKind(levelId) {
  const w = worldOf(levelId);
  if (levelId === w.boss) return 'boss';
  if (w.minis.includes(levelId)) return 'mini';
  if (levelId === w.first && w.id >= 2) return 'intro';
  return 'normal';
}

/** World unlocked = its first level is reachable (the previous world's boss is beaten). */
export function isWorldUnlocked(save, worldId) {
  const w = WORLDS[worldId - 1];
  return !!w && ((save && save.unlockedLevel) || 1) >= w.first;
}

/** Index of a level inside its world, 0..9. */
export const indexInWorld = (levelId) => (levelId - 1) % LEVELS_PER_WORLD;
