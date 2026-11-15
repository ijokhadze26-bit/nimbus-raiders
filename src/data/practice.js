// TRY IT practice run (data only, SPEC2 §5): a short fixed course that shows a weapon / hero against every
// enemy type and a Grawlstone, at the chosen Mk. Practice never pays coins, stars, stats or unlocks
// (save/progress.js ignores mode 'practice'); the squad is always PRACTICE.squad + the hero's start bonus and
// shop upgrades are ignored, so it plays the same on a fresh save and a maxed one.
import { gate, horde, crate, toughFor } from './levels.js';
import { MKREF, WEAPON_IDS } from './weapons.js';

export const PRACTICE = { id: 98, length: 420, theme: 'noon', speed: 9.5, squad: 60, bossHpPerRef: 900, tough: 3, crateAt: 175 };

/** Level-like def for weapon `weaponId` at Mk `mk`. */
export function practiceDef(weaponId, mk = 3) {
  const P = PRACTICE;
  const hpMul = toughFor(P.tough, mk);
  const i = WEAPON_IDS.indexOf(weaponId);
  const next = WEAPON_IDS[(i + 1 + WEAPON_IDS.length) % WEAPON_IDS.length];
  const events = [
    gate(24, 'L', 'add', { value: 5, max: 10 }), gate(24, 'R', 'add', { value: 3, max: 8 }),
    gate(56, 'L', 'add', { value: 4, max: 8 }), gate(56, 'R', 'add', { value: 6, max: 12 }),
    horde(100, 60, { grunt: 1 }, 'both', { hpMul }),
    horde(150, 30, { runner: 1 }, 'both', { hpMul }),
    crate(P.crateAt, 'R', next),
    horde(205, 16, { shield: 1 }, 'both', { hpMul }),
    horde(255, 4, { tank: 1 }, 'both', { hpMul }),
    horde(305, 12, { bomber: 1 }, 'both', { hpMul }),
  ];
  return {
    id: P.id, name: 'Practice', theme: P.theme, length: P.length, speed: P.speed, stars: [0, 0], reward: 0, practice: true,
    enemyHp: Math.max(1, Math.round(0.35 * hpMul * 100) / 100), favours: [],
    boss: { type: 'grawlstone', hp: Math.round(P.bossHpPerRef * MKREF[Math.max(1, Math.min(5, mk))]), tier: 1 },
    events,
  };
}
