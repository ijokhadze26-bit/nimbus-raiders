// Achievements (update 3 stage 5, STAGE5.md C). Each goal: id (save-safe), group, name, text, icon (ui/icons.js),
// reward (coins on CLAIM), goal (target number) and metric (game/achievements.js METRICS, 'name' or 'name:arg').
// needs: an optional game feature ('combo', 'cages', 'props', 'dodge' from stage 4, 'modes' from stage 5 modes) -
// a goal whose feature is missing in this build is hidden and never tracked, so every listed goal can be reached.
import { HERO_DEFS as HEROES } from './heroes.js';
import { WEAPON_IDS } from './weapons.js';

export const ACH_GROUPS = [
  { id: 'campaign', name: 'CAMPAIGN' },
  { id: 'combat', name: 'COMBAT' },
  { id: 'heroes', name: 'HEROES & GEAR' },
  { id: 'modes', name: 'MODES & HABITS' },
];

const BOSSES = [
  { w: 1, id: 'boss-sky', name: 'STONE BREAKER', text: 'Beat GRAWLSTONE (level 10)', level: 10, reward: 300 },
  { w: 2, id: 'boss-forge', name: 'HORN TAMER', text: 'Beat IRONHORN (level 20)', level: 20, reward: 500 },
  { w: 3, id: 'boss-frost', name: 'BIG THAW', text: 'Beat GLACIUS (level 30)', level: 30, reward: 700 },
  { w: 4, id: 'boss-candy', name: 'SWEET VICTORY', text: 'Beat the CANDY QUEEN (level 40)', level: 40, reward: 900 },
  { w: 5, id: 'boss-citadel', name: 'STORM ENDER', text: 'Beat the TEMPEST KING (level 50)', level: 50, reward: 1500 },
];
const WORLD3 = [
  { w: 1, name: 'SKY ACE', world: 'Sky Bridge', reward: 400 },
  { w: 2, name: 'FORGE MASTER', world: 'Volcanic Forge', reward: 600 },
  { w: 3, name: 'ICE COLD', world: 'Frozen Peaks', reward: 800 },
  { w: 4, name: 'SUGAR STAR', world: 'Candy Kingdom', reward: 1000 },
  { w: 5, name: 'STORM LEGEND', world: 'Storm Citadel', reward: 1500 },
];

const a = (group, id, name, text, icon, metric, goal, reward, extra) => ({ group, id, name, text, icon, metric, goal, reward, ...extra });

