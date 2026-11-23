// The result screen's trophies and coins (online stage 4), drawn by vsresult.js under the places list from
// flow.reward.last (src/online/rewards.js):
//   .vsr-rank > .vsr-tr[data-g]     "+28" + league badge + new total, SAVING... then a check mark; "-10"; TROPHIES BACK
//                                   (draw); NO TROPHIES THIS TIME + why (daily limit / connection); FRIEND MATCH - NO TROPHIES
//             > .vsr-coins[data-c]  "+87 COINS" and "+100 FIRST WIN TODAY!" as its own chip; a line when it is 0
//             > .vsr-skin           "NEW PIP OUTFIT: SILVER STORM! Find it in the SHOP."
//   .vsr-rg in the rival's place row  their trophy change, the same formula from the same numbers (STAGE4 #15)
//   .vsr-lgup                       the league-up moment once the claim is saved: big badge, YOU REACHED SILVER LEAGUE!
// Plain DOM strings; works on Low graphics (transforms and opacity only).
import './rank.css';
import { icon } from '../../ui/icons.js';
import { HERO_BY_ID, WEAPON_SKIN_BY_ID } from '../../data/skins.js';
import { badgeHtml, leagueOf, predict } from '../leagues.js';
import { esc, up } from './vswords.js';

const signed = (g) => (g > 0 ? `+${g}` : g < 0 ? `-${-g}` : '0');
const CONNECTION = 'Your internet was too slow to play for trophies.';
const WHY = {
  cap: ['DAILY TROPHY LIMIT', 'You won 40 times today! Trophies come back tomorrow.'],
  offline: ['NO TROPHIES THIS TIME', CONNECTION], late: ['NO TROPHIES THIS TIME', CONNECTION],
  busy: ['NO TROPHIES THIS TIME', 'Your last win was still saving.'], denied: ['NO TROPHIES THIS TIME', 'This match could not play for trophies.'],
};
// a staked win the limit refused (a second tab won the 40th first): the stake is gone, so no "come back tomorrow"
const CAP_AFTER = 'You already won 40 times today, so this win could not add trophies. Play again tomorrow!';

/** The trophies line: { cls, g, html }. */
function trophyLine(L, res) {
  if (!L) return { g: '', html: '' };
  if (L.kind === 'f') return { g: '', html: '<span class="vsr-none">FRIEND MATCH - NO TROPHIES</span>' };
  if (!L.ranked) {
    const w = L.why === 'cap' ? ['NO TROPHIES THIS TIME', WHY.cap[1]] : WHY[L.why] || ['NO TROPHIES THIS TIME', CONNECTION];
    return { g: '', html: `<span class="vsr-none">${w[0]}</span><small>${w[1]}</small>` };
  }
  if (L.state === 'staking') return { g: '', html: '<span class="vsr-trrow"><span class="vsr-none">TROPHIES</span><i class="vsr-st">SAVING...</i></span>' };
  const g = L.g == null ? 0 : L.g;
  const tr = L.tr != null ? L.tr : (L.tr0 || 0) + g;
  let tail;
  if (L.state === 'saved') tail = `<i class="vsr-ok">${icon('check')}</i>`;
  else if (L.state === 'failed' && L.why === 'pending') tail = '<i class="vsr-st">SAVES NEXT TIME</i>';
  else if (L.state === 'failed') tail = '';
  else tail = '<i class="vsr-st">SAVING...</i>';
  const big = res.result === 'draw' && L.state !== 'failed' ? '<b class="vsr-g even">TROPHIES BACK</b>' : `<b class="vsr-g ${g > 0 ? 'up' : g < 0 ? 'down' : 'even'}">${signed(g)}</b>`;
  const cap = L.state === 'failed' && L.why === 'cap' ? `<small>${WHY.cap[0]} - ${CAP_AFTER}</small>` : L.state === 'failed' && L.why === 'denied' ? '<small>The win could not be saved.</small>' : '';
  return { g: String(g), html: `<span class="vsr-trrow">${big}${badgeHtml(tr, 'sm')}<span class="vsr-total num">${tr}</span>${tail}</span>${cap}` };
}

function coinsLine(L) {
  if (!L) return { c: '', html: '' };
  const first = L.coinParts.find((p) => p.k === 'first'), rest = L.coins - (first ? first.n : 0);
  if (!L.coins) {
    const why = L.untrusted ? 'Test games pay no coins' : L.kind === 'f' ? 'Friend matches pay coins 10 times a day' : 'Play at least 10 seconds to earn coins';
    return { c: '0', html: `<span class="vsr-cnone">${why}</span>` };
  }
  return { c: String(L.coins), html: `${rest > 0 ? `<span class="vsr-cn"><span class="coin-ico">${icon('coin')}</span><b class="num">+${rest}</b> COINS</span>` : ''}${first ? `<span class="vsr-first">+${first.n} FIRST WIN TODAY!</span>` : ''}` };
}

