// The LEADERBOARDS and MY PROFILE views of the ONLINE page (STAGE4 "Leaderboards and profile"). Views of hub.js:
// { el, title, enter, sync, leave, onAct, onBack }; BACK returns to the hub.
//   boards   three tabs (TOP 100 / THIS WEEK / LONGEST) read through boards.js only when a tab is opened; the rows are
//            built once per load (plain DOM, the page scrolls). My place is pinned under the list: on TOP 100 my rank
//            among everyone (rk), on the other two my own value and my place when I am in the list.
//   profile  my league badge, trophies, the bar to the next league, wins, losses, streaks, best survival, this week,
//            the four online skins and the last 20 matches. It reads flow.session.profile and the save's online
//            history (save.data.online.hist), nothing else.
// Names that came from the network always go through censor() (boards.js does it for the rows).
import './boards.css';
import { LG, createBoards } from '../boards.js';
import { censor } from '../names.js';
import { esc } from './vswords.js';
export { createProfileView } from './profileview.js';

const TAB_NAMES = { top: 'TOP 100', week: 'THIS WEEK', long: 'LONGEST' };
const NOTES = {
  top: 'The players with the most trophies.',
  week: 'Trophies won this week. Starts again every Monday!',
  long: 'The longest a squad lasted in a Quick Match.',
};

const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
/** Tenths of a second -> m:ss.t */
export function tenthsClock(t10) {
  const v = Math.max(0, Math.round(Number(t10) || 0)), m = Math.floor(v / 600), r = v - m * 600;
  return `${m}:${String(Math.floor(r / 10)).padStart(2, '0')}.${r % 10}`;
}
/** A board value as the row shows it. */
export function valueText(tab, v) {
  if (tab === 'week') return `+${fmt(v)}`;
  if (tab === 'long') return tenthsClock(v);
  return fmt(v);
}
const now = (flow) => { try { return Number(flow.transport.now()) || Date.now(); } catch { return Date.now(); } };

function rowHtml(tab, r) {
  const medal = r.rank <= 3 ? ` m${r.rank}` : '';
  return `<li class="bd-row${r.me ? ' me' : ''}${medal}" data-uid="${esc(r.uid)}"><span class="bd-rk num">${r.rank}</span>`
    + `<span class="bd-bg">${LG.badgeHtml(r.tr, 'sm')}</span><span class="bd-nm">${esc(r.n.toUpperCase())}${r.me ? ' <em>YOU</em>' : ''}</span>`
    + `<span class="bd-v num">${valueText(tab, r.v)}</span></li>`;
}

