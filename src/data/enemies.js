// Murkling types (data only). speed = multiplier of HORDE.baseSpeed; r = contact/hit radius (u).
// front: spawn-row priority (lower = placed toward the front of the blob).

export const ENEMY_TYPES = ['grunt', 'runner', 'tank', 'shield', 'bomber'];

export const ENEMIES = {
  grunt: { id: 'grunt', name: 'Murkling', hp: 1, speed: 1.0, r: 0.4, spacing: 0.72, color: '#8a4dff', front: 2, scale: 1 },
  runner: { id: 'runner', name: 'Dashling', hp: 1, speed: 1.9, r: 0.32, spacing: 0.64, color: '#ff8a2b', front: 3, scale: 1 },
  tank: { id: 'tank', name: 'Bulwark', hp: 8, speed: 0.65, r: 0.72, spacing: 1.35, color: '#5b6a8e', front: 0, scale: 1, contactKills: 3, contactInterval: 0.15 },
  shield: { id: 'shield', name: 'Shieldbearer', hp: 2, speed: 0.85, r: 0.46, spacing: 0.86, color: '#7a3fe8', front: 1, scale: 1, shieldHits: 6 },
  bomber: { id: 'bomber', name: 'Fizzbomb', hp: 2, speed: 1.2, r: 0.42, spacing: 0.8, color: '#ff3b4e', front: 2, scale: 1, blastRadius: 2.2, blastKills: 4 },
};

export const ENEMY_INDEX = Object.fromEntries(ENEMY_TYPES.map((t, i) => [t, i]));
