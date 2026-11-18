// BOSS RUSH (stage 5 mode): every campaign boss back to back - the L5, L10 ... L50 boss configs in order (type,
// skin, tier, mini; 10 fights). The squad starts at BOSS_RUSH.squad + the shop Starting Squad upgrade + the hero's
// start bonus, the weapon at the shop Starting Weapon Mk. Between fights: a short breather road, a small top-up of
// Raiders, and every second boss one Mk up. HP is the rush's own table (a campaign boss is tuned for the squad a
// whole level grows; here the squad is fixed). HP scales with the run's expected firepower (squad, Mk, shop Damage
// and Fire Rate upgrades), so a fresh save and a maxed one both get fights of about BOSS_RUSH.secs seconds of
// shooting: Boss Rush tests dodging, not the shop. Pays coins per boss beaten; the run timer is run.time.
import { getLevel } from '../../data/levels.js';
import { worldOf, WORLDS } from '../../data/worlds.js';
import { MKREF } from '../../data/weapons.js';

export const BOSS_RUSH = {
  levels: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  // seconds of full-squad fire each fight takes (hp = secs x expected squad dps x eff; tuned with the autopilot)
  secs: [10, 12, 12, 14, 14, 16, 15, 18, 14, 16],
  eff: 0.3,             // share of the reference dps a squad really lands while dodging
  squad: 100,          // + shop Starting Squad + hero start bonus
  topUp: 0.3,          // after each fight: + this share of the start squad (at least 8)
  mkEvery: 2,          // +1 Mk after every 2nd boss (up to Mk V)
  breather: 34,        // road (u) between two arenas
  first: 22,           // road before the first arena
  coins: (n) => 50 + 25 * n, // pay for boss n (1-based) beaten
  speed: 9.5,
  unlockLevel: 10,     // open after beating L10
};

/** Expected squad dps at fight i: ctx = { startSquad, startMk, damageMul, rateMul } (no losses, top-ups added). */
export function rushDps(i, ctx) {
  const mk = Math.min(5, ctx.startMk + Math.floor(i / BOSS_RUSH.mkEvery));
  const squad = ctx.startSquad + i * Math.max(8, Math.round(ctx.startSquad * BOSS_RUSH.topUp));
  return squad * MKREF[mk] * ctx.damageMul * ctx.rateMul;
}

/** Fight i (0-based): the campaign boss config with the rush hp. */
export function rushBoss(i, ctx = { startSquad: BOSS_RUSH.squad, startMk: 1, damageMul: 1, rateMul: 1 }) {
  const id = BOSS_RUSH.levels[i];
  const L = getLevel(id);
  const b = (L && L.boss) || { type: 'grawlstone', tier: 1 };
  const hp = Math.max(2000, Math.round(BOSS_RUSH.secs[i] * rushDps(i, ctx) * BOSS_RUSH.eff / 500) * 500);
  // attack cadence ramps through the rush (tier <= 3 for fights 1-3, 4 for 4-6, 5 for 7-9, the finale 6)
  return { ...b, hp, tier: Math.min(b.tier || 1, 3 + Math.floor(i / 3)), rush: i + 1, levelId: id };
}

export const RUSH_COUNT = BOSS_RUSH.levels.length;

/** World of fight i (theme / enemy skin / music). */
export const rushWorld = (i) => worldOf(BOSS_RUSH.levels[Math.min(RUSH_COUNT - 1, i)]);

/** Total coins for n bosses beaten. */
export function rushCoins(n) { let c = 0; for (let k = 1; k <= n; k++) c += BOSS_RUSH.coins(k); return c; }

/** Def the run starts from (the controller moves length / boss on after every kill). */
export function bossRushDef(ctx) {
  const w = rushWorld(0);
  return { id: 901, name: 'BOSS RUSH', theme: w.themes[0], world: w.id, length: BOSS_RUSH.first, speed: BOSS_RUSH.speed,
    stars: [1, 1], reward: 0, boss: rushBoss(0, ctx), events: [], rush: true };
}

/** Boss rush open? (L10 beaten) */
export const bossRushOpen = (save) => !!save && ((save.stars && save.stars[BOSS_RUSH.unlockLevel]) > 0 || (save.unlockedLevel | 0) > BOSS_RUSH.unlockLevel);

/** mm:ss.t of seconds. */
export function fmtTime(s) {
  const t = Math.max(0, Math.round((s || 0) * 10));
  const m = Math.floor(t / 600), sec = Math.floor((t % 600) / 10), ds = t % 10;
  return `${m}:${String(sec).padStart(2, '0')}.${ds}`;
}

/** Controller step after a boss kill (game.win in a rush): next fight or false when it was the last. */
export function rushNext(game, st) {
  const run = game.run;
  const n = st.index + 1;                 // bosses beaten
  st.beaten = n;
  run.stats.bosses = n;
  const pay = BOSS_RUSH.coins(n);
  run.coins += pay;
  const L = game.squad.leader;
  game.events.emit('coin:collect', { amount: pay, pos: { x: L.x, y: 1.2, z: L.z } });
  if (n >= RUSH_COUNT) return false;      // the last boss: a real win
  st.index = n;
  game.bosses.clear();
  game.weapons.enabled = true;            // the cease-fire of boss:defeated ends
  game.telegraph.reset();
  const troops = Math.max(8, Math.round(st.startSquad * BOSS_RUSH.topUp));
  game.squad.add(troops, 'barrel');
  let mkUp = false;
  if (n % BOSS_RUSH.mkEvery === 0 && game.weapons.mk < 5) { game.weapons.setMk(game.weapons.mk + 1); mkUp = true; }
  const w = rushWorld(n);
  run.world = w.key; run.worldId = w.id;
  run.segStart = run.dist;
  run.length = Math.max(run.dist, run.length) + BOSS_RUSH.breather;
  run.boss = rushBoss(n, st.ctx);
  game.bosses.preload(run.boss);
  run.setPhase('run');
  game.events.emit('bossrush:next', { n, of: RUSH_COUNT, coins: pay, troops, mkUp, next: run.boss, world: w.id });
  if (game.fx && game.fx.confetti && game.fx.confetti.burst) game.fx.confetti.burst(1.2);
  return true;
}

/** The world theme of the next fight (swapped under the boss death flash, like endless). */
export const rushTheme = (i) => { const w = rushWorld(i); return w.themes[i % w.themes.length] || WORLDS[0].themes[0]; };
