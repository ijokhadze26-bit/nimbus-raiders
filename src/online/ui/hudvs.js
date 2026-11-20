// The versus bar: what the HUD shows during an online match (SPEC4 §3.2 "hudvs", STAGE1b "Builder MATCHUI").
// It rewrites hud.levelEl the way ui/hudmodes.js does for Boss Rush (so "LV 0 ONLINE" never shows) and adds three
// pieces of its own:
//   - top bar, left of centre: the match time and the phase tag (SUDDEN DEATH from 3:00, STORM from 4:30);
//   - top bar, right (where the coin pill sits in single-player: a match pays no coins): one row per rival with the
//     seat colour of its ghost, its name, its squad size and how far ahead (▲12m) / behind (▼8m) me it is; the row
//     pulses red with DANGER! while the rival is close to losing and reads DOWN once it fell;
//   - chips under the bar: "RIVAL LOST CONNECTION · WIN IN n" (the link's countdown), "RECONNECTING" (my own
//     connection), "WAITING FOR THE RESULT" (I fell and the verdict is not in yet).
// My own danger shows as a red frame around the screen and a red squad bubble.
// The one-off SUDDEN DEATH / STORM / RIVAL DOWN lines stay with versus.js (hazard:hint): the tag here is the state.
// DOM writes only when a value changes, and the numbers are read 8 times a second, not every frame.
import { icon } from '../../ui/icons.js';
import { SLOT_COLORS } from '../game/vsdata.js';
import { clock, esc, up } from './vswords.js';

const STEP = 0.125;        // s between reads of versus.view()
const DANGER = 5;          // danger 0..9 from this value on pulses
const WAIT_AFTER = 1.5;    // s after my fall before "WAITING FOR THE RESULT" shows
const PHASE = { sudden: 'SUDDEN DEATH', storm: 'STORM' };

