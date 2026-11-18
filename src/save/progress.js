// Progress rules on top of the save: run rewards (stars, unlocks, coins with the coin bonus, stats),
// shop purchases / equips and the daily reward streak. UI calls these; game events drive the run rewards.
// Update 3 stage 3: an ELITE win (p.elite) records save.elite[id] (best elite stars) instead of the normal stars.
import { DAILY, UPGRADE_BY_ID, upgradeCost, upgradeEffects } from '../data/shop.js';
import { HERO_BY_ID, PAID_SKIN_IDS, WEAPON_SKIN_BY_ID } from '../data/skins.js';
import { LAST_LEVEL } from '../data/levels.js';
import { heroDef } from '../data/heroes.js';
import { unlockSet, newlyUnlocked } from './unlocks.js';
import { MODE_PAID, awardMode, endlessBestOf, setEndlessBest } from './modes.js';
import { SQUAD_TYPE_BY_ID, MIX_LEVELS, DEFAULT_SHARE } from '../data/squadtypes.js';

/** Only these modes pay out (practice, boss tests and custom test runs never touch the save). */
const PAID = new Set(['level', 'endless']);

/** Subscribes the save to run:win / run:lose. Stores the payout of the last run in game.lastAward. */
export function installProgress(game) {
  const save = game.save;
  const ev = game.events;
  // stage 5: Boss Rush / Daily / Chaos pay through save/modes.js
  ev.on('run:win', (p) => { game.lastAward = PAID.has(p.mode) ? awardWin(save, p, game.run) : MODE_PAID.has(p.mode) ? awardMode(save, { ...p, type: 'win' }, game) : null; });
  ev.on('run:lose', (p) => { game.lastAward = PAID.has(p.mode) ? awardLose(save, p, game.run) : MODE_PAID.has(p.mode) ? awardMode(save, { ...p, type: 'lose' }, game) : null; });
}

export function coinMul(save) { return upgradeEffects(save.data.upgrades).coinMul; }

/** Hero coin multiplier of a run (Bonbon's Sweet Tooth +25%), applied after the shop coin bonus. */
export function heroCoinMul(run) { return (run && run.hero && heroDef(run.hero).passive.mods.coinMul) || 1; }

/** Run modifier coin multiplier (stage 5: the loadout modifiers' bonuses add up; data/modifiers.js). */
export function modCoinMul(run) { return 1 + ((run && run.mods && run.mods.bonus) || 0); }
const modInfo = (run) => ({ modMul: modCoinMul(run), mods: (run && run.mods && run.mods.ids.slice()) || [], failReason: (run && run.failReason) || null });

/** p = run:win payload; p.coins is the base payout (collected + level reward + 15/star). */
export function awardWin(save, p, run = null) {
  const d = save.data;
  const level = p.mode === 'level';
  const dist = Math.round(run?.dist || 0);
  const elite = level && !!p.elite;
  const prevStars = level ? d.stars[p.levelId] || 0 : 0;
  const prevElite = elite ? d.elite[p.levelId] || 0 : 0;
  const heroMul = heroCoinMul(run);
  const coins = Math.round((p.coins || 0) * coinMul(save) * heroMul * modCoinMul(run));
  let unlocked = 0;
  let galaxy = false;
  const before = unlockSet(d);
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + coins);
    s.stats.runs++; s.stats.wins++;
    s.stats.kills += p.kills || 0;
    if (!level) setEndlessBest(s, run?.worldId || 1, dist); // stage 5: per world
    if (elite) s.elite[p.levelId] = Math.max(prevElite, Math.min(3, p.stars || 1)); // ELITE: its own stars
    if (level) {
      if (!elite) s.stars[p.levelId] = Math.max(prevStars, Math.min(3, p.stars || 1));
      const next = Math.min(LAST_LEVEL, p.levelId + 1); // never unlock a level that has no data yet
      if (next > s.unlockedLevel) { s.unlockedLevel = next; unlocked = next; }
      const threes = Object.values(s.stars).filter((n) => n >= 3).length;
      if (threes >= (HERO_BY_ID.galaxy.unlock?.threeStars || 10) && !s.skins.owned.includes('galaxy')) {
        s.skins.owned.push('galaxy'); galaxy = true;
      }
    }
  });
  const newItems = newlyUnlocked(before, unlockSet(save.data));
  return { win: true, mode: p.mode, levelId: p.levelId, stars: p.stars || 1, prevStars, coins, unlocked, galaxy, squad: p.squad, kills: p.kills, heroMul, hero: run?.hero || null, newItems, elite, prevElite, ...modInfo(run) };
}

