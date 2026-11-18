// Squad member types (update 3 stage 5, data only). Bought once in the shop's SQUAD tab; each owned type mixes into
// the formation at its MIX setting (OFF / FEW = 1 in 10 / MANY = 1 in 5 of the Raiders that join). Effects are
// modest on purpose (difficulty was just tuned). Runtime: game/squadtypes.js. Looks: models/raider.js variants.
// save.squadTypes = { owned: [id], mix: { id: share 0..100 } }.

export const SQUAD_TYPES = [
  {
    id: 'shield', idx: 1, name: 'SHIELD BEARER', cost: 1500, color: '#2f8cff',
    desc: 'Carries a big shield. It blocks one enemy hit for the squad, then the shield is gone.',
    short: 'Blocks 1 enemy hit',
  },
  {
    id: 'medic', idx: 2, name: 'MEDIC', cost: 2500, color: '#ff3b4e',
    desc: 'Every 6 seconds each Medic brings back one lost Raider while your squad is below its biggest size (up to 3 at a time).',
    short: 'Revives lost Raiders',
  },
  {
    id: 'gunner', idx: 3, name: 'HEAVY GUNNER', cost: 3500, color: '#ffae1a',
    desc: 'Hauls a heavy cannon: +3% squad damage for each Heavy Gunner (up to +15%).',
    short: '+3% damage each',
  },
];

export const SQUAD_TYPE_BY_ID = Object.fromEntries(SQUAD_TYPES.map((t) => [t.id, t]));
export const SQUAD_TYPE_IDS = SQUAD_TYPES.map((t) => t.id);

/** Mix settings per owned type: share = % of the Raiders that join as this type. */
export const MIX_LEVELS = [
  { id: 'off', label: 'OFF', share: 0 },
  { id: 'few', label: 'FEW', share: 10 },
  { id: 'many', label: 'MANY', share: 20 },
];
export const DEFAULT_SHARE = 10;

/** Tuning (game/squadtypes.js). */
export const MEDIC = { every: 6, maxPer: 3 };
export const GUNNER = { per: 0.03, max: 0.15 };
/** Loss reasons a shield blocks (enemy touch, Fizzbomb blast, sniper / blaster shots = 'spit', boss attacks). */
export const SHIELD_BLOCKS = ['horde', 'bomb', 'spit', 'boss'];

/** The mix level of a share (nearest of OFF / FEW / MANY). */
export function mixLevel(share) {
  const s = share | 0;
  return s <= 0 ? MIX_LEVELS[0] : s < 15 ? MIX_LEVELS[1] : MIX_LEVELS[2];
}

/** share (0..100) of a type in a save, 0 when it isn't owned. */
export function typeShare(data, id) {
  const st = data && data.squadTypes;
  if (!st || !st.owned.includes(id)) return 0;
  const v = st.mix[id];
  return v == null ? DEFAULT_SHARE : Math.max(0, Math.min(100, v | 0));
}