export function createBoardsView(ui, flow, page) {
  const root = document.createElement('div');
  root.className = 'bd';
  root.innerHTML = `
    <div class="bd-tabs" role="tablist">${Object.entries(TAB_NAMES).map(([id, n]) => `<button type="button" class="bd-tab" role="tab" data-act="bd-tab" data-tab="${id}">${n}</button>`).join('')}</div>
    <p class="bd-note"></p>
    <div class="bd-box">
      <div class="bd-state" role="status" aria-live="polite"></div>
      <ol class="bd-list"></ol>
    </div>
    <div class="bd-mine"></div>`;
  const listEl = root.querySelector('.bd-list'), stateEl = root.querySelector('.bd-state'), noteEl = root.querySelector('.bd-note');
  const mineEl = root.querySelector('.bd-mine');
  const boards = createBoards({ transport: flow.transport, session: flow.session });
  let tab = 'top', shown = false, seq = 0, rows = null, err = null, rankInfo = null, rankTr = null;

  const myTr = () => { const p = flow.session && flow.session.profile; return p ? Math.max(0, Math.floor(Number(p.tr) || 0)) : 0; };

  function setState(kind) {
    stateEl.className = `bd-state ${kind}`;
    if (kind === 'loading') stateEl.innerHTML = '<b>LOADING...</b>';
    else if (kind === 'empty') stateEl.innerHTML = '<b>NO PLAYERS YET - BE THE FIRST!</b>';
    else if (kind === 'error') stateEl.innerHTML = '<b>COULD NOT LOAD</b><span>Check your internet and try again.</span><button type="button" class="btn btn-blue btn-sm" data-act="bd-retry">TRY AGAIN</button>';
    else stateEl.innerHTML = '';
    stateEl.hidden = !kind;
  }

  /** The pinned line under the list: my rank (TOP 100) or my value and my place (the other two). */
  function mine() {
    const p = flow.session && flow.session.profile;
    const name = p ? esc(censor(p.n).toUpperCase()) : 'YOU';
    let place = '', val = '', sub = '';
    if (tab === 'top') {
      val = fmt(myTr());
      place = !rankInfo ? '...' : rankInfo.rank == null ? '?' : rankInfo.plus ? '500+' : `#${rankInfo.rank}`;
      sub = 'YOUR RANK';
    } else {
      const v = tab === 'week' ? LG.weekScore(Number(p && p.ws) || 0, now(flow)) : Math.max(0, Number(p && p.bt) || 0);
      val = valueText(tab, v);
      const r = rows && rows.find((x) => x.me);
      place = r ? `#${r.rank}` : '';
      sub = r ? 'YOUR PLACE' : 'NOT IN THE TOP 100 YET';
    }
    mineEl.className = `bd-mine${place ? '' : ' out'}`;
    mineEl.innerHTML = `<span class="bd-mine-l"><span>${sub}</span><b class="num">${place}</b></span>`
      + `<span class="bd-bg">${LG.badgeHtml(myTr(), 'sm')}</span><span class="bd-nm">${name}</span><span class="bd-v num">${val}</span>`;
  }

  function render() {
    for (const b of root.querySelectorAll('.bd-tab')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    noteEl.textContent = NOTES[tab];
    if (rows === null && !err) { setState('loading'); listEl.innerHTML = ''; }
    else if (err) { setState('error'); listEl.innerHTML = ''; }
    else if (!rows.length) { setState('empty'); listEl.innerHTML = ''; }
    else { setState(''); listEl.innerHTML = rows.map((r) => rowHtml(tab, r)).join(''); }
    root.dataset.tab = tab;
    root.dataset.state = rows === null && !err ? 'loading' : err ? 'error' : rows.length ? 'rows' : 'empty';
    mine();
  }

  async function open(next, force = false) {
    tab = next;
    const my = ++seq;
    const c = !force && boards.cached(tab);
    rows = c ? c.rows : null; err = null;
    render();
    if (!c) {
      const r = await boards.load(tab, { force });
      if (my !== seq || !shown) return;
      rows = r.err ? null : r.rows; err = r.err;
      render();
    }
    if (tab === 'top') rank(force);
  }

  async function rank(force = false) {
    const tr = myTr();
    rankTr = tr;
    const r = await boards.myRank({ force });
    if (!shown || r.tr !== rankTr) return;
    rankInfo = r;
    if (tab === 'top') mine();
  }

  const view = {
    el: root, title: 'LEADERBOARDS',
    boards,
    enter() { shown = true; rankInfo = null; open(tab); },
    leave() { shown = false; seq++; },
    sync() {
      // my trophies changed while the board is open (a claim landed): my rank is read again
      if (shown && tab === 'top' && rankTr !== null && myTr() !== rankTr) { rankInfo = null; mine(); rank(); }
    },
    onAct(act, btn) {
      if (act === 'bd-tab' && btn && btn.dataset.tab && TAB_NAMES[btn.dataset.tab]) { if (btn.dataset.tab !== tab || err) open(btn.dataset.tab); }
      else if (act === 'bd-retry') open(tab, true);
    },
    onBack() { page.close(); return true; },
    /** Test hooks. */
    tab: () => tab,
    open,
  };
  return view;
}

