// Plain-English text about the enemies, bosses and road hazards (update 3 stage 6, data only). The README
// "Worlds and Bosses" section (scripts/readme-gen.mjs) is built from this file + the game data, and the game's
// screens may reuse it. Every number in a text is read from the data files here, never typed, so a balance
// change shows up in the text too.
//   ENEMY_INFO  { enemy type: { blurb, tip } }           (every type in ENEMY_TYPES, plus 'elite')
//   BOSS_INFO   { 'type' or 'type:skin': { does, phase2?, phase3? } }   (a skin entry wins over its type)
//   HAZARD_INFO { hazard kind: { what, name?, tip? } }   (world 2-5 kinds take name + tip from hazardplan HINTS)
import { ENEMIES as E, ELITE } from './enemies.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (n) => (n === 1 ? 'second' : `${n} s`);

export const ENEMY_INFO = {
  grunt: { blurb: 'The basic purple Murkling. Weak alone, dangerous in a big crowd.', tip: 'Keep your squad big: every Raider shoots.' },
  runner: { blurb: 'Small and fast: it rushes ahead of the crowd.', tip: 'Shoot the front of the horde first. In later worlds they sprint when close.' },
  tank: {
    blurb: `A big armoured brute with ${E.tank.hp}x a Murkling's health. Slow, but one touch can cost ${E.tank.contactKills} Raiders.`,
    tip: 'Hit it hard early, or steer around it.',
  },
  shield: {
    blurb: `Its shield soaks up ${E.shield.shieldHits} hits before it breaks. From world 3 on it turns the shield to face your fire.`,
    tip: 'Splash, chains and saw gears get past the shield.',
  },
  bomber: {
    blurb: `A red fizzing bomb. If it reaches the squad it explodes and takes up to ${E.bomber.blastKills} Raiders with it.`,
    tip: 'Shoot it early: blown up in the crowd, it takes the Murklings around it instead.',
  },
  blaster: {
    blurb: `When it dies it swells up, then bursts: up to ${E.blaster.boom.kills} Raiders close by are lost, and every enemy close by too.`,
    tip: 'Kill it while it is far away, ideally in the middle of the horde.',
  },
  healer: {
    blurb: `Stays at the back and heals the enemies around it (${pct(E.healer.heal.pct)} of their health every ${secs(E.healer.heal.every)}).`,
    tip: 'Kill it first.',
  },
  spawner: {
    blurb: `A slow, tough sack (${E.spawner.hp}x a Murkling's health) that keeps popping out small Murklings until it is destroyed.`,
    tip: 'Focus it down quickly, before its little ones pile up.',
  },
  sniper: {
    blurb: `Stops far ahead and lobs goo at the squad. A marker shows where it lands; up to ${E.sniper.spit.kills} Raiders under it are lost.`,
    tip: 'Step out of the green marker, then shoot the Spitling.',
  },
  flyer: {
    blurb: 'Flies over gates, holes and hazards, then dives into the squad.',
    tip: 'Shoot it as it swoops in; walls and holes do not stop it.',
  },
  elite: {
    blurb: `Elite versions of any enemy glow gold, are a bit bigger and have ${ELITE.hp}x the health.`,
    tip: 'Save your hero ability for a crowd of glowing elites.',
  },
};

