// MY PROFILE, a view of the ONLINE page (STAGE4 "Profile view"; reached from PROFILE on the hub's name row):
// the big league badge, name, trophies and BEST, the bar to the next league ("120 MORE TO GOLD"), WINS / LOSSES,
// WIN STREAK / BEST STREAK, BEST SURVIVAL, THIS WEEK, the four online skins (owned, or locked with how to earn them)
// and the last 20 matches. Reads flow.session.profile and the save's online history; nothing else, no network.
// Rebuilt on enter() and when the profile object or the history changes (flow 'change'), never per frame.
import './boards.css';
import { icon } from '../../ui/icons.js';
import { ONLINE_SKINS } from '../../data/skins.js';
import { heroPreview, weaponPreview } from '../../ui/screens/shop.js';
import { LG } from '../boards.js';
import { censor } from '../names.js';
import { esc } from './vswords.js';

// How each online skin is earned: skins.js ONLINE_SKINS[].earn (the same source as leagues.js SKIN_RULES).
export const SKIN_HINTS = Object.fromEntries(ONLINE_SKINS.map((s) => [s.id, { kind: s.kind, hint: s.earn.hint, field: s.earn.field, min: s.earn.min }]));
/** The four online skins (skins.js). */
export const onlineSkins = () => ONLINE_SKINS;
const isHero = (s) => s.kind === 'hero';

const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
const int = (v) => Math.max(0, Math.floor(Number(v) || 0));
const clockT10 = (t10) => { const v = int(t10), m = Math.floor(v / 600), r = v - m * 600; return `${m}:${String(Math.floor(r / 10)).padStart(2, '0')}.${r % 10}`; };
const clockS = (s) => clockT10(Math.round((Number(s) || 0) * 10));