/** Endless pays dist/10 + kills/20 + collected (SPEC §5); a level loss pays the collected coins. */
export function awardLose(save, p, run) {
  const endless = p.mode === 'endless';
  const base = endless ? Math.floor((p.dist || 0) / 10 + (p.kills || 0) / 20) + (p.coins || 0) : (p.coins || 0);
  const heroMul = heroCoinMul(run);
  const coins = Math.round(base * coinMul(save) * heroMul * modCoinMul(run));
  const world = run?.worldId || 1;
  const prevBest = endlessBestOf(save.data, world); // stage 5: endless best per world (Sky = save.endlessBest)
  const newBest = endless && (p.dist || 0) > prevBest;
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + coins);
    s.stats.runs++;
    s.stats.kills += p.kills || 0;
    if (newBest) setEndlessBest(s, world, p.dist);
  });
  const length = run?.length || 0;
  return { win: false, mode: p.mode, levelId: p.levelId, dist: Math.round(p.dist || 0), length, coins, newBest, world, best: Math.max(prevBest, Math.round(p.dist || 0)), kills: p.kills, heroMul, hero: run?.hero || null, elite: !!p.elite, ...modInfo(run) };
}

// ---------------- shop ----------------
export function buyUpgrade(save, id) {
  const u = UPGRADE_BY_ID[id];
  if (!u) return false;
  const lv = save.data.upgrades[id] | 0;
  const cost = upgradeCost(id, lv);
  if (cost == null || !save.spend(cost)) return false;
  save.update((s) => { s.upgrades[id] = lv + 1; });
  return true;
}

export function skinById(id) { return HERO_BY_ID[id] || WEAPON_SKIN_BY_ID[id] || null; }

export function buySkin(save, id) {
  const sk = skinById(id);
  if (!sk || save.owns(id) || !save.spend(sk.cost)) return false;
  save.update((s) => { s.skins.owned.push(id); });
  equipSkin(save, id);
  return true;
}

export function equipSkin(save, id) {
  if (!save.owns(id)) return false;
  save.update((s) => { if (HERO_BY_ID[id]) s.skins.hero = id; else if (WEAPON_SKIN_BY_ID[id]) s.skins.weapon = id; });
  return true;
}

// ---------------- squad member types (stage 5 shop tab) ----------------
/** Buys a Raider type (joins at FEW). */
export function buySquadType(save, id) {
  const t = SQUAD_TYPE_BY_ID[id];
  if (!t || save.data.squadTypes.owned.includes(id) || !save.spend(t.cost)) return false;
  save.update((s) => { s.squadTypes.owned.push(id); s.squadTypes.mix[id] = DEFAULT_SHARE; });
  return true;
}

/** Sets an owned type's mix: 'off' | 'few' | 'many'. */
export function setSquadMix(save, id, level) {
  const L = MIX_LEVELS.find((m) => m.id === level);
  if (!L || !save.data.squadTypes.owned.includes(id)) return false;
  save.update((s) => { s.squadTypes.mix[id] = L.share; });
  return true;
}

// ---------------- daily reward ----------------
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

/**
 * { available, day (1..7 = the tile to claim / last claimed), claimedToday, streak }.
 * A claim yesterday continues the streak; anything older restarts at day 1.
 */
export function dailyStatus(save, now = new Date()) {
  const today = dateKey(now);
  const { lastClaim, streak } = save.data.daily;
  if (lastClaim === today) return { available: false, claimedToday: true, day: ((Math.max(1, streak) - 1) % 7) + 1, streak };
  const continues = lastClaim && lastClaim === dayBefore(today);
  const nextStreak = continues ? streak + 1 : 1;
  return { available: true, claimedToday: false, day: ((nextStreak - 1) % 7) + 1, streak: nextStreak, reset: !!lastClaim && !continues };
}

/** Claims today's reward; returns { coins, skin } or null when already claimed. */
export function claimDaily(save, now = new Date()) {
  const st = dailyStatus(save, now);
  if (!st.available) return null;
  const coins = DAILY[st.day - 1];
  let skin = null;
  if (st.day === 7) {
    const missing = PAID_SKIN_IDS.filter((id) => !save.owns(id));
    if (missing.length) skin = missing[Math.floor(Math.random() * missing.length)]; // cosmetic randomness
  }
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + coins);
    s.daily.lastClaim = dateKey(now);
    s.daily.streak = st.streak;
    if (skin) s.skins.owned.push(skin);
  });
  return { coins, skin, day: st.day };
}
