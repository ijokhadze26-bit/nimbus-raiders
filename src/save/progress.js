// Progress rules on top of the save: run rewards (stars, unlocks, coins with the coin bonus, stats),
// shop purchases / equips and the daily reward streak. UI calls these; game events drive the run rewards.
import { DAILY, UPGRADE_BY_ID, upgradeCost, upgradeEffects } from '../data/shop.js';
import { HERO_BY_ID, PAID_SKIN_IDS, WEAPON_SKIN_BY_ID } from '../data/skins.js';

const LEVELS = 15;

/** Subscribes the save to run:win / run:lose. Stores the payout of the last run in game.lastAward. */
export function installProgress(game) {
  const save = game.save;
  const ev = game.events;
  ev.on('run:win', (p) => game.lastAward = awardWin(save, p, game.run));
  ev.on('run:lose', (p) => game.lastAward = awardLose(save, p, game.run));
}

export function coinMul(save) { return upgradeEffects(save.data.upgrades).coinMul; }

/** p = run:win payload; p.coins is the base payout (collected + level reward + 15/star). */
export function awardWin(save, p, run = null) {
  const d = save.data;
  const level = p.mode === 'level';
  const dist = Math.round(run?.dist || 0);
  const prevStars = level ? d.stars[p.levelId] || 0 : 0;
  const coins = Math.round((p.coins || 0) * coinMul(save));
  let unlocked = 0;
  let galaxy = false;
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + coins);
    s.stats.runs++; s.stats.wins++;
    s.stats.kills += p.kills || 0;
    if (!level && dist > s.endlessBest) s.endlessBest = dist;
    if (level) {
      s.stars[p.levelId] = Math.max(prevStars, Math.min(3, p.stars || 1));
      const next = Math.min(LEVELS, p.levelId + 1);
      if (next > s.unlockedLevel) { s.unlockedLevel = next; unlocked = next; }
      const threes = Object.values(s.stars).filter((n) => n >= 3).length;
      if (threes >= (HERO_BY_ID.galaxy.unlock?.threeStars || 10) && !s.skins.owned.includes('galaxy')) {
        s.skins.owned.push('galaxy'); galaxy = true;
      }
    }
  });
  return { win: true, mode: p.mode, levelId: p.levelId, stars: p.stars || 1, prevStars, coins, unlocked, galaxy, squad: p.squad, kills: p.kills };
}

/** Endless pays dist/10 + kills/20 + collected (SPEC §5); a level loss pays the collected coins. */
export function awardLose(save, p, run) {
  const endless = p.mode === 'endless';
  const base = endless ? Math.floor((p.dist || 0) / 10 + (p.kills || 0) / 20) + (p.coins || 0) : (p.coins || 0);
  const coins = Math.round(base * coinMul(save));
  const prevBest = save.data.endlessBest;
  const newBest = endless && (p.dist || 0) > prevBest;
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + coins);
    s.stats.runs++;
    s.stats.kills += p.kills || 0;
    if (newBest) s.endlessBest = Math.round(p.dist);
  });
  const length = run?.length || 0;
  return { win: false, mode: p.mode, levelId: p.levelId, dist: Math.round(p.dist || 0), length, coins, newBest, best: Math.max(prevBest, Math.round(p.dist || 0)), kills: p.kills };
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
