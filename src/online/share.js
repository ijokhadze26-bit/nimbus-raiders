// SHARE on the result screen of an online match (STAGE4 "Share picture", SPEC4 §9): a 1080 x 1350 picture of the
// score, drawn on an offscreen 2D canvas from data only (the game's WebGL canvas keeps no drawing buffer, and a
// screenshot could show more than the score). Never a player id, never a room code: names (censored), the result,
// survival time, metres, my trophy change and league badge, coins and the date.
//   makePicture(info) -> Promise<Blob>                        the PNG
//   shareResult(info) -> Promise<{ ok, via: 'share' | 'download' | 'none' }>
//     the phone's share sheet with the picture when it can take a file (navigator.canShare({ files })); otherwise the
//     picture is downloaded and a small sheet says PICTURE SAVED! with COPY LINK (the game's address, no query) and OK.
//     A share the player cancels is silent.
//   info = { result: 'win'|'lose'|'draw', t /* s */, d /* m */, kind: 'q'|'f', when /* ms */,
//            me: { name, tr, g /* null = no trophies */ }, rival: { name }, coins }
//   share.test.last = { w, h, bytes, via, text }              (tests)
import './ui/boards.css';
import { censor } from './names.js';
import { LG } from './boards.js';

export const SHARE = { w: 1080, h: 1350, type: 'image/png', file: 'nimbus-raiders-match.png' };
export const share = { test: { last: null } };

const HEAD = { win: 'I WON!', lose: 'GOOD GAME!', draw: 'DRAW!' };
const RIBBON = { win: ['#ffe066', '#ff9d1a', '#8a4a00'], lose: ['#ff8f9c', '#e8263f', '#7a0c1e'], draw: ['#9fdcff', '#2f8cff', '#143f9a'] };
const OUTLINE = '#14306e';

const clockTenths = (s) => {
  const v = Math.max(0, Math.round((Number(s) || 0) * 10)), m = Math.floor(v / 600), r = v - m * 600;
  return `${m}:${String(Math.floor(r / 10)).padStart(2, '0')}.${r % 10}`;
};
const upName = (n) => censor(n).toUpperCase();

/** The words that go with the picture. */
export function shareText(info) {
  const t = clockTenths(info && info.t);
  const r = info && info.result;
  return r === 'win' ? `I won an online match in Nimbus Raiders! My squad lasted ${t}.`
    : r === 'draw' ? `A draw in Nimbus Raiders online! My squad lasted ${t}.`
      : `Good game in Nimbus Raiders online! My squad lasted ${t}.`;
}

