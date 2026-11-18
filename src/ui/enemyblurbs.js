// One-line "what is it" text for every enemy and boss a STRONG / WEAK chip can name (Armory, Heroes, Compare:
// tap a chip -> this line). Enemy lines prefer the shared data map src/data/enemyinfo.js (ENEMY_INFO
// { id: { blurb, tip } }, owned by the README builder) when that file exists; the lines below are the fallback.
// Boss lines are built from data: the subtitle (data/bosses.js) + the levels it is fought on, with the world
// skin name (CANDY QUEEN, FROSTHORN, ...) from bossLook, so they can never disagree with the levels.
import { ENEMIES } from '../data/enemies.js';
import { BOSSES, bossLook } from '../data/bosses.js';
import { LEVELS } from '../data/levels.js';

// optional shared map (Vite returns {} when the file is not there, so either merge order works)
const shared = import.meta.glob('../data/enemyinfo.js', { eager: true });
const INFO = Object.values(shared)[0]?.ENEMY_INFO || {};

const ENEMY_LINES = {
  grunt: 'The basic goo soldier. Comes in big floods.',
  runner: 'Fast and fragile: rushes straight at the squad.',
  tank: 'A slow armoured wall with lots of health. Crushes raiders when it reaches you.',
  shield: 'Carries a big shield that soaks up 6 hits.',
  bomber: 'Explodes when it reaches the squad, taking up to 4 raiders with it.',
  blaster: 'Swells up and bursts when killed: raiders near it go too. Kill it far away.',
  healer: 'Hangs at the back and heals the enemies around it.',
  spawner: 'A slow, tough sack that keeps popping out Murklings until you destroy it.',
  sniper: 'Stops far ahead and lobs goo: step out of the marked circle.',
  flyer: 'Flies over gates, gaps and hazards, then dives into the squad.',
};

const sentence = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "Level 10 boss · Magma Grawlstone, level 15 mini-boss" from the level list. */
function bossWhere(type) {
  const parts = [];
  for (const lv of LEVELS) {
    if (!lv.boss || lv.boss.type !== type) continue;
    const look = bossLook(lv.boss), def = BOSSES[type];
    const named = look.name !== def.name ? `${titleCase(look.name)}, ` : '';
    parts.push(`${named}level ${lv.id} ${lv.kind === 'mini' || lv.boss.mini ? 'mini-boss' : 'boss'}`);
  }
  return parts.join(' · ');
}

const cache = new Map();
/** One plain line for an enemy or boss type id ('' for unknown ids). */
export function targetBlurb(id) {
  if (cache.has(id)) return cache.get(id);
  let line = '';
  if (ENEMIES[id]) line = (INFO[id] && INFO[id].blurb) || ENEMY_LINES[id] || '';
  else if (BOSSES[id]) {
    const where = bossWhere(id);
    line = `${sentence(BOSSES[id].subtitle)}.${where ? ' ' + where.charAt(0).toUpperCase() + where.slice(1) + '.' : ''}`;
  }
  cache.set(id, line);
  return line;
}

export { ENEMY_LINES };
