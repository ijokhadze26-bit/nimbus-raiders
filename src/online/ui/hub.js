// The ONLINE page (one game state, 'online'; the views live inside it) and its first view, the hub.
//   gate   ONLINE IS PAUSED / UPDATE NEEDED - REFRESH THE PAGE (the owner's switches, SPEC4 §11)
//   name   pick a player name on the first visit, CHANGE later                         (ui/name.js)
//   hub    QUICK MATCH, CREATE ROOM, JOIN WITH CODE, my name with CHANGE, BACK         (this file)
//   quick  FINDING A RIVAL... / RIVAL FOUND! while flow.mode is 'quick'               (ui/finding.js)
//   lobby  room code + share link, both seats with their picks, READY, LEAVE          (ui/lobby.js)
// Which view shows follows the FLOW (src/online/flow.js): every 'change' re-checks it. A view is
// { el, title, enter(), sync(), leave(), onAct(act, btn), onBack() }: `el` is built once, sync() only touches what
// changed (a text box must never be rebuilt while someone is typing in it).
// Opened with ui.nav('online', { room }) - `room` is the code from a friend's link: joined as soon as I have a name.
import { screenEl, el, bump } from '../../ui/ui.js';
import { icon } from '../../ui/icons.js';
import { createNameView, onEnter } from './name.js';
import { createLobbyView } from './lobby.js';
import { createFindingView } from './finding.js';

const GATES = {
  paused: ['ONLINE IS PAUSED', 'Online play is taking a short break. Please come back a little later!'],
  update: ['UPDATE NEEDED', 'REFRESH THE PAGE to get the newest version of the game, then come back.'],
  banned: ['ONLINE IS CLOSED', 'This player is not allowed to play online.'],
};
const BUSY = { create: 'MAKING YOUR ROOM...', join: 'JOINING THE ROOM...' };
const CODE_CHARS = /[^A-Za-z]/g;

function createGateView(ui, flow) {
  const root = el('div', 'on-card on-gate pop', '<div class="on-h ol"></div><p class="on-p"></p><button type="button" class="btn btn-blue btn-md" data-act="back">BACK</button>');
  return {
    el: root, title: 'ONLINE',
    sync() {
      const g = GATES[flow.gate] || GATES.paused;
      root.querySelector('.on-h').textContent = g[0];
      root.querySelector('.on-p').textContent = g[1];
    },
  };
}

function createHubView(ui, flow, page) {
  const root = el('div', 'on-hub');
  root.innerHTML = `
    <div class="on-card on-quickcard pop">
      <div class="on-h ol">QUICK MATCH</div>
      <p class="on-p">Play a rival from anywhere. Last squad standing wins!</p>
      <button type="button" class="btn btn-gold btn-lg on-quick" data-act="quick">${icon('globe')}<span>QUICK MATCH</span></button>
    </div>
    <div class="on-card pop">
      <div class="on-h ol">PLAY A FRIEND</div>
      <p class="on-p">Make a room and send the code to a friend. Last squad standing wins!</p>
      <button type="button" class="btn btn-green btn-lg on-create" data-act="create">CREATE ROOM</button>
      <div class="on-or"><span>OR TYPE A FRIEND'S CODE</span></div>
      <div class="on-join">
        <input type="text" class="on-input on-code" maxlength="4" placeholder="CODE" aria-label="Room code" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go">
        <button type="button" class="btn btn-green btn-md" data-act="join">JOIN</button>
      </div>
      <div class="on-msg" role="status" aria-live="polite"></div>
    </div>
    <div class="on-me">
      <div class="on-me-t"><span>YOUR NAME</span><b class="on-me-n"></b></div>
      <button type="button" class="btn btn-blue btn-sm" data-act="rename">CHANGE</button>
    </div>
    <ol class="on-how">
      <li>QUICK MATCH finds you a rival in seconds.</li>
      <li>Pick your hero and weapon. Both tap READY.</li>
      <li>Same road for both. The last squad standing wins!</li>
    </ol>`;
  const code = root.querySelector('.on-code'), msg = root.querySelector('.on-msg'), nameEl = root.querySelector('.on-me-n');
  const buttons = [...root.querySelectorAll('button')];
  let local = ''; // a hint of my own ("type 4 letters") shown until the next action
  code.addEventListener('input', () => { code.value = code.value.replace(CODE_CHARS, '').toUpperCase().slice(0, 4); if (local) { local = ''; view.sync(); } });
  const join = () => {
    const c = code.value.trim().toUpperCase();
    if (c.length !== 4) { local = 'Type the 4 letters of the room code.'; flow.clearNotice(); view.sync(); bump(code); ui.vibrate(30); return; }
    local = '';
    flow.joinRoom(c);
  };
  onEnter(code, join);
  // QUICK MATCH sits above, so the code box starts in the lower half, where a phone keyboard opens: on focus it is
  // scrolled up to the top third (room is added below the hub for that, and stays until the hub is left: no jump)
  code.addEventListener('focus', () => {
    const body = root.parentElement;
    if (!body) return;
    body.classList.add('on-typing');
    const top = code.getBoundingClientRect().top, want = innerHeight * 0.28;
    if (top > want) body.scrollTop += top - want;
  });
  const view = {
    el: root, title: 'ONLINE',
    enter() { local = ''; if (!flow.notice) code.value = ''; }, // (the code of a room I just left is not offered again)
    leave() { if (root.parentElement) root.parentElement.classList.remove('on-typing'); },
    sync() {
      nameEl.textContent = flow.name;
      const away = flow.net !== 'on'; // my connection dropped: nothing can be asked of the service right now
      for (const b of buttons) b.classList.toggle('is-disabled', !!flow.busy || away);
      const n = flow.notice;
      msg.classList.toggle('bad', !flow.busy && !away && (!!n || !!local));
      if (flow.busy) msg.textContent = BUSY[flow.busy] || 'ONE MOMENT...';
      else if (away) msg.textContent = 'RECONNECTING... one moment.';
      else if (n) msg.innerHTML = `<b>${n.title}</b><span>${n.text}</span>`; // (fixed sentences from flow.js, never player text)
      else msg.textContent = local;
    },
    onAct(act) {
      if (act === 'quick') { local = ''; flow.clearNotice(); flow.quickMatch(); }
      else if (act === 'create') { local = ''; flow.createRoom(); }
      else if (act === 'join') join();
      else if (act === 'rename') { flow.clearNotice(); page.rename(); }
    },
    /** Test hook / deep link: put a code in the box. */
    setCode(c) { code.value = String(c || '').replace(CODE_CHARS, '').toUpperCase().slice(0, 4); },
  };
  return view;
}