async function fontFamily() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    if (document.fonts && document.fonts.check('80px "Lilita One"')) return '"Lilita One", sans-serif';
  } catch { /* no font API */ }
  return 'sans-serif';
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/** Outlined game-style text (white fill, dark rim), centred on x unless `align` says otherwise. */
function text(c, s, x, y, size, F, { fill = '#fff', edge = OUTLINE, rim = 0.16, align = 'center', max = 980 } = {}) {
  c.font = `${size}px ${F}`;
  c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
  let w = c.measureText(s).width, sz = size;
  while (w > max && sz > 20) { sz -= 4; c.font = `${sz}px ${F}`; w = c.measureText(s).width; }
  if (edge) { c.lineWidth = sz * rim; c.strokeStyle = edge; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
}
/** The league shield: drawn shapes in the league's colours, one pip per league step. */
function badge(c, cx, cy, s, tr) {
  const l = LG.leagueOf(tr);
  c.save(); c.translate(cx, cy); c.scale(s / 100, s / 100);
  c.beginPath();
  c.moveTo(0, -50); c.lineTo(42, -36); c.lineTo(40, 8); c.quadraticCurveTo(34, 36, 0, 52); c.quadraticCurveTo(-34, 36, -40, 8); c.lineTo(-42, -36); c.closePath();
  c.fillStyle = l.edge; c.fill();
  c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke();
  c.beginPath();
  c.moveTo(0, -38); c.lineTo(31, -27); c.lineTo(30, 6); c.quadraticCurveTo(25, 27, 0, 40); c.quadraticCurveTo(-25, 27, -30, 6); c.lineTo(-31, -27); c.closePath();
  c.fillStyle = l.color; c.fill();
  const n = (l.i | 0) + 1, gap = 13;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    c.beginPath(); c.arc(x, 4, 5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = l.edge; c.stroke();
  }
  c.restore();
  return l;
}
function card(c, x, y, w, h) {
  rrect(c, x, y + 10, w, h, 34); c.fillStyle = 'rgba(10, 28, 80, 0.45)'; c.fill();
  rrect(c, x, y, w, h, 34);
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f6fbff'); g.addColorStop(1, '#cfe6ff');
  c.fillStyle = g; c.fill(); c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke();
}

/** Draws the picture. -> Promise<Blob> (image/png, 1080 x 1350) */
export async function makePicture(info = {}) {
  const F = await fontFamily();
  const { w: W, h: H } = SHARE;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const res = HEAD[info.result] ? info.result : 'lose';
  const me = info.me || {}, rival = info.rival || {};

  // sky, sun glow, clouds
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8fdcff'); sky.addColorStop(0.45, '#3f8cf0'); sky.addColorStop(1, '#1a2a8c');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, 330, 40, W / 2, 330, 620);
  glow.addColorStop(0, res === 'win' ? 'rgba(255, 233, 138, 0.75)' : 'rgba(255, 255, 255, 0.45)'); glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (const [x, y, r] of [[120, 1180, 120], [260, 1230, 150], [440, 1260, 110], [820, 1190, 140], [980, 1240, 120], [70, 160, 70], [1010, 120, 80]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

  // title
  text(c, 'NIMBUS RAIDERS', W / 2, 110, 104, F, { rim: 0.2 });
  text(c, 'ONLINE', W / 2, 205, 62, F, { fill: '#ffd34d', edge: '#7a3a00', rim: 0.2 });

  // the result ribbon
  const [r1, r2, r3] = RIBBON[res];
  const ry = 270, rh = 150;
  c.fillStyle = r3; c.beginPath(); c.moveTo(60, ry + 30); c.lineTo(150, ry + 30); c.lineTo(150, ry + rh + 30); c.lineTo(60, ry + rh + 30); c.lineTo(100, ry + rh / 2 + 30); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(W - 60, ry + 30); c.lineTo(W - 150, ry + 30); c.lineTo(W - 150, ry + rh + 30); c.lineTo(W - 60, ry + rh + 30); c.lineTo(W - 100, ry + rh / 2 + 30); c.closePath(); c.fill();
  rrect(c, 120, ry, W - 240, rh, 30);
  const rg = c.createLinearGradient(0, ry, 0, ry + rh); rg.addColorStop(0, r1); rg.addColorStop(1, r2);
  c.fillStyle = rg; c.fill(); c.lineWidth = 10; c.strokeStyle = '#fff'; c.stroke();
  text(c, HEAD[res], W / 2, ry + rh / 2 + 4, 116, F, { edge: r3, rim: 0.2, max: W - 300 });

  // names
  const ny = 520;
  text(c, upName(me.name || 'YOU'), W / 2, ny, 78, F, { max: 940 });
  text(c, 'VS', W / 2, ny + 82, 54, F, { fill: '#ffd34d', edge: '#7a3a00', rim: 0.2 });
  text(c, upName(rival.name || 'RIVAL'), W / 2, ny + 160, 62, F, { fill: '#e3efff', max: 900 });

  // survival time and distance
  const cy = 760, ch = 190, cw = 450;
  for (const [i, head, val] of [[0, 'SURVIVED', clockTenths(info.t)], [1, 'DISTANCE', `${Math.max(0, Math.round(Number(info.d) || 0)).toLocaleString('en-US')} m`]]) {
    const x = i ? W / 2 + 15 : W / 2 - 15 - cw;
    card(c, x, cy, cw, ch);
    text(c, head, x + cw / 2, cy + 52, 40, F, { fill: '#3a5aa6', edge: null });
    text(c, val, x + cw / 2, cy + 125, 84, F, { fill: '#14306e', edge: null, max: cw - 40 });
  }

  // trophies (+ league) and coins
  const by = 990, bh = 190;
  const hasG = me.g !== null && me.g !== undefined && Number.isFinite(Number(me.g));
  const coins = Math.max(0, Math.round(Number(info.coins) || 0));
  const both = hasG && coins > 0, bw = both ? cw : 920;
  let bx = W / 2 - bw / 2;
  if (hasG) {
    if (both) bx = W / 2 - 15 - cw;
    card(c, bx, by, bw, bh);
    const l = badge(c, bx + 92, by + bh / 2, 128, me.tr);
    const g = Math.round(Number(me.g));
    text(c, `${g > 0 ? '+' : ''}${g}`, bx + 170, by + 82, 84, F, { fill: g >= 0 ? '#17702d' : '#b0142a', edge: null, align: 'left', max: bw - 190 });
    text(c, `TROPHIES · ${l.name}`, bx + 170, by + 146, 32, F, { fill: '#3a5aa6', edge: null, align: 'left', max: bw - 190 });
  }
  if (coins > 0) {
    const x = both ? W / 2 + 15 : W / 2 - bw / 2;
    card(c, x, by, bw, bh);
    const ox = x + 92, oy = by + bh / 2;
    c.beginPath(); c.arc(ox, oy, 54, 0, Math.PI * 2); c.fillStyle = '#a85400'; c.fill();
    c.beginPath(); c.arc(ox, oy - 4, 50, 0, Math.PI * 2); c.fillStyle = '#ffc531'; c.fill();
    c.beginPath(); c.arc(ox, oy - 4, 34, 0, Math.PI * 2); c.lineWidth = 7; c.strokeStyle = '#fff3b0'; c.stroke();
    text(c, `+${coins}`, x + 170, by + 82, 84, F, { fill: '#8a4a00', edge: null, align: 'left', max: bw - 190 });
    text(c, 'COINS', x + 170, by + 146, 32, F, { fill: '#3a5aa6', edge: null, align: 'left' });
  }

  // the date and the kind of match
  let day = '';
  try { day = new Date(Number(info.when) || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase(); } catch { day = ''; }
  text(c, `${info.kind === 'f' ? 'FRIEND MATCH' : 'QUICK MATCH'}${day ? ` · ${day}` : ''}`, W / 2, H - 70, 40, F, { rim: 0.18 });

  return new Promise((res2, rej) => cv.toBlob((b) => (b ? res2(b) : rej(new Error('no picture'))), SHARE.type));
}

// ---------------- the small sheet after a download ----------------
let sheetEl = null;
function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
export function gameLink() { return `${location.origin}${location.pathname}`; }

function showSheet() {
  closeSheet();
  const host = document.getElementById('ui') || document.body;
  const el = document.createElement('div');
  el.className = 'shr-sheet';
  el.setAttribute('data-ui', '');
  el.innerHTML = '<div class="shr-card pop" role="dialog" aria-label="Picture saved"><div class="shr-h ol">PICTURE SAVED!</div>'
    + '<p class="shr-p">Find it with your downloads and show your friends!</p>'
    + '<div class="shr-btns"><button type="button" class="btn btn-blue btn-md" data-shr="copy">COPY LINK</button>'
    + '<button type="button" class="btn btn-gold btn-md" data-shr="ok">OK</button></div></div>';
  const go = (e) => {
    const b = e.target.closest && e.target.closest('[data-shr]');
    e.stopPropagation();
    if (!b) { if (e.target === el) closeSheet(); return; }
    e.preventDefault();
    if (b.dataset.shr === 'ok') { closeSheet(); return; }
    const done = () => { b.textContent = 'LINK COPIED!'; };
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(gameLink()) : null;
      if (p && p.then) p.then(done, () => { b.textContent = 'COULD NOT COPY'; }); else b.textContent = 'COULD NOT COPY';
    } catch { b.textContent = 'COULD NOT COPY'; }
  };
  el.addEventListener('click', go);
  host.appendChild(el);
  sheetEl = el;
  return el;
}

function download(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = SHARE.file; a.style.display = 'none';
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
}

/** SHARE: the share sheet with the picture, else a download + PICTURE SAVED!. Never rejects. */
export async function shareResult(info = {}) {
  let blob;
  try { blob = await makePicture(info); } catch (e) { console.warn('[online] share picture failed', e); return { ok: false, via: 'none' }; }
  const text = shareText(info);
  const last = { w: SHARE.w, h: SHARE.h, bytes: blob.size, via: 'none', text };
  share.test.last = last;
  let file = null;
  try { file = new File([blob], SHARE.file, { type: SHARE.type }); } catch { file = null; }
  let can = false;
  try { can = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch { can = false; }
  if (can) {
    try {
      await navigator.share({ files: [file], title: 'Nimbus Raiders', text });
      last.via = 'share';
      return { ok: true, via: 'share' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, via: 'none' }; // the player closed the sheet: nothing to say
      // any other refusal: the download below still gives them the picture
    }
  }
  try { download(blob); } catch (e) { console.warn('[online] download failed', e); return { ok: false, via: 'none' }; }
  last.via = 'download';
  showSheet();
  return { ok: true, via: 'download' };
}

/** Test hook: the open PICTURE SAVED! sheet (or null), and a way to close it. */
share.sheet = () => sheetEl;
share.close = closeSheet;