const div = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function mountVsHud(ctx) {
  const { game, ui } = ctx;
  const hud = ui.hud, ev = game.events;
  const top = hud.el.querySelector('.hud-top');
  const pauseBtn = hud.el.querySelector('.hud-pause');
  const rivalsEl = div('vs-rivals');
  top.appendChild(rivalsEl);
  const chipsEl = div('vs-chips hidden', '<div class="vs-chip c-dc hidden"></div><div class="vs-chip c-net hidden">RECONNECTING...</div><div class="vs-chip c-wait hidden">WAITING FOR THE RESULT...</div>');
  hud.root.appendChild(chipsEl);
  const [dcEl, netEl, waitEl] = chipsEl.children;
  const edge = div('vs-edge'); // red frame while my own squad is in danger
  hud.root.appendChild(edge);

  let on = false, acc = 0, last = 0, clockEl = null, phaseEl = null, rows = [];
  const S = { sec: -1, phase: '', me: false, dc: '', net: false, wait: false, chips: false };

  function build(peers) {
    on = true; acc = STEP; last = 0;
    hud.el.classList.add('vs');
    hud.levelEl.innerHTML = '<span class="vs-clock lv num">0:00</span><span class="vs-phase hidden"></span>';
    clockEl = hud.levelEl.firstChild; phaseEl = hud.levelEl.lastChild;
    hud.distEl = null;
    pauseBtn.innerHTML = icon('close');
    pauseBtn.setAttribute('aria-label', 'Leave match');
    const n = Math.max(1, Math.min(3, peers.length));
    hud.el.classList.toggle('vs-tall', n === 3); // three rows stand taller than the bar: the combo meter moves down
    hud.el.classList.toggle('vs-many', n > 1);   // two or three rows are wider: the phase tag gets the progress bar's line
    hud.el.classList.remove('vs-ph');
    rivalsEl.className = `vs-rivals n${n}`;
    rivalsEl.innerHTML = peers.slice(0, 3).map((p) => `<div class="vs-r" style="--sc:${SLOT_COLORS[p.slot % SLOT_COLORS.length]}">`
      + `<span class="vs-n"><i class="vs-dot"></i><span class="vs-name">${esc(up(p.name))}</span></span>`
      + `<span class="vs-v">${n === 1 ? icon('squad') : ''}<b class="vs-cnt num">0</b><span class="vs-d"></span></span></div>`).join('');
    rows = [...rivalsEl.children].map((el, i) => ({ el, slot: peers[i].slot, cntEl: el.querySelector('.vs-cnt'), dEl: el.querySelector('.vs-d'), state: '', n: 0, d: '' }));
    for (const r of rows) setRow(r, 'pre', one(n) ? 'GET READY' : '');
    Object.assign(S, { sec: 0, phase: '', me: false, dc: '', net: false, wait: false, chips: false });
    setMe(false);
    dcEl.classList.add('hidden'); netEl.classList.add('hidden'); waitEl.classList.add('hidden');
    chipsEl.classList.add('hidden');
  }

  function clear() {
    if (!on) return;
    on = false; rows = []; clockEl = phaseEl = null;
    hud.el.classList.remove('vs', 'vs-tall', 'vs-many', 'vs-ph');
    pauseBtn.innerHTML = icon('pause');
    pauseBtn.setAttribute('aria-label', 'Pause');
    rivalsEl.innerHTML = '';
    setMe(false);
    chipsEl.classList.add('hidden'); S.chips = false;
  }

  function setMe(flag) {
    S.me = flag;
    hud.el.classList.toggle('vs-me-danger', flag);
    edge.classList.toggle('on', flag);
    hud.bubble.classList.toggle('vs-danger', flag);
  }

  const one = (n) => n === 1;

  /** What the small text of a rival row says. */
  function gapText(p, rel, single) {
    if (!p.alive) return 'DOWN';
    if (p.countdown != null) return single ? 'OFFLINE' : '?';
    if (p.danger >= DANGER) return single ? 'DANGER!' : '!';
    // ▲ = further up the road than me, ▼ = behind me (words do not fit next to a squad of 999)
    const m = Math.round(rel), unit = single ? 'm' : '';
    return m > 0 ? `▲${m}${unit}` : m < 0 ? `▼${-m}${unit}` : single ? 'EVEN' : '=';
  }

  function setRow(r, state, d) {
    if (state !== r.state) { r.state = state; r.el.className = state ? `vs-r ${state}` : 'vs-r'; }
    if (d !== r.d) { r.d = d; r.dEl.textContent = d; }
  }

  function chip(el, key, show) {
    if (S[key] === show) return;
    S[key] = show;
    el.classList.toggle('hidden', !show);
  }

  function update(dt) {
    if (!on) return;
    const vs = game.versus;
    if (!vs || !vs.live || !game.run || game.run.mode !== 'versus') return;
    // 8 reads a second, by game time or by the wall clock, whichever comes first (a slow phone's frames are
    // clamped to 1/30 s of game time each: its bar must not fall behind)
    const now = performance.now();
    acc += dt;
    if (acc < STEP && now - last < STEP * 1000) return;
    acc = 0; last = now;
    const v = vs.view(), single = one(rows.length);

    const sec = v.go ? Math.floor(v.t) : 0;
    if (sec !== S.sec) { S.sec = sec; clockEl.textContent = clock(sec); }
    const phase = v.storm ? 'storm' : v.sudden ? 'sudden' : '';
    if (phase !== S.phase) {
      S.phase = phase;
      phaseEl.className = phase ? `vs-phase ${phase}` : 'vs-phase hidden';
      phaseEl.textContent = PHASE[phase] || '';
      hud.el.classList.toggle('vs-ph', !!phase);
    }
    const me = v.go && !vs.fallen && v.me.danger >= DANGER;
    if (me !== S.me) setMe(me);

    let dcN = null, dcName = '', dcCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], p = vs.peer(r.slot);
      if (!p) continue;
      const silent = p.alive && p.countdown != null;
      if (silent) { dcCount++; if (dcN === null || p.countdown < dcN) { dcN = p.countdown; dcName = p.name; } }
      if (p.n !== r.n) { r.n = p.n; r.cntEl.textContent = String(p.n); }
      // before GO (and until a rival's first numbers are in) there is nothing to compare yet
      if (p.alive && !silent && (!v.go || (p.n === 0 && p.dist === 0))) { setRow(r, 'pre', single ? 'GET READY' : ''); continue; }
      const g = vs.ghost.peer(r.slot);
      const rel = !p.alive ? 0 : g && Number.isFinite(g.rel) ? g.rel : p.dist - v.me.dist;
      setRow(r, !p.alive ? 'down' : silent ? 'silent' : p.danger >= DANGER ? 'danger' : '', gapText(p, rel, single));
    }

    const dc = dcN === null ? '' : `${dcCount > 1 ? 'RIVALS' : single ? 'RIVAL' : esc(up(dcName))} LOST CONNECTION · ${single || dcCount === rows.length ? 'WIN' : 'OUT'} IN <b class="num">${dcN}</b>`;
    if (dc !== S.dc) { S.dc = dc; dcEl.innerHTML = dc; dcEl.classList.toggle('hidden', !dc); }
    chip(netEl, 'net', v.net === 'lost');
    chip(waitEl, 'wait', !!vs.fallen && !vs.verdict && vs.sinceFall > WAIT_AFTER);
    const any = !!dc || S.net || S.wait;
    if (any !== S.chips) { S.chips = any; chipsEl.classList.toggle('hidden', !any); }
  }

  ev.on('versus:start', ({ peers }) => build(peers || []));
  ev.on('run:start', (p) => { if (p.mode !== 'versus') clear(); });
  ev.on('game:state', ({ state }) => {
    if (state === 'playing' || state === 'paused') return;
    // the HUD hides itself; the pieces that live outside it go with it
    chipsEl.classList.add('hidden'); S.chips = false;
    if (S.me) setMe(false);
    if (state !== 'result') clear();
  });

  return { update, rivalsEl, chipsEl, edge, get on() { return on; } };
}
