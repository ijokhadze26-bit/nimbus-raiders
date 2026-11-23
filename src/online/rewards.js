// What a finished online match gives (online stage 4): coins, the online skins the server profile has earned, the
// match's history row with its trophy change (g) and coins (c), and flow.reward.last for the result screen.
//
//   installRewards(flow, inner) -> { connected(), record(result, link, players) }     inner = { game, transport,
//                                  session, changed(), t0(link) }  (flow.js calls both; nothing else does)
//   flow.reward.last = null | { id, a, kind: 'q'|'f', result, ranked, why /* null|'cap'|'offline'|'busy'|'late'|
//     'denied'|'pending'|'friend' */, state /* 'staking'|'staked'|'saving'|'saved'|'failed'|'none' */, g, tr0, tr, o,
//     ro /* the rival's own stake once seen: { tr0, o } */, rkind /* 'human'|'bot' */, leagueUp, coins,
//     coinParts: [{ k: 'base'|'time'|'first'|'friend', n }], skins: [ids newly earned], untrusted }
// A test network in a production build (?net=local / bridge / an in-page hub without ?test=1: inner.trusted false)
// pays no coins and grants no online skin: those come only from the real service (or a dev / test page).
// Coins go through save.addCoins (no shop bonus), once per match keyed by its history row `a`; a revised verdict pays
// only the difference up. The day counters live in localStorage 'nimbusRaiders.online.coins' = { day, fw, fp }
// (fw: today's first quick-match win was paid, fp: friend matches paid today). Ownership of the online skins comes only
// from the server profile (earnedSkins), recomputed at every visit and after every ranked write.
import { setOnlineProfile, addOnlineMatch } from '../save/onlinesave.js';
import { coinsFor, earnedSkins, leagueOf, dayOf } from './leagues.js';

export const COIN_KEY = 'nimbusRaiders.online.coins';

export function installRewards(flow, inner) {
  const { game, transport: tp, session } = inner;
  const trusted = inner.trusted !== false;
  const reward = { last: null };
  const paid = new Map(); // a -> { first, friend, c }: what this page already paid for a match
  let seen = null;
  flow.reward = reward;

  const counters = () => {
    const day = dayOf(tp.now());
    let v = null;
    try { v = JSON.parse(localStorage.getItem(COIN_KEY) || 'null'); } catch { /* blocked */ }
    return v && v.day === day ? { day, fw: v.fw ? 1 : 0, fp: Math.max(0, Math.floor(Number(v.fp) || 0)) } : { day, fw: 0, fp: 0 };
  };
  const keep = (v) => { try { localStorage.setItem(COIN_KEY, JSON.stringify(v)); } catch { /* blocked */ } };

  /** The online skins the server profile has earned and the save does not own yet: owned now. -> the new ids */
  function grant(profile) {
    if (!trusted) return [];
    const ids = earnedSkins(profile).filter((id) => !game.save.owns(id));
    if (ids.length) game.save.update((d) => { for (const id of ids) if (!d.skins.owned.includes(id)) d.skins.owned.push(id); });
    return ids;
  }

  function profileChanged() {
    const P = session.profile;
    if (!P || P === seen) return [];
    seen = P;
    setOnlineProfile(game.save, P);
    return grant(P);
  }

  /** The history row of match `a` gets its trophy change. */
  function rowG(a, g) {
    const row = game.save.data.online.hist.find((h) => h.a === a);
    if (row && g && row.g !== g) addOnlineMatch(game.save, { ...row, g });
  }

  /** The ranked side's state of a match onto its reward (the result screen reads it). */
  function apply(L, v) {
    L.ranked = v.state !== 'none';
    L.why = v.why; L.state = v.state; L.g = v.g; L.tr0 = v.tr0; L.tr = v.tr; L.o = v.o; L.rkind = v.kind; L.ro = v.ro || null;
    if (v.state === 'saved' && !L.done) {
      L.done = true;
      L.leagueUp = L.result === 'win' && v.tr != null && v.tr0 != null && leagueOf(v.tr).i > leagueOf(v.tr0).i;
    }
  }

  session.onRanked((v) => {
    const fresh = profileChanged();
    const L = reward.last;
    if (L && L.kind === 'q' && L.id === v.id) { apply(L, v); if (fresh.length) L.skins = [...L.skins, ...fresh]; }
    if ((v.state === 'saved' || v.state === 'failed') && v.g) rowG(Math.floor(v.id / 1000), v.g);
    inner.changed();
  });

  return {
    /** Every visit: the cached profile and the online skins follow the server's profile. */
    connected() { profileChanged(); },

    /** A verdict (or a revised one) of the current match: coins, its history row, flow.reward.last. */
    record(r, link, players) {
      const kind = flow.mode === 'quick' ? 'q' : 'f', id = inner.t0(link), a = Math.floor(id / 1000);
      const res = r.result, rival = (players || []).find((p) => p.uid !== session.uid);
      const cnt = counters(), before = paid.get(a);
      const first = trusted && kind === 'q' && res === 'win' && (before && before.first ? true : !cnt.fw);
      const friendPaid = kind === 'f' ? cnt.fp - (before && before.friend ? 1 : 0) : 0;
      const { total, parts } = trusted ? coinsFor({ kind, result: res, t: r.t, firstWin: first, friendPaid }) : { total: 0, parts: [] };
      const already = before ? before.c : 0;
      if (total > already) game.save.addCoins(total - already);
      const c = Math.max(total, already);
      if (first) cnt.fw = 1;
      const friend = (before && before.friend) || (kind === 'f' && total > 0);
      if (friend && !(before && before.friend)) cnt.fp++;
      keep(cnt);
      paid.set(a, { first: first || !!(before && before.first), friend, c });

      const L = { id, a, kind, result: res, ranked: false, why: kind === 'f' ? 'friend' : null, state: 'none', g: null, tr0: null, tr: null,
        o: null, ro: null, rkind: null, leagueUp: false, coins: c, coinParts: parts, skins: [], done: false, untrusted: !trusted };
      const v = session.ranked;
      if (kind === 'q' && v && v.id === id) apply(L, v);
      reward.last = L;
      const row = { a, r: res[0], t: r.t, d: r.d, n: rival ? rival.name : '', k: kind, c };
      if (L.g && (L.state === 'saved' || L.state === 'failed')) row.g = L.g;
      addOnlineMatch(game.save, row);
    },
  };
}