export const BOSS_INFO = {
  grawlstone: {
    does: 'A giant mossy rock that slams its fists down on red circles around the squad.',
    phase2: 'it slams twice and rolls huge boulders down a striped lane',
  },
  'grawlstone:forge': {
    does: 'Grawlstone in red-hot lava rock: it slams its fists down on red circles around the squad.',
    phase2: 'it slams twice and rolls huge boulders down a striped lane',
  },
  oculon: {
    does: 'A floating storm eye that throws glowing orbs at target circles and rains orbs on a striped lane.',
    phase2: 'it adds spiral orb volleys and a laser that sweeps across half of the road',
  },
  'oculon:citadel': {
    does: 'Oculon in Storm Citadel colours: it throws glowing orbs at target circles and rains orbs on a striped lane.',
    phase2: 'it adds spiral orb volleys and a laser that sweeps across half of the road',
  },
  ironhorn: {
    does: 'A mech rhino that charges down one half of the road (it glows red first) and stomps a quake down a lane. In the Volcanic Forge every charge leaves burning lava behind and the stomp rains embers.',
    phase2: 'it charges twice in a row and fakes a charge, switching sides at the last moment',
  },
  'ironhorn:frost': {
    does: 'Ironhorn in ice armour: it charges down one half of the road (it glows red first) and leaves frozen trails that break any Raider standing in them; it stomps a quake down a lane.',
    phase2: 'it charges twice in a row and fakes a charge, switching sides at the last moment',
  },
  glacius: {
    does: 'A frost giant that freezes a whole lane (step out quickly), throws ice walls that block your bullets, drops icicles and sends frost shocks down the lanes.',
    phase2: 'more of everything: two frozen lanes and more icicles',
  },
  gumdrop: {
    does: 'A huge wobbly gumdrop that jumps up and lands on a red circle, spits out a wave of small gummy Murklings and gobs sticky syrup that slows you down.',
    phase2: 'it hops twice and spits more',
  },
  mothermurk: {
    does: 'The goo queen: she calls in waves of Murklings and drops goo puddles on the squad.',
    phase2: 'bigger waves, with Fizzbombs and Bulwarks',
  },
  'mothermurk:candy': {
    does: 'Mother Murk as the Candy Queen: she calls in waves of jelly Murklings, drops sticky syrup puddles and throws candy-cane volleys.',
    phase2: 'bigger waves, with Fizzbombs and Shieldbearers',
  },
  tempestking: {
    does: 'The final boss, with attacks from every world. Phase 1 is the storm: lightning down the lanes, thunder slams, orb volleys and Murkling waves.',
    phase2: 'he adds Volcanic Forge ember rain and Frozen Peaks frozen lanes',
    phase3: 'he adds a rolling Candy Kingdom gumball and Grawlstone\'s rock slam, and freezes two lanes at once',
  },
};

/** World 1 hazards (worlds 2-5 take their name and tip from data/hazardplan.js HINTS). */
export const HAZARD_INFO = {
  blade: { name: 'SPINNING BLADES', what: 'Steel blades whirl on the road (some slide side to side) and cut down Raiders they touch.', tip: 'Steer around them' },
  gap: { name: 'HOLES', what: 'Gaps in the bridge.', tip: 'Raiders who step over a hole fall in' },
  lava: { what: 'Glowing lava rivers across a lane or the whole road burn up any Raider in them.' },
  ember: { what: 'Burning rocks fall from the sky onto red warning circles.' },
  crack: { what: 'Cracked tiles start to glow when you step on them and fall away a few seconds later.' },
  geyser: { what: 'Fire vents in a lane glow, then blast columns of fire on a beat.' },
  ice: { what: 'Slippery patches of ice, sometimes across the whole road.' },
  snow: { what: 'A snowstorm pulls the fog in close.' },
  icicle: { what: 'Icicles drop where blue shadows grow on the road.' },
  avalanche: { what: 'A snow wave from one side shoves the squad sideways; Raiders pushed off the edge fall.' },
  jelly: { what: 'A bouncy pad right before a hole launches the whole squad over it.' },
  syrup: { what: 'Sticky syrup rivers make steering heavy, and slow enemies too.' },
  gumball: { what: 'Giant gumballs roll down a lane and squash any Raider they roll over.' },
  choco: { what: 'Chocolate pours over a lane on a beat; it drowns Raiders and stops bullets.' },
  platform: { what: 'A deck slides side to side over a hole across the whole road; Raiders off the deck fall.' },
  lightning: { what: 'Bolts strike the road, each one marked first with a circle.' },
  wind: { what: 'Gusts push the squad sideways; Raiders blown past the edge fall off.' },
  collapse: { what: 'A bridge section shakes, then crumbles from the back, the cracked side faster than the solid side.' },
};
