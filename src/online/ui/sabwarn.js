// What an incoming sabotage looks and sounds like, and the small match feed (STAGE2 "Builder SABUI" points 3, 4, 7).
//   - Warning (sab:warn): big, centred under the versus bar: the kind's icon + head ("FOG!") + "FROM ANN" + a bar
//     that drains over `lands` seconds of the played clock (versus.t, the same clock the landing runs on); a flash and
//     the 'warn' sound at once. sab:land: a second flash, the kind's own sound, the card pops and goes. Up to 3 stack,
//     newest on top (the older ones shrink to one line). sab:wait (needs the road): the card goes and the feed says
//     "RED GATE COMES AFTER THE BOSS"; `again` warns afresh. A rival's out drops its waiting cards ('gone').
//   - Frozen steering: while `sab.view().frozen > 0` an icy frame round the screen + "FROZEN!" with the seconds left.
//   - Feed (top-left under the bar, clear of the power pills, 3 lines, ~3 s each): FOG SENT TO ANN, SABOTAGE CRATE! +1,
//     BIG SABOTAGE READY!, ANN IS OUT! 2 LEFT (a rival that is not the last one), ANN IS IN DANGER! (once per danger
//     episode and at most once per 10 s per rival; no sound).
// Sounds only through 'hazard:sfx', flashes through fx.screen. SABGAME emits the sab:* events; nothing here touches
// the simulation. Everything is cleared on my fall, on any state other than playing and on every new run.
import { sabIcon, sabKind, fromWords, sentWords, outWords, dangerWords, waitWords, CRATE_WORDS, FULL_WORDS, BIG_WORDS, SAB_COLOR, BIG_COLOR } from './sabwords.js';
import { sabOf } from './sabbtn.js';
import { esc } from './vswords.js';

const MAX_WARN = 3;
const HIT_S = 0.45;        // the landed card pops, then goes
const SPARE_S = 1.5;       // a card that never landed (dropped quietly) goes this long after its landing time
const FEED_S = 3;
const FEED_MAX = 3;
const DANGER = 5, DANGER_GAP = 10, READ_S = 0.125;
const BAR_Q = 20;          // drain bar steps

