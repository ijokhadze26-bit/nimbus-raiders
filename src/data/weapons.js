// Weapon tiers 1..6. rate = volleys per member per second; pellets fan out by `spread` degrees.
// style drives the bullet look (see game/bullets.js).

export const WEAPONS = [
  { tier: 1, id: 'pistol', name: 'Blaster Pistol', color: '#ffd34d', rate: 2.2, damage: 1, speed: 46, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'bolt', length: 0.55, radius: 0.1, core: '#fff7d1' } },
  { tier: 2, id: 'rifle', name: 'Storm Rifle', color: '#ff8a3d', rate: 3.6, damage: 1.25, speed: 54, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'tracer', length: 1.25, radius: 0.07, core: '#ffe2c4' } },
  { tier: 3, id: 'laser', name: 'Rapid Laser', color: '#45ff7a', rate: 7, damage: 1, speed: 70, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'laser', length: 2.3, radius: 0.04, core: '#e4ffe9' } },
  { tier: 4, id: 'beam', name: 'Beam Cannon', color: '#d64dff', rate: 3, damage: 4.5, speed: 62, pierce: 2, pellets: 1, spread: 0,
    style: { shape: 'beam', length: 2.0, radius: 0.13, core: '#fbe3ff' } },
  { tier: 5, id: 'plasma', name: 'Plasma Scatter', color: '#4de1ff', rate: 3.6, damage: 1.9, speed: 56, pierce: 0, pellets: 3, spread: 7,
    style: { shape: 'orb', length: 0.34, radius: 0.17, core: '#e6fbff' } },
  { tier: 6, id: 'nova', name: 'Nova Lance', color: '#fff0a0', rate: 2.4, damage: 9, speed: 58, pierce: 5, pellets: 1, spread: 0,
    style: { shape: 'nova', length: 0.5, radius: 0.27, core: '#ffffff', trail: '#ffc531' } },
];

export const MAX_TIER = WEAPONS.length;

export function weaponForTier(tier) {
  return WEAPONS[Math.max(1, Math.min(MAX_TIER, tier | 0)) - 1];
}
