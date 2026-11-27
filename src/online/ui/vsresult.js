// Result screen of an online match ('vsresult', registered through ui.addScreen by matchui.js; ui.js routes a
// finished 'versus' run here instead of the single-player result). It reads game.versus.result:
//   YOU WIN! / YOU LOSE / DRAW, why in plain words, then everyone's survival time and distance in finishing order
//   (2 rows for a duel, places 1-4 for more players), then REMATCH and LEAVE.
// - REMATCH follows flow.rematchState(): "NAME WANTS A REMATCH", "WAITING FOR NAME" after my own tap, greyed out with
//   "RIVAL LEFT" when nobody is left to play. The next match begins when the flow starts it (the screen just leaves).
//   After a QUICK MATCH the same button reads PLAY AGAIN (rematchWords(rs).label): a new search.
// - A verdict the network side could not be sure of (provisional) may be replaced by a later one: 'versus:revised'
//   redraws the screen with the result that counts and a RESULT UPDATED tag.
// - Stage 4: under the places the trophies and coins of the match (rankline.js, from flow.reward.last; redrawn on
//   every flow 'change': SAVING... then saved), the rival's trophy change in their row, the league-up moment, and a
//   SHARE button beside LEAVE (share.js shareResult). None of the single-player RETRY / NEXT / MAP buttons.
// - Stage 5, WATCHING (3-4 players): my squad fell while others still run. My place is known already (the verdict
//   waits until every runner is 1.1 s past me), so the red ribbon says YOU CAME 3RD, then "OF 4 · WATCHING THE
//   OTHERS..." and the live cards of the watch view (watchview.js over the watch model of watch.js) with LEAVE only.
//   It ends on 'versus:final' (the whole table: the places shown are versus.final, never a guess of mine), on the
//   watch's 'stale' (every runner went silent: the table of what is known) or on LEAVE; then the normal result with
//   REMATCH / LEAVE / SHARE / coins. The winner and the 2nd place never watch: 'final' comes with their verdict.
import { screenEl, bump } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { verdictWords, rematchWords, leftWords, clockTenths, metres, esc, up, nameFit, ORD } from './vswords.js';
import { mountRankLine } from './rankline.js';
import { shareResult } from '../share.js';

