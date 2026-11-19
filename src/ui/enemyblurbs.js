// One-line "what is it" text for every enemy and boss a STRONG / WEAK chip can name (Armory, Heroes, Compare:
// tap a chip -> this line). Enemy lines come from the shared data map src/data/enemyinfo.js (ENEMY_INFO
// { id: { blurb, tip } }), the same text the README "Worlds and Bosses" section is generated from, so the
// game and the README can never disagree.
// Boss lines are built from data: the subtitle (data/bosses.js) + the levels it is fought on, with the world
// skin name (CANDY QUEEN, FROSTHORN, ...) from bossLook, so they can never disagree with the levels.
import { ENEMIES } from '../data/enemies.js';
import { BOSSES, bossLook } from '../data/bosses.js';
import { LEVELS } from '../data/levels.js';
import { ENEMY_INFO } from '../data/enemyinfo.js';

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
  if (ENEMIES[id]) line = (ENEMY_INFO[id] && ENEMY_INFO[id].blurb) || '';
  else if (BOSSES[id]) {
    const where = bossWhere(id);
    line = `${sentence(BOSSES[id].subtitle)}.${where ? ' ' + where.charAt(0).toUpperCase() + where.slice(1) + '.' : ''}`;
  }
  cache.set(id, line);
  return line;
}

