// Hand-made levels (data only). Events are sorted by `at` (distance from the start).
// Stage-1 placeholder: level 1 contains gate rows only and no boss (reaching the end wins).

export const LEVELS = [
  {
    id: 1, name: 'Cloud Cadets', theme: 'noon', length: 250, speed: 9, stars: [40, 110], reward: 40,
    boss: null,
    events: [
      { type: 'gate', at: 28, lane: 'L', op: 'add', value: 3, max: 6 },
      { type: 'gate', at: 28, lane: 'R', op: 'add', value: 1, max: 4 },

      { type: 'gate', at: 62, lane: 'L', op: 'add', value: -2, max: 5 },
      { type: 'gate', at: 62, lane: 'R', op: 'add', value: 4, max: 8 },

      { type: 'gate', at: 96, lane: 'C', op: 'mul', rung: 3, hitsPerStep: 400 },

      { type: 'gate', at: 132, lane: 'L', op: 'add', value: -10, max: 14 },
      { type: 'gate', at: 132, lane: 'R', op: 'add', value: 6, max: 10, moving: { range: 1.1, speed: 1.4 } },

      { type: 'gate', at: 168, lane: 'L', op: 'div', rung: 2, hitsPerStep: 160 },
      { type: 'gate', at: 168, lane: 'R', op: 'add', value: 10, max: 18 },

      { type: 'gate', at: 204, lane: 'L', op: 'add', value: 15, max: 22, moving: { range: 1.0, speed: 1.1 } },
      { type: 'gate', at: 204, lane: 'R', op: 'add', value: -6, max: 4 },

      { type: 'gate', at: 236, lane: 'L', op: 'mul', rung: 3, hitsPerStep: 5000 },
      { type: 'gate', at: 236, lane: 'R', op: 'add', value: 25, max: 35 },
    ],
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export const LEVEL_COUNT = 15;
