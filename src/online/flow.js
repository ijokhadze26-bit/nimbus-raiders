// The FLOW: the one object the online screens and the match screens talk to (STAGE1b). It owns the session, the
// current friend room and the current match link, and turns what the network side reports into what a screen shows.
//
//   flow.session / flow.transport   from the network side (session.js, transport.js)
//   flow.room                       the room I am in (room.js) or null
//   flow.link                       the link of the current / last match (match.js) or null
//   flow.picks                      { hero, weapon, heroSkin, weaponSkin }: what I play with (always the same object)
//   flow.name / .gate / .net        my player name ('' before the first visit); null | 'paused' | 'update' | 'banned';
//                                   my connection 'off' | 'connecting' | 'on' | 'lost'
//   flow.busy / .notice             'create' | 'join' | 'name' | null while a request runs; { kind, title, text } to
//                                   show on the hub once (ROOM NOT FOUND, ROOM IS FULL, ...), cleared by clearNotice()
//   connect()                       sign in + read the profile (every visit) -> { ok, reason, gate }
//   setName(text)                   first name or a rename -> { ok, reason, help }
//   createRoom() / joinRoom(code)   -> true when I sit in the room (flow.room); false + flow.notice otherwise
//   setPicks({ hero, weapon })      change my pick (only heroes / weapons I own; not while READY)
//   ready(on)                       READY / NOT READY in the lobby
//   startMatch()                    runs on the room's 'start': link = createMatch(...), game.versus.start(link, picks)
//   rematchState()                  { can, mine, others: [{ slot, name, here, wants, offline }], waitingFor, lost, hostLeft }
//                                   (offline: not seated, and the match saw that rival's connection drop)
//   rematch()                       I want another round; the next 'start' of the room begins it
//   leave(to = 'online')            leave the match and the room for good, then go to the hub ('online') or 'title'
//   on(type, cb) -> off             'change': something a screen shows has changed
//   shareLink({ watch })            the address a friend opens to land in my room (watch: true adds watch=1)
//   mode / quickMatch() / quickCancel() / quickView() / quick   QUICK MATCH (src/online/quickflow.js); in quick mode
//                                   rematchState() / rematch() mean PLAY AGAIN (a new search), never a REMATCH
//   reward                          { last }: trophies, coins, online skins of the last match (src/online/rewards.js)
// Leaving the online pages for any other menu also leaves the room; a tab that reloads in the middle of a match
// has its fall written on the next visit (SPEC4 §5.7) - unless its `live` stamp (renewed every 2 s by the page that
// plays it) is fresh: then another tab of mine is playing that match right now.

import { MENU_STATES } from '../game/states.js';
import { selectHero, selectWeapon } from '../save/unlocks.js';
import { setOnlineProfile } from '../save/onlinesave.js';
import { createRoom, joinRoom } from './room.js';
import { createMatch, quitOut } from './match.js';
import { NAME_HELP } from './names.js';
import { NET } from './config.js';
import { installQuick } from './quickflow.js';
import { installRewards } from './rewards.js';
import { TROPHY } from './leagues.js';
import { realClock } from './transport.js';

const PENDING_KEY = 'nimbusRaiders.online.pending';

export const NOTICES = {
  notfound: ['ROOM NOT FOUND', 'Check the code with your friend and try again.'],
  full: ['ROOM IS FULL', 'All 4 seats are taken. You can still watch the match!'],
  playing: ['MATCH ALREADY STARTED', 'You can watch it! Ask your friends for the next room to play.'],
  closed: ['ROOM CLOSED', 'That room is gone. Make a new one!'],
  hostaway: ['THE HOST IS AWAY', "The host's internet dropped. Try again in a moment."],
  lostseat: ['YOU LOST YOUR SEAT', 'Your connection dropped and someone took your place. Join again or make a new room.'],
  nocreate: ['COULD NOT MAKE A ROOM', 'Something went wrong. Please try again.'],
  noanswer: ['NO ANSWER', 'The room did not answer. Check your internet and try again.'],
  quit: ['YOU LEFT YOUR LAST MATCH', 'Leaving in the middle of a match counts as a loss.'],
};
const NAME_FAIL = { ...NAME_HELP, denied: 'That name did not work. Try another one.', offline: 'No connection right now. Try again in a moment.' };

