// Sign-in, the live config knobs and the player's profile (SPEC4 4.1, 9, 11).
//
// How the network side fits together (everything the UI needs):
//   const { transport, reason } = await createTransport('fire');       // reason 'unconfigured' -> COMING SOON
//   const session = createSession({ transport });
//   const { gate } = await session.connect();                          // rejects -> UNAVAILABLE; gate -> PAUSED / UPDATE / banned
//   await session.ensureProfile(name);                                 // first use: the name screen
//   const room = await createRoom({ transport, profile: session.profile, picks });   // or joinRoom({ ..., code })
//   room.on('change', draw);  room.pick(...);  room.ready(true);
//   room.on('start', () => game.versus.start(createMatch({ transport, room, cfg: session.cfg }), picks));
//   ... link 'verdict' -> result screen (one marked provisional may be followed by the real one: show the later);
//   room.rematch({ ready: true })  or  link.leave(); room.leave();   room.state.lost -> "you lost your seat"
//   transport.idle() when the online screens close.
// Stage 1 uses: connect(), gate(), ensureProfile() / rename(). Stage 4 (trophies): prepare / stake / claim / close /
// settle and session.ranked are src/online/ranked.js (every profile write is one whole-profile set the rules accept).

import { BUILD, DEFAULTS } from './config.js';
import { isDenied } from './transport.js';
import { checkName, defaultName } from './names.js';
import { createRanked } from './ranked.js';

const clampInt = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt);

/** Merge what the database holds at /cfg with the code defaults, keeping every knob in a sane range. */
export function readCfg(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    on: c.on === undefined || c.on === null ? DEFAULTS.on : c.on !== false,
    minBuild: clampInt(c.minBuild, 0, 1e6, DEFAULTS.minBuild),
    flush2: clampInt(c.flush2, 100, 2000, DEFAULTS.flush2),
    flush4: clampInt(c.flush4, 100, 2000, DEFAULTS.flush4),
    dayCap: clampInt(c.dayCap, 0, 1e7, DEFAULTS.dayCap),
  };
}

/** A zeroed profile (rules transition A needs exactly this shape). */
export const newProfile = (name) => ({ n: name, tr: 0, pk: 0, w: 0, l: 0, st: 0, bs: 0, bt: 0, ws: 0, cd: 0, cc: 0 });

/**
 * createSession({ transport, build }) -> session
 *   await session.connect()            -> { uid, gate, profile }   (rejects when the service cannot be reached)
 *   session.gate()                     -> null | 'paused' | 'update' | 'banned'
 *   await session.ensureProfile(name?) -> { ok, profile, reason }  create it on first use (default name when none given)
 *   await session.rename(name)         -> { ok, name, reason }     reason: 'short' | 'long' | 'chars' | 'rude' | 'denied' | 'offline'
 *   session.uid / .profile / .cfg      what is known now (profile: the server's copy, a new object after every write)
 *   session.prepare(match) / stake(match) / claim(match, result) / close(match) / settle()   ranked.js (stage 4)
 *   session.ranked                     the current / last ranked match (ranked.js view); onRanked(cb) -> off
 *   session.setClock(clock)            the timers of the ranked writes (the harness's virtual time in bridge mode)
 */
export function createSession({ transport, build = BUILD, rand = Math.random, clock, storage, wall }) {
  const s = {
    uid: null,
    profile: null,
    cfg: readCfg(null),
    banned: false,

    async connect() {
      const { uid } = await transport.connect();
      s.uid = uid;
      const [cfg, ban, profile] = await Promise.all([
        transport.get('cfg').catch(() => null),
        transport.get(`ban/${uid}`).catch(() => null),
        transport.get(`users/${uid}`).catch(() => null),
      ]);
      s.cfg = readCfg(cfg);
      s.banned = ban === true;
      s.profile = profile && typeof profile === 'object' && typeof profile.n === 'string' ? profile : null;
      return { uid, gate: s.gate(), profile: s.profile };
    },

    /** Why online is closed to this player right now (null = open). */
    gate() {
      if (s.banned) return 'banned';
      if (!s.cfg.on) return 'paused';
      if (build < s.cfg.minBuild) return 'update';
      return null;
    },

    async refresh() {
      s.profile = await transport.get(`users/${s.uid}`);
      return s.profile;
    },

    async ensureProfile(name) {
      if (s.profile) return { ok: true, profile: s.profile, reason: null };
      const check = checkName(name || defaultName(rand));
      if (!check.ok) return { ok: false, profile: null, reason: check.reason };
      const fresh = newProfile(check.name);
      try {
        await transport.set(`users/${s.uid}`, fresh);
      } catch (e) {
        if (!isDenied(e)) return { ok: false, profile: null, reason: 'offline' };
        // Denied: either banned or the profile was made in another tab a moment ago.
        const there = await transport.get(`users/${s.uid}`).catch(() => null);
        if (!there) return { ok: false, profile: null, reason: 'denied' };
        s.profile = there;
        return { ok: true, profile: there, reason: null };
      }
      s.profile = fresh;
      return { ok: true, profile: fresh, reason: null };
    },

    async rename(name) {
      const check = checkName(name);
      if (!check.ok) return { ok: false, name: check.name, reason: check.reason };
      if (!s.profile) {
        const made = await s.ensureProfile(check.name);
        return { ok: made.ok, name: check.name, reason: made.reason };
      }
      try {
        await transport.set(`users/${s.uid}/n`, check.name);
      } catch (e) {
        return { ok: false, name: check.name, reason: isDenied(e) ? 'denied' : 'offline' };
      }
      s.profile = { ...s.profile, n: check.name };
      return { ok: true, name: check.name, reason: null };
    },

    // ---- stage 4 (trophies): ranked.js ----
    prepare: (m) => ranked.prepare(m),
    stake: (m) => ranked.stake(m),
    claim: (m, result) => ranked.claim(m, result),
    close: (m) => ranked.close(m),
    settle: () => ranked.settle(),
    onRanked: (cb) => ranked.on(cb),
    setClock: (c) => { ranked.clock = c; },
    get ranked() { return ranked.view; },
  };
  const ranked = createRanked({ transport, session: s, ...(clock ? { clock } : {}), ...(storage ? { storage } : {}), ...(wall ? { wall } : {}) });
  return s;
}
