// The WATCH cards (STAGE5 "The cards"): one card per player of a match that is still on, for a fallen player (inside
// the result screen, mode 'fallen') and for a spectator (the ONLINE page's watch view, mode 'spectator').
//
//   const view = mountWatchView(host, watch, { mode: 'fallen' | 'spectator', mySlot = null })
//     host   any element: the view renders INTO it (and removes itself on dispose)
//     watch  a createWatch() model (src/online/game/watch.js); the caller runs watch.update(dt), the view only reads
//   view.update(dt)   8 reads a second (WATCH.stepS); DOM writes only when a value changed
//   view.dispose()    view.el    view.test.read() -> what the cards show (tests)
//
// Top line: the match clock and SUDDEN DEATH / STORM. Cards in seat order with the seat colour: name, league badge and
// trophies, the squad big, the distance, a 9-step danger bar (red from 5: DANGER!), a purple boss bar while at a boss,
// the sabotage flag icons, LOST CONNECTION, and once fallen OUT then the place with time and metres. An emote pops on
// its sender's card. Under the cards the feed ("ANN → BEN · FOG"). Mode 'spectator' shows, WATCH.doneHoldMs after
// 'final' (or at once on 'stale'), the result table with "ANN WINS!" and WAITING FOR THE NEXT MATCH...
// Plain DOM only (no canvas, no filter, no backdrop-filter): it costs nothing on Low graphics.
import './watch.css';
import { icon } from '../../ui/icons.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { WATCH } from '../game/watch.js';
import { badgeHtml } from '../leagues.js';
import { clock, clockTenths, metres, esc, up, nameFit, leftWords } from './vswords.js';
import { flagIcon, sabKind } from './sabwords.js';
import { emoteSvg } from './emotes.js';
import { FLAG } from '../codec.js';

const ORD = ['', '1ST', '2ND', '3RD', '4TH'];
const PHASE = { sudden: 'SUDDEN DEATH', storm: 'STORM' };
const OUT_SHOW = 1.2;          // s an OUT! stamp shows before the place takes over
const colour = (slot) => SLOT_COLORS[((slot % SLOT_COLORS.length) + SLOT_COLORS.length) % SLOT_COLORS.length];
const flagsOf = (f) => [(f & FLAG.frozen) && 'frozen', (f & FLAG.bigReady) && 'bigReady', (f & FLAG.sabotaged) && 'sabotaged'].filter(Boolean).join(' ');

function cardHtml(p, mine) {
  const name = mine ? 'YOU' : up(p.name || 'RAIDER');
  return `<div class="wv-card${mine ? ' me' : ''}" data-slot="${p.slot}" style="--sc:${colour(p.slot)}">`
    + `<div class="wv-hd"><i class="wv-dot"></i><span class="wv-name${mine ? '' : nameFit(name)}">${esc(name)}</span>`
    + `<span class="wv-tr">${badgeHtml(p.tr, 'sm')}<b class="num">${Math.max(0, p.tr | 0).toLocaleString('en-US')}</b></span></div>`
    + '<div class="wv-run">'
    + `<div class="wv-mid"><span class="wv-sq">${icon('squad')}<b class="wv-n num">0</b></span><span class="wv-ds num">0m</span></div>`
    + `<div class="wv-bar" aria-hidden="true">${'<i></i>'.repeat(9)}</div>`
    + '<div class="wv-sub"><span class="wv-fl"></span><span class="wv-dg">DANGER!</span><span class="wv-boss"><span>BOSS</span><i><b></b></i></span></div>'
    + '</div>'
    + '<div class="wv-out"><b class="wv-pl">OUT!</b><span class="wv-res num"></span><em class="wv-left"></em></div>'
    + '<div class="wv-lost">LOST CONNECTION</div>'
    + '<div class="wv-emo"></div></div>';
}

/** The text of an element with a space between its pieces (tests). */
function words(n) {
  const out = [], walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) { const t = walk.currentNode.textContent.trim(); if (t) out.push(t); }
  return out.join(' ').replace(/\s+/g, ' ');
}