export function createFlow(game, ui, { transport, session, clock, trusted = true }) {
  const handlers = new Map();
  let roomOffs = [];
  let wantRematch = false;
  let matchRn = 0;          // the room's round number when the current match began
  let players = [];         // who was in the current / last match: [{ slot, uid, name }]
  let parked = false;       // I was un-readied because my rematch partner went away (ready again when they are back)
  let queued = false;
  let quick = null;         // the QUICK MATCH hooks (quickflow.js)
  let rewards = null;       // trophies / coins / skins of a finished match (rewards.js)
  let stampOff = null;      // the live stamp of the pending match

  const emitNow = () => { queued = false; for (const cb of [...(handlers.get('change') || [])]) { try { cb(flow); } catch (e) { console.error(e); } } };
  /** Several things often change in one go (a room update): the screens are told once, a moment later. */
  const changed = () => { if (!queued) { queued = true; queueMicrotask(emitNow); } };
  const note = (kind) => { flow.notice = kind ? { kind, title: NOTICES[kind][0], text: NOTICES[kind][1] } : null; };

  // ---------------- my pick ----------------
  function syncPicks() {
    const d = game.save.data, p = flow.picks;
    p.hero = d.heroes.selected; p.weapon = d.arsenal.selected; p.heroSkin = d.skins.hero; p.weaponSkin = d.skins.weapon;
    return p;
  }
  const seatPicks = () => { const p = syncPicks(); return { he: p.hero, we: p.weapon, hs: p.heroSkin, ws: p.weaponSkin }; };
  const mySeat = () => { const st = flow.room && flow.room.state; return st && st.me !== null ? st.seats[st.me] : null; };

  // ---------------- a match left by a reload (SPEC4 §5.7) ----------------
  const pending = {
    set(v) {
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...v, live: Date.now() })); } catch { /* storage blocked */ }
      if (stampOff) stampOff();
      stampOff = realClock.every(TROPHY.liveStampMs, () => { const p = pending.read(); if (p && p.mid === v.mid) { try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, live: Date.now() })); } catch { /* blocked */ } } });
    },
    read() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } },
    clear() { if (stampOff) { stampOff(); stampOff = null; } try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ } },
    take() {
      const v = pending.read();
      if (v && typeof v.live === 'number' && Date.now() - v.live < TROPHY.liveDeadMs) return null; // another tab plays it
      pending.clear();
      return v && typeof v.mid === 'string' && Number.isInteger(v.slot) && v.uid === session.uid ? v : null;
    },
  };
  /** A match a closed page left: my fall record (SPEC4 §5.7), then the ranked side settles its stake. */
  async function settlePending() {
    if (flow.link) return; // I am in a match right now: that one is not "left"
    const p = pending.take();
    const told = () => { if (!flow.room) { note('quit'); changed(); } };
    if (p && transport.now() - p.ts0 <= NET.capMs + 60000 && await quitOut(transport, { mid: p.mid, slot: p.slot, t: 0, d: 0, ts0: p.ts0 })) told();
    const r = await session.settle().catch(() => null);
    if (r && r.quit && !(flow.notice && flow.notice.kind === 'quit')) told();
  }

  // ---------------- the room ----------------
  function dropRoom(kind) {
    for (const off of roomOffs.splice(0)) off();
    if (flow.link) { const l = flow.link; flow.link = null; l.leave(); }
    if (flow.room) { const r = flow.room; flow.room = null; r.leave().catch(() => {}); }
    wantRematch = false;
    pending.clear();
    if (kind) note(kind);
    changed();
  }

  function onRoom(state) {
    if (!flow.room) return;
    const inMatch = !!flow.link;
    if (flow.mode === 'quick' && !inMatch) { changed(); return; } // before its match a quick room is the queue's (quick.js)
    if (state.gone) { if (!inMatch) dropRoom('closed'); else changed(); return; }
    // no seat for me (a safety net: joinRoom throws 'full' / 'playing' instead; watching is src/online/watchflow.js)
    if (state.watching && !inMatch) { dropRoom(state.st === 'live' ? 'playing' : 'full'); return; }
    if (state.lost && !inMatch) { dropRoom('lostseat'); return; }
    if (inMatch && flow.mode !== 'quick') guardRematch(state);
    changed();
  }

  // On the result screen, a rematch only ever starts with the players of the last match. The room is back in the
  // lobby for the next round: when my partner is not seated I am not READY (so nobody else can start a match from
  // my result screen); when someone new sits down, I am taken to the lobby to see them and tap READY there.
  function guardRematch(st) {
    if (st.st !== 'lobby' || st.rn <= matchRn || st.me === null || !flow.room) return;
    const mine = st.seats[st.me];
    const known = (s) => players.some((p) => p.uid === s.uid);
    const others = st.seats.filter((s) => s && s.uid !== session.uid);
    if (others.some((s) => !known(s))) {
      if (mine && mine.rdy) flow.room.ready(false);
      parked = false; wantRematch = false;
      const l = flow.link; flow.link = null; if (l) l.leave();
      if (game.state !== 'online') ui.nav('online');
      return;
    }
    if (!others.length) {
      if (mine && mine.rdy) { parked = true; flow.room.ready(false); }
    } else if (parked && mine && !mine.rdy) {
      parked = false; flow.room.ready(true);
    }
  }

  function adopt(room) {
    flow.room = room;
    wantRematch = false;
    roomOffs = [
      room.on('change', onRoom),
      room.on('start', () => flow.startMatch()),
      room.on('error', (e) => console.warn('[nimbus] room:', (e && (e.code || e.message)) || e)),
    ];
    onRoom(room.state);
  }

  async function enter(kind, make, fail) {
    if (flow.busy || flow.room) return false;
    flow.busy = kind; note(null); changed();
    let room = null;
    try { room = await make(); } catch (e) { note(fail(e)); }
    flow.busy = null;
    if (room && game.state !== 'online') { room.leave().catch(() => {}); room = null; } // the player walked away meanwhile
    if (room) adopt(room);
    changed();
    return !!flow.room;
  }

  const flow = {
    session, transport,
    room: null,
    link: null,
    picks: { hero: '', weapon: '', heroSkin: '', weaponSkin: '' },
    gate: null,
    net: transport.status(),
    busy: null,
    notice: null,
    get name() { return (session.profile && session.profile.n) || ''; },

    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => handlers.get(type).delete(cb);
    },
    /** How many listeners are attached (tests: nothing may be left behind by a closed screen). */
    listeners(type = 'change') { return handlers.get(type) ? handlers.get(type).size : 0; },
    clearNotice() { if (flow.notice) { flow.notice = null; changed(); } },

    async connect() {
      try {
        const { gate } = await session.connect();
        flow.gate = gate;
      } catch (e) {
        flow.net = transport.status();
        return { ok: false, reason: 'offline', gate: null };
      }
      flow.net = transport.status();
      if (session.profile) setOnlineProfile(game.save, session.profile);
      syncPicks();
      settlePending().then(() => rewards.connected(), () => {});
      rewards.connected();
      changed();
      return { ok: true, reason: null, gate: flow.gate };
    },

    /** First visit: makes my profile. Later: a rename. -> { ok, reason, help } (help = a plain sentence when not ok) */
    async setName(text) {
      if (flow.busy) return { ok: false, reason: 'busy', help: '' };
      flow.busy = 'name'; changed();
      let r;
      try { r = session.profile ? await session.rename(text) : await session.ensureProfile(String(text ?? '').trim() || ' '); } catch (e) { r = { ok: false, reason: 'offline' }; }
      flow.busy = null;
      if (r.ok && session.profile) setOnlineProfile(game.save, session.profile);
      changed();
      return { ok: !!r.ok, reason: r.reason || null, help: r.ok ? '' : (NAME_FAIL[r.reason] || NAME_FAIL.denied) };
    },

    createRoom() {
      return enter('create', () => createRoom({ transport, profile: session.profile, picks: seatPicks(), max: NET.friendMax }), () => 'nocreate');
    },
    /** `code`: four letters. A seat or nothing: a full lobby is 'full', a room whose match is on 'playing' (both can be
     *  watched instead: flow.watchRoom, src/online/watchflow.js). */
    joinRoom(code) {
      return enter('join', () => joinRoom({ transport, code, profile: session.profile, picks: seatPicks() }),
        (e) => ({ 'not-found': 'notfound', full: 'full', playing: 'playing', closed: 'closed', hostaway: 'hostaway' }[e && e.code] || 'noanswer'));
    },

    /** Hero / weapon for the next match: stored like the LOADOUT page stores it, then shown to the room. */
    setPicks({ hero, weapon } = {}) {
      const seat = mySeat();
      if (seat && seat.rdy) return false; // picks lock at READY
      if (hero) selectHero(game.save, hero);
      if (weapon) selectWeapon(game.save, weapon);
      const p = seatPicks();
      if (seat && flow.room) flow.room.pick(p);
      changed();
      return true;
    },
    ready(on = true) { return flow.room ? flow.room.ready(!!on) : Promise.resolve(false); },

    startMatch() {
      const room = flow.room, st = room && room.state;
      if (!st || !st.mid) return false;
      if (flow.link) { const old = flow.link; flow.link = null; old.leave(); } // a rematch: the last match is over
      const link = createMatch({ transport, room, cfg: quick.cfg() });
      if (link.slot === null) { link.leave(); dropRoom('playing'); return false; } // it began without me
      flow.link = link;
      wantRematch = false; parked = false;
      matchRn = st.rn;
      players = (st.players || []).map((p) => ({ slot: p.slot, uid: p.uid, name: p.n }));
      quick.started(link, st.players || []);
      pending.set({ mid: link.mid, slot: link.slot, uid: session.uid, ts0: link.t0 - NET.goMs });
      game.versus.start(link, syncPicks());
      changed();
      return true;
    },

    rematchState() {
      if (flow.mode === 'quick') return quick.rematchState(players);
      // a rival the match saw drop (forfeited for silence, or silent right now) is offline, not gone for good
      const offline = (slot) => { const p = game.versus && game.versus.peer ? game.versus.peer(slot) : null; return !!p && (p.by === 'dc' || p.silent > 0 || p.countdown != null); };
      const out = { can: false, mine: false, others: [], waitingFor: null, lost: false, hostLeft: false };
      const st = flow.room && flow.room.state;
      const rivals = players.filter((p) => p.uid !== session.uid);
      if (!st || st.gone) {
        out.others = rivals.map((p) => ({ slot: p.slot, name: p.name, here: false, wants: false, offline: false }));
        return out;
      }
      const turned = st.st === 'lobby' && st.rn > matchRn; // everyone who is still here asked: the next round is being set up
      const wants = (seat) => !!seat && (turned || (st.st === 'live' ? seat.rm : seat.rdy));
      out.others = rivals.map((p) => {
        const seat = st.seats.find((s) => s && s.uid === p.uid) || null;
        return { slot: p.slot, name: seat ? seat.n : p.name, here: !!seat, wants: wants(seat), offline: !seat && offline(p.slot) };
      });
      const seat = st.me !== null ? st.seats[st.me] : null;
      out.mine = !!seat && (wantRematch || wants(seat));
      out.lost = !seat;
      out.hostLeft = !!st.hostLeft;
      out.can = !!seat && out.others.some((o) => o.here);
      const slow = out.others.find((o) => o.here && !o.wants);
      out.waitingFor = out.mine && slow ? slow.name : null;
      return out;
    },

    rematch() {
      if (flow.mode === 'quick') return quick.playAgain();
      const room = flow.room;
      if (!room || !flow.rematchState().can) return Promise.resolve(false);
      wantRematch = true;
      changed();
      // (the room is already back in the lobby when the rival asked first and I am the last one: then I only ready up)
      return room.state.st === 'lobby' ? room.ready(true) : room.rematch({ ready: true });
    },

    leave(to = 'online') {
      const v = game.versus;
      if (v && v.live) v.stop({ toTitle: false }); // leaving a running match is a fall ('quit')
      quick.stop();
      dropRoom(null);
      ui.nav(to === 'title' ? 'title' : 'online');
    },

    /** The address a friend opens to land in my room; `watch: true` = the WATCH LINK (they watch, no seat). */
    shareLink({ watch = false } = {}) {
      const code = flow.room ? flow.room.code : '';
      const q = new URLSearchParams();
      if (ui.params && ui.params.net) q.set('net', ui.params.net); // a local test network: the friend's tab needs it too
      q.set('room', code);
      if (watch) q.set('watch', '1');
      return `${location.origin}${location.pathname}?${q.toString()}`;
    },
  };

  // ---------------- wiring ----------------
  transport.onStatus((s) => { flow.net = s; changed(); });
  const ev = game.events;
  ev.on('game:state', ({ state }) => {
    // (the ONLINE page itself, a run, or passing through the title on the way back to the hub: nothing to close)
    if (state === 'online' || !MENU_STATES.has(state) || ui.navigating === 'online') return;
    // any other menu: nothing online stays open behind it, and the connection is let go a little later
    // (every way back in goes through ui.openOnline -> connect(), which takes it up again)
    if (flow.mode) quick.stop(); // (a search, or RIVAL FOUND!: no ticket and no seat stay behind)
    if (flow.room || flow.link) dropRoom(null);
    transport.idle();
  });
  // the result of a match: one row in the save's online history (a later, corrected verdict replaces the row)
  // (and its trophies, coins and skins: rewards.js)
  const record = (r) => {
    const link = flow.link;
    if (!link || !r || !['win', 'lose', 'draw'].includes(r.result)) return;
    pending.clear();
    rewards.record(r, link, players);
    changed();
  };
  ev.on('versus:end', record);
  ev.on('versus:revised', record);
  ev.on('save:changed', () => { if (flow.room && !flow.link) syncPicks(); });
  quick = installQuick(flow, { game, ui, transport, session, adopt, dropRoom, syncPicks, seatPicks, changed, setPlayers: (list) => { players = list; } }, clock ? { clock } : undefined);
  if (clock && session.setClock) session.setClock(clock);
  rewards = installRewards(flow, { game, transport, session, changed, trusted, t0: (link) => quick.t0(link) });
  syncPicks();
  return flow;
}
