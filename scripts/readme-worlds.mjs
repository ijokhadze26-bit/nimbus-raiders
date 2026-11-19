// README "Worlds and Bosses" section (update 3 stage 6), the second generated section of scripts/readme-gen.mjs
// (markers <!-- u3:begin --> / <!-- u3:end -->). Built from the game data only: worlds (src/data/worlds.js),
// the level list (src/data/levels.js: which boss is on which level, which enemies a level's hordes bring),
// bosses (src/data/bosses.js: names, skins, phases, rage, safe spot, favoured weapons), hazards
// (src/data/hazardplan.js HINTS) and the plain-English text in src/data/enemyinfo.js. Nothing is typed here
// except the sentence glue, so a data change shows up as a README diff (tests/u2/integrate-readme.js).
import { WORLDS, levelKind } from '../src/data/worlds.js';
import { LEVELS } from '../src/data/levels.js';
import { ENEMIES, ENEMY_TYPES } from '../src/data/enemies.js';
import { BOSSES, bossLook, RAGE, SAFE_SPOT } from '../src/data/bosses.js';
import { HINTS } from '../src/data/hazardplan.js';
import { WEAPON_BY_ID } from '../src/data/weapons.js';
import { ENEMY_INFO, BOSS_INFO, HAZARD_INFO } from '../src/data/enemyinfo.js';

export const BEGIN3 = '<!-- u3:begin -->';
export const END3 = '<!-- u3:end -->';

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const pct = (x) => `${Math.round(x * 100)}%`;
const SMALL = new Set(['of', 'the', 'and']);
/** 'THE MOSSY COLOSSUS' -> 'The Mossy Colossus' */
const titleCase = (s) => s.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
/** 'FALLING EMBERS' -> 'Falling embers' */
const sentenceCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const worldName = (w) => titleCase(w.name);
const listText = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** Enemy types a horde event really spawns (the same cumulative rounding as game/horde.js), + 'elite'. */
function hordeTypes(ev) {
  const mix = ev.mix || { grunt: 1 }, count = Math.max(1, ev.count | 0);
  const keys = Object.keys(mix).filter((k) => ENEMIES[k]);
  const total = keys.reduce((s, k) => s + mix[k], 0) || 1;
  const out = [];
  let acc = 0, placed = 0;
  for (const k of keys) {
    acc += mix[k] / total;
    const n = Math.round(acc * count) - placed;
    placed += Math.max(0, n);
    if (n > 0) out.push(k);
  }
  if ((ev.elite || 0) * count >= 1 || (ev.eliteTypes && ev.eliteTypes.length)) out.push('elite');
  return out;
}

/** { type: first campaign level id whose hordes bring it } for every enemy type and 'elite'. */
export function firstSeen() {
  const first = {};
  for (const def of LEVELS) {
    for (const ev of def.events || []) {
      if (ev.type !== 'horde') continue;
      for (const t of hordeTypes(ev)) if (!(t in first)) first[t] = def.id;
    }
  }
  return first;
}

const enemyName = (t) => (t === 'elite' ? 'Elite enemies' : ENEMIES[t].name);

/** One hazard as a bullet: name, what it is, the in-game tip. */
function hazardLine(kind) {
  const info = HAZARD_INFO[kind] || {};
  const hint = HINTS[kind] || '';
  const bang = hint.indexOf('!');
  const name = info.name || (bang > 0 ? hint.slice(0, bang) : kind.toUpperCase());
  const tip = info.tip || (bang > 0 ? hint.slice(bang + 1).trim() : '');
  return `  - **${sentenceCase(name)}:** ${info.what || ''}${tip ? ` ${tip}.` : ''}`.replace(/\s+$/, '');
}

