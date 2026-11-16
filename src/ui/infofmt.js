// Info-page text built from data (SPEC2 §5): every number the Armory, Heroes, Compare and Loadout screens show
// comes from here, computed from data/weapons.js, data/heroes.js and data/matchups.js (never typed into UI code),
// so balance changes flow through. Damage, burn and dps numbers use the x100 display scale (SPEC2 §0.7).
import { DISPLAY_SCALE, MKREF, MAX_MK, mkRow, mkLabel, ROMAN, WEAPON_BY_ID, weaponDef } from '../data/weapons.js';
import { HERO_BAR_MAX, ABILITY_REF, FAVOURITE_BONUS, GUARD_REGEN, heroDef } from '../data/heroes.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { SHIELD_RULE } from '../data/matchups.js';
import { lockText as lockLine, isWeaponUnlocked } from '../save/unlocks.js';

/** The one lock line used everywhere: "LOCKED: reach level N or buy for C coins" ('' for starters). */
export const lockText = lockLine;
/** x100 display scale. */
export const shown = (x) => Math.round(x * DISPLAY_SCALE);
export const thousands = (n) => Math.round(n).toLocaleString('en-US');
/** Short decimal: 4.8 -> "4.8", 3 -> "3", 2.25 -> "2.25". */
export const num = (x) => String(Math.round(x * 100) / 100);
const pct = (x) => Math.round(x * 100);
const NB = '\u00a0'; // no-break space: a unit never wraps onto its own line
/** Distance in metres rounded to the nearest half: 54.6 -> "54.5 m", 7.15 -> "7 m". */
export const metres = (x) => `${Math.round(x * 2) / 2}${NB}m`;
/** Seconds: 1.5 -> "1.5 s". */
export const secs = (x) => `${num(x)}${NB}s`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------------- targets (strong / weak lists) ----------------
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
/** Display name of an enemy or boss type id ('grunt' -> 'Murkling', 'tempestking' -> 'Tempest King'). */
export function targetName(id) {
  if (ENEMIES[id]) return ENEMIES[id].name;
  if (BOSSES[id]) return titleCase(BOSSES[id].name);
  return id;
}
export const isBoss = (id) => !!BOSSES[id];
/** [{ id, name, why, boss }] from def.strong / def.weak. */
export function targets(list) {
  return (list || []).map((t) => ({ id: t.id, name: targetName(t.id), why: t.why || '', boss: isBoss(t.id) }));
}

// ---------------- weapons ----------------
/** Exact-number parts for one weapon at one Mk (joined with " · " on the page). */
export function weaponParts(def, mk = 3) {
  const r = mkRow(def, mk);
  const d = shown(r.dmg);
  switch (def.id) {
    case 'emberstorm':
      return [`Damage: ${d} per flame, burns ${Math.round(d / r.burnTime)}/second for ${secs(r.burnTime)}`,
        `Fire rate ${num(r.rate)} × ${r.pellets} flames/s`, `Range ${metres(r.range)}`, `Pierces ${r.pierce}`, `Cone ${r.cone}°`];
    case 'glacier':
      return [`Damage: ${d} per shard`, `Fire rate ${num(r.rate)} shards/s`, `Range ${metres(r.range)}`, `Pierces ${r.pierce}`,
        `Slows ${pct(r.slow)}% for ${secs(r.slowTime)}`, `Freeze chance ${pct(r.freeze)}% (${secs(r.freezeTime)})`];
    case 'sugarrush':
      return [`Splash: ${d} to each enemy in ${metres(r.splashR)}`, `Fire rate ${num(r.rate)} bombs/s`, `Throws up to ${metres(r.throw)}`,
        `${plural(r.bounces, 'bounce')} (${pct(r.bounceDmg)}% splash)`,
        `Caramel puddle ${metres(r.puddleR)} for ${secs(r.puddleTime)}, slows ${pct(r.puddleSlow)}%`];
    case 'spectra':
      return [`Beam: ${d} per hit`, `Fire rate ${num(r.rate)}/s`, `Range ${metres(r.range)}`,
        `Splits into ${r.splits} beams of ${shown(r.dmg * r.splitDmg)} within ${metres(r.splitRange)}`];
    case 'gearworks':
      return [`Gear: ${d} per hit, −${pct(1 - r.bounceMul)}% per bounce`, `Fire rate ${num(r.rate)}/s`, `Range ${metres(r.range)}`,
        `Bounces ${r.bounces}× within ${metres(r.bounceR)}`, `Mini turret every ${secs(r.turretEvery)}, lasts ${secs(r.turretLife)}`];
    case 'thunderclap':
      return [`Bolt: ${d} per hit`, `Fire rate ${num(r.rate)}/s`, `Range ${metres(r.range)}`,
        `Chains ${plural(r.jumps, 'jump')} within ${metres(r.reach)} (${pct(r.falloff)}% each jump)`];
    case 'voidsiphon': {
      const direct = shown(r.dmg * def.direct), pool = shown(r.dmg * (1 - def.direct));
      return [`Orb: ${direct} on contact, then crushes ${Math.round(pool / r.holeTime)}/second for ${secs(r.holeTime)}`,
        `Fire rate ${num(r.rate)}/s`, `Range ${metres(r.range)}`, `Pulls within ${metres(r.pullR)}`];
    }
    default:
      return [`Damage: ${d} per hit`, `Fire rate ${num(r.rate)}/s`, `Range ${metres(r.range ?? 60)}`];
  }
}

