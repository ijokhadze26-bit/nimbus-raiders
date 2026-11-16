// Hazard kinds by name (update 3). A kind module exports objects shaped like
//   { kind, create(sys, ev) -> obj | null, update(sys, obj, dt) -> bool (false = remove), sync(sys, obj, dt),
//     release(sys, obj), pre?(sys, dt), post?(sys, dt), warm?(sys) -> Object3D[], reserve?(sys, ev) -> data }
// pre / post run once per rendered frame around the objects' sync for every kind used this session (instanced
// pools: begin / end); warm builds one of each material for the boot shader warm-up; reserve runs ~230 u ahead
// (before create, ~110 u) for kinds that cut the road early (jelly / platform / collapse gaps). To add a world's kinds,
// import its module here and list it in KIND_LIST (the plan side is src/data/hazardplan.js).
import { FORGE_KINDS } from './forge.js';
import { FROST_KINDS } from './frost.js';
import { CANDY_KINDS } from './candy.js';
import { CITADEL_KINDS } from './citadel.js';

export const KIND_LIST = [...FORGE_KINDS, ...FROST_KINDS, ...CANDY_KINDS, ...CITADEL_KINDS];

export const KINDS = Object.fromEntries(KIND_LIST.map((k) => [k.kind, k]));

/** Registers more kinds at runtime (tests / later worlds); returns KINDS. */
export function registerKinds(list) {
  for (const k of list) { KINDS[k.kind] = k; if (!KIND_LIST.includes(k)) KIND_LIST.push(k); }
  return KINDS;
}
