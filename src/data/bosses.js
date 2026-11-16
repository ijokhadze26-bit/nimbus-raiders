// Boss definitions (data only). favours = weapons that do well against it (loadout hint, SPEC2 §2.11). Level data gives { type, hp, tier }; hp here is the fallback.
// Attack cooldowns are divided by cadenceFor(tier, phase). Every damaging attack telegraphs >= 0.9 s.
// Tier 1 bosses (early levels) pause longer between attacks so a small squad can learn the dodge; by tier 5
// the cadence matches the old tuning, endless tiers 6-7 go beyond it.
// Update 3 (stage 2): RAGE below 25% hp for every boss (attacks RAGE.cadence x as often, red glow, RAGE! flash);
// SAFE SPOT step (attacks.safeSpot) queued at every phase change of a world boss (cfg.mini falsy); `phases` =
// hp fractions where the next phase starts (default [0.5]); Ironhorn `lava` (forge world: charges leave lava,
// stomps rain embers; frost skin: frost trails), Mother Murk `candy` (Candy Queen: jelly brood, syrup, canes),
// Tempest King 3 phases with attacks from every world (rotate / rotate2 / rotate3).

export const RAGE = { at: 0.25, cadence: 1.6, warnCut: 0.1 };
// safe spot: radius range (grows with the squad), warning >= 1.8 s, max share of the squad lost when nobody moves
export const SAFE_SPOT = { r0: 1.8, r1: 2.4, telegraph: 2.2, maxLoss: 0.35 };

export const BOSSES = {
  grawlstone: {
    type: 'grawlstone', favours: ['spectra', 'thunderclap'], name: 'GRAWLSTONE', subtitle: 'THE MOSSY COLOSSUS', hp: 1600,
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
    type: 'oculon', favours: ['spectra', 'glacier'], name: 'OCULON', subtitle: 'THE STORM EYE', hp: 2600,
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
    type: 'mothermurk', favours: ['voidsiphon', 'thunderclap'], name: 'MOTHER MURK', subtitle: 'QUEEN OF THE GOO', hp: 3200,
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
    // Candy Queen (skin 'candy'): jelly brood instead of goo Murklings, syrup puddles, candy-cane volleys
    candy: [
      { id: 'summon', weight: 3, minPhase: 1, windup: 1.1, count: 18, perTier: 7, count2: 26, max: 54, hpPerTier: 0.75,
        mix: { grunt: 0.65, runner: 0.35 }, mix2: { grunt: 0.45, runner: 0.3, bomber: 0.1, shield: 0.15 } },
      { id: 'puddle', weight: 2, minPhase: 1, telegraph: 1.1, radius: 1.5, count: 1, count2: 2, life: 6, flight: 0.8 },
      { id: 'cane', weight: 3, minPhase: 1, telegraph: 1.15, radius: 1.05, count: 4, count2: 6, flight: 0.75, stagger: 0.14, spread: 2.8 },
    ],
  },
  ironhorn: {
    type: 'ironhorn', favours: ['gearworks', 'thunderclap'], name: 'IRONHORN', subtitle: 'THE MECH RHINO', hp: 3000,
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
    // forge (L20) / cfg.lava: every charge leaves a burning strip along its track; the stomp rains embers.
    // frost skin (FROSTHORN, L25): the same trails as frost (members in them freeze and shatter)
    lava: { halfW: 0.7, life: 3.2, rate: 5, embers: 3, embers2: 4, emberR: 1.0, emberWarn: 1.15 },
  },
  tempestking: {
    type: 'tempestking', favours: ['spectra', 'voidsiphon'], name: 'TEMPEST KING', subtitle: 'LORD OF THE STORM', hp: 5200,
    distance: 28, hitbox: { halfW: 3.8, front: 2.4 }, hitY: 5.2, sway: 0.25,
    enterTime: 1.5,
    firstAttack: 0.4,
    cooldown: [1.7, 2.45],
    // update 3: three phases (100-66 storm, 66-33 + forge / frost, 33-0 + candy / sky), rage at 25%
    phases: [0.66, 0.33],
    safeGuard: 0.3,                    // damage taken while his safe-spot step runs (storm shield)
    phase2Cadence: 1.4,
    phase3Cadence: 1.15,
    rotate: ['lightning', 'slam', 'orb', 'summon'],
    rotate2: ['embers', 'lightning', 'freeze', 'orb', 'slam', 'summon'],
    rotate3: ['gumball', 'embers', 'grawl', 'freeze', 'lightning', 'summon', 'orb'],
    attacks: [
      { id: 'slam', weight: 1, minPhase: 1, telegraph: 1.15, radius: 2.2, count: 1, count2: 2, stagger: 0.55 },
      { id: 'orb', weight: 1, minPhase: 1, telegraph: 1.15, radius: 1.35, count: 4, count2: 6, flight: 0.7, stagger: 0.16, spread: 2.6 },
      { id: 'summon', weight: 1, minPhase: 1, windup: 1.0, count: 22, perTier: 6, count2: 32, max: 60, hpPerTier: 0.75,
        mix: { grunt: 0.7, runner: 0.3 }, mix2: { grunt: 0.52, runner: 0.25, bomber: 0.08, shield: 0.15 } },
      { id: 'lightning', weight: 1, minPhase: 1, telegraph: 1.2, halfW: 1.25, count: 2, count2: 3, stagger: 0.45 },
      // phase 2: Volcanic Forge ember rain + Frozen Peaks freeze lane
      { id: 'embers', weight: 1, minPhase: 2, telegraph: 1.15, radius: 1.0, count: 5, count2: 7, stagger: 0.12, spread: 3.0 },
      { id: 'freeze', weight: 1, minPhase: 2, telegraph: 1.2, halfW: 1.3, life: 2.8, rate: 7 },
      // phase 3: Candy Kingdom rolling gumball + Sky Bridge Grawlstone rock slam
      { id: 'gumball', weight: 1, minPhase: 3, telegraph: 1.5, launch: 0.75, halfW: 1.5, hp: 0 },
      { id: 'grawl', weight: 1, minPhase: 3, telegraph: 1.15, radius: 2.3, count: 2, gap: 0.55 },
    ],
  },
  // update 3 bosses. `native`: the world skin they are built in (bossLook drops a level's matching skin, so the
  // original model colours stay; another world's skin would still recolour them)
  glacius: {
    type: 'glacius', favours: ['emberstorm', 'spectra'], name: 'GLACIUS', subtitle: 'THE FROST GIANT', hp: 3400, native: 'frost',
    distance: 27, hitbox: { halfW: 3.4, front: 2.0 }, hitY: 5.2, sway: 0.2,
    enterTime: 1.0,
    firstAttack: 0.4,
    cooldown: [2.3, 3.2],
    phase2Cadence: 1.35,
    freezeRate: 0.45, freezeCap: 12,   // frozen-lane breaks per second: 1.2 + 0.45 x members inside, at most 12
    attacks: [
      { id: 'freeze', weight: 3, minPhase: 1, telegraph: 1.3, halfW: 1.3, halfW2: 1.45, count: 1, count2: 2, stagger: 0.6, life: 3.0 },
      { id: 'icewall', weight: 2, minPhase: 1, telegraph: 1.2, halfW: 1.6, count: 1, count2: 2, stagger: 0.45, flight: 0.7, ahead: 2.6, reach: 1.4, hpFrac: 0.022, life: 5, block: 2.5 },
      { id: 'icicles', weight: 3, minPhase: 1, telegraph: 1.15, radius: 1.25, count: 3, count2: 5, stagger: 0.22, spread: 2.6 },
      { id: 'pound', weight: 2, minPhase: 1, telegraph: 1.25, halfW: 1.4, count: 1, count2: 2, gap: 1.8, travel: 0.45 },
    ],
  },
  gumdrop: {
    type: 'gumdrop', favours: ['spectra', 'voidsiphon'], name: 'GUMDROP GOLIATH', subtitle: 'THE CHEWY GIANT', hp: 2400, native: 'candy',
    distance: 24, hitbox: { halfW: 3.2, front: 2.8 }, hitY: 3.2, sway: 0.25,
    enterTime: 1.0,
    firstAttack: 0.4,
    cooldown: [2.3, 3.2],
    phase2Cadence: 1.3,
    syrupSlow: 0.35,                   // sideways speed factor inside a syrup puddle
    attacks: [
      { id: 'bounce', weight: 3, minPhase: 1, telegraph: 1.3, radius: 2.4, radius2: 2.5, count: 1, count2: 2, air: 0.8, height: 7, back: 0.5, hold: 0.25, ahead: 2.2 },
      { id: 'split', weight: 2, minPhase: 1, windup: 1.0, count: 14, perTier: 4, count2: 22, max: 46, hpPerTier: 0.6,
        mix: { grunt: 0.6, runner: 0.4 }, mix2: { grunt: 0.5, runner: 0.35, bomber: 0.15 } },
      { id: 'spit', weight: 2, minPhase: 1, telegraph: 1.1, radius: 1.4, count: 2, count2: 3, flight: 0.8, life: 5 },
    ],
  },
};