export function mountWatchView(host, watch, { mode = 'spectator', mySlot = null } = {}) {
  const spectator = mode !== 'fallen';
  const n = watch.players.length;
  const root = document.createElement('div');
  root.className = `wv wv-${spectator ? 'spectator' : 'fallen'} wv-n${Math.max(2, Math.min(4, n))}`;
  root.innerHTML = '<div class="wv-top"><span class="wv-clock num">0:00</span><span class="wv-phase hidden"></span></div>'
    + `<div class="wv-grid">${watch.players.map((p) => cardHtml(p, !spectator && (p.me || p.slot === mySlot))).join('')}</div>`
    + '<div class="wv-table hidden"></div>'
    + '<ol class="wv-feed"></ol>';
  host.appendChild(root);
  const clockEl = root.querySelector('.wv-clock'), phaseEl = root.querySelector('.wv-phase');
  const grid = root.querySelector('.wv-grid'), table = root.querySelector('.wv-table'), feedEl = root.querySelector('.wv-feed');
  const cards = watch.players.map((p, i) => {
    const el = grid.children[i];
    const q = (s) => el.querySelector(s);
    return {
      p, el, nEl: q('.wv-n'), dEl: q('.wv-ds'), bars: [...q('.wv-bar').children], flEl: q('.wv-fl'), bossEl: q('.wv-boss b'),
      plEl: q('.wv-pl'), resEl: q('.wv-res'), leftEl: q('.wv-left'), emoEl: q('.wv-emo'),
      S: { cls: null, n: -1, d: -1, dg: -1, fl: null, boss: -1, pl: null, res: null, left: null, emo: null }, downAt: null,
    };
  });
  let acc = WATCH.stepS, age = 0, disposed = false, finalAt = null, shownTable = false;
  const V = { sec: -1, phase: null, feed: null };

  function setCard(c) {
    const p = c.p, S = c.S;
    const silent = p.alive && p.silent >= WATCH.silentS;
    const inBoss = p.alive && p.inBoss;
    if (!p.alive && c.downAt === null) c.downAt = age;
    const cls = `wv-card${c.el.classList.contains('me') ? ' me' : ''}${!p.alive ? ' down' : silent ? ' silent' : p.danger >= WATCH.danger ? ' danger' : ''}${inBoss ? ' boss' : ''}${p.place === 1 && watch.final ? ' won' : ''}`;
    if (cls !== S.cls) { S.cls = cls; c.el.className = cls; }
    // (no state of theirs yet: the match has not begun, and a 0 would look like a wiped-out squad)
    const wait = p.alive && p.seen === false;
    const nn = wait ? -2 : Math.round(p.n); // (-2: not the -1 that means "nothing written yet")
    if (nn !== S.n) { S.n = nn; c.nEl.textContent = wait ? '–' : String(nn); }
    const dd = wait ? -2 : Math.round(p.dist);
    if (dd !== S.d) { S.d = dd; c.dEl.textContent = wait ? '–' : metres(dd); }
    if (p.danger !== S.dg) { S.dg = p.danger; c.bars.forEach((b, k) => { b.className = k < p.danger ? 'on' : ''; }); }
    const fl = p.alive ? flagsOf(p.flags) : '';
    if (fl !== S.fl) { S.fl = fl; c.flEl.innerHTML = fl ? fl.split(' ').map(flagIcon).join('') : ''; }
    const boss = inBoss ? Math.round(p.boss * 100) : 0;
    if (boss !== S.boss) { S.boss = boss; c.bossEl.style.width = `${boss}%`; }
    if (!p.alive) {
      // OUT! first (the moment), then the place with the time and metres
      const pl = age - c.downAt < OUT_SHOW || !p.place ? 'OUT!' : ORD[p.place] || 'OUT!';
      if (pl !== S.pl) { S.pl = pl; c.plEl.textContent = pl; }
      const res = p.T == null ? '' : `${clockTenths(p.T)} · ${metres(p.d)}`;
      if (res !== S.res) { S.res = res; c.resEl.textContent = res; }
      const left = leftWords(p.by);
      if (left !== S.left) { S.left = left; c.leftEl.textContent = left; }
    }
    const emo = p.emote ? p.emote.a : null;
    if (emo !== S.emo) {
      S.emo = emo;
      c.emoEl.className = emo === null ? 'wv-emo' : 'wv-emo on';
      if (emo !== null) c.emoEl.innerHTML = emoteSvg(emo);
    }
  }

  const who = (slot, name) => (!spectator && slot === mySlot ? 'YOU' : up(name || 'RAIDER'));
  function setFeed() {
    const f = watch.feed, key = f.length ? `${f.length}:${f[0].id}` : '';
    if (key === V.feed) return;
    V.feed = key;
    feedEl.innerHTML = f.map((l) => {
      const what = l.k === 's' ? `<b style="color:${(sabKind(l.a) || {}).color || '#fff'}">${esc(l.what)}</b>` : `<b class="wv-fe">${esc(l.what)}</b>`;
      // the names give way (they shorten with ...), the kind of the line (FOG, GG) always shows whole
      const to = l.k === 's' ? `<span class="wv-fs"> → </span><span class="wv-fn">${esc(l.to === -1 ? 'EVERYONE' : who(l.to, l.toName))}</span>` : '';
      return `<li><i class="wv-dot" style="--sc:${colour(l.f)}"></i><span class="wv-fn">${esc(who(l.f, l.fromName))}</span>${to}<span class="wv-fs"> · </span>${what}</li>`;
    }).join('');
  }

  /** The result table (spectator): 'final' places, or (stale) what is known: the fallen by time, the rest standing. */
  function tableRows() {
    if (watch.final) return watch.final.map((r) => ({ ...r, p: watch.players.find((p) => p.slot === r.slot) })).filter((r) => r.p);
    const fallen = watch.players.filter((p) => !p.alive).sort((a, b) => (a.place || 9) - (b.place || 9));
    return [...watch.players.filter((p) => p.alive).map((p) => ({ slot: p.slot, T: null, d: null, by: null, p })), ...fallen.map((p) => ({ slot: p.slot, T: p.T, d: p.d, by: p.by, p }))];
  }
  function showTable() {
    shownTable = true;
    const rows = tableRows();
    const winners = rows.filter((r) => r.p.place === 1 && watch.final);
    const head = !watch.final ? 'THE MATCH STOPPED' : watch.draw ? 'IT IS A DRAW!' : winners.length ? `${up(winners[0].p.name)} WINS!` : 'MATCH OVER';
    table.innerHTML = `<div class="wv-win ol">${esc(head)}</div><ol class="wv-rows">${rows.map((r, i) => {
      const place = watch.final ? (watch.draw && r.p.place === 1 ? '=' : ORD[r.p.place || i + 1]) : r.T == null ? '' : ORD[r.p.place] || '';
      const tag = leftWords(r.by);
      const nums = r.T == null ? `<span class="wv-note">${watch.final ? 'LAST STANDING' : 'STILL STANDING'}</span>` : `<span class="num">${clockTenths(r.T)}</span><span class="num">${metres(r.d)}</span>`;
      return `<li class="${watch.final && r.p.place === 1 ? 'gold' : ''}" data-slot="${r.slot}" style="--sc:${colour(r.slot)}"><b class="wv-rp">${place}</b>`
        + `<span class="wv-rn"><i class="wv-dot"></i><span class="${nameFit(r.p.name).trim()}">${esc(up(r.p.name))}</span>${tag ? `<em>${tag}</em>` : ''}</span>${nums}</li>`;
    }).join('')}</ol><div class="wv-next">WAITING FOR THE NEXT MATCH<i class="on-dots"><b></b><b></b><b></b></i></div>`;
    table.classList.remove('hidden');
    root.classList.add('wv-done');
  }

  function update(dt) {
    if (disposed) return;
    const step = Math.max(0, Number(dt) || 0);
    age += step; acc += step;
    if (acc < WATCH.stepS) return;
    acc = 0;
    // before anybody's first numbers (the VS card / 3-2-1 on the players' screens): GET READY... instead of 0:00
    const pre = !watch.final && !watch.stale && !watch.players.some((p) => p.seen !== false || !p.alive);
    const sec = pre ? -2 : Math.floor(watch.t);
    if (sec !== V.sec) { V.sec = sec; clockEl.textContent = pre ? 'GET READY...' : clock(sec); }
    if (watch.phase !== V.phase) {
      V.phase = watch.phase;
      phaseEl.className = watch.phase ? `wv-phase ${watch.phase}` : 'wv-phase hidden';
      phaseEl.textContent = PHASE[watch.phase] || '';
    }
    for (let i = 0; i < cards.length; i++) setCard(cards[i]);
    setFeed();
    if (spectator && !shownTable) {
      if ((watch.final || watch.stale) && finalAt === null) finalAt = age;
      if (finalAt !== null && (watch.stale && !watch.final ? true : age - finalAt >= WATCH.doneHoldMs / 1000)) showTable();
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.remove();
  }

  update(WATCH.stepS);
  return {
    el: root, update, dispose,
    test: {
      read: () => ({
        clock: clockEl.textContent, phase: phaseEl.classList.contains('hidden') ? '' : phaseEl.textContent,
        cards: cards.map((c) => ({ slot: c.p.slot, name: c.el.querySelector('.wv-name').textContent, n: c.nEl.textContent, dist: c.dEl.textContent,
          cls: c.el.className, place: c.p.alive ? '' : c.plEl.textContent, res: c.p.alive ? '' : c.resEl.textContent,
          left: c.leftEl.textContent, danger: c.bars.filter((b) => b.className === 'on').length, emote: c.emoEl.classList.contains('on'),
          flags: c.flEl.children.length })),
        feed: [...feedEl.children].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
        table: shownTable ? [...table.querySelectorAll('.wv-rows li')].map(words) : null,
        head: shownTable ? table.querySelector('.wv-win').textContent : null,
      }),
      flush: () => { acc = WATCH.stepS; update(0); },
    },
  };
}
