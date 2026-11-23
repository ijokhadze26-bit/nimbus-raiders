// @smoke --seconds 0 --shots 0
// Online stage 4 (BOARDS): the SHARE picture (src/online/share.js). makePicture -> a 1080 x 1350 PNG for a win, a loss,
// a draw and a friend match; canShare stubbed true -> navigator.share got exactly one PNG File; a cancelled share is
// silent; canShare false -> a download (an <a download> of an object URL) + PICTURE SAVED! with COPY LINK (the game's
// address without the query) and OK. No network at all. window.__savePng (a screenshot driver) keeps the pictures.
const g = window.__game;
g.loop.stop();
const fails = [], info = {};
const ok = (c, what) => { if (!c) fails.push(what); };
const { makePicture, shareResult, share, SHARE } = await import('/src/online/share.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = { t: 151.4, d: 513, kind: 'q', when: Date.UTC(2026, 10, 23, 15), me: { name: 'Sky Rider', tr: 328, g: 28 }, rival: { name: 'Mika' }, coins: 87 };
const nav = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
const unnav = (k) => { try { delete navigator[k]; } catch { /* ignore */ } };
const click = HTMLAnchorElement.prototype.click;
try {
  // ---------- the pictures ----------
  const cases = [['win', { result: 'win' }], ['lose', { result: 'lose', me: { name: 'Sky Rider', tr: 290, g: -10 }, coins: 52 }],
    ['draw', { result: 'draw', me: { name: 'Sky Rider', tr: 300, g: 0 }, coins: 30 }], ['friend', { result: 'win', kind: 'f', me: { name: 'Sky Rider', tr: 300, g: null }, rival: { name: 'sh1t lord' }, coins: 20 }]];
  for (const [name, o] of cases) {
    const blob = await makePicture({ ...base, ...o });
    const bmp = await createImageBitmap(blob);
    ok(blob.type === 'image/png' && bmp.width === 1080 && bmp.height === 1350 && blob.size > 20000, `${name} picture: ${blob.type} ${bmp.width}x${bmp.height} ${blob.size} B`);
    info[name] = blob.size;
    if (typeof window.__savePng === 'function') {
      const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      await window.__savePng(`share-${name}.png`, b64);
    }
  }

  // ---------- the phone's share sheet ----------
  let got = null;
  nav('canShare', (d) => !!(d && d.files && d.files.length));
  nav('share', async (d) => { got = d; });
  const r1 = await shareResult({ ...base, result: 'win' });
  ok(r1.ok && r1.via === 'share', 'share: ' + JSON.stringify(r1));
  ok(got && got.files && got.files.length === 1 && got.files[0] instanceof File && got.files[0].name === SHARE.file && got.files[0].type === 'image/png', 'navigator.share got: ' + JSON.stringify(got && { n: got.files && got.files.length, name: got.files && got.files[0] && got.files[0].name }));
  ok(got && got.title === 'Nimbus Raiders' && /won/.test(got.text) && /2:31\.4/.test(got.text) && !/me-1|room|code/i.test(got.text), 'share words: ' + (got && got.text));
  ok(share.test.last && share.test.last.w === 1080 && share.test.last.h === 1350 && share.test.last.via === 'share' && share.test.last.bytes > 20000, 'share.test.last: ' + JSON.stringify(share.test.last));
  ok(!share.sheet(), 'a sheet after a real share');
  // a cancelled share: nothing happens
  nav('share', async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; });
  const r2 = await shareResult({ ...base, result: 'lose' });
  ok(!r2.ok && r2.via === 'none' && !share.sheet(), 'cancelled share: ' + JSON.stringify(r2));

  // ---------- no share sheet: a download and PICTURE SAVED! ----------
  nav('canShare', () => false);
  const clicks = [];
  HTMLAnchorElement.prototype.click = function fake() { clicks.push({ download: this.download, href: this.href }); };
  let copied = null;
  nav('clipboard', { writeText: async (s) => { copied = s; } });
  history.replaceState(null, '', location.pathname + '?test=1&room=ABCD');
  const r3 = await shareResult({ ...base, result: 'draw' });
  ok(r3.ok && r3.via === 'download' && share.test.last.via === 'download', 'download: ' + JSON.stringify(r3));
  ok(clicks.length === 1 && clicks[0].download === 'nimbus-raiders-match.png' && clicks[0].href.startsWith('blob:'), 'the download link: ' + JSON.stringify(clicks));
  const sheet = share.sheet();
  ok(sheet && sheet.isConnected && /PICTURE SAVED!/.test(sheet.textContent) && sheet.querySelector('[data-shr="copy"]') && sheet.querySelector('[data-shr="ok"]'), 'the sheet: ' + (sheet && sheet.textContent));
  const card = sheet && sheet.querySelector('.shr-card').getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
  ok(card && card.left >= app.left && card.right <= app.right && card.top >= app.top && card.bottom <= app.bottom, 'the sheet is not inside the screen');
  if (typeof window.__shot === 'function') { await wait(400); await window.__shot(`share-sheet-${innerWidth}x${innerHeight}`); }
  sheet.querySelector('[data-shr="copy"]').click();
  await wait(50);
  ok(copied === location.origin + location.pathname && !copied.includes('?') && /LINK COPIED!/.test(sheet.textContent), 'COPY LINK: ' + copied + ' / ' + sheet.textContent);
  sheet.querySelector('[data-shr="ok"]').click();
  ok(!share.sheet() && !document.querySelector('.shr-sheet'), 'OK did not close the sheet');
  info.text = share.test.last.text;
} catch (e) {
  fails.push('crashed: ' + (e.stack || e.message));
}
HTMLAnchorElement.prototype.click = click;
for (const k of ['canShare', 'share', 'clipboard']) unnav(k);
history.replaceState(null, '', location.pathname + '?test=1');
share.close();
return { pass: fails.length === 0, fails, info };