export const ACHIEVEMENTS = [
  // ---- campaign ----
  a('campaign', 'first-win', 'FIRST FLIGHT', 'Beat level 1', 'flag', 'beat:1', 1, 50),
  ...BOSSES.map((b) => a('campaign', b.id, b.name, b.text, 'skull', `beat:${b.level}`, 1, b.reward)),
  ...WORLD3.map((x) => a('campaign', `stars-w${x.w}`, x.name, `3 stars on every ${x.world} level`, 'star', `world3:${x.w}`, 10, x.reward)),
  a('campaign', 'stars-25', 'STAR COLLECTOR', 'Get 3 stars on 25 levels', 'star', 'threes', 25, 600),
  a('campaign', 'wins-25', 'RAID REGULAR', 'Win 25 levels', 'trophy', 'wins', 25, 300),
  a('campaign', 'wins-100', 'RAID VETERAN', 'Win 100 levels', 'trophy', 'wins', 100, 1000),
  a('campaign', 'elite-1', 'ELITE RAIDER', 'Beat a level on ELITE', 'shield', 'elite', 1, 400),
  a('campaign', 'elite-10', 'ELITE SQUAD', 'Beat 10 levels on ELITE', 'shield', 'elite', 10, 1200),
  // ---- combat ----
  a('combat', 'kills-1k', 'MURK SWEEPER', 'Defeat 1,000 Murklings', 'damage', 'kills', 1000, 100),
  a('combat', 'kills-10k', 'MURK BANE', 'Defeat 10,000 Murklings', 'damage', 'kills', 10000, 500),
  a('combat', 'kills-100k', 'MURK DOOM', 'Defeat 100,000 Murklings', 'damage', 'kills', 100000, 2000),
  a('combat', 'bosses-25', 'GIANT SLAYER', 'Defeat 25 bosses', 'skull', 'bosses', 25, 600),
  a('combat', 'squad-500', 'BIG CROWD', 'Reach 500 Raiders in one run', 'squad', 'maxSquad', 500, 300),
  a('combat', 'squad-999', 'FULL HOUSE', 'Reach 999 Raiders in one run', 'squad', 'maxSquad', 999, 800),
  a('combat', 'mk5', 'MAXED OUT', 'Power a weapon up to Mk V', 'tier', 'mk5', 1, 300),
  a('combat', 'gates-300', 'GATE RUNNER', 'Pass 300 gates', 'bolt', 'gates', 300, 250),
  a('combat', 'reveal-10', 'X-RAY EYES', 'Reveal 10 hidden "?" gates', 'bolt', 'reveals', 10, 250),
  a('combat', 'barrels-50', 'BARREL BUSTER', 'Break 50 barrels', 'coinbonus', 'barrels', 50, 200),
  a('combat', 'powers-50', 'POWERED UP', 'Grab 50 power-ups', 'magnet', 'pickups', 50, 200),
  a('combat', 'combo-100', 'COMBO 100', 'Reach a 100 combo', 'rapid', 'combo', 100, 300, { needs: 'combo' }),
  a('combat', 'combo-250', 'UNSTOPPABLE', 'Reach a 250 combo', 'rapid', 'combo', 250, 800, { needs: 'combo' }),
  a('combat', 'dodge-25', 'SLIPPERY', 'Dodge 25 hits with a roll', 'shield', 'dodges', 25, 250, { needs: 'dodge' }),
  a('combat', 'rescue-100', 'RESCUER', 'Free 100 caged Raiders', 'heart', 'rescued', 100, 400, { needs: 'cages' }),
  a('combat', 'prop-bell', 'DING DONG', 'Ring a bell to stun the horde', 'sound', 'prop:bell', 1, 150, { needs: 'props' }),
  a('combat', 'prop-dam', 'FLOODGATE', 'Shoot a dam to flood a lane', 'freeze', 'prop:dam', 1, 150, { needs: 'props' }),
  a('combat', 'prop-crane', 'SPECIAL DELIVERY', 'Drop a crane crate on enemies', 'flag', 'prop:crane', 1, 150, { needs: 'props' }),
  a('combat', 'prop-boulder', 'ROCK AND ROLL', 'Roll a boulder into the horde', 'damage', 'prop:boulder', 1, 150, { needs: 'props' }),
  // ---- heroes & gear ----
  ...HEROES.map((h) => a('heroes', `hero-${h.id}`, `${h.name.toUpperCase()} WINS`, `Win a level with ${h.name}`, 'trophy', `heroWin:${h.id}`, 1, 200, { hero: h.id })),
  a('heroes', 'heroes-all', 'FULL ROSTER', `Own all ${HEROES.length} heroes`, 'squad', 'heroes', HEROES.length, 800),
  a('heroes', 'weapons-all', 'ARSENAL', `Own all ${WEAPON_IDS.length} weapons`, 'tier', 'weapons', WEAPON_IDS.length, 800),
  // ---- modes & habits ----
  a('modes', 'endless-1k', 'LONG HAUL', 'Run 1,000 m in Endless', 'infinity', 'endless', 1000, 200),
  a('modes', 'endless-2k', 'MARATHON', 'Run 2 km in Endless (any world)', 'infinity', 'endless', 2000, 500),
  a('modes', 'streak-3', 'REGULAR', 'Play 3 days in a row (daily gift)', 'gift', 'streak', 3, 150),
  a('modes', 'streak-7', 'DEVOTED', 'Play 7 days in a row (daily gift)', 'gift', 'streak', 7, 500),
  a('modes', 'bossrush', 'BOSS RUSH CHAMPION', 'Beat all 10 bosses in Boss Rush', 'skull', 'bossrush', 1, 1500, { needs: 'modes' }),
  a('modes', 'endless-worlds', 'WORLD WANDERER', 'Run 500 m in Endless in all 5 worlds', 'map', 'endlessWorlds:500', 5, 800, { needs: 'modes' }),
  a('modes', 'bossrush-5', 'HALF RUSH', 'Beat 5 bosses in one Boss Rush', 'skull', 'rushBosses', 5, 400, { needs: 'modes' }),
  a('modes', 'chaos-win', 'CHAOS TAMER', 'Win a Chaos Mode run', 'bolt', 'chaosWins', 1, 500, { needs: 'modes' }),
  a('modes', 'daily-clear', 'CHALLENGER', 'Clear a Daily Challenge', 'map', 'dailyClears', 1, 300, { needs: 'modes' }),
  a('modes', 'daily-5', 'DAILY HABIT', 'Clear 5 Daily Challenges', 'gift', 'dailyClears', 5, 600, { needs: 'modes' }),
];

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((x) => [x.id, x]));
