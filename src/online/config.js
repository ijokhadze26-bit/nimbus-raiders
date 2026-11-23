// Online configuration. Everything here is PUBLIC by design: this setup has no secret key at all.
// This is the `firebaseConfig` block of the Firebase web app "Nimbus Raiders" (project nimbus-raiders, set up
// 2026-11-23). A Firebase web apiKey only names the project; it grants nothing: the security rules in
// config/firebase/database.rules.json decide every read and write.
// With `apiKey` empty the game has no online service: createTransport('fire') reports 'unconfigured' and the
// ONLINE button reads COMING SOON.

export const BUILD = 1; // compared with cfg/minBuild; raise it when an old client must stop playing online

export const firebaseConfig = {
  apiKey: 'AIzaSyDZ5vaROzhzjXbRomkNfeft6AtMA9SuoDA',
  authDomain: 'nimbus-raiders.firebaseapp.com',
  databaseURL: 'https://nimbus-raiders-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'nimbus-raiders',
  appId: '1:461917988069:web:6954d8a842108edf5ba00c',
};

/** True when the public config has been pasted in. */
export function configured(c = firebaseConfig) {
  return !!(c && typeof c.apiKey === 'string' && c.apiKey && c.databaseURL);
}

// /cfg fallbacks (SPEC4 4.1): used when the database has no value for a knob.
export const DEFAULTS = Object.freeze({ on: true, minBuild: 1, flush2: 250, flush4: 500, dayCap: 500 });

// Protocol numbers shared by room.js / match.js / verdict.js and the rules (keep the rules in step).
export const NET = Object.freeze({
  connectMs: 8000,   // connect() gives up after this
  idleMs: 20000,     // goOffline this long after idle()
  goMs: 4000,        // t0 = match record ts + goMs
  sampleMs: 100,     // GAME pushes one sample per 100 ms
  maxSamples: 20,    // x samples kept while a flush is blocked, then halved
  hbMs: 3000,        // heartbeat period
  silentS: 3,        // a rival is "silent" after this many seconds with no message
  hbSlackS: 1.5,     // ...plus this when all they send is heartbeats (before GO, a frozen tab): one may be late
  countdownS: 10,    // ...and forfeited this many seconds later
  stallMs: 19000,    // rules: hb.t * 100 < now - ts - stallMs  (played clock 15 s behind the match clock)
  capMs: 344000,     // rules: anyone may close a slot this long after the match record (t0 + 340 s)
  tie10: 10,         // tie window in tenths of a second
  maxT10: 3300,      // nothing past 330 s
  outRetryMs: 700,   // retry period for my own fall record
  giveUpMs: 8000,    // fallen + offline this long: show a provisional lose
  tickMs: 50,        // match.js timer period
  seatTries: 5,      // room code collision retries
  touchMs: 1800000,  // an open lobby refreshes the room's ts this often (a room untouched for 2 hours may be cleared)
  leaveMs: 2000,     // room.leave() waits this long at most for its last write (offline it never lands)
  maxWatchers: 4,
});

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, no O
export const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