/** @deprecated stub name: Mk label + the exact parts. */
export function weaponLines(def, mk = 3) { return [mkLabel(mk) + ':', ...weaponParts(def, mk)]; }

/** One-line special summary per Mk (the Mk I -> V table). */
function mkSpecial(def, r) {
  switch (def.id) {
    case 'emberstorm': return `cone ${r.cone}°, range ${metres(r.range)}, burn ${secs(r.burnTime)}, pierce ${r.pierce}`;
    case 'glacier': return `pierce ${r.pierce}, slow ${pct(r.slow)}%, freeze ${pct(r.freeze)}%`;
    case 'sugarrush': return `splash ${metres(r.splashR)}, ${plural(r.bounces, 'bounce')}, puddle ${metres(r.puddleR)}`;
    case 'spectra': return `${r.splits} split beams, ${metres(r.splitRange)}`;
    case 'gearworks': return `${plural(r.bounces, 'bounce')}, turret every ${secs(r.turretEvery)}`;
    case 'thunderclap': return `${plural(r.jumps, 'jump')}, reach ${metres(r.reach)}`;
    case 'voidsiphon': return `hole ${secs(r.holeTime)}, pull ${metres(r.pullR)}`;
    default: return '';
  }
}
const UNIT = { emberstorm: 'per flame', sugarrush: 'splash', voidsiphon: 'per orb' };

/** [{ mk, label, dmg, rate, special, look }] for Mk I..V. */
export function weaponMkTable(def) {
  const out = [];
  for (let mk = 1; mk <= MAX_MK; mk++) {
    const r = mkRow(def, mk);
    out.push({ mk, label: mkLabel(mk), dmg: `${shown(r.dmg)} ${UNIT[def.id] || 'per hit'}`, rate: `${num(r.rate)}/s`,
      special: mkSpecial(def, r), look: (def.mkLook && def.mkLook[mk - 1]) || '' });
  }
  return out;
}

/** The four weapon bars (fixed per weapon, SPEC2 §5). */
export function weaponBars(def) {
  const b = def.bars || {};
  return [
    { key: 'damage', label: 'Damage', value: b.damage || 0 },
    { key: 'rate', label: 'Fire rate', value: b.rate || 0 },
    { key: 'range', label: 'Range', value: b.range || 0 },
    { key: 'special', label: b.specialLabel ? `Special: ${b.specialLabel}` : 'Special', value: b.special || 0 },
  ];
}

/** Shield rule line ("Each shard breaks 2 shield hits"), '' when normal. */
export function shieldRule(def) { const r = SHIELD_RULE[def.id]; return r && r !== 'Normal' ? r : ''; }

// ---------------- heroes ----------------
/** Damage bonus shown for a hero: Cinder shows the fire bonus. */
export function heroBonus(h) { return h.fireBonus > 0 ? { value: h.fireBonus, fire: true } : { value: h.dmgBonus || 0, fire: false }; }

/** The four hero bars: Health, Speed, Damage bonus, Ability recharge (shorter = fuller). */
export function heroBars(h) {
  const bo = heroBonus(h);
  return [
    { key: 'health', label: 'Health', value: h.health / HERO_BAR_MAX.health, text: String(h.health) },
    { key: 'speed', label: 'Speed', value: h.speed / HERO_BAR_MAX.speed, text: `${pct(h.speed)}%` },
    { key: 'bonus', label: 'Damage bonus', value: bo.value / HERO_BAR_MAX.bonus, text: `+${pct(bo.value)}%${bo.fire ? ' fire' : ''}` },
    { key: 'recharge', label: 'Ability recharge', value: Math.min(1, HERO_BAR_MAX.recharge / h.ability.cd), text: `${secs(h.ability.cd)}` },
  ];
}

