// Weapons (data only, SPEC2 §1-§2). Seven themed weapons, each with five power levels Mk I..V.
// Every number here is a starting value the balancer may move (SPEC2 §8.4); code reads them, never retypes.
//
// Power model: MKREF[mk] is the reference single-target damage per second of ONE raider at that Mk
// (pistol-relative old tier curve x 2.2). A weapon's sheet DPS per raider = MKREF[mk] * K; crowd strength
// comes from its mechanic (pierce, cone, splash, chain, bounce, pull) and the matchup tables (matchups.js).
// Internal hp is tiny (a Murkling has 1); the UI shows damage x100 (DISPLAY_SCALE).

export const MAX_MK = 5;
export const MK_POWER = [1, 2.05, 3.2, 6.1, 9.3];
/** Reference damage / s per raider at Mk 1..5 (index = mk; index 0 unused). */
export const MKREF = [0, ...MK_POWER.map((p) => Math.round(2.2 * p * 1000) / 1000)];
/** Bullet / gun / hit-particle scale per Mk (index mk-1). */
export const MK_SCALE = [1, 1.12, 1.25, 1.4, 1.6];
/** Tracer volleys per raider per second (gate + barrel economy, weapon independent, monotonic). */
export const GATE_RATE = [2.2, 3.6, 5.5, 6.5, 8.0];
export const DISPLAY_SCALE = 100;
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const mkLabel = (mk) => 'Mk ' + ROMAN[Math.max(1, Math.min(MAX_MK, mk | 0))];

// ---------------- the old pistol -> plasma ladder (FOUNDATION stubs only; final behaviours never import it) ----
export const LEGACY_TIERS = [
  { tier: 1, id: 'pistol', name: 'Blaster Pistol', color: '#ffd34d', rate: 2.2, damage: 1, speed: 46, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'bolt', length: 0.55, radius: 0.1, core: '#fff7d1' } },
  { tier: 2, id: 'rifle', name: 'Storm Rifle', color: '#ff8a3d', rate: 3.6, damage: 1.25, speed: 54, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'tracer', length: 1.25, radius: 0.07, core: '#ffe2c4', trail: '#ffb36b' } },
  { tier: 3, id: 'laser', name: 'Rapid Laser', color: '#45ff7a', rate: 7, damage: 1, speed: 70, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'laser', length: 2.3, radius: 0.04, core: '#e4ffe9' } },
  { tier: 4, id: 'beam', name: 'Beam Cannon', color: '#d64dff', rate: 3, damage: 4.5, speed: 62, pierce: 2, pellets: 1, spread: 0,
    style: { shape: 'beam', length: 2.0, radius: 0.13, core: '#fbe3ff', trail: '#a24dff' } },
  { tier: 5, id: 'plasma', name: 'Plasma Scatter', color: '#4de1ff', rate: 3.6, damage: 1.9, speed: 56, pierce: 0, pellets: 3, spread: 7,
    style: { shape: 'orb', length: 0.34, radius: 0.17, core: '#e6fbff', trail: '#9ef0ff' } },
];
/** Stubs fire LEGACY_TIERS[mk-1] at this damage factor (with Pip's +10% rate and +15% favourite ~ 1.01x HEAD). */
export const LEGACY_DAMAGE = 0.8;
/** @deprecated shop gun-paint preview only (UI replaces it); same rows as LEGACY_TIERS. */
export const WEAPONS = LEGACY_TIERS;

// Helper shots (drones, barrel turrets, road turrets). Registered bullet styles 'drone' and 'shell'.
export const HELPER_SHOTS = [
  { id: 'drone', name: 'Drone Laser', color: '#45ff7a', rate: 5, damage: 1.5, speed: 64, pierce: 0, pellets: 1, spread: 0,
    style: { shape: 'laser', length: 1.3, radius: 0.035, core: '#eaffef' } },
  { id: 'shell', name: 'Turret Shell', color: '#ff9a3d', rate: 1.6, damage: 14, speed: 48, pierce: 3, pellets: 1, spread: 0,
    style: { shape: 'shell', length: 0.4, radius: 0.2, core: '#fff6d8', trail: '#ffd25a' } },
];

