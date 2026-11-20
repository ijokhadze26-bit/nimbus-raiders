// Nimbus Raiders Online: the COMPLETE security rules for all six stages (SPEC4 section 4), written as
// named fragments. `node scripts/rules-build.mjs` expands them into config/firebase/database.rules.json,
// the one block the owner pastes into the Firebase console. src/online/rulescheck.js runs this same text
// inside the local hub, so the tests exercise the rules themselves and not a copy.
//
// House rules for every expression (the rule language is unverified in places, SPEC4 section 13):
//   - a guard comes BEFORE any arithmetic or comparison that would fail on a missing value;
//   - strings are only ever joined to strings (a slot number is turned into '0' / '1' with ?:);
//   - nothing reads another path through newData; only root (the data before the write) is used
//     for cross-path checks. newData.parent() is used only inside the node being written.

const and = (...xs) => xs.map((x) => `(${x})`).join(' && ');
const or = (...xs) => `(${xs.map((x) => `(${x})`).join(' || ')})`;

const AUTH = 'auth != null';
const INT = 'newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0';
const STR20 = 'newData.isString() && newData.val().length <= 20';
const NONE = { '.validate': false };

// ------------------------------------------------------------------------------------------ users
const D = (x) => `data.child('${x}').val()`;
const N = (x) => `newData.child('${x}').val()`;
const DSK = (x) => D(`sk/${x}`);
const NSK = (x) => N(`sk/${x}`);
const same = (...f) => f.map((x) => `${N(x)} === ${D(x)}`).join(' && ');

const NUMS = ['tr', 'pk', 'w', 'l', 'st', 'bs', 'bt', 'ws', 'cd', 'cc'];
const WK = '(((now - 345600000) - (now - 345600000) % 604800000) / 6048)';   // week index * 100000, Monday 00:00 UTC
const DAY = '((now - now % 86400000) / 86400000)';
const HS = (t) => `(${t} >= 300 ? 20 : (${t} >= 10 ? 10 : ${t}))`;                                 // human stake
const BS = (t) => `(${t} >= 1200 ? 6 : (${t} >= 700 ? 12 : ${HS(t)}))`;                            // bot stake
const BG = (t) => `(${t} >= 1200 ? 6 : (${t} >= 700 ? 12 : (${t} >= 300 ? 20 : 28)))`;             // bot win gain cap

const MN = `root.child('matches/' + ${NSK('m')})`;                 // the match a NEW stake names
const MD = `root.child('matches/' + ${DSK('m')})`;                 // the match the OPEN stake names
const MY = `(${DSK('ms')} === 0 ? '0' : '1')`;
const OP = `(${DSK('ms')} === 0 ? '1' : '0')`;
const MEX = `${MD}.child('out/' + ${MY}).exists()`;
const OPX = `${MD}.child('out/' + ${OP}).exists()`;
const ME = (f) => `${MD}.child('out/' + ${MY} + '/${f}').val()`;
const OPP = (f) => `${MD}.child('out/' + ${OP} + '/${f}').val()`;
const G = `(${N('tr')} - ${D('tr')} - ${DSK('s')})`;               // trophies gained on top of the returned stake
const SLOTS = `(${DSK('ms')} === 0 || ${DSK('ms')} === 1) && ${DSK('os')} === 1 - ${DSK('ms')}`;
const STAKE_GONE = "data.child('sk').exists() && !newData.child('sk').exists()";
const TR0 = `(${D('tr')} + ${DSK('s')})`;                          // my trophies before the stake

// A: a brand-new profile starts at zero with no stake.
const CREATE = and('!data.exists()', NUMS.map((f) => `${N(f)} === 0`).join(' && '), "!newData.child('sk').exists()");

// B: rename. Every number stays; an open stake stays as it is.
const RENAME = and('data.exists()', same(...NUMS), `${N('sk/a')} === ${D('sk/a')}`);

