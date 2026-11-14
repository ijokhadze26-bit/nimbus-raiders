// Hand-made levels (data only). Events are sorted by `at` (distance from the start).
// Stage-2 temporary set: levels 1-3 use gates, barrels, mixed hordes and the Grawlstone boss.
// (Oculon / Mother Murk arrive in a later stage; until then levels 2-3 fight Grawlstone at higher tiers.)

const gate = (at, lane, op, extra = {}) => ({ type: 'gate', at, lane, op, ...extra });
const barrel = (at, lane, hp, kind, amount) => ({ type: 'barrel', at, lane, hp, reward: { kind, amount } });
const horde = (at, count, mix, lane = 'both', extra = {}) => ({ type: 'horde', at, count, mix, lane, ...extra });

export const LEVELS = [
  {
    id: 1, name: 'Cloud Cadets', theme: 'noon', length: 330, speed: 9, stars: [35, 70], reward: 40,
    boss: { type: 'grawlstone', hp: 5000, tier: 1 },
    events: [
      gate(24, 'L', 'add', { value: 3, max: 6 }), gate(24, 'R', 'add', { value: 1, max: 4 }),
      barrel(48, 'L', 10, 'weapon', 1), barrel(48, 'R', 12, 'troops', 5),
      gate(76, 'L', 'add', { value: -2, max: 5 }), gate(76, 'R', 'add', { value: 4, max: 8 }),
      horde(104, 16, { grunt: 1 }),
      gate(130, 'C', 'mul', { rung: 3, hitsPerStep: 400 }),
      barrel(152, 'L', 40, 'troops', 10), barrel(152, 'R', 30, 'coins', 30),
      gate(176, 'L', 'add', { value: 6, max: 12, moving: { range: 1.0, speed: 1.3 } }), gate(176, 'R', 'add', { value: -5, max: 6 }),
      horde(206, 42, { grunt: 0.75, runner: 0.25 }),
      barrel(230, 'L', 70, 'drone', 1), barrel(230, 'R', 60, 'weapon', 1),
      gate(252, 'L', 'mul', { rung: 3, hitsPerStep: 2400 }), gate(252, 'R', 'add', { value: 12, max: 24 }),
      horde(284, 70, { grunt: 0.6, runner: 0.2, shield: 0.2 }),
      gate(312, 'L', 'add', { value: 8, max: 20 }), gate(312, 'R', 'add', { value: -10, max: 6 }),
    ],
  },
  {
    id: 2, name: 'Sunset Rally', theme: 'sunset', length: 400, speed: 9.3, stars: [45, 95], reward: 55,
    boss: { type: 'grawlstone', hp: 11000, tier: 2 },
    events: [
      gate(24, 'L', 'add', { value: 2, max: 6 }), gate(24, 'R', 'add', { value: 5, max: 9 }),
      horde(54, 34, { grunt: 0.7, runner: 0.3 }, 'L'),
      barrel(58, 'R', 14, 'weapon', 1),
      gate(84, 'C', 'mul', { rung: 3, hitsPerStep: 300 }),
      barrel(112, 'L', 50, 'drone', 1), barrel(112, 'R', 40, 'troops', 8),
      horde(140, 70, { grunt: 0.55, runner: 0.25, shield: 0.2 }),
      gate(168, 'L', 'add', { value: -8, max: 10 }), gate(168, 'R', 'add', { value: 6, max: 14, moving: { range: 1.1, speed: 1.5 } }),
      horde(196, 60, { grunt: 0.5, bomber: 0.3, runner: 0.2 }, 'R'),
      barrel(198, 'L', 70, 'weapon', 1),
      gate(226, 'L', 'div', { rung: 2, hitsPerStep: 500 }), gate(226, 'R', 'add', { value: 15, max: 30 }),
      horde(256, 130, { grunt: 0.55, runner: 0.2, shield: 0.15, bomber: 0.1 }),
      barrel(286, 'L', 90, 'turret', 1), barrel(286, 'R', 80, 'troops', 15),
      gate(312, 'L', 'mul', { rung: 3, hitsPerStep: 4000 }), gate(312, 'R', 'add', { value: 20, max: 40 }),
      horde(344, 220, { grunt: 0.55, runner: 0.2, shield: 0.15, bomber: 0.1 }),
      gate(380, 'L', 'add', { value: 10, max: 30 }), gate(380, 'R', 'add', { value: -15, max: 10 }),
    ],
  },
  {
    id: 3, name: 'Dusk Stampede', theme: 'dusk', length: 460, speed: 9.5, stars: [60, 130], reward: 70,
    boss: { type: 'grawlstone', hp: 20000, tier: 3 },
    events: [
      gate(24, 'L', 'add', { value: 4, max: 8 }), gate(24, 'R', 'add', { value: 2, max: 6 }),
      barrel(46, 'L', 16, 'weapon', 1), barrel(46, 'R', 20, 'troops', 6),
      gate(72, 'L', 'add', { value: 5, max: 10 }), gate(72, 'R', 'mul', { rung: 3, hitsPerStep: 500 }),
      horde(102, 60, { grunt: 0.6, runner: 0.25, tank: 0.15 }),
      barrel(130, 'L', 60, 'drone', 1), barrel(130, 'R', 55, 'weapon', 1),
      gate(156, 'C', 'mul', { rung: 3, hitsPerStep: 400 }),
      horde(186, 110, { grunt: 0.5, bomber: 0.25, shield: 0.25 }),
      gate(214, 'L', 'add', { value: -12, max: 12 }), gate(214, 'R', 'add', { value: 10, max: 22, moving: { range: 1.2, speed: 1.6 } }),
      barrel(240, 'L', 120, 'turret', 1), barrel(240, 'R', 100, 'troops', 20),
      horde(270, 180, { grunt: 0.45, runner: 0.2, tank: 0.1, bomber: 0.15, shield: 0.1 }),
      gate(300, 'L', 'add', { value: 25, max: 45 }), gate(300, 'R', 'mul', { rung: 3, hitsPerStep: 6000 }),
      barrel(326, 'L', 160, 'drone', 1), barrel(326, 'R', 150, 'weapon', 1),
      horde(356, 230, { grunt: 0.45, runner: 0.2, tank: 0.1, shield: 0.15, bomber: 0.1 }),
      gate(386, 'L', 'div', { rung: 2, hitsPerStep: 900 }), gate(386, 'R', 'add', { value: 20, max: 40 }),
      horde(414, 280, { grunt: 0.5, runner: 0.2, tank: 0.1, shield: 0.1, bomber: 0.1 }),
      gate(442, 'L', 'add', { value: 15, max: 35 }), gate(442, 'R', 'add', { value: -20, max: 10 }),
    ],
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export const LEVEL_COUNT = 15;