/** The boss fight on a level as a bullet (mini-boss or world boss). */
function bossLine(def) {
  const cfg = def.boss, look = bossLook(cfg), bdef = BOSSES[look.type];
  const info = BOSS_INFO[look.type + ':' + look.skin] || BOSS_INFO[look.type] || {};
  const label = cfg.mini ? 'Mini-boss' : 'Boss';
  const parts = [`- **${label}, level ${def.id}: ${look.name}**, ${titleCase(look.subtitle)}. ${info.does || ''}`.trim()];
  const phases = bdef.phases || [0.5];
  phases.forEach((at, i) => {
    const text = info['phase' + (i + 2)];
    if (!text) return;
    const step = cfg.mini ? '' : ' (after a safe-spot step)';
    parts.push(`Below ${pct(at)} health${step}, ${text}.`);
  });
  const fav = (bdef.favours || []).map((id) => WEAPON_BY_ID[id] && WEAPON_BY_ID[id].name).filter(Boolean);
  if (fav.length) parts.push(`Good weapons: ${fav.join(', ')}.`);
  return parts.join(' ');
}

/** The README section between (and including) the u3 markers, as one string ending in a newline. */
export function generateWorlds() {
  const first = firstSeen();
  const fights = LEVELS.filter((d) => d.boss);
  const minis = fights.filter((d) => d.boss.mini).length;
  const L = [BEGIN3, '## Worlds and Bosses', ''];
  L.push(`The campaign has ${LEVELS.length} levels in ${WORLDS.length} worlds. Beat a world's boss to open the next world on the `
    + 'world map. Every world has its own look, music, enemy colours and road hazards, a mini-boss halfway and a boss at the end: '
    + `${fights.length} boss fights in all (${fights.length - minis} world bosses, ${minis} mini-bosses). The first level of worlds 2 to `
    + `${WORLDS.length} is a lesson that shows the new hazards one at a time.`, '');
  L.push(`- **Rage:** every boss goes into a rage below ${pct(RAGE.at)} health: it glows red and attacks ${RAGE.cadence}x as often.`);
  L.push('- **Safe spot:** when a world boss changes phase, the whole arena is marked for a big attack except one glowing '
    + `circle. Move the squad into it; Raiders left outside can be lost (up to ${pct(SAFE_SPOT.maxLoss)} of the squad). Mini-bosses skip this step.`);
  L.push('- **Red warning stripes and circles** show where any attack will land, always with time to step out of the way.', '');
  L.push('<p align="center">',
    '  <img src="docs/worldmap.png" width="280" alt="The world map: five themed worlds stacked on one winding road, with boss levels marked by a crowned skull">',
    '  <img src="docs/candy-level.png" width="280" alt="A Candy Kingdom level: a big squad heads for a ramp gate, with the horde and chocolate falls ahead">',
    '</p>', '');
  for (const w of WORLDS) {
    L.push(`### ${w.id}. ${worldName(w)} (levels ${w.first}-${w.last})`, '');
    L.push(w.blurb, '');
    L.push('- **Hazards:**');
    for (const k of w.hazards) L.push(hazardLine(k));
    const intro = LEVELS.find((d) => d.id >= w.first && d.id <= w.last && levelKind(d.id) === 'intro');
    if (intro) L.push(`  - Level ${intro.id} teaches them one at a time.`);
    const fresh = [...ENEMY_TYPES, 'elite'].filter((t) => first[t] >= w.first && first[t] <= w.last);
    L.push(`- **New enemies:** ${fresh.length ? listText(fresh.map(enemyName)) : 'none, but every enemy is back, faster and smarter'}`);
    for (const d of fights) if (d.id >= w.first && d.id <= w.last) L.push(bossLine(d));
    L.push('');
  }
  L.push('### Enemies', '');
  L.push('| Enemy | What it does | Tip | First met |');
  L.push('|---|---|---|---|');
  for (const t of [...ENEMY_TYPES, 'elite']) {
    const info = ENEMY_INFO[t] || {};
    const at = first[t];
    const where = at ? `${worldName(WORLDS.find((w) => at >= w.first && at <= w.last))}, level ${at}` : 'boss fights and modes';
    L.push(`| **${cell(enemyName(t))}** | ${cell(info.blurb || '')} | ${cell(info.tip || '')} | ${cell(where)} |`);
  }
  L.push('', END3);
  return L.join('\n') + '\n';
}