/** One line however many skins one match unlocked (two lines did not fit 360 x 640 under the ribbon). */
function skinLines(L) {
  const list = (L && L.skins ? L.skins : []).map((id) => ({ hero: !!HERO_BY_ID[id], s: HERO_BY_ID[id] || WEAPON_SKIN_BY_ID[id] })).filter((x) => x.s);
  if (!list.length) return '';
  const what = list.length === 1 ? `NEW ${list[0].hero ? 'PIP OUTFIT' : 'GUN PAINT'}: ${esc(up(list[0].s.name))}!` : `NEW SKINS: ${list.map((x) => esc(up(x.s.name))).join(' + ')}!`;
  return `<div class="vsr-skin" data-n="${list.length}">${icon('gift')}<span>${what} <small>Find ${list.length === 1 ? 'it' : 'them'} in the SHOP.</small></span></div>`;
}

/** The whole .vsr-rank block (inner HTML) for the last match. */
export function rankHtml(L, res) {
  if (!L) return '';
  const t = trophyLine(L, res), c = coinsLine(L);
  return `<div class="vsr-tr" data-g="${t.g}" data-state="${L.state}">${t.html}</div><div class="vsr-coins" data-c="${c.c}">${c.html}</div>${skinLines(L)}`;
}

/** The rival's change in a ranked quick match (null otherwise): their numbers, their side of my result. */
export function rivalG(L, res) {
  if (!L || L.kind !== 'q' || !L.ranked || L.tr0 == null) return null;
  const opp = res.result === 'win' ? 'lose' : res.result === 'lose' ? 'win' : 'draw';
  // a person: only from their own stake of this match (one who did not stake changes nothing: no tag)
  if (L.rkind === 'human') return L.ro ? predict({ tr0: L.ro.tr0, rivalTr: L.ro.o, result: opp, bot: false }) : null;
  return predict({ tr0: L.o || 0, rivalTr: L.tr0, result: opp, bot: false });
}

/**
 * mountRankLine(ctx) -> { refresh(wrap, res), moment(root), info(res) }   vsresult.js calls refresh() after each
 * render and on every flow 'change' (it rewrites only what changed); the league-up moment shows once per match.
 */
export function mountRankLine(ctx) {
  const shown = new Set();
  let lastKey = '';
  const last = () => (ctx.flow && ctx.flow.reward ? ctx.flow.reward.last : null);

  function refresh(wrap, res, fresh) {
    const L = last(), box = wrap.querySelector('.vsr-rank');
    if (!box) return;
    const html = rankHtml(L, res);
    if (fresh || html !== lastKey) { lastKey = html; box.innerHTML = html; box.hidden = !html; }
    const g = rivalG(L, res);
    for (const li of wrap.querySelectorAll('.vsr-places li[data-slot]:not(.me)')) {
      let tag = li.querySelector('.vsr-rg');
      if (g === null) { if (tag) tag.remove(); continue; }
      if (!tag) { tag = document.createElement('b'); li.querySelector('.vsr-nm').appendChild(tag); }
      tag.className = `vsr-rg ${g > 0 ? 'up' : g < 0 ? 'down' : 'even'}`;
      tag.textContent = `${signed(g)} TROPHIES`;
    }
    if (L && L.leagueUp && !shown.has(L.id)) { shown.add(L.id); moment(wrap, L); }
  }

  /** YOU REACHED SILVER LEAGUE! over the panel for a moment (a tap closes it early). */
  function moment(wrap, L) {
    const lg = leagueOf(L.tr);
    const el = document.createElement('div');
    el.className = 'vsr-lgup';
    el.innerHTML = `<div class="rays"></div><div class="vsr-lg-in">${badgeHtml(L.tr, 'lg')}<b>YOU REACHED<br>${esc(lg.name)} LEAGUE!</b></div>`;
    wrap.appendChild(el);
    try { ctx.ui.sfx('star', { index: 2 }); } catch { /* no audio */ }
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('pointerdown', close, { once: true });
    setTimeout(close, 2800);
  }

  /** What the share picture shows (share.js shareResult(info)). */
  function info(res) {
    const L = last(), f = ctx.flow || {}, roster = ctx.players ? ctx.players() : [];
    const rival = roster[1] || {};
    const me = roster[0] || {};
    return {
      result: res.result, t: res.t, d: res.d, kind: L ? L.kind : f.mode === 'quick' ? 'q' : 'f', when: L ? L.id : Date.now(),
      me: { name: me.name || (f.session && f.session.profile && f.session.profile.n) || '', tr: L && L.tr != null ? L.tr : (f.session && f.session.profile ? f.session.profile.tr : 0), g: L && L.ranked ? L.g : null },
      rival: { name: rival.name || '' }, coins: L ? L.coins : 0,
    };
  }

  return { refresh, moment, info };
}
