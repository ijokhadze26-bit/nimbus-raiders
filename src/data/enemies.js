// Murkling types (data only). speed = multiplier of HORDE.baseSpeed; r = contact/hit radius (u).
// front: spawn-row priority (lower = placed toward the front of the blob).
// Update 3 (stage 3 "enemies"): five new types with their own behaviour blocks (read by game/hordeai.js),
// ELITE versions, per-world smarter-enemy rules (HORDE_AI) and the horde wave split (WAVES, game/hordewaves.js).

export const ENEMY_TYPES = ['grunt', 'runner', 'tank', 'shield', 'bomber', 'blaster', 'healer', 'spawner', 'sniper', 'flyer'];

export const ENEMIES = {
  grunt: { id: 'grunt', name: 'Murkling', hp: 1, speed: 1.0, r: 0.4, spacing: 0.72, color: '#8a4dff', front: 2, scale: 1 },
  runner: { id: 'runner', name: 'Dashling', hp: 1, speed: 1.9, r: 0.32, spacing: 0.64, color: '#ff8a2b', front: 3, scale: 1 },
  tank: { id: 'tank', name: 'Bulwark', hp: 8, speed: 0.65, r: 0.72, spacing: 1.35, color: '#5b6a8e', front: 0, scale: 1, contactKills: 3, contactInterval: 0.15 },
  shield: { id: 'shield', name: 'Shieldbearer', hp: 2, speed: 0.85, r: 0.46, spacing: 0.86, color: '#7a3fe8', front: 1, scale: 1, shieldHits: 6 },
  bomber: { id: 'bomber', name: 'Fizzbomb', hp: 2, speed: 1.2, r: 0.42, spacing: 0.8, color: '#ff3b4e', front: 2, scale: 1, blastRadius: 2.2, blastKills: 4 },
  // BOOMLING: dies (shot or contact) in a 0.4 s telegraphed swell, then bursts: kills up to `kills` squad
  // members within r (nearest first) and every enemy within r. Kill it far from the squad.
  blaster: { id: 'blaster', name: 'Boomling', hp: 2, speed: 1.05, r: 0.44, spacing: 0.88, color: '#ffb12e', front: 2, scale: 1, boom: { r: 2.4, swell: 0.4, kills: 8 } },
  // MENDLING: every `every` s its aura heals the enemies within r by pct of their max hp; hangs at the back.
  healer: { id: 'healer', name: 'Mendling', hp: 2, speed: 0.8, r: 0.4, spacing: 0.9, color: '#4df0a8', front: 9, scale: 1, heal: { r: 4, pct: 0.06, every: 1 } },
  // BROODLING HIVE: slow tough sack; pops a small Murkling every `every` s (at most `cap`) until destroyed.
  spawner: { id: 'spawner', name: 'Broodling Hive', hp: 14, speed: 0.42, r: 0.8, spacing: 1.6, color: '#9a5ab8', front: 8, scale: 1, contactKills: 2, contactInterval: 0.2,
    brood: { every: 1.2, cap: 10, type: 'grunt', size: 0.72, range: 64 } },
  // SPITLING: stops near..far u ahead of the squad and lobs goo: a ground marker (flight >= 0.9 s), then up to
  // `kills` members within r die. Fires `shots` times, then charges like the rest.
  sniper: { id: 'sniper', name: 'Spitling', hp: 3, speed: 1.0, r: 0.42, spacing: 0.9, color: '#a6d82a', front: 9, scale: 1,
    spit: { near: 30, far: 38, every: 1.7, first: 0.6, flight: 1.1, r: 1.05, kills: 2, shots: 3 } },
  // FLAPLING: hovers at y over gates, gaps and hazards; dives into the squad from `dive` u out.
  flyer: { id: 'flyer', name: 'Flapling', hp: 1, speed: 1.35, r: 0.4, spacing: 0.95, color: '#38c2f2', front: 3, scale: 1, fly: { y: 2.3, dive: 9 } },
};

export const ENEMY_INDEX = Object.fromEntries(ENEMY_TYPES.map((t, i) => [t, i]));

/** ELITE versions (horde event `elite: 0..1` fraction or `eliteTypes: [...]`): x3 hp, a gold glow, a bit bigger. */
export const ELITE = { hp: 3, size: 1.18, boomKills: 12, spitKills: 3, broodCap: 14, color: '#ffc21a' };

/**
 * Smarter enemies per world (index = world 1..5; endless / practice / custom runs = world 1 unless the def
 * sets `ai`). sprint: Dashlings within sprintR u speed up x sprint (gruntSprint: Murklings too);
 * dodge: share of Murklings + Dashlings that sidestep incoming fire (cooldown dodgeCd s); turn: Shieldbearers
 * turn their shield toward the densest fire at this rad/s and only block shots from the front;
 * spitMul: Spitling fire interval multiplier.
 */
export const HORDE_AI = [
  null,
  {},
  { sprint: 1.6, sprintR: 12, dodge: 0.3, dodgeCd: 2.2 },
  { sprint: 1.6, sprintR: 12, dodge: 0.3, dodgeCd: 2.2, turn: 2.2 },
  { sprint: 1.65, sprintR: 12, dodge: 0.35, dodgeCd: 2.0, turn: 2.6 },
  { sprint: 1.75, sprintR: 14, dodge: 0.45, dodgeCd: 1.5, turn: 3.2, gruntSprint: 1.3, spitMul: 0.8 },
];

/**
 * Horde waves: a campaign horde event (def.world set, or an event / def with `waves`) splits into a probe
 * group, a pause, then the rush. frac = share of the count, delay = pause (s) after the previous wave broke,
 * speed = charge multiplier. `waves: false` on an event keeps the old single blob.
 */
export const WAVES = {
  minCount: 18,
  pause: [0, 2.0, 1.8, 1.6, 1.4, 1.2],
  normal: (pause) => [{ frac: 0.3, delay: 0, speed: 1 }, { frac: 0.7, delay: pause, speed: 1.25 }],
  rush: (pause) => [{ frac: 0.25, delay: 0, speed: 1 }, { frac: 0.35, delay: pause, speed: 1.2 }, { frac: 0.4, delay: pause * 0.8, speed: 1.3 }],
};
