// QUICK MATCH, the flow side (STAGE3 "Builder QUEUE"): flow.js calls installQuick(flow, inner) once; this file owns
// everything a quick match adds to the FLOW, so flow.js only carries small hooks.
//
//   flow.mode            null | 'quick'   ('quick' from the tap on QUICK MATCH until LEAVE / CANCEL / another menu)
//   flow.quickMatch()    start a search -> false when busy / no name / in a room / already searching
//   flow.quickCancel()   -> Promise: no ticket, no room, back to the hub
//   flow.quickView()     -> { phase: 'search'|'found', secs, name, hero, weapon }   the SAME shape for a human and a bot
//   flow.quick.match     { kind: 'human'|'bot', mid|null, slot, rivalSlot, rivalTr, seed, t0 } of the current match
//   flow.quick.q         the queue of the current search (quick.js) or null
//   flow.quick.test      { clockFor: ({ t0, now }) => () -> s }  tests only: the clock a bot match runs on
// What happens after a tap:
//   paired with a person: the room is adopted by the flow (the flow's own room listeners), after QUICK.foundMs of
//     RIVAL FOUND! I am READY with the picks I have now; the lowest seat starts the match (room.js), the room's
//     'start' runs flow.startMatch() like any match: the VS card, 3-2-1-GO.
//   no person: a bot (pickBot / createBotLink of bot.js): RIVAL FOUND! for pick.readyIn s, then the match starts on
//     the bot's LINK (no database traffic at all) with the same VS card.
//   PLAY AGAIN on the result screen (flow.rematch() in quick mode) leaves the room and starts a NEW search.
// Stage 4 hooks: session.stake(flow.quick.match) on versus:go and session.claim(flow.quick.match, result) on
// versus:end, quick matches only (both are stubs today: nothing is written). link.ranked stays false.
import { NET } from './config.js';
import { hash32, realClock } from './transport.js';
import { createQuick, countMatch, matchCfg, QUICK } from './quick.js';
import { pickBot, createBotLink } from './bot.js';

/**
 * inner = flow.js's private pieces: { game, ui, transport, session, adopt(room), dropRoom(kind), syncPicks(),
 *   seatPicks(), changed(), setPlayers(list) }
 */