// ---------------- helpers ----------------
const rows = (keys, table, common = {}) => table.map((r, i) => ({ mk: i + 1, ...common, ...Object.fromEntries(keys.map((k, j) => [k, r[j]])) }));
const look = (list) => list.map(([color, core, trail]) => ({ color, core, trail: trail || color }));

// ---------------- the seven weapons ----------------
export const WEAPON_DEFS = [
  {
    id: 'emberstorm', name: 'Emberstorm', short: 'EMBER', element: 'fire', tag: 'FIRE',
    blurb: 'Short-range flamethrower that sets crowds on fire. Weak vs armour, shields, most bosses.',
    special: 'Flames go through several enemies and keep burning them after you run past.',
    K: 0.85, visualCap: 200, burnMul: 1.0,
    mk: rows(['rate', 'pellets', 'dmg', 'burnTime', 'cone', 'range', 'visRange', 'pierce'], [
      [4.0, 3, 0.078, 1.2, 24, 22, 13, 2],
      [4.4, 3, 0.145, 1.3, 28, 24, 14.5, 2],
      [4.8, 3, 0.208, 1.5, 32, 26, 16, 3],
      [5.2, 3, 0.366, 1.6, 36, 28, 17.5, 3],
      [5.6, 3, 0.518, 1.8, 40, 30, 19, 4],
    ], { speed: 30, bossJetSpread: 8, bossRange: 40 }),
    look: { mk: look([['#ff8a2a', '#ffe08a', '#ffb05a'], ['#ff7a28', '#ffe49a', '#ffa850'], ['#ff6a25', '#ffeaa8', '#ff9a46'], ['#ff5222', '#fff0bc', '#ff8a3c'], ['#ff3b1f', '#fff6d0', '#ff7a32']]), pilot: '#4d9bff' },
    gunTint: ['#ff8a2a', '#ff7a28', '#ff6a25', '#ff5222', '#ff3b1f'], gunBody: '#3a2a2a',
    tracerLook: 'ember',
    strong: [{ id: 'grunt' }, { id: 'bomber', why: 'sets them off early' }],
    weak: [{ id: 'tank' }, { id: 'shield', why: 'shields block flames and burn' }, { id: 'oculon' }, { id: 'ironhorn' }, { id: 'tempestking' }],
    sfx: { fire: 'wpn_ember_ignite', loop: 'wpn_ember_loop', ignite: 'wpn_ember_ignite' },
    bars: { damage: 0.55, rate: 0.95, range: 0.35, special: 0.9, specialLabel: 'Burn' },
    mkLook: ['Stubby nozzle', 'Striped fuel tank', 'Glowing core, hotter flames', 'Twin nozzle, bigger flames', 'Gold trim, white inner flame, ember ring bursts'],
    preview: { pattern: 'cone' }, unlock: { level: 5, coins: 900 },
  },
  {
    id: 'glacier', name: 'Glacier Lance', short: 'GLACIER', element: 'ice', tag: 'ICE',
    blurb: 'Ice shards pierce a line of enemies, slow them and sometimes freeze them solid.',
    special: 'Every shard goes through several enemies. Frozen enemies shatter when you touch them.',
    K: 0.9, visualCap: 200, shieldHits: 2,
    mk: rows(['rate', 'dmg', 'pierce', 'slow', 'slowTime', 'freeze', 'freezeTime'], [
      [2.6, 0.762, 3, 0.30, 1.5, 0.04, 1.0],
      [2.8, 1.450, 4, 0.35, 1.75, 0.05, 1.2],
      [3.0, 2.112, 4, 0.40, 2.0, 0.06, 1.4],
      [3.2, 3.774, 5, 0.45, 2.25, 0.07, 1.7],
      [3.4, 5.416, 6, 0.50, 2.5, 0.08, 2.0],
    ], { speed: 72, range: 60, pellets: 1, freezeCap: 0.35, frozenMul: 1.25 }),
    look: { mk: look([['#9fe8ff', '#ffffff', '#d8f6ff'], ['#8ce0ff', '#ffffff', '#d4ecff'], ['#78d8ff', '#ffffff', '#d0e2ff'], ['#62cdff', '#ffffff', '#ccd2ff'], ['#4dc3ff', '#ffffff', '#c9b8ff']]) },
    gunTint: ['#bff0ff', '#a9e8ff', '#93e0ff', '#7dd6ff', '#66ccff'], gunBody: '#f4fbff',
    tracerLook: null,
    strong: [{ id: 'runner' }, { id: 'shield', why: 'each shard breaks 2 shield hits' }, { id: 'oculon' }],
    weak: [{ id: 'tank' }, { id: 'ironhorn' }],
    sfx: { fire: 'wpn_ice_fire', hit: 'wpn_ice_hit', freeze: 'wpn_ice_freeze', shatter: 'wpn_ice_shatter' },
    bars: { damage: 0.7, rate: 0.55, range: 1.0, special: 0.7, specialLabel: 'Pierce + Slow' },
    mkLook: ['Plain crystal barrel', 'Frost fins', 'Glowing core', 'Bigger shards, frost rings on the ground', 'Gold trim, twin crystal shards'],
    preview: { pattern: 'pierce' }, unlock: { level: 3, coins: 500 },
  },
  {
    id: 'sugarrush', name: 'Sugar Rush', short: 'SUGAR', element: 'candy', tag: 'CANDY',
    blurb: 'Bouncy candy bombs splash crowds and leave sticky caramel. Slower on most bosses.',
    special: 'Splash hits right over shields. Caramel puddles slow everything that steps in.',
    K: 0.55, bossK: 0.83, visualCap: 200,
    mk: rows(['rate', 'dmg', 'splashR', 'throw', 'bounces', 'puddleR', 'puddleTime', 'puddleSlow'], [
      [1.6, 0.756, 1.8, 18, 1, 2.0, 3.0, 0.35],
      [1.7, 1.459, 2.0, 20, 1, 2.2, 3.5, 0.40],
      [1.8, 2.151, 2.2, 22, 1, 2.4, 4.0, 0.45],
      [1.9, 3.885, 2.5, 24, 2, 2.7, 4.5, 0.50],
      [2.0, 5.627, 2.8, 26, 2, 3.0, 5.0, 0.55],
    ], { pellets: 1, lobTime: 0.8, apex: 3.5, jitter: 0.6, band: 2.5, minLand: 5, hop: 5, hopTime: 0.4, bounceDmg: 0.5, bounceR: 0.75,
      puddleGap: 0.5, puddleMax: 5, stickyTime: 0.8 }),
    look: { mk: look([['#ff9ade', '#fff0fa', '#8affc8'], ['#ff8ad8', '#fff0fa', '#8affc8'], ['#ff79d2', '#fff0fa', '#fff08a'], ['#ff68cc', '#fff0fa', '#b48aff'], ['#ff57c6', '#ffffff', '#fff08a']]),
      candy: ['#ff8ad8', '#8affc8', '#fff08a', '#b48aff'], caramel: '#d98a2b' },
    gunTint: ['#ff9ade', '#ff8ad8', '#ff79d2', '#ff68cc', '#ff57c6'], gunBody: '#8affc8',
    tracerLook: 'sugar',
    strong: [{ id: 'grunt' }, { id: 'shield', why: 'splashes over shields' }, { id: 'bomber' }],
    weak: [{ id: 'runner' }, { id: 'oculon' }, { id: 'ironhorn' }, { id: 'tempestking' }],
    sfx: { fire: 'wpn_sugar_fire', land: 'wpn_sugar_pop', puddle: 'wpn_sugar_goo' },
    bars: { damage: 0.5, rate: 0.3, range: 0.4, special: 0.85, specialLabel: 'Splash + Puddles' },
    mkLook: ['Round candy mortar', 'Swirl stripes', 'Glowing candy core', 'Bigger bombs, two bounces', 'Gold trim, sparkle trail, heart-star splash'],
    preview: { pattern: 'lob' }, unlock: { level: 9, coins: 1800 },
  },
  {
    id: 'spectra', name: 'Spectra Prism', short: 'SPECTRA', element: 'light', tag: 'LIGHT',
    blurb: 'Rainbow beam that splits into extra beams on a hit. The best boss killer.',
    special: 'Highest damage on one target. Each hit splits into small beams that find nearby enemies.',
    K: 1.35, visualCap: 200,
    mk: rows(['rate', 'dmg', 'splits', 'splitDmg', 'splitRange', 'beamLen'], [
      [3.0, 0.990, 2, 0.35, 10, 3.5],
      [3.2, 1.903, 2, 0.35, 11, 3.8],
      [3.4, 2.795, 3, 0.35, 12, 4.2],
      [3.6, 5.032, 3, 0.35, 13, 4.6],
      [3.8, 7.269, 4, 0.35, 14, 5.2],
    ], { speed: 95, range: 60, pierce: 0, pellets: 1, fan: 16 }),
    look: { mk: look([['#e8f0ff', '#ffffff', '#ff8ad8'], ['#f0e8ff', '#ffffff', '#ffb34d'], ['#ffe8f8', '#ffffff', '#7dff6a'], ['#fff0e0', '#ffffff', '#4dc3ff'], ['#ffffff', '#ffffff', '#a26bff']]),
      rainbow: ['#ff5a7a', '#ffb34d', '#fff08a', '#7dff6a', '#4dc3ff', '#a26bff'] },
    gunTint: ['#ffffff', '#fff6fe', '#fff0fb', '#ffeaf8', '#ffe4f5'], gunBody: '#ffffff',
    tracerLook: null,
    strong: [{ id: 'tank' }, { id: 'grawlstone' }, { id: 'oculon' }, { id: 'mothermurk' }, { id: 'ironhorn' }, { id: 'tempestking' }],
    weak: [{ id: 'grunt', why: 'big crowds waste its power on tiny enemies' }],
    sfx: { fire: 'wpn_prism_fire', split: 'wpn_prism_split' },
    bars: { damage: 1.0, rate: 0.65, range: 1.0, special: 0.6, specialLabel: 'Split beams' },
    mkLook: ['Glass prism', 'Lens fin', 'Glowing core, second colour sleeve', 'Bigger beams, three splits', 'Gold trim, halo ring, four splits'],
    preview: { pattern: 'split' }, unlock: { level: 11, coins: 2500 },
  },
  {
    id: 'gearworks', name: 'Gearworks', short: 'GEARS', element: 'factory', tag: 'FACTORY',
    blurb: 'Spinning saw gears bounce between enemies, and it drops mini turrets on the road.',
    special: 'Best against armour: gears shred Bulwarks and break 3 shield hits each.',
    K: 0.9, visualCap: 200, shieldHits: 3,
    mk: rows(['rate', 'dmg', 'bounces', 'turretEvery', 'turretLife'], [
      [2.2, 0.900, 2, 9, 6],
      [2.4, 1.691, 2, 8, 6],
      [2.6, 2.437, 3, 7, 7],
      [2.8, 4.314, 4, 6, 7],
      [3.0, 6.138, 5, 5, 8],
    ], { speed: 36, range: 42, pierce: 0, pellets: 1, bounceR: 7, bounceMul: 0.8, bounceFly: 9, spin: 20,
      turretMax: 3, turretDps: 0.12, turretMinCount: 10, turretBehind: 30, turretAhead: 3 }),
    look: { mk: look([['#d9a441', '#c8d0dc', '#ffb36b'], ['#e0ab45', '#c8d0dc', '#ffb36b'], ['#e8a03a', '#ff6a3a', '#ff8a3c'], ['#efb64e', '#ff6a3a', '#ff8a3c'], ['#ffc531', '#fff3c4', '#ffd34d']]) },
    gunTint: ['#d9a441', '#e0ab45', '#e8b049', '#efb64e', '#ffc531'], gunBody: '#c8d0dc',
    tracerLook: null,
    strong: [{ id: 'tank' }, { id: 'shield', why: 'each gear breaks 3 shield hits' }, { id: 'ironhorn' }],
    weak: [{ id: 'runner' }, { id: 'oculon' }],
    sfx: { fire: 'wpn_gear_fire', bounce: 'wpn_gear_ting', turret: 'wpn_gear_turret' },
    bars: { damage: 0.7, rate: 0.5, range: 0.7, special: 0.75, specialLabel: 'Bounce + Turrets' },
    mkLook: ['Brass gear launcher', 'Steel fin', 'Red-hot teeth', 'Bigger gears, more bounces', 'Gold trim, double gears, spark trail'],
    preview: { pattern: 'bounce' }, unlock: { level: 7, coins: 1300 },
  },
  {
    id: 'thunderclap', name: 'Thunderclap', short: 'THUNDER', element: 'storm', tag: 'STORM',
    blurb: 'Lightning bolts that chain from enemy to enemy. A good all-rounder.',
    special: 'Every hit jumps to more enemies nearby, a bit weaker each jump.',
    K: 0.8, visualCap: 200,
    mk: rows(['rate', 'dmg', 'jumps', 'reach'], [
      [2.4, 0.733, 2, 4.0],
      [2.6, 1.388, 2, 4.5],
      [2.8, 2.011, 3, 5.0],
      [3.0, 3.579, 4, 5.5],
      [3.2, 5.115, 5, 6.0],
    ], { speed: 85, range: 55, pierce: 0, pellets: 1, falloff: 0.7 }),
    look: { mk: look([['#ffe14d', '#ffffff', '#6f6bff'], ['#ffe85e', '#ffffff', '#6f6bff'], ['#fff070', '#ffffff', '#7a75ff'], ['#fff585', '#ffffff', '#857fff'], ['#fffbb0', '#ffffff', '#9a8aff']]) },
    gunTint: ['#ffe14d', '#ffe85e', '#fff070', '#fff585', '#fffbb0'], gunBody: '#c87a3a',
    tracerLook: null,
    strong: [{ id: 'bomber', why: 'chains set them off' }, { id: 'ironhorn', why: 'metal conducts lightning' }],
    weak: [{ id: 'tempestking', why: 'a storm lord shrugs off lightning' }],
    sfx: { fire: 'wpn_storm_fire', chain: 'wpn_storm_arc' },
    bars: { damage: 0.65, rate: 0.55, range: 0.9, special: 0.7, specialLabel: 'Chain' },
    mkLook: ['Forked prongs', 'Copper coil stripe', 'Glowing core, forked side sparks', 'Bigger bolts, four jumps', 'Gold trim, thick bolts, scorch rings'],
    preview: { pattern: 'chain' }, unlock: { level: 1, coins: 0, start: true },
  },
  {
    id: 'voidsiphon', name: 'Void Siphon', short: 'VOID', element: 'dark', tag: 'DARK',
    blurb: 'Slow orbs that open small black holes, pulling enemies together and crushing them.',
    special: 'Black holes pack crowds together. Pairs with Sugar Rush, Meteor Drop and Fizzbombs.',
    K: 0.75, visualCap: 12, direct: 0.2,
    mk: rows(['rate', 'dmg', 'holeTime', 'pullR', 'pullSpeed', 'coreR'], [
      [0.9, 1.833, 1.6, 3.5, 5.0, 1.2],
      [1.0, 3.382, 1.8, 4.0, 5.5, 1.3],
      [1.1, 4.800, 2.0, 4.5, 6.0, 1.4],
      [1.2, 8.387, 2.2, 5.0, 6.5, 1.6],
      [1.3, 11.804, 2.5, 5.5, 7.0, 1.8],
    ], { speed: 16, range: 26, pierce: 0, pellets: 1, holeMax: 6, mergeR: 3, mergeGrow: 1.08, mergeCap: 1.3, tankPull: 0.3 }),
    look: { mk: look([['#3b1a6e', '#ff4bd8', '#b44bff'], ['#431c7e', '#ff55dc', '#b44bff'], ['#4b1e8e', '#ff60df', '#c05bff'], ['#55209e', '#ff6de2', '#c96bff'], ['#5f22ae', '#ff7ae6', '#d47aff']]) },
    gunTint: ['#8a4dff', '#9450ff', '#9e54ff', '#a858ff', '#b25cff'], gunBody: '#1d1530',
    tracerLook: 'void',
    strong: [{ id: 'grunt' }, { id: 'runner' }, { id: 'mothermurk' }, { id: 'tempestking' }],
    weak: [{ id: 'tank' }, { id: 'ironhorn' }],
    sfx: { fire: 'wpn_void_fire', hole: 'wpn_void_hole', pop: 'wpn_void_pop' },
    bars: { damage: 0.55, rate: 0.2, range: 0.45, special: 0.95, specialLabel: 'Black holes' },
    mkLook: ['Orb in a claw cage', 'Violet fins', 'Glowing magenta core', 'Bigger holes that pull harder', 'Gold trim, accretion ring of stars'],
    preview: { pattern: 'hole' }, unlock: { level: 13, coins: 3200 },
  },
];

