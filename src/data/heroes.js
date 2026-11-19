// Heroes (data only, SPEC2 §3). Pip plus five new leaders, each with stats, one passive (data-driven mods
// read by game/heroes.js), one recharging ability (numbers here, logic in game/abilities/<id>.js), a
// favourite weapon (+15% damage with it), a raider palette + helmet "tell", and four named sounds.
// Health = Guard points: each saves one raider from an enemy touch or a Fizzbomb blast; refills 1 every 4 s.
// Speed = sideways dodge speed only (multiplies MOVE.ease); the forward run speed is the same for all.
// The Pip OUTFITS stay in data/skins.js (HERO_SKINS / HERO_BY_ID); never mix the two id lists.

export const GUARD_REGEN = 4;          // s per Guard point
export const FAVOURITE_BONUS = 0.15;   // +15% damage with the favourite weapon (all of its damage)
export const ABILITY_START = { level: 0.5, endless: 0.5, practice: 1 }; // starting charge by mode
/** Info pages compute ability numbers for this squad (no shop upgrades) at the page's Mk. */
export const ABILITY_REF = { raiders: 50, dmgMul: 1, mk: 3 };
// bar scales (hero page): Health = health / 6, Speed = speed / 1.15, Damage = bonus / 0.25, Recharge = 18 / cd
// (18 s = the shortest recharge after balance, so the bars still tell the heroes apart)
export const HERO_BAR_MAX = { health: 6, speed: 1.15, bonus: 0.25, recharge: 18 };