/** "just now", "5 min ago", "2 h ago", "3 days ago" for a history row's time (seconds). */
export function agoText(a, nowMs = Date.now()) {
  const s = Math.max(0, Math.floor(nowMs / 1000 - (Number(a) || 0)));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

function skinTile(s, owned, prof) {
  const h = SKIN_HINTS[s.id] || { hint: 'Earn it online', field: 'w', min: 1 };
  const prev = isHero(s) ? heroPreview(s) : weaponPreview(s);
  const have = prof ? Math.min(h.min, int(prof[h.field])) : 0;
  const prog = h.field === 'pk' ? `${fmt(have)} / ${fmt(h.min)}` : `${have} / ${h.min}`;
  return `<div class="pf-skin r-${esc(s.rarity || 'epic')}${owned ? ' owned' : ''}" data-id="${esc(s.id)}">`
    + `<div class="pf-skin-prev">${prev}${owned ? '' : `<span class="pf-lock">${icon('lock')}</span>`}</div>`
    + `<div class="pf-skin-name">${esc(String(s.name || '').toUpperCase())}</div>`
    + `<div class="pf-skin-kind">${isHero(s) ? 'PIP OUTFIT' : 'GUN PAINT'}</div>`
    + (owned ? `<div class="pf-skin-own">${icon('check')}YOURS</div>` : `<div class="pf-skin-hint">${esc(h.hint)}<b class="num">${prog}</b></div>`)
    + '</div>';
}

function histRow(r, nowMs) {
  const chip = r.r === 'w' ? 'W' : r.r === 'd' ? 'D' : 'L';
  const g = Number.isFinite(Number(r.g)) && Number(r.g) !== 0 ? Math.round(Number(r.g)) : null;
  return `<li class="pf-m r-${chip.toLowerCase()}"><span class="pf-chip">${chip}</span>`
    + `<span class="pf-m-mid"><b class="pf-m-n">${r.n ? esc(censor(r.n).toUpperCase()) : 'RIVAL'}</b>`
    + `<span class="pf-m-sub"><span class="num">${clockS(r.t)}</span> · <span class="num">${fmt(r.d)}m</span> · ${r.k === 'q' ? 'QUICK' : 'FRIEND'}</span></span>`
    + `<span class="pf-m-end">${g === null ? '' : `<b class="pf-g ${g > 0 ? 'up' : 'down'} num">${g > 0 ? '+' : ''}${g}</b>`}<span class="pf-ago">${agoText(r.a, nowMs)}</span></span></li>`;
}

export function createProfileView(ui, flow, page) {
  const root = document.createElement('div');
  root.className = 'pf';
  let seen = null;   // what the view was last built from

  const save = () => ui.save || (ui.game && ui.game.save);
  const nowMs = () => { try { return Number(flow.transport.now()) || Date.now(); } catch { return Date.now(); } };

  function build() {
    const sv = save(), d = sv && sv.data;
    const p = (flow.session && flow.session.profile) || null;
    const cache = (d && d.online) || {};
    const P = p || { n: cache.name || flow.name || '', tr: cache.tr, pk: cache.pk, w: cache.w, l: 0, st: cache.st, bs: cache.bs, bt: cache.bt, ws: 0 };
    const hist = (d && d.online && Array.isArray(d.online.hist) ? d.online.hist : []).slice(0, 20);
    seen = { p, hist: d && d.online ? d.online.hist : null, owned: d ? d.skins.owned.length : 0 };
    const tr = int(P.tr), lg = LG.leagueOf(tr);
    const next = lg.next == null ? null : LG.LEAGUES.find((x) => x.min === lg.next) || null;
    const frac = next ? Math.max(0, Math.min(1, (tr - lg.min) / Math.max(1, lg.next - lg.min))) : 1;
    const streak = P.sk && typeof P.sk === 'object' ? int(P.sk.st) : int(P.st);
    const week = LG.weekScore(Number(P.ws) || 0, nowMs());
    const stats = [['WINS', fmt(P.w)], ['LOSSES', fmt(P.l)], ['WIN STREAK', fmt(streak)], ['BEST STREAK', fmt(Math.max(int(P.bs), streak))],
      ['BEST SURVIVAL', int(P.bt) ? clockT10(P.bt) : '-'], ['THIS WEEK', week > 0 ? `+${fmt(week)}` : '0']];
    const owned = (id) => !!(d && d.skins.owned.includes(id));
    root.innerHTML = `
      <div class="on-card pf-head pop">
        <div class="pf-badge">${LG.badgeHtml(tr, 'lg')}</div>
        <div class="pf-name">${esc(censor(P.n || flow.name || 'Raider').toUpperCase())}</div>
        <div class="pf-league" style="--lg:${lg.color};--lge:${lg.edge}">${esc(lg.name)} LEAGUE</div>
        <div class="pf-tr">${icon('trophy')}<b class="num">${fmt(tr)}</b><span>BEST <b class="num">${fmt(Math.max(tr, int(P.pk)))}</b></span></div>
        <div class="pf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(frac * 100)}"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
        <div class="pf-next">${next ? `<b class="num">${fmt(lg.next - tr)}</b> MORE TO ${esc(next.name)}` : 'TOP LEAGUE - AMAZING!'}</div>
      </div>
      <div class="pf-stats">${stats.map(([k, v]) => `<div class="pf-stat"><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
      <p class="pf-note">Wins and streaks count Quick Matches. Friend matches are just for fun!</p>
      <div class="on-card pf-skins">
        <div class="pf-h ol">ONLINE SKINS</div>
        <p class="pf-p">Only online players can earn these!</p>
        <div class="pf-skin-grid">${onlineSkins().slice(0, 4).map((s) => skinTile(s, owned(s.id), p || P)).join('')}</div>
      </div>
      <div class="on-card pf-hist">
        <div class="pf-h ol">LAST MATCHES</div>
        ${hist.length ? `<ol class="pf-list">${hist.map((r) => histRow(r, nowMs())).join('')}</ol>` : '<p class="pf-p pf-none">NO MATCHES YET - PLAY ONE!</p>'}
      </div>`;
  }

  return {
    el: root, title: 'MY PROFILE',
    enter() { build(); },
    sync() {
      const d = save() && save().data;
      const p = (flow.session && flow.session.profile) || null;
      if (!seen || seen.p !== p || seen.hist !== (d && d.online ? d.online.hist : null) || seen.owned !== (d ? d.skins.owned.length : 0)) build();
    },
    onBack() { page.close(); return true; },
    /** Test hook: build again now. */
    build,
  };
}
