// The big slow-motion moment at the end of an online match (STAGE2 "Builder SABUI" point 6). The slow motion and
// the holds are the game side's (versus.js + VS.end); this is what the player sees over them:
//   - my fall (run:lose, mode versus): "SQUAD DOWN!" slams in (red, scale pop), a red-grey tint (plain opacity),
//     black letterbox bars slide in, the camera pushes in; the lose stinger already plays (audio on run:lose).
//   - the last rival down (versus:peerdown with every rival out while I stand): "RIVAL DOWN!" with the name under it,
//     a white flash, the 'star' sound, letterbox, camera push.
//   - the verdict (versus:end / versus:revised): YOU WIN! (gold, rays: a turning conic gradient, still on Low) /
//     YOU LOSE / DRAW! in `.vs-moment` under the banner; confetti + the win stinger come from run:win already.
// Camera push: game.updateCamera is wrapped on the INSTANCE once: while a moment runs in a versus run, after the
// normal update the camera moves up to 22% of the way toward game.camLook (eased in over 0.6 s of real time) and
// looks at it again. game.camPos is never touched (the next normal update starts from it); any state change ends it.
// Everything is gone on the result screen, on HOME, on a rematch; a second match starts clean. Never takes a tap.
import { esc, up } from './vswords.js';
import { rivalDownWords } from './sabwords.js';

const WORDS = { win: 'YOU WIN!', lose: 'YOU LOSE', draw: 'DRAW!' };
const PUSH = 0.22, EASE_MS = 600;

const div = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function mountVsMoment(ctx) {
  const { game, ui } = ctx;
  const root = ui.hud.root, ev = game.events;
  const tint = div('vm-tint');
  const bars = div('vm-bars', '<i class="vm-bar t"></i><i class="vm-bar b"></i>');
  const down = div('vs-down hidden');
  const moment = div('vs-moment hidden');
  root.appendChild(tint); root.appendChild(bars); root.appendChild(down); root.appendChild(moment);

  const M = { banner: '', verdict: '', cam: false, camT0: 0 };

  // ---- camera push (one wrap per game instance) ----
  if (!game.__vsMomentCam) {
    const base = game.updateCamera;
    game.__vsMomentCam = { push: null };
    game.updateCamera = function updateCameraVs(dt) {
      base.call(this, dt);
      const h = game.__vsMomentCam.push;
      if (h) h();
    };
  }
  game.__vsMomentCam.push = () => {
    if (!M.cam) return;
    if (!game.run || game.run.mode !== 'versus' || (game.state !== 'playing' && game.state !== 'paused')) { M.cam = false; return; }
    const x = Math.min(1, (performance.now() - M.camT0) / EASE_MS), k = PUSH * (1 - (1 - x) * (1 - x) * (1 - x));
    const cam = game.camera, L = game.camLook;
    cam.position.x += (L.x - cam.position.x) * k;
    cam.position.y += (L.y - cam.position.y) * k;
    cam.position.z += (L.z - cam.position.z) * k;
    cam.lookAt(L);
  };

  const inRun = () => !!(game.run && game.run.mode === 'versus' && game.state === 'playing');
  const hideHint = () => { const h = ui.hud.hazardHint; if (h && h.hide) h.hide(); };

  function cinema(tone) {
    bars.classList.add('on');
    ui.hud.el.classList.add('vs-cine');
    tint.className = `vm-tint on ${tone}`;
    if (!M.cam) { M.cam = true; M.camT0 = performance.now(); }
    hideHint();
  }

  function banner(kind, head, sub) {
    M.banner = kind;
    down.className = `vs-down ${kind}`;
    down.innerHTML = `<div class="vd-big">${esc(head)}</div>${sub ? `<div class="vd-sub">${esc(sub)}</div>` : ''}`;
  }

  function fall() {
    if (M.banner === 'lose') return;
    banner('lose', 'SQUAD DOWN!', '');
    cinema('lose');
  }

  function rivalDown(p) {
    if (M.banner) return;
    banner('rival', rivalDownWords(p.by), up(p.name || ''));
    cinema('rival');
    const s = game.fx && game.fx.screen;
    if (s) s.flash('#ffffff', 0.85, 1.8);
    ev.emit('hazard:sfx', { sfx: 'star', opts: { index: 2 } }, true);
  }

  function verdict(r) {
    const kind = r && WORDS[r.result] ? r.result : 'lose';
    const low = !!(game.engine && game.engine.quality === 'low');
    const key = kind + (low ? ':low' : '');
    if (M.verdict === key) return;
    M.verdict = key;
    moment.className = `vs-moment ${kind}${M.banner ? ' under' : ''}${low ? ' low' : ''}`;
    moment.innerHTML = `<div class="vm-big">${WORDS[kind]}</div>`;
    hideHint(); // ("RIVAL DOWN! Stay alive" has done its job once the verdict is in)
    if (!M.banner) cinema(kind === 'win' ? 'rival' : 'lose');
  }

  function clear() {
    M.cam = false;
    if (!M.banner && !M.verdict) return;
    M.banner = ''; M.verdict = '';
    down.className = 'vs-down hidden'; down.innerHTML = '';
    moment.className = 'vs-moment hidden'; moment.innerHTML = '';
    bars.classList.remove('on');
    ui.hud.el.classList.remove('vs-cine');
    tint.className = 'vm-tint';
  }

  ev.on('run:lose', (p) => { if (p && p.mode === 'versus' && game.versus && game.versus.live) fall(); });
  ev.on('versus:peerdown', (p) => {
    const vs = game.versus;
    if (!p || !vs || !vs.live || vs.fallen || !inRun()) return;
    const peers = vs.view().peers;
    for (const q of peers) if (q.alive) return; // not the last one: the feed says it
    rivalDown(p);
  });
  ev.on('versus:end', (r) => { if (game.state === 'playing') verdict(r); });
  ev.on('versus:revised', (r) => { if (game.state === 'playing' && M.verdict) verdict(r); });
  ev.on('versus:start', clear);
  ev.on('run:start', (p) => { if (p.mode !== 'versus') clear(); });
  ev.on('game:state', ({ state }) => { M.cam = false; if (state !== 'playing' && state !== 'paused') clear(); });

  return {
    /** Per frame (ui.update): while a banner shows it owns the screen, so a hazard line emitted with or after the event
     *  that started it (versus.js "RIVAL DOWN! Stay alive", a SUDDEN DEATH line) is taken off. */
    update() { if (!M.banner) return; const h = ui.hud.hazardHint; if (h && h.el && !h.el.classList.contains('hidden')) h.hide(); },
    tint, bars, down, moment, clear,
    get banner() { return M.banner; }, get verdict() { return M.verdict.split(':')[0]; }, get cam() { return M.cam; },
  };
}