// The watch model and its cards are builder WATCH's (src/online/game/watch.js, ui/watchview.js): found here without a
// hard import until the stage-5 merge, with stand-ins of the same shape (the integrator turns these into imports).
const firstOf = (mods) => Object.values(mods)[0] || {};
const WATCH_MOD = firstOf(import.meta.glob('../game/watch.js', { eager: true }));
const VIEW_MOD = firstOf(import.meta.glob('./watchview.js', { eager: true }));
const createWatch = WATCH_MOD.createWatch || (({ link }) => ({
  final: link.final ?? null, stale: !!link.stale,
  on: (t, cb) => { try { return link.on(t, cb); } catch { return () => {}; } }, update() {}, dispose() {},
}));
const mountWatchView = VIEW_MOD.mountWatchView || ((host) => {
  const el = document.createElement('div');
  el.className = 'wv-stub';
  el.textContent = 'WATCHING THE REST OF THE MATCH...';
  host.appendChild(el);
  return { el, update() {}, dispose() { el.remove(); } };
});


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
  let watching = null;   // { watch, view, offs } while my squad is down and the others still run
  let shownFinal = false; // the table on screen is the final one (versus.final)
  let ended = false;      // watching is over for this match (final, stale or never needed): the normal result stays
  const rank = mountRankLine(ctx);

  /** The match result; a made-up loss if the screen is ever opened without one (never leaves it blank). */
  function result() {
    const vs = game.versus, r = vs && vs.result;
    if (r) return r;
    const last = game.lastResult || {};
    return { result: last.win ? 'win' : 'lose', place: null, places: [], t: last.time || 0, d: 0, reason: null };
  }

  const link = () => { const vs = game.versus, l = vs && vs.link; return l && !l.left && !(l.test && l.test.left) ? l : null; };

  /** The places to show: the final table once it is there, else the verdict's, with later falls this link heard. */
  function places(res) {
    const vs = game.versus;
    if (vs && vs.final) return vs.final;
    const list = (res.places || []).map((p) => ({ ...p }));
    let snap = null;
    try { snap = vs && vs.link && vs.link.snapshot ? vs.link.snapshot() : null; } catch { snap = null; }
    if (!snap || !list.some((p) => p.T == null)) return list;
    for (const p of list) { const o = snap.outs && snap.outs[p.slot]; if (p.T == null && o) { p.T = o.T; p.d = o.d; p.by = o.by; } }
    return list.map((p, i) => ({ p, i })).sort((a, b) => ((a.p.T == null) !== (b.p.T == null) ? (a.p.T == null ? -1 : 1)
      : a.p.T == null || (a.p.T === b.p.T && a.p.d === b.p.d) ? a.i - b.i : b.p.T - a.p.T || b.p.d - a.p.d)).map((x) => x.p);
  }

  /** Watch the rest of the match? (a loss, the table not final yet, the link alive, somebody else still running) */
  function shouldWatch(res) {
    const vs = game.versus, l = link(), mySlot = l ? l.slot : null;
    return !ended && res.result === 'lose' && !!vs && !vs.final && !!l && !l.stale && ctx.players().length > 2
      && (res.places || []).some((p) => p.T == null && p.slot !== mySlot);
  }

  function stopWatching() {
    if (!watching) return;
    const w = watching; watching = null;
    for (const off of w.offs) { try { off(); } catch { /* gone */ } }
    try { w.view.dispose(); } catch (e) { console.warn('[online] watch view', e); }
    try { w.watch.dispose(); } catch (e) { console.warn('[online] watch', e); }
  }

  /** The watching head + the live cards + LEAVE. */
  function renderWatching(res) {
    const n = ctx.players().length, place = ORD[res.place] ? res.place : null;
    wrap.innerHTML = `<div class="panel panel-result vsr lose watching pop" data-result="lose" data-watching="1" data-reason="${esc(res.reason || '')}">
        <div class="ribbon ribbon-red"><span>${place ? `YOU CAME ${ORD[place]}` : 'SQUAD DOWN'}</span></div>
        <div class="res-level">ONLINE MATCH</div>
        <div class="vsr-wline">${place ? `OF ${n} · ` : ''}WATCHING THE OTHERS...</div>
        <div class="vsr-watch"></div>
        <div class="res-btns"><button type="button" class="btn btn-md btn-blue" data-act="leave">${icon('home')}<span>LEAVE</span></button></div>
      </div>`;
    root.classList.remove('is-win');
    if (watching) { if (watching.view.el) wrap.querySelector('.vsr-watch').appendChild(watching.view.el); return; } // (a redraw: the cards move to the new host)
    const l = link(), me = ctx.players()[0] || {}, prof = ctx.flow && ctx.flow.session && ctx.flow.session.profile;
    const roster = ctx.players().map((p, i) => ({ slot: p.slot, name: p.name, tr: i === 0 ? Number(prof && prof.tr) || 0 : Number(p.tr) || 0,
      hero: p.hero, weapon: p.weapon, heroSkin: p.heroSkin || null, weaponSkin: p.weaponSkin || null }));
    let watch = null, view = null;
    try {
      watch = createWatch({ link: l, roster });
      view = mountWatchView(wrap.querySelector('.vsr-watch'), watch, { mode: 'fallen', mySlot: me.slot ?? l.slot });
    } catch (e) {
      console.warn('[online] watch view failed', e);
      if (watch) try { watch.dispose(); } catch { /* gone */ }
      ended = true; render(); return;
    }
    watching = { watch, view, offs: [watch.on('stale', () => end())] };
  }

  /** Watching is over: the normal result with the table (final, or what is known). */
  function end() {
    if (!watching && ended) return;
    stopWatching();
    ended = true;
    if (ui.current === 'vsresult') render();
  }

  /** Everyone in finishing order: the verdict's places, else what is known (still standing first, then by time). */
  function ranking(res) {
    const vs = game.versus, roster = ctx.players();
    const mySlot = roster.length ? roster[0].slot : 0;
    const known = new Map(places(res).map((p, i) => [p.slot, { ...p, i }]));
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
    // a draw for first: mine, or (3-4 players) two others with the same distance inside the tie window of 1 s
    const [a, b] = rows;
    const draw = res.result === 'draw' || (!!b && !a.standing && !b.standing && a.T != null && b.T != null
      && Math.abs(a.T - b.T) <= 1 && Math.round(a.d) === Math.round(b.d));
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
    if (shouldWatch(res)) { renderWatching(res); return; }
    if (watching) stopWatching();
    shownFinal = !!(vs && vs.final);
    const w = verdictWords(res, { players: ctx.players().length || 2, stalled: !!vs && vs.quitReason === 'stall' });
    wrap.innerHTML = `${w.tone === 'win' ? '<div class="rays"></div>' : ''}
      <div class="panel panel-result vsr ${w.tone} pop" data-result="${w.tone}" data-reason="${esc(res.reason || '')}">
        <div class="ribbon ${RIBBON[w.tone]}"><span>${w.title}</span></div>
        <div class="res-level">ONLINE MATCH${up2 ? ' <span class="vsr-upd">RESULT UPDATED</span>' : ''}</div>
        <div class="vsr-ico">${ICON[w.tone]()}</div>
        <div class="vsr-why"><b>${esc(w.head)}</b><span>${esc(w.text)}</span></div>
        ${placesHtml(res)}
        <div class="vsr-rank" hidden></div>
        <div class="res-btns">
          <button type="button" class="btn btn-gold btn-lg vsr-rematch" data-act="rematch">${icon('retry')}<span>REMATCH</span></button>
          <div class="vsr-rm"></div>
          <div class="btn-row"><button type="button" class="btn btn-md btn-blue" data-act="leave">${icon('home')}<span>LEAVE</span></button><button type="button" class="btn btn-md btn-blue vsr-share" data-act="share"><span>SHARE</span></button></div>
        </div>
      </div>`;
    root.classList.toggle('is-win', w.tone === 'win');
    rank.refresh(wrap, res, true);
    rematch();
  }

  /** On every flow 'change': the REMATCH line and the trophies / coins (SAVING... -> saved). */
  function refresh() { rank.refresh(wrap, result(), false); rematch(); }

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

  // the whole table of a 3-4 player match: watching ends, or a table that still had runners in it is redrawn
  game.events.on('versus:final', () => {
    if (ui.current !== 'vsresult') return;
    if (watching) end();
    else if (!shownFinal) render();
  });

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
      stopWatching(); ended = false; shownFinal = false;
      render();
      if (offFlow) offFlow();
      offFlow = ctx.flow && ctx.flow.on ? ctx.flow.on('change', refresh) : null;
      if (result().result === 'win') ui.sfx('star', { index: 2 });
    },
    hide() { if (typeof offFlow === 'function') offFlow(); offFlow = null; stopWatching(); },
    /** Every frame while this screen is on top (ui.update): the watch model and its cards. */
    update(dt) { if (watching) { watching.watch.update(dt || 0); watching.view.update(dt || 0); } },
    /** Test hooks. */
    watching: () => !!watching,
    watchView: () => (watching ? watching.view : null),
    onAct(act) {
      if (act === 'rematch') { try { ctx.flow.rematch(); } catch (e) { console.warn('[online] rematch failed', e); } rematch(); }
      else if (act === 'leave') ctx.leave();
      else if (act === 'share') shareResult(rank.info(result())).catch((e) => console.warn('[online] share failed', e));
    },
    onBack() { ctx.leave(); },
    refresh,
    rank,
  };
}
