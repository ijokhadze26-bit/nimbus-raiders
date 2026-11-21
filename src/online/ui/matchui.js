// What a player sees from the VS card to the result screen of an online match (STAGE1b "Builder MATCHUI").
// src/online/index.js calls installMatchUi(game, ui, flow) once, after game.versus exists:
//   - vscard.js   the VS card with every player's picks, 3-2-1-GO
//   - vsmoment.js the big moment at the end: SQUAD DOWN! / RIVAL DOWN!, letterbox, camera push, YOU WIN! / YOU LOSE
//   - hudvs.js    the versus bar in the HUD (time, rivals, danger, DOWN, sabotage flags) and its chips
//   - sabbtn.js   the SABOTAGE button; sabwarn.js the incoming warnings, the frozen frame and the match feed (stage 2)
//   - vsresult.js the 'vsresult' screen (REMATCH / LEAVE)
//   - here        the glue: LEAVE MATCH? instead of pause, the way out of a match, the route to the result screen
// `flow` is the one object of src/online/flow.js this UI talks to: { session, room, link, picks, rematchState(),
// rematch(), leave(to), on('change', cb) -> off }. Everything here reads it late (never at install time), so the
// shell may fill it in as the match goes.
//
// Hooks into the single-player UI, all of them inert outside a match (src/ui/** is not edited):
//   - ui.hud.update is wrapped so the bar and the card get their per-frame update from ui.update;
//   - a click on the HUD pause button and Esc / P ask LEAVE MATCH? while a match is live (game.pause() is already a
//     no-op then, game.js).
// The route to the result screen is ui.js's own: on game state 'result' after a 'versus' run it goes to 'vsresult'.
// (The game's event bus calls the NEWEST listener first: nothing here relies on running after the HUD's or the
// UI's own listeners of the same event.)
import './match.css';
import './sab.css';
import { mountVsHud } from './hudvs.js';
import { mountVsCard } from './vscard.js';
import { mountVsMoment } from './vsmoment.js';
import { mountSabButton } from './sabbtn.js';
import { mountSabWarn } from './sabwarn.js';
import { createVsResult } from './vsresult.js';

export function installMatchUi(game, ui, flow) {
  if (ui.matchUi) { ui.matchUi.ctx.flow = flow; return ui.matchUi; }
  const ev = game.events, hud = ui.hud;

  const ctx = {
    game, ui, flow,
    roster: [],            // the players of the current / last match: me first, then the rivals by seat
    rosterOf: null,        // ... and the link they were read from
    players,
    leave: () => leave(),
  };

  /** My name as the room shows it, else the profile's, else YOU. */
  function myName(slot) {
    const f = ctx.flow || {};
    const seat = f.room && f.room.state && f.room.state.seats ? f.room.state.seats[slot] : null;
    return (seat && seat.n) || (f.session && f.session.profile && f.session.profile.n) || 'YOU';
  }

  /** The players of the match: read from the link the first time it is asked for, kept after the link is gone. */
  function players() {
    const vs = game.versus, link = vs && vs.link;
    if (!link || ctx.rosterOf === link) return ctx.roster;
    const picks = (ctx.flow && ctx.flow.picks) || {}, mine = vs.picks || {};
    const slot = link.slot ?? 0;
    const me = {
      slot, name: myName(slot), hero: mine.hero || picks.hero || (game.run && game.run.hero), weapon: mine.weapon || picks.weapon || (game.run && game.run.weapon),
      heroSkin: mine.heroSkin || picks.heroSkin || null, weaponSkin: mine.weaponSkin || picks.weaponSkin || null,
    };
    ctx.rosterOf = link;
    ctx.roster = [me, ...[...(link.peers || [])].sort((a, b) => a.slot - b.slot)];
    return ctx.roster;
  }
  ev.on('versus:start', players);

  const bar = mountVsHud(ctx);
  const card = mountVsCard(ctx);
  const moment = mountVsMoment(ctx);
  const sabBtn = mountSabButton(ctx);
  const sabWarn = mountSabWarn(ctx);
  const screen = createVsResult(ctx);
  if (typeof ui.addScreen === 'function') ui.addScreen('vsresult', screen);
  else ui.screens.vsresult = screen; // (a ui.js without addScreen: same thing its constructor does)

  // ---- per-frame update: ui.update -> hud.update -> the bar and the card ----
  const hudUpdate = hud.update;
  hud.update = function update(dt) {
    hudUpdate.call(this, dt);
    bar.update(dt || 0);
    card.update();
    sabBtn.update(dt || 0);
    sabWarn.update(dt || 0);
    moment.update();
  };

  // ---- no pause in a match: the pause button and Esc / P ask to leave ----
  const inMatch = () => !!(game.versus && game.versus.live && game.state === 'playing');

  function askLeave() {
    if (!inMatch() || ui.top() === 'confirm') return;
    ui.confirm({ title: 'LEAVE MATCH?', text: 'You will lose this match.', yes: 'LEAVE', no: 'STAY', danger: true, onYes: leave });
  }

  /** Out of the match (or off its result screen) for good: my fall is reported if I was still standing, then the flow leaves the room. */
  function leave() {
    if (game.versus) game.versus.stop({ toTitle: false });
    const f = ctx.flow;
    let p = null;
    try { p = f && f.leave ? f.leave() : null; } catch (e) { console.warn('[online] leave failed', e); }
    // The flow navigates to the hub. Until it has (or if it cannot), nobody may be left in a dead run or on a result
    // screen whose buttons no longer do anything: the title is the safe place to wait.
    const stranded = () => (game.run && game.run.mode === 'versus' && (game.state === 'playing' || game.state === 'paused')) || (game.state === 'result' && ui.current === 'vsresult');
    if (stranded()) game.toTitle();
    if (p && typeof p.then === 'function') p.catch((e) => console.warn('[online] leave failed', e));
  }

  hud.el.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-act="pause"]') && inMatch()) askLeave(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
    if (!inMatch()) return;
    if (ui.top() === 'confirm') { if (e.key === 'Escape') ui.screens.confirm.onBack(); return; }
    askLeave();
  });

  ui.matchUi = { ctx, bar, card, moment, sabBtn, sabWarn, screen, askLeave, leave, update(dt) { bar.update(dt || 0); card.update(); sabBtn.update(dt || 0); sabWarn.update(dt || 0); moment.update(); } };
  return ui.matchUi;
}
