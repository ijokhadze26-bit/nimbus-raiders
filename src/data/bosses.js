// Boss definitions (data only). Level data gives { type, hp, tier }; hp here is the fallback.
// Attack cooldowns are divided by cadenceFor(tier, phase). Every damaging attack telegraphs >= 0.9 s.
// Tier 1 bosses (early levels) pause longer between attacks so a small squad can learn the dodge; by tier 5
// the cadence matches the old tuning, endless tiers 6-7 go beyond it.

export const BOSSES = {
  grawlstone: {
    type: 'grawlstone', name: 'GRAWLSTONE', subtitle: 'THE MOSSY COLOSSUS', hp: 1600,
    distance: 26,                      // stands this far ahead of the halted squad
    hitbox: { halfW: 3.1, front: 1.7 },
    firstAttack: 0.4,
    cooldown: [2.21, 3.12],              // pause between attacks (s)
    phase2Cadence: 1.35,               // cooldown divisor below 50% hp
    attacks: [
      { id: 'slam', weight: 3, minPhase: 1, telegraph: 1.1, radius: 2.0, firstOffset: 1.5, count: 1, count2: 2, radius2: 2.1, gap: 0.6 },
      { id: 'roll', weight: 2, minPhase: 2, telegraph: 1.6, launch: 0.9, halfW: 1.45 },
    ],
  },
  oculon: {
    type: 'oculon', name: 'OCULON', subtitle: 'THE STORM EYE', hp: 2600,
    distance: 26, hitbox: { halfW: 3.6, front: 2.6 }, hitY: 6.3, sway: 0.3,
    enterTime: 1.3,
    firstAttack: 0.4,
    cooldown: [2.34, 3.38],
    phase2Cadence: 1.4,
    attacks: [
      { id: 'orb', weight: 3, minPhase: 1, telegraph: 1.2, radius: 1.3, count: 3, count2: 4, flight: 0.75, stagger: 0.22, spread: 2.6 },
      { id: 'stripe', weight: 2, minPhase: 1, telegraph: 1.25, halfW: 1.35, count: 1, count2: 2, stagger: 0.5 },
      { id: 'spiral', weight: 3, minPhase: 2, telegraph: 1.05, radius: 1.1, count: 8, flight: 0.7, stagger: 0.11, maxR: 2.9 },
      { id: 'laser', weight: 2, minPhase: 2, telegraph: 1.3, width: 5.2, sweep: 0.55 },
    ],
  },
  mothermurk: {
    type: 'mothermurk', name: 'MOTHER MURK', subtitle: 'QUEEN OF THE GOO', hp: 3200,
    distance: 27, hitbox: { halfW: 4.0, front: 3.4 }, hitY: 3.6, sway: 0.18,
    enterTime: 1.4,
    firstAttack: 0.4,
    cooldown: [2.47, 3.51],
    phase2Cadence: 1.3,
    attacks: [
      { id: 'summon', weight: 3, minPhase: 1, windup: 1.1, count: 20, perTier: 8, count2: 30, max: 60, hpPerTier: 0.75,
        mix: { grunt: 0.75, runner: 0.25 }, mix2: { grunt: 0.57, runner: 0.2, bomber: 0.08, tank: 0.15 } },
      // puddles land inside a big blob whatever it does: fewer, smaller ones keep the queen a DPS race, not a wipe
      { id: 'puddle', weight: 3, minPhase: 1, telegraph: 1.1, radius: 1.45, count: 1, count2: 2, life: 5.5, flight: 0.8 },
    ],
  },
  ironhorn: {
    type: 'ironhorn', name: 'IRONHORN', subtitle: 'THE MECH RHINO', hp: 3000,
    distance: 26, hitbox: { halfW: 2.8, front: 4.6 }, hitY: 3.2, sway: 0.1,
    enterTime: 1.5,
    firstAttack: 0.4,
    cooldown: [2.21, 3.12],
    phase2Cadence: 1.35,
    attacks: [
      { id: 'charge', weight: 3, minPhase: 1, telegraph: 1.4, speed: 30, back: 22 },
      { id: 'stomp', weight: 2, minPhase: 1, telegraph: 1.0, halfW: 1.5, count: 1, count2: 2, travel: 0.45 },
      { id: 'double', weight: 2, minPhase: 2, telegraph: 1.4, speed: 32, back: 24 },
      { id: 'feint', weight: 2, minPhase: 2, telegraph: 1.4, switchAt: 0.7, speed: 32, back: 24 },
    ],
  },
  tempestking: {
    type: 'tempestking', name: 'TEMPEST KING', subtitle: 'LORD OF THE STORM', hp: 5200,
    distance: 28, hitbox: { halfW: 3.8, front: 2.4 }, hitY: 5.2, sway: 0.25,
    enterTime: 1.5,
    firstAttack: 0.4,
    cooldown: [1.82, 2.6],
    phase2Cadence: 1.5,
    rotate: ['lightning', 'slam', 'orb', 'summon'],
    attacks: [
      { id: 'slam', weight: 1, minPhase: 1, telegraph: 1.15, radius: 2.2, count: 1, count2: 2, stagger: 0.55 },
      { id: 'orb', weight: 1, minPhase: 1, telegraph: 1.15, radius: 1.35, count: 4, count2: 6, flight: 0.7, stagger: 0.16, spread: 2.6 },
      { id: 'summon', weight: 1, minPhase: 1, windup: 1.0, count: 22, perTier: 6, count2: 32, max: 60, hpPerTier: 0.75,
        mix: { grunt: 0.7, runner: 0.3 }, mix2: { grunt: 0.52, runner: 0.25, bomber: 0.08, shield: 0.15 } },
      { id: 'lightning', weight: 1, minPhase: 1, telegraph: 1.2, halfW: 1.25, count: 2, count2: 3, stagger: 0.45 },
    ],
  },
};

export function bossDef(type) { return BOSSES[type] || BOSSES.grawlstone; }

/** Cooldown divisor from level boss tier (1..5) and fight phase (1|2). */
export function cadenceFor(def, tier = 1, phase = 1) {
  return (1 + 0.2 * (Math.max(1, tier) - 1)) * (phase === 2 ? def.phase2Cadence : 1);
}
