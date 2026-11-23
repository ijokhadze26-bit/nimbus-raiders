// Result screen of an online match ('vsresult', registered through ui.addScreen by matchui.js; ui.js routes a
// finished 'versus' run here instead of the single-player result). It reads game.versus.result:
//   YOU WIN! / YOU LOSE / DRAW, why in plain words, then everyone's survival time and distance in finishing order
//   (2 rows for a duel, places 1-4 for more players), then REMATCH and LEAVE.
// - REMATCH follows flow.rematchState(): "NAME WANTS A REMATCH", "WAITING FOR NAME" after my own tap, greyed out with
//   "RIVAL LEFT" when nobody is left to play. The next match begins when the flow starts it (the screen just leaves).
//   After a QUICK MATCH the same button reads PLAY AGAIN (rematchWords(rs).label): a new search.
// - A verdict the network side could not be sure of (provisional) may be replaced by a later one: 'versus:revised'
//   redraws the screen with the result that counts and a RESULT UPDATED tag.
// No coins, trophies or share button here (stage 4), and none of the single-player RETRY / NEXT / MAP buttons.
import { screenEl, bump } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { verdictWords, rematchWords, leftWords, clockTenths, metres, esc, up, nameFit } from './vswords.js';

const RIBBON = { win: 'ribbon-gold', lose: 'ribbon-red', draw: 'ribbon-blue' };
const ICON = {
  win: () => icon('trophy'),
  lose: () => `<span class="lose-ico">${icon('heart')}<span class="crack"></span></span>`,
  draw: () => '<span class="vsr-eq">=</span>',
};

