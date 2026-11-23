// Emotes in an online match (STAGE4 "Emotes", SPEC4 §9): four preset pictures, never free text.
//   - A round 48 px button above the SABOTAGE button (same side; it moves with left-handed play) opens a fan:
//     thumbs up (a 0), laugh (1), cry (2), GG (3), and MUTE / UNMUTE. Key E on desktop opens it too.
//     Pointerdown + data-ui like sabbtn.js, so a tap never steers the squad.
//   - Send: link.sendEvent({ k: 'e', a, to: -1 }) (the sabotage event path; sabotage.js and bot.js ignore k 'e'); at
//     most one per 2 s and 20 per match, a refused tap shakes the button. My emote pops above the button for 2.2 s.
//   - Received (link 'event', k 'e', a an integer 0..3, anything else ignored; per sender at most one per 1 s and 20 per
//     match): a bubble under that rival's row of the versus bar (hudvs `.vs-r[data-slot]`), or over its row of the
//     result list (`.vsr-places li[data-slot]`), with the 'pop' sound. Muted: nothing shows. Mute is kept in
//     localStorage (nimbusRaiders.online.mute).
//   - A rival of the bot link (peer.bot): after one of my emotes a 35 % chance of a reply 1.0-2.5 s later, a 50 % chance
//     of a GG 1.5-3 s after the verdict, at most 3 a match. Played here on my own page (cosmetic, Math.random is fine).
// The same dock shows on the 'vsresult' screen while the match's link lives (GG after a match). Timers run on the
// update(dt) clock (ui.update calls it on every frame, the result screen too). DOM writes only on change.
import './boards.css';

export const EMOTE = { kinds: ['thumbs', 'laugh', 'cry', 'gg'], cooldownMs: 2000, perMatch: 20, showMs: 2200,
  recvGapMs: 1000, recvPerMatch: 20, bot: { chance: 0.35, delay: [1.0, 2.5], gg: 0.5, ggDelay: [1.5, 3.0], max: 3 } };
const MUTE_KEY = 'nimbusRaiders.online.mute';
const NAMES = ['THUMBS UP', 'HA HA', 'BOO HOO', 'GG'];
const BOT_REPLY = [0, 1, 3];
const FAN_IDLE = 5;          // s: an open fan closes by itself

const FACE = '<circle cx="24" cy="24" r="20" fill="#ffd34d" stroke="#8a5a00" stroke-width="3"/>';
const SVGS = [
  // thumbs up: a fist with the thumb raised
  '<svg viewBox="0 0 48 48" class="emo-svg" aria-hidden="true"><path d="M14 22h7l4-11c1-3 6-3 6 1v7h8c3 0 5 3 4 6l-3 12c-1 2-2 3-4 3H14z" fill="#ffd34d" stroke="#8a5a00" stroke-width="3" stroke-linejoin="round"/><rect x="6" y="21" width="9" height="20" rx="2" fill="#2f8cff" stroke="#143f9a" stroke-width="3"/></svg>',
  // laugh: closed happy eyes, a wide open mouth
  `<svg viewBox="0 0 48 48" class="emo-svg" aria-hidden="true">${FACE}<path d="M13 19q4-5 8 0M27 19q4-5 8 0" fill="none" stroke="#5a3200" stroke-width="3" stroke-linecap="round"/><path d="M13 26h22q-2 11-11 11t-11-11z" fill="#c8102e" stroke="#5a3200" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  // cry: sad brows, a tear, a down-turned mouth
  `<svg viewBox="0 0 48 48" class="emo-svg" aria-hidden="true">${FACE}<path d="M13 17l7 3M35 17l-7 3" stroke="#5a3200" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="24" r="2.6" fill="#5a3200"/><circle cx="31" cy="24" r="2.6" fill="#5a3200"/><path d="M16 36q8-7 16 0" fill="none" stroke="#5a3200" stroke-width="3" stroke-linecap="round"/><path d="M33 27q3 5 0 8q-3-3 0-8z" fill="#4dc3ff" stroke="#1b5a8a" stroke-width="1.5"/></svg>`,
  // GG: the two letters on a green badge (drawn, no font needed)
  '<svg viewBox="0 0 48 48" class="emo-svg" aria-hidden="true"><rect x="3" y="9" width="42" height="30" rx="10" fill="#2fbf4f" stroke="#17702d" stroke-width="3"/><path d="M20 18h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h6v-6h-4M37 18h-6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h6v-6h-4" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
];
const MUTE_SVG = (on) => `<svg viewBox="0 0 48 48" class="emo-svg" aria-hidden="true"><path d="M8 10h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-9 8v-8H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="#fff" stroke="#143f9a" stroke-width="3" stroke-linejoin="round"/>${on ? '<path d="M8 6l34 36" stroke="#ff3b4e" stroke-width="5" stroke-linecap="round"/>' : '<circle cx="15" cy="22" r="3" fill="#143f9a"/><circle cx="24" cy="22" r="3" fill="#143f9a"/><circle cx="33" cy="22" r="3" fill="#143f9a"/>'}</svg>`;

/** The picture of emote `a` (0..3) as inline SVG. */
export const emoteSvg = (a) => SVGS[a] || '';

const readMute = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };
const writeMute = (on) => { try { if (on) localStorage.setItem(MUTE_KEY, '1'); else localStorage.removeItem(MUTE_KEY); } catch { /* storage blocked */ } };
const isEmote = (a) => typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 3;
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