// C: stake at GO. The loss is applied now; closing the tab changes nothing.
const STAKE = and(
  'data.exists()',
  `${NSK('a')} === now`,
  `newData.child('sk/s').isNumber()`,
  `${N('tr')} === ${D('tr')} - ${NSK('s')}`,
  `${N('l')} === ${D('l')} + 1`,
  `${N('st')} === 0`,
  `${NSK('st')} === ${D('st')}`,
  same('pk', 'w', 'bs', 'bt', 'ws', 'cd', 'cc'),
  or(
    and(`${NSK('b')} === true`, `${NSK('s')} === ${BS(D('tr'))}`, "!newData.child('sk/m').exists()"),
    and(
      `${NSK('b')} === false`,
      `${NSK('s')} === ${HS(D('tr'))}`,
      "newData.child('sk/m').isString()",
      `${MN}.child('k').val() === 'quick'`,
      `now - ${MN}.child('ts').val() < 15000`,
      `root.child('rooms/' + ${MN}.child('code').val() + '/mid').val() === ${NSK('m')}`,
      `${NSK('ms')} === 0 || ${NSK('ms')} === 1`,
      `${MN}.child('us/' + $uid).val() === ${NSK('ms')}`,
      `${MN}.child('u/0').val() !== ${MN}.child('u/1').val()`,
      `${NSK('os')} === 1 - ${NSK('ms')}`,
      `${NSK('o')} === ${MN}.child('tr/' + (${NSK('os')} === 0 ? '0' : '1')).val()`,
    ),
  ),
);

// D: win. Needs the rival's own write-once fall record (or a heartbeat-checked forfeit), 20 s after the stake.
const WIN = and(
  STAKE_GONE,
  `now - ${DSK('a')} >= 20000`,
  `${N('w')} === ${D('w')} + 1`,
  `${N('l')} === ${D('l')} - 1`,
  `${N('st')} === ${DSK('st')} + 1`,
  `${N('bs')} === (${D('bs')} > ${N('st')} ? ${D('bs')} : ${N('st')})`,
  `${N('pk')} === (${D('pk')} > ${N('tr')} ? ${D('pk')} : ${N('tr')})`,
  `${G} >= 0`,
  `${N('ws')} === (${D('ws')} >= ${WK} ? ${D('ws')} : ${WK}) + ${G}`,
  `${N('cd')} === ${DAY}`,
  `${N('cc')} === (${D('cd')} === ${DAY} ? ${D('cc')} + 1 : 1)`,
  `${N('cc')} <= 40`,
  or(
    and(
      `${DSK('b')} === true`,
      `now - ${DSK('a')} <= 900000`,
      `${G} <= ${BG(TR0)}`,
      or(`${N('bt')} === ${D('bt')}`,
        and(`${N('bt')} > ${D('bt')}`, `${N('bt')} <= 3300`, `${N('bt')} * 100 <= now - ${DSK('a')} + 2000`)),
    ),
    and(
      `${DSK('b')} === false`,
      SLOTS,
      `now - ${DSK('a')} <= 86400000`,
      OPX,
      or(`!${MEX}`, `${ME('t')} > ${OPP('t')} + 10`, and(`${ME('t')} >= ${OPP('t')} - 10`, `${ME('d')} > ${OPP('d')}`)),
      `${G} <= 40`,
      or(`${G} <= 29 + (${DSK('o')} - ${TR0}) / 25`, `${G} <= 2`),
      or(`${N('bt')} === ${D('bt')}`,
        and(`${N('bt')} > ${D('bt')}`, or(`${N('bt')} <= ${OPP('t')} + 10`, and(MEX, `${N('bt')} <= ${ME('t')}`)))),
    ),
  ),
);

// E: draw. Both fell inside the tie window with the same distance: the stake comes back.
const DRAW = and(
  STAKE_GONE,
  `${DSK('b')} === false`,
  SLOTS,
  `${N('tr')} === ${D('tr')} + ${DSK('s')}`,
  `${N('l')} === ${D('l')} - 1`,
  `${N('st')} === ${DSK('st')}`,
  same('pk', 'w', 'bs', 'bt', 'ws', 'cd', 'cc'),
  MEX, OPX,
  `${ME('t')} >= ${OPP('t')} - 10`,
  `${ME('t')} <= ${OPP('t')} + 10`,
  `${ME('d')} === ${OPP('d')}`,
);