const div = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function mountSabWarn(ctx) {
  const { game, ui } = ctx;
  const root = ui.hud.root, ev = game.events;
  const warnsEl = div('sab-warns');
  const feedEl = div('sab-feed');
  const iceEl = div('sab-ice hidden', '<div class="si-txt"><b>FROZEN!</b><span class="si-n num"></span></div>');
  root.appendChild(iceEl); root.appendChild(feedEl); root.appendChild(warnsEl); // (feed first: sab.css moves the warnings under it in an arena)
  const iceN = iceEl.querySelector('.si-n');

  let on = false, clock = 0, readT = 0;
  let warns = [];      // { id, code, from, el, barEl, t0, lands, hitAt, bar }
  let feed = [];       // { el, until }
  const danger = new Map(); // slot -> { hot, at }
  const S = { ice: false, iceN: '' };

  const vs = () => game.versus;
  const played = () => { const v = vs(); return v && Number.isFinite(v.t) ? v.t : clock; };
  const sfx = (name, opts = null) => ev.emit('hazard:sfx', { sfx: name, opts }, true); // (past the bus's 14/s limit: rare, must sound)
  const flash = (color, a, decay) => { const s = game.fx && game.fx.screen; if (s) s.flash(color, a, decay); };
  const live = () => on && !!(game.run && game.run.mode === 'versus' && game.state === 'playing');

  // ---------------- warnings ----------------
  function dropWarn(w) {
    const i = warns.indexOf(w);
    if (i >= 0) warns.splice(i, 1);
    w.el.remove();
    restack();
  }
  /** Newest on top at full size; the older ones one line each. */
  function restack() {
    for (let i = 0; i < warns.length; i++) {
      const w = warns[i], small = i < warns.length - 1;
      if (w.small !== small) { w.small = small; w.el.classList.toggle('small', small); }
    }
  }

  function warn(p) {
    if (!live() || !p) return;
    const k = sabKind(p.code);
    if (!k) return;
    const old = warns.find((w) => w.id === p.id);
    if (old) dropWarn(old);
    while (warns.length >= MAX_WARN) dropWarn(warns[0]);
    const big = !!(p.big || k.big);
    const el = div(`sab-warn${big ? ' big' : ''}`, `<span class="sw-ico">${sabIcon(p.code)}</span>`
      + `<span class="sw-t"><b class="sw-head${k.head.length > 9 ? ' long' : ''}">${esc(k.head)}</b><small class="sw-from">${esc(fromWords(p.name))}</small></span>`
      + '<i class="sw-bar"><u></u></i>');
    el.style.setProperty('--kc', k.color);
    el.dataset.code = String(p.code);
    const w = { id: p.id, code: p.code, from: p.from, el, barEl: el.querySelector('.sw-bar u'), t0: played(), lands: Math.max(0.05, p.lands || 1), hitAt: 0, bar: 1, small: null };
    warns.push(w);
    warnsEl.prepend(el); // (newest on top)
    restack();
    flash(k.color, 0.3, 2.5);
    sfx('warn', { duration: 0.6 });
  }

  function land(p) {
    if (!live() || !p) return;
    const k = sabKind(p.code);
    const w = warns.find((x) => x.id === p.id);
    if (w && !w.hitAt) { w.hitAt = clock || 1e-6; w.bar = 0; w.barEl.style.transform = 'scaleX(0)'; w.el.classList.add('hit'); }
    if (!k) return;
    flash(k.color, k.big ? 0.5 : 0.38, 2.2);
    sfx(k.sfx);
  }

  function hold(p) {
    if (!live() || !p) return;
    const w = warns.find((x) => x.id === p.id);
    if (w) dropWarn(w);
    line(waitWords(p.code), (sabKind(p.code) || {}).color);
  }

  function clearWarns() { for (const w of warns) w.el.remove(); warns = []; }

  // ---------------- feed ----------------
  function line(text, color = SAB_COLOR) {
    if (!live()) return;
    while (feed.length >= FEED_MAX) { const f = feed.shift(); f.el.remove(); }
    const el = div('sf-line', esc(text));
    el.style.setProperty('--fc', color || SAB_COLOR);
    feedEl.appendChild(el);
    feed.push({ el, until: clock + FEED_S });
  }
  function clearFeed() { for (const f of feed) f.el.remove(); feed = []; }

  // ---------------- events ----------------
  ev.on('sab:warn', warn);
  ev.on('sab:land', land);
  ev.on('sab:wait', hold);
  ev.on('sab:sent', (p) => {
    if (!live() || !p) return;
    const k = sabKind(p.code);
    line(sentWords(p.code, p.names), k ? k.color : SAB_COLOR);
    sfx('tierUp');
  });
  ev.on('sab:charge', (p) => {
    if (!live() || !p) return;
    if (p.source === 'boss') { if (!p.lost) { line(BIG_WORDS, BIG_COLOR); sfx('powerUp'); } return; }
    if (p.source === 'crate') line(p.lost ? FULL_WORDS : CRATE_WORDS, SAB_COLOR);
    if (!p.lost) sfx('comboUp');
  });
  ev.on('sab:drop', (p) => {
    if (!p || p.why !== 'gone') return;
    for (const w of warns.slice()) if (w.from === p.from && !w.hitAt) dropWarn(w);
  });
  ev.on('versus:peerdown', (p) => {
    const v = vs();
    if (!live() || !v || !p) return;
    for (const w of warns.slice()) if (w.from === p.slot && !w.hitAt) dropWarn(w); // its sabotages no longer come
    const peers = v.view().peers;
    let alive = 0;
    for (const q of peers) if (q.alive) alive++;
    if (!alive) return; // the last one: the big moment (vsmoment.js) says it
    line(outWords(p.name, alive + (v.fallen ? 0 : 1)), '#ff8f8f');
  });

  function reset() {
    clearWarns(); clearFeed();
    danger.clear();
    if (S.ice) { S.ice = false; iceEl.classList.add('hidden'); }
    S.iceN = ''; iceN.textContent = '';
  }
  ev.on('versus:start', () => { reset(); on = true; clock = 0; readT = 0; });
  ev.on('run:start', (p) => { if (p.mode !== 'versus') { reset(); on = false; } });
  ev.on('run:lose', (p) => { if (p && p.mode === 'versus') { clearWarns(); if (S.ice) { S.ice = false; iceEl.classList.add('hidden'); } } });
  ev.on('game:state', ({ state }) => { if (state !== 'playing' && state !== 'paused') { reset(); on = false; } });

  // ---------------- per frame ----------------
  function update(dt) {
    if (!on) return;
    clock += dt || 0;
    const t = played();
    for (const w of warns.slice()) {
      if (w.hitAt) { if (clock - w.hitAt >= HIT_S) dropWarn(w); continue; }
      const left = w.lands - (t - w.t0);
      if (left < -SPARE_S) { dropWarn(w); continue; }
      const f = Math.round(Math.max(0, Math.min(1, left / w.lands)) * BAR_Q) / BAR_Q;
      if (f !== w.bar) { w.bar = f; w.barEl.style.transform = `scaleX(${f})`; }
    }
    while (feed.length && feed[0].until <= clock) { const f = feed.shift(); f.el.remove(); }

    const s = sabOf(game);
    const sv = s && live() ? s.view() : null;
    const fr = sv && sv.frozen > 0 ? sv.frozen : 0;
    const ice = fr > 0;
    if (ice !== S.ice) { S.ice = ice; iceEl.classList.toggle('hidden', !ice); }
    const n = ice ? String(Math.ceil(fr)) : '';
    if (n !== S.iceN) { S.iceN = n; iceN.textContent = n; }

    readT += dt || 0;
    if (readT < READ_S) return;
    readT = 0;
    const v = vs();
    if (!v || !v.live || !live()) return;
    const view = v.view();
    if (!view.go || v.fallen) return;
    for (const p of view.peers) {
      const hot = p.alive && p.countdown == null && (p.danger | 0) >= DANGER;
      let d = danger.get(p.slot);
      if (!d) { d = { hot: false, at: -Infinity }; danger.set(p.slot, d); }
      if (hot && !d.hot && clock - d.at >= DANGER_GAP) { d.at = clock; line(dangerWords(p.name), '#ff5a6a'); }
      d.hot = hot;
    }
  }

  return { update, warnsEl, feedEl, iceEl, get warns() { return warns.map((w) => ({ id: w.id, code: w.code, small: !!w.small, bar: w.bar, hit: !!w.hitAt })); }, get feed() { return feed.map((f) => f.el.textContent); } };
}
