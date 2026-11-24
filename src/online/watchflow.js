// SPECTATOR mode (STAGE5 "watchflow.js"): watch a friend room's matches from the ONLINE page, without a seat.
// src/online/index.js calls installWatch(flow, { game, ui, transport, session }) right after createFlow:
//
//   flow.watch = watcher
//   watcher.state -> null | { code, phase: 'joining' | 'lobby' | 'live' | 'done' | 'gone', seats, count, watch, rn }
//                    seats: room.js seats (null = empty); count: how many watch (me too); watch: the createWatch()
//                    model of the current match (src/online/game/watch.js) or null
//   watcher.on('change', cb) -> off           watcher.room / watcher.link   (tests)
//   flow.watchRoom(code) -> Promise<boolean>  false + flow.notice 'notfound' | 'watchfull' | 'closed' | 'noanswer'
//   flow.stopWatching()                       leave: my watcher marker goes, nothing is listened to any more
//
// A watcher only ever writes rooms/{code}/sp/{uid} (room.js joinRoom({ watch: true }) and room.leave()). Its match
// link is listen-only: it is made from a copy of the room with no uid in it, so even a player of that match who
// watches it afterwards can never write a heartbeat or a fall. Leaving the ONLINE page for any other menu stops
// watching (like flow.js leaves a room).
import { MENU_STATES } from '../game/states.js';
import { joinRoom } from './room.js';
import { createMatch } from './match.js';
import { createWatch } from './game/watch.js';
import { NOTICES } from './flow.js';

export const WATCH_NOTICES = {
  ...NOTICES,
  watchfull: ['TOO MANY WATCHERS', '4 people are watching this room already. Try again later!'],
};
const FAIL = { 'not-found': 'notfound', full: 'watchfull', closed: 'closed' };

export function installWatch(flow, { game, ui, transport, session } = {}) {
  const handlers = new Map();
  let room = null, link = null, model = null, offs = [], code = '', phase = null, matchMid = null, matchRn = -1, joining = 0, queued = false;

  const emitNow = () => { queued = false; for (const cb of [...(handlers.get('change') || [])]) { try { cb(watcher); } catch (e) { console.error(e); } } };
  const changed = () => { if (!queued) { queued = true; queueMicrotask(emitNow); } };
  const note = (kind) => { const w = WATCH_NOTICES[kind] || WATCH_NOTICES.noanswer; flow.notice = { kind, title: w[0], text: w[1] }; };

  function build() {
    if (!phase) { watcher.state = null; return; }
    const st = room && room.state;
    watcher.state = {
      code, phase, rn: st ? st.rn : 0,
      seats: st ? st.seats : [], count: st ? st.spectators : 0,
      watch: model,
    };
  }
  const set = (p) => { phase = p; build(); changed(); };

  function dropMatch() {
    if (model) { model.dispose(); model = null; }
    if (link) { const l = link; link = null; l.leave(); }
    matchMid = null;
  }

  function startMatch() {
    const st = room && room.state;
    if (!st || !st.mid || st.mid === matchMid) return;
    dropMatch();
    // listen-only: no uid in the room it is made from (createMatch finds no seat of mine in the match record)
    const quiet = { state: st, uid: '', code: room.code };
    link = createMatch({ transport, room: quiet, cfg: session.cfg });
    matchMid = st.mid;
    matchRn = st.rn;
    const roster = (st.players || []).map((p) => ({ slot: p.slot, name: p.n, tr: p.tr, hero: p.he, weapon: p.we, heroSkin: p.hs, weaponSkin: p.ws }));
    model = createWatch({ link, roster });
    const end = () => { if (phase === 'live') set('done'); };
    model.on('final', end);
    model.on('stale', end);
    set(model.final || model.stale ? 'done' : 'live');
  }

  function onRoom(st) {
    if (!room || !st) return;
    if (st.gone) { dropMatch(); const r = room; room = null; for (const off of offs.splice(0)) off(); r.close(); set('gone'); return; }
    if (st.st === 'lobby' && (matchMid || phase === 'joining' || phase === 'done') && st.rn !== matchRn) { dropMatch(); set('lobby'); return; }
    if (st.st === 'lobby' && phase !== 'lobby' && !matchMid) { set('lobby'); return; }
    if (st.st === 'live' && st.mid && st.mid !== matchMid) { startMatch(); return; }
    build(); changed();
  }

  function stop() {
    joining++;
    dropMatch();
    for (const off of offs.splice(0)) off();
    if (room) { const r = room; room = null; r.leave().catch(() => {}); }
    code = ''; matchRn = -1;
    set(null);
  }

  const watcher = {
    state: null,
    get room() { return room; },
    get link() { return link; },
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(cb);
      return () => handlers.get(type).delete(cb);
    },
    listeners: (type = 'change') => (handlers.get(type) ? handlers.get(type).size : 0),
  };

  flow.watch = watcher;
  flow.watchRoom = async (raw) => {
    if (flow.room || flow.mode || flow.busy || phase) return false;
    const want = String(raw || '').trim().toUpperCase();
    const ticket = ++joining;
    code = want;
    flow.notice = null;
    set('joining');
    let r = null, fail = null;
    try { r = await joinRoom({ transport, code: want, profile: session.profile, watch: true }); } catch (e) { fail = FAIL[e && e.code] || 'noanswer'; }
    if (ticket !== joining || game.state !== 'online') { // stopped meanwhile, or the player walked away
      if (r) r.leave().catch(() => {});
      return false;
    }
    if (!r || !r.state || r.state.me !== null) { // (a seat of mine is not watching: never happens with watch: true)
      if (r) r.leave().catch(() => {});
      code = '';
      note(fail || 'noanswer');
      set(null); // (the hub listens to the watcher as well as to the flow: the notice shows at once)
      return false;
    }
    room = r;
    offs = [r.on('change', onRoom), r.on('start', () => startMatch()), r.on('error', (e) => console.warn('[nimbus] watch:', (e && (e.code || e.message)) || e))];
    set(r.state.st === 'live' ? 'joining' : 'lobby');
    onRoom(r.state);
    return true;
  };
  flow.stopWatching = () => { if (phase) stop(); };

  // any other menu: nothing is watched behind it (the hub, the title on the way back to the hub: nothing to stop)
  game.events.on('game:state', ({ state }) => {
    if (state === 'online' || !MENU_STATES.has(state) || ui.navigating === 'online') return;
    if (phase) stop();
  });
  return watcher;
}