export const HERO_DEFS = [
  {
    id: 'pip', name: 'Pip', title: 'Sky Scout', role: 'Balanced', tag: 'BALANCED',
    blurb: 'A cheerful all-rounder. Steady aim and a whistle that calls in extra raiders.',
    special: 'Good at everything: shoots 10% faster with every weapon.',
    health: 3, speed: 1.0, dmgBonus: 0, fireBonus: 0,
    passive: { name: 'Steady Aim', text: '+10% fire rate with every weapon.', mods: { rateMul: 1.1 } },
    ability: { id: 'rally', name: 'Rally Call', cd: 20, duration: 0.6, frac: 0.2, min: 5, max: 40,
      text: 'Instantly adds 20% more raiders (at least 5, at most 40) and refills Guard.' },
    favourite: 'thunderclap', unlock: { level: 1, coins: 0, start: true },
    strong: [{ id: 'grunt', why: 'Steady Aim: +10% fire rate' }, { id: 'runner', why: 'Rally Call refills losses' }],
    weak: [{ id: 'tempestking', why: 'its favourite, Thunderclap, is weak against the storm lord' }],
    raider: null, raiderTell: null, scale: 1,
    look: { suit: '#2f6ff2', helmet: '#f8fbff', visor: '#1fd0c4', scarf: '#ff8a2b' },
    run: { freq: 11.5, bob: 0.07, lean: -0.14 },
    sfx: { ability: 'hero_pip_ability', ready: 'hero_pip_ready', guard: 'hero_pip_guard', select: 'hero_pip_select' },
  },
  {
    id: 'cinder', name: 'Cinder', title: 'Fire Brawler', role: 'Brawler', tag: 'FIRE',
    blurb: 'A stocky fire brawler. Hotter flames and a meteor that smashes a big area ahead.',
    special: 'Emberstorm and Meteor Drop hit 25% harder, and burns finish 20% sooner.',
    health: 4, speed: 1.05, dmgBonus: 0, fireBonus: 0.25,
    passive: { name: 'Hot Hands', text: 'Emberstorm and Meteor Drop deal +25% damage; every burn finishes 20% sooner.',
      mods: { fireMul: 1.25, burnTimeMul: 0.8 } },
    ability: { id: 'meteor', name: 'Meteor Drop', cd: 18, duration: 0.7, ahead: 18, fall: 0.7, radius: 5, k: 1.5, bossCap: 0.06,
      burnFrac: 0.25, burnTime: 3, el: 'emberstorm',
      text: 'A flaming rock smashes a 5 m circle ahead, then the ground burns.' },
    favourite: 'emberstorm', unlock: { level: 4, coins: 700 },
    strong: [{ id: 'grunt', why: 'Meteor Drop smashes packs' }, { id: 'bomber', why: '+25% fire damage' }, { id: 'blaster', why: 'hot flames pop Boomlings before they get close' }, { id: 'glacius', why: '+25% fire damage melts the frost giant' }],
    weak: [{ id: 'shield', why: 'shields block flames' }, { id: 'sniper', why: 'flames cannot reach Spitlings far away' }, { id: 'oculon', why: 'dashes out of Meteor Drop' }, { id: 'tempestking', why: 'its favourite, Emberstorm, is weak against the storm lord' }],
    raider: { body: '#3a2420', helmet: '#d8321e', visor: '#ffb21f', pack: '#ff7a1f' }, raiderTell: 'crest', scale: 1,
    look: { vest: '#d8321e', suit: '#3a2420', knuckle: '#ff7a1f', hairA: '#ff7a1f', hairB: '#ffd34d', skin: '#c98a5e' },
    run: { freq: 12.5, bob: 0.09, lean: -0.24 },
    sfx: { ability: 'hero_cinder_ability', ready: 'hero_cinder_ready', guard: 'hero_cinder_guard', select: 'hero_cinder_select' },
  },
  {
    id: 'rime', name: 'Rime', title: 'Ice Sniper', role: 'Sniper', tag: 'ICE',
    blurb: 'A calm ice sniper. Shoots further, pierces more, and can freeze the whole screen.',
    special: '+20% range with every weapon, and +1 pierce for Glacier Lance, Emberstorm and Spectra Prism.',
    health: 2, speed: 0.9, dmgBonus: 0.1, fireBonus: 0,
    passive: { name: 'Long Sight', text: '+20% range for every weapon; +1 pierce for Glacier Lance, Emberstorm and Spectra Prism.',
      mods: { dmgMul: 1.1, rangeMul: 1.2, pierceAdd: { n: 1, weapons: ['glacier', 'emberstorm', 'spectra'] } } },
    ability: { id: 'whiteout', name: 'Whiteout', cd: 30, duration: 4, ahead: 75, frozenMul: 1.25,
      text: 'Freezes every enemy on screen for 4 s. Frozen enemies take +25% damage; the boss stops attacking.' },
    favourite: 'glacier', unlock: { level: 6, coins: 1100 },
    strong: [{ id: 'grunt', why: 'Long Sight: +20% range hits floods sooner' }, { id: 'shield', why: '+10% damage wears shield lines down' }, { id: 'sniper', why: 'Long Sight: +20% range reaches far Spitlings' }, { id: 'oculon', why: 'Whiteout pauses boss attacks; +20% range' }],
    weak: [{ id: 'bomber', why: 'Guard 2 is thin against Fizzbomb blasts' }],
    raider: { body: '#e8f6ff', helmet: '#9fc8e8', visor: '#4dc3ff', pack: '#6f9bff' }, raiderTell: 'hood', scale: 1.15,
    look: { coat: '#e8f6ff', hood: '#9fc8e8', visor: '#4dc3ff', sash: '#6f9bff' },
    run: { freq: 9, bob: 0.03, lean: -0.08 },
    sfx: { ability: 'hero_rime_ability', ready: 'hero_rime_ready', guard: 'hero_rime_guard', select: 'hero_rime_select' },
  },
  {
    id: 'bonbon', name: 'Bonbon', title: 'Candy Trickster', role: 'Trickster', tag: 'CANDY',
    blurb: 'A bouncy candy trickster. Earns extra coins and wraps the squad in a sugar shield.',
    special: '+25% coins from every run, win or lose.',
    health: 2, speed: 1.15, dmgBonus: 0, fireBonus: 0,
    passive: { name: 'Sweet Tooth', text: '+25% coins from every run (wins, losses and endless).', mods: { coinMul: 1.25 } },
    ability: { id: 'sugarshield', name: 'Sugar Shield', cd: 26, duration: 5,
      text: 'The squad is invincible for 5 s. Enemies that touch it pop.' },
    favourite: 'sugarrush', unlock: { level: 8, coins: 1500 },
    strong: [{ id: 'blaster', why: 'Sugar Shield blocks Boomling bursts' }, { id: 'healer', why: 'its favourite, Sugar Rush, lobs over to the Mendlings' }, { id: 'mothermurk', why: 'Sugar Shield blocks the goo puddles while the squad keeps firing' }],
    weak: [{ id: 'tank', why: 'no damage bonus, small Guard' }, { id: 'flyer', why: 'its favourite, Sugar Rush, lands under the flyers' }],
    raider: { body: '#ff8ad8', helmet: '#fff0a0', visor: '#8affc8', pack: '#b48aff' }, raiderTell: 'buns', scale: 0.85,
    look: { hair: '#ff8ad8', mint: '#8affc8', pink: '#ff8ad8', bow: '#b48aff', shoes: '#fff0a0' },
    run: { freq: 10, bob: 0.16, lean: -0.1 },
    sfx: { ability: 'hero_bonbon_ability', ready: 'hero_bonbon_ready', guard: 'hero_bonbon_guard', select: 'hero_bonbon_select' },
  },
  {
    id: 'bolt', name: 'Bolt', title: 'Engineer', role: 'Engineer', tag: 'FACTORY',
    blurb: 'A handy engineer. Turrets last longer, fire faster, and a big fortress drops in.',
    special: 'Road turrets and the Fortress last 60% longer; every turret fires 25% faster.',
    health: 3, speed: 0.95, dmgBonus: 0, fireBonus: 0,
    passive: { name: 'Overclock', text: 'Road turrets and the Fortress last 60% longer; every turret fires 25% faster.',
      mods: { turretLifeMul: 1.6, turretRateMul: 1.25 } },
    ability: { id: 'fortress', name: 'Deploy Fortress', cd: 20, duration: 12, life: 12, rate: 2.5, k: 0.3, minCount: 20, pierce: 3,
      side: 2.8, back: 1.5, shellScale: 1.5,
      text: 'Drops a big turret that rides with the squad for 12 s, firing piercing shells.' },
    favourite: 'gearworks', unlock: { level: 10, coins: 2000 },
    strong: [{ id: 'bomber', why: 'turrets and the Fortress pop Fizzbomb packs early' }, { id: 'spawner', why: 'long-lasting turrets keep grinding the slow Hive' }, { id: 'ironhorn', why: 'turrets fire 25% faster' }],
    weak: [{ id: 'runner', why: 'turrets drop behind fast rushes' }],
    raider: { body: '#ffb21f', helmet: '#ffd34d', visor: '#2fd6c8', pack: '#4b5672' }, raiderTell: 'brim', scale: 1,
    look: { hat: '#ffd34d', overalls: '#ffb21f', suit: '#4b5672', lamp: '#fff6c4' },
    run: { freq: 11, bob: 0.06, lean: -0.12, roll: 0.06 },
    sfx: { ability: 'hero_bolt_ability', ready: 'hero_bolt_ready', guard: 'hero_bolt_guard', select: 'hero_bolt_select' },
  },
  {
    id: 'vex', name: 'Titan Vex', title: 'Heavy Guard', role: 'Tank', tag: 'HEAVY',
    blurb: 'A huge armoured guard. Starts with a bigger squad, but dodges side to side slower.',
    special: '+6 raiders at the start of every run, and the most Guard.',
    health: 6, speed: 0.7, dmgBonus: 0.05, fireBonus: 0,
    passive: { name: 'Big Squad', text: '+6 raiders at the start of every level and endless run.', mods: { dmgMul: 1.05, startBonus: 6 } },
    ability: { id: 'shockwave', name: 'Shockwave', cd: 22, duration: 0.5, range: 32, push: 4, pushFar: 14, tankMul: 0.5, stunPct: 1.0, stunTime: 1.2,
      k: 0.5, enemyCap: 0.25, bossCap: 0.03, shake: 0.35,
      text: 'A shield slam knocks the whole horde back up to 18 m and stuns it.' },
    favourite: 'voidsiphon', unlock: { level: 12, coins: 2800 },
    strong: [{ id: 'tank', why: 'Shockwave knocks walls back' }, { id: 'bomber', why: 'Guard 6 eats blasts' }, { id: 'blaster', why: 'Guard 6 eats Boomling bursts' }],
    weak: [{ id: 'grunt', why: 'only +5% damage: the slowest to clear big floods' }, { id: 'sniper', why: 'slow dodge: hard to step out of the goo' }, { id: 'oculon', why: 'slow dodge' }],
    raider: { body: '#5a3fa8', helmet: '#2a2d3e', visor: '#ff3b4e', pack: '#ffc531' }, raiderTell: 'ridge', scale: 1.45,
    look: { armour: '#5a3fa8', plates: '#2a2d3e', trim: '#ffc531', visor: '#ff3b4e' },
    run: { freq: 7.5, bob: 0.05, lean: -0.06 },
    sfx: { ability: 'hero_vex_ability', ready: 'hero_vex_ready', guard: 'hero_vex_guard', select: 'hero_vex_select' },
  },
];

export const HERO_IDS = HERO_DEFS.map((h) => h.id);
export const HERO_DEF_BY_ID = Object.fromEntries(HERO_DEFS.map((h) => [h.id, h]));
export const DEFAULT_HERO = 'pip';

export function heroDef(id) { return HERO_DEF_BY_ID[id] || HERO_DEF_BY_ID[DEFAULT_HERO]; }
