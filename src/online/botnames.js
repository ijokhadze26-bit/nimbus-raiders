// Names for the scripted Quick Match rival (STAGE3 "Identity"). A share of BOT.defaultNames read `Raider-NNNN`, the
// default a new player gets (names.js defaultName); the rest come from this hand list. Every name passes names.js
// checkName and !isRude (on7-adapt checks the whole list), and a bot never takes my own name. Pure.
import { defaultName, checkName } from './names.js';

export const BOT_NAMES = [
  'SkyPilot', 'Zoomer', 'CloudKid', 'StarDash', 'Pixel Pip', 'NovaRun', 'Captain Zip', 'MoonBean', 'TurboTaco',
  'Rocket Ray', 'Sunny Sky', 'Comet Kim', 'Blaze99', 'FrostByte', 'Jumpy Jo', 'Lucky Leo', 'Mega Max', 'Nimbus Nia',
  'Orbit Ollie', 'Panda Pow', 'Quick Quinn', 'Rainbow Rae', 'Sparky Sam', 'Thunder Tom', 'Uno Ufo', 'Vroom Vic',
  'Windy Wes', 'Zap Zoe', 'BlueJay', 'CosmoCat', 'DinoDash', 'Echo Eli', 'Fizzy Fin', 'GigaGus', 'HappyHal',
  'IcyIvy', 'JetJax', 'KiteKai', 'LemonLu', 'MangoMia', 'NoodleNed', 'OtterOz', 'PeppyPia', 'RiverRio',
  'SkySurfer', 'TigerTia', 'Waffle Wiz', 'YoYo Yuki', 'Ace_Ari', 'Bolt-Ben', 'Cloud_Cy', 'Dash-Dee', 'Gem_Gia',
  'Hero-Hugo', 'Ninja_Nico', 'PipFan', 'Raider Rex', 'Storm Sid', 'Zippy', 'Bubbles',
];

/** One name from `rng` (core/rng.js): never equal to `avoid` (ignoring case), always a clean name. */
export function botName(rng, avoid = '', share = 0.3) {
  const mine = String(avoid || '').trim().toLowerCase();
  for (let i = 0; i < 20; i++) {
    const name = rng.next() < share ? defaultName(() => rng.next()) : BOT_NAMES[Math.floor(rng.next() * BOT_NAMES.length)];
    if (name.toLowerCase() !== mine && checkName(name).ok) return name;
  }
  return mine === 'skypilot' ? 'Zoomer' : 'SkyPilot';
}