export const WEAPON_IDS = WEAPON_DEFS.map((d) => d.id);
export const WEAPON_BY_ID = Object.fromEntries(WEAPON_DEFS.map((d) => [d.id, d]));
export const DEFAULT_WEAPON = 'thunderclap';

/**
 * Test-only reference weapon (debug.setLoadout(h, 'ref')): a plain straight bullet at K = 1, element
 * neutral, no special. Never in WEAPON_IDS, never in the UI. Calibrates the balance gauntlets.
 */
export const REF_WEAPON = {
  id: 'ref', name: 'Reference', short: 'REF', element: 'neutral', tag: 'TEST', test: true, K: 1, visualCap: 200,
  mk: MK_POWER.map((_, i) => ({ mk: i + 1, rate: 3, dmg: Math.round((MKREF[i + 1] / 3) * 10000) / 10000, speed: 60, range: 60, pierce: 0, pellets: 1 })),
  look: { mk: look([['#ffffff', '#ffffff'], ['#ffffff', '#ffffff'], ['#ffffff', '#ffffff'], ['#ffffff', '#ffffff'], ['#ffffff', '#ffffff']]) },
  gunTint: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], tracerLook: null, strong: [], weak: [],
  sfx: { fire: 'wpn_storm_fire' }, bars: { damage: 0.5, rate: 0.5, range: 0.5, special: 0 }, unlock: { level: 99, coins: 0 }, preview: { pattern: 'pierce' },
};

/** Def for an id (weapons + the test reference), falling back to the starter. */
export function weaponDef(id) { return WEAPON_BY_ID[id] || (id === 'ref' ? REF_WEAPON : WEAPON_BY_ID[DEFAULT_WEAPON]); }
/** Mk row of a def (clamped). */
export function mkRow(def, mk) { return def.mk[Math.max(1, Math.min(MAX_MK, mk | 0)) - 1]; }