// F: close. The loss already stands; only the best survival time may go up.
const CLOSE = and(
  STAKE_GONE,
  same('tr', 'pk', 'w', 'l', 'st', 'bs', 'ws', 'cd', 'cc'),
  or(
    `${N('bt')} === ${D('bt')}`,
    and(`${N('bt')} > ${D('bt')}`, `${DSK('b')} === false`, SLOTS, MEX, `${N('bt')} <= ${ME('t')}`),
    and(`${N('bt')} > ${D('bt')}`, `${DSK('b')} === true`, `${N('bt')} <= 3300`, `now - ${DSK('a')} <= 900000`,
      `${N('bt')} * 100 <= now - ${DSK('a')} + 2000`),
  ),
);

// A stake's fields are frozen once written, unless a FRESH stake replaces the lot. "Fresh" also needs the
// old stake to be from an earlier moment: without that, a second write in the same millisecond as the
// stake could edit it (found by the test vectors).
const FROZEN = (type) => and(type, "!data.exists() || data.val() === newData.val()"
  + " || (newData.parent().child('a').val() === now && data.parent().child('a').val() !== now)");

const users = {
  '.read': and(AUTH, "query.orderByChild === 'tr' || query.orderByChild === 'bt' || query.orderByChild === 'ws'", 'query.limitToLast <= 100'),
  '.indexOn': ['tr', 'bt', 'ws'],
  $uid: {
    '.read': AUTH,
    '.write': and(AUTH, 'auth.uid === $uid', 'newData.exists()', "!root.child('ban/' + $uid).exists()"),
    '.validate': and(`newData.hasChildren(['n', ${NUMS.map((f) => `'${f}'`).join(', ')}])`, or(CREATE, RENAME, STAKE, WIN, DRAW, CLOSE)),
    n: { '.validate': 'newData.isString() && newData.val().matches(/^[A-Za-z0-9 _-]{3,12}$/)' },
    ...Object.fromEntries(NUMS.map((f) => [f, { '.validate': INT }])),
    sk: {
      '.validate': and("newData.hasChildren(['a', 's', 'st', 'b'])",
        "newData.child('b').val() === true || newData.hasChildren(['m', 'ms', 'os', 'o'])"),
      a: { '.validate': 'newData.val() === now || newData.val() === data.val()' },
      s: { '.validate': FROZEN(INT) }, st: { '.validate': FROZEN(INT) },
      b: { '.validate': FROZEN('newData.isBoolean()') },
      m: { '.validate': FROZEN('newData.isString() && newData.val().length <= 40') },
      ms: { '.validate': FROZEN('newData.val() === 0 || newData.val() === 1') },
      os: { '.validate': FROZEN('newData.val() === 0 || newData.val() === 1') },
      o: { '.validate': FROZEN(INT) }, $o: NONE,
    },
    $o: NONE,
  },
};

// ------------------------------------------------------------------------------- small nodes
const cfg = { '.read': true };
const ban = { $uid: { '.read': and(AUTH, 'auth.uid === $uid') } };

const meter = {
  '.read': AUTH,
  $k: {
    '.write': and(AUTH, 'newData.exists()'),
    '.validate': and('$k.matches(/^d[0-9]{8}$/)', 'newData.isNumber()', 'newData.val() === (data.exists() ? data.val() : 0) + 1'),
  },
};

const rk = {
  '.read': and(AUTH, 'query.orderByValue === true', 'query.limitToFirst <= 500'),
  '.indexOn': '.value',
  $uid: {
    '.write': and(AUTH, 'auth.uid === $uid'),
    '.validate': "newData.val() === root.child('users/' + $uid + '/tr').val()",
  },
};

