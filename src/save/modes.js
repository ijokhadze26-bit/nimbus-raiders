// Stage 5 mode payouts + bests on top of the save (progress.js routes run:win / run:lose of the mode runs here).
// save.modes (save v3): bossRushBest = best FULL Boss Rush time in milliseconds (0 = never finished),
// dailyBest = { 'YYYY-MM-DD': best score that day } (the local leaderboard; sanitize keeps the last 60 days),
// chaosBest = best Chaos score, endlessBest = { worldId (2-5): best metres } - Sky Bridge keeps the old
// save.endlessBest. Every payout gets the shop coin bonus and the hero coin bonus like a level.
import { upgradeEffects } from '../data/shop.js';
import { heroDef } from '../data/heroes.js';
import { dailyScore, dailyDone, DAILY } from '../game/modes/daily.js';
import { chaosCoinMul } from '../game/modes/chaos.js';

export const MODE_PAID = new Set(['bossrush', 'daily', 'chaos']);

const shopMul = (save) => upgradeEffects(save.data.upgrades).coinMul;
const heroMul = (run) => (run && run.hero && heroDef(run.hero).passive.mods.coinMul) || 1;

/** Best endless distance of a world (1 = Sky Bridge = the old save.endlessBest). */
export function endlessBestOf(d, world = 1) {
  if (!(world > 1)) return d.endlessBest | 0;
  return (d.modes && d.modes.endlessBest && d.modes.endlessBest[world]) | 0;
}

/** Records an endless distance for a world inside save.update(fn) (s = the data). */
export function setEndlessBest(s, world, dist) {
  const m = Math.round(dist || 0);
  if (!(world > 1)) { if (m > s.endlessBest) s.endlessBest = m; return; }
  if (m > ((s.modes.endlessBest[world]) | 0)) s.modes.endlessBest[world] = m;
}

/** Payout + bests of a mode run (p = run:win / run:lose payload). Returns the game.lastAward object. */
export function awardMode(save, p, game) {
  const run = game.run, modes = game.modes, win = p.type === 'win';
  const mul = shopMul(save) * heroMul(run);
  const out = { win, mode: p.mode, levelId: p.levelId, kills: p.kills, squad: p.squad, stars: p.stars, heroMul: heroMul(run), hero: run ? run.hero : null, twists: modes.twists.slice() };
  let coins = p.coins || 0, bonus = 0;
  if (p.mode === 'bossrush') {
    const beaten = (modes.rush && modes.rush.beaten) || 0;
    const ms = Math.round((run ? run.time : 0) * 1000);
    const prev = save.data.modes.bossRushBest | 0;
    const newBest = win && (!prev || ms < prev);
    Object.assign(out, { beaten, of: 10, time: ms / 1000, best: newBest ? ms / 1000 : prev / 1000, newBest, bossName: p.bossName, bossHp: p.bossHp, bossMax: p.bossMax });
    if (newBest) save.update((s) => { s.modes.bossRushBest = ms; });
  } else if (p.mode === 'daily') {
    const date = (modes.plan && modes.plan.date) || '';
    const score = win ? dailyScore(p.squad, p.stars) : 0;
    const first = win && !dailyDone(save.data, date);
    if (first) bonus = DAILY.bonus;
    const prev = (save.data.modes.dailyBest[date]) | 0;
    Object.assign(out, { date, score, first, bonus, newBest: win && score > prev, best: Math.max(prev, score), levelName: run && run.def.name });
    if (win && score > prev) save.update((s) => { s.modes.dailyBest[date] = score; });
  } else if (p.mode === 'chaos') {
    const score = win ? dailyScore(p.squad, p.stars) : 0;
    coins = Math.round(coins * chaosCoinMul(modes.twists));
    const prev = save.data.modes.chaosBest | 0;
    Object.assign(out, { score, newBest: win && score > prev, best: Math.max(prev, score), chaosMul: chaosCoinMul(modes.twists), levelName: run && run.def.name });
    if (win && score > prev) save.update((s) => { s.modes.chaosBest = score; });
  }
  const total = Math.round(coins * mul) + bonus;
  out.coins = total;
  save.update((s) => {
    s.coins = Math.min(1e9, s.coins + total);
    s.stats.runs++;
    if (win) s.stats.wins++;
    s.stats.kills += p.kills || 0;
  });
  return out;
}
