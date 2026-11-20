// Player names and room codes: the filter (SPEC4 section 9). Pure, no DOM.
// Names are 3-12 characters from A-Z a-z 0-9 space _ - . The same check runs again on every client
// before a name is shown (censor), so a modified sender cannot put a rude name on my screen.

import { CODE_ALPHABET } from './config.js';

export const NAME_RE = /^[A-Za-z0-9 _-]{3,12}$/;

// Matched anywhere inside the squeezed name (letters only, look-alikes folded, repeats collapsed).
const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'phuck', 'shit', 'bitch', 'biatch', 'cunt', 'nigger', 'nigga', 'faggot', 'fagot',
  'whore', 'slut', 'penis', 'vagina', 'pussy', 'dildo', 'bastard', 'asshole', 'arsehole', 'dickhead', 'porn',
  'nazi', 'hitler', 'retard', 'molest', 'blowjob', 'handjob', 'jizz', 'boner', 'bollock', 'chink', 'tranny',
  'incest', 'suicide', 'killyou',
];
// Matched only as a whole word (split at space _ -), so "Cassie", "grape", "peacock" or "Sky Star" pass.
const WHOLE = ['ass', 'arse', 'dick', 'cock', 'fag', 'cum', 'sex', 'sexy', 'tit', 'tits', 'rape', 'rapist', 'anal',
  'anus', 'piss', 'crap', 'boob', 'boobs', 'nude', 'pedo', 'paedo', 'twat', 'wank', 'kys', 'meth', 'homo', 'hoe',
  'butt', 'poop', 'idiot', 'stupid', 'kike', 'spic'];

const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i' };

const fold = (s) => String(s).toLowerCase().replace(/[01345789@$!]/g, (c) => LOOKALIKE[c] ?? c);
const letters = (s) => s.replace(/[^a-z]/g, '');
const squeeze1 = (s) => letters(s).replace(/(.)\1+/g, '$1');        // "fuuuck" -> "fuck"
const squeeze2 = (s) => letters(s).replace(/(.)\1{2,}/g, '$1$1');   // "asss" -> "ass", "as" stays "as"

const ANY_SQ = ANYWHERE.map(squeeze1);
const WHOLE_SQ = new Set(WHOLE.map(squeeze2));

/** True when the text reads as rude after undoing look-alike spellings and stretched letters. */
export function isRude(text) {
  const raw = String(text || '');
  const all = squeeze1(fold(raw));
  if (ANY_SQ.some((w) => all.includes(w))) return true;
  if (WHOLE_SQ.has(squeeze2(fold(raw)))) return true;
  return raw.split(/[ _-]+/).some((part) => !!part
    && (WHOLE_SQ.has(squeeze2(fold(part))) || WHOLE_SQ.has(squeeze2(part.toLowerCase().replace(/[0-9]/g, '')))));
}

/**
 * checkName(input) -> { ok, name, reason }
 * reason: 'short' | 'long' | 'chars' | 'rude' (null when ok). `name` is the tidied text
 * (outer spaces trimmed, inner runs of spaces collapsed).
 */
export function checkName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) return { ok: false, name, reason: 'short' };
  if (name.length > 12) return { ok: false, name, reason: 'long' };
  if (!NAME_RE.test(name)) return { ok: false, name, reason: 'chars' };
  if (isRude(name)) return { ok: false, name, reason: 'rude' };
  return { ok: true, name, reason: null };
}

/** Plain kid-friendly sentence for each reason (the UI may use its own wording). */
export const NAME_HELP = Object.freeze({
  short: 'Use at least 3 letters.',
  long: 'Use 12 letters or fewer.',
  chars: 'Use only letters, numbers, spaces, _ and -.',
  rude: 'Please pick a kinder name.',
});

/** "Raider-4821" style default. `rand` is a 0..1 function (Math.random by default). */
export function defaultName(rand = Math.random) {
  for (;;) {
    const name = `Raider-${1000 + Math.floor(rand() * 9000)}`;
    if (!isRude(name)) return name; // a few numbers read as words once look-alikes are folded
  }
}

/** What to show for a name that arrived from the network: itself when clean, a neutral name otherwise. */
export function censor(name) {
  const c = checkName(name);
  if (c.ok) return c.name;
  let h = 0;
  for (const ch of String(name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (;; h++) {
    const safe = `Raider-${1000 + (h % 9000)}`;
    if (!isRude(safe)) return safe;
  }
}

/** Room codes that spell something rude are skipped (SPEC4 5.1). */
export function isRudeCode(code) {
  const c = String(code || '').toLowerCase();
  return ANYWHERE.some((w) => w.length <= 4 && c.includes(w)) || WHOLE.some((w) => w.length <= 4 && c.includes(w));
}

/** A fresh 4-letter code from the 24-letter alphabet (no I, no O), never a rude one. */
export function makeCode(rand = Math.random) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    if (!isRudeCode(c)) return c;
  }
}
