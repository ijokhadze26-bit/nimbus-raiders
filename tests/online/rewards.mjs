// node tests/online/rewards.mjs — the numbers of stage 4 (src/online/leagues.js), pure: leagues at every edge,
// coins (caps, the 10 s rule, the first win, friend matches 10 a day), the online skins a profile earns, predict()
// against the trophy maths the rules check, and weekBase / dayOf against the WK / DAY text of the published rules.
import fs from 'node:fs';
import { test, ok, eq, run } from './kit.mjs';
import { LEAGUES, leagueOf, badgeHtml, coinsFor, earnedSkins, predict, weekBase, dayOf, weekScore, SKIN_RULES, TROPHY, COINS,
  humanStake, botStake, botGain, humanGain } from '../../src/online/leagues.js';
import * as verdict from '../../src/online/verdict.js';
import { installRewards } from '../../src/online/rewards.js';
import { ONLINE_SKINS, HERO_SKINS, WEAPON_SKINS, HERO_BY_ID, WEAPON_SKIN_BY_ID, PAID_SKIN_IDS, FREE_SKIN_IDS } from '../../src/data/skins.js';

test('leagues: every edge', () => {
  const at = (tr) => leagueOf(tr).id;
  eq([0, 299, 300, 699, 700, 1199, 1200, 1799, 1800, 99999].map(at), ['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'diamond', 'diamond', 'champion', 'champion']);
  eq([leagueOf(-5).id, leagueOf(NaN).id, leagueOf(undefined).id], ['bronze', 'bronze', 'bronze'], 'nonsense is bronze');
  eq([leagueOf(0).next, leagueOf(300).next, leagueOf(1800).next, leagueOf(700).i, leagueOf(1800).name], [300, 700, null, 2, 'STORM CHAMPION']);
  eq(LEAGUES.map((l) => l.min), [0, 300, 700, 1200, 1800]);
  const b = badgeHtml(1250, 'md');
  ok(b.includes('aria-label="DIAMOND LEAGUE"') && b.includes('width="40"') && (b.match(/<circle/g) || []).length === 4, 'badge: ' + b.slice(0, 120));
  ok(badgeHtml(0).includes('width="22"') && badgeHtml(2000, 'lg').includes('width="96"'), 'badge sizes');
});

test('coins: quick win / loss, the caps, under 10 s, the first win of the day; friend 20 / 10 for 10 matches', () => {
  const q = (result, t, firstWin = false) => coinsFor({ kind: 'q', result, t, firstWin }).total;
  eq([q('win', 0), q('win', 108), q('win', 240), q('win', 330)], [60, 87, 120, 120], 'win: 60 + 1 per 4 s, bonus capped at 60');
  eq([q('lose', 9.9), q('lose', 10), q('lose', 100), q('lose', 330), q('draw', 5), q('draw', 40)], [0, 17, 40, 75, 0, 25], 'loss / draw: 15 + 1 per 4 s, 0 under 10 s');
  eq([q('win', 108, true), q('lose', 108, true)], [187, 42], 'first win +100 (a win only)');
  eq(coinsFor({ kind: 'q', result: 'win', t: 108, firstWin: true }).parts, [{ k: 'base', n: 60 }, { k: 'time', n: 27 }, { k: 'first', n: 100 }], 'parts');
  const f = (result, friendPaid) => coinsFor({ kind: 'f', result, t: 200, friendPaid }).total;
  eq([f('win', 0), f('lose', 0), f('draw', 9), f('win', 10), f('lose', 25)], [20, 10, 10, 0, 0], 'friend: 20 / 10, the first 10 a day');
  eq(COINS.friendPerDay, 10);
});

test('online skins: the profile field earns them; they are in the id maps only, never buyable', () => {
  eq(SKIN_RULES, [{ id: 'on-silver', field: 'pk', min: 300 }, { id: 'on-wins10', field: 'w', min: 10 }, { id: 'on-streak5', field: 'bs', min: 5 }, { id: 'on-champion', field: 'pk', min: 1800 }]);
  eq(earnedSkins({ pk: 299, w: 9, bs: 4 }), []);
  eq(earnedSkins({ pk: 300, w: 0, bs: 0 }), ['on-silver']);
  eq(earnedSkins({ pk: 1800, w: 10, bs: 5 }), ['on-silver', 'on-wins10', 'on-streak5', 'on-champion']);
  eq([earnedSkins(null), earnedSkins({ pk: '900' })], [[], []]);
  for (const s of ONLINE_SKINS) {
    ok(s.online && s.cost === Infinity && (HERO_BY_ID[s.id] || WEAPON_SKIN_BY_ID[s.id]) === s, s.id + ' in its id map');
    ok(!PAID_SKIN_IDS.includes(s.id) && !FREE_SKIN_IDS.includes(s.id) && !HERO_SKINS.includes(s) && !WEAPON_SKINS.includes(s), s.id + ' not in the lists');
    ok(s.kind === 'hero' ? s.pip && s.raider && Object.keys(s.pip).length === 6 : s.tiers && s.tiers.length === 6, s.id + ' full palette');
  }
  eq([HERO_SKINS.length, WEAPON_SKINS.length, PAID_SKIN_IDS.length, FREE_SKIN_IDS.length], [6, 5, 9, 2], 'the shop lists are unchanged');
});

test('predict(): the same trophy maths as verdict.js (what the rules check and trophy.mjs saw)', () => {
  eq([humanStake, botStake, botGain, humanGain], [verdict.humanStake, verdict.botStake, verdict.botGain, verdict.humanGain], 're-exported, not copied');
  eq(predict({ tr0: 450, rivalTr: 520, result: 'win' }), 31, 'trophy.mjs human win (450 vs 520)');
  eq(predict({ tr0: 520, rivalTr: 450, result: 'lose' }), -20, 'and the other side');
  eq([0, 9, 299, 300, 700, 1200].map((tr) => [predict({ tr0: tr, result: 'win', bot: true }), predict({ tr0: tr, result: 'lose', bot: true })]),
    [[28, -0], [28, -9], [28, -10], [20, -20], [12, -12], [6, -6]], 'the bot tiers');
  eq([predict({ tr0: 300, rivalTr: 310, result: 'draw' }), predict({ tr0: 0, rivalTr: 0, result: 'win' })], [0, 28], 'draw, a dc win from 0');
  eq([predict({ tr0: 500, rivalTr: 1500, result: 'win' }), predict({ tr0: 1500, rivalTr: 500, result: 'win' })], [40, 2], 'the clamp');
});

test('weekBase / dayOf equal the WK / DAY of the published rules on 20 random times; weekScore', () => {
  const text = fs.readFileSync(new URL('../../config/firebase/database.rules.json', import.meta.url), 'utf8');
  const WK = '(((now - 345600000) - (now - 345600000) % 604800000) / 6048)', DAY = '((now - now % 86400000) / 86400000)';
  ok(text.includes(WK.slice(1)) && text.includes(DAY), 'the expressions are the rules\' own text');
  const wk = new Function('now', `return ${WK}`), day = new Function('now', `return ${DAY}`);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 20; i++) {
    const now = Math.floor(1.75e12 + rnd() * 1e11);
    eq([weekBase(now), dayOf(now)], [wk(now), day(now)], `at ${now}`);
  }
  const mon = Date.UTC(2026, 10, 30), sun = mon - 1;
  ok(weekBase(mon) - weekBase(sun) === 100000 && dayOf(mon) - dayOf(sun) === 1, 'Monday 00:00 UTC starts a week');
  eq([weekScore(weekBase(mon) + 124, mon), weekScore(weekBase(sun) + 900, mon)], [124, 0], 'this week / last week');
  eq([TROPHY.dayCap, TROPHY.claimAfterMs, TROPHY.liveDeadMs], [40, 20500, 6000]);
});

test('a test network in a production build (inner.trusted false) pays no coins and grants no online skin', () => {
  const make = (trusted) => {
    const data = { coins: 0, online: { name: '', tr: 0, pk: 0, bt: 0, st: 0, bs: 0, w: 0, hist: [] }, skins: { owned: ['classic', 'factory'], hero: 'classic', weapon: 'factory' } };
    const save = { data, owns: (id) => data.skins.owned.includes(id), update: (fn) => { fn(data); return data; }, addCoins: (n) => { data.coins += n; return data.coins; } };
    const session = { uid: 'me', profile: { n: 'Kid', tr: 1800, pk: 1800, w: 10, bs: 5, bt: 0, st: 0, l: 0, ws: 0, cd: 0, cc: 0 }, ranked: null, onRanked: () => () => {} };
    const flow = { mode: 'quick' };
    const R = installRewards(flow, { game: { save }, transport: { now: () => 1.8e12 }, session, changed: () => {}, trusted, t0: () => 1.8e12 });
    R.connected();
    R.record({ result: 'win', t: 40, d: 480 }, {}, [{ uid: 'me', name: 'Kid', slot: 0 }, { uid: 'x', name: 'Bot', slot: 1 }]);
    return { coins: data.coins, skins: data.skins.owned.filter((id) => id.startsWith('on-')).length, shown: flow.reward.last.coins, untrusted: flow.reward.last.untrusted };
  };
  eq(make(false), { coins: 0, skins: 0, shown: 0, untrusted: true }, 'untrusted: nothing paid, nothing owned');
  const t = make(true);
  eq([t.coins > 0, t.skins, t.untrusted], [true, 4, false], 'the real service (or a dev / test page): coins and all four skins');
});

run('rewards');