export function healthLine(h) {
  return `Health ${h.health}: saves ${h.health} raiders from enemy hits, refills 1 every ${secs(GUARD_REGEN)}`;
}
export function speedLine(h) {
  const how = h.speed < 1 ? 'moves side to side slower' : h.speed > 1 ? 'moves side to side faster' : 'normal side to side speed';
  return `Dodge speed ${pct(h.speed)}% (${how})`;
}
export function bonusLine(h) {
  if (h.fireBonus > 0) return `+${pct(h.fireBonus)}% damage with Emberstorm and Meteor Drop`;
  return h.dmgBonus > 0 ? `+${pct(h.dmgBonus)}% damage with every weapon` : 'No damage bonus';
}

/** Ability numbers at the info-page reference (50 raiders, no upgrades, Mk mk). */
export function abilityParts(h, mk = ABILITY_REF.mk) {
  const a = h.ability, n = ABILITY_REF.raiders, ref = MKREF[Math.max(1, Math.min(MAX_MK, mk))] * ABILITY_REF.dmgMul;
  const tag = `(${n} raiders, ${mkLabel(mk)})`;
  const mods = h.passive.mods || {};
  const cd = `Recharge ${secs(a.cd)}`;
  switch (a.id) {
    case 'rally': {
      const add = Math.max(a.min, Math.min(a.max, Math.round(a.frac * n)));
      return [`Instantly adds ${add} raiders to a ${n}-raider squad (${pct(a.frac)}% of the squad, at least ${a.min}, at most ${a.max}) and refills Guard`, cd];
    }
    case 'meteor': {
      const budget = a.k * n * ref * (mods.fireMul || 1);
      return [`${thousands(shown(budget))} damage shared by everything in a ${metres(a.radius)} circle ${tag}, then burns for ${secs(a.burnTime)}`,
        `Boss: up to ${pct(a.bossCap)}% of its health`, cd];
    }
    case 'whiteout':
      return [`Freezes every enemy on screen for ${secs(a.duration)}; frozen enemies take +${pct(a.frozenMul - 1)}% damage and the boss stops attacking`, cd];
    case 'sugarshield':
      return [`The squad can't lose raiders to enemies for ${secs(a.duration)}; enemies that touch it pop`, cd];
    case 'fortress': {
      const life = a.life * (mods.turretLifeMul || 1), rate = a.rate * (mods.turretRateMul || 1);
      const shell = (a.k * Math.max(n, a.minCount) * ref) / a.rate;
      return [`A big turret rides with the squad for ${secs(life)}, firing about ${Math.round(rate)} shells a second, ${thousands(shown(shell))} damage each, that pierce ${a.pierce} enemies ${tag}`, cd];
    }
    case 'shockwave': {
      const budget = a.k * n * ref;
      return [`Knocks every enemy within ${metres(a.range)} back up to ${metres(a.push + a.pushFar)} and stuns them for ${secs(a.stunTime)}`,
        `${thousands(shown(budget))} damage shared by all of them ${tag}, at most ${pct(a.enemyCap)}% of each enemy's health`,
        `Boss: up to ${pct(a.bossCap)}% of its health`, cd];
    }
    default: return [a.text || '', cd];
  }
}
/** Abilities whose numbers scale with the squad (the hero page's Mk control drives only these). */
export const SCALED_ABILITIES = new Set(['meteor', 'shockwave', 'fortress']);

/** Favourite weapon line + lock note (d = save data). */
export function favouriteInfo(h, d) {
  const w = WEAPON_BY_ID[h.favourite];
  if (!w) return { id: null, text: 'Favourite: none', note: '' };
  const locked = d ? !isWeaponUnlocked(d, w.id) : false;
  return { id: w.id, locked, text: `Favourite: ${w.name}${locked ? ` (unlocks at level ${w.unlock.level})` : ''}`, note: `+${pct(FAVOURITE_BONUS)}% damage with it` };
}

/** Compact lines for older callers (stub contract). */
export function heroLines(h, mk = ABILITY_REF.mk) {
  return [healthLine(h), speedLine(h), `${h.passive.name}: ${h.passive.text}`, `${h.ability.name}: ${abilityParts(h, mk).join('. ')}`];
}

export { mkLabel, ROMAN, MAX_MK, weaponDef, heroDef };