export function mountEmotes(ctx) {
  const { game, ui } = ctx;
  const ev = game.events;
  const layer = document.createElement('div');   // the bubbles (outside the HUD: the result screen shows them too)
  layer.className = 'emo-layer';
  const dock = document.createElement('div');
  dock.className = 'emo-dock';
  dock.setAttribute('data-ui', '');
  dock.style.display = 'none';
  dock.innerHTML = `<button type="button" class="emo-btn" data-ui aria-label="Emotes (E)" title="Emotes (E)">${SVGS[0]}</button>`
    + `<div class="emo-fan" role="menu">${SVGS.map((s, a) => `<button type="button" class="emo-pick" data-ui data-emo="${a}" aria-label="${NAMES[a]}">${s}</button>`).join('')}`
    + '<button type="button" class="emo-mute" data-ui aria-label="Mute emotes"></button></div>';
  const btn = dock.querySelector('.emo-btn'), fan = dock.querySelector('.emo-fan'), muteBtn = dock.querySelector('.emo-mute');
  ui.root.appendChild(layer);
  ui.root.appendChild(dock);

  let T = 0, link = null, offLink = null, open = false, openAt = 0;
  let lastSend = -1e9, sent = 0, botN = 0, queue = [], bubbles = [];
  let recv = new Map();
  let muted = readMute();
  const S = { show: null, where: '', right: null, open: null, muted: null };
  const test = { sent: [], shown: [], refused: 0, get muted() { return muted; }, get open() { return open; }, get T() { return T; } };

  const sfx = (name) => ev.emit('hazard:sfx', { sfx: name, opts: null }, true);
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const bot = () => { const ps = link && link.peers; return ps ? ps.find((p) => p && p.bot) || null : null; };
  const onResult = () => ui.current === 'vsresult' && game.state === 'result';
  const inMatch = () => !!(game.run && game.run.mode === 'versus' && (game.state === 'playing' || game.state === 'paused') && game.versus && game.versus.live);
  const visible = () => !!link && game.versus && game.versus.link === link && ui.top() !== 'confirm' && (inMatch() || onResult());

  // ---------------- the link of the current match ----------------
  function attach() {
    detach();
    link = (game.versus && game.versus.link) || null;
    T = 0; lastSend = -1e9; sent = 0; botN = 0; queue = []; recv = new Map();
    setOpen(false);
    if (link && typeof link.on === 'function') offLink = link.on('event', onEvent);
  }
  function detach() {
    if (typeof offLink === 'function') offLink();
    offLink = null; link = null; queue = [];
  }

  function onEvent(e) {
    if (!e || e.k !== 'e' || !isEmote(e.a) || !Number.isInteger(e.f)) return;
    const r = recv.get(e.f) || { at: -1e9, n: 0 };
    if (T - r.at < EMOTE.recvGapMs / 1000 || r.n >= EMOTE.recvPerMatch) return;
    r.at = T; r.n++;
    recv.set(e.f, r);
    showRival(e.f, e.a);
  }

  // ---------------- bubbles ----------------
  function place(target, a, mine) {
    const base = ui.root.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = `emo-bub${mine ? ' mine' : ''}`;
    b.innerHTML = SVGS[a];
    let x = 0, y = 0;
    if (target) {
      const r = target.getBoundingClientRect();
      if (target.matches('li')) { b.classList.add('side'); x = r.right - base.left - 30; y = r.top - base.top + r.height / 2; } // over its result row
      else if (mine) { b.classList.add('up'); x = r.left - base.left + r.width / 2; y = r.top - base.top - 6; }
      else { b.classList.add('down'); x = r.left - base.left + r.width / 2; y = r.bottom - base.top + 6; }
    }
    x = Math.max(34, Math.min(base.width - 34, x));
    b.style.left = `${Math.round(x)}px`;
    b.style.top = `${Math.round(y)}px`;
    layer.appendChild(b);
    bubbles.push({ el: b, mine: !!mine, end: T + EMOTE.showMs / 1000 });
    return b;
  }
  function showRival(slot, a) {
    if (muted) return;
    const res = onResult();
    const target = res ? ui.root.querySelector(`.screen-vsresult .vsr-places li[data-slot="${slot}"]`)
      : ui.hud.el.querySelector(`.vs-rivals .vs-r[data-slot="${slot}"]`) || ui.hud.el.querySelector('.vs-rivals .vs-r');
    if (!target || !target.getClientRects().length) return;
    place(target, a, false);
    test.shown.push({ slot, a, where: res ? 'result' : 'bar', T });
    sfx('pop');
  }
  function showMine(a) {
    const target = onResult() ? ui.root.querySelector('.screen-vsresult .vsr-places li.me') || btn : btn;
    place(target, a, true);
  }

  // ---------------- sending ----------------
  function send(a) {
    if (!isEmote(a) || !visible()) return false;
    if (T - lastSend < EMOTE.cooldownMs / 1000 || sent >= EMOTE.perMatch) {
      test.refused++;
      replay(btn, 'deny'); sfx('deny');
      return false;
    }
    lastSend = T; sent++;
    try { link.sendEvent({ k: 'e', a, to: -1 }); } catch (e) { console.warn('[online] emote failed', e); }
    test.sent.push({ a, T });
    showMine(a);
    setOpen(false);
    ui.vibrate?.(12);
    const b = bot();
    if (b && botN < EMOTE.bot.max && Math.random() < EMOTE.bot.chance) {
      botN++;
      queue.push({ at: T + rnd(...EMOTE.bot.delay), slot: b.slot, a: BOT_REPLY[Math.floor(Math.random() * BOT_REPLY.length)] });
    }
    return true;
  }
  ev.on('versus:end', () => {
    const b = bot();
    if (!b || botN >= EMOTE.bot.max || Math.random() >= EMOTE.bot.gg) return;
    botN++;
    queue.push({ at: T + rnd(...EMOTE.bot.ggDelay), slot: b.slot, a: 3 });
  });

  function setOpen(on) {
    open = !!on;
    if (open) openAt = T;
  }
  function setMute(on) {
    muted = !!on;
    writeMute(muted);
    if (muted) for (const b of bubbles.splice(0)) if (!b.mine) b.el.remove();
  }

  // ---------------- input (pointerdown: works while another finger steers; the click after it is swallowed) ----------------
  let swallow = false;
  function act(e) {
    const t = e.target.closest && e.target.closest('button');
    if (!t) return;
    if (t === btn) setOpen(!open);
    else if (t === muteBtn) setMute(!muted);
    else if (t.dataset.emo != null) send(Number(t.dataset.emo));
    sync();
  }
  dock.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); swallow = true; act(e); });
  dock.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (!swallow) act(e); swallow = false; });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'e' && e.key !== 'E')) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || !visible()) return;
    e.preventDefault();
    setOpen(!open);
    sync();
  });

  ev.on('versus:start', attach);
  ev.on('run:start', (p) => { if (p.mode !== 'versus') detach(); });

  // ---------------- per frame ----------------
  function sync() {
    const show = visible();
    if (show !== S.show) { S.show = show; dock.style.display = show ? '' : 'none'; if (!show) setOpen(false); }
    if (!show) return;
    const where = onResult() ? 'result' : 'match';
    const right = where === 'match' && ui.hud.el.classList.contains('left-hand');
    if (where !== S.where || right !== S.right) { S.where = where; S.right = right; dock.className = `emo-dock ${where}${right ? ' right' : ''}`; S.open = null; S.muted = null; }
    if (open !== S.open) { S.open = open; dock.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
    if (muted !== S.muted) {
      S.muted = muted;
      muteBtn.innerHTML = MUTE_SVG(muted) + `<span>${muted ? 'UNMUTE' : 'MUTE'}</span>`;
      muteBtn.setAttribute('aria-label', muted ? 'Unmute emotes' : 'Mute emotes');
      dock.classList.toggle('muted', muted);
    }
  }

  function update(dt) {
    T += Math.max(0, Math.min(0.25, dt || 0));
    if (link && game.versus && game.versus.link !== link && !game.versus.live) detach(); // the match was left
    if (open && T - openAt > FAN_IDLE) setOpen(false);
    if (queue.length) {
      const due = queue.filter((q) => q.at <= T);
      if (due.length) { queue = queue.filter((q) => q.at > T); for (const q of due) showRival(q.slot, q.a); }
    }
    if (bubbles.length) bubbles = bubbles.filter((b) => { if (b.end > T) return true; b.el.remove(); return false; });
    sync();
  }

  return { el: dock, layer, update, send, test, setMute, get open() { return open; } };
}