export function createOnlineScreen(ui, flow) {
  const root = screenEl('online');
  root.innerHTML = `
    <div class="on-bg"></div>
    <div class="topbar">
      <button type="button" class="ibtn ibtn-blue" data-act="back" aria-label="Back">${icon('back')}</button>
      <div class="plaque plaque-purple">${icon('globe')}<span class="on-title">ONLINE</span></div>
      <div class="on-net" role="status"><span>RECONNECTING</span></div>
    </div>
    <div class="on-scroll on-body"></div>`;
  const body = root.querySelector('.on-body'), title = root.querySelector('.on-title'), net = root.querySelector('.on-net');
  let cur = null, shown = false, off = null, naming = false, joinCode = null;

  const page = {
    /** Hub -> the name view to change my name. */
    rename() { naming = true; refresh(); },
    named() { naming = false; refresh(); },
  };
  const views = { gate: createGateView(ui, flow), name: createNameView(ui, flow, page), hub: null, lobby: createLobbyView(ui, flow, page), quick: createFindingView(ui, flow) };
  views.hub = createHubView(ui, flow, page);

  const want = () => (flow.gate ? 'gate' : !flow.name || naming ? 'name' : flow.mode === 'quick' && !flow.link ? 'quick' : flow.room ? 'lobby' : 'hub');

  function refresh() {
    if (!shown) return;
    const name = want();
    if (name !== cur) {
      if (cur) views[cur].leave?.();
      cur = name;
      body.replaceChildren(views[name].el);
      body.scrollTop = 0;
      views[name].enter?.();
      bump(views[name].el, 'on-in');
    }
    const v = views[cur];
    title.textContent = v.title || 'ONLINE';
    root.dataset.view = cur;
    v.sync?.();
    net.classList.toggle('show', flow.net !== 'on');
    // a friend's link: join that room as soon as I have a name (and nothing else is in the way)
    if (cur === 'hub' && joinCode && !flow.busy) { const c = joinCode; joinCode = null; views.hub.setCode(c); flow.joinRoom(c); }
  }

  return {
    el: root,
    show(opts) {
      shown = true;
      if (opts && opts.room) joinCode = opts.room;
      if (!off) off = flow.on('change', refresh);
      naming = false;
      refresh();
    },
    hide() {
      shown = false;
      if (off) { off(); off = null; }
      if (cur) views[cur].leave?.();
      cur = null; joinCode = null;
    },
    onAct(act, btn) {
      if (act === 'back') { this.onBack(); return; }
      if (cur) views[cur].onAct?.(act, btn);
    },
    onBack() {
      if (cur && views[cur].onBack?.()) return;            // the view dealt with it (a picker closed, a rename cancelled)
      if (cur === 'lobby') flow.leave('online');             // out of the room, back to the hub
      else ui.nav('title');
    },
    /** Test hooks. */
    view: () => cur,
    views,
  };
}
