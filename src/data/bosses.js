// Boss definitions (data only). Level data gives { type, hp, tier }; hp here is the fallback.
// Attack cooldowns are divided by cadenceFor(tier, phase). Every damaging attack telegraphs >= 0.9 s.

export const BOSSES = {
  grawlstone: {
    type: 'grawlstone', name: 'GRAWLSTONE', subtitle: 'THE MOSSY COLOSSUS', hp: 1600,
    distance: 26,                      // stands this far ahead of the halted squad
    hitbox: { halfW: 3.1, front: 1.7 },
    firstAttack: 1.0,
    cooldown: [1.7, 2.4],              // pause between attacks (s)
    phase2Cadence: 1.35,               // cooldown divisor below 50% hp
    attacks: [
      { id: 'slam', weight: 3, minPhase: 1, telegraph: 1.1, radius: 2.3, count: 1, count2: 2, radius2: 2.1, gap: 0.6 },
      { id: 'roll', weight: 2, minPhase: 2, telegraph: 1.6, launch: 0.9, halfW: 1.45 },
    ],
  },
};

export function bossDef(type) { return BOSSES[type] || BOSSES.grawlstone; }

/** Cooldown divisor from level boss tier (1..5) and fight phase (1|2). */
export function cadenceFor(def, tier = 1, phase = 1) {
  return (1 + 0.12 * (Math.max(1, tier) - 1)) * (phase === 2 ? def.phase2Cadence : 1);
}