const QROOM = "root.child('rooms/' + newData.child('code').val())";
const queue = {
  '.read': and(AUTH, "query.orderByChild === 'ts'", 'query.limitToFirst <= 10'),
  '.indexOn': 'ts',
  $uid: {
    '.read': and(AUTH, 'auth.uid === $uid'),
    '.write': and(AUTH, or(
      and('auth.uid === $uid', "!root.child('ban/' + $uid).exists()"),
      and('!newData.exists()', "data.child('ts').isNumber()", "data.child('ts').val() < now - 60000"),
    )),
    '.validate': "newData.hasChildren(['tr', 'ts'])",
    ts: { '.validate': 'data.exists() ? newData.val() === data.val() : newData.val() === now' },
    tr: { '.validate': "newData.val() === root.child('users/' + $uid + '/tr').val()" },
    m: {
      '.write': and(AUTH, 'auth.uid !== $uid', '!data.exists()', "data.parent().child('ts').isNumber()",
        "root.child('queue/' + auth.uid + '/ts').isNumber()",
        "root.child('queue/' + auth.uid + '/ts').val() > data.parent().child('ts').val()",
        "!root.child('queue/' + auth.uid + '/m').exists()"),
      '.validate': or(
        // "I took a bot": only the ticket's owner can say so (checked here because the owner's .write sits above)
        and('auth.uid === $uid', "newData.child('bot').val() === true", "!newData.child('code').exists()", "newData.child('by').val() === $uid"),
        // a claim: into a quick room the claimer hosts, still in its lobby, that was made for THIS ticket (q)
        and('auth.uid !== $uid', "newData.child('by').val() === auth.uid", "!newData.child('bot').exists()",
          "newData.child('code').isString()", `${QROOM}.child('h').val() === auth.uid`, `${QROOM}.child('k').val() === 'quick'`,
          `${QROOM}.child('st').val() === 'lobby'`, `${QROOM}.child('q').val() === $uid`),
      ),
      by: { '.validate': 'newData.isString()' }, code: { '.validate': 'newData.isString()' },
      bot: { '.validate': 'newData.val() === true' }, $o: NONE,
    },
    $o: NONE,
  },
};

// ------------------------------------------------------------------------------------------ rooms
// What a rule on the way down grants, the rules below it never get to refuse, but every .validate still
// runs. So anything a whole-room write must not smuggle in (seats, sizes, state) is checked in .validate.
const seatedIn = (room) => or(...[0, 1, 2, 3].map((i) => `${room}.child('sl/${i}').val() === auth.uid`));
const ROOM1 = 'data.parent()';                                   // at rooms/$code/<field>
const NROOM = 'newData.parent()';                                // the same room after the write
const SEATED = seatedIn(ROOM1);
const ROOM2 = 'data.parent().parent()';                          // at rooms/$code/<list>/$i
const OWNS = `${ROOM2}.child('sl/' + $i).val() === auth.uid`;
const ROOM3 = 'data.parent().parent().parent()';                 // at rooms/$code/ev/$mid/$id
const STALE = "data.child('ts').isNumber() && data.child('ts').val() < now - 7200000";
const SLOT = '$i.matches(/^[0-3]$/)';
// A seat is presence: it goes when the connection goes, in the lobby and in a match. A player of the
// room's live match may still send, and may take the seat back, after a reconnect dropped it.
const PLAYS = and(`${ROOM2}.child('st').val() === 'live'`, `${ROOM2}.child('mid').isString()`,
  `root.child('matches/' + ${ROOM2}.child('mid').val() + '/u/' + $i).val() === auth.uid`);
// The room's current match is over: at most one of its players has no fall record.
const LIVE_M = `root.child('matches/' + ${ROOM1}.child('mid').val())`;
const RUNS = (i) => `${LIVE_M}.child('u/${i}').exists() && !${LIVE_M}.child('out/${i}').exists()`;
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const OVER = and(...PAIRS.map(([i, j]) => `!(${RUNS(i)} && ${RUNS(j)})`));
const NEXT_M = `root.child('matches/' + ${NROOM}.child('mid').val())`;

