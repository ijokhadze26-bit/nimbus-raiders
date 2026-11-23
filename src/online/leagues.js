// Trophies, leagues, coins and the online skins: the numbers of stage 4 (STAGE4 "Numbers"). Pure, no DOM except
// the badge string. The trophy maths itself lives in verdict.js (the rules repeat it as HS / BS / BG): re-exported
// here, copied nowhere.
//
//   LEAGUES / leagueOf(tr) / badgeHtml(tr, size)   Bronze 0, Silver 300, Gold 700, Diamond 1200, Storm Champion 1800
//   TROPHY / COINS                                  every timing and amount of a ranked match and its reward
//   SKIN_RULES / earnedSkins(profile)               the server field that earns each online skin (data/skins.js)
//   weekBase(now) / dayOf(now) / weekScore(ws, now) the rules' WK and DAY
//   coinsFor({ kind, result, t, firstWin, friendPaid }) -> { total, parts: [{ k, n }] }
//   predict({ tr0, rivalTr, result, bot }) -> g     what a ranked result does to tr0 (also the rival's row)
import { ONLINE_SKINS } from '../data/skins.js';
import { humanStake, botStake, botGain, humanGain } from './verdict.js';

export { humanStake, botStake, botGain, humanGain };

export const LEAGUES = [
  { id: 'bronze', name: 'BRONZE', min: 0, color: '#d08a4c', edge: '#6b3a12' },
  { id: 'silver', name: 'SILVER', min: 300, color: '#cfd8e6', edge: '#4d5f8a' },
  { id: 'gold', name: 'GOLD', min: 700, color: '#ffd34d', edge: '#8a5a00' },
  { id: 'diamond', name: 'DIAMOND', min: 1200, color: '#7fe8ff', edge: '#1b5a8a' },
  { id: 'champion', name: 'STORM CHAMPION', min: 1800, color: '#b49dff', edge: '#3b2a8f' },
];

export const TROPHY = {
  dayCap: 40,                  // win claims per UTC day (rules: cc <= 40)
  claimAfterMs: 20500,         // after the stake's ack (rules: now - sk.a >= 20000)
  claimRetryMs: 2000, claimTries: 6,
  stakeRetryMs: 1500, stakeHumanMs: 14000 /* after record ts (rules 15000) */, stakeBotMs: 10000 /* after GO */,
  humanClaimMs: 86400000, botClaimMs: 900000,   // how long a pending win may still be claimed (rules)
  staleStakeMs: 360000,        // an open stake with no pending of mine is closed after this
  liveStampMs: 2000, liveDeadMs: 6000,          // the playing page's stamp in the pending keys (Decision 10)
  boundaryMs: 60000,           // a denial this close to a UTC day / week edge is retried with the other DAY / WK
};

export const COINS = { win: 60, lose: 15, perSecs: 4, bonusCap: 60, minSecs: 10, firstWin: 100, friendWin: 20, friendOther: 10, friendPerDay: 10 };

export const SKIN_RULES = ONLINE_SKINS.map((s) => ({ id: s.id, field: s.earn.field, min: s.earn.min }));

export const weekBase = (now) => { const x = now - 345600000; return (x - (x % 604800000)) / 6048; };   // = rules WK
export const dayOf = (now) => (now - (now % 86400000)) / 86400000;                                    // = rules DAY
export const weekScore = (ws, now) => (ws >= weekBase(now) ? ws - weekBase(now) : 0);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The league of a trophy count: { i, id, name, min, next (min of the next league or null), color, edge }. */
export function leagueOf(tr) {
  const t = Math.max(0, num(tr));
  let i = 0;
  for (let k = 0; k < LEAGUES.length; k++) if (LEAGUES[k].min <= t) i = k;
  const L = LEAGUES[i];
  return { i, id: L.id, name: L.name, min: L.min, next: i + 1 < LEAGUES.length ? LEAGUES[i + 1].min : null, color: L.color, edge: L.edge };
}

const SIZES = { sm: 22, md: 40, lg: 96 };

/** An inline SVG shield in the league colour with 1-5 pips for the league index (works on Low graphics). */
export function badgeHtml(tr, size = 'sm') {
  const L = leagueOf(tr), px = SIZES[size] || SIZES.sm;
  const n = L.i + 1, gap = 7, x0 = 32 - ((n - 1) * gap) / 2;
  const pips = Array.from({ length: n }, (_, k) => `<circle cx="${x0 + k * gap}" cy="44" r="2.6" fill="#fff" stroke="${L.edge}" stroke-width="1.2"/>`).join('');
  const star = '<path d="M32 15l4.2 8.6 9.4 1.3-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.3z" fill="#fff" opacity=".9"/>';
  return `<span class="lg-badge lg-${L.id} lg-${size in SIZES ? size : 'sm'}" role="img" aria-label="${L.name} LEAGUE" style="width:${px}px;height:${px}px">`
    + `<svg viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true">`
    + `<path d="M32 3l25 8v19c0 15-11 26-25 31C18 56 7 45 7 30V11z" fill="${L.color}" stroke="${L.edge}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M32 9l19 6v15c0 11-8 20-19 24z" fill="#fff" opacity=".22"/>${star}${pips}</svg></span>`;
}

/** The online skins a server profile has earned (ids, in ONLINE_SKINS order). */
export function earnedSkins(profile) {
  if (!profile || typeof profile !== 'object') return [];
  return SKIN_RULES.filter((r) => num(profile[r.field]) >= r.min).map((r) => r.id);
}

/**
 * Coins for one match. kind 'q' (quick, ranked or not) | 'f' (friend room); result 'win' | 'lose' | 'draw';
 * t = seconds survived; firstWin = this is the first quick-match win of the UTC day; friendPaid = friend matches
 * already paid today. -> { total, parts: [{ k: 'base'|'time'|'first'|'friend', n }] }
 */
export function coinsFor({ kind, result, t = 0, firstWin = false, friendPaid = 0 } = {}) {
  const C = COINS, parts = [];
  if (kind === 'f') {
    if (num(friendPaid) < C.friendPerDay) parts.push({ k: 'friend', n: result === 'win' ? C.friendWin : C.friendOther });
  } else {
    const secs = Math.max(0, num(t)), win = result === 'win';
    if (win || secs >= C.minSecs) {
      parts.push({ k: 'base', n: win ? C.win : C.lose });
      const bonus = Math.min(C.bonusCap, Math.floor(secs / C.perSecs));
      if (bonus > 0) parts.push({ k: 'time', n: bonus });
    }
    if (win && firstWin) parts.push({ k: 'first', n: C.firstWin });
  }
  return { total: parts.reduce((s, p) => s + p.n, 0), parts };
}

/** What a ranked result does to tr0 (a draw gives the stake back: 0). For the rival's row: their tr0, my tr0 as rivalTr. */
export function predict({ tr0 = 0, rivalTr = 0, result, bot = false } = {}) {
  const t = Math.max(0, Math.round(num(tr0)));
  if (result === 'win') return bot ? botGain(t) : humanGain(t, Math.max(0, Math.round(num(rivalTr))));
  if (result === 'lose') return -(bot ? botStake(t) : humanStake(t)) || 0; // (never -0)
  return 0;
}
