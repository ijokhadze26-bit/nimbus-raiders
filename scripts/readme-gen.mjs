// README "Weapons & Heroes" section generator (SPEC2 §7.5 / §7.7). Every name, blurb, number, strong / weak entry
// and unlock comes from the data files (src/data/weapons.js, heroes.js, via src/ui/infofmt.js), never typed here,
// so the README follows the balanced data.
//   node scripts/readme-gen.mjs           prints the section (markers included)
//   node scripts/readme-gen.mjs --write   replaces the <!-- u2:begin --> ... <!-- u2:end --> section in README.md
// The module also runs in the browser (tests/u2/integrate-readme.js imports generateSection() through Vite).
import { WEAPON_DEFS, WEAPON_BY_ID, MAX_MK, mkLabel } from '../src/data/weapons.js';
import { HERO_DEFS, FAVOURITE_BONUS, GUARD_REGEN } from '../src/data/heroes.js';
import { targetName, speedLine, num } from '../src/ui/infofmt.js';

export const BEGIN = '<!-- u2:begin -->';
export const END = '<!-- u2:end -->';

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const names = (list) => (list || []).map((t) => targetName(t.id)).join(', ') || 'none';
const unlockText = (u) => (!u || u.start ? 'Free from the start' : `Reach level ${u.level}, or buy for ${u.coins.toLocaleString('en-US')} coins`);
const pct = (x) => Math.round(x * 100);

/** The README section between (and including) the markers, as one string ending in a newline. */
export function generateSection() {
  const L = [BEGIN, '## Weapons & Heroes', ''];
  L.push(`Pick a hero and a weapon before every level. Every weapon has its own look, sound, bullets and special trick, `
    + `and five power levels, ${mkLabel(1)} to ${mkLabel(MAX_MK)}: breaking weapon barrels during a run raises it, and every level `
    + 'looks bigger and flashier. Strong and weak matchups matter, and some levels and bosses favour certain weapons.', '');
  L.push('<p align="center">',
    '  <img src="docs/armory.png" width="280" alt="The Armory screen: a weapon on a spinning stand, its description, power level and stat bars">',
    '  <img src="docs/heroes.png" width="280" alt="The Heroes screen: a hero running in place, its description and stat bars">',
    '</p>', '');
  L.push('### Weapons', '');
  L.push('| Weapon | Type | What it does | Strong against | Weak against | How to get it |');
  L.push('|---|---|---|---|---|---|');
  for (const w of WEAPON_DEFS) {
    L.push(`| **${cell(w.name)}** | ${cell(w.tag)} | ${cell(w.blurb)} ${cell(w.special)} | ${cell(names(w.strong))} | ${cell(names(w.weak))} | ${cell(unlockText(w.unlock))} |`);
  }
  L.push('', '### Heroes', '');
  L.push('| Hero | What they do | Passive bonus | Special ability | Health and dodge | Favourite weapon | Strong against | Weak against | How to get them |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const h of HERO_DEFS) {
    const fav = WEAPON_BY_ID[h.favourite];
    const ab = `**${cell(h.ability.name)}:** ${cell(h.ability.text)} Recharges in ${num(h.ability.cd)} s.`;
    const body = `Health ${h.health} (saves ${h.health} raiders from enemy hits). ${cell(speedLine(h))}.`;
    L.push(`| **${cell(h.name)}**, ${cell(h.title)} | ${cell(h.blurb)} | **${cell(h.passive.name)}:** ${cell(h.passive.text)} | ${ab} | ${body} | `
      + `${fav ? cell(fav.name) : 'none'} | ${cell(names(h.strong))} | ${cell(names(h.weak))} | ${cell(unlockText(h.unlock))} |`);
  }
  L.push('', `Every hero does ${pct(FAVOURITE_BONUS)}% more damage with their favourite weapon. Health is Guard: each point saves `
    + `one raider from an enemy touch or a Fizzbomb blast, and one point comes back every ${num(GUARD_REGEN)} s. Speed is how fast `
    + 'the hero dodges side to side; the run speed is the same for everyone, so gates and barrels stay fair.', '');
  L.push(END);
  return L.join('\n') + '\n';
}

/** README text with the marker section replaced (appended before "## Run it" when the markers are missing). */
export function replaceSection(readme, section = generateSection()) {
  const a = readme.indexOf(BEGIN), b = readme.indexOf(END);
  if (a >= 0 && b > a) {
    let end = b + END.length;
    if (readme[end] === '\n') end++;
    return readme.slice(0, a) + section + readme.slice(end);
  }
  const at = readme.indexOf('## Run it');
  return at >= 0 ? readme.slice(0, at) + section + '\n' + readme.slice(at) : readme + '\n' + section;
}

/** The marker section currently in a README ('' when missing). */
export function currentSection(readme) {
  const a = readme.indexOf(BEGIN), b = readme.indexOf(END);
  if (a < 0 || b < a) return '';
  let end = b + END.length;
  if (readme[end] === '\n') end++;
  return readme.slice(a, end);
}

// ---- CLI (Node only) ----
const proc = globalThis.process;
if (proc && proc.argv && proc.argv[1] && import.meta.url.endsWith(proc.argv[1].split('/').pop())) {
  const fsName = 'node:fs', pathName = 'node:path', urlName = 'node:url';
  const fs = await import(/* @vite-ignore */ fsName);
  const path = await import(/* @vite-ignore */ pathName);
  const { fileURLToPath } = await import(/* @vite-ignore */ urlName);
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'README.md');
  if (proc.argv.includes('--write')) {
    const before = fs.readFileSync(file, 'utf8');
    const after = replaceSection(before);
    fs.writeFileSync(file, after);
    console.log(before === after ? 'README.md already up to date' : 'README.md section updated');
  } else proc.stdout.write(generateSection());
}
