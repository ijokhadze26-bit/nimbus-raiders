// Global constants and tuning knobs (units ~ meters, +Y up, squad runs toward -Z).

export const ROAD_HALF = 5;
export const DIVIDER = { width: 0.35, height: 0.35 };
export const LANES = { L: -2.5, R: 2.5, C: 0 };
export const TARGET_CLAMP = 4.4;
export const MEMBER_CLAMP = 4.75;

export const RUN_SPEED = 9;
export const DT_MAX = 1 / 30;

export const MOVE = {
  ease: 14,          // leader x easing toward target (1/s)
  dragWorld: 11,     // world units per full container width of drag
  keySpeed: 10,      // u/s with keyboard
};

export const CAMERA = {
  fov: 52,
  height: 10.5,
  back: 12.5,
  lookAhead: 14,
  followX: 0.3,
  lookX: 0.15,
  damping: 6,
  bossHeight: 13,
  bossBack: 15,
  near: 0.3,
  far: 700,
};

export const FORMATION = {
  spacing: 0.52,
  ease: 10,
  maxRendered: 320,
  cap: 999,
  leaderGap: 0.55,   // distance between leader and the front of the blob
  leaderClear: 0.7,  // members never stand closer than this to Pip
};

export const START_SQUAD = 1;

export const BULLETS = {
  budgetHigh: 200,   // visual bullets / s
  budgetLow: 110,
  range: 60,         // how far ahead of the leader a bullet travels
  y: 0.55,
  capacityPerStyle: 640,
};

export const GATE = {
  width: 4.4,
  widthCenter: 9.4,
  height: 2.3,
  step: 1,
  maxExtra: 40,
  hitsPerStep: 12,
  rungs: [
    { op: 'div', k: 4 }, { op: 'div', k: 3 }, { op: 'div', k: 2 },
    { op: 'mul', k: 2 }, { op: 'mul', k: 3 }, { op: 'mul', k: 4 },
  ],
  spawnAhead: 110,   // spawn gate rows when this close
  passTolerance: 0.35,
};

export const HORDE = { baseSpeed: 5.5, steerRange: 18, despawnBehind: 6, spawnAhead: 75 };

export const COLORS = {
  good: '#2f8cff',
  goodLight: '#59c1ff',
  bad: '#ff3b4e',
  coin: '#ffc531',
  enemy: '#8a4dff',
  outline: '#1b3a8a',
};

export const QUALITY = {
  autoSampleSeconds: 4,
  autoMinFps: 48,
  shadowMapSize: 1024,
  shadowExtent: 16,
};

export const VIEW = { aspect: 0.5625 };
