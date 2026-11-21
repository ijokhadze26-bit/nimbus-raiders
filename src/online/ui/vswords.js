// Words and number formats of the online match UI (pure: no DOM, no game). Plain kid-friendly English.
//   clock(s)         "1:05"      (the versus bar)
//   clockTenths(s)   "1:05.3"    (the result screen)
//   verdictWords(result, opts)  -> { title, tone, head, text }   what the result screen says and why
//   rematchWords(rs)            -> { label, note, off, hot, waiting }   the REMATCH button + the line under it
//   leftWords(by)               -> the small tag of a player who did not fall in play ('dc', 'quit', 'cap')
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const up = (s) => String(s ?? '').toUpperCase();
/** A class for a long name (a smaller letter size, match.css): "RAIDER-4762" fits on a 360 px phone. */
export const nameFit = (s) => { const l = String(s ?? '').length; return l > 10 ? ' nl-l' : l > 8 ? ' nl-m' : ''; };

export function clock(s) {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function clockTenths(s) {
  const t = Math.max(0, Math.round((s || 0) * 10));
  return `${Math.floor(t / 600)}:${String(Math.floor((t % 600) / 10)).padStart(2, '0')}.${t % 10}`;
}

export const metres = (d) => `${Math.max(0, Math.round(d || 0)).toLocaleString('en-US')}m`;

const ORD = ['', '1ST', '2ND', '3RD', '4TH'];

// [headline, plain words]. `many` = a match of 3 or 4 players.
const WHY = {
  win: {
    standing: (many) => ['LAST SQUAD STANDING', many ? 'Every other squad was wiped out.' : "Your rival's squad was wiped out."],
    distance: () => ['YOU WENT FURTHER', 'Both squads fell in the same second. You got further down the road!'],
    dc: () => ['RIVAL LOST CONNECTION', "Your rival's internet dropped, so the win is yours."],
    quit: () => ['RIVAL LEFT', 'Your rival left the match, so the win is yours.'],
    cap: () => ['TIME IS UP', 'Time ran out for your rival.'],
  },
  lose: {
    fell: (many) => ['SQUAD DOWN', many ? 'Your squad was wiped out before the last one.' : 'Your squad was wiped out first.'],
    distance: () => ['RIVAL WENT FURTHER', 'Both squads fell in the same second. Your rival got further down the road.'],
    dc: () => ['CONNECTION LOST', 'Your internet dropped for too long, so the match went to your rival.'],
    offline: () => ['CONNECTION LOST', 'Your internet dropped. The result will update when you are back online.'],
    quit: () => ['YOU LEFT', 'You left the match.'],
    stall: () => ['GAME STOPPED', 'Your game stood still for too long. Keep this tab open during a match!'],
    cap: () => ['TIME IS UP', 'Time ran out.'],
    noverdict: () => ['NO ANSWER', 'We could not reach the other player to check the result.'],
  },
  draw: {
    draw: () => ['DEAD EVEN', 'Both squads fell at the same moment, at the same distance. Nobody wins!'],
  },
};
const TITLE = { win: 'YOU WIN!', lose: 'YOU LOSE', draw: 'DRAW' };

/**
 * @param result  versus.result ({ result, place, places, reason, provisional, revised })
 * @param opts    { players: total players in the match, stalled: my own game gave up after a long freeze }
 */
export function verdictWords(result, opts = {}) {
  const r = result || {};
  const kind = TITLE[r.result] ? r.result : 'lose';
  const many = (opts.players || 2) > 2;
  const reason = kind === 'lose' && opts.stalled ? 'stall' : r.reason;
  const table = WHY[kind];
  const make = table[reason] || table[kind === 'win' ? 'standing' : kind === 'draw' ? 'draw' : 'fell'];
  let [head, text] = make(many);
  if (many && kind === 'lose' && r.place > 1 && ORD[r.place] && (reason === 'fell' || !table[reason])) head = `YOU CAME ${ORD[r.place]} OF ${opts.players}`;
  if (r.provisional) text += ' Checking the result...';
  return { title: TITLE[kind], tone: kind, head, text, updated: !!r.revised };
}

export function leftWords(by) { return by === 'dc' ? 'OFFLINE' : by === 'quit' ? 'LEFT' : by === 'cap' ? 'TIME UP' : ''; }

/** The REMATCH button and the line under it, from flow.rematchState(). */
export function rematchWords(rs) {
  if (!rs) return { label: 'REMATCH', note: '', off: true, hot: false, waiting: false, hide: true };
  const others = rs.others || [];
  if (rs.lost) return { label: 'REMATCH', note: 'YOU LOST YOUR SEAT', off: true, hot: false, waiting: false };
  if (!rs.can) {
    // offline is not gone: the button turns gold again if they come back
    const away = others.filter((o) => !o.here), off = away.length > 0 && away.every((o) => o.offline);
    const note = off ? (away.length > 1 ? 'RIVALS ARE OFFLINE' : 'RIVAL IS OFFLINE') : others.length > 1 ? 'RIVALS LEFT' : 'RIVAL LEFT';
    return { label: 'REMATCH', note, off: true, hot: false, waiting: false };
  }
  if (rs.mine) {
    const who = rs.waitingFor || (others.find((o) => o.here && !o.wants) || {}).name;
    return { label: 'REMATCH', note: who ? `WAITING FOR ${up(who)}` : 'STARTING...', off: true, hot: false, waiting: true };
  }
  const keen = others.filter((o) => o.here && o.wants);
  const note = !keen.length ? '' : keen.length > 1 ? 'EVERYONE WANTS A REMATCH' : `${up(keen[0].name)} WANTS A REMATCH`;
  return { label: 'REMATCH', note, off: false, hot: keen.length > 0, waiting: false };
}