export function bossDef(type) { return BOSSES[type] || BOSSES.grawlstone; }

/** Cooldown divisor from level boss tier (1..5) and fight phase (1|2|3). */
export function cadenceFor(def, tier = 1, phase = 1) {
  return (1 + 0.2 * (Math.max(1, tier) - 1)) * (phase >= 2 ? def.phase2Cadence : 1) * (phase >= 3 ? def.phase3Cadence || 1 : 1);
}

// ---------------- update 3: world skins ----------------
// Level data may give cfg.skin ('forge' | 'frost' | 'candy' | 'citadel'): the model is recoloured
// (game/bosses/skins.js) and these pairs get their own name on the boss card + HP bar.
export const BOSS_SKIN_NAMES = {
  'grawlstone:forge': { name: 'MAGMA GRAWLSTONE', subtitle: 'THE LAVA COLOSSUS' },
  'grawlstone:frost': { name: 'FROZEN GRAWLSTONE', subtitle: 'THE ICEBOUND COLOSSUS' },
  'grawlstone:candy': { name: 'SUGAR GRAWLSTONE', subtitle: 'THE ROCK CANDY COLOSSUS' },
  'ironhorn:frost': { name: 'FROSTHORN', subtitle: 'THE ICE RHINO' },
  'mothermurk:candy': { name: 'CANDY QUEEN', subtitle: 'RULER OF THE SWEETS' },
  'oculon:citadel': { name: 'OCULON', subtitle: 'THE CITADEL EYE' },
};

/** Resolved look of a level boss cfg: { type (a real class), skin (or null), name, subtitle }. */
export function bossLook(cfg = {}) {
  const type = BOSSES[cfg.type] ? cfg.type : 'grawlstone';
  const def = BOSSES[type];
  const skin = cfg.skin && cfg.skin !== def.native ? cfg.skin : null;
  const named = BOSS_SKIN_NAMES[type + ':' + skin] || def;
  return { type, skin, name: named.name, subtitle: named.subtitle };
}
