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
  // Spec start values were 0.3 / 0.15; at the road edge (x = ±4.4) that framed Pip and half a big squad
  // out of the portrait frame, so the camera follows the leader further sideways.
  followX: 0.68,
  lookX: 0.36,
  // Big squads trail far behind Pip (a 320-member blob is ~10u deep): as the blob grows (crowd 0..1 over
  // blob radius 0.6..4.9) the camera rises (+80%), backs off (+40%) and looks closer (-7u) so the back rows
  // stay above the bottom edge while the road ahead stays visible.
  crowdLift: 0.8,
  crowdBack: 0.4,
  crowdLook: 7,
  // 9:16 frames (16:9 phones, desktop) keep fov 52 (no tall-phone widening), so a big blob's lift pushed the
  // next gate row under the top HUD: there the camera backs off further and looks further ahead with the crowd
  wideCrowdBack: 0.55,
  wideCrowdLook: 2.5,
  crowdZoom: 0.4,    // boss arena: uniform pull-back with the crowd
  damping: 6,
  bossHeight: 13,
  bossBack: 15,
  bossLook: 12,
  // boss arena on 9:16 frames (fov 52): rise / back off / look-ahead shift so the boss clears the HP bar
  bossWideLift: 0.32,
  bossWideBack: 0.45,
  bossWideLook: 1.5,
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
  budgetHigh: 200,   // simulated (bundled) bullets / s, every quality
  budgetLow: 110,    // low quality draws this many of them (simulation always runs budgetHigh)
  range: 60,         // how far ahead of the leader a bullet travels
  y: 0.55,
  capacityPerStyle: 640,
  maxActive: 1600,   // all simulated bullets incl. tracers (update 2)
};

// Bullet target masks (update 2): a bullet only sweeps target systems whose bit is in its mask.
export const HIT = { GATE: 1, BARREL: 2, ENEMY: 4, BOSS: 8, ALL: 15 };
// Tracers: invisible-to-enemies helper shots that carry the gate / barrel economy for every weapon.
export const TRACER = { speed: 60, range: 60 };

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
  autoMinFps: 48,      // auto quality: rolling fps EMA below this ...
  autoLowSeconds: 2.5, // ... for this long (outside spawn/boss-drop hitches) -> switch to low
  autoTau: 1.5,        // EMA time constant (s)
  shadowMapSize: 1024,
  shadowExtent: 16,
};

export const VIEW = { aspect: 0.5625 };
