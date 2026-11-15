// Info-page text built from data (never typed into UI code). FOUNDATION STUB (owned by the UI builder): the
// lock line plus a few basics. Contract: lockText(def) (the one "LOCKED: reach level N or buy for C coins"
// string), shown(x) (the x100 display scale), weaponLines(def, mk), heroLines(def, mk) -> string[].
import { DISPLAY_SCALE, mkRow, mkLabel } from '../data/weapons.js';
import { lockText as lockLine } from '../save/unlocks.js';

export const lockText = lockLine;
export const shown = (x) => Math.round(x * DISPLAY_SCALE);
export const thousands = (n) => Math.round(n).toLocaleString('en-US');

export function weaponLines(def, mk = 3) {
  const r = mkRow(def, mk);
  const out = [`${mkLabel(mk)}: Damage ${shown(r.dmg)} per hit`, `Fire rate ${r.rate}/s`, `Range ${r.range ?? r.throw ?? 60}`];
  return out;
}

export function heroLines(def) {
  return [
    `Health ${def.health}: saves ${def.health} raiders from enemy hits, refills 1 every 4 s`,
    `Dodge speed ${Math.round(def.speed * 100)}% (moves side to side ${def.speed < 1 ? 'slower' : def.speed > 1 ? 'faster' : 'normally'})`,
    `${def.passive.name}: ${def.passive.text}`,
    `${def.ability.name}: ${def.ability.text} Recharge ${def.ability.cd} s`,
  ];
}
