// @smoke --seconds 0 --shots 0
// Online stage 4, the save: history rows gain two OPTIONAL fields, g (my trophy change, -100..100) and c (coins,
// 0..1000), written only when not zero; rows without them load exactly as before; junk is cleaned; 20 full rows keep
// the online block under 4 KB (an older cached tab keeps it); the block's keys are unchanged.
const { Save, SAVE_KEY, OWNED_KEY, PROGRESS_KEY, ONLINE_KEY } = await import('/src/save/save.js');
const O = await import('/src/save/onlinesave.js');
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const KEYS = [SAVE_KEY, OWNED_KEY, PROGRESS_KEY, ONLINE_KEY];
const keep = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
const clear = () => { for (const k of KEYS) localStorage.removeItem(k); };
const fresh = () => new Save(null, { delay: 0 });

try {
  clear();
  let s = fresh();
  const A = 1790000000;
  O.addOnlineMatch(s, { a: A, r: 'w', t: 12.34, d: 150, n: 'Buddy', k: 'q', g: 28, c: 163 });
  O.addOnlineMatch(s, { a: A + 60, r: 'l', t: 40, d: 500, n: 'Mika', k: 'q', g: -10, c: 25 });
  O.addOnlineMatch(s, { a: A + 120, r: 'w', t: 30, d: 300, n: 'Zoe', k: 'f', c: 20 });
  O.addOnlineMatch(s, { a: A + 180, r: 'd', t: 50, d: 600, n: 'Old', k: 'f' });                  // a stage 1-3 row
  O.addOnlineMatch(s, { a: A + 240, r: 'l', t: 5, d: 40, n: 'Zero', k: 'q', g: 0, c: 0 });        // zeros are not written
  O.addOnlineMatch(s, { a: A + 300, r: 'w', t: 9, d: 90, n: 'Junk', k: 'q', g: 'x', c: -5 });     // junk is dropped
  O.addOnlineMatch(s, { a: A + 360, r: 'w', t: 9, d: 90, n: 'Big', k: 'q', g: 500, c: 99999 });   // clamped
  s.flush();
  s = fresh();
  const h = s.data.online.hist;
  eq(h.map((r) => r.n), ['Big', 'Junk', 'Zero', 'Old', 'Zoe', 'Mika', 'Buddy'], 'newest first');
  eq(h[6], { a: A, r: 'w', t: 12.3, d: 150, n: 'Buddy', k: 'q', g: 28, c: 163 }, 'a ranked win round-trips');
  eq(h[5], { a: A + 60, r: 'l', t: 40, d: 500, n: 'Mika', k: 'q', g: -10, c: 25 }, 'a ranked loss round-trips');
  eq(h[4], { a: A + 120, r: 'w', t: 30, d: 300, n: 'Zoe', k: 'f', c: 20 }, 'a friend row (c only)');
  eq(h[3], { a: A + 180, r: 'd', t: 50, d: 600, n: 'Old', k: 'f' }, 'an old row is unchanged');
  eq(h[2], { a: A + 240, r: 'l', t: 5, d: 40, n: 'Zero', k: 'q' }, 'zeros are not written');
  eq(h[1], { a: A + 300, r: 'w', t: 9, d: 90, n: 'Junk', k: 'q' }, 'junk g / c dropped');
  eq([h[0].g, h[0].c], [100, 1000], 'clamped');
  // a row replaced when its claim settles (the same `a`)
  O.addOnlineMatch(s, { ...h[6], g: 31 });
  eq([s.data.online.hist.length, s.data.online.hist.find((r) => r.a === A).g], [7, 31], 'the row is replaced, not doubled');
  eq(Object.keys(s.data.online).sort(), ['bs', 'bt', 'hist', 'name', 'pk', 'st', 'tr', 'w'], 'the online block keeps its keys');
  // 20 full rows: still under 4 KB
  for (let i = 0; i < 25; i++) O.addOnlineMatch(s, { a: A + 1000 + i, r: 'l', t: 329.9, d: 999999, n: 'Raider-48210', k: 'q', g: -100, c: 1000 });
  O.setOnlineProfile(s, { n: 'Twelve Chars', tr: 999999, pk: 999999, bt: 3300, st: 999999, bs: 999999, w: 999999 });
  const size = JSON.stringify(s.data.online).length;
  info.size = size;
  ok(s.data.online.hist.length === 20 && size < 4096, `20 full rows: ${s.data.online.hist.length} rows, ${size} bytes (limit 4096)`);
  // an older tab that drops the block: the backup key brings the rows back with g / c
  s.flush();
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
  delete raw.online;
  localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
  s = fresh();
  ok(s.data.online.hist.length === 20 && s.data.online.hist[0].g === -100 && s.data.online.hist[0].c === 1000, 'g / c lost to an old tab: ' + JSON.stringify(s.data.online.hist[0]));
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
for (const [k, v] of Object.entries(keep)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
return { pass: fails.length === 0, fails, info };