// One hosted room per account: host/$uid names the one room I may create. It can only move on once I
// no longer sit in (or host) the old one, and a room with no seats left can be cleared by anyone.
const HOSTED = "root.child('rooms/' + data.val())";
const host = {
  $uid: {
    '.read': and(AUTH, 'auth.uid === $uid'),
    '.write': and(AUTH, 'auth.uid === $uid', 'newData.exists()', "!root.child('ban/' + $uid).exists()"),
    '.validate': and('newData.isString()', 'newData.val().matches(/^[A-HJ-NP-Z]{4}$/)',
      or('!data.exists()', and('data.isString()', or(`${HOSTED}.child('h').val() !== auth.uid`, `!${seatedIn(HOSTED)}`)))),
  },
};

const rooms = {
  $code: {
    '.read': AUTH,
    // Only ever a whole-room create or a whole-room delete; everything else goes through the fields below.
    '.write': and(AUTH, '$code.matches(/^[A-HJ-NP-Z]{4}$/)', or(
      and('!data.exists()', "newData.child('h').val() === auth.uid", "!root.child('ban/' + auth.uid).exists()",
        "root.child('host/' + auth.uid).val() === $code"),
      '!data.exists() && !newData.exists()',                                             // removing what is not there
      and('data.exists()', '!newData.exists()', or(
        and("data.child('h').val() === auth.uid", "data.child('st').val() === 'lobby'"), // its host, before a match
        STALE,                                                                          // anyone: untouched for 2 hours
        "!data.child('sl').exists()")),                                                // anyone: nobody sits here
    )),
    '.validate': and("newData.hasChildren(['h', 'k', 'max', 'ts', 'st', 'rn'])",
      "newData.child('k').val() === 'friend' || newData.child('k').val() === 'quick'",
      "newData.child('max').val() === 2 || (newData.child('max').val() === 4 && newData.child('k').val() === 'friend')",
      // a NEW room is a fresh lobby holding its host and nothing else
      or('data.exists()', and("newData.child('sl/0').val() === auth.uid",
        ...[1, 2, 3].map((i) => `!newData.child('sl/${i}').exists() && !newData.child('p/${i}').exists()`),
        ...['mid', 'mts', 'l', 'hb', 'ev', 'sp'].map((f) => `!newData.child('${f}').exists()`),
        "!newData.child('q').exists() || newData.child('k').val() === 'quick'"))),
    h: { '.validate': 'newData.isString()' }, k: { '.validate': 'newData.isString()' }, max: { '.validate': 'newData.isNumber()' },
    q: { '.validate': 'newData.isString() && newData.val().length <= 128' },   // quick room: the one player it was made for
    ts: { '.write': and(AUTH, SEATED, 'newData.exists()'), '.validate': 'newData.val() === now' },
    // mid + mts are written once per match, in the lobby -> live step, and never touched while it is live
    mts: {
      '.write': and(AUTH, SEATED, 'newData.exists()', `${ROOM1}.child('st').val() === 'lobby'`),
      '.validate': and('newData.val() === now', `${NROOM}.child('st').val() === 'live'`),
    },
    mid: {
      '.write': and(AUTH, SEATED, 'newData.exists()', `${ROOM1}.child('st').val() === 'lobby'`),
      '.validate': and('newData.isString()', "root.child('matches/' + newData.val() + '/code').val() === $code",
        "root.child('matches/' + newData.val() + '/ts').isNumber()",
        "now - root.child('matches/' + newData.val() + '/ts').val() < 3000",
        `${NROOM}.child('mts').val() === now`, `${NROOM}.child('st').val() === 'live'`),
    },
    rn: {
      '.write': and(AUTH, SEATED, 'newData.exists()'),
      '.validate': or(and(`!${ROOM1}.exists()`, 'newData.val() === 0'),
        and('data.isNumber()', 'newData.val() === data.val() + 1', `${ROOM1}.child('st').val() === 'live'`, `${NROOM}.child('st').val() === 'lobby'`)),
    },
    st: {
      '.write': and(AUTH, SEATED, 'newData.exists()'),
      '.validate': or(
        and('!data.exists()', "newData.val() === 'lobby'"),
        // lobby -> live: together with a new match record whose players are exactly the seats
        and("data.val() === 'lobby'", "newData.val() === 'live'", `${NROOM}.child('mts').val() === now`,
          `${NROOM}.child('mid').isString()`, `${NROOM}.child('mid').val() !== ${ROOM1}.child('mid').val()`,
          ...[0, 1, 2, 3].map((i) => `${NEXT_M}.child('u/${i}').val() === ${NROOM}.child('sl/${i}').val()`)),
        // live -> lobby (rematch): only once the match is over (or past the cap), and it is the next round
        and("data.val() === 'live'", "newData.val() === 'lobby'", `${ROOM1}.child('rn').isNumber()`,
          `${NROOM}.child('rn').val() === ${ROOM1}.child('rn').val() + 1`,
          or(and(`${ROOM1}.child('mid').isString()`, OVER),
            and(`${ROOM1}.child('mts').isNumber()`, `now - ${ROOM1}.child('mts').val() > 344000`))),
      ),
    },
    sl: {
      '.validate': 'newData.hasChildren()',
      $i: {
        '.write': and(AUTH, or(
          // take an empty seat, one seat each: in the lobby (a friend room, the host, or the player a quick
          // room was made for), or a player of the live match coming back to a seat a reconnect dropped
          and('!data.exists()', 'newData.val() === auth.uid', `!${seatedIn(ROOM2)}`, or(
            and(`${ROOM2}.child('st').val() === 'lobby'`, or(`${ROOM2}.child('k').val() === 'friend'`,
              `${ROOM2}.child('h').val() === auth.uid`, `${ROOM2}.child('q').val() === auth.uid`)),
            PLAYS)),
          // leave my own seat at any time
          and('data.val() === auth.uid', '!newData.exists()'),
          // the host may empty a seat while still in the lobby
          and('!newData.exists()', `${ROOM2}.child('h').val() === auth.uid`, `${ROOM2}.child('st').val() === 'lobby'`),
        )),
        // a seat only ever holds the player who wrote it (also when a whole room is written at once)
        '.validate': and('newData.isString()', SLOT,
          "$i === '0' || $i === '1' || newData.parent().parent().child('max').val() === 4",
          'newData.val() === data.val() || newData.val() === auth.uid'),
      },
    },
    p: {
      '.validate': 'newData.hasChildren()',
      $i: {
        '.write': and(AUTH, OWNS),
        '.validate': and(SLOT, "newData.hasChildren(['n'])"),
        n: { '.validate': 'newData.isString() && newData.val().length <= 20' },
        he: { '.validate': STR20 }, we: { '.validate': STR20 }, hs: { '.validate': STR20 }, ws: { '.validate': STR20 },
        tr: { '.validate': INT },
        rdy: { '.validate': INT },   // the round (rn + 1) this seat is ready for; any other number means "not ready"
        rm: { '.validate': INT },    // the round (rn + 1) this seat wants a rematch after
        $o: NONE,
      },
    },
    l: {
      '.validate': 'newData.hasChildren()',
      $i: { '.write': and(AUTH, or(OWNS, PLAYS)), '.validate': and(SLOT, 'newData.isString()', 'newData.val().length <= 64') },
    },
    hb: {
      '.validate': 'newData.hasChildren()',
      $i: {
        '.write': and(AUTH, or(OWNS, PLAYS)),
        '.validate': and(SLOT, "newData.child('a').val() === now", "newData.child('t').isNumber()"),
        a: { '.validate': 'newData.isNumber()' }, t: { '.validate': 'newData.isNumber()' }, $o: NONE,
      },
    },
    sp: {
      '.validate': 'newData.hasChildren()',
      $uid: { '.write': and(AUTH, 'auth.uid === $uid'), '.validate': 'newData.val() === true' },
    },
    ev: {
      '.validate': 'newData.hasChildren()',
      $mid: {
        '.validate': 'newData.hasChildren()',
        $id: {
          '.write': and(AUTH, '!data.exists()', 'newData.exists()', `${ROOM3}.child('mid').val() === $mid`,
            or(...[0, 1, 2, 3].map((i) => and(`newData.child('f').val() === ${i}`, or(`${ROOM3}.child('sl/${i}').val() === auth.uid`,
              and(`${ROOM3}.child('st').val() === 'live'`, `root.child('matches/' + $mid + '/u/${i}').val() === auth.uid`)))))),
          '.validate': "newData.hasChildren(['k', 'a', 'f', 'to'])",
          k: { '.validate': 'newData.isString() && newData.val().length === 1' },
          a: { '.validate': 'newData.isNumber()' }, f: { '.validate': 'newData.isNumber()' },
          to: { '.validate': 'newData.isNumber()' }, q: { '.validate': 'newData.isNumber()' }, $o: NONE,
        },
      },
    },
    $o: NONE,
  },
};

