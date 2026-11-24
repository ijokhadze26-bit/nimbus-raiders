// WATCH on the ONLINE page (STAGE5): the spectator's view of a friend room, and the cards component it shares with
// the result screen of a fallen player (ui/watchcards.js, re-exported here: `mountWatchView`).
//
//   createWatchView(ui, flow, page) -> a hub.js view { el, title, enter, sync, leave, update(dt), onAct, onBack }
//     shown while flow.watch.state is set (src/online/watchflow.js), or page.watchFail holds the notice of a watch
//     link that did not work for a visitor with no name yet (they have no hub to read it on)
//   joining  ONE MOMENT...                       lobby  THE MATCH STARTS WHEN EVERYONE IS READY + the seats, READY ticks
//   live / done  the cards (mode 'spectator'; the final table comes with 'final')
//   gone     THE ROOM CLOSED + BACK              always  the room code, "3 WATCHING", LEAVE (BACK = LEAVE)
// LEAVE goes back to the hub, or to the title when the page has no name yet. A spectator sends nothing.
import { el } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { mountWatchView } from './watchcards.js';
import { esc, up } from './vswords.js';

export { mountWatchView };

const DOTS = '<i class="on-dots"><b></b><b></b><b></b></i>';
const WORDS = {
  joining: ['ONE MOMENT...', 'Getting a seat in the stands.'],
  lobby: ['THE MATCH STARTS WHEN EVERYONE IS READY', 'You are watching. The cards show up when the match begins.'],
  gone: ['THE ROOM CLOSED', 'Everyone has left. Make your own room and play!'],
};

export function createWatchView(ui, flow, page) {
  const root = el('div', 'wv-page');
  root.innerHTML = `
    <div class="wv-code"><span>ROOM</span><b></b></div>
    <div class="on-card wv-pcard pop"><div class="on-h ol wv-head"></div><p class="on-p wv-line"></p><ul class="wv-seats"></ul></div>
    <div class="wv-host"></div>
    <div class="wv-count"></div>
    <button type="button" class="btn btn-blue btn-md wv-leave" data-act="leave">${icon('back')}<span>LEAVE</span></button>`;
  const codeEl = root.querySelector('.wv-code b'), card = root.querySelector('.wv-pcard'), head = root.querySelector('.wv-head');
  const line = root.querySelector('.wv-line'), seatsEl = root.querySelector('.wv-seats'), host = root.querySelector('.wv-host');
  const countEl = root.querySelector('.wv-count'), leaveLab = root.querySelector('.wv-leave span');
  let model = null, cards = null;
  const S = { key: null, seats: null, count: null };

  function mount(m) {
    if (m === model) return;
    if (cards) { cards.dispose(); cards = null; }
    model = m;
    if (m) cards = mountWatchView(host, m, { mode: 'spectator' });
  }

  function leave() {
    flow.stopWatching();
    page.watchFail = null;
    if (!flow.name) ui.nav('title');
    else page.close();
  }

  const view = {
    el: root, title: 'WATCHING',
    enter() { S.key = S.seats = S.count = null; },
    leave() { mount(null); },
    sync() {
      const st = flow.watch && flow.watch.state, fail = !st && page.watchFail;
      const phase = st ? st.phase : 'failed';
      codeEl.textContent = st ? st.code : '';
      root.querySelector('.wv-code').hidden = !st || !st.code;
      const cardsOn = phase === 'live' || phase === 'done';
      mount(cardsOn ? st.watch : null);
      card.hidden = cardsOn;
      const key = phase === 'failed' ? `f:${fail ? fail.kind : ''}` : phase;
      if (key !== S.key) {
        S.key = key;
        const w = phase === 'failed' ? [fail ? fail.title : 'NO ANSWER', fail ? fail.text : ''] : WORDS[phase] || WORDS.joining;
        head.textContent = w[0];
        head.classList.toggle('wv-small', w[0].length > 18);
        line.textContent = w[1];
        if (phase === 'joining') head.innerHTML = `ONE MOMENT${DOTS}`;
        root.classList.toggle('wv-gone', phase === 'gone' || phase === 'failed');
        leaveLab.textContent = phase === 'gone' || phase === 'failed' ? 'BACK' : 'LEAVE';
      }
      // the seats of the lobby: names with READY ticks (names are text, never HTML)
      const seats = phase === 'lobby' ? st.seats : [];
      const sk = seats.map((s) => (s ? `${s.slot}:${s.n}:${s.rdy ? 1 : 0}` : '-')).join('|');
      if (sk !== S.seats) {
        S.seats = sk;
        seatsEl.hidden = !seats.length;
        seatsEl.innerHTML = seats.map((s, i) => (s
          ? `<li style="--sc:${SLOT_COLORS[s.slot % SLOT_COLORS.length]}"><span>${esc(up(s.n || 'RAIDER'))}</span>${s.rdy ? `<b class="wv-rdy">${icon('check')}READY</b>` : '<b class="wv-wait">NOT READY</b>'}</li>`
          : `<li class="empty" style="--sc:${SLOT_COLORS[i % SLOT_COLORS.length]}"><span>EMPTY SEAT</span></li>`)).join('');
      }
      const count = st && st.count > 0 && phase !== 'gone' ? `${st.count} WATCHING` : '';
      if (count !== S.count) { S.count = count; countEl.textContent = count; }
    },
    update(dt) {
      if (!model || !cards) return;
      model.update(dt);
      cards.update(dt);
    },
    onAct(act) { if (act === 'leave') leave(); },
    onBack() { leave(); return true; },
    /** Test hook: the cards component while one shows. */
    cards: () => cards,
  };
  return view;
}