export function installQuick(flow, inner, { clock = realClock } = {}) {
  const { game, ui, transport: tp, session } = inner;
  let q = null, qOffs = [], prev = 'off', adopted = null, found = null, readyOff = null;
  const quick = { match: null, q: null, test: { clockFor: null }, real: true };
  flow.mode = null;
  flow.quick = quick;

  const stopTimer = () => { if (readyOff) { readyOff(); readyOff = null; } };
  const lostRoom = () => { if (adopted && flow.room === adopted && !flow.link) inner.dropRoom(null); adopted = null; };

  function onChange(st) {
    // a pairing fell through (the rival left before the match): quick.js has left that room, the flow lets go too
    if (prev === 'paired' && st.phase !== 'paired' && st.phase !== 'off') { stopTimer(); lostRoom(); }
    if (st.phase === 'off' && st.why === 'live') adopted = null; // the match is on: the room is the flow's now
    prev = st.phase;
    inner.changed();
  }

  function onPaired(room) {
    if (flow.mode !== 'quick' || flow.room || flow.link) { q.resume(); return; }
    adopted = room;
    inner.adopt(room);
    stopTimer();
    readyOff = clock.after(QUICK.foundMs, () => { readyOff = null; if (flow.room === room && !flow.link) room.ready(true); });
  }

  function onBot() {
    const seed = hash32(tp.now(), 'bot:' + session.uid);
    let pick;
    try { pick = pickBot({ seed, tr: Number(session.profile && session.profile.tr) || 0, avoid: flow.name }); } catch (e) { console.error(e); pick = pickBot({ seed }); }
    found = { pick, seed };
    stopTimer();
    readyOff = clock.after(Math.max(0, Number(pick.readyIn) || 0) * 1000, () => { readyOff = null; startBot(); });
    inner.changed();
  }

  function startBot() {
    if (!found || flow.mode !== 'quick' || flow.link || game.state !== 'online') return;
    const { pick, seed } = found;
    const t0 = tp.now() + NET.goMs, now = () => tp.now();
    const clockFn = quick.test.clockFor ? quick.test.clockFor({ t0, now }) : undefined;
    let link;
    try { link = createBotLink({ seed, pick, game, now, t0, clock: clockFn, slot: 0 }); } catch (e) {
      console.error(e); stop(); inner.changed(); return; // never stuck on RIVAL FOUND!: back to the hub
    }
    found = null;
    flow.link = link;
    inner.setPlayers([{ slot: 1, uid: '', name: pick.name }]);
    quick.match = { kind: 'bot', mid: null, slot: 0, rivalSlot: 1, rivalTr: Number(pick.tr) || 0, seed, t0 };
    game.versus.start(link, inner.syncPicks());
    inner.changed();
  }

  /** A fresh search (the old one, if any, must be gone). */
  function search() {
    flow.mode = 'quick';
    found = null; quick.match = null; adopted = null; prev = 'off';
    q = quick.q = createQuick({ transport: tp, profile: session.profile, picks: inner.seatPicks(), cfg: session.cfg, clock });
    qOffs = [q.on('change', onChange), q.on('paired', onPaired), q.on('bot', onBot)];
    q.start();
    inner.changed();
  }

  /** Out of Quick Match for good (LEAVE, CANCEL, another menu): the search and anything it holds go. */
  function stop() {
    stopTimer();
    found = null;
    let p = Promise.resolve();
    if (q) { for (const off of qOffs.splice(0)) off(); p = q.cancel(); q = quick.q = null; }
    lostRoom();
    flow.mode = null;
    quick.match = null;
    return p;
  }

  flow.quickMatch = () => {
    if (flow.busy || !flow.name || flow.gate || flow.room || flow.link || flow.mode === 'quick') return false;
    search();
    return true;
  };
  flow.quickCancel = () => {
    const p = stop();
    inner.changed();
    return p;
  };
  flow.quickView = () => {
    if (flow.mode !== 'quick' || !q) return null;
    const st = q.state, secs = Math.max(0, Math.floor((clock.now() - st.since) / 1000));
    if (found) return { phase: 'found', secs, name: found.pick.name, hero: found.pick.hero, weapon: found.pick.weapon };
    if (st.phase === 'paired' && st.rival) return { phase: 'found', secs, name: st.rival.n, hero: st.rival.he, weapon: st.rival.we };
    return { phase: 'search', secs, name: '', hero: '', weapon: '' };
  };

  // ---- stage 4 hooks (stubs today: nothing is written) ----
  game.events.on('versus:go', () => { if (flow.mode === 'quick' && quick.match) session.stake(quick.match).catch(() => {}); });
  game.events.on('versus:end', (r) => { if (flow.mode === 'quick' && quick.match) session.claim(quick.match, r).catch(() => {}); });

  // ---- the hooks flow.js calls ----
  return {
    stop,
    /** The cfg of the next match: a busy day (meter > dayCap seen by this search) sends less often. */
    cfg: () => matchCfg(session.cfg, flow.mode === 'quick' && !!(q && q.state.busy)),
    /** flow.startMatch made a human link (friend or quick): the day meter, and the quick match's record. */
    started(link, players) {
      countMatch(tp, link).catch(() => {});
      if (flow.mode !== 'quick') return;
      const rival = (players || []).find((p) => p.slot !== link.slot) || {};
      quick.match = { kind: 'human', mid: link.mid || null, slot: link.slot, rivalSlot: rival.slot ?? null, rivalTr: Number(rival.tr) || 0, seed: link.seed, t0: link.t0 };
    },
    /** The result screen's big button in quick mode: PLAY AGAIN (a new search), for a person and a bot alike. */
    rematchState(players) {
      const others = (players || []).filter((p) => p.uid !== session.uid).map((p) => ({ slot: p.slot, name: p.name, here: false, wants: false, offline: false }));
      return { quick: true, can: true, mine: false, others, waitingFor: null, lost: false, hostLeft: false };
    },
    playAgain() {
      const v = game.versus;
      if (v && v.live) v.stop({ toTitle: false });
      stop();
      inner.dropRoom(null);
      search();
      ui.nav('online');
      return Promise.resolve(true);
    },
    /** The start time of the current match for its history row (a bot link has no t0 of its own). */
    t0: (link) => (link && typeof link.t0 === 'number' ? link.t0 : quick.match ? quick.match.t0 : tp.now()),
  };
}