// ---------------------------------------------------------------------------------------- matches
const MROOM = "root.child('rooms/' + newData.child('code').val())";
const OUT_M = 'data.parent().parent()';                           // matches/$mid seen from out/$slot
const OUT_ROOM = `root.child('rooms/' + ${OUT_M}.child('code').val())`;
const OUT_HB = `${OUT_ROOM}.child('hb/' + $slot)`;
const BY = "newData.child('by').val()";
// Closing a rival's seat (dc / cap) is for players still standing: once my own fall is recorded I can
// write nobody else's, so a loser cannot forge the winner's forfeit after the match.
const NO_FALL = and(...[0, 1, 2, 3].map((i) => `!(${OUT_M}.child('us/' + auth.uid).val() === ${i} && ${OUT_M}.child('out/${i}').exists())`));

const matches = {
  $mid: {
    '.read': AUTH,
    '.write': and(AUTH, or('!data.exists() && newData.exists()', and('data.exists()', '!newData.exists()', or(
      "data.child('ts').isNumber() && data.child('ts').val() < now - 604800000",
      // a record its room never went live with (a start that failed) may be tidied away by one of its players
      and("!data.child('out').exists()", "data.child('us/' + auth.uid).exists()", "data.child('code').isString()",
        "root.child('rooms/' + data.child('code').val() + '/mid').val() !== $mid"))))),
    // write-once: after creation only out/$slot can be added (it has its own .write below)
    '.validate': and("newData.hasChildren(['code', 'k', 'ts', 'u', 'us'])", or('data.exists()', and(
      "newData.child('ts').val() === now",
      "!newData.child('out').exists()",
      "newData.child('code').isString()",
      `${MROOM}.child('st').val() === 'lobby'`,
      `newData.child('k').val() === ${MROOM}.child('k').val()`,
      "newData.child('us/' + auth.uid).exists()",
      ...[0, 1, 2, 3].map((i) => `newData.child('u/${i}').val() === ${MROOM}.child('sl/${i}').val()`),
      // every player is in `us` (nobody can be left unable to record a fall); it also means no uid sits twice
      ...[0, 1, 2, 3].map((i) => `!newData.child('u/${i}').exists() || (newData.child('u/${i}').isString() && newData.child('us/' + newData.child('u/${i}').val()).val() === ${i})`),
      "newData.child('k').val() !== 'quick' || (newData.child('tr/0').isNumber() && newData.child('tr/1').isNumber())",
      // a match needs two players (so one account alone in a lobby cannot pile up records)
      or(...PAIRS.map(([i, j]) => `newData.child('u/${i}').exists() && newData.child('u/${j}').exists()`)),
    ))),
    code: { '.validate': 'newData.isString() && newData.val().length === 4' },
    k: { '.validate': 'newData.isString()' }, ts: { '.validate': 'newData.isNumber()' },
    u: { '.validate': 'newData.hasChildren()', $i: { '.validate': and('newData.isString()', SLOT) } },
    us: {
      '.validate': 'newData.hasChildren()',
      $uid: {
        '.validate': or(...[0, 1, 2, 3].map((i) => `newData.val() === ${i} && newData.parent().parent().child('u/${i}').val() === $uid`)),
      },
    },
    tr: {
      '.validate': 'newData.hasChildren()',
      $i: {
        '.validate': and(SLOT, "newData.parent().parent().child('u/' + $i).isString()",
          "newData.val() === root.child('users/' + newData.parent().parent().child('u/' + $i).val() + '/tr').val()"),
      },
    },
    out: {
      $slot: {
        '.write': and(AUTH, '!data.exists()', 'newData.exists()', `${OUT_M}.child('us/' + auth.uid).exists()`,
          `${OUT_M}.child('ts').isNumber()`, or(
            // my own fall
            and(`${OUT_M}.child('u/' + $slot).val() === auth.uid`, `${BY} === 'dead' || ${BY} === 'quit'`),
            // a rival who went silent: the room must have gone live with THIS match, and their heartbeat is old or stalled
            and(`${BY} === 'dc'`, `${OUT_M}.child('u/' + $slot).exists()`, NO_FALL,
              `${OUT_ROOM}.child('mid').val() === $mid`,
              `${OUT_ROOM}.child('mts').isNumber()`,
              `${OUT_ROOM}.child('mts').val() - ${OUT_M}.child('ts').val() < 3000`,
              `now - ${OUT_M}.child('ts').val() > 13000`,
              or(`!${OUT_HB}.exists()`, `${OUT_HB}.child('a').val() < now - 9000`,
                `${OUT_HB}.child('t').val() * 100 < now - ${OUT_M}.child('ts').val() - 19000`)),
            // nothing lasts past the cap
            and(`${BY} === 'cap'`, `${OUT_M}.child('u/' + $slot).exists()`, NO_FALL, `now - ${OUT_M}.child('ts').val() > 344000`),
          )),
        '.validate': and("newData.hasChildren(['t', 'd', 'ts', 'by'])",
          "newData.child('ts').val() === now",
          "newData.child('t').isNumber() && newData.child('d').isNumber()",
          "newData.child('t').val() >= 0 && newData.child('t').val() <= 3300 && newData.child('t').val() % 1 === 0",
          `${OUT_M}.child('ts').isNumber()`,
          `newData.child('t').val() * 100 <= now - ${OUT_M}.child('ts').val() - 4000 + 1500`,
          "newData.child('d').val() >= 0 && newData.child('d').val() <= 40 + newData.child('t').val() * 1.8"),
        t: { '.validate': 'newData.isNumber()' }, d: { '.validate': 'newData.isNumber()' }, ts: { '.validate': 'newData.isNumber()' },
        by: { '.validate': "newData.val() === 'dead' || newData.val() === 'quit' || newData.val() === 'dc' || newData.val() === 'cap'" },
        $o: NONE,
      },
    },
    $o: NONE,
  },
};