export function createVsResult(ctx) {
  const { game, ui } = ctx;
  const root = screenEl('vsresult', 'dim-screen');
  root.innerHTML = '<div class="result-wrap vsr-wrap"></div>';
  const wrap = root.firstChild;
  let offFlow = null, up2 = false;

  /** The match result; a made-up loss if the screen is ever opened without one (never leaves it blank). */
  function result() {
    const vs = game.versus, r = vs && vs.result;
    if (r) return r;
    const last = game.lastResult || {};
    return { result: last.win ? 'win' : 'lose', place: null, places: [], t: last.time || 0, d: 0, reason: null };
  }

  /** Everyone in finishing order: the verdict's places, else what is known (still standing first, then by time). */
  function ranking(res) {
    const vs = game.versus, roster = ctx.players();
    const mySlot = roster.length ? roster[0].slot : 0;
    const known = new Map((res.places || []).map((p, i) => [p.slot, { ...p, i }]));
    const rows = roster.map((pl, k) => {
      const me = k === 0, rec = known.get(pl.slot), peer = !me && vs ? vs.peer(pl.slot) : null;
      let T = rec ? rec.T : peer && !peer.alive ? peer.T : null;
      let d = rec ? rec.d : peer && !peer.alive ? peer.d : null;
      const by = (rec && rec.by) || (peer && peer.by) || null;
      // my own row always shows what I played (the time and distance the bar showed me)
      if (me) { T = res.t; d = res.d; }
      const standing = !me && T == null;
      return { slot: pl.slot, name: pl.name, me, T, d, by, standing, i: rec ? rec.i : null };
    });
    const iWon = res.result === 'win';
    rows.sort((a, b) => {
      if (a.i != null && b.i != null) return a.i - b.i;
      if (a.i != null || b.i != null) return a.i != null ? -1 : 1;
      const ra = a.standing || (a.me && iWon) ? 1e9 : a.T || 0, rb = b.standing || (b.me && iWon) ? 1e9 : b.T || 0;
      return rb - ra;
    });
    return { rows, mySlot };
  }

  function placesHtml(res) {
    const { rows } = ranking(res);
    if (!rows.length) return '';
    const draw = res.result === 'draw';
    return `<ol class="vsr-places"><li class="vsr-h"><span></span><span></span><span>TIME</span><span>DISTANCE</span></li>${rows.map((r, i) => {
      const tag = leftWords(r.by);
      const nums = r.standing ? '<span class="vsr-note">STILL STANDING</span>'
        : `<span class="vsr-tm num">${clockTenths(r.T)}</span><span class="vsr-ds num">${metres(r.d)}</span>`;
      return `<li class="${r.me ? 'me' : ''}" data-slot="${r.slot}" style="--sc:${SLOT_COLORS[r.slot % SLOT_COLORS.length]}">`
        + `<span class="vsr-pl">${draw && i < 2 ? '=' : i + 1}</span>`
        + `<span class="vsr-nm"><i class="vs-dot"></i><span class="vsr-name${r.me ? '' : nameFit(r.name)}">${r.me ? 'YOU' : esc(up(r.name))}</span>${tag ? `<em>${tag}</em>` : ''}</span>${nums}</li>`;
    }).join('')}</ol>`;
  }

  function render() {
    const res = result(), vs = game.versus;
    const w = verdictWords(res, { players: ctx.players().length || 2, stalled: !!vs && vs.quitReason === 'stall' });
    wrap.innerHTML = `${w.tone === 'win' ? '<div class="rays"></div>' : ''}
      <div class="panel panel-result vsr ${w.tone} pop" data-result="${w.tone}" data-reason="${esc(res.reason || '')}">
        <div class="ribbon ${RIBBON[w.tone]}"><span>${w.title}</span></div>
        <div class="res-level">ONLINE MATCH${up2 ? ' <span class="vsr-upd">RESULT UPDATED</span>' : ''}</div>
        <div class="vsr-ico">${ICON[w.tone]()}</div>
        <div class="vsr-why"><b>${esc(w.head)}</b><span>${esc(w.text)}</span></div>
        ${placesHtml(res)}
        <div class="res-btns">
          <button type="button" class="btn btn-gold btn-lg vsr-rematch" data-act="rematch">${icon('retry')}<span>REMATCH</span></button>
          <div class="vsr-rm"></div>
          <div class="btn-row"><button type="button" class="btn btn-md btn-blue" data-act="leave">${icon('home')}<span>LEAVE</span></button></div>
        </div>
      </div>`;
    root.classList.toggle('is-win', w.tone === 'win');
    rematch();
  }

  /** The REMATCH button and the line under it (redrawn on every flow 'change'). */
  function rematch() {
    const btn = wrap.querySelector('.vsr-rematch'), note = wrap.querySelector('.vsr-rm');
    if (!btn) return;
    let rs = null;
    try { rs = ctx.flow && ctx.flow.rematchState ? ctx.flow.rematchState() : null; } catch { rs = null; }
    const w = rematchWords(rs);
    const cls = `btn btn-lg vsr-rematch ${w.waiting ? 'btn-green is-waiting' : w.off ? 'btn-grey' : 'btn-gold'}${w.off ? ' is-disabled' : ''}`;
    if (btn.className !== cls) btn.className = cls;
    btn.hidden = !!w.hide;
    const lab = btn.querySelector('span');
    if (lab && lab.textContent !== w.label) lab.textContent = w.label; // REMATCH, or PLAY AGAIN after a quick match
    const ncls = `vsr-rm${w.hot ? ' hot' : ''}${w.waiting ? ' wait' : ''}`;
    if (note.className !== ncls) note.className = ncls;
    if (note.textContent !== w.note) { note.textContent = w.note; if (w.note) bump(note); }
  }

  game.events.on('versus:revised', () => {
    if (ui.current !== 'vsresult') return;
    up2 = true;
    render(); // (a fresh panel: it pops in again with the result that counts)
    if (result().result === 'win') ui.sfx('star', { index: 2 });
  });

  return {
    el: root,
    show() {
      up2 = !!result().revised;
      render();
      if (offFlow) offFlow();
      offFlow = ctx.flow && ctx.flow.on ? ctx.flow.on('change', rematch) : null;
      if (result().result === 'win') ui.sfx('star', { index: 2 });
    },
    hide() { if (typeof offFlow === 'function') offFlow(); offFlow = null; },
    onAct(act) {
      if (act === 'rematch') { try { ctx.flow.rematch(); } catch (e) { console.warn('[online] rematch failed', e); } rematch(); }
      else if (act === 'leave') ctx.leave();
    },
    onBack() { ctx.leave(); },
    refresh: rematch,
  };
}