export const rules = {
  rules: {
    '.read': false,
    '.write': false,
    cfg, ban, meter, rk, queue, host, users, rooms, matches,
  },
};

/** Constructs the real service has not been seen to accept yet (SPEC4 section 13). The live probe
 *  (scripts/rules-probe.mjs --live) exists to settle these; each entry names where it is used. */
export const UNVERIFIED = [
  '?: (ternary), also nested and inside arithmetic / string joins (users, queue ts)',
  '% on numbers (integer checks, the WK week index and DAY)',
  '$var.matches(/regex/) on a wildcard key ($code, $i, $k)',
  "a '-' as the last character of a character class: /^[A-Za-z0-9 _-]{3,12}$/",
  'query.orderByValue, query.orderByChild, query.limitToFirst, query.limitToLast in .read',
  'that .validate on a parent runs when only one child is written or removed (every users/$uid transition)',
  'that newData.parent() sees the other paths of the same multi-path update (going live needs mid + mts + st, a rematch needs st + rn)',
  'that every .validate inside a written value runs even when a .write higher up granted it (seats and sizes on a whole-room create)',
  'string.length on newData.val()',
  'newData read inside a .write rule (ev/$mid/$id, out/$slot)',
  'auth read inside a .validate rule (a seat holds its writer, the fresh-room shape, the queue bot marker)',
  'hasChildren() with no list (the "a container, not a bare value" checks)',
  'comparisons and arithmetic on a missing (null) value: every use here is guarded first, so it should not matter',
  'whether a failing sub-expression makes the whole rule false or only that branch (written to be safe both ways)',
  'any size limit on the rules text (the generated block is small; rules-build prints its size)',
  "nothing checks a leaf's .priority (getPriority): a large priority string on a leaf may be accepted",
];
